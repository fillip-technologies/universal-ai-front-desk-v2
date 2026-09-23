// Server-backed complaints API. Every grievance lives in PostgreSQL behind
// the FastAPI backend, so any authenticated official/citizen on any device
// sees the same live data. Nothing is stored in the browser.
import { AuthRole, ComplaintNature, GeminiAnalysisResult, GrievanceComplaint, GrievanceFilterState } from '../types';
import { getToken } from './auth';

/** `as` picks which account's session authenticates the call — citizen,
 *  official and CMO Monitor are separate logins. Omit for public endpoints. */
async function apiFetch(pathname: string, init?: RequestInit, as?: AuthRole) {
  const token = as ? getToken(as) : null;
  const res = await fetch(pathname, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({ success: false, errorMsg: 'Server returned an invalid response.' }));
  if (!res.ok || data.success === false) {
    throw new Error(data.errorMsg || data.detail || 'Request failed.');
  }
  return data;
}

/** One analysed grievance as an intake screen submits it. Everything that
 * decides routing and accountability — tracking ID, department sanitising,
 * status, officer, escalation, identity, notes — is set by the server. */
export interface ComplaintDraft {
  /** Self-declared contact details of an anonymous (non-account) filer.
   *  Ignored for a signed-in citizen, whose account details are used. */
  citizen_name?: string;
  citizen_mobile?: string;
  district: string;
  block: string;
  panchayat?: string;
  raw_audio_url?: string;
  original_text?: string;
  photo_url?: string;
  detected_language: string;
  translated_summary: string;
  complaint_nature: ComplaintNature;
  nature_rationale?: string;
  jurisdiction_check?: string;
  jurisdiction_explanation?: string;
  assigned_department: string;
  administrative_tier: string;
  priority_score: number;
  urgency_rationale: string;
  landmark_or_location: string;
  affected_population_estimate: string;
  recommended_action_step: string;
  gps_coordinates?: string;
  offline_fallback?: boolean;
  intake_channel?: 'web' | 'kiosk' | 'mobile';
}

/** Builds the draft for one AI analysis result. */
export function draftFromAnalysis(
  a: GeminiAnalysisResult,
  base: Omit<
    ComplaintDraft,
    | 'detected_language'
    | 'translated_summary'
    | 'complaint_nature'
    | 'nature_rationale'
    | 'jurisdiction_check'
    | 'jurisdiction_explanation'
    | 'assigned_department'
    | 'administrative_tier'
    | 'priority_score'
    | 'urgency_rationale'
    | 'landmark_or_location'
    | 'affected_population_estimate'
    | 'recommended_action_step'
  > & { fallbackLanguage: string; fallbackLocation: string }
): ComplaintDraft {
  const { fallbackLanguage, fallbackLocation, ...rest } = base;
  return {
    ...rest,
    detected_language: a.original_language_detected || fallbackLanguage,
    translated_summary: a.translated_english_summary,
    complaint_nature: a.complaint_nature,
    nature_rationale: a.nature_rationale,
    jurisdiction_check: a.jurisdiction_check || 'LOK_SHIKAYAT',
    jurisdiction_explanation: a.jurisdiction_explanation,
    assigned_department: a.assigned_department,
    administrative_tier: a.administrative_tier,
    priority_score: a.priority_score,
    urgency_rationale: a.urgency_rationale,
    landmark_or_location: a.key_entities?.landmark_or_location || fallbackLocation,
    affected_population_estimate: a.key_entities?.affected_population_estimate || 'Not stated',
    recommended_action_step: a.recommended_action_step
  };
}

/** Thrown when the server refuses a filing for lack of verification (e.g. the
 *  30-minute e-KYC token lapsed) — the caller should re-run the OTP step. */
export class VerificationRequiredError extends Error {}

/** Files one citizen submission — one draft per department the AI found — as
 * one linked ticket each (a single draft becomes a plain standalone ticket).
 * Every filing must be verified: a signed-in citizen's session is used
 * automatically; anyone else passes the `kycToken` from a completed OTP. */
export async function createComplaintBatch(
  grievances: ComplaintDraft[],
  kycToken?: string
): Promise<GrievanceComplaint[]> {
  try {
    const data = await apiFetch('/api/complaints/batch', {
      method: 'POST',
      headers: kycToken ? { 'X-KYC-Token': kycToken } : undefined,
      body: JSON.stringify({ grievances })
    }, 'citizen');
    return data.complaints as GrievanceComplaint[];
  } catch (e: any) {
    if (/verification is required/i.test(e?.message || '')) throw new VerificationRequiredError(e.message);
    throw e;
  }
}

export async function getComplaintByTrackingId(trackingId: string): Promise<GrievanceComplaint | null> {
  try {
    const data = await apiFetch(`/api/complaints/track/${encodeURIComponent(trackingId.trim())}`);
    return data.complaint as GrievanceComplaint;
  } catch {
    return null;
  }
}

/** Logged-in citizen's own grievances, newest first. */
export async function getMyComplaints(): Promise<GrievanceComplaint[]> {
  const data = await apiFetch('/api/complaints/mine', undefined, 'citizen');
  return data.complaints as GrievanceComplaint[];
}

/** Official-only: the full (optionally server-filtered) live feed. */
export async function listComplaints(filters?: Partial<GrievanceFilterState>): Promise<GrievanceComplaint[]> {
  const params = new URLSearchParams();
  if (filters?.department && filters.department !== 'All') params.set('department', filters.department);
  if (filters?.tier && filters.tier !== 'All') params.set('tier', filters.tier);
  if (filters?.status && filters.status !== 'All') params.set('status', filters.status);
  if (filters?.priority && filters.priority !== 'All') params.set('priority', filters.priority);
  if (filters?.district && filters.district !== 'All') params.set('district', filters.district);
  const qs = params.toString();
  const data = await apiFetch(`/api/complaints${qs ? `?${qs}` : ''}`, undefined, 'official');
  return data.complaints as GrievanceComplaint[];
}

/** CMO Monitor only (approved CMO account): the statewide feed. */
export async function listCmoComplaints(): Promise<GrievanceComplaint[]> {
  const data = await apiFetch('/api/cmo/complaints', undefined, 'cmo');
  return data.complaints as GrievanceComplaint[];
}

export async function updateComplaintStatus(
  id: string,
  newStatus: string,
  officerNote?: string
): Promise<GrievanceComplaint> {
  const data = await apiFetch(`/api/complaints/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus, officer_note: officerNote })
  }, 'official');
  return data.complaint as GrievanceComplaint;
}
