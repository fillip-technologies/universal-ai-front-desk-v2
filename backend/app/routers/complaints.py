import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from ..db import get_session
from ..deps import get_approved_cmo, get_current_citizen, get_current_official, get_optional_token
from ..models.admin_config import AdminConfig
from ..models.complaint import Complaint
from ..models.official import Official
from ..routers.admin import get_effective_key
from ..schemas.complaint import (
    AnalyzeRequest,
    BatchCreateComplaintRequest,
    CreateComplaintRequest,
    UpdateStatusRequest,
)
from ..services import complaint_factory
from ..services.gemini_service import analyze_grievance

router = APIRouter(prefix="/api", tags=["complaints"])

VALID_STATUSES = {
    "Submitted",
    "Under Review",
    "Hearing Scheduled",
    "In Progress",
    "Resolved",
    "Rejected (with reasons)",
}


# Anonymous filers (no citizen account) prove Aadhaar e-KYC with the token
# returned by /api/kyc/aadhaar/verify-otp, sent in this header.
KYC_HEADER = Header(None, alias="X-KYC-Token")


@router.post("/grievance/analyze")
async def analyze(body: AnalyzeRequest, session: AsyncSession = Depends(get_session)):
    if not (body.text or "").strip() and not body.audioBase64:
        raise HTTPException(
            status_code=400,
            detail="Provide the grievance as text or as a voice recording.",
        )

    cfg = await AdminConfig.get_singleton(session)
    api_key = await get_effective_key(cfg)

    analyses, is_fallback, error_msg = await analyze_grievance(
        api_key=api_key,
        text=body.text,
        district=body.district,
        block=body.block,
        panchayat=body.panchayat,
        gps_coordinates=body.gpsCoordinates,
        dialect_hint=body.dialectHint,
        audio_base64=body.audioBase64,
        audio_mime_type=body.audioMimeType,
        image_base64=body.imageBase64,
        image_mime_type=body.imageMimeType,
    )

    cfg.record_usage(body.surface, was_live=not is_fallback)

    return {
        "success": True,
        "isFallback": is_fallback,
        "errorMsg": error_msg,
        "analyses": analyses,
        # Back-compat: callers that still expect a single object get the first.
        "analysis": analyses[0] if analyses else None,
    }


@router.post("/complaints")
async def create_complaint(
    body: CreateComplaintRequest,
    session: AsyncSession = Depends(get_session),
    token=Depends(get_optional_token),
    kyc_token: Optional[str] = KYC_HEADER,
):
    """Files a single grievance.

    Every grievance needs a verified complainant — a signed-in citizen or an
    X-KYC-Token from a completed Aadhaar OTP — whether it is personal or
    societal. The fields that drive routing and accountability (department,
    tier, status, officer, escalation position, identity) are decided here,
    not by the caller.
    """
    identity = await complaint_factory.resolve_identity(
        session, token=token, kyc_token=kyc_token,
        claimed_name=body.citizen_name, claimed_mobile=body.citizen_mobile,
    )
    complaint = complaint_factory.build_complaint_row(
        body,
        tracking_id=await complaint_factory.allocate_tracking_id(session),
        identity=identity,
    )
    session.add(complaint)
    await session.flush()
    return {"success": True, "complaint": complaint.to_public("owner")}


@router.post("/complaints/batch")
async def create_complaint_batch(
    body: BatchCreateComplaintRequest,
    session: AsyncSession = Depends(get_session),
    token=Depends(get_optional_token),
    kyc_token: Optional[str] = KYC_HEADER,
):
    """Files one citizen submission that covers several departments as one
    linked ticket each. A single-entry list behaves exactly like POST
    /complaints (standalone ticket, no group id)."""
    entries = body.grievances[: complaint_factory.MAX_GRIEVANCES_PER_SUBMISSION]
    if not entries:
        raise HTTPException(status_code=400, detail="No grievances to file.")

    first = entries[0]
    identity = await complaint_factory.resolve_identity(
        session, token=token, kyc_token=kyc_token,
        claimed_name=first.citizen_name, claimed_mobile=first.citizen_mobile,
    )
    part_count = len(entries)
    group_id = uuid.uuid4() if part_count > 1 else None

    rows = []
    for idx, entry in enumerate(entries, start=1):
        row = complaint_factory.build_complaint_row(
            entry,
            tracking_id=await complaint_factory.allocate_tracking_id(session),
            identity=identity,
            group_id=group_id,
            part_index=idx if group_id else None,
            part_count=part_count if group_id else None,
        )
        session.add(row)
        rows.append(row)

    await session.flush()
    return {"success": True, "complaints": [r.to_public("owner") for r in rows]}


