// ── Supported languages ──────────────────────────────────────────────────────
// This demo set (Census 2011, speakers within Bihar): Hindi 26.6M, Bhojpuri
// 25.9M, Maithili 13.1M, Magahi 11.3M, Urdu 8.8M. Swap this list per deploying
// state — the rest of the pipeline (ASR, Gemini routing) is language-agnostic.
// Note: Magahi has no dedicated ASR model on Bhashini yet — Hindi ASR is used
// as a graceful-degradation path for Magahi audio.
export type BiharDialect = 'Bhojpuri' | 'Magahi' | 'Maithili' | 'Hindi' | 'Urdu' | 'English';

// ── Departments (state government) ──────────────────────────────────────────
// Kept as string for forward-compatibility with a full state department
// directory. BIHAR_DEPARTMENTS lists the grievance-relevant set used for AI
// routing in this reference deployment — replace per state.
export type BiharDepartment = string;

export const BIHAR_DEPARTMENTS: string[] = [
  'Agriculture',
  'Animal & Fisheries Resources',
  'BC & EBC Welfare',
  'Building Construction',
  'Co-operative',
  'Disaster Management',
  'Education',
  'Energy',
  'Environment, Forest & Climate Change',
  'Food & Consumer Protection',
  'General Administration',
  'Health',
  'Home (Police)',
  'Industries',
  'Labour Resources',
  'Minor Water Resources',
  'Minority Welfare',
  'Panchayati Raj',
  'Public Health Engineering',
  'Revenue & Land Reforms',
  'Road Construction',
  'Rural Development',
  'Rural Works',
  'Social Welfare',
  'SC & ST Welfare',
  'Transport',
  'Urban Development & Housing',
  'Water Resources'
];

// ── Administrative routing tier (where the grievance lands first) ───────────
export type BiharAdminTier =
  | 'Gram Panchayat'
  | 'Block Level (BDO)'
  | 'Sub-Division (SDO)'
  | 'District Level (DM)';

// ── Statutory escalation chain (Right to Public Grievance Redressal) ────────
// PGRO → First Appellate Authority → Second Appellate Authority → Revision.
// Escalation is by CITIZEN APPEAL, not automatic. The 48-hour flag below is an
// INTERNAL administrative early-warning, not a statutory deadline.
export type EscalationLevel =
  | 'PGRO'
  | 'First Appellate Authority'
  | 'Second Appellate Authority'
  | 'Revision Authority';

export const ESCALATION_CHAIN: EscalationLevel[] = [
  'PGRO',
  'First Appellate Authority',
  'Second Appellate Authority',
  'Revision Authority'
];

