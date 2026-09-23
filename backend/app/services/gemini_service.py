"""Live Gemini AI classification — Python port of the analyze logic that used
to live in server.ts. Falls back to rule_classifier when no key is configured
or the call fails."""
import asyncio
import base64
import json
import random
from typing import Optional

from google import genai
from google.genai import types

from .bihar_data import BIHAR_DEPARTMENTS
from .rule_classifier import generate_rule_based_fallback

MODEL = "gemini-3.6-flash"

# Hard ceiling on how many tickets one submission may split into.
MAX_GRIEVANCES = 4

_GRIEVANCE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "translated_english_summary": types.Schema(type=types.Type.STRING),
        "complaint_nature": types.Schema(
            type=types.Type.STRING,
            enum=["PERSONAL", "SOCIETAL"],
            description="PERSONAL if the complainant (or their household) is the affected party; "
            "SOCIETAL if it is a public/civic issue the complainant is reporting",
        ),
        "nature_rationale": types.Schema(
            type=types.Type.STRING,
            description="One short sentence explaining the PERSONAL/SOCIETAL decision",
        ),
        "jurisdiction_check": types.Schema(
            type=types.Type.STRING,
            enum=["LOK_SHIKAYAT", "RTPS_EXCLUDED", "COURT_EXCLUDED", "RTI_EXCLUDED", "SERVICE_MATTER_EXCLUDED"],
            description="Statutory jurisdiction screen under the applicable state Public Grievance Redressal Act",
        ),
        "jurisdiction_explanation": types.Schema(
            type=types.Type.STRING,
            description="One sentence: where the citizen must go if excluded; empty string if LOK_SHIKAYAT",
        ),
        "assigned_department": types.Schema(type=types.Type.STRING, enum=BIHAR_DEPARTMENTS),
        "administrative_tier": types.Schema(
            type=types.Type.STRING,
            enum=["Gram Panchayat", "Block Level (BDO)", "Sub-Division (SDO)", "District Level (DM)"],
        ),
        "priority_score": types.Schema(type=types.Type.INTEGER, description="1 to 5"),
        "urgency_rationale": types.Schema(type=types.Type.STRING),
        "key_entities": types.Schema(
            type=types.Type.OBJECT,
            properties={
                "landmark_or_location": types.Schema(type=types.Type.STRING),
                "affected_population_estimate": types.Schema(type=types.Type.STRING),
            },
            required=["landmark_or_location", "affected_population_estimate"],
        ),
        "recommended_action_step": types.Schema(type=types.Type.STRING),
    },
    required=[
        "translated_english_summary",
        "complaint_nature",
        "nature_rationale",
        "jurisdiction_check",
        "assigned_department",
        "administrative_tier",
        "priority_score",
        "urgency_rationale",
        "key_entities",
        "recommended_action_step",
    ],
)

# One report can raise several distinct grievances belonging to DIFFERENT
# departments. The model returns one shared language plus a list of grievances;
# the server files one ticket per list entry.
RESPONSE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "original_language_detected": types.Schema(
            type=types.Type.STRING,
            enum=["Bhojpuri", "Magahi", "Maithili", "Hindi", "Urdu", "English"],
        ),
        "grievances": types.Schema(
            type=types.Type.ARRAY,
            items=_GRIEVANCE_SCHEMA,
            min_items=1,
            description="One entry per distinct grievance routed to a different department (max 4).",
        ),
    },
    required=["original_language_detected", "grievances"],
)

SYSTEM_INSTRUCTION = (
    "You are an expert Public Sector Civic Grievance Classifier under the applicable state Right to "
    "Public Grievance Redressal framework. Respond ONLY with valid JSON."
)


