"""Automatic escalation of unattended grievances.

Every `ESCALATION_SWEEP_MINUTES`, this job scans open grievances and advances
any that the officer currently holding them has left untouched past the
statutory 48-hour internal response window. Each advance:

  * moves `complaints.escalation_index` up one or more rungs,
  * reassigns `assigned_officer` to the new rung,
  * appends a note to `official_notes`,
  * writes an `escalation_events` row as a permanent audit trail.

The database is the single source of truth for where a grievance sits. The
frontend renders `escalation_index` as-is and never recomputes it.
"""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from ..config import settings
from ..db import get_session_factory
from ..models.complaint import Complaint, EscalationEvent
from . import bihar_data

logger = logging.getLogger("escalation")


async def escalate_due_complaints(session: AsyncSession) -> int:
    """Advance every grievance that is overdue. Returns how many moved."""
    open_statuses = list(bihar_data.ESCALATION_ELIGIBLE_STATUSES)
    complaints = (
        await session.scalars(select(Complaint).where(Complaint.status.in_(open_statuses)))
    ).all()

    moved = 0
    now = datetime.now(timezone.utc)

    for complaint in complaints:
        target = bihar_data.target_ladder_index(
            complaint.assigned_department, complaint.status, complaint.created_at
        )
        current = complaint.escalation_index
        if target <= current:
            continue

        ladder = bihar_data.get_escalation_ladder(complaint.assigned_department)
        from_officer = ladder[min(current, len(ladder) - 1)]
        to_officer = ladder[min(target, len(ladder) - 1)]
        hours_inactive = int(bihar_data.hours_since(complaint.created_at))
        reason = (
            f"No officer action recorded for {hours_inactive}h "
            f"(threshold {bihar_data.INTERNAL_FIRST_RESPONSE_HOURS}h per rung)."
        )

        complaint.escalation_index = target
        complaint.assigned_officer = to_officer
        complaint.last_escalated_at = now

        timestamp = now.strftime("%d %b %Y, %I:%M %p")
        notes = list(complaint.official_notes or [])
        notes.insert(
            0,
            f"[{timestamp} - Auto-escalation] {from_officer} → {to_officer}. {reason}",
        )
        complaint.official_notes = notes
        flag_modified(complaint, "official_notes")

        session.add(
            EscalationEvent(
                complaint_id=complaint.id,
                from_index=current,
                to_index=target,
                from_officer=from_officer,
                to_officer=to_officer,
                reason=reason,
                hours_inactive=hours_inactive,
            )
        )
        moved += 1

    if moved:
        await session.commit()
        logger.info("escalated %d grievance(s)", moved)
    return moved


async def run_escalation_sweep() -> int:
    async with get_session_factory()() as session:
        try:
            return await escalate_due_complaints(session)
        except Exception:
            await session.rollback()
            logger.exception("escalation sweep failed")
            return 0


async def escalation_loop() -> None:
    """Background task started from the FastAPI lifespan handler."""
    interval = max(1, settings.escalation_sweep_minutes) * 60
    logger.info("auto-escalation sweep every %d minute(s)", settings.escalation_sweep_minutes)
    while True:
        await run_escalation_sweep()
        await asyncio.sleep(interval)
