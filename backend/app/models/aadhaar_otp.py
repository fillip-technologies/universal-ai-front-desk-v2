import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AadhaarOtpChallenge(Base):
    """A single Aadhaar e-KYC OTP challenge.

    The OTP itself is never stored in the clear — only a bcrypt hash, exactly
    as passwords are. Each challenge carries a hard expiry and an attempt
    counter, both enforced server-side in routers/kyc.py.

    Only the last 4 digits of the Aadhaar number are ever persisted
    (Aadhaar Act §29(4)); the 12-digit number is validated in memory against
    the UIDAI Verhoeff checksum and then discarded.
    """

    __tablename__ = "aadhaar_otp_challenges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aadhaar_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    mobile_normalized: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    # 'sms'     — the OTP was delivered to the citizen's handset via Twilio.
    # 'sandbox' — no SMS provider configured, so the OTP is shown on screen and
    #             the UI labels the flow as a sandbox e-KYC.
    delivery_channel: Mapped[str] = mapped_column(String(16), nullable=False, default="sandbox")

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )

    __table_args__ = (
        CheckConstraint("attempts >= 0", name="ck_aadhaar_otp_attempts_non_negative"),
        CheckConstraint(
            "delivery_channel IN ('sms', 'sandbox')", name="ck_aadhaar_otp_delivery_channel"
        ),
    )

    @property
    def masked_aadhaar(self) -> str:
        return f"XXXX-XXXX-{self.aadhaar_last4}"

    def is_expired(self) -> bool:
        expires = self.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return _utcnow() >= expires

    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    def attempts_remaining(self) -> int:
        return max(0, self.max_attempts - self.attempts)