@router.get("/complaints/mine")
async def my_complaints(
    citizen=Depends(get_current_citizen),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.scalars(
            select(Complaint)
            .where(Complaint.citizen_id == citizen.id)
            .order_by(Complaint.created_at.desc())
        )
    ).all()
    return {"success": True, "complaints": [c.to_public("owner") for c in rows]}


@router.get("/complaints/track/{tracking_id}")
async def track_complaint(tracking_id: str, session: AsyncSession = Depends(get_session)):
    clean = tracking_id.strip().upper().lstrip("#")
    complaint = await session.scalar(
        select(Complaint).where(Complaint.tracking_id.in_([f"#{clean}", clean]))
    )
    if not complaint:
        raise HTTPException(status_code=404, detail=f'No grievance ticket found for "{tracking_id}".')

    # Public page: anyone holding the ID can read it, so it never carries the
    # complainant's identity or raw text — personal or societal.
    public = complaint.to_public("public")
    related: list[dict] = []
    if complaint.grievance_group_id:
        siblings = await session.scalars(
            select(Complaint)
            .where(
                Complaint.grievance_group_id == complaint.grievance_group_id,
                Complaint.id != complaint.id,
            )
            .order_by(Complaint.grievance_part_index)
        )
        related = [
            {
                "tracking_id": s.tracking_id,
                "assigned_department": s.assigned_department,
                "status": s.status,
                "priority_score": s.priority_score,
                "grievance_part_index": s.grievance_part_index,
            }
            for s in siblings
        ]
    public["related"] = related
    return {"success": True, "complaint": public}


@router.get("/complaints")
async def list_complaints(
    department: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[int] = Query(None),
    district: Optional[str] = Query(None),
    _official: Official = Depends(get_current_official),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Complaint)
    if department and department != "All":
        stmt = stmt.where(Complaint.assigned_department == department)
    if tier and tier != "All":
        stmt = stmt.where(Complaint.administrative_tier == tier)
    if status and status != "All":
        stmt = stmt.where(Complaint.status == status)
    if priority:
        stmt = stmt.where(Complaint.priority_score == priority)
    if district and district != "All":
        stmt = stmt.where(Complaint.district == district)

    rows = (await session.scalars(stmt.order_by(Complaint.created_at.desc()))).all()
    # Identity only for PERSONAL complaints — see Complaint.to_public.
    return {"success": True, "complaints": [c.to_public("official") for c in rows]}


@router.get("/cmo/complaints")
async def cmo_complaints(
    _cmo=Depends(get_approved_cmo),
    session: AsyncSession = Depends(get_session),
):
    """Statewide feed for the CMO Monitor — approved CMO accounts only.
    Same identity rule as officials: societal complainants stay anonymous."""
    rows = (await session.scalars(select(Complaint).order_by(Complaint.created_at.desc()))).all()
    return {"success": True, "complaints": [c.to_public("official") for c in rows]}


@router.patch("/complaints/{complaint_id}/status")
async def update_status(
    complaint_id: str,
    body: UpdateStatusRequest,
    official: Official = Depends(get_current_official),
    session: AsyncSession = Depends(get_session),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status '{body.status}'.")
    try:
        pk = uuid.UUID(complaint_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Complaint not found.")

    complaint = await session.get(Complaint, pk)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    complaint.status = body.status
    complaint.assigned_officer = official.designation or official.name

    timestamp = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p")
    notes = list(complaint.official_notes or [])
    if body.officer_note and body.officer_note.strip():
        notes.insert(0, f"[{timestamp} - {official.name}] {body.officer_note.strip()}")
    else:
        notes.insert(0, f"[{timestamp} - {official.name}] Status set to {body.status}.")
    complaint.official_notes = notes
    flag_modified(complaint, "official_notes")

    await session.flush()
    return {"success": True, "complaint": complaint.to_public("official")}
