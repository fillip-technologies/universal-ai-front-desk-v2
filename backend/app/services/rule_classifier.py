"""Offline rule-based grievance classifier — 1:1 port of the original
src/services/ruleClassifier.ts so every intake channel (web, kiosk, mobile) routes identically when the
live Gemini engine is unavailable.

Returns a *list* of analysis dicts: one report may raise several distinct
grievances that belong to different departments ("tree fell on road 2 AND water
logging on road 3"). Every keyword rule that matches contributes one entry,
deduplicated by department. A report that matches nothing (or has no transcript)
yields a single generic entry.
"""
import random
from typing import Optional

# --- category rules -----------------------------------------------------------
# Each rule: a set of trigger keywords plus templated output fields. Templates
# use {panchayat} / {block} / {district}, already coalesced to a sensible label
# by _fmt() below. Order matters only for which department "wins" a tie on the
# rare occasion two rules resolve to the same department (first one kept).
CATEGORY_RULES: list[dict] = [
    {
        "keywords": ("fire", "aag ", "aag lag", "jal gaya", "jal gayi", "burnt", "burning", "आग", "जल गया", "जल गई"),
        "dept": "Disaster Management",
        "tier": "District Level (DM)",
        "priority": 5,
        "summary": "Fire incident reported in {area}; loss of property and risk to life.",
        "rationale": "Fire is a life/safety emergency requiring immediate fire-service response and relief assessment.",
        "landmark": "{panchayat_or_village}, {block}, {district}",
        "population": "Affected household(s)",
        "action": "CO / SDO to confirm fire-service response and start relief and damage assessment immediately.",
        "nature": "auto",
    },
    {
        "keywords": (
            "fir ", "police", "thana", "fight", "assault", "neighbour", "neighbor", "jhagda", "jhagra",
            "ladai", "marpit", "maar", "pitai", "chori", "theft", "daroga", "thanedar", "kabza", "dabang",
            "harass", "crime", "beat", "tease", "teasing", "molest", "chhed", "chhedkhani", "stolen",
            "robbery", "loot", "छेड़", "छेड़खानी", "लूट", "पीटा", "चोरी", "अपराध", "कब्जा", "दबंग", "पुलिस", "थाना", "थानेदार", "दारोगा",
            "मारपीट", "झगड़ा", "एफआईआर", "प्राथमिकी",
        ),
        "dept": "Home (Police)",
        "tier": "Sub-Division (SDO)",
        "priority": 4,
        "summary": "Police inaction: local Thana refusing to register FIR in a dispute/assault matter in {area}. Complainant seeking registration and investigation.",
        "rationale": "FIR registration is mandatory for cognizable offences. Refusal escalates: SHO -> DSP -> SP -> DGP HQ -> CMO.",
        "landmark": "Police Station, {block}, {district}",
        "population": "Complainant & family",
        "action": "Routed to the area Police Station (SHO). If no action in 48h, auto-escalates to DSP, then SP under CrPC 154(3), then DGP HQ and CMO Cell.",
        "nature": "auto",
    },
    {
        "keywords": ("राशन", "डीलर", "ration", "pds", "rashan", "dealer"),
        "dept": "Food & Consumer Protection",
        "tier": "Block Level (BDO)",
        "priority": 4,
        "summary": "PDS ration dealer irregularity / non-distribution reported in {area}.",
        "rationale": "NFSA entitlement denial affecting household food security.",
        "landmark": "PDS Dealer Shop, {panchayat_or_ward}, {block}, {district}",
        "population": "~150 card-holder families",
        "action": "Marketing Officer to inspect the dealer; auto-escalates to SDO and DSO on 48h inaction.",
        "nature": "auto",
    },
    {
        "keywords": ("पेंशन", "pension", "वृद्धा", "विधवा"),
        "dept": "Social Welfare",
        "tier": "Block Level (BDO)",
        "priority": 3,
        "summary": "Social security pension (old-age/widow/disability) payment stopped or not sanctioned for eligible beneficiary in {area}.",
        "rationale": "Social security entitlement failure for vulnerable citizen.",
        "landmark": "Block Office, {block}, {district}",
        "population": "Individual beneficiary",
        "action": "BDO/CDPO to verify beneficiary record and restore pension; escalates on 48h inaction.",
        "nature": "PERSONAL",
    },
    {
        "keywords": ("सड़क", "गड्ढ", "road", "pothole", "sadak", "sarak", "gaddha", "पुल"),
        "dept": "Road Construction",
        "tier": "Block Level (BDO)",
        "priority": 3,
        "summary": "Damaged road / potholes / broken culvert reported in {area} hampering movement.",
        "rationale": "Infrastructure failure affecting connectivity and safety.",
        "landmark": "{panchayat_or_village_road}, {block}, {district}",
        "population": "~2,000 daily commuters",
        "action": "JE to inspect and estimate repair; auto-escalates to AE and Executive Engineer on 48h inaction.",
        "nature": "SOCIETAL",
    },
    {
        "keywords": (
            "अस्पताल", "डॉक्टर", "दवा", "hospital", "doctor", "medicine", "aspatal", "davai",
            "dawai", "ilaj", "ambulance", "एम्बुलेंस",
        ),
        "dept": "Health",
        "tier": "Sub-Division (SDO)",
        "priority": 4,
        "summary": "Government health facility failure: doctor absence / medicine stock-out / ambulance unavailability in {area}.",
        "rationale": "Public health service denial at government facility.",
        "landmark": "PHC/CHC, {block}, {district}",
        "population": "~5,000 catchment residents",
        "action": "MOIC to respond; auto-escalates to Civil Surgeon and Health Dept HQ on 48h inaction.",
        "nature": "auto",
    },
    {
        "keywords": ("रिश्वत", "घूस", "bribe", "corruption", "rishwat", "ghoos", "ghus", "भ्रष्टाचार"),
        "dept": "General Administration",
        "tier": "District Level (DM)",
        "priority": 4,
        "summary": "Corruption / bribe demand alleged against a government functionary in {block_or_district}.",
        "rationale": "Corruption allegation — referred for vigilance verification with identity protection.",
        "landmark": "{block}, {district}",
        "population": "Individual complainant",
        "action": "DM office to verify and refer to Vigilance; escalates to Divisional Commissioner and CMO on inaction.",
        "nature": "auto",
    },
    {
        "keywords": (
            "पानी", "चापाकल", "नल-जल", "handpump", "dry", "paani", "pani", "chapakal", "nal-jal", "water",
        ),
        "dept": "Public Health Engineering",
        "tier": "Block Level (BDO)",
        "priority": 5,
        "summary": "Severe drinking water supply disruption due to dry handpump/tube-well in {area_village}.",
        "rationale": "Critical drinking water shortage posing immediate public health risk under the state Grievance Redressal Act.",
        "landmark": "Near Primary School, {panchayat_or_ward4}, {block_or_maner}, {district}",
        "population": "~1,200 villagers",
        "action": "BDO to direct PHED Junior Engineer for immediate pump repair within 24 hours.",
        "nature": "SOCIETAL",
    },
    {
        "keywords": ("बिजली", "ट्रांसफॉर्मर", "power", "transformer", "bijli", "electricity", "light nahi"),
        "dept": "Energy",
        "tier": "Sub-Division (SDO)",
        "priority": 4,
        "summary": "Distribution transformer breakdown leading to complete power outage in {panchayat_or_village}.",
        "rationale": "Multi-day electricity failure disrupting local water pumps, cold storage, and student studies.",
        "landmark": "Power Sub-Station Area, {block_or_bodhgaya}, {district_or_gaya}",
        "population": "~800 residents",
        "action": "SDO Power to direct SBPDCL team for 24-hour transformer replacement.",
        "nature": "SOCIETAL",
    },
    {
        "keywords": ("बांध", "बाढ़", "flood", "erosion"),
        "dept": "Disaster Management",
        "tier": "District Level (DM)",
        "priority": 5,
        "summary": "River embankment erosion and imminent flood breach risk threatening {panchayat_or_gp}.",
        "rationale": "Catastrophic disaster risk endangering lives and agricultural land during flood season.",
        "landmark": "Embankment Km 14, {block_or_keoti}, {district_or_darbhanga}",
        "population": "~5,000 villagers",
        "action": "District PGRO to requisition Flood Control records and direct emergency geo-bag pitching.",
        "nature": "SOCIETAL",
    },
    {
        "keywords": ("म्यूटेशन", "दस्तावेज", "land", "mutation"),
        "dept": "Revenue & Land Reforms",
        "tier": "Block Level (BDO)",
        "priority": 3,
        "summary": "Pending land record mutation / certificate application delayed beyond the RTPS-notified time limit.",
        "rationale": "RTPS-notified service delay at Circle Office — outside Lok Shikayat jurisdiction under the state's Public Grievance Redressal Act.",
        "landmark": "CO Office, {block_or_kanti}, {district_or_muzaffarpur}",
        "population": "Individual Applicant",
        "action": "RTPS First Appeal drafted against the Designated Officer for exceeding the notified time limit.",
        "jurisdiction": "RTPS_EXCLUDED",
        "jurisdiction_explanation": (
            "This is a service notified under the state's Right to Public Services Act — "
            "excluded from Lok Shikayat under the state's Public Grievance Redressal Act. The citizen is guided to the RTPS appeal "
            "chain with a pre-filled appeal against the Designated Officer."
        ),
        "nature": "PERSONAL",
    },
    {
        "keywords": (
            "drain", "sanitation", "sewage", "naali", "nali ka", "safai", "kachra", "garbage", "نالی", "नाली",
        ),
        "dept": "Urban Development & Housing",
        "tier": "Sub-Division (SDO)",
        "priority": 4,
        "summary": "Open drain overflow and stopped sanitation service in {panchayat_or_ward} for an extended period.",
        "rationale": "Public health hazard from stagnant sewage; municipal inaction on record.",
        "landmark": "{panchayat_or_ward}, {block}, {district_or_kishanganj}",
        "population": "~600 residents",
        "action": "PGRO to hear Executive Officer of the municipal body and direct immediate drain cleaning.",
        "nature": "SOCIETAL",
    },
    {
        "keywords": ("mid-day", "school meal", "mdm", "मध्याह्न", "भोजन"),
        "dept": "Education",
        "tier": "Block Level (BDO)",
        "priority": 4,
        "summary": "Mid-day meal scheme non-functional at government school in {area_block}; cook honorarium unpaid.",
        "rationale": "Child nutrition scheme failure affecting school attendance and health.",
        "landmark": "Govt. School, {panchayat_or_village}, {block_or_chapra}, {district_or_saran}",
        "population": "~240 school children",
        "action": "PGRO to hear the Block Education Officer; direct release of MDM funds and honorarium.",
        "nature": "SOCIETAL",
    },
]

