"""Idempotent account seed for a fresh database.

Creates sign-in accounts only — the admin, two officials and one citizen.
No grievances are fabricated: the complaints table starts empty and fills up
solely with grievances filed through the real intake channels (web portal,
kiosk). Everything the dashboards and the CMO
analytics display is therefore genuine data produced by the running system.

Safe to re-run — skips anything that already exists.

Usage (from backend/):
    python seed.py
"""
import asyncio
import os

from sqlalchemy import select

from app.config import settings
from app.db import dispose_db, get_session_factory, init_db
from app.models.admin import Admin
from app.models.citizen import Citizen
from app.models.cmo_user import CmoUser
from app.models.official import Official
from app.security import hash_password

# Override with SEED_PASSWORD=... for anything beyond a local demo machine.
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "demo1234")


async def seed_admin(session) -> None:
    email = settings.admin_email.strip().lower()
    if await session.scalar(select(Admin).where(Admin.email_normalized == email)):
        print("[seed] admin already exists, skipping")
        return
    session.add(
        Admin(
            email=settings.admin_email.strip(),
            email_normalized=email,
            password_hash=hash_password(settings.admin_password),
        )
    )
    print(f"[seed] created admin {settings.admin_email}")


async def seed_officials(session) -> None:
    officials = [
        dict(
            email="patna.dm@jansunwayi.gov.in",
            name="Dr. Chandrashekhar Singh",
            role_tier="district",
            department="General Administration",
            district="Patna",
            designation="District Magistrate (DM), Patna",
            verified=True,
            self_registered=False,
        ),
        dict(
            email="maner.bdo@jansunwayi.gov.in",
            name="Shri Rajesh Kumar",
            role_tier="block",
            department="Rural Development",
            district="Patna",
            block="Maner",
            designation="Block Development Officer (BDO), Maner",
            verified=True,
            self_registered=False,
        ),
    ]
    for o in officials:
        email_normalized = o["email"].lower()
        if await session.scalar(select(Official).where(Official.email_normalized == email_normalized)):
            print(f"[seed] official {o['email']} already exists, skipping")
            continue
        session.add(
            Official(**o, email_normalized=email_normalized, password_hash=hash_password(SEED_PASSWORD))
        )
        print(f"[seed] created official {o['email']}")


async def seed_cmo(session) -> None:
    email = "cmo@jansunwayi.gov.in"
    if await session.scalar(select(CmoUser).where(CmoUser.email_normalized == email)):
        print("[seed] CMO Monitor account already exists, skipping")
        return
    from datetime import datetime, timezone
    session.add(
        CmoUser(
            name="CMO Monitoring Cell",
            email=email,
            email_normalized=email,
            password_hash=hash_password(SEED_PASSWORD),
            designation="Officer on Special Duty, CMO Grievance Cell",
            approved_at=datetime.now(timezone.utc),
        )
    )
    print(f"[seed] created CMO Monitor account {email}")


async def seed_citizen(session) -> None:
    mobile_normalized = "9835012345"
    if await session.scalar(select(Citizen).where(Citizen.mobile_normalized == mobile_normalized)):
        print("[seed] citizen already exists, skipping")
        return
    session.add(
        Citizen(
            name="Ramesh Kumar Yadav",
            mobile=f"+91 {mobile_normalized}",
            mobile_normalized=mobile_normalized,
            password_hash=hash_password(SEED_PASSWORD),
            district="Patna",
            block="Maner",
            panchayat="Rampur Diara",
            # Placeholder for the seeded login only. Citizens who register
            # through the portal go through the Aadhaar OTP e-KYC flow
            # (/api/kyc/aadhaar/*) and get their real verified last-4 here.
            aadhaar_masked="XXXX-XXXX-0000",
            aadhaar_verified=False,
        )
    )
    print(f"[seed] created citizen +91 {mobile_normalized}")


async def main() -> None:
    await init_db()
    async with get_session_factory()() as session:
        await seed_admin(session)
        await seed_officials(session)
        await seed_cmo(session)
        await seed_citizen(session)
        await session.commit()
    await dispose_db()
    print(f"[seed] done. Sign-in password for the seeded official/citizen accounts: {SEED_PASSWORD}")
    print("[seed] no grievances were created — file them through the portal to populate the dashboards.")


if __name__ == "__main__":
    asyncio.run(main())
