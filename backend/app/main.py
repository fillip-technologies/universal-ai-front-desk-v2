import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import settings
from .db import dispose_db, get_session_factory, init_db, ping_db
from .models.admin import Admin
from .routers import admin, auth, complaints, kyc
from .security import hash_password
from .services.escalation_service import escalation_loop
from .services.twilio_service import sms_configured

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")


async def _bootstrap_admin() -> None:
    email = settings.admin_email.strip().lower()
    async with get_session_factory()() as session:
        existing = await session.scalar(select(Admin).where(Admin.email_normalized == email))
        if existing:
            return
        session.add(
            Admin(
                email=settings.admin_email.strip(),
                email_normalized=email,
                password_hash=hash_password(settings.admin_password),
            )
        )
        await session.commit()
    logger.info("[bootstrap] created admin account: %s", settings.admin_email)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    await _bootstrap_admin()

    escalation_task: asyncio.Task | None = None
    if settings.escalation_enabled:
        escalation_task = asyncio.create_task(escalation_loop())

    try:
        yield
    finally:
        if escalation_task:
            escalation_task.cancel()
            try:
                await escalation_task
            except asyncio.CancelledError:
                pass
        await dispose_db()


app = FastAPI(title="JanSunwayi AI API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(complaints.router)
app.include_router(kyc.router)


@app.get("/api/health")
async def health():
    db_ok = await ping_db()
    return {
        "status": "ok" if db_ok else "degraded",
        "system": "JanSunwayi AI - Grievance Redressal System",
        "database": "postgresql",
        "databaseConnected": db_ok,
        "smsConfigured": sms_configured(),
        "autoEscalation": settings.escalation_enabled,
    }


# ── Static frontend hosting (production) ────────────────────────────────────
# In dev, run Vite separately (npm run dev) and it proxies /api to this server.
# In prod, the built frontend (npm run build -> ../dist) is served here so the
# whole app is a single deployable FastAPI process.
_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "dist"

if os.environ.get("SERVE_FRONTEND", "0") == "1" and _DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=_DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Unknown API paths must 404 as JSON, not fall through to index.html —
        # otherwise the frontend gets HTML where it expects an API error.
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = _DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST_DIR / "index.html")
