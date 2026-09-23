import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CmoUser(Base):
    """A Chief Minister's Office monitoring account — separate from officials.

    The CMO Monitor is a statewide view, so these accounts have their own
    login/signup and session, and a self-registered account sees nothing
    until an admin approves it (`approved_at`)."""

    __tablename__ = "cmo_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    designation: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    @property
    def approved(self) -> bool:
        return self.approved_at is not None

    def to_public(self) -> dict:
        return {
            "id": str(self.id),
            "email": self.email,
            "name": self.name,
            "designation": self.designation,
            "approved": self.approved,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "created_at": self.created_at.isoformat(),
        }
