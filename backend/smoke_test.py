"""End-to-end smoke test for the Postgres-backed API.

Exercises the real request path in-process (ASGI transport) against the
database in backend/.env: Aadhaar e-KYC OTP, citizen signup/login, AI
analysis, complaint filing (including that spoofed fields are rejected),
official listing and status updates, and the auto-escalation job.

Creates and then leaves behind one test citizen + one complaint; run
`python smoke_test.py --clean` afterwards to remove them.

Usage (from backend/, with the venv active):
    python smoke_test.py
"""
import asyncio
import sys

import httpx

from app.main import app  # noqa: E402
from app.services.aadhaar import verhoeff_is_valid  # noqa: E402

OK = "PASS"
BAD = "FAIL"
results = []


def check(name, cond, detail=""):
    results.append((OK if cond else BAD, name, detail))
    print(f"[{OK if cond else BAD}] {name} {detail}")


def valid_aadhaar():
    base = "78901234567"
    for d in "0123456789":
        if verhoeff_is_valid(base + d):
            return base + d
    raise RuntimeError("no valid sample")


async def main():
    transport = httpx.ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            # ── health ──────────────────────────────────────────────────
            r = await c.get("/api/health")
            check("health 200", r.status_code == 200, r.json().get("database", ""))
            check("postgres connected", r.json().get("databaseConnected") is True)

            # ── Aadhaar e-KYC OTP flow ──────────────────────────────────
            aad = valid_aadhaar()
            r = await c.post("/api/kyc/aadhaar/request-otp",
                             json={"aadhaar": aad, "mobile": "9876543210"})
            check("otp request 200", r.status_code == 200, str(r.status_code))
            body = r.json()
            check("sandbox otp returned", "sandboxOtp" in body, body.get("deliveryChannel", ""))
            check("aadhaar masked", body.get("maskedAadhaar", "").startswith("XXXX-XXXX-"),
                  body.get("maskedAadhaar", ""))
            cid, otp = body["challengeId"], body["sandboxOtp"]

            # wrong OTP must be rejected
            wrong = "000000" if otp != "000000" else "111111"
            r = await c.post("/api/kyc/aadhaar/verify-otp", json={"challengeId": cid, "otp": wrong})
            check("wrong otp rejected", r.status_code == 400, r.json().get("detail", "")[:60])

            # invalid aadhaar checksum rejected (unless the demo toggle is on)
            from app.config import settings as _st
            bad = aad[:-1] + ("0" if aad[-1] != "0" else "1")
            r = await c.post("/api/kyc/aadhaar/request-otp",
                             json={"aadhaar": bad, "mobile": "9876543210"})
            if _st.aadhaar_relaxed_validation:
                check("relaxed mode accepts any 12 digits", r.status_code == 200,
                      str(r.status_code))
            else:
                check("bad checksum rejected", r.status_code == 400,
                      r.json().get("detail", "")[:50])

            # correct OTP accepted
            r = await c.post("/api/kyc/aadhaar/verify-otp", json={"challengeId": cid, "otp": otp})
            check("correct otp accepted", r.status_code == 200, str(r.status_code))
            last4 = r.json().get("aadhaarLast4", "")
            check("last4 returned", len(last4) == 4, last4)
            kyc_token = r.json().get("kycToken", "")
            check("kyc token issued", bool(kyc_token))

            # replay must fail
            r = await c.post("/api/kyc/aadhaar/verify-otp", json={"challengeId": cid, "otp": otp})
            check("otp replay blocked", r.status_code == 400, r.json().get("detail", "")[:50])

            # wrong attempts must actually persist: the 3rd wrong OTP locks it
            r = await c.post("/api/kyc/aadhaar/request-otp", json={"aadhaar": aad, "mobile": "9876543211"})
            lock_cid = r.json()["challengeId"]
            codes = []
            for _ in range(4):
                r = await c.post("/api/kyc/aadhaar/verify-otp", json={"challengeId": lock_cid, "otp": "000001"})
                codes.append(r.status_code)
            check("otp attempt cap enforced", codes[2] == 429 and codes[3] == 429, str(codes))

            # ── citizen signup + login ──────────────────────────────────
            import random
            mob = f"98{random.randint(10000000, 99999999)}"
            signup = {"role": "citizen", "name": "Test Citizen", "mobile": mob,
                      "password": "secret123", "district": "Patna", "block": "Maner",
                      "panchayat": "Rampur Diara"}
            r = await c.post("/api/auth/signup", json={**signup, "aadhaarLast4": "1234"})
            check("signup without kyc rejected", r.status_code == 400, str(r.status_code))
            r = await c.post("/api/auth/signup", json={**signup, "kycToken": kyc_token})
            check("signup on a different mobile than verified rejected", r.status_code == 400,
                  r.json().get("detail", "")[:60])
            # fresh OTP on the signup mobile
            r = await c.post("/api/kyc/aadhaar/request-otp", json={"aadhaar": aad, "mobile": mob})
            b2 = r.json()
            r = await c.post("/api/kyc/aadhaar/verify-otp",
                             json={"challengeId": b2["challengeId"], "otp": b2["sandboxOtp"]})
            signup_kyc = r.json()["kycToken"]
            r = await c.post("/api/auth/signup", json={**signup, "kycToken": signup_kyc})
            check("citizen signup", r.status_code == 200, str(r.status_code) + r.text[:80])
            ctoken = r.json()["token"]

            r = await c.post("/api/auth/login",
                             json={"role": "citizen", "identifier": mob, "password": "secret123"})
            check("citizen login", r.status_code == 200)

            # ── file a grievance (rule-based fallback, no Gemini key) ───
            r = await c.post("/api/grievance/analyze", json={
                "text": "Our village handpump has been dry for three months, no drinking water.",
                "district": "Patna", "block": "Maner", "panchayat": "Rampur Diara",
                "surface": "web"})
            check("analyze 200", r.status_code == 200, str(r.status_code))
            ana = r.json()
            # Live Gemini when a key is configured, rule-based fallback otherwise.
            # Either way the response must carry a usable, well-formed analysis.
            check("analyze reports its engine", isinstance(ana.get("isFallback"), bool),
                  "fallback" if ana.get("isFallback") else "live gemini")
            check("analyze returns analyses list", isinstance(ana.get("analyses"), list) and len(ana["analyses"]) >= 1,
                  str(type(ana.get("analyses"))))
            analysis = ana["analyses"][0]
            check("singular analysis mirrors analyses[0]",
                  ana.get("analysis", {}).get("assigned_department") == analysis.get("assigned_department"))
            check("analysis has dept", bool(analysis.get("assigned_department")),
                  analysis.get("assigned_department", ""))

            # empty analyze must be rejected
            r = await c.post("/api/grievance/analyze", json={"text": "  ", "surface": "web"})
            check("empty analyze rejected", r.status_code == 400)

            # ── compound grievance: split into one linked ticket per dept ──
            r = await c.post("/api/grievance/analyze", json={
                "text": "A tree has fallen on the road near the school and there is drain overflow "
                        "with garbage piled up in the ward.",
                "district": "Patna", "block": "Maner", "surface": "web"})
            comp_analyses = r.json().get("analyses", [])
            batch_payload = {"grievances": [
                {
                    "district": "Patna", "block": "Maner", "panchayat": "Rampur Diara",
                    "original_text": "tree on road + drain overflow",
                    "detected_language": a.get("original_language_detected", "Hindi"),
                    "translated_summary": a.get("translated_english_summary", "x"),
                    "jurisdiction_check": a.get("jurisdiction_check", "LOK_SHIKAYAT"),
                    "assigned_department": a.get("assigned_department", "General Administration"),
                    "administrative_tier": a.get("administrative_tier", "District Level (DM)"),
                    "priority_score": a.get("priority_score", 3),
                    "urgency_rationale": a.get("urgency_rationale", ""),
                    "landmark_or_location": (a.get("key_entities") or {}).get("landmark_or_location", "Ward 4"),
                    "affected_population_estimate": (a.get("key_entities") or {}).get("affected_population_estimate", "~500"),
                    "recommended_action_step": a.get("recommended_action_step", ""),
                    "intake_channel": "web",
                }
                for a in comp_analyses
            ]}
            r = await c.post("/api/complaints/batch", json=batch_payload,
                             headers={"Authorization": f"Bearer {ctoken}"})
            check("batch created", r.status_code == 200, r.text[:160])
            batch = r.json()["complaints"]
            if len(batch) > 1:
                gids = {b["grievance_group_id"] for b in batch}
                tids = {b["tracking_id"] for b in batch}
                check("batch shares one group id", len(gids) == 1 and None not in gids, str(gids))
                check("batch tracking ids distinct", len(tids) == len(batch), str(tids))
                check("batch part_count set", all(b["grievance_part_count"] == len(batch) for b in batch))
                sib = batch[0]["tracking_id"].lstrip("#")
                r = await c.get(f"/api/complaints/track/{sib}")
                check("track exposes related siblings",
                      r.status_code == 200 and len(r.json()["complaint"].get("related", [])) == len(batch) - 1,
                      str(len(r.json()["complaint"].get("related", []))))
            else:
                check("batch single-entry has no group id", batch[0].get("grievance_group_id") is None)

            # ── create complaint, spoofing department + citizen_id ──────
            payload = {
                "citizen_id": "11111111-1111-1111-1111-111111111111",  # must be ignored
                "citizen_name": "Test Citizen", "citizen_mobile": f"+91 {mob}",
                "aadhaar_number": f"XXXX-XXXX-{last4}", "aadhaar_verified": True,
                "district": "Patna", "block": "Maner", "panchayat": "Rampur Diara",
                "original_text": "Handpump dry for 3 months.",
                "detected_language": analysis.get("original_language_detected", "Hindi"),
                "translated_summary": analysis["translated_english_summary"],
                "jurisdiction_check": analysis.get("jurisdiction_check", "LOK_SHIKAYAT"),
                "assigned_department": "TOTALLY BOGUS DEPARTMENT",   # must be sanitized
                "administrative_tier": "NONSENSE TIER",              # must be sanitized
                "priority_score": 99,                                # must be clamped
                "status": "Resolved",                                # must be forced to Submitted
                "escalation_index": 4,                               # must be forced to 0
                "urgency_rationale": analysis.get("urgency_rationale", ""),
                "landmark_or_location": "Ward 4, Rampur Diara",
                "affected_population_estimate": "~1200 villagers",
                "recommended_action_step": analysis.get("recommended_action_step", ""),
                "intake_channel": "web",
            }
            r = await c.post("/api/complaints", json=payload,
                             headers={"Authorization": f"Bearer {ctoken}"})
            check("complaint created", r.status_code == 200, r.text[:120])
            comp = r.json()["complaint"]
            check("dept sanitized", comp["assigned_department"] == "General Administration",
                  comp["assigned_department"])
            check("tier sanitized", comp["administrative_tier"] == "District Level (DM)",
                  comp["administrative_tier"])
            check("priority clamped", comp["priority_score"] == 5, str(comp["priority_score"]))
            check("status forced Submitted", comp["status"] == "Submitted", comp["status"])
            check("escalation forced 0", comp["escalation_index"] == 0, str(comp["escalation_index"]))
            check("officer = ladder foot", comp["assigned_officer"] == comp["current_ladder_step"],
                  comp["assigned_officer"])
            check("tracking id format", comp["tracking_id"].startswith("#BHR-"), comp["tracking_id"])
            check("new complaint has empty trail", comp.get("escalation_events") == [],
                  str(comp.get("escalation_events")))
            tracking = comp["tracking_id"]
            comp_id = comp["id"]

            # citizen_id must come from the token, not the body
            r = await c.get("/api/complaints/mine", headers={"Authorization": f"Bearer {ctoken}"})
            check("mine returns own complaint",
                  r.status_code == 200 and any(x["tracking_id"] == tracking for x in r.json()["complaints"]),
                  str(len(r.json().get("complaints", []))))

            # ── public tracking ─────────────────────────────────────────
            r = await c.get(f"/api/complaints/track/{tracking.lstrip('#')}")
            check("track without hash", r.status_code == 200)
            r = await c.get("/api/complaints/track/BHR-00000")
            check("track unknown 404", r.status_code == 404)

            # ── verification is mandatory for every grievance ───────────
            def grievance(text, nature, dept="Home (Police)"):
                return {
                    "citizen_name": "Anon Filer", "citizen_mobile": "9876543210",
                    "district": "Patna", "block": "Maner", "original_text": text,
                    "detected_language": "English", "translated_summary": text,
                    "complaint_nature": nature, "nature_rationale": "test",
                    "assigned_department": dept, "administrative_tier": "Block Level (BDO)",
                    "priority_score": 4, "urgency_rationale": "", "landmark_or_location": "Ward 4",
                    "affected_population_estimate": "", "recommended_action_step": "",
                    "intake_channel": "kiosk",
                }
            r = await c.post("/api/complaints", json=grievance("x", "SOCIETAL"))
            check("unverified filing rejected", r.status_code == 401, str(r.status_code))
            r = await c.post("/api/complaints/batch", json={"grievances": [grievance("x", "SOCIETAL")]},
                             headers={"X-KYC-Token": "not-a-token"})
            check("forged kyc token rejected", r.status_code == 401, str(r.status_code))
            r = await c.post("/api/complaints/batch", json={"grievances": [grievance("x", "SOCIETAL")]},
                             headers={"X-KYC-Token": ctoken})
            check("session token is not a kyc token", r.status_code == 401, str(r.status_code))

            # ── personal vs societal classification (offline classifier) ─
            r = await c.post("/api/grievance/analyze", json={"text": "Someone broke into my house and stole my phone"})
            check("theft at home -> PERSONAL", r.json()["analyses"][0].get("complaint_nature") == "PERSONAL",
                  r.json()["analyses"][0].get("complaint_nature", ""))
            r = await c.post("/api/grievance/analyze", json={"text": "The road near the market is broken"})
            check("broken road -> SOCIETAL", r.json()["analyses"][0].get("complaint_nature") == "SOCIETAL",
                  r.json()["analyses"][0].get("complaint_nature", ""))

            # anonymous (kyc-token) filings: one personal, one societal
            r = await c.post("/api/complaints/batch",
                             json={"grievances": [grievance("I, Anon Filer, was beaten by my neighbour", "PERSONAL")]},
                             headers={"X-KYC-Token": kyc_token})
            check("kyc-token filing accepted", r.status_code == 200, r.text[:100])
            personal = r.json()["complaints"][0]
            check("owner sees own identity", personal["citizen_name"] == "Anon Filer"
                  and personal["aadhaar_number"] == f"XXXX-XXXX-{last4}", str(personal["aadhaar_number"]))
            check("aadhaar taken from token", personal["aadhaar_verified"] is True)
            r = await c.post("/api/complaints/batch",
                             json={"grievances": [grievance("I, Anon Filer, report a fight on the main road", "SOCIETAL")]},
                             headers={"X-KYC-Token": kyc_token})
            societal = r.json()["complaints"][0]
            r = await c.post("/api/complaints/batch",
                             json={"grievances": [grievance("bogus nature", "SOMETHING")]},
                             headers={"X-KYC-Token": kyc_token})
            check("unknown nature filed as SOCIETAL", r.json()["complaints"][0]["complaint_nature"] == "SOCIETAL")
            check("intake note carries no aadhaar",
                  not any("XXXX" in n for n in societal["official_notes"]), str(societal["official_notes"]))

            # public track page never carries identity
            r = await c.get(f"/api/complaints/track/{personal['tracking_id'].lstrip('#')}")
            pub = r.json()["complaint"]
            check("public track hides identity (personal)",
                  pub["citizen_name"] is None and pub["citizen_mobile"] is None
                  and pub["aadhaar_number"] is None and pub["original_text"] is None)

            # ── official-only listing is protected ──────────────────────
            r = await c.get("/api/complaints")
            check("list requires auth", r.status_code == 401, str(r.status_code))

            r = await c.post("/api/auth/login", json={
                "role": "official", "identifier": "patna.dm@jansunwayi.gov.in", "password": "demo1234"})
            check("official login", r.status_code == 200, r.text[:80])
            otoken = r.json()["token"]
            r = await c.get("/api/complaints", headers={"Authorization": f"Bearer {otoken}"})
            check("official list 200", r.status_code == 200, f"{len(r.json()['complaints'])} rows")
            by_tid = {x["tracking_id"]: x for x in r.json()["complaints"]}
            p_off, s_off = by_tid[personal["tracking_id"]], by_tid[societal["tracking_id"]]
            check("official sees PERSONAL identity",
                  p_off["citizen_name"] == "Anon Filer" and p_off["citizen_mobile"] == "+91 9876543210"
                  and p_off["identity_withheld"] is False)
            check("official sees PERSONAL raw text", bool(p_off["original_text"]))
            check("official denied SOCIETAL identity",
                  s_off["citizen_name"] is None and s_off["citizen_mobile"] is None
                  and s_off["aadhaar_number"] is None and s_off["citizen_id"] is None
                  and s_off["identity_withheld"] is True)
            check("official denied SOCIETAL raw text", s_off["original_text"] is None)
            r = await c.patch(f"/api/complaints/{societal['id']}/status", json={"status": "Under Review"},
                              headers={"Authorization": f"Bearer {otoken}"})
            check("status update keeps SOCIETAL redacted", r.json()["complaint"]["citizen_name"] is None)

            # ── status update ───────────────────────────────────────────
            r = await c.patch(f"/api/complaints/{comp_id}/status",
                              json={"status": "In Progress", "officer_note": "Site inspection ordered."},
                              headers={"Authorization": f"Bearer {otoken}"})
            check("status update", r.status_code == 200, r.text[:80])
            updated = r.json()["complaint"]
            check("status persisted", updated["status"] == "In Progress", updated["status"])
            check("note recorded", any("Site inspection" in n for n in updated["official_notes"]))

            r = await c.patch(f"/api/complaints/{comp_id}/status",
                              json={"status": "Teleported"},
                              headers={"Authorization": f"Bearer {otoken}"})
            check("bogus status rejected", r.status_code == 400)

            # ── auto-escalation job on a genuinely stale complaint ──────
            from datetime import datetime, timedelta, timezone
            from sqlalchemy import select
            from app.db import get_session_factory
            from app.models.complaint import Complaint
            from app.services.escalation_service import escalate_due_complaints

            async with get_session_factory()() as s:
                stale = await s.scalar(select(Complaint).where(Complaint.tracking_id == tracking))
                stale.status = "Submitted"
                stale.created_at = datetime.now(timezone.utc) - timedelta(hours=100)  # 2 rungs
                stale.escalation_index = 0
                await s.commit()

            async with get_session_factory()() as s:
                moved = await escalate_due_complaints(s)
            check("escalation job moved 1", moved == 1, f"moved={moved}")

            r = await c.get(f"/api/complaints/track/{tracking.lstrip('#')}")
            esc = r.json()["complaint"]
            check("escalation_index advanced", esc["escalation_index"] == 2,
                  str(esc["escalation_index"]))
            check("officer reassigned", esc["assigned_officer"] == esc["current_ladder_step"],
                  esc["assigned_officer"])
            check("audit event written", len(esc.get("escalation_events", [])) == 1,
                  str(len(esc.get("escalation_events", []))))
            check("auto note added",
                  any("Auto-escalation" in n for n in esc["official_notes"]))
            check("last_escalated_at set", esc["last_escalated_at"] is not None)

            # idempotent: running again must not double-escalate
            async with get_session_factory()() as s:
                moved2 = await escalate_due_complaints(s)
            check("escalation idempotent", moved2 == 0, f"moved={moved2}")

            # an engaged (non-Submitted) complaint must never escalate
            async with get_session_factory()() as s:
                t = await s.scalar(select(Complaint).where(Complaint.tracking_id == tracking))
                t.status = "In Progress"
                t.created_at = datetime.now(timezone.utc) - timedelta(hours=500)
                await s.commit()
                moved3 = await escalate_due_complaints(s)
            check("engaged complaint frozen", moved3 == 0, f"moved={moved3}")

            # ── admin ───────────────────────────────────────────────────
            r = await c.post("/api/admin/login",
                             json={"email": "admin@jansunwayi.gov.in", "password": "admin12345"})
            check("admin login", r.status_code == 200, r.text[:80])
            atoken = r.json()["token"]
            r = await c.get("/api/admin/status", headers={"Authorization": f"Bearer {atoken}"})
            st = r.json()
            check("admin status", r.status_code == 200)
            check("usage counted", st["usage"]["total"] >= 1, str(st["usage"]))

            # ── CMO Monitor: separate accounts, admin approval ──────────
            AH = {"Authorization": f"Bearer {atoken}"}
            cmo_email = f"cmo.test.{random.randint(1000, 9999)}@example.gov.in"
            r = await c.post("/api/auth/signup", json={"role": "cmo", "name": "Test CMO", "email": cmo_email,
                                                       "password": "cmopass123", "designation": "OSD"})
            check("cmo signup", r.status_code == 200 and r.json()["cmo"]["approved"] is False, r.text[:80])
            cmotok = r.json()["token"]
            CH = {"Authorization": f"Bearer {cmotok}"}
            r = await c.get("/api/cmo/complaints", headers=CH)
            check("unapproved cmo gets no data", r.status_code == 403, str(r.status_code))
            r = await c.get("/api/cmo/complaints", headers={"Authorization": f"Bearer {otoken}"})
            check("official token refused by cmo monitor", r.status_code == 401, str(r.status_code))
            r = await c.get("/api/complaints", headers=CH)
            check("cmo token refused by official dashboard", r.status_code == 401, str(r.status_code))
            r = await c.post("/api/auth/login", json={"role": "cmo", "identifier": "patna.dm@jansunwayi.gov.in",
                                                      "password": "demo1234"})
            check("official credentials don't open cmo login", r.status_code == 401, str(r.status_code))
            r = await c.post("/api/auth/signup", json={"role": "official", "name": "X", "email": "x@y.gov.in",
                                                       "password": "secret123", "role_tier": "cmo"})
            check("official cannot self-assign cmo tier", r.status_code == 400, str(r.status_code))
            r = await c.get("/api/admin/cmo-users", headers=AH)
            uid = next(u["id"] for u in r.json()["users"] if u["email"] == cmo_email)
            r = await c.post(f"/api/admin/cmo-users/{uid}/approve", headers=AH)
            check("admin approves cmo", r.status_code == 200 and r.json()["user"]["approved"] is True)
            r = await c.get("/api/cmo/complaints", headers=CH)
            check("approved cmo sees statewide feed", r.status_code == 200 and len(r.json()["complaints"]) >= 1)
            s_cmo = next(x for x in r.json()["complaints"] if x["tracking_id"] == societal["tracking_id"])
            check("cmo also denied SOCIETAL identity", s_cmo["citizen_name"] is None)
            r = await c.post(f"/api/admin/cmo-users/{uid}/revoke", headers=AH)
            r = await c.get("/api/cmo/complaints", headers=CH)
            check("revoked cmo loses access", r.status_code == 403, str(r.status_code))
            r = await c.get("/api/cmo/complaints", headers={"Authorization": f"Bearer {ctoken}"})
            check("citizen token refused by cmo monitor", r.status_code == 401)
            r = await c.post("/api/auth/login", json={"role": "cmo", "identifier": "cmo@jansunwayi.gov.in",
                                                      "password": "demo1234"})
            check("seeded cmo login", r.status_code == 200 and r.json()["cmo"]["approved"] is True, r.text[:60])

    print("\n" + "=" * 60)
    failed = [r for r in results if r[0] == BAD]
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    for _, name, detail in failed:
        print(f"  FAILED: {name} {detail}")
    return 1 if failed else 0


async def clean() -> int:
    """Remove everything this test creates, leaving the seeded accounts."""
    from sqlalchemy import delete, func, select

    from app.db import dispose_db, get_session_factory
    from app.models.aadhaar_otp import AadhaarOtpChallenge
    from app.models.citizen import Citizen
    from app.models.cmo_user import CmoUser
    from app.models.complaint import Complaint, EscalationEvent

    async with get_session_factory()() as s:
        await s.execute(delete(EscalationEvent))
        await s.execute(delete(Complaint))
        await s.execute(delete(AadhaarOtpChallenge))
        await s.execute(delete(Citizen).where(Citizen.name == "Test Citizen"))
        await s.execute(delete(CmoUser).where(CmoUser.name == "Test CMO"))
        await s.commit()
        remaining = await s.scalar(select(func.count()).select_from(Complaint))
    await dispose_db()
    print(f"[clean] complaints remaining: {remaining}")
    return 0


if __name__ == "__main__":
    if "--clean" in sys.argv:
        sys.exit(asyncio.run(clean()))
    sys.exit(asyncio.run(main()))
