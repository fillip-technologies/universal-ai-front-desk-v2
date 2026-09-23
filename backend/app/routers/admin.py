import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..deps import get_current_admin
from ..models.admin import Admin
from ..models.admin_config import AdminConfig
from ..models.cmo_user import CmoUser
from ..schemas.admin import SetKeyRequest
from ..schemas.auth import AdminLoginRequest
from ..security import create_access_token, verify_password
from ..services.gemini_service import test_key_sync
from ..services.twilio_service import sms_configured

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _mask_key(key: str | None) -> str | None:
    if not key:
        return None
    if len(key) <= 8:
        return "••••"
    return f"{key[:4]}••••••••{key[-4:]}"


async def get_effective_key(cfg: AdminConfig) -> str | None:
    return cfg.gemini_key or settings.gemini_api_key or None


@router.post("/login")
async def admin_login(body: AdminLoginRequest, session: AsyncSession = Depends(get_session)):
    email_normalized = body.email.strip().lower()
    admin = await session.scalar(select(Admin).where(Admin.email_normalized == email_normalized))
    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin email or password.")
    token = create_access_token(subject=str(admin.id), role="admin")
    return {"success": True, "token": token}


@router.get("/status")
async def status(_admin=Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    cfg = await AdminConfig.get_singleton(session)
    key = await get_effective_key(cfg)
    return {
        "success": True,
        "keyConfigured": bool(key),
        "keySource": "admin-dashboard" if cfg.gemini_key else ("environment" if key else None),
        "keyMasked": _mask_key(key),
        "keyUpdatedAt": cfg.key_updated_at.isoformat() if cfg.key_updated_at else None,
        "model": "gemini-3.6-flash",
        "smsConfigured": sms_configured(),
        "usage": cfg.usage_public(),
        "serverTime": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/key")
async def set_key(
    body: SetKeyRequest,
    _admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    if not body.key or len(body.key.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="Provide a valid Gemini API key (from aistudio.google.com/apikey).",
        )
    cfg = await AdminConfig.get_singleton(session)
    cfg.gemini_key = body.key.strip()
    cfg.key_updated_at = datetime.now(timezone.utc)
    return {"success": True, "keyMasked": _mask_key(cfg.gemini_key)}


@router.delete("/key")
async def remove_key(_admin=Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    cfg = await AdminConfig.get_singleton(session)
    cfg.gemini_key = None
    cfg.key_updated_at = datetime.now(timezone.utc)
    await session.flush()
    key = await get_effective_key(cfg)
    return {"success": True, "keyConfigured": bool(key)}


@router.post("/test-key")
async def test_key(_admin=Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    cfg = await AdminConfig.get_singleton(session)
    key = await get_effective_key(cfg)
    if not key:
        return {"success": False, "errorMsg": "No API key configured."}
    ok, message = await asyncio.to_thread(test_key_sync, key)
    if ok:
        return {"success": True, "live": True, "modelReply": message}
    return {"success": False, "live": False, "errorMsg": message or "Key test failed."}


# ── CMO Monitor account approval ──────────────────────────────────────────


@router.get("/cmo-users")
async def list_cmo_users(_admin=Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    rows = (await session.scalars(select(CmoUser).order_by(CmoUser.created_at.desc()))).all()
    return {"success": True, "users": [u.to_public() for u in rows]}


async def _cmo_or_404(session: AsyncSession, user_id: str) -> CmoUser:
    try:
        user = await session.get(CmoUser, uuid.UUID(user_id))
    except (ValueError, TypeError):
        user = None
    if not user:
        raise HTTPException(status_code=404, detail="CMO Monitor account not found.")
    return user


@router.post("/cmo-users/{user_id}/approve")
async def approve_cmo_user(user_id: str, _admin=Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    user = await _cmo_or_404(session, user_id)
    if not user.approved_at:
        user.approved_at = datetime.now(timezone.utc)
    return {"success": True, "user": user.to_public()}


@router.post("/cmo-users/{user_id}/revoke")
async def revoke_cmo_user(user_id: str, _admin=Depends(get_current_admin), session: AsyncSession = Depends(get_session)):
    user = await _cmo_or_404(session, user_id)
    user.approved_at = None
    return {"success": True, "user": user.to_public()}
