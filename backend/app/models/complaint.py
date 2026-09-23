import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    inspect,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from ..services import bihar_data

COMPLAINT_NATURES = ("PERSONAL", "SOCIETAL")

# Who is reading a complaint, which decides how much of the complainant's
# identity the response may carry:
#   owner    — the citizen who filed it (or the intake screen that just filed it)
#   official — any authenticated officer; identity only for PERSONAL complaints
#   public   — the unauthenticated track-by-ID page; never any identity
Audience = Literal["owner", "official", "public"]

_IDENTITY_FIELDS = ("citizen_id", "citizen_name", "citizen_mobile", "aadhaar_number")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tracking_id: Mapped[str] = mapped_column(String(24), nullable=False, unique=True, index=True)

    # Null when filed without a citizen account (OTP-verified web or kiosk
    # filer) — tracked by tracking_id alone.
    citizen_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citizens.id", ondelete="SET NULL"), nullable=True, index=True
    )
    citizen_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    citizen_mobile: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # Masked only (XXXX-XXXX-1234) — Aadhaar Act §29(4).
    aadhaar_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    aadhaar_verified: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    district: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    block: Mapped[str] = mapped_column(String(80), nullable=False)
    panchayat: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    raw_audio_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    detected_language: Mapped[str] = mapped_column(String(32), nullable=False)
    translated_summary: Mapped[str] = mapped_column(Text, nullable=False)

    # PERSONAL — the complainant is the affected party (fire at my home, theft
    # from my house, I was beaten/harassed): the authority must be able to reach
    # them, so their identity is disclosed to officials.
    # SOCIETAL — a public/civic issue (broken road, water logging, a fight in
    # the street): the complainant is a reporter, not the victim, so their
    # identity is withheld from officials. See Complaint.to_public().
    complaint_nature: Mapped[str] = mapped_column(String(16), nullable=False, default="SOCIETAL")
    nature_rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")

    jurisdiction_check: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    jurisdiction_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    assigned_department: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    administrative_tier: Mapped[str] = mapped_column(String(40), nullable=False)

    escalation_level: Mapped[str] = mapped_column(String(48), nullable=False, default="PGRO")
    # Authoritative position on the department escalation ladder. Advanced by
    # the background escalation job (services/escalation_service.py) — never
    # guessed client-side.
    escalation_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    priority_score: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    urgency_rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    landmark_or_location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    affected_population_estimate: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    recommended_action_step: Mapped[str] = mapped_column(Text, nullable=False, default="")
    gps_coordinates: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Submitted", index=True)
    assigned_officer: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    official_notes: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    sla_deadline_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=bihar_data.STATUTORY_LIMIT_WORKING_DAYS
    )
    offline_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Which channel this grievance was filed through.
    intake_channel: Mapped[str] = mapped_column(String(16), nullable=False, default="web")

    # Compound-grievance splitting: when one submission (e.g. "tree fell on road 2
    # AND water logging on road 3") covers several departments, it is filed as one
    # ticket per department, all sharing a group id. NULL when the submission
    # produced a single ticket. See services/complaint_factory.py.
    grievance_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    grievance_part_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    grievance_part_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    escalation_events: Mapped[List["EscalationEvent"]] = relationship(
        back_populates="complaint",
        cascade="all, delete-orphan",
        order_by="EscalationEvent.created_at",
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint("priority_score BETWEEN 1 AND 5", name="ck_complaints_priority_range"),
        CheckConstraint("escalation_index >= 0", name="ck_complaints_escalation_index_non_negative"),
        CheckConstraint(
            "intake_channel IN ('web', 'kiosk', 'mobile')",
            name="ck_complaints_intake_channel",
        ),
        Index("ix_complaints_dept_status", "assigned_department", "status"),
    )

    def _escalation_events_public(self) -> list[dict]:
        """The audit trail, or [] when the relationship is not loaded.

        Query paths eager-load it (lazy="selectin"), but a complaint that was
        just constructed and flushed has no loaded collection — touching it
        there would fire a lazy SELECT from async context and raise
        MissingGreenlet. Such a complaint has no events yet anyway.
        """
        if "escalation_events" in inspect(self).unloaded:
            return []
        return [e.to_public() for e in self.escalation_events]

    def identity_visible_to(self, audience: Audience) -> bool:
        if audience == "owner":
            return True
        if audience == "official":
            return self.complaint_nature == "PERSONAL"
        return False

    def to_public(self, audience: Audience) -> dict:
        """Serialize for `audience`. Redaction happens here, on the server, so
        a withheld identity never reaches the browser at all."""
        data = self._serialize()
        reveal = self.identity_visible_to(audience)
        if not reveal:
            for field in _IDENTITY_FIELDS:
                data[field] = None
        # The raw text is the citizen's own words and can name them ("I, Ramesh
        # of Ward 4…"). Officials handling a societal complaint work from the
        # AI summary, which is instructed to stay anonymous; the public track
        # page never shows it.
        if audience == "public" or (audience == "official" and not reveal):
            data["original_text"] = None
        data["identity_withheld"] = not reveal
        return data

    def _serialize(self) -> dict:
        ladder = bihar_data.get_escalation_ladder(self.assigned_department)
        ladder_index = min(self.escalation_index, len(ladder) - 1)
        return {
            "id": str(self.id),
            "tracking_id": self.tracking_id,
            "citizen_id": str(self.citizen_id) if self.citizen_id else None,
            "citizen_name": self.citizen_name,
            "citizen_mobile": self.citizen_mobile,
            "aadhaar_number": self.aadhaar_number,
            "aadhaar_verified": self.aadhaar_verified,
            "district": self.district,
            "block": self.block,
            "panchayat": self.panchayat,
            "raw_audio_url": self.raw_audio_url,
            "original_text": self.original_text,
            "photo_url": self.photo_url,
            "detected_language": self.detected_language,
            "translated_summary": self.translated_summary,
            "complaint_nature": self.complaint_nature,
            "nature_rationale": self.nature_rationale,
            "jurisdiction_check": self.jurisdiction_check,
            "jurisdiction_explanation": self.jurisdiction_explanation,
            "assigned_department": self.assigned_department,
            "administrative_tier": self.administrative_tier,
            "escalation_level": self.escalation_level,
            "escalation_index": self.escalation_index,
            "last_escalated_at": self.last_escalated_at.isoformat() if self.last_escalated_at else None,
            "priority_score": self.priority_score,
            "urgency_rationale": self.urgency_rationale,
            "landmark_or_location": self.landmark_or_location,
            "affected_population_estimate": self.affected_population_estimate,
            "recommended_action_step": self.recommended_action_step,
            "gps_coordinates": self.gps_coordinates,
            "status": self.status,
            "assigned_officer": self.assigned_officer,
            "official_notes": list(self.official_notes or []),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "sla_deadline_days": self.sla_deadline_days,
            "offline_fallback": self.offline_fallback,
            "intake_channel": self.intake_channel,
            "grievance_group_id": str(self.grievance_group_id) if self.grievance_group_id else None,
            "grievance_part_index": self.grievance_part_index,
            "grievance_part_count": self.grievance_part_count,
            "attention_flag": bihar_data.needs_attention(self.status, self.created_at),
            "working_days_remaining": bihar_data.working_days_remaining(self.created_at),
            "current_ladder_step": ladder[ladder_index],
            "current_ladder_index": ladder_index,
            "escalation_ladder": ladder,
            # Eager-loaded (selectin), so including the trail here costs one
            # extra query for the whole result set rather than one per row.
            "escalation_events": self._escalation_events_public(),
        }


class EscalationEvent(Base):
    """Append-only audit trail of every automatic ladder advance.

    Written only by the background escalation job, so the dashboard can show
    exactly when and why a grievance moved up — instead of recomputing a guess
    from `created_at` on every render.
    """

    __tablename__ = "escalation_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_index: Mapped[int] = mapped_column(Integer, nullable=False)
    to_index: Mapped[int] = mapped_column(Integer, nullable=False)
    from_officer: Mapped[str] = mapped_column(String(160), nullable=False)
    to_officer: Mapped[str] = mapped_column(String(160), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    hours_inactive: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    complaint: Mapped["Complaint"] = relationship(back_populates="escalation_events")

    def to_public(self) -> dict:
        return {
            "id": str(self.id),
            "from_index": self.from_index,
            "to_index": self.to_index,
            "from_officer": self.from_officer,
            "to_officer": self.to_officer,
            "reason": self.reason,
            "hours_inactive": self.hours_inactive,
            "created_at": self.created_at.isoformat(),
        }
