<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# JanSunwayi AI — Civic Grievance Redressal System

A production system for the applicable state Public Grievance Redressal Act: citizens
file grievances by voice or text in Bhojpuri / Magahi / Maithili / Hindi / Urdu
/ English; Gemini AI transcribes, translates, and routes each one to the correct department,
administrative tier, and escalation ladder; officials triage and resolve them from a live
dashboard.

**Stack:** React + Vite (frontend) · FastAPI + PostgreSQL (backend) · Gemini AI · Twilio (SMS
delivery of e-KYC OTPs, optional).

## No mock data

There is no sample, seeded, or demonstration grievance anywhere in this system. The
`complaints` table starts empty and fills only with grievances actually filed through one of
the intake channels. Everything the dashboards, the CMO analytics and the tracking page
display is a real row in PostgreSQL, produced by the running application.

Two things are worth stating plainly, because the UI states them too:

- **Aadhaar e-KYC is a sandbox.** The 12-digit number is validated against the real UIDAI
  Verhoeff checksum and then discarded — only the last four digits are stored (Aadhaar Act
  §29(4)). The OTP is cryptographically random, stored only as a bcrypt hash, expires in 5
  minutes and allows 3 attempts, all enforced server-side. It is delivered by SMS when Twilio
  is configured; otherwise the server returns it and the UI labels the flow as a sandbox.
  Genuine UIDAI authentication requires the sponsoring department to hold an AUA/KUA licence.
- **Escalation is real and persisted.** A background job advances unattended grievances up
  their department's ladder, writes an `escalation_events` audit row and appends an officer
  note. The dashboard renders the stored position; it never recomputes a guess in the browser.

## Personal vs societal grievances

Every grievance is classified by the AI (or the offline keyword fallback) as:

- **PERSONAL** — the complainant or their household is the affected party (fire at my home,
  theft from my house, I was teased or beaten). The handling official sees the complainant's
  name, mobile and masked Aadhaar so they can reach them.
- **SOCIETAL** — a public issue the complainant is reporting (broken road, water logging, a
  fight on the street). The complainant's identity *and* their raw text are withheld from
  officials, and the AI summary is written without identifying details.

Both kinds require Aadhaar e-KYC: the API refuses a filing unless it comes from a signed-in
(verified) citizen or carries the short-lived `X-KYC-Token` returned by a completed OTP. This
holds on both channels: the web portal and the kiosk (OTP step before recording). Redaction
happens server-side in `Complaint.to_public()`. The public track-by-ID page never shows
identity for either kind.

## Separate logins

The Citizen Portal, the Official Dashboard and the CMO Monitor are three separate account
types, each with its own login, signup and browser session — signing in to one never signs
you in to (or out of) another, and the API refuses a token of the wrong type.

- **Official Dashboard** (`/official`) — officials; `GET /api/complaints`.
- **CMO Monitor** (`/analytics`) — CMO accounts (`cmo_users` table); `GET /api/cmo/complaints`.
  A self-registered CMO account can sign in but sees no data until the system administrator
  approves it under **Admin → CMO Monitor Accounts** (approval can also be revoked there).
  `seed.py` creates an approved `cmo@jansunwayi.gov.in` account for local use.

## Architecture

```
src/                 React frontend (citizen portal, official dashboard, CMO analytics, admin, kiosk)
backend/             FastAPI service — auth (JWT), complaints, Gemini AI, Aadhaar e-KYC (SMS OTP),
                     auto-escalation job
Dockerfile           Production image: builds the frontend, bundles it with the backend
docker-compose.yml   Production stack: PostgreSQL + the app above
docker-compose.dev.yml   Dev stack: PostgreSQL + hot-reloading backend + hot-reloading frontend
```

The seven tables are created automatically on backend start-up. The exact DDL is viewable
in-app from the header's **PostgreSQL Schema** button, and is generated from the SQLAlchemy
models in `backend/app/models/`.

## Run with Docker (recommended)

```bash
cp .env.example .env    # then edit JWT_SECRET, ADMIN_PASSWORD and POSTGRES_PASSWORD at minimum
docker compose up --build
```

Open **http://localhost:8000** — the app and its API are served from that single container.
Gemini and Twilio settings can also be added to `.env` (see the comments in `.env.example`)
or configured later from the Admin Dashboard.

**For local development with hot reload instead** (separate frontend/backend containers,
source volume-mounted):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Frontend: http://localhost:5173 · Backend: http://localhost:8000 · Postgres: localhost:5432

If you already run PostgreSQL locally on 5432, give the container a different
host port:

```bash
POSTGRES_HOST_PORT=5433 docker compose -f docker-compose.dev.yml up --build
```

To create the sign-in accounts (admin, 2 officials, 1 citizen — **no grievances**):

```bash
docker compose exec app python seed.py
```

To stop and remove containers (add `-v` to also wipe the PostgreSQL volume):

```bash
docker compose down
```

## Run without Docker

### Prerequisites

- Node.js 18+
- Python 3.11+
- A running PostgreSQL 13+ instance (local install, Docker, or a hosted provider).
  Point the backend at it with either `DATABASE_URL` or the `POSTGRES_*`
  component variables — see `backend/.env.example`. The components are safer
  when the password contains URL-special characters such as `@ / : + =`.
- A Gemini API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) — can
  also be set later from the Admin Dashboard instead of an env var
- (Optional) A Twilio account with an SMS-capable number, for delivering Aadhaar e-KYC OTPs

### Run locally

**1. Create the database:**

```bash
createdb jansunwayi
```

**2. Backend (FastAPI):**

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # then edit DATABASE_URL, JWT_SECRET, ADMIN_EMAIL/PASSWORD, etc.
uvicorn app.main:app --reload --port 8000
```

Tables are created on first boot, and an admin account is created from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`. To also create 2 officials and 1 citizen you can sign in as:

```bash
python seed.py
```

The seed password defaults to `demo1234`; override it with `SEED_PASSWORD=...`. The seed
creates **accounts only** — file grievances through the portal to populate the dashboards.

**3. Frontend (Vite):**

```bash
npm install
npm run dev
```

Vite proxies `/api/*` to `http://localhost:8000` (see `vite.config.ts`), so the frontend
works out of the box against the backend above.

### Auto-escalation

A background sweep runs every `ESCALATION_SWEEP_MINUTES` (default 15). Any grievance still in
`Submitted` after 48 hours moves one rung up its department's escalation ladder, per rung.
The moment an officer changes the status, the clock stops and the ladder freezes. Disable the
job with `ESCALATION_ENABLED=false`.

### Production build (without Docker)

```bash
npm run build                 # builds the frontend into dist/
cd backend
SERVE_FRONTEND=1 uvicorn app.main:app --host 0.0.0.0 --port 8000
```

With `SERVE_FRONTEND=1`, FastAPI serves the built frontend directly — the whole app is a
single deployable process (this is exactly what the root `Dockerfile` does).
