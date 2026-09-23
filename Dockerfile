# JanSunwayi AI — single production image.
# Multi-stage: build the React frontend, then serve it from FastAPI so the
# whole app (API + web UI) runs as one process/container.

# ── Stage 1: build the frontend ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Stage 2: backend + built frontend ───────────────────────────────────────
FROM python:3.12-slim AS runtime
WORKDIR /app

# System deps: none extra needed (asyncpg/bcrypt ship manylinux wheels).
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Run as an unprivileged user; the app never writes to its own files.
RUN useradd --system --uid 10001 --no-create-home appuser

COPY backend ./backend
COPY --from=frontend-build /app/dist ./dist

ENV SERVE_FRONTEND=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

USER appuser
WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import json,sys,urllib.request; r=json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)); sys.exit(0 if r.get('databaseConnected') else 1)"

# --proxy-headers/--forwarded-allow-ips: behind a TLS-terminating proxy the app
# sees the real client scheme and address.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