# ── Personal vs societal ─────────────────────────────────────────────────────
# PERSONAL = the complainant/their household is the victim (identity shown to
# officials); SOCIETAL = a public issue they are reporting (identity withheld).
# Rules marked "auto" decide from these first-person *victim* cues. A bare
# "my" is deliberately not a cue: "my road is broken" or "a fight on my street"
# is still societal.
_PERSONAL_CUES = (
    " me ", " me.", " me,", "myself", "my home", "my house", "my family", "my son", "my daughter",
    "my wife", "my husband", "my mother", "my father", "my child", "my shop", "my land", "my pension",
    "my ration", "my fir", "my bike", "my phone", "my money", "our house", "our home",
    "mujhe", "mujhko", "mujhse", "mere ghar", "mera ghar", "hamare ghar", "hamara ghar", "mere bete",
    "meri beti", "meri patni", "mere pati", "mere pariwar", "meri dukan", "mera paisa", "mera mobile",
    "hamra", "hamar ghar", "humko", "hamko",
    "मुझे", "मुझको", "मुझसे", "मेरे घर", "मेरा घर", "हमारे घर", "हमारा घर", "मेरे बेटे", "मेरी बेटी",
    "मेरी पत्नी", "मेरे पति", "मेरे परिवार", "मेरी दुकान", "मेरा पैसा", "हमरा", "हमार घर", "हमको",
)


