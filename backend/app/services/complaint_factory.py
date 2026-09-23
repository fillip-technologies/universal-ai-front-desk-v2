"""Shared construction of `Complaint` rows for every intake path (web, kiosk,
mobile).

Centralises the three things all channels must agree on:
  * allocating a collision-free #BHR-XXXXX tracking id,
  * server-side sanitisation of the routing fields the client must not decide
    (department, tier, priority, status, escalation position, entry officer),
  * proving who filed it — every grievance, personal or societal, must come
    from an Aadhaar-verified complainant (see `resolve_identity`).

Compound grievances: `analyze_grievance` now returns a *list* of analyses (one
per department when a single report covers several). The caller allocates one
`grievance_group_id` for the whole list (only when it has more than one entry)
and builds one row per analysis with 1-based `part_index` / `part_count`.
"""
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.citizen import Citizen
from ..models.complaint import COMPLAINT_NATURES, Complaint
from ..schemas.complaint import CreateComplaintRequest
from ..security import decode_kyc_token
from . import bihar_data

# Upper bound on how many tickets one submission may be split into — guards
# against a mis-firing model shredding a single grievance into many.
MAX_GRIEVANCES_PER_SUBMISSION = 4

_VALID_CHANNELS = ("web", "kiosk", "mobile")


async def allocate_tracking_id(session: AsyncSession) -> str:
    """A unique #BHR-XXXXX id. Retries on the (rare) collision rather than
    trusting a bare random draw — tracking_id carries a UNIQUE constraint."""
    for _ in range(10):
        candidate = f"#BHR-{secrets.randbelow(90000) + 10000}"
        exists = await session.scalar(
            select(Complaint.id).where(Complaint.tracking_id == candidate)
        )
        if not exists:
            return candidate
    raise HTTPException(status_code=503, detail="Could not allocate a tracking ID. Please retry.")


@dataclass
class VerifiedIdentity:
    """Who filed a grievance, as established server-side. Stored on every
    complaint; whether officials get to *see* it depends on the complaint's
    nature (Complaint.to_public)."""

    method: str  # 'citizen_account' | 'aadhaar_otp'
    aadhaar_masked: str
    name: Optional[str]
    mobile: Optional[str]
    citizen_id: Optional[uuid.UUID] = None


VERIFICATION_REQUIRED = (
    "Aadhaar e-KYC verification is required to file a grievance. "
    "Verify with the OTP (or sign in to your verified citizen account) and try again."
)


def _display_mobile(value: Optional[str]) -> Optional[str]:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())[-10:]
    return f"+91 {digits}" if len(digits) == 10 else None


async def resolve_identity(
    session: AsyncSession,
    *,
    token=None,
    kyc_token: Optional[str] = None,
    claimed_name: Optional[str] = None,
    claimed_mobile: Optional[str] = None,
) -> VerifiedIdentity:
    """Establish a verified complainant or refuse with 401.

    A signed-in citizen is verified by their account (e-KYC was completed at
    signup), and their stored name/mobile win over anything in the body. An
    anonymous filer (web without an account, or kiosk) must present the
    kycToken from a completed OTP challenge; the masked Aadhaar is taken from
    that token, never from the request body."""
    citizen = None
    if token is not None and getattr(token, "role", None) == "citizen":
        try:
            citizen = await session.get(Citizen, uuid.UUID(token.subject))
        except (ValueError, TypeError):
            citizen = None
        if citizen and citizen.aadhaar_verified:
            return VerifiedIdentity(
                method="citizen_account",
                aadhaar_masked=citizen.aadhaar_masked,
                name=citizen.name,
                mobile=citizen.mobile,
                citizen_id=citizen.id,
            )

    kyc = decode_kyc_token(kyc_token)
    if kyc is None:
        raise HTTPException(status_code=401, detail=VERIFICATION_REQUIRED)
    return VerifiedIdentity(
        method="aadhaar_otp",
        aadhaar_masked=kyc.masked_aadhaar,
        citizen_id=citizen.id if citizen else None,
        name=(citizen.name if citizen else (claimed_name or "").strip()) or None,
        # A contact number the citizen typed is kept; otherwise the number the
        # OTP was actually verified on.
        mobile=_display_mobile(claimed_mobile) or f"+91 {kyc.mobile}",
    )


