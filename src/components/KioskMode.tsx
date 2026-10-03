import React, { useRef, useState } from 'react';
import {
  Mic,
  Square,
  Landmark,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  X,
  Volume2,
  ShieldCheck,
  AlertTriangle,
  Fingerprint
} from 'lucide-react';
import { BiharDialect, GrievanceComplaint } from '../types';
import { analyzeGrievanceWithAI } from '../services/api';
import { createComplaintBatch, draftFromAnalysis, VerificationRequiredError } from '../services/complaints';
import { requestAadhaarOtp, verifyAadhaarOtp } from '../services/kyc';
import { NatureNotice } from './NatureBadge';
import { StoryPhoto } from './jansunwayi-ui';
import { STORY_IMAGES } from '../data/storyImages';

interface KioskModeProps {
  onExit: () => void;
}

type KioskStep = 'language' | 'verify' | 'record' | 'processing' | 'done';

const KIOSK_LANGS: { code: BiharDialect; native: string; sub: string }[] = [
  { code: 'Hindi', native: 'हिन्दी', sub: 'Hindi' },
  { code: 'Bhojpuri', native: 'भोजपुरी', sub: 'Bhojpuri' },
  { code: 'Magahi', native: 'मगही', sub: 'Magahi' },
  { code: 'Maithili', native: 'मैथिली', sub: 'Maithili' },
  { code: 'Urdu', native: 'اردو', sub: 'Urdu' },
  { code: 'English', native: 'English', sub: 'English' }
];

/**
 * Kiosk Mode — walk-up voice-first interface for Common Service Centres and
 * block-office kiosks. Designed for citizens without smartphones: giant touch
 * targets, minimal text, voice in any supported regional language, printed slip at the end.
 * Every grievance — personal or societal — needs Aadhaar e-KYC, so after
 * choosing a language the citizen (helped by the operator) verifies with an
 * OTP on their own mobile before recording. Whether the handling officer sees
 * who filed it is decided per grievance by its personal/societal nature.
 */