def _nature_for(rule_nature: str, input_lower: str) -> tuple[str, str]:
    if rule_nature in ("PERSONAL", "SOCIETAL"):
        why = (
            "Individual entitlement or service affecting the complainant directly."
            if rule_nature == "PERSONAL"
            else "Public/civic issue affecting the community; the complainant is reporting it."
        )
        return rule_nature, f"Offline classifier: {why}"
    padded = f" {input_lower} "
    if any(cue in padded for cue in _PERSONAL_CUES):
        return "PERSONAL", "Offline classifier: the complainant or their household is described as the affected party."
    return "SOCIETAL", "Offline classifier: no harm to the complainant personally was described — treated as a public issue."

# Services notified under the state's Right to Public Services Act — these
# are excluded from Lok Shikayat even when no category rule above matches.
_RTPS_KEYWORDS = (
    "दाखिल-खारिज", "जाति प्रमाण", "आय प्रमाण", "निवास प्रमाण",
    "caste certificate", "income certificate", "residence certificate",
)
_RTPS_EXPLANATION = (
    "This is a service notified under the state's Right to Public Services Act — "
    "excluded from Lok Shikayat under the state's Public Grievance Redressal Act. The citizen is guided to the RTPS appeal "
    "chain with a pre-filled appeal against the Designated Officer."
)


