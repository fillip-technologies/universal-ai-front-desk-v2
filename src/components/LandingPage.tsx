// Public landing page (route "/"). Every figure shown here is a fixed
// capability of the system (languages, departments, escalation window) — no
// grievance counts or outcomes are invented.
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsLeftRight,
  Quote,
  Fingerprint,
  Globe2,
  Languages,
  LockKeyhole,
  Mic,
  Network,
  PenLine,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  TimerReset,
  Workflow,
} from 'lucide-react';
import { Link } from '../lib/router';
import { Brand, PublicHeader, SectionHeading, StoryPhoto, buttonStyles } from './jansunwayi-ui';
import { STORY_IMAGES } from '../data/storyImages';

const FILING_WAYS = [
  [Smartphone, 'Web & mobile', 'File from any browser, even on a basic connection.'],
  [Mic, 'Speak naturally', 'Record your grievance in any of six supported languages.'],
  [Store, 'CSC kiosk', 'Assisted filing at a Common Service Centre near you.'],
  [PenLine, 'Write it down', 'Prefer typing? Describe the issue in your own words and script.'],
] as const;

const FEATURES = [
  [Languages, 'Multilingual voice AI', 'Understands Hindi, Bhojpuri, Maithili, Magahi, Urdu and English.'],
  [Network, 'Smart department routing', 'Directs each issue to the responsible department and administrative tier.'],
  [TimerReset, '48-hour escalation', 'No officer action triggers the next rung, with a complete audit trail.'],
  [Fingerprint, 'Protected identity', 'Aadhaar e-KYC verifies identity; only the masked last four digits are retained.'],
  [Workflow, 'Compound grievances', 'One complaint involving multiple departments becomes linked, trackable tickets.'],
  [ShieldCheck, 'Statutory clock', 'Working days remaining are visible from filing through hearing and redressal.'],
] as const;

const STEPS = [
  ['01', 'Speak or type', 'Share what happened in your own language.'],
  ['02', 'AI understands', 'Translates, summarises and identifies the right department.'],
  ['03', 'An officer acts', 'The right local official receives the case immediately.'],
  ['04', 'Track to resolution', 'Follow every action within the statutory timeline.'],
] as const;

const LADDER = ['Police Station · SHO', 'Sub-Division · DSP', 'District · SP', 'Police Headquarters', 'CMO Cell'];

const FAQ: Array<[string, string]> = [
  ['Do I need to know English?', 'No. Speak or type in any supported language; the system translates for the receiving office.'],
  ['What if no one responds?', 'After 48 hours without action, the grievance automatically escalates to the next authority.'],
  ['Is my Aadhaar safe?', 'Only a masked form with the last four digits is retained. Full Aadhaar numbers are never displayed.'],
  ['What happens after 60 working days?', 'The statutory appeal pathway remains available through the prescribed authorities.'],
  ['Can I file without a smartphone?', 'Yes. Visit a Common Service Centre kiosk, where the operator helps you record and verify your grievance.'],
  ['Can one grievance involve several departments?', 'Yes. It becomes linked tickets so each responsible department can act independently.'],
];

const DEMO_STAGES = ['Voice captured', 'English summary', 'Routed & scored', 'Tracking issued'];
const WAVE = [18, 30, 42, 25, 48, 36, 22, 44, 30, 18, 38, 28];

