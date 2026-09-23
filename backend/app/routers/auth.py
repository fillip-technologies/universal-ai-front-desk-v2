import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..deps import get_current_user
from ..models.citizen import Citizen
from ..models.cmo_user import CmoUser
from ..models.official import Official
from ..schemas.auth import LoginRequest, SignupRequest
from ..security import create_access_token, decode_kyc_token, hash_password, verify_password
from ..services.aadhaar import digits_only

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthError(Exception):
    pass


def _normalize_mobile(mobile: str) -> str:
    return digits_only(mobile)[-10:]


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


async def _signup_citizen(body: SignupRequest, session: AsyncSession) -> Citizen:
    mobile_normalized = _normalize_mobile(body.mobile or "")
    if len(mobile_normalized) != 10:
        raise AuthError("Enter a valid 10-digit mobile number.")
    if not (body.name or "").strip():
        raise AuthError("Name is required.")
    if not body.password or len(body.password) < 6:
        raise AuthError("Password must be at least 6 characters.")
    # Aadhaar e-KYC is completed before signup via /api/kyc/aadhaar/*, which
    # hands back a signed kycToken. The masked Aadhaar comes from that token,
    # never from a value the client could simply type.
    kyc = decode_kyc_token(body.kycToken)
    if kyc is None:
        raise AuthError("Complete Aadhaar e-KYC verification before creating your account.")
    if kyc.mobile != mobile_normalized:
        raise AuthError("The mobile number must be the one the Aadhaar OTP was verified on.")

    existing = await session.scalar(
        select(Citizen).where(Citizen.mobile_normalized == mobile_normalized)
    )
    if existing:
        raise AuthError("An account with this mobile number already exists. Please log in instead.")

    citizen = Citizen(
        name=body.name.strip(),
        mobile=f"+91 {mobile_normalized}",
        mobile_normalized=mobile_normalized,
        password_hash=hash_password(body.password),
        district=body.district or "",
        block=body.block or "",
        panchayat=body.panchayat or "",
        aadhaar_masked=kyc.masked_aadhaar,
        aadhaar_verified=True,
    )
    session.add(citizen)
    await session.flush()
    return citizen


async def _signup_cmo(body: SignupRequest, session: AsyncSession) -> CmoUser:
    """CMO Monitor accounts are separate from officials and start unapproved:
    they can sign in, but see no data until an admin approves them."""
    email_normalized = _normalize_email(body.email or "")
    if "@" not in email_normalized or "." not in email_normalized:
        raise AuthError("Enter a valid official email address.")
    if not (body.name or "").strip():
        raise AuthError("Name is required.")
    if not body.password or len(body.password) < 8:
        raise AuthError("Password must be at least 8 characters.")
    if await session.scalar(select(CmoUser).where(CmoUser.email_normalized == email_normalized)):
        raise AuthError("A CMO Monitor account with this email already exists. Please log in instead.")
    cmo = CmoUser(
        name=body.name.strip(),
        email=email_normalized,
        email_normalized=email_normalized,
        password_hash=hash_password(body.password),
        designation=(body.designation or "").strip(),
    )
    session.add(cmo)
    await session.flush()
    return cmo


async def _signup_official(body: SignupRequest, session: AsyncSession) -> Official:
    email_normalized = _normalize_email(body.email or "")
    if "@" not in email_normalized or "." not in email_normalized:
        raise AuthError("Enter a valid official email address.")
    if not (body.name or "").strip():
        raise AuthError("Name is required.")
    if not body.password or len(body.password) < 6:
        raise AuthError("Password must be at least 6 characters.")

    existing = await session.scalar(
        select(Official).where(Official.email_normalized == email_normalized)
    )
    if existing:
        raise AuthError("An account with this email already exists. Please log in instead.")

    if (body.role_tier or "panchayat") == "cmo":
        raise AuthError("CMO Monitor accounts are registered separately, from the CMO Monitor page.")
    looks_official = bool(re.search(r"\.gov\.in$|\.nic\.in$", email_normalized))
    official = Official(
        name=body.name.strip(),
        email=email_normalized,
        email_normalized=email_normalized,
        password_hash=hash_password(body.password),
        role_tier=body.role_tier or "panchayat",
        department=body.department,
        district=body.district,
        block=body.block,
        designation=(body.designation or "").strip() or f"{body.role_tier or 'panchayat'} Officer",
        verified=looks_official,
        self_registered=True,
    )
    session.add(official)
    await session.flush()
    return official


@router.post("/signup")
async def signup(body: SignupRequest, session: AsyncSession = Depends(get_session)):
    try:
        if body.role == "citizen":
            citizen = await _signup_citizen(body, session)
            token = create_access_token(subject=str(citizen.id), role="citizen")
            return {"success": True, "token": token, "role": "citizen", "citizen": citizen.to_public()}
        if body.role == "cmo":
            cmo = await _signup_cmo(body, session)
            token = create_access_token(subject=str(cmo.id), role="cmo")
            return {"success": True, "token": token, "role": "cmo", "cmo": cmo.to_public()}
        official = await _signup_official(body, session)
        token = create_access_token(subject=str(official.id), role="official")
        return {"success": True, "token": token, "role": "official", "official": official.to_public()}
    except AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    if body.role == "citizen":
        mobile_normalized = _normalize_mobile(body.identifier)
        citizen = await session.scalar(
            select(Citizen).where(Citizen.mobile_normalized == mobile_normalized)
        )
        if not citizen or not verify_password(body.password, citizen.password_hash):
            raise HTTPException(status_code=401, detail="Invalid mobile number or password.")
        token = create_access_token(subject=str(citizen.id), role="citizen")
        return {"success": True, "token": token, "role": "citizen", "citizen": citizen.to_public()}

    email_normalized = _normalize_email(body.identifier)
    if body.role == "cmo":
        cmo = await session.scalar(select(CmoUser).where(CmoUser.email_normalized == email_normalized))
        if not cmo or not verify_password(body.password, cmo.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = create_access_token(subject=str(cmo.id), role="cmo")
        return {"success": True, "token": token, "role": "cmo", "cmo": cmo.to_public()}

    official = await session.scalar(
        select(Official).where(Official.email_normalized == email_normalized)
    )
    if not official or not verify_password(body.password, official.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token(subject=str(official.id), role="official")
    return {"success": True, "token": token, "role": "official", "official": official.to_public()}


@router.post("/logout")
async def logout():
    # Stateless JWTs — nothing to invalidate server-side; the client discards the token.
    return {"success": True}


@router.get("/me")
async def me(current=Depends(get_current_user)):
    return {"success": True, **current}