def sanitize_nature(value: Optional[str]) -> str:
    """Unknown/missing nature is treated as SOCIETAL — the privacy-preserving
    choice: an identity can be disclosed later, never un-disclosed."""
    value = (value or "").strip().upper()
    return value if value in COMPLAINT_NATURES else "SOCIETAL"


def _intake_note(data: CreateComplaintRequest, channel: str, nature: str, identity: VerifiedIdentity,
                 part_index: Optional[int], part_count: Optional[int]) -> str:
    """Written server-side (client-supplied notes are ignored) so the note can
    never leak identity the nature rule is meant to withhold."""
    stamp = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p")
    engine = "rule-based fallback" if data.offline_fallback else "AI"
    verified_by = (
        "verified citizen account" if identity.method == "citizen_account" else "Aadhaar OTP e-KYC"
    )
    disclosure = (
        "complainant identity disclosed to the handling authority"
        if nature == "PERSONAL"
        else "complainant identity withheld from the handling authority"
    )
    part = f" Part {part_index} of {part_count} of a compound report." if part_count else ""
    return (
        f"[{stamp}] Registered via the {channel} channel ({engine} intake). "
        f"Complainant verified by {verified_by}. Classified {nature}: {disclosure}.{part} "
        f"Statutory 60-working-day clock started."
    )


def sanitize_department(value: Optional[str]) -> str:
    """The department decides the escalation ladder and the officer queue, so
    it is validated server-side rather than trusted from the client."""
    return value if value in bihar_data.BIHAR_DEPARTMENTS else "General Administration"


def sanitize_tier(value: Optional[str]) -> str:
    return value if value in bihar_data.ADMIN_TIERS else "District Level (DM)"


def build_complaint_row(
    data: CreateComplaintRequest,
    *,
    tracking_id: str,
    identity: VerifiedIdentity,
    group_id: Optional[uuid.UUID] = None,
    part_index: Optional[int] = None,
    part_count: Optional[int] = None,
) -> Complaint:
    """A `Complaint` ready for `session.add`. The caller still owns the session,
    the flush."""
    department = sanitize_department(data.assigned_department)
    tier = sanitize_tier(data.administrative_tier)
    nature = sanitize_nature(data.complaint_nature)
    channel = data.intake_channel if data.intake_channel in _VALID_CHANNELS else "web"

    # A grievance always enters at the foot of its department's ladder; the
    # escalation job is the only thing that may move it up.
    ladder = bihar_data.get_escalation_ladder(department)
    assigned_officer = (
        "RTPS Appellate Officer (Designated)"
        if data.jurisdiction_check == "RTPS_EXCLUDED"
        else ladder[0]
    )

    return Complaint(
        tracking_id=tracking_id,
        citizen_id=identity.citizen_id,
        citizen_name=identity.name,
        citizen_mobile=identity.mobile,
        aadhaar_number=identity.aadhaar_masked,
        aadhaar_verified=True,
        complaint_nature=nature,
        nature_rationale=(data.nature_rationale or "").strip(),
        district=data.district,
        block=data.block,
        panchayat=data.panchayat,
        raw_audio_url=data.raw_audio_url,
        original_text=data.original_text,
        photo_url=data.photo_url,
        detected_language=data.detected_language,
        translated_summary=data.translated_summary,
        jurisdiction_check=data.jurisdiction_check,
        jurisdiction_explanation=data.jurisdiction_explanation,
        assigned_department=department,
        administrative_tier=tier,
        escalation_level="PGRO",
        escalation_index=0,
        priority_score=max(1, min(5, data.priority_score)),
        urgency_rationale=data.urgency_rationale,
        landmark_or_location=data.landmark_or_location,
        affected_population_estimate=data.affected_population_estimate,
        recommended_action_step=data.recommended_action_step,
        gps_coordinates=data.gps_coordinates,
        status="Submitted",
        assigned_officer=assigned_officer,
        official_notes=[_intake_note(data, channel, nature, identity, part_index, part_count)],
        sla_deadline_days=bihar_data.STATUTORY_LIMIT_WORKING_DAYS,
        offline_fallback=data.offline_fallback,
        intake_channel=channel,
        grievance_group_id=group_id,
        grievance_part_index=part_index,
        grievance_part_count=part_count,
    )