def _prompt(text: str, district: str, block: str, panchayat: str, gps: str, dialect_hint: str) -> str:
    return f"""
CITIZEN GRIEVANCE METADATA:
- Citizen Text Input: "{text or 'No text provided. Please transcribe and analyze audio content.'}"
- District: {district}
- Block: {block}
- Panchayat: {panchayat}
- GPS Coordinates: {gps}
- Dialect Hint: {dialect_hint or 'Auto-detect (Bhojpuri / Magahi / Maithili / Hindi)'}

INSTRUCTIONS:
You are the AI Engine for a state government's Civic Grievance Redressal System ("JanSunwayi AI"), operating under that state's Right to Public Grievance Redressal framework.

OUTPUT SHAPE: return one `original_language_detected` plus a `grievances` array. Each array entry is a fully classified grievance (steps 2-7 below applied independently to it).
0. SPLIT CHECK — do this first. A single report may contain several distinct grievances. Create a SEPARATE `grievances` entry ONLY when the issues route to DIFFERENT state government departments (e.g. "a tree has fallen on road 2 AND there is water logging on road 3" => one entry for Road Construction, one for Urban Development & Housing). Do NOT split when the issues share a department (e.g. two potholes on two different roads => a SINGLE Road Construction entry covering both). If in doubt, keep it as one entry. Never emit more than 4 entries. Most reports are a single entry.
1. Transcribe audio if present, detecting the language: Bhojpuri, Magahi, Maithili, Hindi, Urdu, or English. The language is shared across all entries.
2. For each grievance, translate it into a clear, precise 2-3 sentence English summary (this SHORT SUMMARY is what officials receive — never the full voice note). When the report was split, each summary must describe only its own issue.
3. JURISDICTION CHECK under the state's Public Grievance Redressal framework. Lok Shikayat EXCLUDES:
   - Services notified under the state's Right to Public Services Act (caste/income/residence certificates, land mutation/dakhil-kharij, ration card issuance) => 'RTPS_EXCLUDED'
   - Matters pending before any Court or Tribunal => 'COURT_EXCLUDED'
   - RTI Act 2005 matters => 'RTI_EXCLUDED'
   - Service matters of public servants (transfers, promotions, pension of govt staff) => 'SERVICE_MATTER_EXCLUDED'
   - Everything else (scheme/programme/service failures, benefit delays, public authority inaction) => 'LOK_SHIKAYAT'
   If excluded, explain in jurisdiction_explanation where the citizen must actually go, in one sentence.
4. Classify into the correct state government Department (choose the single best match) from the enum provided.
5. Assign the lowest competent Administrative Tier, following a typical Indian state's hierarchy of divisions, districts, sub-divisions, blocks, and gram panchayats:
   - 'Gram Panchayat' (village roads, local drinking water points, minor local disputes)
   - 'Block Level (BDO)' (block schemes, MDM/anganwadi, panchayat-level scheme failures)
   - 'Sub-Division (SDO)' (inter-block issues, power transformer failures, municipal sanitation, law & order)
   - 'District Level (DM)' (disaster management/floods, epidemics, major corruption, district coordination)
   ROUTING RULES (critical):
   - Police matters (FIR refusal, assault, neighbour dispute with violence, theft, harassment, law & order) => ALWAYS 'Home (Police)', NEVER 'Panchayati Raj'. Escalation chain: Police Station (SHO) -> DSP -> SP -> DGP HQ -> CMO. FIR registration is mandatory for cognizable offences.
   - Ration/PDS dealer issues => 'Food & Consumer Protection'. Pension (old-age/widow/disability) => 'Social Welfare'. Hospital/doctor/medicine => 'Health'. School/teacher/MDM => 'Education'. Electricity => 'Energy'. Drinking water/handpump => 'Public Health Engineering'. Roads/potholes => 'Road Construction'. Drains/municipal sanitation => 'Urban Development & Housing'. Floods/embankments => 'Disaster Management'. Corruption/bribe allegations => 'General Administration' (vigilance referral).
   - Every department has its own escalation ladder ending at its HQ and the CMO Cell; the recommended_action_step should name the FIRST officer on that ladder (e.g. SHO for police, JE for PHED, MOIC for health).
6. Assign priority score 1 to 5 (5 = life/safety emergency; 4 = major service failure; 3 = administrative delay; 1-2 = minor local issue).
7. Provide urgency rationale, key entities (landmark, population impacted), and the recommended action step for the PGRO, referencing the Act's statutory powers where apt (the right to a hearing, powers of a civil court, and penalty provisions for non-compliance).
8. COMPLAINT NATURE — decide for each grievance whether it is PERSONAL or SOCIETAL. This controls whether the complainant's identity is shown to the handling officer, so decide carefully:
   - 'PERSONAL': the complainant, their family or their own property is the affected party, and the authority must be able to reach them. Examples: fire at my home; theft in my house; someone teased / harassed / beat me or my family member; my pension or ration was stopped; a doctor refused to treat me; police refused to register my FIR.
   - 'SOCIETAL': a public or civic problem the complainant is reporting on behalf of the community, not as its victim. Examples: the road is broken; water logging on the road; a fight was happening on my street; the village handpump is dry; the transformer has failed for the whole area; garbage / drain overflow; the school's mid-day meal has stopped.
   - Words like "my road", "my village" or "my area" do NOT make a complaint personal — only harm to the complainant themself, their household or their own property does.
   - When one report mixes both (e.g. "the drain overflowed into my house and the whole road is flooded") and it is split into several grievances, classify each entry on its own.
   - For SOCIETAL grievances the translated_english_summary, urgency_rationale, key_entities and recommended_action_step MUST NOT contain the complainant's name, phone number, house number or any other detail that identifies them — describe only the public issue and its location.
   - Give a one-sentence nature_rationale.
"""


