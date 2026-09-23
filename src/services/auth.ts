import { AuthRole, AuthSession, CitizenAccount, CmoUser, OfficialUser } from '../types';

// One stored session per account type. Citizen, official and CMO Monitor are
// separate logins: signing in to one never signs you in (or out) of another.
const TOKEN_KEYS: Record<AuthRole, string> = {
  citizen: 'jansunwayi_citizen_token',
  official: 'jansunwayi_official_token',
  cmo: 'jansunwayi_cmo_token'
};

export function getToken(role: AuthRole): string | null {
  try {
    return localStorage.getItem(TOKEN_KEYS[role]);
  } catch {
    return null;
  }
}

function setToken(role: AuthRole, token: string) {
  try {
    localStorage.setItem(TOKEN_KEYS[role], token);
  } catch {}
}

function clearToken(role: AuthRole) {
  try {
    localStorage.removeItem(TOKEN_KEYS[role]);
  } catch {}
}

async function authFetch(pathname: string, init?: RequestInit, role?: AuthRole) {
  const token = role ? getToken(role) : null;
  const res = await fetch(pathname, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({ success: false, errorMsg: 'Server returned an invalid response.' }));
  if (!res.ok || !data.success) {
    throw new Error(data.errorMsg || data.detail || 'Request failed.');
  }
  return data;
}

function toSession(role: AuthRole, token: string, data: any): AuthSession {
  if (role === 'citizen') return { token, role, citizen: data.citizen as CitizenAccount };
  if (role === 'cmo') return { token, role, cmo: data.cmo as CmoUser };
  return { token, role, official: data.official as OfficialUser };
}

export interface CitizenSignupInput {
  name: string;
  mobile: string;
  password: string;
  district: string;
  block: string;
  panchayat: string;
  /** From verifyAadhaarOtp() — must be verified on this same mobile. */
  kycToken: string;
}

export interface OfficialSignupInput {
  name: string;
  email: string;
  password: string;
  role_tier: OfficialUser['role_tier'];
  department: string;
  district: string;
  block?: string;
  designation: string;
}

export interface CmoSignupInput {
  name: string;
  email: string;
  password: string;
  designation: string;
}

async function signup(role: AuthRole, input: object): Promise<AuthSession> {
  const data = await authFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ role, ...input })
  });
  setToken(role, data.token);
  return toSession(role, data.token, data);
}

export const signupCitizen = (input: CitizenSignupInput) => signup('citizen', input);
export const signupOfficial = (input: OfficialSignupInput) => signup('official', input);
/** Creates a CMO Monitor account awaiting admin approval. */
export const signupCmo = (input: CmoSignupInput) => signup('cmo', input);

export async function login(role: AuthRole, identifier: string, password: string): Promise<AuthSession> {
  const data = await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, identifier, password })
  });
  setToken(role, data.token);
  return toSession(role, data.token, data);
}

export async function logout(role: AuthRole): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' }, role);
  } catch {
    // ignore network errors on logout — clear local session regardless
  } finally {
    clearToken(role);
  }
}

async function restoreOne(role: AuthRole): Promise<AuthSession | null> {
  const token = getToken(role);
  if (!token) return null;
  try {
    const data = await authFetch('/api/auth/me', undefined, role);
    if (data.role !== role) throw new Error('role mismatch');
    return toSession(role, token, data);
  } catch {
    clearToken(role);
    return null;
  }
}

export type Sessions = Partial<Record<AuthRole, AuthSession>>;

/** Restores every stored session (each account type independently). */
export async function restoreSessions(): Promise<Sessions> {
  // Sessions from before the split were stored under one shared key.
  try {
    localStorage.removeItem('uafd_session_token');
  } catch {}
  const roles: AuthRole[] = ['citizen', 'official', 'cmo'];
  const found = await Promise.all(roles.map(restoreOne));
  const out: Sessions = {};
  roles.forEach((r, i) => {
    if (found[i]) out[r] = found[i]!;
  });
  return out;
}
