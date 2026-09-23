from typing import Optional

from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    audioBase64: Optional[str] = None
    audioMimeType: str = "audio/webm"
    imageBase64: Optional[str] = None
    imageMimeType: str = "image/jpeg"
    text: str = ""
    district: str = "Patna"
    block: str = "Maner"
    panchayat: str = "Rampur Diara"
    gpsCoordinates: str = "25.611, 85.144"
    # Optional; empty means auto-detect the language from the speech/text.
    dialectHint: str = ""
    surface: str = "web"


class CreateComplaintRequest(BaseModel):
    """One analysed grievance as assembled by the intake screen after calling
    /api/grievance/analyze. Routing, status, officer, identity and notes are
    all decided server-side; unknown extra fields are ignored."""

    # Identity is established server-side (complaint_factory.resolve_identity);
    # name/mobile here are only an anonymous filer's self-declared contact
    # details, and are ignored for a signed-in citizen.
    citizen_name: Optional[str] = None
    citizen_mobile: Optional[str] = None
    district: str
    block: str
    panchayat: Optional[str] = None
    raw_audio_url: Optional[str] = None
    original_text: Optional[str] = None
    photo_url: Optional[str] = None
    detected_language: str
    translated_summary: str
    # PERSONAL | SOCIETAL, from the AI analysis. Sanitized server-side;
    # anything else is filed as SOCIETAL (identity withheld).
    complaint_nature: Optional[str] = None
    nature_rationale: Optional[str] = ""
    jurisdiction_check: Optional[str] = "LOK_SHIKAYAT"
    jurisdiction_explanation: Optional[str] = None
    assigned_department: str
    administrative_tier: str
    escalation_level: Optional[str] = "PGRO"
    escalation_index: int = 0
    priority_score: int
    urgency_rationale: str
    landmark_or_location: str
    affected_population_estimate: str
    recommended_action_step: str
    gps_coordinates: Optional[str] = None
    status: str = "Submitted"
    assigned_officer: Optional[str] = None
    sla_deadline_days: int = 60
    offline_fallback: bool = False
    intake_channel: str = "web"


class BatchCreateComplaintRequest(BaseModel):
    """One citizen submission that the AI split into several distinct grievances,
    each routed to its own department. Filed as one ticket per entry, all sharing
    a grievance_group_id. A single-entry list is filed as a plain standalone
    ticket (no group id)."""

    grievances: list[CreateComplaintRequest]


class UpdateStatusRequest(BaseModel):
    status: str
    officer_note: Optional[str] = None