async def analyze_grievance(
    *,
    api_key: Optional[str],
    text: str = "",
    district: str = "Patna",
    block: str = "Maner",
    panchayat: str = "Rampur Diara",
    gps_coordinates: str = "25.611, 85.144",
    dialect_hint: str = "",
    audio_base64: Optional[str] = None,
    audio_mime_type: str = "audio/webm",
    image_base64: Optional[str] = None,
    image_mime_type: str = "image/jpeg",
) -> tuple[list[dict], bool, Optional[str]]:
    """Returns (analyses, is_fallback, error_message).

    `analyses` is a non-empty list — one classified grievance per entry. A
    single-issue report yields a one-element list; a compound report that spans
    several departments yields one entry each.
    """
    if not api_key:
        return generate_rule_based_fallback(text, district, block, panchayat, dialect_hint), True, None

    try:
        client = genai.Client(api_key=api_key)
        parts = []

        if audio_base64:
            clean = audio_base64.split(",", 1)[-1]
            parts.append(types.Part(inline_data=types.Blob(mime_type=audio_mime_type, data=base64.b64decode(clean))))

        if image_base64:
            clean = image_base64.split(",", 1)[-1]
            parts.append(types.Part(inline_data=types.Blob(mime_type=image_mime_type, data=base64.b64decode(clean))))

        prompt_text = _prompt(text, district, block, panchayat, gps_coordinates, dialect_hint)
        parts.append(types.Part(text=prompt_text))

        response = await asyncio.to_thread(
            client.models.generate_content,
            model=MODEL,
            contents=types.Content(parts=parts),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
            ),
        )

        json_text = response.text or ""
        try:
            parsed = json.loads(json_text)
        except json.JSONDecodeError:
            return generate_rule_based_fallback(text, district, block, panchayat, dialect_hint), True, "Gemini returned invalid JSON."

        analyses = _normalize_analyses(parsed)
        if not analyses:
            return (
                generate_rule_based_fallback(text, district, block, panchayat, dialect_hint),
                True,
                "Gemini returned no grievances.",
            )
        return analyses, False, None
    except Exception as e:  # pragma: no cover - network/SDK errors
        fallback = generate_rule_based_fallback(text, district, block, panchayat, dialect_hint)
        return fallback, True, str(e)


def _normalize_analyses(parsed: dict) -> list[dict]:
    """Flatten the {original_language_detected, grievances:[...]} response into a
    list of self-contained analysis dicts (language + tracking_id copied onto
    each), matching the rule-classifier output shape. Tolerates a legacy
    single-object response."""
    language = parsed.get("original_language_detected", "Hindi")
    raw = parsed.get("grievances")
    if not isinstance(raw, list):
        raw = [parsed]  # legacy flat shape
    items: list[dict] = []
    for entry in raw[:MAX_GRIEVANCES]:
        if not isinstance(entry, dict) or not entry.get("assigned_department"):
            continue
        entities = entry.get("key_entities", {}) or {}
        items.append(
            {
                "tracking_id": f"#BHR-{random.randint(10000, 99999)}",
                "original_language_detected": language,
                "translated_english_summary": entry.get("translated_english_summary", ""),
                # Anything but an explicit PERSONAL withholds identity.
                "complaint_nature": "PERSONAL" if entry.get("complaint_nature") == "PERSONAL" else "SOCIETAL",
                "nature_rationale": entry.get("nature_rationale", ""),
                "jurisdiction_check": entry.get("jurisdiction_check", "LOK_SHIKAYAT"),
                "jurisdiction_explanation": entry.get("jurisdiction_explanation", ""),
                "assigned_department": entry.get("assigned_department", "General Administration"),
                "administrative_tier": entry.get("administrative_tier", "District Level (DM)"),
                "priority_score": entry.get("priority_score", 3),
                "urgency_rationale": entry.get("urgency_rationale", ""),
                "key_entities": {
                    "landmark_or_location": entities.get("landmark_or_location", "Unknown"),
                    "affected_population_estimate": entities.get("affected_population_estimate", "Unknown"),
                },
                "recommended_action_step": entry.get("recommended_action_step", ""),
            }
        )
    return items


def test_key_sync(api_key: str) -> tuple[bool, str]:
    """Live-tests a Gemini key with a minimal call. Returns (ok, message)."""
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model=MODEL, contents="Reply with exactly: OK")
        return True, (response.text or "").strip()[:40]
    except Exception as e:
        return False, str(e)
