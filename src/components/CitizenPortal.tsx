import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  Upload,
  MapPin,
  Send,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  FileText,
  Volume2,
  ChevronRight,
  ShieldAlert,
  Printer,
  Copy,
  RefreshCw,
  Camera,
  Layers,
  ArrowRight,
  ShieldCheck,
  Fingerprint,
  Lock,
  Unlock,
  Check,
  X
} from 'lucide-react';
import { GrievanceComplaint, getEscalationLadder, CitizenAccount } from '../types';
import { BIHAR_DISTRICTS, BIHAR_DISTRICT_NAMES } from '../data/biharData';
import { analyzeGrievanceWithAI } from '../services/api';
import { requestAadhaarOtp, verifyAadhaarOtp } from '../services/kyc';
import {
  createComplaintBatch,
  draftFromAnalysis,
  getComplaintByTrackingId,
  getMyComplaints,
  VerificationRequiredError
} from '../services/complaints';
import { NatureNotice } from './NatureBadge';
import { PhotoBanner } from './jansunwayi-ui';
import { STORY_IMAGES } from '../data/storyImages';

interface CitizenPortalProps {
  citizenUser: CitizenAccount | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  /** Sub-view to open on first render (the /track routes open 'track'). */
  initialSubTab?: 'submit' | 'track' | 'mine';
  /** Tracking ID from a /track/:id link — looked up automatically on mount. */
  initialTrackingId?: string;
}

