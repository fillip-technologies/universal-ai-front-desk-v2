"""Outbound SMS via Twilio — used only to deliver Aadhaar e-KYC OTPs. Without
credentials the OTP flow runs in sandbox mode (code shown on screen)."""
import asyncio

from twilio.rest import Client

from ..config import settings


def sms_configured() -> bool:
    """True when outbound SMS can actually be sent."""
    return bool(
        settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_phone_number
    )


async def send_sms(to_number: str, body: str) -> bool:
    """Send one SMS. Returns False when no provider is configured."""
    if not sms_configured():
        return False
    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    await asyncio.to_thread(
        client.messages.create, to=to_number, from_=settings.twilio_phone_number, body=body
    )
    return True
