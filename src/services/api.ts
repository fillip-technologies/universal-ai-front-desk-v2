import { GeminiAnalysisResult } from '../types';

// The frontend is always served same-origin (FastAPI in prod, the Vite proxy
// in dev), so every request below uses a relative path.
const ADMIN_TOKEN_KEY = 'uafd_admin_token';

export interface AnalyzePayload {
  audioBase64?: string;
  audioMimeType?: string;
  imageBase64?: string;
  imageMimeType?: string;
  text?: string;
  district?: string;
  block?: string;
  panchayat?: string;
  gpsCoordinates?: string;
  dialectHint?: string;
  surface?: string;
}

export interface AnalyzeResponse {
  /** One entry per distinct grievance. A plain report has exactly one; a
   *  compound report ("tree on road 2 AND water logging on road 3") has one
   *  per department, and each becomes its own linked ticket. */
  analyses: GeminiAnalysisResult[];
  /** True when the result came from a rule-based fallback (server-side)
   *  instead of the live AI engine. The UI MUST surface this — never present
   *  fallback output as live AI analysis. */
  isOfflineFallback: boolean;
}

export async function analyzeGrievanceWithAI(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  const response = await fetch('/api/grievance/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ surface: 'web', ...payload })
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.success) {
    const analyses: GeminiAnalysisResult[] =
      Array.isArray(data.analyses) && data.analyses.length
        ? data.analyses
        : data.analysis
        ? [data.analysis]
        : [];
    if (analyses.length) {
      return {
        analyses: analyses as GeminiAnalysisResult[],
        isOfflineFallback: Boolean(data.isFallback)
      };
    }
  }

  throw new Error(data.errorMsg || 'Failed to analyze grievance');
}

// ── Admin API (JWT-authenticated — real admin account, not a shared passcode)
export interface AdminStatus {
  success: boolean;
  keyConfigured: boolean;
  keySource: 'admin-dashboard' | 'environment' | null;
  keyMasked: string | null;
  keyUpdatedAt: string | null;
  model: string;
  usage: {
    total: number;
    live: number;
    fallback: number;
    bySurface: Record<string, number>;
    lastRequestAt?: string;
  };
  serverTime: string;
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAdminToken(token: string) {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {}
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
}

async function adminFetch(pathname: string, init?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(pathname, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({ success: false, errorMsg: 'Server returned an invalid response.' }));
  if (res.status === 401) {
    clearAdminToken();
    throw new Error(data.errorMsg || data.detail || 'Admin session expired — please log in again.');
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.errorMsg || data.detail || 'Request failed.');
  }
  return data;
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const data = await adminFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setAdminToken(data.token);
}

export function isAdminLoggedIn(): boolean {
  return Boolean(getAdminToken());
}

export function getAdminStatus(): Promise<AdminStatus> {
  return adminFetch('/api/admin/status');
}

export function setAdminKey(key: string) {
  return adminFetch('/api/admin/key', { method: 'POST', body: JSON.stringify({ key }) });
}

export function removeAdminKey() {
  return adminFetch('/api/admin/key', { method: 'DELETE' });
}

export function testAdminKey() {
  return adminFetch('/api/admin/test-key', { method: 'POST' });
}

// ── CMO Monitor account approval ────────────────────────────────────────────
export interface CmoAccount {
  id: string;
  email: string;
  name: string;
  designation: string;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
}

export async function listCmoAccounts(): Promise<CmoAccount[]> {
  const data = await adminFetch('/api/admin/cmo-users');
  return data.users as CmoAccount[];
}

export function setCmoApproval(id: string, approve: boolean) {
  return adminFetch(`/api/admin/cmo-users/${id}/${approve ? 'approve' : 'revoke'}`, { method: 'POST' });
}