export const CitizenPortal: React.FC<CitizenPortalProps> = ({
  citizenUser,
  onOpenAuthModal,
  onLogout,
  initialSubTab = 'submit',
  initialTrackingId
}) => {
  const [subTab, setSubTab] = useState<'submit' | 'track' | 'mine'>(initialSubTab);

  // Input states
  const [citizenName, setCitizenName] = useState('');
  const [citizenMobile, setCitizenMobile] = useState('');
  const [district, setDistrict] = useState('Patna');
  const [block, setBlock] = useState('Patna Sadar');
  const [panchayat, setPanchayat] = useState('');
  const [textInput, setTextInput] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [gpsStatus, setGpsStatus] = useState<string>('Location not captured');

  // Audio Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [autoSendOnStop, setAutoSendOnStop] = useState(true);

  // ── Aadhaar e-KYC ────────────────────────────────────────────────────────
  // The OTP is generated, hashed, expired and attempt-capped by the backend
  // (/api/kyc/aadhaar/*). Nothing here can shortcut it: the browser never sees
  // a correct code unless the server chooses to return one, which it only does
  // when no SMS provider is configured — and then the UI says so plainly.
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [aadhaarMobileInput, setAadhaarMobileInput] = useState('');
  // Most citizens' Aadhaar is linked to the same number they give us for SMS
  // alerts, so that's the default — untick to enter a different number.
  const [sameAsAadhaarMobile, setSameAsAadhaarMobile] = useState(true);
  const [isAadhaarVerified, setIsAadhaarVerified] = useState(false);
  const [aadhaarVerifiedName, setAadhaarVerifiedName] = useState('');
  const [aadhaarMaskedNumber, setAadhaarMaskedNumber] = useState('');
  const [isAadhaarVerifying, setIsAadhaarVerifying] = useState(false);
  const [aadhaarError, setAadhaarError] = useState('');
  const [showAadhaarAuthModal, setShowAadhaarAuthModal] = useState(false);
  const [showAadhaarOtpModal, setShowAadhaarOtpModal] = useState(false);
  const [aadhaarOtpInput, setAadhaarOtpInput] = useState('');
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpDelivery, setOtpDelivery] = useState<'sms' | 'sandbox'>('sandbox');
  const [otpSandboxCode, setOtpSandboxCode] = useState('');
  const [otpMaskedMobile, setOtpMaskedMobile] = useState('');
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  // Signed proof of the OTP verification, sent with the filing. Not needed
  // for a signed-in citizen, whose session already carries it.
  const [kycToken, setKycToken] = useState('');

  // Countdown on the live OTP challenge — the expiry is enforced server-side;
  // this just stops the citizen typing into a code that has already lapsed.
  useEffect(() => {
    if (!showAadhaarOtpModal || otpSecondsLeft <= 0) return;
    const t = setInterval(() => setOtpSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [showAadhaarOtpModal, otpSecondsLeft]);

  // Logged-in citizens already completed Aadhaar e-KYC at signup — prefill
  // their profile and skip the per-submission verification step entirely.
  useEffect(() => {
    if (!citizenUser) return;
    setCitizenName(citizenUser.name);
    setCitizenMobile(citizenUser.mobile);
    setDistrict(citizenUser.district);
    setBlock(citizenUser.block);
    setPanchayat(citizenUser.panchayat);
    // Accounts created through signup completed e-KYC; any that did not
    // (e.g. seeded demo accounts) verify with the OTP before filing.
    setIsAadhaarVerified(citizenUser.aadhaar_verified);
    setAadhaarVerifiedName(citizenUser.name);
    setAadhaarMaskedNumber(citizenUser.aadhaar_masked);
  }, [citizenUser]);

  // ── Aadhaar handlers ─────────────────────────────────────────────────────
  // Step 1: send the 12-digit number + mobile to the backend, which validates
  // the UIDAI Verhoeff checksum, discards the full number, and dispatches an
  // OTP. Any error message shown here came from the server.
  const handleAuthenticateAadhaar = async () => {
    const aadhaarDigits = aadhaarInput.replace(/\D/g, '');
    const mobileDigits = (sameAsAadhaarMobile ? citizenMobile : aadhaarMobileInput).replace(/\D/g, '');

    if (!citizenName.trim()) {
      setAadhaarError('Enter your full name.');
      return;
    }
    if (citizenMobile.replace(/\D/g, '').length < 10) {
      setAadhaarError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (aadhaarDigits.length !== 12) {
      setAadhaarError('Enter all 12 digits of your Aadhaar number.');
      return;
    }
    if (mobileDigits.length < 10) {
      setAadhaarError(
        sameAsAadhaarMobile
          ? 'Enter a valid 10-digit mobile number above.'
          : 'Enter the 10-digit mobile number linked to your Aadhaar.'
      );
      return;
    }

    setAadhaarError('');
    setIsAadhaarVerifying(true);
    try {
      const challenge = await requestAadhaarOtp(aadhaarDigits, mobileDigits);
      setOtpChallengeId(challenge.challengeId);
      setOtpDelivery(challenge.deliveryChannel);
      setOtpSandboxCode(challenge.sandboxOtp || '');
      setOtpMaskedMobile(challenge.maskedMobile);
      setOtpSecondsLeft(challenge.expiresInSeconds);
      setAadhaarMaskedNumber(challenge.maskedAadhaar);
      setAadhaarOtpInput('');
      setShowAadhaarOtpModal(true);
    } catch (err) {
      setAadhaarError(err instanceof Error ? err.message : 'Could not start verification.');
    } finally {
      setIsAadhaarVerifying(false);
    }
  };

  // Step 2: the server checks the OTP against its stored hash. A wrong code
  // burns one of the three attempts; an expired or reused one is refused.
  const handleVerifyOtpSubmit = async () => {
    const otp = aadhaarOtpInput.replace(/\D/g, '');
    if (otp.length !== 6) {
      setAadhaarError('Enter the 6-digit OTP.');
      return;
    }

    setAadhaarError('');
    setIsAadhaarVerifying(true);
    try {
      const result = await verifyAadhaarOtp(otpChallengeId, otp);
      setKycToken(result.kycToken);
      setIsAadhaarVerified(true);
      setAadhaarMaskedNumber(result.maskedAadhaar);
      setAadhaarVerifiedName(citizenName.trim());
      if (!citizenMobile.trim()) setCitizenMobile(result.mobile);
      setShowAadhaarOtpModal(false);
      setShowAadhaarAuthModal(false);
      setAadhaarOtpInput('');
      setOtpSandboxCode('');
    } catch (err) {
      setAadhaarError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsAadhaarVerifying(false);
    }
  };

  const handleResetAadhaar = () => {
    setKycToken('');
    setIsAadhaarVerified(false);
    setAadhaarMaskedNumber('');
    setAadhaarVerifiedName('');
    setAadhaarInput('');
    setAadhaarMobileInput('');
    setAadhaarOtpInput('');
    setOtpChallengeId('');
    setOtpSandboxCode('');
    setAadhaarError('');
  };

  // Analysis & Loading states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [submitError, setSubmitError] = useState('');
  // Tickets created by the last submission. Usually one; more when the AI split
  // a compound report ("tree on road 2 AND water logging on road 3") into one
  // ticket per department.
  const [createdComplaints, setCreatedComplaints] = useState<GrievanceComplaint[]>([]);
  const primaryCreatedComplaint = createdComplaints[0] ?? null;

  // Load "My Grievances" whenever the tab is opened for a logged-in citizen,
  // and again right after a fresh submission so the list stays current.
  useEffect(() => {
    if (subTab !== 'mine' || !citizenUser) return;
    setMyComplaintsLoading(true);
    getMyComplaints()
      .then(setMyComplaints)
      .catch(() => setMyComplaints([]))
      .finally(() => setMyComplaintsLoading(false));
  }, [subTab, citizenUser, createdComplaints]);

  // Tracking states
  const [trackingSearchInput, setTrackingSearchInput] = useState('');
  const [trackedComplaint, setTrackedComplaint] = useState<GrievanceComplaint | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // "My Grievances" state
  const [myComplaints, setMyComplaints] = useState<GrievanceComplaint[]>([]);
  const [myComplaintsLoading, setMyComplaintsLoading] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const autoSendRef = useRef(autoSendOnStop);
  const identityStepRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    autoSendRef.current = autoSendOnStop;
  }, [autoSendOnStop]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  // Update blocks dropdown when district changes
  const availableBlocks = BIHAR_DISTRICTS[district] || ['Sadar Block'];

  // Process and Submit Grievance with AI Auto-Translation & Routing
  const processGrievanceSubmission = async (overrideAudioBlob?: Blob, overrideText?: string) => {
    // Check if Aadhaar is verified
    if (!isAadhaarVerified) {
      setShowAadhaarAuthModal(true);
      return;
    }

    const currentAudio = overrideAudioBlob || audioBlob;
    const currentText = overrideText !== undefined ? overrideText : textInput;

    if (!currentText.trim() && !currentAudio) {
      setSubmitError('Record your grievance with the microphone, or type it in the box below.');
      return;
    }

    setSubmitError('');
    setIsAnalyzing(true);

    // Each step is set when that work actually begins — no timed theatre.
    let audioBase64 = '';
    if (currentAudio) {
      setAnalysisStep('Encoding voice recording…');
      audioBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(currentAudio);
      });
    }

    setAnalysisStep('Analysing your grievance and routing it to the right department…');

    try {
      const { analyses, isOfflineFallback } = await analyzeGrievanceWithAI({
        audioBase64,
        audioMimeType: 'audio/webm',
        imageBase64: photoPreview || undefined,
        text: currentText,
        district,
        block,
        panchayat,
        gpsCoordinates,
        // Empty hint: the language is auto-detected from the speech/text.
        dialectHint: ''
      });

      const rawAudioUrl = audioUrl || (currentAudio ? URL.createObjectURL(currentAudio) : undefined);

      // One draft per detected grievance. The server decides everything that
      // matters for accountability — tracking ID, routing, officer, the
      // verified identity and whether officials may see it (personal vs
      // societal) — so the draft carries only the analysis and location.
      const drafts = analyses.map((result) =>
        draftFromAnalysis(result, {
          citizen_name: citizenName.trim() || aadhaarVerifiedName || undefined,
          citizen_mobile: citizenMobile.trim() || undefined,
          district,
          block,
          panchayat,
          raw_audio_url: rawAudioUrl,
          original_text: currentText || 'Voice Recorded Grievance',
          photo_url: photoPreview || undefined,
          gps_coordinates: gpsCoordinates,
          offline_fallback: isOfflineFallback,
          intake_channel: 'web',
          fallbackLanguage: 'Hindi',
          fallbackLocation: [panchayat, block, district].filter(Boolean).join(', ')
        })
      );

      const saved = await createComplaintBatch(drafts, kycToken || undefined);
      setCreatedComplaints(saved);
      setIsAnalyzing(false);
    } catch (err) {
      console.error('Error submitting grievance:', err);
      setIsAnalyzing(false);
      if (err instanceof VerificationRequiredError) {
        // The e-KYC proof lapsed (it lasts 30 minutes) — verify again.
        handleResetAadhaar();
        setSubmitError('Your Aadhaar verification has expired. Please verify again in Step 1, then resubmit.');
        identityStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      setSubmitError(
        err instanceof Error ? err.message : 'Could not submit your grievance. Please try again.'
      );
    }
  };

  // Mic Click Handler (Gated by Aadhaar Authentication)
  const handleMicToggle = () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    if (!isAadhaarVerified) {
      setShowAadhaarAuthModal(true);
      return;
    }
    startRecording();
  };

  // Start Audio Recording with Live Speech Recognition
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());

        // Stop live speech recognition if active
        if (speechRecognitionRef.current) {
          try { speechRecognitionRef.current.stop(); } catch (e) {}
        }

        // AUTO-TRANSLATE & SEND TO DEPARTMENT
        if (autoSendRef.current) {
          processGrievanceSubmission(audioBlob);
        }
      };

      // Start MediaRecorder
      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start Web Speech API SpeechRecognition if supported
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'hi-IN'; // Optimized for Indian Hindi and regional accents
          rec._committed = 0; // number of final results already appended
          rec.onresult = (event: any) => {
            // Only append results that are final, and only once each.
            // Interim results re-fire repeatedly for the same phrase and must be ignored,
            // otherwise the same text gets appended 2-3 times.
            let newFinal = '';
            for (let i = 0; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal && i >= rec._committed) {
                newFinal += result[0].transcript;
                rec._committed = i + 1;
              }
            }
            const trimmed = newFinal.trim();
            if (trimmed) {
              setTextInput((prev) => (prev ? `${prev} ${trimmed}` : trimmed));
            }
          };
          speechRecognitionRef.current = rec;
          rec.start();
        } catch (speechErr) {
          console.warn('Browser speech recognition init note:', speechErr);
        }
      }
    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Microphone access denied or not available. You can use text input or click a sample voice note below!');
    }
  };

  // Stop Audio Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  // Play Recorded Audio
  const togglePlayAudio = () => {
    if (!audioUrl) return;
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio(audioUrl);
      audioElementRef.current.onended = () => setIsPlayingAudio(false);
    }

    if (isPlayingAudio) {
      audioElementRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioElementRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  // Handle Photo File Select
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Capture Geolocation
  const handleDetectLocation = () => {
    setGpsStatus('Detecting GPS location...');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(4);
          const lng = position.coords.longitude.toFixed(4);
          setGpsCoordinates(`${lat}, ${lng}`);
          setGpsStatus(`GPS Captured: ${lat}, ${lng}`);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          setGpsStatus('GPS Unavailable. Defaulting to Patna District.');
        },
        { timeout: 8000 }
      );
    } else {
      setGpsStatus('Geolocation not supported by browser.');
    }
  };

  // Submit Grievance Handler
  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    await processGrievanceSubmission();
  };

  // Search Complaint
  const handleSearchComplaint = async (e?: React.FormEvent, overrideId?: string) => {
    if (e) e.preventDefault();
    const query = (overrideId ?? trackingSearchInput).trim();
    if (!query) return;
    if (overrideId) setTrackingSearchInput(overrideId);

    setTrackingError('');
    setIsSearching(true);
    try {
      const found = await getComplaintByTrackingId(query);
      if (found) {
        setTrackedComplaint(found);
      } else {
        setTrackedComplaint(null);
        setTrackingError(
          `No grievance found for "${query}". Check the ID on your acknowledgement slip — it looks like #BHR-12345.`
        );
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Deep link: /track/:id opens straight onto that grievance.
  useEffect(() => {
    if (initialTrackingId) handleSearchComplaint(undefined, initialTrackingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Intro + sub-navigation.
          Account state and sign-in live in the site header, which is
          citizen-scoped on this tab — a second login control here would be
          two doors to the same room. */}
      <div className="card-elevated overflow-hidden">
        {/* The photo follows the sub-tab: speaking up, waiting on an answer,
            and the record of what was filed. */}
        <PhotoBanner
          image={
            subTab === 'track'
              ? STORY_IMAGES.waterOfHope
              : subTab === 'mine'
              ? STORY_IMAGES.afterKiosk
              : STORY_IMAGES.voiceHandpump
          }
          className="rounded-none shadow-none"
        >
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center space-x-2 bg-white/15 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider mono border border-white/20 backdrop-blur">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-400)' }} />
              <span>State Right to Public Grievance Redressal Engine</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-bold tracking-tight">
              {subTab === 'track' ? 'Track your grievance' : subTab === 'mine' ? 'Your grievances' : 'Speak up. You will be heard.'}
            </h2>
            <p className="font-devanagari text-lg font-semibold text-white/90">
              {subTab === 'track' ? 'आपकी शिकायत कहाँ तक पहुँची?' : subTab === 'mine' ? 'आपकी हर शिकायत का हिसाब।' : 'अपनी भाषा में, अपनी बात।'}
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              Speak or write your grievance in your own language — Bhojpuri, Magahi, Maithili, Hindi,
              Urdu or English. It is transcribed, translated, scored for urgency and routed to the
              right department and officer, who receive a short summary rather than the raw recording.
            </p>
          </div>
        </PhotoBanner>

        {/* Sub-navigation */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-4 sm:px-8">
          {([
            { id: 'submit' as const, label: 'Submit Grievance', icon: Send },
            { id: 'track' as const, label: 'Track Status', icon: Search },
            ...(citizenUser ? [{ id: 'mine' as const, label: 'My Grievances', icon: FileText }] : [])
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`min-h-10.5 px-4 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
                subTab === id
                  ? 'brand-gradient text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          ))}

          {!citizenUser && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="min-h-10.5 px-3 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline ml-auto"
            >
              Sign in to keep a record of your grievances
            </button>
          )}
        </div>
      </div>

      {subTab === 'mine' && citizenUser && (
        <div className="space-y-4">
          {myComplaintsLoading ? (
            <div className="card-elevated rounded-3xl p-10 text-center text-sm text-slate-400">
              Loading your grievances…
            </div>
          ) : myComplaints.length === 0 ? (
            <div className="card-elevated rounded-3xl p-10 text-center space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-800">You haven't submitted any grievances yet.</p>
              <button
                onClick={() => setSubTab('submit')}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline"
              >
                Submit your first grievance
              </button>
            </div>
          ) : (
            myComplaints.map((c) => (
              <div key={c.id} className="card-elevated rounded-2xl p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-black text-blue-800 text-sm">{c.tracking_id}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      c.status === 'Resolved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600">"{c.translated_summary}"</p>
                <p className="text-[11px] text-slate-400">
                  {c.assigned_department} • {new Date(c.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {subTab !== 'mine' && (subTab === 'submit' ? (
        primaryCreatedComplaint ? (
          /* SUCCESS TICKET ACKNOWLEDGMENT VIEW */
          <div className="card-elevated rounded-3xl p-6 sm:p-10 space-y-8 animate-in fade-in duration-300">
            {/* Compound report notice — one submission split across departments */}
            {createdComplaints.length > 1 && (
              <div className="bg-indigo-50 border border-indigo-300 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-black text-indigo-900 uppercase tracking-wide">
                  Your report covered {createdComplaints.length} issues — filed as {createdComplaints.length} linked grievances
                </p>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  Because the issues fall under different departments, each is now its own ticket with
                  its own officer and statutory clock. Tracking any one of them shows the whole set.
                </p>
                <ul className="space-y-1.5">
                  {createdComplaints.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="mono font-black text-indigo-800">{c.tracking_id}</span>
                      <span className="text-indigo-400">·</span>
                      <span className="font-bold text-slate-700">{c.assigned_department}</span>
                      <span className="text-indigo-400">·</span>
                      <span className="text-slate-500">Priority {c.priority_score}/5</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Offline fallback disclosure — never present fallback as live AI */}
            {primaryCreatedComplaint.offline_fallback && (
              <div className="bg-slate-100 border-2 border-dashed border-slate-400 rounded-2xl p-4 flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700">
                  <p className="font-black uppercase tracking-wider">Rule-based routing</p>
                  <p className="mt-0.5">
                    The live AI engine was unreachable, so this grievance was routed by the keyword
                    fallback classifier. It is filed and tracked normally, but the department and
                    priority shown are indicative and will be re-verified by the receiving officer.
                  </p>
                </div>
              </div>
            )}

            {/* Jurisdiction notice — e.g. RTPS-notified services */}
            {primaryCreatedComplaint.jurisdiction_check && primaryCreatedComplaint.jurisdiction_check !== 'LOK_SHIKAYAT' && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-2">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
                  <p className="text-sm font-black text-amber-900 uppercase tracking-wide">
                    Jurisdiction Notice — Outside Lok Shikayat
                  </p>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  {primaryCreatedComplaint.jurisdiction_explanation ||
                    'This matter falls under a different statutory channel. The AI has routed your application to the correct authority.'}
                </p>
                {primaryCreatedComplaint.jurisdiction_check === 'RTPS_EXCLUDED' && (
                  <p className="text-xs font-bold text-amber-900 bg-amber-100 border border-amber-200 rounded-xl p-3">
                    ✅ Your application has been redirected to the state's Right to Public Services (RTPS)
                    appeal chain — a pre-filled appeal against the Designated Officer has been prepared.
                    No separate Lok Shikayat complaint is registered, keeping your filing legally valid.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                      {primaryCreatedComplaint.jurisdiction_check === 'RTPS_EXCLUDED' ? 'Redirected to RTPS' : 'Grievance Registered'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(primaryCreatedComplaint.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 wrap-break-word">
                    {createdComplaints.length > 1 ? (
                      <>
                        {createdComplaints.length} Tracking IDs:{' '}
                        <span className="text-emerald-700 font-mono">
                          {createdComplaints.map((c) => c.tracking_id).join(', ')}
                        </span>
                      </>
                    ) : (
                      <>
                        Tracking ID:{' '}
                        <span className="text-emerald-700 font-mono">{primaryCreatedComplaint.tracking_id}</span>
                      </>
                    )}
                  </h3>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <button
                  onClick={handlePrintSlip}
                  className="px-4 py-2.5 min-h-11 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center justify-center space-x-2 border border-slate-300"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>

                <button
                  onClick={() => {
                    setCreatedComplaints([]);
                    setTextInput('');
                    setAudioBlob(null);
                    setAudioUrl(null);
                    setPhotoPreview(null);
                  }}
                  className="px-4 py-2.5 min-h-11 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors flex items-center justify-center space-x-2 shadow-md shadow-emerald-800/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Submit Another Complaint</span>
                </button>
              </div>
            </div>

            {/* AI Analysis Receipt Details — one block per ticket */}
            {createdComplaints.map((createdComplaint, ticketIdx) => (
             <div key={createdComplaint.id || ticketIdx} className="space-y-8">
             {createdComplaints.length > 1 && (
               <div className="flex items-center gap-2 pt-2">
                 <span className="text-xs font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full">
                   Ticket {ticketIdx + 1} of {createdComplaints.length}
                 </span>
                 <span className="text-sm font-bold text-slate-700">{createdComplaint.assigned_department}</span>
                 <span className="mono text-xs text-slate-400">{createdComplaint.tracking_id}</span>
               </div>
             )}
             <NatureNotice complaint={createdComplaint} audience="citizen" />

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: AI Routing */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  1. Administrative Routing
                </span>
                <div>
                  <p className="text-xs text-slate-500">Assigned Tier</p>
                  <p className="text-base font-extrabold text-amber-700">{createdComplaint.administrative_tier}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Department</p>
                  <p className="text-sm font-bold text-slate-900">{createdComplaint.assigned_department}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Designated Officer</p>
                  <p className="text-xs font-medium text-slate-700">{createdComplaint.assigned_officer}</p>
                </div>
              </div>

              {/* Card 2: Dialect & Priority */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  2. Dialect & Priority Score
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500">Language Detected:</span>
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    {createdComplaint.detected_language}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Priority Urgency Score</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black text-white ${
                        createdComplaint.priority_score === 5
                          ? 'bg-rose-600 animate-pulse'
                          : createdComplaint.priority_score >= 3
                          ? 'bg-amber-600'
                          : 'bg-emerald-600'
                      }`}
                    >
                      Priority Level {createdComplaint.priority_score} / 5
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium pt-1">
                  {createdComplaint.urgency_rationale}
                </p>
              </div>

              {/* Card 3: statutory clock + internal 48h flag */}
              <div className="bg-emerald-900/5 rounded-2xl p-5 border border-emerald-200/80 space-y-3">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>3. Statutory Redressal Clock</span>
                </span>
                <div>
                  <p className="text-xs text-slate-500">Hearing & Redressal Limit (§5)</p>
                  <p className="text-xl font-black text-emerald-900">60 Working Days</p>
                  <p className="text-[11px] font-bold text-amber-700 mt-1">
                    ⚡ Internal AI early-warning: officer flagged if no action within 48 hours
                  </p>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  If unheard within the limit or you are aggrieved by the decision, you may appeal to the
                  First Appellate Authority within 30 days (§7), then the Second Appellate Authority.
                  Officers failing without sufficient cause face a ₹500–₹5,000 penalty recoverable from
                  salary (§8).
                </p>
              </div>
            </div>

            {/* Department Escalation Path — auto-advances every 48h of inaction */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Escalation Path — {createdComplaint.assigned_department}
                </span>
                <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                  ⚡ Auto-escalates every 48h of inaction
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-y-2">
                {(
                  createdComplaint.escalation_ladder ||
                  getEscalationLadder(createdComplaint.assigned_department)
                ).map((step, idx, arr) => (
                  <React.Fragment key={step}>
                    <span
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${
                        idx === (createdComplaint.current_ladder_index ?? 0)
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                          : idx === arr.length - 1
                          ? 'bg-slate-900 text-amber-300 border-slate-700'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {idx === (createdComplaint.current_ladder_index ?? 0) && '📍 '}
                      {step}
                    </span>
                    {idx < arr.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 mx-1 shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Your grievance is now with{' '}
                <span className="font-bold text-slate-700">
                  {createdComplaint.current_ladder_step ||
                    getEscalationLadder(createdComplaint.assigned_department)[0]}
                </span>
                . If any level takes no action within 48 hours, it automatically moves to the next
                level — all the way to departmental HQ and the CMO Cell. Track{' '}
                <span className="mono font-bold text-slate-700">{createdComplaint.tracking_id}</span>{' '}
                at any time to see where it currently sits.
              </p>
            </div>

            {/* Translated Summary & Action Step */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase text-amber-400 tracking-wider">
                  Translated English Summary (AI Engine)
                </h4>
                <p className="text-sm font-medium text-slate-200 mt-1 leading-relaxed">
                  "{createdComplaint.translated_summary}"
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase text-emerald-400 tracking-wider">
                  Recommended Administrative Action Step
                </h4>
                <p className="text-sm font-semibold text-emerald-100 mt-1">
                  {createdComplaint.recommended_action_step}
                </p>
              </div>
            </div>
             </div>
            ))}

            {/* Save-your-tracking-ID callout */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-xs text-amber-900 space-y-0.5">
                <p className="font-bold">
                  {createdComplaints.length > 1 ? 'Save your tracking IDs: ' : 'Save your tracking ID: '}
                  <span className="mono font-black">
                    {createdComplaints.map((c) => c.tracking_id).join(', ')}
                  </span>
                </p>
                <p className="text-amber-800">
                  Enter it under “Track Grievance” at any time to see the current status, the officer
                  holding it, and every escalation recorded against it.
                  {citizenUser
                    ? ' It also appears under “My Grievances” while you are signed in.'
                    : ' Sign in before filing to have your grievances listed automatically.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* SUBMIT GRIEVANCE FORM */
          <form onSubmit={handleSubmitGrievance} className="space-y-8">
            {/* Step 1: Citizen Details & Aadhaar e-KYC */}
            <div ref={identityStepRef} className="card-elevated rounded-3xl p-6 sm:p-8 space-y-6 scroll-mt-24">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-extrabold text-blue-700 uppercase tracking-wider block">
                      Step 1 of 3 • Your Details & Aadhaar e-KYC
                    </span>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded border border-amber-300">
                      UIDAI e-KYC
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">
                    Who is filing this grievance? (आधार कार्ड ई-केवाईसी सत्यापन)
                  </h3>
                </div>

                {isAadhaarVerified && (
                  <span className="inline-flex items-center space-x-1.5 bg-emerald-100 text-emerald-900 px-3.5 py-1 rounded-full text-xs font-extrabold border border-emerald-300 shadow-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Aadhaar Verified</span>
                  </span>
                )}
              </div>

              {!isAadhaarVerified ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  {/* Name + mobile first — these are needed regardless of
                      Aadhaar, and the mobile doubles as the default
                      Aadhaar-linked number below. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={citizenName}
                      onChange={(e) => {
                        setCitizenName(e.target.value);
                        setAadhaarError('');
                      }}
                      placeholder="Full name"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-sm font-mono text-slate-400">+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={13}
                        value={citizenMobile}
                        onChange={(e) => {
                          setCitizenMobile(e.target.value);
                          setAadhaarError('');
                        }}
                        placeholder="Mobile number"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-600 outline-none"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sameAsAadhaarMobile}
                      onChange={(e) => {
                        setSameAsAadhaarMobile(e.target.checked);
                        setAadhaarError('');
                      }}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-600 h-4 w-4 shrink-0"
                    />
                    <span>My Aadhaar-linked mobile number is the same as above</span>
                  </label>

                  <div className={`grid grid-cols-1 ${sameAsAadhaarMobile ? '' : 'sm:grid-cols-2'} gap-3`}>
                    <div className="relative">
                      <Fingerprint className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={14}
                        value={aadhaarInput}
                        onChange={(e) => {
                          setAadhaarInput(e.target.value);
                          setAadhaarError('');
                        }}
                        placeholder="12-digit Aadhaar number"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-600 outline-none"
                      />
                    </div>
                    {!sameAsAadhaarMobile && (
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-sm font-mono text-slate-400">+91</span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={13}
                          value={aadhaarMobileInput}
                          onChange={(e) => {
                            setAadhaarMobileInput(e.target.value);
                            setAadhaarError('');
                          }}
                          placeholder="Aadhaar-linked mobile number"
                          className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-600 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAuthenticateAadhaar}
                    disabled={isAadhaarVerifying}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl brand-gradient hover:opacity-90 text-white font-bold text-xs shadow-md transition-opacity flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isAadhaarVerifying ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent-400)' }} />
                    )}
                    <span>{isAadhaarVerifying ? 'Sending OTP…' : 'Send OTP'}</span>
                  </button>

                  {aadhaarError && (
                    <p className="text-xs text-rose-600 font-semibold">{aadhaarError}</p>
                  )}

                  <p className="text-[11px] text-slate-500 leading-relaxed pt-3 border-t border-slate-200/80">
                    Your Aadhaar number is checked against the UIDAI Verhoeff checksum and then
                    discarded — only the last four digits are ever stored (Aadhaar Act §29(4)).
                    Verification runs as a <span className="font-semibold">sandbox e-KYC</span>:
                    the OTP is genuine, single-use and expires in 5 minutes, but a production
                    deployment authenticates against UIDAI through a licensed AUA/KUA.
                  </p>
                </div>
              ) : (
                /* Verified Status Banner */
                <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Aadhaar e-KYC Verified
                        </span>
                        <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30">
                          UIDAI Authentic
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white mt-0.5">
                        {aadhaarVerifiedName || citizenName || 'Authenticated Citizen'}
                      </h4>
                      <p className="text-xs text-slate-300 font-mono">
                        {citizenMobile} • Aadhaar No: {aadhaarMaskedNumber || 'XXXX-XXXX-0000'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetAadhaar}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors border border-slate-700 shrink-0"
                  >
                    Re-verify / Logout Aadhaar
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Location & Attachments */}
            <div className="card-elevated rounded-3xl p-6 sm:p-8 space-y-6">
              <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider block">
                Step 2 of 3 • Administrative Location & Attachments
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* District */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">District (जिला)</label>
                  <select
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setBlock(BIHAR_DISTRICTS[e.target.value]?.[0] || 'Sadar');
                    }}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {BIHAR_DISTRICT_NAMES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Block */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Block / Anchal (प्रखंड / अंचल)</label>
                  <select
                    value={block}
                    onChange={(e) => setBlock(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {availableBlocks.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Gram Panchayat */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Gram Panchayat / Ward (ग्राम पंचायत)</label>
                  <input
                    type="text"
                    value={panchayat}
                    onChange={(e) => setPanchayat(e.target.value)}
                    placeholder="e.g. Rampur Diara"
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Geolocation Detector */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">GPS Coordinates</p>
                    <p className="text-xs text-slate-500 font-mono">{gpsStatus}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDetectLocation}
                  className="w-full sm:w-auto px-4 py-2.5 min-h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors border border-slate-300 shrink-0"
                >
                  Auto-Detect My GPS Location
                </button>
              </div>

              {/* Photo Attachment */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Site Photo / Document Evidence (Optional)
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="cursor-pointer px-4 py-3 min-h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center space-x-2 border border-slate-300">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>Upload Site Photo</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>

                  {photoPreview && (
                    <div className="relative group">
                      <img
                        src={photoPreview}
                        alt="Photo Preview"
                        className="w-16 h-16 object-cover rounded-xl border-2 border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoPreview(null)}
                        className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Voice Note Recording, Written Details & Submit */}
            <div className="card-elevated rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider block">
                      Step 3 of 3 • Record Issue Audio & Auto-Send
                    </span>
                    {!isAadhaarVerified && (
                      <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-300 flex items-center space-x-1">
                        <Lock className="w-3 h-3 text-rose-600" />
                        <span>Locked until Aadhaar Verified</span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">
                    Record Audio Note in Bhojpuri, Magahi, Maithili, Hindi, or Urdu
                  </h3>
                </div>
              </div>

              {/* Live Audio Recorder Console */}
              <div className="bg-linear-to-br from-slate-900 to-slate-950 rounded-2xl p-6 text-white space-y-6 relative overflow-hidden">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  {/* Mic Recorder Control */}
                  <div className="flex items-center space-x-4">
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      className={`w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl flex items-center justify-center transition-all shadow-xl ${
                        isRecording
                          ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/50 ring-4 ring-rose-500/30'
                          : !isAadhaarVerified
                          ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 ring-2 ring-slate-600/50'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                      }`}
                    >
                      {isRecording ? (
                        <Square className="w-7 h-7" />
                      ) : !isAadhaarVerified ? (
                        <Lock className="w-6 h-6 text-amber-300" />
                      ) : (
                        <Mic className="w-7 h-7" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-bold text-white">
                          {isRecording ? 'Recording Voice Note...' : audioUrl ? 'Voice Note Captured' : 'Click Mic to Record'}
                        </p>
                        {isRecording && (
                          <span className="inline-flex items-center space-x-1 bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-500/30">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                            <span>Listening & Transcribing</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRecording
                          ? `Timer: 00:${recordingTime < 10 ? `0${recordingTime}` : recordingTime} • Speak naturally in your own language`
                          : audioUrl
                          ? 'Audio captured! Click Translate & Send or re-record.'
                          : 'Click the mic and speak in your own language — it is detected automatically.'}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Auto-Send Toggle */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    {/* Auto-Translate Toggle */}
                    <label className="flex items-center justify-center sm:justify-start space-x-2 bg-slate-800/90 hover:bg-slate-800 px-3 py-2.5 sm:py-2 min-h-11 rounded-xl border border-slate-700/80 cursor-pointer text-xs font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={autoSendOnStop}
                        onChange={(e) => setAutoSendOnStop(e.target.checked)}
                        className="rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 h-4 w-4 shrink-0"
                      />
                      <span>Auto-Translate & Send on Finish</span>
                    </label>

                    {/* Playback Control if recorded */}
                    {audioUrl && (
                      <button
                        type="button"
                        onClick={togglePlayAudio}
                        className="px-3.5 py-2.5 sm:py-2 min-h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 border border-slate-700"
                      >
                        {isPlayingAudio ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlayingAudio ? 'Pause' : 'Listen'}</span>
                      </button>
                    )}

                    {/* Direct Translate & Send Button */}
                    <button
                      type="button"
                      onClick={() => processGrievanceSubmission()}
                      className="px-4 py-2.5 sm:py-2 min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all shadow-md flex items-center justify-center space-x-1.5 sm:ml-auto"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>Translate & Send to Department</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Written Text Area */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Written Complaint Details (Optional / Supplementary)
                </label>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={4}
                  placeholder="Describe your grievance in your own language — Bhojpuri, Magahi, Maithili, Hindi, Urdu or English."
                  className="w-full rounded-2xl border border-slate-300 p-4 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                ></textarea>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isAnalyzing}
                className="w-full py-4 rounded-2xl bg-linear-to-r from-emerald-700 via-emerald-600 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white font-extrabold text-base shadow-xl shadow-emerald-800/30 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                <span>Process Grievance with AI & Submit</span>
              </button>
            </div>

            {/* Loading Analysis Modal Overlay */}
            {isAnalyzing && (
              <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-spin">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Analyzing Grievance</h3>
                    <p className="text-xs text-amber-400 font-mono mt-1">{analysisStep}</p>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full animate-pulse w-3/4"></div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Routing to lowest appropriate tier (Gram Panchayat / Block BDO / Sub-Division SDO / District DM)...
                  </p>
                </div>
              </div>
            )}
          </form>
        )
      ) : (
        /* TRACK TICKET STATUS VIEW */
        <div className="space-y-8">
          <div className="card-elevated rounded-3xl p-6 sm:p-8 space-y-6">
            <h3 className="text-xl font-bold text-slate-900">
              Track Grievance Status (शिकायत की स्थिति जांचें)
            </h3>
            <p className="text-xs text-slate-500">
              Enter the tracking ID from your acknowledgement slip, e.g. #BHR-12345.
            </p>

            <form onSubmit={handleSearchComplaint} className="flex flex-col sm:flex-row gap-3 max-w-xl">
              <input
                type="text"
                value={trackingSearchInput}
                onChange={(e) => setTrackingSearchInput(e.target.value)}
                placeholder="e.g. #BHR-84920"
                className="flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 min-h-11 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-md transition-colors disabled:opacity-60"
              >
                {isSearching ? 'Searching…' : 'Track Status'}
              </button>
            </form>

            <p className="pt-2 text-xs text-slate-400 font-medium">
              Enter the <span className="mono font-bold">#BHR-XXXXX</span> ID issued when the
              grievance was filed — from the web portal or a Common Service Centre kiosk.
            </p>

            {trackingError && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 font-medium">
                {trackingError}
              </div>
            )}
          </div>

          {/* Tracked Ticket Details */}
          {trackedComplaint && (
            <div className="card-elevated rounded-3xl p-6 sm:p-8 space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                      {trackedComplaint.assigned_department}
                    </span>
                    <span className="text-xs text-slate-500">
                      Submitted on {new Date(trackedComplaint.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 wrap-break-word">
                    Ticket <span className="font-mono text-amber-700">{trackedComplaint.tracking_id}</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Location: {trackedComplaint.landmark_or_location}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-slate-400 block">Assigned Hierarchy Tier</span>
                  <span className="inline-block text-sm font-extrabold text-slate-900 bg-amber-100 px-3 py-1 rounded-xl mt-1 sm:mt-0">
                    {trackedComplaint.administrative_tier}
                  </span>
                </div>
              </div>

              {/* Linked grievances from the same compound report */}
              {trackedComplaint.related && trackedComplaint.related.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-300 rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-black text-indigo-900 uppercase tracking-wide">
                    {trackedComplaint.grievance_part_index && trackedComplaint.grievance_part_count
                      ? `Part ${trackedComplaint.grievance_part_index} of ${trackedComplaint.grievance_part_count} — linked grievances`
                      : 'Linked grievances from the same report'}
                  </p>
                  <p className="text-xs text-indigo-900 leading-relaxed">
                    Your original report covered more than one issue and was filed as one ticket per
                    department. The other tickets from that report:
                  </p>
                  <ul className="space-y-1.5">
                    {trackedComplaint.related.map((rel) => (
                      <li key={rel.tracking_id}>
                        <button
                          type="button"
                          onClick={() => handleSearchComplaint(undefined, rel.tracking_id)}
                          className="flex flex-wrap items-center gap-2 text-xs text-left hover:underline"
                        >
                          <span className="mono font-black text-indigo-800">{rel.tracking_id}</span>
                          <span className="text-indigo-400">·</span>
                          <span className="font-bold text-slate-700">{rel.assigned_department}</span>
                          <span className="text-indigo-400">·</span>
                          <span className="text-slate-500">{rel.status}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <NatureNotice complaint={trackedComplaint} audience="citizen" />

              {/* Status Timeline */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
                  Statutory Resolution Timeline
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {(['Submitted', 'Under Review', 'Inspected', 'In Progress', 'Resolved'] as const).map(
                    (st, idx) => {
                      const statuses = ['Submitted', 'Under Review', 'Inspected', 'In Progress', 'Resolved'];
                      const currentIdx = statuses.indexOf(trackedComplaint.status);
                      const isCompleted = idx <= currentIdx;
                      const isCurrent = idx === currentIdx;

                      return (
                        <div
                          key={st}
                          className={`p-3 rounded-2xl border transition-all text-center ${
                            isCurrent
                              ? 'bg-amber-500 text-white border-amber-600 shadow-md font-bold'
                              : isCompleted
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 font-semibold'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          <div className="text-[10px] uppercase font-mono">Step {idx + 1}</div>
                          <div className="text-xs mt-0.5">{st}</div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Grievance Details & Officer Remarks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                  <h5 className="text-xs font-bold text-slate-500 uppercase">Original Complaint Summary</h5>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium">
                    "{trackedComplaint.translated_summary}"
                  </p>
                  <p className="text-xs text-slate-500">
                    Language: <span className="font-bold text-slate-700">{trackedComplaint.detected_language}</span>
                  </p>
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
                  <h5 className="text-xs font-bold text-amber-400 uppercase">Official Action Log & Remarks</h5>
                  {trackedComplaint.official_notes && trackedComplaint.official_notes.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {trackedComplaint.official_notes.map((note, nIdx) => (
                        <p key={nIdx} className="text-xs text-slate-300 leading-relaxed font-mono border-b border-slate-800 pb-1.5">
                          {note}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No officer notes recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Aadhaar Required Nudge — Step 1 above already carries the full
          identity + Aadhaar OTP form, so this just points back to it instead
          of duplicating it. */}
      {showAadhaarAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="card-elevated rounded-3xl max-w-sm w-full p-6 space-y-5 shadow-2xl relative animate-in fade-in">
            <button
              type="button"
              onClick={() => setShowAadhaarAuthModal(false)}
              className="absolute top-3 right-3 p-2 min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2 pt-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center shadow-sm">
                <Fingerprint className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Complete Step 1 First</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Under the state's Public Grievance Redressal Rules, citizens must complete Aadhaar
                e-KYC before recording a voice note or submitting a grievance.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAadhaarAuthModal(false);
                identityStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="w-full py-3 rounded-xl brand-gradient hover:opacity-90 text-white font-bold text-xs shadow-md transition-opacity flex items-center justify-center space-x-2"
            >
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent-400)' }} />
              <span>Go to Step 1</span>
            </button>
          </div>
        </div>
      )}

      {/* Aadhaar OTP Verification Modal */}
      {showAadhaarOtpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="card-elevated rounded-3xl max-w-sm w-full p-5 sm:p-6 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowAadhaarOtpModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2 pt-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Enter Aadhaar OTP</h3>
              <p className="text-xs text-slate-500">
                {otpDelivery === 'sms' ? (
                  <>
                    A 6-digit OTP was sent to{' '}
                    <span className="font-mono font-bold text-slate-800">{otpMaskedMobile}</span>,
                    linked to Aadhaar{' '}
                    <span className="font-mono font-bold text-slate-800">{aadhaarMaskedNumber}</span>.
                  </>
                ) : (
                  <>
                    Verifying Aadhaar{' '}
                    <span className="font-mono font-bold text-slate-800">{aadhaarMaskedNumber}</span>.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-4">
              {/* Sandbox mode: no SMS provider is configured, so the server
                  returns the code it generated instead of texting it. */}
              {otpDelivery === 'sandbox' && otpSandboxCode && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-center space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                    Sandbox e-KYC — no SMS provider configured
                  </p>
                  <p className="font-mono text-2xl font-black tracking-[0.3em] text-amber-900">
                    {otpSandboxCode}
                  </p>
                  <p className="text-[10px] text-amber-800">
                    Configure Twilio to deliver this to the citizen's handset instead.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 text-center">
                  6-Digit OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={aadhaarOtpInput}
                  onChange={(e) => {
                    setAadhaarOtpInput(e.target.value);
                    setAadhaarError('');
                  }}
                  maxLength={6}
                  placeholder="——————"
                  className="w-full text-center tracking-widest text-xl font-mono rounded-xl border border-slate-300 p-3 focus:ring-2 focus:ring-emerald-600 outline-none"
                />
                <p className="text-[10px] text-center mt-1.5 font-semibold text-slate-500">
                  {otpSecondsLeft > 0 ? (
                    <>
                      Expires in{' '}
                      <span className="mono font-bold text-slate-700">
                        {Math.floor(otpSecondsLeft / 60)}:
                        {String(otpSecondsLeft % 60).padStart(2, '0')}
                      </span>
                    </>
                  ) : (
                    <span className="text-rose-600">This OTP has expired — request a new one.</span>
                  )}
                </p>
                {aadhaarError && (
                  <p className="text-xs text-rose-600 font-semibold mt-1.5 text-center">
                    {aadhaarError}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleVerifyOtpSubmit}
                disabled={isAadhaarVerifying || otpSecondsLeft <= 0}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isAadhaarVerifying ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isAadhaarVerifying ? 'Verifying…' : 'Confirm OTP'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAadhaarOtpModal(false);
                  setAadhaarOtpInput('');
                  setAadhaarError('');
                }}
                className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-slate-700"
              >
                Use a different Aadhaar number
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