def _detect_language(text: str, input_lower: str, dialect_hint: Optional[str]) -> str:
    lang = dialect_hint or "Hindi"
    stripped = text.strip()
    if stripped and all(ord(ch) < 128 or ch in ".,!?'\"()-0123456789 " for ch in stripped):
        return "English"
    if any(k in input_lower for k in ("ट्रांसफॉर्मर", "बिजली", "मस्तिपुर")):
        return "Magahi"
    if any(k in input_lower for k in ("बांध", "कमला", "कटव")):
        return "Maithili"
    if any(k in input_lower for k in ("نالی", "صفائی", "بلدیہ")):
        return "Urdu"
    if any(k in input_lower for k in ("म्यूटेशन", "दस्तावेज", "मध्याह्न")):
        return "Hindi"
    return lang


def _fmt(template: str, district: str, block: str, panchayat: str) -> str:
    d = district or "Patna"
    b = block or "Block"
    p = panchayat or ""
    return template.format(
        district=d,
        block=b or "Block",
        panchayat=p or "Village",
        area=(p or block or "the area"),
        area_village=(p or block or "village"),
        area_block=(p or block or "block"),
        block_or_district=(block or district or "the area"),
        block_or_maner=(block or "Maner"),
        block_or_bodhgaya=(block or "Bodh Gaya"),
        block_or_keoti=(block or "Keoti"),
        block_or_kanti=(block or "Kanti"),
        block_or_chapra=(block or "Chapra Sadar"),
        district_or_gaya=(district or "Gaya"),
        district_or_darbhanga=(district or "Darbhanga"),
        district_or_muzaffarpur=(district or "Muzaffarpur"),
        district_or_kishanganj=(district or "Kishanganj"),
        district_or_saran=(district or "Saran"),
        panchayat_or_ward=(p or "Ward"),
        panchayat_or_ward4=(p or "Ward No. 4"),
        panchayat_or_village=(p or "village"),
        panchayat_or_village_road=(p or "Village road"),
        panchayat_or_gp=(p or "Gram Panchayat"),
        panchayat_or_village_e=(p or "village"),
    )


def _item(
    *,
    lang: str,
    dept: str,
    tier: str,
    priority: int,
    summary: str,
    rationale: str,
    landmark: str,
    population: str,
    action: str,
    jurisdiction: str = "LOK_SHIKAYAT",
    jurisdiction_explanation: str = "",
    nature: str = "SOCIETAL",
    nature_rationale: str = "",
) -> dict:
    return {
        "tracking_id": f"#BHR-{random.randint(10000, 99999)}",
        "original_language_detected": lang,
        "translated_english_summary": summary,
        "complaint_nature": nature,
        "nature_rationale": nature_rationale,
        "jurisdiction_check": jurisdiction,
        "jurisdiction_explanation": jurisdiction_explanation,
        "assigned_department": dept,
        "administrative_tier": tier,
        "priority_score": priority,
        "urgency_rationale": rationale,
        "key_entities": {
            "landmark_or_location": landmark,
            "affected_population_estimate": population,
        },
        "recommended_action_step": action,
    }


