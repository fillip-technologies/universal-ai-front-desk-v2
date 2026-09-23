"""Static state-government reference data (Bihar department/tier set used as the
demo dataset) + escalation-clock helpers. Ported 1:1 from src/types.ts so both
the API responses and any AI prompt construction agree with the original
frontend constants."""
from datetime import datetime, timezone
from typing import Dict, List

BIHAR_DEPARTMENTS: List[str] = [
    "Agriculture",
    "Animal & Fisheries Resources",
    "BC & EBC Welfare",
    "Building Construction",
    "Co-operative",
    "Disaster Management",
    "Education",
    "Energy",
    "Environment, Forest & Climate Change",
    "Food & Consumer Protection",
    "General Administration",
    "Health",
    "Home (Police)",
    "Industries",
    "Labour Resources",
    "Minor Water Resources",
    "Minority Welfare",
    "Panchayati Raj",
    "Public Health Engineering",
    "Revenue & Land Reforms",
    "Road Construction",
    "Rural Development",
    "Rural Works",
    "Social Welfare",
    "SC & ST Welfare",
    "Transport",
    "Urban Development & Housing",
    "Water Resources",
]

ADMIN_TIERS = ["Gram Panchayat", "Block Level (BDO)", "Sub-Division (SDO)", "District Level (DM)"]

ESCALATION_CHAIN = ["PGRO", "First Appellate Authority", "Second Appellate Authority", "Revision Authority"]

DEPARTMENT_ESCALATION_LADDERS: Dict[str, List[str]] = {
    "Home (Police)": [
        "Police Station (SHO / Thana In-charge)",
        "DSP (Sub-Divisional Police Officer)",
        "SP (Superintendent of Police, District)",
        "DGP HQ (Police Headquarters, Patna)",
        "CMO Cell",
    ],
    "Energy": [
        "JE (Section Office)",
        "SDO (Power Sub-Division)",
        "Executive Engineer (SBPDCL / NBPDCL)",
        "Discom HQ (MD Office)",
        "CMO Cell",
    ],
    "Health": [
        "PHC In-charge (MOIC)",
        "Civil Surgeon (District)",
        "Regional Deputy Director (Division)",
        "Health Dept HQ (Patna)",
        "CMO Cell",
    ],
    "Education": [
        "Head Master / Block Education Officer",
        "DEO (District Education Officer)",
        "RDDE (Division)",
        "Education Dept HQ (Patna)",
        "CMO Cell",
    ],
    "Public Health Engineering": [
        "JE PHED (Block)",
        "Assistant Engineer (Sub-Division)",
        "Executive Engineer (District)",
        "PHED HQ (Patna)",
        "CMO Cell",
    ],
    "Food & Consumer Protection": [
        "Marketing Officer / Dealer (Block)",
        "SDO (Sub-Division)",
        "DSO (District Supply Officer)",
        "Food Dept HQ (Patna)",
        "CMO Cell",
    ],
    "Revenue & Land Reforms": [
        "CO (Circle Officer)",
        "DCLR (Sub-Division)",
        "ADM / DM (District)",
        "Revenue Dept HQ (Patna)",
        "CMO Cell",
    ],
    "Road Construction": [
        "JE (Block)",
        "Assistant Engineer (Sub-Division)",
        "Executive Engineer (District)",
        "RCD HQ (Patna)",
        "CMO Cell",
    ],
    "Rural Development": [
        "BDO / Rozgar Sevak (Block)",
        "DDC (District)",
        "Divisional Commissioner",
        "RD Dept HQ (Patna)",
        "CMO Cell",
    ],
    "Disaster Management": [
        "CO (Circle Officer)",
        "SDO (Sub-Division)",
        "DM (District Magistrate)",
        "DMD HQ (Patna)",
        "CMO Cell",
    ],
    "Urban Development & Housing": [
        "Ward Officer / EO (Municipal Body)",
        "Municipal Commissioner",
        "UD&H Directorate",
        "UD&H HQ (Patna)",
        "CMO Cell",
    ],
    "Social Welfare": [
        "CDPO (Block)",
        "DPO ICDS (District)",
        "Director ICDS (State)",
        "Social Welfare HQ (Patna)",
        "CMO Cell",
    ],
}

DEFAULT_ESCALATION_LADDER: List[str] = [
    "Block-level Officer (BDO / CO)",
    "SDO (Sub-Division)",
    "DM (District Magistrate)",
    "Departmental Secretary (HQ, Patna)",
    "CMO Cell",
]

STATUTORY_LIMIT_WORKING_DAYS = 60
INTERNAL_FIRST_RESPONSE_HOURS = 48


def get_escalation_ladder(dept: str) -> List[str]:
    return DEPARTMENT_ESCALATION_LADDERS.get(dept, DEFAULT_ESCALATION_LADDER)


def hours_since(iso: datetime) -> float:
    if iso.tzinfo is None:
        iso = iso.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - iso).total_seconds() / 3600


def needs_attention(status: str, created_at: datetime) -> bool:
    if status in ("Resolved", "Rejected (with reasons)"):
        return False
    return status == "Submitted" and hours_since(created_at) >= INTERNAL_FIRST_RESPONSE_HOURS


def working_days_remaining(created_at: datetime) -> int:
    elapsed_calendar = hours_since(created_at) / 24
    elapsed_working = int(elapsed_calendar * (5 / 7))
    return max(0, STATUTORY_LIMIT_WORKING_DAYS - elapsed_working)


def ladder_step(department: str, index: int) -> str:
    """Name of the officer level at `index` on a department's ladder."""
    ladder = get_escalation_ladder(department)
    return ladder[max(0, min(index, len(ladder) - 1))]


# ── Auto-escalation ─────────────────────────────────────────────────────────
# A grievance escalates one rung for every INTERNAL_FIRST_RESPONSE_HOURS the
# officer currently holding it takes no action. "Action" means any status
# change away from 'Submitted' — the moment an officer engages, the clock
# stops and the ladder freezes wherever it is.
#
# This is the single source of truth: the background job in
# services/escalation_service.py calls target_ladder_index() and writes the
# result to complaints.escalation_index. Nothing recomputes it for display.

ESCALATION_ELIGIBLE_STATUSES = {"Submitted"}


def is_escalation_eligible(status: str) -> bool:
    return status in ESCALATION_ELIGIBLE_STATUSES


def target_ladder_index(department: str, status: str, created_at: datetime) -> int:
    """Where this grievance *should* sit right now, given elapsed inaction."""
    ladder = get_escalation_ladder(department)
    if not is_escalation_eligible(status):
        return 0
    steps = int(hours_since(created_at) // INTERNAL_FIRST_RESPONSE_HOURS)
    return min(steps, len(ladder) - 1)