// ── Department-specific administrative escalation ladders ───────────────────
// Each department has its own chain of command. If the current level takes no
// action within 48 hours, the grievance AUTO-ESCALATES to the next level —
// terminating at DGP HQ / Departmental HQ and the CMO Cell. This is the
// internal executive workflow; the citizen's statutory appeal chain
// (PGRO → Appellate Authorities) runs in parallel and is unaffected.
export const DEPARTMENT_ESCALATION_LADDERS: Record<string, string[]> = {
  'Home (Police)': [
    'Police Station (SHO / Thana In-charge)',
    'DSP (Sub-Divisional Police Officer)',
    'SP (Superintendent of Police, District)',
    'DGP HQ (Police Headquarters, Patna)',
    'CMO Cell'
  ],
  Energy: [
    'JE (Section Office)',
    'SDO (Power Sub-Division)',
    'Executive Engineer (SBPDCL / NBPDCL)',
    'Discom HQ (MD Office)',
    'CMO Cell'
  ],
  Health: [
    'PHC In-charge (MOIC)',
    'Civil Surgeon (District)',
    'Regional Deputy Director (Division)',
    'Health Dept HQ (Patna)',
    'CMO Cell'
  ],
  Education: [
    'Head Master / Block Education Officer',
    'DEO (District Education Officer)',
    'RDDE (Division)',
    'Education Dept HQ (Patna)',
    'CMO Cell'
  ],
  'Public Health Engineering': [
    'JE PHED (Block)',
    'Assistant Engineer (Sub-Division)',
    'Executive Engineer (District)',
    'PHED HQ (Patna)',
    'CMO Cell'
  ],
  'Food & Consumer Protection': [
    'Marketing Officer / Dealer (Block)',
    'SDO (Sub-Division)',
    'DSO (District Supply Officer)',
    'Food Dept HQ (Patna)',
    'CMO Cell'
  ],
  'Revenue & Land Reforms': [
    'CO (Circle Officer)',
    'DCLR (Sub-Division)',
    'ADM / DM (District)',
    'Revenue Dept HQ (Patna)',
    'CMO Cell'
  ],
  'Road Construction': [
    'JE (Block)',
    'Assistant Engineer (Sub-Division)',
    'Executive Engineer (District)',
    'RCD HQ (Patna)',
    'CMO Cell'
  ],
  'Rural Development': [
    'BDO / Rozgar Sevak (Block)',
    'DDC (District)',
    'Divisional Commissioner',
    'RD Dept HQ (Patna)',
    'CMO Cell'
  ],
  'Disaster Management': [
    'CO (Circle Officer)',
    'SDO (Sub-Division)',
    'DM (District Magistrate)',
    'DMD HQ (Patna)',
    'CMO Cell'
  ],
  'Urban Development & Housing': [
    'Ward Officer / EO (Municipal Body)',
    'Municipal Commissioner',
    'UD&H Directorate',
    'UD&H HQ (Patna)',
    'CMO Cell'
  ],
  'Social Welfare': [
    'CDPO (Block)',
    'DPO ICDS (District)',
    'Director ICDS (State)',
    'Social Welfare HQ (Patna)',
    'CMO Cell'
  ]
};

export const DEFAULT_ESCALATION_LADDER: string[] = [
  'Block-level Officer (BDO / CO)',
  'SDO (Sub-Division)',
  'DM (District Magistrate)',
  'Departmental Secretary (HQ, Patna)',
  'CMO Cell'
];

export function getEscalationLadder(dept: string): string[] {
  return DEPARTMENT_ESCALATION_LADDERS[dept] || DEFAULT_ESCALATION_LADDER;
}

// ── Jurisdiction check per the state's grievance-act exclusions ────────────
// Lok Shikayat does NOT cover: service matters of public servants, matters in
// court/tribunal jurisdiction, RTI matters, and services notified under the
// state's Right to Public Services Act (RTPS — certificates, mutation etc.)
export type JurisdictionCheck =
  | 'LOK_SHIKAYAT'
  | 'RTPS_EXCLUDED'
  | 'COURT_EXCLUDED'
  | 'RTI_EXCLUDED'
  | 'SERVICE_MATTER_EXCLUDED';

// ── Personal vs societal ────────────────────────────────────────────────────
// PERSONAL — the complainant or their household is the affected party (fire at
// my home, theft from my house, I was beaten/teased): the handling authority
// sees who filed it so it can reach them.
// SOCIETAL — a public/civic issue the complainant is reporting (broken road,
// water logging, a fight on the street): their identity is withheld from the
// authority. Both kinds require Aadhaar e-KYC; the backend enforces both rules.
export type ComplaintNature = 'PERSONAL' | 'SOCIETAL';

export type GrievanceStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Hearing Scheduled'
  | 'In Progress'
  | 'Resolved'
  | 'Rejected (with reasons)';

export type PriorityScore = 1 | 2 | 3 | 4 | 5;

// Statutory limit: 60 WORKING days for hearing + redressal.
export const STATUTORY_LIMIT_WORKING_DAYS = 60;
// Internal (non-statutory) early-warning: first officer action expected in 48h.
export const INTERNAL_FIRST_RESPONSE_HOURS = 48;

export interface KeyEntities {
  landmark_or_location: string;
  affected_population_estimate: string;
}

