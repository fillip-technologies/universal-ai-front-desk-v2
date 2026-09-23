import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Citizen(Base):
    __tablename__ = "citizens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Display form, e.g. "+91 9835012345"
    mobile: Mapped[str] = mapped_column(String(32), nullable=False)
    # Last-10-digit key used for lookup/uniqueness
    mobile_normalized: Mapped[str] = mapped_column(String(10), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    block: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    panchayat: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    # Masked only (XXXX-XXXX-1234) — Aadhaar Act §29(4). Full numbers are never stored.
    aadhaar_masked: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    aadhaar_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    def to_public(self) -> dict:
        return {
            "id": str(self.id),
            "name": self.name,
            "mobile": self.mobile,
            "district": self.district,
            "block": self.block,
            "panchayat": self.panchayat,
            "aadhaar_masked": self.aadhaar_masked,
            "aadhaar_verified": self.aadhaar_verified,
            "created_at": self.created_at.isoformat(),
        }
