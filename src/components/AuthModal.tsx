import React, { useState } from 'react';
import { X, ShieldCheck, UserCircle2, Fingerprint, Loader2, Landmark } from 'lucide-react';
import { AuthRole, AuthSession, OfficialUser, BIHAR_DEPARTMENTS } from '../types';
import { BIHAR_DISTRICTS, BIHAR_DISTRICT_NAMES } from '../data/biharData';
import { signupCitizen, signupOfficial, signupCmo, login } from '../services/auth';
import { requestAadhaarOtp, verifyAadhaarOtp } from '../services/kyc';
import { StoryPhoto } from './jansunwayi-ui';
import { STORY_IMAGES } from '../data/storyImages';

interface AuthModalProps {
  initialRole?: AuthRole;
  /** When true, the modal is fixed to `initialRole` and never offers a switch
   *  to the other role — used when it's opened from a surface that only
   *  makes sense for one kind of account (e.g. the Citizen Portal must never
   *  present an officer sign-in). */
  lockRole?: boolean;
  onClose: () => void;
  onAuthSuccess: (session: AuthSession) => void;
}

type Mode = 'login' | 'signup';

export const AuthModal: React.FC<AuthModalProps> = ({
  initialRole = 'citizen',
  lockRole = false,
  onClose,
  onAuthSuccess
}) => {
  const [role, setRole] = useState<AuthRole>(initialRole);
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Shared / login fields
  const [identifier, setIdentifier] = useState(''); // mobile (citizen) or email (official)
  const [password, setPassword] = useState('');

  // Citizen signup fields
  const [czName, setCzName] = useState('');
  const [czMobile, setCzMobile] = useState('');
  const [czDistrict, setCzDistrict] = useState('Patna');
  const [czBlock, setCzBlock] = useState('Maner');
  const [czPanchayat, setCzPanchayat] = useState('');
  // Set only by a successful server-side OTP verification — never typed.
  const [czAadhaarLast4, setCzAadhaarLast4] = useState('');
  // Signed proof of that verification; the server rejects signup without it.
  const [czKycToken, setCzKycToken] = useState('');
  // The OTP is bound to the mobile it was verified on.
  const [czKycMobile, setCzKycMobile] = useState('');

  // Aadhaar e-KYC challenge state
  const [kycAadhaar, setKycAadhaar] = useState('');
  const [kycChallengeId, setKycChallengeId] = useState('');
  const [kycOtp, setKycOtp] = useState('');
  const [kycSandboxOtp, setKycSandboxOtp] = useState('');
  const [kycBusy, setKycBusy] = useState(false);
  const [kycError, setKycError] = useState('');

  const handleRequestKycOtp = async () => {
    setKycBusy(true);
    setKycError('');
    try {
      const challenge = await requestAadhaarOtp(kycAadhaar, czMobile);
      setKycChallengeId(challenge.challengeId);
      setKycSandboxOtp(challenge.sandboxOtp || '');
      setKycOtp('');
    } catch (e: any) {
      setKycError(e?.message || 'Could not send the OTP.');
    } finally {
      setKycBusy(false);
    }
  };

  const handleVerifyKycOtp = async () => {
    setKycBusy(true);
    setKycError('');
    try {
      const result = await verifyAadhaarOtp(kycChallengeId, kycOtp);
      setCzAadhaarLast4(result.aadhaarLast4);
      setCzKycToken(result.kycToken);
      setCzKycMobile(czMobile.replace(/\D/g, '').slice(-10));
      setKycChallengeId('');
      setKycSandboxOtp('');
      setKycOtp('');
    } catch (e: any) {
      setKycError(e?.message || 'Verification failed.');
    } finally {
      setKycBusy(false);
    }
  };

  // CMO Monitor signup fields (a separate account type from officials)
  const [cmName, setCmName] = useState('');
  const [cmEmail, setCmEmail] = useState('');
  const [cmDesignation, setCmDesignation] = useState('');

  const handleCmoSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await signupCmo({ name: cmName, email: cmEmail, password, designation: cmDesignation });
      onAuthSuccess(session);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Sign up failed.');
    } finally {
      setBusy(false);
    }
  };

  // Official signup fields
  const [ofName, setOfName] = useState('');
  const [ofEmail, setOfEmail] = useState('');
  const [ofRoleTier, setOfRoleTier] = useState<OfficialUser['role_tier']>('block');
  const [ofDepartment, setOfDepartment] = useState(BIHAR_DEPARTMENTS[0]);
  const [ofDistrict, setOfDistrict] = useState('Patna');
  const [ofDesignation, setOfDesignation] = useState('');

  const switchRole = (r: AuthRole) => {
    setRole(r);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await login(role, identifier, password);
      onAuthSuccess(session);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCitizenSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!czAadhaarLast4 || !czKycToken) {
      setError('Complete Aadhaar e-KYC verification before creating your account.');
      return;
    }
    if (czMobile.replace(/\D/g, '').slice(-10) !== czKycMobile) {
      setError('The mobile number changed after Aadhaar verification — verify again on this number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const session = await signupCitizen({
        name: czName,
        mobile: czMobile,
        password,
        district: czDistrict,
        block: czBlock,
        panchayat: czPanchayat || 'Ward 1',
        kycToken: czKycToken
      });
      onAuthSuccess(session);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Sign up failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleOfficialSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await signupOfficial({
        name: ofName,
        email: ofEmail,
        password,
        role_tier: ofRoleTier,
        department: ofDepartment,
        district: ofDistrict,
        designation: ofDesignation
      });
      onAuthSuccess(session);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Sign up failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="card-elevated max-w-md w-full rounded-2xl text-slate-900 shadow-2xl overflow-hidden my-4 sm:my-8 max-h-[95vh] flex flex-col animate-in fade-in duration-200">
        {/* Header — the one dark band, so the card reads as government-issued
            without darkening the form itself. */}
        <div className="relative isolate overflow-hidden text-white px-5 pt-16 pb-4 flex items-end justify-between gap-3 shrink-0">
          <StoryPhoto
            image={role === 'citizen' ? STORY_IMAGES.voiceHandpump : role === 'cmo' ? STORY_IMAGES.handsRaised : STORY_IMAGES.waitingOffice}
            eager
            className="absolute inset-0 -z-20"
          />
          <div className="photo-scrim-bottom absolute inset-0 -z-10" aria-hidden />
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 text-amber-300 flex items-center justify-center shrink-0">
              {role === 'citizen' ? (
                <UserCircle2 className="w-5 h-5" />
              ) : role === 'cmo' ? (
                <Landmark className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-tight">
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </h3>
              <p className="text-[11px] text-blue-200/80 leading-tight truncate">
                JanSunwayi AI — State Lok Shikayat Portal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role + mode selection */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-200 shrink-0 space-y-3">
          {lockRole ? (
            <div
              className={`flex items-center justify-center gap-2 min-h-9.5 rounded-lg text-xs font-bold ${
                role === 'citizen' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-900'
              }`}
            >
              {role === 'citizen' ? (
                <UserCircle2 className="w-3.5 h-3.5" />
              ) : role === 'cmo' ? (
                <Landmark className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              <span>
                {role === 'citizen'
                  ? 'Citizen Account (नागरिक)'
                  : role === 'cmo'
                  ? "CMO Monitor Account (Chief Minister's Office)"
                  : 'Government Official Account'}
              </span>
            </div>
          ) : (
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => switchRole('citizen')}
                className={`flex-1 min-h-9.5 rounded-md text-xs font-bold transition-all ${
                  role === 'citizen'
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Citizen (नागरिक)
              </button>
              <button
                onClick={() => switchRole('official')}
                className={`flex-1 min-h-9.5 rounded-md text-xs font-bold transition-all ${
                  role === 'official'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Government Official
              </button>
            </div>
          )}
          <div className="flex items-center justify-center gap-6 text-xs font-bold">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`pb-1 border-b-2 transition-colors ${
                mode === 'login'
                  ? 'text-slate-900 border-amber-500'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`pb-1 border-b-2 transition-colors ${
                mode === 'signup'
                  ? 'text-slate-900 border-amber-500'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  {role === 'citizen' ? 'Mobile Number' : role === 'cmo' ? 'CMO Email' : 'Official Email'}
                </label>
                <input
                  type={role === 'citizen' ? 'tel' : 'email'}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={role === 'citizen' ? '98350 12345' : 'name@state.gov.in'}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 min-h-12 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Log In</span>
              </button>
            </form>
          )}

          {/* CITIZEN SIGNUP FORM */}
          {mode === 'signup' && role === 'citizen' && (
            <form onSubmit={handleCitizenSignup} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Full Name</label>
                <input
                  required
                  value={czName}
                  onChange={(e) => setCzName(e.target.value)}
                  placeholder="e.g. Ramprasad Yadav"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Mobile Number</label>
                <input
                  type="tel"
                  required
                  value={czMobile}
                  onChange={(e) => setCzMobile(e.target.value)}
                  placeholder="98350 12345"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">District</label>
                  <select
                    value={czDistrict}
                    onChange={(e) => {
                      setCzDistrict(e.target.value);
                      setCzBlock(BIHAR_DISTRICTS[e.target.value]?.[0] || '');
                    }}
                    className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition"
                  >
                    {BIHAR_DISTRICT_NAMES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Block</label>
                  <select
                    value={czBlock}
                    onChange={(e) => setCzBlock(e.target.value)}
                    className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition"
                  >
                    {(BIHAR_DISTRICTS[czDistrict] || []).map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Gram Panchayat / Ward</label>
                <input
                  value={czPanchayat}
                  onChange={(e) => setCzPanchayat(e.target.value)}
                  placeholder="e.g. Rampur Diara"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition"
                />
              </div>
              {/* Aadhaar e-KYC — the last-4 fragment can only be obtained by
                  completing the server's OTP challenge, so it cannot be typed
                  in by hand. */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <label className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
                  <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Aadhaar e-KYC Verification</span>
                </label>

                {czAadhaarLast4 ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span className="font-mono font-bold text-emerald-700">
                        XXXX-XXXX-{czAadhaarLast4}
                      </span>
                      <span className="text-slate-500">verified</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCzAadhaarLast4('');
                        setCzKycToken('');
                        setKycAadhaar('');
                        setKycChallengeId('');
                        setKycOtp('');
                        setKycSandboxOtp('');
                        setKycError('');
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                    >
                      Change
                    </button>
                  </div>
                ) : !kycChallengeId ? (
                  <div className="space-y-2">
                    <input
                      inputMode="numeric"
                      maxLength={14}
                      value={kycAadhaar}
                      onChange={(e) => {
                        setKycAadhaar(e.target.value);
                        setKycError('');
                      }}
                      placeholder="12-digit Aadhaar number"
                      className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 outline-none transition"
                    />
                    <button
                      type="button"
                      disabled={kycBusy || !czMobile.trim()}
                      onClick={handleRequestKycOtp}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center space-x-2 transition-colors"
                    >
                      {kycBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{kycBusy ? 'Sending OTP…' : 'Send OTP'}</span>
                    </button>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Enter your mobile number above first — the OTP goes to it. Your Aadhaar number
                      is checksum-validated then discarded; only the last 4 digits are stored.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {kycSandboxOtp && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-center">
                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-700">
                          Sandbox — no SMS provider configured
                        </p>
                        <p className="font-mono text-lg font-black tracking-[0.25em] text-amber-900">
                          {kycSandboxOtp}
                        </p>
                      </div>
                    )}
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={kycOtp}
                      onChange={(e) => {
                        setKycOtp(e.target.value);
                        setKycError('');
                      }}
                      placeholder="6-digit OTP"
                      className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-center text-sm font-mono tracking-widest text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 outline-none transition"
                    />
                    <button
                      type="button"
                      disabled={kycBusy}
                      onClick={handleVerifyKycOtp}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center space-x-2 transition-colors"
                    >
                      {kycBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{kycBusy ? 'Verifying…' : 'Verify OTP'}</span>
                    </button>
                  </div>
                )}

                {kycError && <p className="text-[11px] text-rose-600 font-semibold">{kycError}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Create Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition"
                />
              </div>
              {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 min-h-12 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Create Citizen Account</span>
              </button>
            </form>
          )}

          {/* CMO MONITOR SIGNUP FORM — separate account type, admin-approved */}
          {mode === 'signup' && role === 'cmo' && (
            <form onSubmit={handleCmoSignup} className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed">
                The CMO Monitor shows statewide grievance data. New accounts can sign in straight away but
                see <span className="font-bold">no data until the system administrator approves them</span>.
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Full Name</label>
                <input
                  required
                  value={cmName}
                  onChange={(e) => setCmName(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Official Email</label>
                <input
                  type="email"
                  required
                  value={cmEmail}
                  onChange={(e) => setCmEmail(e.target.value)}
                  placeholder="name@cmo.state.gov.in"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Designation</label>
                <input
                  required
                  value={cmDesignation}
                  onChange={(e) => setCmDesignation(e.target.value)}
                  placeholder="e.g. OSD, CMO Grievance Cell"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Create Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 min-h-12 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Request CMO Monitor Access</span>
              </button>
            </form>
          )}

          {/* OFFICIAL SIGNUP FORM */}
          {mode === 'signup' && role === 'official' && (
            <form onSubmit={handleOfficialSignup} className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed">
                Accounts with an official <span className="font-mono">.gov.in</span> / <span className="font-mono">.nic.in</span> email
                are auto-verified. Other emails create a <span className="font-bold">self-registered, pending-verification</span> account
                — a real security boundary, visible on the dashboard until HQ approves it.
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Full Name</label>
                <input
                  required
                  value={ofName}
                  onChange={(e) => setOfName(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Official Email</label>
                <input
                  type="email"
                  required
                  value={ofEmail}
                  onChange={(e) => setOfEmail(e.target.value)}
                  placeholder="name@state.gov.in"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Administrative Tier</label>
                  <select
                    value={ofRoleTier}
                    onChange={(e) => setOfRoleTier(e.target.value as OfficialUser['role_tier'])}
                    className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                  >
                    <option value="panchayat">Gram Panchayat</option>
                    <option value="block">Block (BDO)</option>
                    <option value="sub-division">Sub-Division (SDO)</option>
                    <option value="district">District (DM)</option>
                    <option value="division">Division (Commissioner)</option>
                    <option value="state">State HQ</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">District</label>
                  <select
                    value={ofDistrict}
                    onChange={(e) => setOfDistrict(e.target.value)}
                    className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                  >
                    {BIHAR_DISTRICT_NAMES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Department</label>
                <select
                  value={ofDepartment}
                  onChange={(e) => setOfDepartment(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                >
                  {BIHAR_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Designation</label>
                <input
                  required
                  value={ofDesignation}
                  onChange={(e) => setOfDesignation(e.target.value)}
                  placeholder="e.g. Block Development Officer, Maner"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Create Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                />
              </div>
              {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 min-h-12 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Register Official Account</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
