import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Server,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Activity,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Landmark
} from 'lucide-react';
import {
  AdminStatus,
  getAdminStatus,
  setAdminKey,
  removeAdminKey,
  testAdminKey,
  adminLogin,
  isAdminLoggedIn,
  clearAdminToken,
  CmoAccount,
  listCmoAccounts,
  setCmoApproval
} from '../services/api';
import { PhotoBanner, PhotoGate } from './jansunwayi-ui';
import { STORY_IMAGES } from '../data/storyImages';

/**
 * Admin Dashboard — central administration of the AI engine.
 * One Gemini API key is stored server-side and powers every surface:
 * the Web portal and walk-up Kiosks. Gated by a real admin account
 * (email + password, JWT) rather than a shared passcode.
 */
export const AdminDashboard: React.FC = () => {
  // Auth gate
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authed, setAuthed] = useState(isAdminLoggedIn());
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Status & key management
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // CMO Monitor accounts — self-registered, see no data until approved here.
  const [cmoAccounts, setCmoAccounts] = useState<CmoAccount[]>([]);
  const [cmoBusyId, setCmoBusyId] = useState('');

  const toggleCmo = async (acct: CmoAccount) => {
    setCmoBusyId(acct.id);
    try {
      await setCmoApproval(acct.id, !acct.approved);
      setCmoAccounts(await listCmoAccounts());
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Could not update the CMO account.' });
    } finally {
      setCmoBusyId('');
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const s = await getAdminStatus();
      setStatus(s);
      setCmoAccounts(await listCmoAccounts());
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Failed to load status.' });
      if (/session expired/i.test(e?.message || '')) setAuthed(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoggingIn(true);
    try {
      await adminLogin(adminEmail, adminPassword);
      setAuthed(true);
      setAdminPassword('');
      await refresh();
    } catch (err: any) {
      setAuthError(err?.message || 'Login failed — check your email/password and that the API server is reachable.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setAuthed(false);
    setStatus(null);
  };

  // Fetch on login, then auto-refresh stats every 15s while authed
  useEffect(() => {
    if (!authed) return;
    refresh();
    const t = setInterval(() => refresh(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const handleSaveKey = async () => {
    setMessage(null);
    setTestResult(null);
    try {
      const r = await setAdminKey(keyInput);
      if (r.success) {
        setMessage({ kind: 'ok', text: `API key saved (${r.keyMasked}). All surfaces are now powered by this key.` });
        setKeyInput('');
        refresh();
      } else {
        setMessage({ kind: 'err', text: r.errorMsg || 'Failed to save key.' });
      }
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message || 'Failed to save key.' });
    }
  };

  const handleRemoveKey = async () => {
    if (!window.confirm('Remove the admin-managed API key? Surfaces fall back to offline rule-based routing (or an environment key if present).')) return;
    const r = await removeAdminKey();
    setMessage({
      kind: 'ok',
      text: r.keyConfigured
        ? 'Admin key removed — an environment key is still active.'
        : 'Admin key removed — system now in offline fallback mode.'
    });
    setTestResult(null);
    refresh();
  };

  const handleTestKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testAdminKey();
      setTestResult(
        r.success
          ? { ok: true, text: `Live ✓ — Gemini responded: "${r.modelReply}"` }
          : { ok: false, text: r.errorMsg || 'Key test failed.' }
      );
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || 'Key test failed.' });
    } finally {
      setTesting(false);
    }
  };

  // ── Login gate ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <PhotoGate
        image={STORY_IMAGES.afterKiosk}
        captionHindi="एक इंजन, हर कियोस्क, हर गाँव।"
        caption="One engine behind every portal and every kiosk."
      >
        <div className="space-y-6 text-left">
          <div className="text-center md:text-left space-y-2">
            <div className="w-16 h-16 mx-auto md:mx-0 rounded-2xl brand-gradient text-amber-400 flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900">System Administration</h2>
            <p className="text-xs text-slate-500">
              Central control of the AI engine key powering the Web portal and Kiosk applications.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@jansunwayi.gov.in"
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:ring-2 focus:ring-(--brand-700) outline-none"
            />
            <input
              type="password"
              required
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full rounded-xl border border-slate-300 p-3 text-sm font-mono focus:ring-2 focus:ring-(--brand-700) outline-none"
            />
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full min-h-12 rounded-xl bg-(--brand-900) hover:bg-(--brand-800) text-white font-bold text-sm transition-colors disabled:opacity-60"
            >
              {loggingIn ? 'Signing in…' : 'Sign In to Admin Dashboard'}
            </button>
            {authError && <p className="text-xs text-rose-600 font-semibold">{authError}</p>}
            <p className="text-[10px] text-slate-400 text-center">
              Bootstrap admin credentials are set via ADMIN_EMAIL / ADMIN_PASSWORD on the backend — change the
              password immediately after first login.
            </p>
          </form>
        </div>
      </PhotoGate>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const usage = status?.usage;
  const surfaces = [
    {
      id: 'web',
      icon: Monitor,
      name: 'Web Portal',
      desc: 'Citizen portal, Official dashboard, CMO monitor — served by this API server.',
      count: usage?.bySurface?.web || 0,
      active: true
    },
    {
      id: 'kiosk',
      icon: MonitorSmartphone,
      name: 'Kiosk (Common Service Centre)',
      desc: 'Walk-up kiosk mode — same engine, operator-assisted verification.',
      count: usage?.bySurface?.kiosk || 0,
      active: Boolean(usage?.bySurface?.kiosk)
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Banner */}
      <PhotoBanner image={STORY_IMAGES.afterKiosk}>
        <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase tracking-wider mono">
              SYSTEM ADMINISTRATION
            </span>
            <span className="text-xs text-blue-200/90 mono">One key • Every surface</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-bold text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/15"
          >
            Log Out
          </button>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">AI Engine Administration</h2>
        <p className="text-xs text-blue-100/80">
          Manage the central Gemini API key and monitor every application it powers — the Web portal and Kiosks.
        </p>
        </div>
      </PhotoBanner>

      {message && (
        <div
          className={`rounded-2xl p-4 text-xs font-semibold border ${
            message.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── API Key management ── */}
        <div className="card-elevated p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-(--brand-700)" />
              <span>Gemini API Key (Central)</span>
            </h3>
            <button
              onClick={() => refresh()}
              className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Current key status */}
          <div
            className={`rounded-2xl p-4 border-2 ${
              status?.keyConfigured
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-amber-50 border-dashed border-amber-400'
            }`}
          >
            <div className="flex items-center space-x-3">
              {status?.keyConfigured ? (
                <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">
                  {status?.keyConfigured ? 'Live AI Engine Active' : 'No API Key — Offline Fallback Mode'}
                </p>
                <p className="text-xs text-slate-600 font-mono truncate">
                  {status?.keyConfigured
                    ? `${status.keyMasked} • source: ${status.keySource} • model: ${status.model}`
                    : 'All surfaces are using rule-based keyword routing only. Voice notes cannot be transcribed.'}
                </p>
              </div>
            </div>
            {status?.keyConfigured && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleTestKey}
                  disabled={testing}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                  <span>Test Key Live</span>
                </button>
                {status.keySource === 'admin-dashboard' && (
                  <button
                    onClick={handleRemoveKey}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Key</span>
                  </button>
                )}
              </div>
            )}
            {testResult && (
              <p
                className={`mt-3 text-xs font-bold flex items-center space-x-1.5 ${
                  testResult.ok ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{testResult.text}</span>
              </p>
            )}
          </div>

          {/* Set / update key */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {status?.keyConfigured ? 'Update API Key' : 'Add API Key'}
            </label>
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Paste Gemini API key (aistudio.google.com/apikey)"
                  className="w-full rounded-xl border border-slate-300 p-3 pr-10 text-xs font-mono focus:ring-2 focus:ring-blue-600 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-700"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={keyInput.trim().length < 20}
                className="px-4 rounded-xl bg-(--brand-900) hover:bg-(--brand-800) text-white text-xs font-bold disabled:opacity-40"
              >
                Save
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Stored server-side only (never in the browser or APK). The key immediately powers ALL connected
              applications — no rebuild or restart needed.
            </p>
          </div>
        </div>

        {/* ── Usage & engine stats ── */}
        <div className="card-elevated p-6 space-y-5">
          <h3 className="text-sm font-black text-slate-800 flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>AI Engine Usage</span>
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <p className="text-2xl font-black text-slate-800 mono">{usage?.total ?? 0}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Total Requests</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
              <p className="text-2xl font-black text-emerald-700 mono">{usage?.live ?? 0}</p>
              <p className="text-[10px] font-bold text-emerald-700 uppercase">Live AI</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
              <p className="text-2xl font-black text-amber-700 mono">{usage?.fallback ?? 0}</p>
              <p className="text-[10px] font-bold text-amber-700 uppercase">Offline Fallback</p>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 space-y-1">
            <p>
              <span className="font-bold">Last request:</span>{' '}
              {usage?.lastRequestAt ? new Date(usage.lastRequestAt).toLocaleString('en-IN') : '—'}
            </p>
            <p>
              <span className="font-bold">Model:</span> {status?.model}
            </p>
          </div>
        </div>
      </div>

      {/* ── CMO Monitor access ── */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-2">
          <Landmark className="w-4 h-4 text-(--brand-800)" />
          <h3 className="font-semibold text-slate-800 text-sm">CMO Monitor Accounts</h3>
          <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase mono">
            {cmoAccounts.filter((a) => !a.approved).length} pending
          </span>
        </div>
        {cmoAccounts.length === 0 ? (
          <p className="p-5 text-xs text-slate-500">No CMO Monitor accounts have been registered yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cmoAccounts.map((a) => (
              <li key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {a.name}{' '}
                    <span
                      className={`ml-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                        a.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {a.approved ? 'APPROVED' : 'PENDING'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {a.email} • {a.designation || '—'} • registered {new Date(a.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <button
                  onClick={() => toggleCmo(a)}
                  disabled={cmoBusyId === a.id}
                  className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 disabled:opacity-50 ${
                    a.approved
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {a.approved ? 'Revoke access' : 'Approve'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Connected applications ── */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-2">
          <Server className="w-4 h-4 text-(--brand-800)" />
          <h3 className="font-semibold text-slate-800 text-sm">Applications Powered by This Key</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {surfaces.map((s) => (
            <div key={s.id} className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <s.icon className="w-5 h-5 text-(--brand-800)" />
                  <p className="text-sm font-black text-slate-800">{s.name}</p>
                </div>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.active ? '● CONNECTED' : '○ NO TRAFFIC YET'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</p>
              <p className="text-xs font-bold text-slate-700 mono">{s.count} requests</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
