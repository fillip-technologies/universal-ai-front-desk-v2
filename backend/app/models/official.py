import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

ROLE_TIERS = ["citizen", "panchayat", "block", "sub-division", "district", "division", "state", "cmo"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Official(Base):
    __tablename__ = "officials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # One of ROLE_TIERS (excluding "citizen", kept for type parity with the frontend)
    role_tier: Mapped[str] = mapped_column(String(32), nullable=False, default="panchayat")
    department: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    district: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    block: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    designation: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    self_registered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    def to_public(self) -> dict:
        return {
            "id": str(self.id),
            "email": self.email,
            "name": self.name,
            "role_tier": self.role_tier,
            "department": self.department,
            "district": self.district,
            "block": self.block,
            "designation": self.designation,
            "verified": self.verified,
            "self_registered": self.self_registered,
        }