export interface GeminiAnalysisResult {
  tracking_id: string;
  original_language_detected: BiharDialect;
  translated_english_summary: string;
  complaint_nature: ComplaintNature;
  nature_rationale?: string;
  jurisdiction_check: JurisdictionCheck;
  jurisdiction_explanation?: string;
  assigned_department: BiharDepartment;
  administrative_tier: BiharAdminTier;
  priority_score: PriorityScore;
  urgency_rationale: string;
  key_entities: KeyEntities;
  recommended_action_step: string;
}

export interface GrievanceComplaint {
  id: string;
  tracking_id: string;
  // Complainant identity. The server nulls these out whenever the reader may
  // not see them: for officials on a SOCIETAL grievance, and always on the
  // public track-by-ID page. `identity_withheld` says which happened.
  /** Links to CitizenAccount.id when filed by a logged-in citizen. */
  citizen_id?: string | null;
  citizen_name?: string | null;
  citizen_mobile?: string | null;
  /** ALWAYS masked (XXXX-XXXX-1234). Full Aadhaar numbers must never be stored
   *  or displayed — Aadhaar Act §29(4). */
  aadhaar_number?: string | null;
  aadhaar_verified?: boolean;
  complaint_nature?: ComplaintNature;
  nature_rationale?: string;
  /** True when this response has the complainant's identity redacted. */
  identity_withheld?: boolean;
  district: string;
  block: string;
  panchayat?: string;
  raw_audio_url?: string;
  /** Null when withheld (societal grievance for officials; always on the public page). */
  original_text?: string | null;
  photo_url?: string;
  detected_language: BiharDialect;
  translated_summary: string;
  jurisdiction_check?: JurisdictionCheck;
  jurisdiction_explanation?: string;
  assigned_department: BiharDepartment;
  administrative_tier: BiharAdminTier;
  /** Current position in the statutory appeal chain. Starts at PGRO. */
  escalation_level?: EscalationLevel;
  /** Authoritative index into the department escalation ladder (0 = first
   *  officer). Advanced only by the backend auto-escalation job and read
   *  as-is — the client never recomputes it. */
  escalation_index?: number;
  /** When the backend last advanced this grievance up the ladder. */
  last_escalated_at?: string | null;
  priority_score: PriorityScore;
  urgency_rationale: string;
  landmark_or_location: string;
  affected_population_estimate: string;
  recommended_action_step: string;
  gps_coordinates: string;
  status: GrievanceStatus;
  assigned_officer?: string;
  official_notes?: string[];
  created_at: string;
  /** Statutory clock — always 60 working days. */
  sla_deadline_days: number;
  /** True once >48h have passed with no officer action (internal flag). */
  attention_flag?: boolean;
  /** True if this analysis came from the offline rule-based fallback engine. */
  offline_fallback?: boolean;
  /** Which channel this grievance was filed through. */
  intake_channel?: 'web' | 'kiosk' | 'mobile';

  // ── Server-computed, read-only ───────────────────────────────────────────
  // Supplied by the backend on every complaint response so the UI displays
  // stored state instead of re-deriving it.
  /** Officer level currently holding the grievance. */
  current_ladder_step?: string;
  /** Position of that officer within `escalation_ladder`. */
  current_ladder_index?: number;
  /** The full ladder for this grievance's department. */
  escalation_ladder?: string[];
  /** Working days left on the statutory 60-working-day clock. */
  working_days_remaining?: number;
  updated_at?: string;
  /** Audit trail of automatic escalations. Present on single-complaint reads. */
  escalation_events?: EscalationEvent[];

  // ── Compound-grievance linkage ──────────────────────────────────────────
  // Set when one citizen submission covered several departments and was filed
  // as one ticket per department. NULL/undefined for an ordinary standalone
  // grievance.
  /** Shared by every ticket that came from the same submission. */
  grievance_group_id?: string | null;
  /** 1-based position within the group. */
  grievance_part_index?: number;
  /** Total tickets in the group. */
  grievance_part_count?: number;
  /** Sibling tickets from the same submission. Only on the track-by-ID read. */
  related?: RelatedGrievance[];
}

