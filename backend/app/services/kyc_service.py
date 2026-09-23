"""Aadhaar e-KYC OTP state machine behind routers/kyc.py (used by the web
portal, citizen signup and the kiosk).

Raises `KycError(status_code, detail)`; the router turns it into an HTTP error.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.aadhaar_otp import AadhaarOtpChallenge
from ..security import create_kyc_token, hash_password, verify_password
from .aadhaar import (
    OTP_MAX_ATTEMPTS,
    OTP_TTL_SECONDS,
    AadhaarValidationError,
    digits_only,
    generate_otp,
    validate_aadhaar,
)
from .twilio_service import send_sms

RATE_LIMIT_WINDOW_MINUTES = 15
# Loosened in demo mode so repeated rehearsal runs from one number don't 429.
RATE_LIMIT_MAX_CHALLENGES = 50 if settings.aadhaar_relaxed_validation else 5


class KycError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def issue_challenge(
    session: AsyncSession, aadhaar: str, mobile: str
) -> tuple[AadhaarOtpChallenge, str, bool]:
    """Validate the Aadhaar number, rate-limit per mobile, create a hashed OTP
    challenge and try to text it. Returns (challenge, otp, delivered_by_sms)."""
    try:
        last4 = validate_aadhaar(aadhaar)
    except AadhaarValidationError as e:
        raise KycError(400, str(e))

    mobile_normalized = digits_only(mobile)[-10:]
    if len(mobile_normalized) != 10:
        raise KycError(400, "Enter a valid 10-digit mobile number.")

    window_start = _utcnow() - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)
    recent = await session.scalar(
        select(func.count(AadhaarOtpChallenge.id)).where(
            AadhaarOtpChallenge.mobile_normalized == mobile_normalized,
            AadhaarOtpChallenge.created_at >= window_start,
        )
    )
    if (recent or 0) >= RATE_LIMIT_MAX_CHALLENGES:
        raise KycError(
            429, f"Too many OTP requests. Please wait {RATE_LIMIT_WINDOW_MINUTES} minutes and try again."
        )

    otp = generate_otp()
    try:
        delivered = await send_sms(
            f"+91{mobile_normalized}",
            f"{otp} is your OTP for JanSunwayi AI Lok Shikayat Aadhaar e-KYC "
            f"(Aadhaar ending {last4}). Valid for {OTP_TTL_SECONDS // 60} minutes. Do not share it.",
        )
    except Exception:
        raise KycError(502, "Could not send the OTP by SMS right now. Please try again shortly.")

    challenge = AadhaarOtpChallenge(
        aadhaar_last4=last4,
        mobile_normalized=mobile_normalized,
        otp_hash=hash_password(otp),
        max_attempts=OTP_MAX_ATTEMPTS,
        delivery_channel="sms" if delivered else "sandbox",
        expires_at=_utcnow() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    session.add(challenge)
    await session.flush()
    return challenge, otp, delivered


async def verify_challenge(
    session: AsyncSession, challenge_id: uuid.UUID | str, otp: str
) -> AadhaarOtpChallenge:
    """Check an OTP against its challenge; consumes it on success. A wrong code
    burns an attempt (committed by the caller's session even though this
    raises — see routers/kyc.py)."""
    challenge: Optional[AadhaarOtpChallenge] = None
    try:
        challenge = await session.get(AadhaarOtpChallenge, uuid.UUID(str(challenge_id)))
    except (ValueError, TypeError):
        challenge = None
    if not challenge:
        raise KycError(404, "That verification session no longer exists. Start again.")

    if challenge.is_consumed():
        raise KycError(400, "This OTP has already been used. Start a new verification.")
    if challenge.is_expired():
        raise KycError(400, "This OTP has expired. Request a new one.")
    if challenge.attempts_remaining() <= 0:
        raise KycError(429, "Too many incorrect attempts. Request a new OTP.")

    if not verify_password(digits_only(otp), challenge.otp_hash):
        challenge.attempts += 1
        await session.flush()
        remaining = challenge.attempts_remaining()
        if remaining <= 0:
            raise KycError(429, "Too many incorrect attempts. Request a new OTP.")
        raise KycError(400, f"Incorrect OTP. {remaining} attempt{'s' if remaining != 1 else ''} remaining.")

    challenge.consumed_at = _utcnow()
    await session.flush()
    return challenge


def kyc_token_for(challenge: AadhaarOtpChallenge) -> str:
    return create_kyc_token(
        challenge_id=str(challenge.id),
        aadhaar_last4=challenge.aadhaar_last4,
        mobile=challenge.mobile_normalized,
    )
