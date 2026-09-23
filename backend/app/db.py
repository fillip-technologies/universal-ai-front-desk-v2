"""PostgreSQL connection, session factory and schema bootstrap.

The whole system runs on a single Postgres database — see
`backend/app/models/` for the table definitions and `SqlSchemaModal.tsx` in the
frontend for the human-readable version of the same schema.
"""
from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.async_database_url,
            echo=settings.db_echo,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


# Columns added after the initial schema shipped. create_all() only creates
# missing *tables*, never missing columns on an existing one, and this repo has
# no migration framework — so additive columns are applied here with idempotent
# ADD COLUMN IF NOT EXISTS statements. Safe to run on every boot.
_ADDITIVE_COLUMNS: tuple[str, ...] = (
    "ALTER TABLE complaints ADD COLUMN IF NOT EXISTS grievance_group_id UUID",
    "ALTER TABLE complaints ADD COLUMN IF NOT EXISTS grievance_part_index INTEGER",
    "ALTER TABLE complaints ADD COLUMN IF NOT EXISTS grievance_part_count INTEGER",
    # Rows filed before personal/societal classification existed were shown to
    # officials with full identity, so they backfill as PERSONAL — unchanged
    # behaviour. New rows always get an explicit value from the classifier.
    "ALTER TABLE complaints ADD COLUMN IF NOT EXISTS complaint_nature VARCHAR(16) NOT NULL DEFAULT 'PERSONAL'",
    "ALTER TABLE complaints ADD COLUMN IF NOT EXISTS nature_rationale TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS ix_complaints_grievance_group_id "
    "ON complaints (grievance_group_id)",
)


async def init_db() -> None:
    """Create any missing tables. Safe to run on every boot."""
    # Import for side effects: every model must be registered on Base.metadata
    # before create_all runs.
    from .models import admin, admin_config, aadhaar_otp, citizen, cmo_user, complaint, official  # noqa: F401

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in _ADDITIVE_COLUMNS:
            await conn.execute(text(statement))


async def dispose_db() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def ping_db() -> bool:
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one transactional session per request."""
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
