import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy import CheckConstraint, DateTime, Integer, String, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import flag_modified

from ..db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AdminConfig(Base):
    """Single-row table holding the central Gemini key + AI usage counters.

    The `singleton_key` CHECK constraint makes the one-row invariant a database
    guarantee rather than an application convention.
    """

    __tablename__ = "admin_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    singleton_key: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, default="singleton")

    gemini_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    key_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    usage_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_live: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_fallback: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_by_surface: Mapped[Dict[str, int]] = mapped_column(JSONB, nullable=False, default=dict)
    usage_last_request_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("singleton_key = 'singleton'", name="ck_admin_config_singleton"),
    )

    @classmethod
    async def get_singleton(cls, session: AsyncSession) -> "AdminConfig":
        row = await session.scalar(select(cls).where(cls.singleton_key == "singleton"))
        if row is None:
            row = cls(singleton_key="singleton", usage_by_surface={})
            session.add(row)
            await session.flush()
        return row

    def record_usage(self, surface: str, was_live: bool) -> None:
        self.usage_total += 1
        if was_live:
            self.usage_live += 1
        else:
            self.usage_fallback += 1
        by_surface = dict(self.usage_by_surface or {})
        by_surface[surface] = by_surface.get(surface, 0) + 1
        self.usage_by_surface = by_surface
        flag_modified(self, "usage_by_surface")
        self.usage_last_request_at = _utcnow()

    def usage_public(self) -> dict:
        return {
            "total": self.usage_total,
            "live": self.usage_live,
            "fallback": self.usage_fallback,
            "bySurface": dict(self.usage_by_surface or {}),
            "lastRequestAt": self.usage_last_request_at.isoformat() if self.usage_last_request_at else None,
        }
