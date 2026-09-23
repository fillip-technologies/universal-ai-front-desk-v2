"""Aadhaar e-KYC OTP challenge endpoints.

Sandbox scope is deliberate and advertised in every response: real UIDAI
authentication needs an AUA/KUA licence. What runs here is a genuine OTP state
machine — random OTP, bcrypt-hashed at rest, hard expiry, server-enforced
attempt cap, per-mobile rate limit — with SMS delivery when Twilio is
configured and on-screen delivery when it is not.

A successful verification returns a short-lived `kycToken`. Citizen signup and
every grievance filing require it (or a verified citizen session), so the
verification step cannot be skipped by calling the API directly.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..schemas.kyc import RequestOtpRequest, VerifyOtpRequest
from ..security import KYC_TOKEN_MINUTES
from ..services.aadhaar import OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS
from ..services.kyc_service import KycError, issue_challenge, kyc_token_for, verify_challenge
from ..services.twilio_service import sms_configured

router = APIRouter(prefix="/api/kyc", tags=["kyc"])


@router.post("/aadhaar/request-otp")
async def request_otp(body: RequestOtpRequest, session: AsyncSession = Depends(get_session)):
    try:
        challenge, otp, delivered = await issue_challenge(session, body.aadhaar, body.mobile)
    except KycError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    response = {
        "success": True,
        "challengeId": str(challenge.id),
        "maskedAadhaar": challenge.masked_aadhaar,
        "maskedMobile": f"+91 XXXXX{challenge.mobile_normalized[-5:]}",
        "deliveryChannel": challenge.delivery_channel,
        "expiresInSeconds": OTP_TTL_SECONDS,
        "maxAttempts": OTP_MAX_ATTEMPTS,
    }
    if not delivered:
        # No SMS provider configured. The OTP is still real, random, hashed and
        # expiring — it just has nowhere to go, so the UI displays it and
        # labels the flow as a sandbox e-KYC.
        response["sandboxOtp"] = otp
        response["notice"] = (
            "Sandbox e-KYC: no SMS provider is configured, so the OTP is shown here instead of "
            "being texted. Configure Twilio to deliver it to the citizen's handset."
        )
    return response


@router.post("/aadhaar/verify-otp")
async def verify_otp(body: VerifyOtpRequest, session: AsyncSession = Depends(get_session)):
    try:
        challenge = await verify_challenge(session, body.challengeId, body.otp)
    except KycError as e:
        # Persist the burned attempt before failing — raising rolls the
        # request session back, which would otherwise make the cap unenforced.
        await session.commit()
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    return {
        "success": True,
        "verified": True,
        "aadhaarLast4": challenge.aadhaar_last4,
        "maskedAadhaar": challenge.masked_aadhaar,
        "mobile": f"+91 {challenge.mobile_normalized}",
        "deliveryChannel": challenge.delivery_channel,
        "sandbox": not sms_configured(),
        "kycToken": kyc_token_for(challenge),
        "kycTokenExpiresInSeconds": KYC_TOKEN_MINUTES * 60,
    }