/** Illustrative walkthrough of one grievance — explicitly labelled DEMO. */
function ProductDemo() {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = window.setInterval(() => setStage((s) => (s + 1) % DEMO_STAGES.length), 2800);
    return () => window.clearInterval(id);
  }, [paused, reduceMotion]);

  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-label="Illustration of a grievance being processed">
      <div className="absolute -inset-4 rounded-2xl border border-primary/20 bg-primary/5" />
      <div className="magazine-card relative overflow-hidden rounded-xl bg-background/90 p-3 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <Brand />
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold text-success">DEMO</span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex justify-center gap-1.5 py-5" aria-hidden>
            {WAVE.map((h, i) => (
              <span key={i} className="voice-bar w-1 rounded-full bg-primary" style={{ height: h, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <p className="text-center font-devanagari text-sm text-muted-foreground">“हमारे गाँव में तीन दिन से बिजली नहीं है…”</p>
          <div className="mt-6 grid grid-cols-4 gap-1">
            {DEMO_STAGES.map((label, i) => (
              <button
                key={label}
                onClick={() => {
                  setStage(i);
                  setPaused(true);
                }}
                className="min-h-12 text-center text-[10px] font-semibold text-muted-foreground"
                aria-pressed={stage === i}
              >
                <span className={`mx-auto mb-2 grid size-6 place-items-center rounded-full ${i <= stage ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {i < stage ? <Check className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 min-h-28 rounded-xl border border-border bg-muted/60 p-4"
              aria-live="polite"
            >
              {stage === 0 && (
                <>
                  <p className="text-xs font-bold text-link">BHOJPURI DETECTED</p>
                  <p className="mt-2 text-sm">Voice recording ready for transcription.</p>
                </>
              )}
              {stage === 1 && (
                <>
                  <p className="text-xs font-bold text-link">ENGLISH SUMMARY</p>
                  <p className="mt-2 text-sm">Village electricity supply disrupted for three days.</p>
                </>
              )}
              {stage === 2 && (
                <>
                  <p className="text-xs font-bold text-link">ROUTING</p>
                  <p className="mt-2 text-sm font-semibold">Energy Dept → JE Section Office</p>
                  <span className="mt-3 inline-flex rounded-full bg-destructive/10 px-2 py-1 font-mono text-xs font-bold text-destructive">PRIORITY 4 · HIGH</span>
                </>
              )}
              {stage === 3 && (
                <>
                  <p className="text-xs font-bold text-success">GRIEVANCE REGISTERED</p>
                  <p className="mt-2 font-mono text-lg font-bold">JSW-DEMO-2026</p>
                  <p className="mt-1 text-xs text-muted-foreground">Illustrative ID · not a real case</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const PAIN_POINTS = [
  ['A day’s wages lost', 'to travel to the block office — often more than once for the same application.'],
  ['Forms in a language that isn’t yours', 'so the problem is written down by someone else, or not at all.'],
  ['No reply, no receipt', 'and no way to know whether anyone has read it, or who to ask next.'],
] as const;

/** Before / after compare slider. The range input carries all interaction,
 *  so it works with keyboard and screen readers as well as drag. */
function BeforeAfter() {
  const [pos, setPos] = useState(50);
  return (
    <div className="photo-frame relative mx-auto aspect-[786/992] w-full max-w-[520px] select-none">
      <StoryPhoto image={STORY_IMAGES.afterKiosk} className="absolute inset-0" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <StoryPhoto image={STORY_IMAGES.beforeUnheard} className="absolute inset-0" />
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur">
        <span className="font-devanagari">पहले</span> · Before
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-success px-3 py-1 text-xs font-bold text-white">
        <span className="font-devanagari">अब</span> · After
      </span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,.4)]" style={{ left: `${pos}%` }} aria-hidden>
        <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-brand shadow-lg">
          <ChevronsLeftRight className="size-5" />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Drag to compare before and after"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}

/** Stylised preview of the CMO monitor. Capability figures only; the bars are
 *  decorative and captioned as such. */
function DashboardPreview() {
  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div>
          <p className="text-xs font-bold text-link">MASTER MONITOR</p>
          <p className="mt-1 font-bold">Statewide overview</p>
        </div>
        <span className="status-chip">Live system</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border">
        {[
          ['Departments', '28'],
          ['Languages', '6'],
          ['Escalation', '48h'],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-4">
            <span className="text-xs text-muted-foreground">{label}</span>
            <b className="mt-2 block font-mono text-2xl">{value}</b>
          </div>
        ))}
      </div>
      <div className="p-6">
        <div className="flex h-44 items-end gap-3" aria-hidden>
          {[38, 55, 45, 73, 62, 84, 69, 92].map((h, i) => (
            <span key={i} className="flex-1 rounded-t bg-link/80" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>District performance view</span>
          <span>Illustrative preview</span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="bg-background">
      <PublicHeader />
      <main>
        <section className="relative isolate overflow-hidden text-white">
          <StoryPhoto image={STORY_IMAGES.handsRaised} eager className="absolute inset-0 -z-20" />
          <div className="photo-scrim absolute inset-0 -z-10" aria-hidden />
          <div className="page-shell flex min-h-[640px] flex-col justify-center py-20 lg:min-h-[720px]">
            <p className="mb-6 inline-flex w-fit items-center gap-2 border-b border-white/30 pb-2 text-xs font-bold uppercase text-white/85">
              <Globe2 className="size-4" />
              Built for every citizen, in every voice
            </p>
            <h1 className="display-title max-w-3xl text-5xl font-extrabold leading-[1.03] sm:text-6xl lg:text-7xl">
              Every voice,
              <br />
              <span className="text-(--accent-400)">finally heard.</span>
            </h1>
            <p className="mt-6 font-devanagari text-2xl font-semibold text-white/90 sm:text-3xl">हर आवाज़ की सुनवाई।</p>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/80">
              Too many grievances never reach the desk that can fix them. JanSunwayi AI lets a citizen speak in their own
              language, sends the complaint to the right officer, and keeps it moving until action is taken.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/file" className={buttonStyles({ variant: 'primary', size: 'large' })}>
                <Mic className="size-5" />
                Speak your grievance
              </Link>
              <Link to="/track" className={`${buttonStyles({ size: 'large' })} border border-white/40 !bg-white/10 text-white !shadow-none backdrop-blur hover:!bg-white/20`}>
                <Search className="size-5" />
                Track by ID
              </Link>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-y-4 border-t border-white/25 pt-5 text-xs font-bold text-white/90 sm:grid-cols-4">
              <span>6 languages</span>
              <span>28 departments</span>
              <span>48h escalation</span>
              <span>60-day clock</span>
            </div>
          </div>
        </section>

        {/* Chapter 1 — the problem */}
        <section className="section-pad">
          <div className="page-shell grid items-center gap-12 lg:grid-cols-[1.15fr_.85fr]">
            <figure className="photo-frame aspect-[16/10]">
              <StoryPhoto image={STORY_IMAGES.waitingOffice} />
            </figure>
            <div>
              <p className="chapter-tag">Chapter 1 · Unheard</p>
              <h2 className="display-title mt-4 text-3xl font-bold leading-tight text-brand sm:text-4xl">
                For too long, a complaint meant a queue — and then silence.
              </h2>
              <p className="mt-4 font-devanagari text-xl font-semibold text-brand/70">कतार लंबी, सुनवाई नहीं।</p>
              <ul className="mt-8 grid gap-5">
                {PAIN_POINTS.map(([title, body]) => (
                  <li key={title} className="border-l-2 border-primary/40 pl-4">
                    <p className="font-bold text-brand">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Chapter 2 — the change */}
        <section className="sky-band section-pad border-y border-border">
          <div className="page-shell grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="chapter-tag">Chapter 2 · Heard</p>
              <h2 className="display-title mt-4 text-3xl font-bold leading-tight text-brand sm:text-4xl">
                Same citizen. Same problem. A different answer.
              </h2>
              <p className="mt-4 font-devanagari text-xl font-semibold text-brand/70">अर्ज़ी हाथ में थी, अब रसीद हाथ में है।</p>
              <p className="mt-6 max-w-xl leading-7 text-muted-foreground">
                At the Common Service Centre down the road, he speaks his complaint in his own words. The operator verifies his
                Aadhaar, the kiosk prints a tracking slip, and the right officer has it before he reaches home.
              </p>
              <p className="mt-6 text-sm font-semibold text-link">Drag the slider to see the difference →</p>
            </div>
            <BeforeAfter />
          </div>
        </section>

        {/* Chapter 3 — in your own language */}
        <section className="section-pad">
          <div className="page-shell grid items-center gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <figure className="photo-frame aspect-[4/5] w-full max-w-md justify-self-center lg:justify-self-start">
              <StoryPhoto image={STORY_IMAGES.voiceHandpump} />
              <figcaption className="photo-scrim-bottom absolute inset-x-0 bottom-0 p-5 pt-20 text-white">
                <Quote className="size-5 text-(--accent-400)" />
                <p className="mt-2 font-devanagari text-lg font-semibold leading-snug">“हमरा गाँव के चापाकल दस दिन से सूखल बा…”</p>
                <p className="mt-1 text-xs text-white/75">Spoken in Bhojpuri · understood by the system</p>
              </figcaption>
            </figure>
            <div>
              <p className="chapter-tag">Chapter 3 · Your language</p>
              <h2 className="display-title mt-4 text-3xl font-bold leading-tight text-brand sm:text-4xl">
                Speak the way you speak at home.
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                No forms, no English, no middleman. A voice note in Bhojpuri, Maithili or Magahi becomes a clear summary for the
                officer — routed, scored for urgency and given a tracking ID.
              </p>
              <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-lg font-bold text-brand">
                <span className="font-devanagari" lang="hi">हिन्दी</span>
                <span className="font-devanagari" lang="bho">भोजपुरी</span>
                <span className="font-devanagari" lang="mai">मैथिली</span>
                <span className="font-devanagari" lang="mag">मगही</span>
                <span className="font-urdu" dir="rtl" lang="ur">اردو</span>
                <span lang="en">English</span>
              </p>
              <div className="mt-10">
                <ProductDemo />
              </div>
            </div>
          </div>
        </section>

        <section className="section-pad">
          <div className="page-shell grid gap-12 lg:grid-cols-[.72fr_1.28fr]">
            <SectionHeading align="left" kicker="Accessible by design" title="Four ways to be heard" body="Choose the channel that works for you. Every route reaches the same accountable system." />
            <div className="grid gap-4 md:grid-cols-2">
              {FILING_WAYS.map(([Icon, title, body], i) => (
                <div key={title} className="magazine-card relative overflow-hidden rounded-lg p-6 transition hover:-translate-y-1">
                  <span className="number-watermark absolute right-4 top-1 text-7xl font-bold">0{i + 1}</span>
                  <span className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Icon />
                  </span>
                  <h3 className="relative mt-8 font-bold text-brand">{title}</h3>
                  <p className="relative mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="sky-band section-pad scroll-mt-20 border-y border-border">
          <div className="page-shell">
            <SectionHeading kicker="How it works" title="From your voice to the right desk" />
            <div className="grid gap-8 lg:grid-cols-4">
              {STEPS.map(([n, t, b], i) => (
                <div key={n} className="relative">
                  <span className="font-mono text-5xl font-bold text-primary/35">{n}</span>
                  <h3 className="mt-3 text-lg font-bold text-brand">{t}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{b}</p>
                  {i < STEPS.length - 1 && <ChevronRight className="absolute -right-5 top-5 hidden text-border lg:block" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="azure-band section-pad text-brand-foreground">
          <div className="page-shell grid items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="eyebrow !text-brand-foreground/80">Accountable by default</p>
              <h2 className="mt-3 text-4xl font-bold">No grievance gets forgotten.</h2>
              <p className="mt-5 max-w-xl leading-7 text-brand-foreground/70">
                When 48 hours pass without officer action, the case moves one rung higher. Every movement is timestamped and visible.
              </p>
            </div>
            <ol className="grid gap-2">
              {LADDER.map((x, i) => (
                <li key={x} className="flex min-h-15 items-center gap-4 rounded-xl border border-brand-foreground/12 bg-brand-foreground/5 px-5">
                  <span className="grid size-8 place-items-center rounded-lg bg-brand-foreground font-mono text-xs font-bold text-brand">{i + 1}</span>
                  <span className="font-semibold">{x}</span>
                  {i > 0 && <span className="ml-auto text-xs text-brand-foreground/75">after 48h</span>}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Chapter 4 — resolution */}
        <section className="relative isolate overflow-hidden text-white">
          <StoryPhoto image={STORY_IMAGES.waterOfHope} className="absolute inset-0 -z-20" />
          <div className="photo-scrim absolute inset-0 -z-10" aria-hidden />
          <div className="page-shell flex min-h-[520px] flex-col justify-center py-20">
            <p className="chapter-tag !text-white/85">Chapter 4 · Resolved</p>
            <h2 className="display-title mt-4 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
              When a village is heard, the water flows again.
            </h2>
            <p className="mt-4 font-devanagari text-2xl font-semibold text-white/90">जब सुनवाई होती है, गाँव बदलता है।</p>
            <p className="mt-6 max-w-xl leading-7 text-white/80">
              Every grievance carries a statutory clock and an officer's name. Citizens can see who holds their case, and the
              state can see where help is still waiting.
            </p>
            <div className="mt-8">
              <Link to="/file" className={buttonStyles({ variant: 'primary', size: 'large' })}>
                <Mic className="size-5" />
                Raise your voice
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="section-pad scroll-mt-20">
          <div className="page-shell">
            <SectionHeading kicker="Built for public service" title="Intelligence with accountability" />
            <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([Icon, t, b]) => (
                <div className="feature-cell p-7" key={t}>
                  <Icon className="size-6 text-link" />
                  <h3 className="mt-5 font-bold text-brand">{t}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="government" className="section-pad scroll-mt-20 bg-card">
          <div className="page-shell grid items-center gap-16 lg:grid-cols-2">
            <div>
              <SectionHeading
                align="left"
                kicker="For state governments"
                title="See the system. Improve the system."
                body="A statewide operating picture for faster intervention, fairer outcomes and measurable accountability — configurable for any Indian state."
              />
              <ul className="grid gap-3 text-sm">
                {[
                  'Live CMO monitoring and district performance league',
                  'AI early-warning for emerging civic issues',
                  'Department and statutory escalation visibility',
                  'Government-hosted data with no vendor lock-in',
                ].map((x) => (
                  <li key={x} className="flex gap-3">
                    <Check className="size-5 shrink-0 text-success" />
                    {x}
                  </li>
                ))}
              </ul>
              <Link to="/analytics" className={`mt-8 ${buttonStyles({ variant: 'navy' })}`}>
                Explore government view <ArrowRight className="size-4" />
              </Link>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section className="section-pad">
          <div className="page-shell grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
            <div className="azure-band rounded-lg p-8 text-brand-foreground">
              <LockKeyhole className="size-8 text-brand-foreground/80" />
              <h2 className="mt-7 text-3xl font-bold">Trust is infrastructure.</h2>
              <p className="mt-4 leading-7 text-brand-foreground/70">
                Masked Aadhaar handling, government-controlled data, role-based access and an audit trail for every action.
              </p>
            </div>
            <div>
              <p className="eyebrow">Frequently asked</p>
              <div className="mt-4 divide-y divide-border border-y border-border">
                {FAQ.map(([q, a]) => (
                  <details key={q} className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left font-semibold [&::-webkit-details-marker]:hidden">
                      {q}
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                    </summary>
                    <p className="pb-4 leading-6 text-muted-foreground">{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-brand py-12 text-brand-foreground">
        <div className="page-shell grid gap-10 md:grid-cols-3">
          <div>
            <Brand inverse />
            <p className="mt-5 max-w-sm text-sm leading-6 text-brand-foreground/60">Operates under the state’s Right to Public Grievance Redressal framework.</p>
          </div>
          <div className="grid content-start gap-2 text-sm">
            <strong>Citizen services</strong>
            <Link to="/file" className="hover:underline">File a grievance</Link>
            <Link to="/track" className="hover:underline">Track a grievance</Link>
            <Link to="/kiosk" className="hover:underline">Kiosk mode</Link>
          </div>
          <div className="grid content-start gap-2 text-sm">
            <strong>Governance</strong>
            <Link to="/official" className="hover:underline">Official dashboard</Link>
            <Link to="/analytics" className="hover:underline">CMO monitor</Link>
            <span className="text-brand-foreground/60">Accessibility statement</span>
            <span className="text-brand-foreground/60">Privacy &amp; data protection</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