def generate_rule_based_fallback(
    text: Optional[str] = None,
    district: Optional[str] = None,
    block: Optional[str] = None,
    panchayat: Optional[str] = None,
    dialect_hint: Optional[str] = None,
) -> list[dict]:
    """One list entry per distinct grievance found in the text (deduped by
    department). Never returns an empty list."""
    text = text or ""
    input_lower = text.lower()
    stripped = text.strip()
    lang = _detect_language(text, input_lower, dialect_hint)
    d, b, p = district or "", block or "", panchayat or ""

    # --- no transcript (offline voice note): provisional single ticket --------
    if not stripped:
        return [
            _item(
                lang=lang,
                dept="General Administration",
                tier="Sub-Division (SDO)",
                priority=3,
                summary=(
                    "Voice grievance received — transcript unavailable in offline mode. Queued for AI "
                    "transcription (Bhashini ASR) and department classification as soon as the live engine "
                    "is reachable."
                ),
                rationale=(
                    "OFFLINE MODE: audio cannot be transcribed without the AI engine. Registered "
                    "provisionally with General Administration to preserve the statutory clock; will be "
                    "re-routed on transcription."
                ),
                landmark=f"{p or 'Village'}, {b or 'Block'}, {d or 'Patna'}",
                population="To be determined on transcription",
                action=(
                    "Sub-Divisional PGRO cell to trigger AI transcription and re-route to the competent "
                    "department; citizen keeps the same tracking ID."
                ),
                nature="SOCIETAL",
                nature_rationale=(
                    "Offline classifier: no transcript to judge from — identity withheld by default "
                    "until the grievance is transcribed."
                ),
            )
        ]

    # --- keyword rules: collect every match, one ticket per department --------
    results: list[dict] = []
    seen_depts: set[str] = set()
    for rule in CATEGORY_RULES:
        if rule["dept"] in seen_depts:
            continue
        # Trailing space lets short keywords match whole words only ("fir "
        # must not fire on "fire", "aag " must not fire on "aage").
        if not any(k in input_lower + " " for k in rule["keywords"]):
            continue
        seen_depts.add(rule["dept"])
        nature, nature_why = _nature_for(rule.get("nature", "auto"), input_lower)
        results.append(
            _item(
                lang=lang,
                dept=rule["dept"],
                tier=rule["tier"],
                priority=rule["priority"],
                summary=_fmt(rule["summary"], d, b, p),
                rationale=rule["rationale"],
                landmark=_fmt(rule["landmark"], d, b, p),
                population=rule["population"],
                action=rule["action"],
                jurisdiction=rule.get("jurisdiction", "LOK_SHIKAYAT"),
                jurisdiction_explanation=rule.get("jurisdiction_explanation", ""),
                nature=nature,
                nature_rationale=nature_why,
            )
        )

    if results:
        return results

    # --- RTPS-notified service with no category hit --------------------------
    if any(k in input_lower for k in _RTPS_KEYWORDS):
        return [
            _item(
                lang=lang,
                dept="Panchayati Raj",
                tier="Gram Panchayat",
                priority=3,
                summary="Local civic grievance submitted by citizen requiring administrative verification.",
                rationale="Standard civic complaint under the applicable state Right to Public Grievance Redressal Act.",
                landmark=f"{p or 'Village'}, {b or 'Block'}, {d or 'Patna'}",
                population="~250 citizens",
                action="PGRO to provide opportunity of hearing within the statutory working-day limit.",
                jurisdiction="RTPS_EXCLUDED",
                jurisdiction_explanation=_RTPS_EXPLANATION,
                nature="PERSONAL",
                nature_rationale="Offline classifier: an individual certificate/record service for the complainant.",
            )
        ]

    # --- nothing matched: verbatim to the District PGRO cell ----------------
    clipped = stripped[:180] + ("…" if len(stripped) > 180 else "")
    nature, nature_why = _nature_for("auto", input_lower)
    return [
        _item(
            lang=lang,
            dept="General Administration",
            tier="District Level (DM)",
            priority=3,
            summary=(
                f'Citizen grievance (verbatim): "{clipped}" — offline keyword classifier found no exact '
                "category; district PGRO cell to triage."
            ),
            rationale=(
                "OFFLINE MODE: rule-based classifier could not confidently categorise this text. Routed to "
                "the District PGRO cell for manual triage; the live AI engine will classify it precisely "
                "when reachable."
            ),
            landmark=f"{p or 'Village'}, {b or 'Block'}, {d or 'Patna'}",
            population="~250 citizens",
            action=(
                "District PGRO cell to read the verbatim grievance and assign the competent department; "
                "auto-escalates on 48h inaction."
            ),
            nature=nature,
            nature_rationale=nature_why,
        )
    ]