/** A sibling ticket from the same compound submission (track-by-ID response). */
export interface RelatedGrievance {
  tracking_id: string;
  assigned_department: BiharDepartment;
  status: GrievanceStatus;
  priority_score: PriorityScore;
  grievance_part_index?: number;
}

/** One automatic advance up the escalation ladder, recorded by the backend. */
export interface EscalationEvent {
  id: string;
  from_index: number;
  to_index: number;
  from_officer: string;
  to_officer: string;
  reason: string;
  hours_inactive: number;
  created_at: string;
}

export interface OfficialUser {
  id: string;
  email: string;
  name: string;
  role_tier:
    | 'citizen'
    | 'panchayat'
    | 'block'
    | 'sub-division'
    | 'district'
    | 'division'
    | 'state';
  department?: BiharDepartment;
  district?: string;
  block?: string;
  designation: string;
  /** True once verified by the Admin Dashboard / departmental HQ. Self-
   *  registered officials start unverified — a real security boundary, not
   *  just cosmetic, since role_tier controls dashboard visibility scope. */
  verified?: boolean;
  self_registered?: boolean;
}

export interface CitizenAccount {
  id: string;
  name: string;
  mobile: string;
  district: string;
  block: string;
  panchayat: string;
  /** Masked only (XXXX-XXXX-1234) — Aadhaar Act §29(4). */
  aadhaar_masked: string;
  aadhaar_verified: boolean;
  created_at: string;
}

/** A Chief Minister's Office monitoring account — a separate login from
 *  officials. Sees no data until an admin approves it. */
export interface CmoUser {
  id: string;
  email: string;
  name: string;
  designation: string;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
}

export type AuthRole = 'citizen' | 'official' | 'cmo';

export interface AuthSession {
  token: string;
  role: AuthRole;
  citizen?: CitizenAccount;
  official?: OfficialUser;
  cmo?: CmoUser;
}

export interface GrievanceFilterState {
  searchQuery: string;
  tier: string;
  department: string;
  status: string;
  priority: string;
  district: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
/** Hours elapsed since creation. */
export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

/**
 * Internal 48h early-warning: unresolved + no officer movement + >48h old.
 *
 * The backend sends `attention_flag` with every complaint; this recomputes the
 * same rule only as a fallback for records that predate that field.
 */
export function needsAttention(c: GrievanceComplaint): boolean {
  if (typeof c.attention_flag === 'boolean') return c.attention_flag;
  if (c.status === 'Resolved' || c.status === 'Rejected (with reasons)') return false;
  return c.status === 'Submitted' && hoursSince(c.created_at) >= INTERNAL_FIRST_RESPONSE_HOURS;
}

/** Working days remaining on the statutory 60-working-day clock. */
export function workingDaysRemaining(c: GrievanceComplaint): number {
  if (typeof c.working_days_remaining === 'number') return c.working_days_remaining;
  const elapsedCalendar = hoursSince(c.created_at) / 24;
  const elapsedWorking = Math.floor(elapsedCalendar * (5 / 7));
  return Math.max(0, STATUTORY_LIMIT_WORKING_DAYS - elapsedWorking);
}

/**
 * Position on the department escalation ladder.
 *
 * This is read straight from the record. The backend's escalation job owns
 * `escalation_index` and writes an `escalation_events` audit row every time it
 * moves — so what the dashboard shows is the grievance's actual recorded
 * position, not a number the browser guessed from a timestamp.
 */
export function currentLadderIndex(c: GrievanceComplaint): number {
  const ladder = c.escalation_ladder ?? getEscalationLadder(c.assigned_department);
  const index = c.current_ladder_index ?? c.escalation_index ?? 0;
  return Math.max(0, Math.min(index, ladder.length - 1));
}

/** Name of the officer level currently holding the grievance. */
export function currentLadderStep(c: GrievanceComplaint): string {
  if (c.current_ladder_step) return c.current_ladder_step;
  const ladder = c.escalation_ladder ?? getEscalationLadder(c.assigned_department);
  return ladder[currentLadderIndex(c)];
}