export const KioskMode: React.FC<KioskModeProps> = ({ onExit }) => {
  const [step, setStep] = useState<KioskStep>('language');
  const [lang, setLang] = useState<BiharDialect>('Hindi');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  // Usually one ticket; more when the AI split a compound grievance across
  // departments.
  const [results, setResults] = useState<GrievanceComplaint[]>([]);
  const [offline, setOffline] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Aadhaar e-KYC for this walk-in citizen
  const [kName, setKName] = useState('');
  const [kMobile, setKMobile] = useState('');
  const [kAadhaar, setKAadhaar] = useState('');
  const [kChallengeId, setKChallengeId] = useState('');
  const [kSandboxOtp, setKSandboxOtp] = useState('');
  const [kOtp, setKOtp] = useState('');
  const [kBusy, setKBusy] = useState(false);
  const [kError, setKError] = useState('');
  const [kycToken, setKycToken] = useState('');
  const [maskedAadhaar, setMaskedAadhaar] = useState('');

  const sendOtp = async () => {
    setKBusy(true);
    setKError('');
    try {
      const ch = await requestAadhaarOtp(kAadhaar, kMobile);
      setKChallengeId(ch.challengeId);
      setKSandboxOtp(ch.sandboxOtp || '');
      setKOtp('');
    } catch (e: any) {
      setKError(e?.message || 'Could not send the OTP.');
    } finally {
      setKBusy(false);
    }
  };

  const confirmOtp = async () => {
    setKBusy(true);
    setKError('');
    try {
      const v = await verifyAadhaarOtp(kChallengeId, kOtp);
      setKycToken(v.kycToken);
      setMaskedAadhaar(v.maskedAadhaar);
      setStep('record');
    } catch (e: any) {
      setKError(e?.message || 'Verification failed.');
    } finally {
      setKBusy(false);
    }
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (speechRef.current) {
          try { speechRef.current.stop(); } catch (e) {}
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        submit(blob);
      };
      rec.start(200);
      setIsRecording(true);

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const sr = new SpeechRec();
          sr.continuous = true;
          sr.interimResults = true;
          sr.lang = lang === 'Urdu' ? 'ur-IN' : 'hi-IN';
          sr._committed = 0; // number of final results already appended
          sr.onresult = (event: any) => {
            // Only append final results, once each. Interim results re-fire for the
            // same phrase and would otherwise be appended 2-3 times.
            let newFinal = '';
            for (let i = 0; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal && i >= sr._committed) {
                newFinal += result[0].transcript;
                sr._committed = i + 1;
              }
            }
            const trimmed = newFinal.trim();
            if (trimmed) setTranscript((prev) => (prev ? `${prev} ${trimmed}` : trimmed));
          };
          speechRef.current = sr;
          sr.start();
        } catch (e) {}
      }
    } catch (err) {
      alert('माइक उपलब्ध नहीं है — कृपया नीचे बॉक्स में शिकायत लिखें। (Mic unavailable — type the grievance in the box below.)');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const submit = async (audioBlob?: Blob) => {
    setStep('processing');
    setSubmitError('');
    const text = transcript;
    let audioBase64 = '';
    if (audioBlob) {
      audioBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlob);
      });
    }

    try {
      const { analyses, isOfflineFallback } = await analyzeGrievanceWithAI({
        audioBase64,
        audioMimeType: 'audio/webm',
        text,
        district: 'Patna',
        block: 'Patna Sadar',
        panchayat: 'Kiosk Walk-in',
        gpsCoordinates: '25.6093, 85.1235',
        dialectHint: lang,
        surface: 'kiosk'
      });

      // The server assigns the tracking ID, routing, officer, the verified
      // identity (from the kycToken) and its personal/societal disclosure.
      const drafts = analyses.map((analysis) =>
        draftFromAnalysis(analysis, {
          citizen_name: kName.trim() || undefined,
          citizen_mobile: kMobile.trim() || undefined,
          district: 'Patna',
          block: 'Patna Sadar',
          panchayat: 'Kiosk Walk-in',
          original_text: text || 'Voice grievance (kiosk)',
          gps_coordinates: '25.6093, 85.1235',
          offline_fallback: isOfflineFallback,
          intake_channel: 'kiosk',
          fallbackLanguage: lang,
          fallbackLocation: 'Kiosk Walk-in, Patna'
        })
      );

      const saved = await createComplaintBatch(drafts, kycToken);
      setResults(saved);
      setOffline(isOfflineFallback);
      setStep('done');
    } catch (err) {
      if (err instanceof VerificationRequiredError) {
        // The 30-minute e-KYC proof lapsed — verify again, keep the transcript.
        setKycToken('');
        setKChallengeId('');
        setKError('सत्यापन की समय-सीमा समाप्त हो गई • Verification expired — please verify again.');
        setStep('verify');
        return;
      }
      setSubmitError(
        err instanceof Error ? err.message : 'Could not register the grievance. Please try again.'
      );
      setStep('record');
    }
  };

  const reset = () => {
    setStep('language');
    setTranscript('');
    setResults([]);
    setOffline(false);
    setSubmitError('');
    // Next citizen must verify afresh.
    setKName('');
    setKMobile('');
    setKAadhaar('');
    setKChallengeId('');
    setKSandboxOtp('');
    setKOtp('');
    setKError('');
    setKycToken('');
    setMaskedAadhaar('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-linear-to-b from-(--brand-950) via-slate-900 to-slate-950 text-white overflow-y-auto">
      {/* Kiosk header */}
      <div className="sticky top-0 bg-(--brand-950)/95 backdrop-blur border-b border-(--brand-700)/60 px-4 sm:px-8 py-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-md">
            <Landmark className="w-7 h-7 text-(--brand-900)" />
          </div>
          <div>
            <p className="text-base sm:text-lg font-black leading-tight">जनसुनवाई AI लोक शिकायत कियोस्क</p>
            <p className="text-[11px] text-blue-200">JanSunwayi AI Kiosk • Common Service Centre</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700"
          aria-label="Exit kiosk mode"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {step === 'language' && (
          <div className="space-y-6">
            <figure className="relative h-56 sm:h-72 overflow-hidden rounded-3xl border-2 border-white/15 shadow-xl">
              <StoryPhoto image={STORY_IMAGES.afterKiosk} eager className="absolute inset-0" />
              <figcaption className="photo-scrim-bottom absolute inset-x-0 bottom-0 p-5 pt-16">
                <p className="text-2xl sm:text-3xl font-black leading-tight">बोलिए, हम सुन रहे हैं।</p>
                <p className="text-sm text-blue-100">Speak — your grievance reaches the right officer.</p>
              </figcaption>
            </figure>
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-4xl font-black">अपनी भाषा चुनें</h2>
              <p className="text-blue-200 text-sm sm:text-base">Choose your language • اپنی زبان منتخب کریں</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {KIOSK_LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setStep(kycToken ? 'record' : 'verify');
                  }}
                  className="min-h-27.5 rounded-3xl bg-white/10 hover:bg-emerald-600 border-2 border-white/20 hover:border-emerald-400 transition-all p-4 text-center space-y-1"
                >
                  <p className="text-2xl sm:text-3xl font-black">{l.native}</p>
                  <p className="text-xs text-blue-200">{l.sub}</p>
                </button>
              ))}
            </div>
            <p className="text-center text-[11px] text-blue-300/70">
              अगले चरण में आधार OTP सत्यापन होगा • Next: Aadhaar OTP verification (operator assists)
            </p>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
                <Fingerprint className="w-9 h-9 text-emerald-300" />
              </div>
              <h2 className="text-2xl sm:text-4xl font-black">आधार सत्यापन</h2>
              <p className="text-blue-200 text-sm">
                Aadhaar e-KYC — required for every grievance. OTP goes to the citizen's mobile.
              </p>
            </div>

            {!kChallengeId ? (
              <div className="space-y-3">
                <input
                  value={kName}
                  onChange={(e) => setKName(e.target.value)}
                  placeholder="नाम • Full name"
                  className="w-full min-h-14 rounded-2xl bg-white/5 border border-white/15 px-4 text-lg text-white placeholder:text-blue-200/40 focus:ring-2 focus:ring-emerald-400 outline-none"
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={13}
                  value={kMobile}
                  onChange={(e) => setKMobile(e.target.value)}
                  placeholder="मोबाइल नंबर • Aadhaar-linked mobile"
                  className="w-full min-h-14 rounded-2xl bg-white/5 border border-white/15 px-4 text-lg font-mono text-white placeholder:text-blue-200/40 focus:ring-2 focus:ring-emerald-400 outline-none"
                />
                <input
                  inputMode="numeric"
                  maxLength={14}
                  value={kAadhaar}
                  onChange={(e) => setKAadhaar(e.target.value)}
                  placeholder="आधार संख्या • 12-digit Aadhaar"
                  className="w-full min-h-14 rounded-2xl bg-white/5 border border-white/15 px-4 text-lg font-mono text-white placeholder:text-blue-200/40 focus:ring-2 focus:ring-emerald-400 outline-none"
                />
                <button
                  onClick={sendOtp}
                  disabled={kBusy || kMobile.replace(/\D/g, '').length < 10 || kAadhaar.replace(/\D/g, '').length !== 12}
                  className="w-full min-h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-black text-base"
                >
                  {kBusy ? 'OTP भेजा जा रहा है…' : 'OTP भेजें • Send OTP'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {kSandboxOtp && (
                  <div className="rounded-2xl border border-amber-400/60 bg-amber-400/10 p-3 text-center">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                      Sandbox — no SMS provider configured
                    </p>
                    <p className="font-mono text-3xl font-black tracking-[0.3em] text-amber-200">{kSandboxOtp}</p>
                  </div>
                )}
                <input
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={kOtp}
                  onChange={(e) => setKOtp(e.target.value)}
                  placeholder="6 अंकों का OTP • 6-digit OTP"
                  className="w-full min-h-16 rounded-2xl bg-white/5 border border-white/15 px-4 text-center text-2xl font-mono tracking-widest text-white placeholder:text-blue-200/40 placeholder:text-base placeholder:tracking-normal focus:ring-2 focus:ring-emerald-400 outline-none"
                />
                <button
                  onClick={confirmOtp}
                  disabled={kBusy || kOtp.replace(/\D/g, '').length !== 6}
                  className="w-full min-h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-black text-base"
                >
                  {kBusy ? 'जाँच हो रही है…' : 'सत्यापित करें • Verify'}
                </button>
                <button
                  onClick={() => {
                    setKChallengeId('');
                    setKError('');
                  }}
                  className="w-full py-2 text-xs font-bold text-blue-200 hover:text-white"
                >
                  नंबर बदलें • Change number
                </button>
              </div>
            )}

            {kError && (
              <div className="bg-rose-600/20 border border-rose-400/50 rounded-2xl p-3 text-xs text-rose-100 text-center">
                {kError}
              </div>
            )}
          </div>
        )}

        {step === 'record' && (
          <div className="space-y-8 text-center">
            {maskedAadhaar && (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-full px-3 py-1">
                <ShieldCheck className="w-4 h-4" /> Aadhaar verified • {maskedAadhaar}
              </p>
            )}
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-4xl font-black">
                {isRecording ? 'बोलिए... हम सुन रहे हैं' : 'बटन दबाकर अपनी बात कहें'}
              </h2>
              <p className="text-blue-200 text-sm">
                {isRecording
                  ? `Speaking in ${lang} — press the red button when finished`
                  : `Press the green button and speak your problem in ${lang}`}
              </p>
            </div>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-40 h-40 sm:w-52 sm:h-52 mx-auto rounded-full flex items-center justify-center shadow-2xl transition-all ${
                isRecording
                  ? 'bg-rose-600 animate-pulse ring-8 ring-rose-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 ring-8 ring-emerald-500/20'
              }`}
            >
              {isRecording ? (
                <Square className="w-16 h-16 sm:w-20 sm:h-20" />
              ) : (
                <Mic className="w-16 h-16 sm:w-20 sm:h-20" />
              )}
            </button>

            {transcript && (
              <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-left">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Live transcription</span>
                </p>
                <p className="text-sm text-white">{transcript}</p>
              </div>
            )}

            {submitError && (
              <div className="bg-rose-600/20 border border-rose-400/50 rounded-2xl p-4 flex items-start space-x-3 text-left">
                <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-100">{submitError}</p>
              </div>
            )}

            {/* Operator fallback: type the grievance if the mic is unusable */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <p className="text-xs font-bold text-blue-200 text-center">
                माइक काम न करे तो यहाँ लिखें (Operator: type the grievance instead)
              </p>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                placeholder="नागरिक की शिकायत यहाँ लिखें…"
                className="w-full rounded-2xl bg-white/5 border border-white/15 p-4 text-sm text-white placeholder:text-blue-200/40 focus:ring-2 focus:ring-emerald-400 outline-none"
              />
              <button
                onClick={() => submit()}
                disabled={!transcript.trim()}
                className="w-full min-h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 font-black text-base"
              >
                शिकायत दर्ज करें (Submit grievance)
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center space-y-6 py-16">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-spin">
              <Sparkles className="w-12 h-12" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">आपकी शिकायत दर्ज हो रही है...</h2>
            <p className="text-blue-200 text-sm">
              AI समझ रहा है • सारांश बन रहा है • सही विभाग को भेजा जा रहा है
            </p>
          </div>
        )}

        {step === 'done' && results.length > 0 && (
          <div className="space-y-6">
            {offline && (
              <div className="bg-slate-800 border-2 border-dashed border-slate-500 rounded-2xl p-4 flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300">
                  <span className="font-black uppercase">Rule-based routing</span> — the live AI
                  engine was unreachable. The grievance is filed and tracked normally; the receiving
                  officer will re-verify the department and priority.
                </p>
              </div>
            )}

            <div className="text-center space-y-3">
              <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-14 h-14 text-white" />
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-emerald-400">शिकायत दर्ज हो गई!</h2>
              <p className="text-blue-200">
                {results.length > 1
                  ? `आपकी बात ${results.length} अलग शिकायतों में दर्ज हुई • Registered as ${results.length} linked grievances`
                  : 'Your grievance is registered'}
              </p>
            </div>

            {results.length > 1 && (
              <div className="bg-indigo-500/15 border border-indigo-400/40 rounded-2xl p-4 text-xs text-indigo-100">
                आपकी शिकायत में एक से ज़्यादा मुद्दे थे, इसलिए हर विभाग के लिए अलग टोकन बना है। सभी टोकन
                नंबर पर्ची पर छपे हैं। (Your report covered several departments — one token each, all on
                the printed slip.)
              </div>
            )}

            {results.map((result) => (
            <div key={result.id} className="bg-white text-slate-900 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="text-center pb-4 border-b border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase">आपका टोकन नंबर • Tracking ID</p>
                <p className="text-3xl sm:text-4xl font-black font-mono text-emerald-700 mt-1">
                  {result.tracking_id}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">विभाग • Department</p>
                  <p className="font-bold">{result.assigned_department}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">अधिकारी • Officer Level</p>
                  <p className="font-bold">{result.assigned_officer}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">AI सारांश • Short Summary</p>
                  <p className="text-xs text-slate-700">"{result.translated_summary}"</p>
                </div>
              </div>
              <NatureNotice complaint={result} audience="citizen" />
              {result.jurisdiction_check === 'RTPS_EXCLUDED' && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 text-xs text-amber-900">
                  <span className="font-black">⚖️ RTPS मामला:</span> यह सेवा RTPS (लोक सेवा का अधिकार)
                  के अंतर्गत आती है — आपका आवेदन सही चैनल (RTPS अपील) में भेज दिया गया है।
                </div>
              )}
              <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>60 कार्य-दिवस की वैधानिक सीमा • पर्ची प्रिंट हो रही है • SMS भेजा गया</span>
              </div>
            </div>
            ))}

            <button
              onClick={reset}
              className="w-full min-h-16 rounded-3xl bg-emerald-600 hover:bg-emerald-500 text-white text-xl font-black flex items-center justify-center space-x-3"
            >
              <RefreshCw className="w-6 h-6" />
              <span>अगला नागरिक • Next Citizen</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
