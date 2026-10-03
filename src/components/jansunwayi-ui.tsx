// Shared JanSunwayi AI design-system pieces:
// buttons, brand mark, public + in-app headers, badges, empty states, metrics.
import React, { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  ChevronRight,
  CircleUserRound,
  LogOut,
  Menu,
  Mic,
  MonitorCog,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCheck,
  X,
} from 'lucide-react';
import { Link } from '../lib/router';
import { cn } from '../lib/utils';
import type { StoryImage } from '../data/storyImages';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'navy' | 'danger';
type ButtonSize = 'default' | 'icon' | 'large';

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-button px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-button hover:bg-primary-hover',
  secondary: 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  navy: 'bg-brand text-brand-foreground hover:bg-brand-soft',
  danger: 'bg-destructive text-destructive-foreground hover:opacity-90',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: 'h-12',
  icon: 'size-12 px-0',
  large: 'min-h-14 px-7 text-base',
};

export function buttonStyles({ variant = 'primary', size = 'default' }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size]);
}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link to="/" className={cn('flex items-center gap-3 font-bold', inverse ? 'text-brand-foreground' : 'text-brand')} aria-label="JanSunwayi AI home">
      <span className={cn('grid size-10 place-items-center rounded-xl', inverse ? 'bg-primary text-primary-foreground' : 'bg-brand text-brand-foreground')}>
        <span className="relative">
          <Mic className="size-5" />
          <span className="absolute -bottom-1 -right-1 size-2 rounded-sm bg-primary" />
        </span>
      </span>
      <span className="leading-tight">
        <span className="block text-[15px]">JanSunwayi AI</span>
        <span className="block font-devanagari text-[11px] font-medium opacity-70">जनसुनवाई AI</span>
      </span>
    </Link>
  );
}

/** Live backend health from /api/health — drives the "System Active" dot. */
export function useSystemHealth() {
  const [state, setState] = useState<'checking' | 'up' | 'degraded' | 'down'>('checking');
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch('/api/health')
        .then((r) => r.json())
        .then((h) => !cancelled && setState(h.databaseConnected ? 'up' : 'degraded'))
        .catch(() => !cancelled && setState('down'));
    check();
    const id = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return state;
}

export function SystemStatus() {
  const state = useSystemHealth();
  const label = { checking: 'Checking…', up: 'System Active', degraded: 'Degraded', down: 'Offline' }[state];
  const dot = { checking: 'bg-muted-foreground', up: 'bg-success animate-soft-pulse', degraded: 'bg-warning', down: 'bg-destructive' }[state];
  return (
    <span className="flex items-center gap-1.5" role="status">
      <span className={cn('size-2 rounded-full', dot)} /> {label}
    </span>
  );
}

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="border-b border-primary/15 bg-secondary px-4 py-2 text-brand">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-xs">
          <span>Government Grievance Portal</span>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">English · <span className="font-devanagari">हिन्दी</span> · <span className="font-urdu">اردو</span></span>
            <SystemStatus />
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
            <Link to="/#how" className="nav-link">How it works</Link>
            <Link to="/#features" className="nav-link">Features</Link>
            <Link to="/#government" className="nav-link">For Governments</Link>
            <Link to="/track" className="nav-link">Track Grievance</Link>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Link to="/official" className={buttonStyles({ variant: 'ghost' })}>Official Login</Link>
            <Link to="/file" className={buttonStyles({ variant: 'primary' })}>
              <Mic className="size-4" /> File a Grievance
            </Link>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        {open && (
          <div className="border-t border-border bg-background p-4 md:hidden">
            <div className="grid gap-2" onClick={() => setOpen(false)}>
              <Link to="/#how" className="mobile-link">How it works</Link>
              <Link to="/#features" className="mobile-link">Features</Link>
              <Link to="/track" className="mobile-link">Track grievance</Link>
              <Link to="/official" className="mobile-link">Official login</Link>
              <Link to="/file" className={buttonStyles({ variant: 'primary' })}>File a Grievance</Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}

const APP_LINKS = [
  { to: '/file', label: 'Citizen Portal', hindi: 'नागरिक', icon: CircleUserRound },
  { to: '/official', label: 'Official Dashboard', hindi: 'अधिकारी', icon: Building2 },
  { to: '/analytics', label: 'CMO Monitor', icon: BarChart3 },
  { to: '/admin', label: 'Admin', icon: MonitorCog },
] as const;

export interface ShellAccount {
  name: string;
  detail: string;
  warn: boolean;
}

interface AppShellProps {
  children: ReactNode;
  /** Signed-in account for the current surface, if any. */
  account: ShellAccount | null;
  /** Which login the current surface offers when signed out (null = none, e.g. Admin has its own). */
  loginLabel: string | null;
  onLogin: () => void;
  onLogout: () => void;
}

export function AppShell({ children, account, loginLabel, onLogin, onLogout }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Application areas">
            {APP_LINKS.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="app-tab" activeClassName="app-tab-active">
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/kiosk" className={buttonStyles({ variant: 'secondary' })} title="Full-screen walk-up kiosk (Common Service Centre)">
              <Store className="size-4" />
              <span className="hidden sm:inline">Kiosk mode</span>
            </Link>
            {account ? (
              <div className="flex items-center gap-1.5">
                <div className="hidden h-12 items-center gap-2.5 rounded-button border border-border bg-muted/60 px-3 sm:flex">
                  {account.warn ? <ShieldAlert className="size-4 shrink-0 text-destructive" /> : <UserCheck className="size-4 shrink-0 text-link" />}
                  <div className="min-w-0 leading-tight">
                    <p className="max-w-36 truncate text-xs font-bold">{account.name}</p>
                    <p className={cn('max-w-36 truncate text-[10px]', account.warn ? 'text-destructive' : 'text-muted-foreground')}>{account.detail}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Log out" title="Log out">
                  <LogOut className="size-5" />
                </Button>
              </div>
            ) : loginLabel ? (
              <Button onClick={onLogin}>
                <UserCheck className="size-4" />
                <span className="hidden sm:inline">{loginLabel}</span>
              </Button>
            ) : null}
          </div>
        </div>
        {/* Area tabs move below the brand row on smaller screens. */}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-border px-2 py-1.5 lg:hidden" aria-label="Application areas">
          {APP_LINKS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="app-tab shrink-0" activeClassName="app-tab-active">
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 pb-16">{children}</main>
      <footer className="no-print bg-brand py-6 text-center text-xs text-brand-foreground/70">
        <div className="page-shell space-y-1">
          <p className="font-bold text-brand-foreground">JanSunwayi AI • State Right to Public Grievance Redressal framework</p>
          <p>Voice AI intake in regional languages · Web / Mobile / Kiosk</p>
        </div>
      </footer>
    </div>
  );
}

export function PriorityBadge({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  const names = ['', 'Minor', 'Low', 'Medium', 'High', 'Critical'];
  return <span className={`priority priority-${level}`}>P{level} · {names[level]}</span>;
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span className="status-chip">
      <Activity className="size-3.5" />
      {status}
    </span>
  );
}

export function EmptyState({ icon: Icon = ShieldCheck, title, body, action }: { icon?: React.ElementType; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SectionHeading({ kicker, title, body, align = 'center' }: { kicker: string; title: string; body?: string; align?: 'center' | 'left' }) {
  return (
    <div className={cn('mb-10 max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <p className="eyebrow">{kicker}</p>
      <h2 className="display-title mt-3 text-3xl font-bold leading-tight text-brand sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-base leading-7 text-muted-foreground">{body}</p>}
    </div>
  );
}

export function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: React.ElementType }) {
  return (
    <div className="metric">
      <div className="flex items-start justify-between">
        <p>{label}</p>
        <Icon className="size-5 text-primary" />
      </div>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}

export function ArrowLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-link">
      {children}
      <ChevronRight className="size-4" />
    </span>
  );
}

/** A story photo from STORY_IMAGES, cropped to fill its box. */
export function StoryPhoto({ image, className, eager = false }: { image: StoryImage; className?: string; eager?: boolean }) {
  return (
    <img
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('size-full object-cover', className)}
      style={{ objectPosition: image.position }}
    />
  );
}

/** Page banner over a story photo — the in-app counterpart of the landing
 *  hero, so every surface shares the same photographic language. */
export function PhotoBanner({ image, children, className }: { image: StoryImage; children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative isolate overflow-hidden rounded-2xl bg-(--brand-950) text-white shadow-md', className)}>
      {/* The photo fills the right of the banner and fades into solid navy
          behind the text, so the subject stays visible at any crop. */}
      <div className="absolute inset-y-0 right-0 -z-10 w-full md:w-[60%]">
        <StoryPhoto image={image} eager />
        <div className="photo-fade-left absolute inset-0" aria-hidden />
      </div>
      <div className="p-6 sm:p-8 md:max-w-[58%]">{children}</div>
    </div>
  );
}

/** Sign-in / waiting gate: photo with a caption on one side, the message on
 *  the other. Used where a surface is locked behind its own login. */
export function PhotoGate({
  image,
  caption,
  captionHindi,
  children,
}: {
  image: StoryImage;
  caption: string;
  captionHindi?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="surface-card grid overflow-hidden md:grid-cols-[1.05fr_1fr]">
        <figure className="relative min-h-56 md:min-h-[420px]">
          <StoryPhoto image={image} eager className="absolute inset-0" />
          <figcaption className="photo-scrim-bottom absolute inset-x-0 bottom-0 p-5 pt-16 text-white">
            {captionHindi && <p className="font-devanagari text-lg font-bold leading-snug">{captionHindi}</p>}
            <p className="mt-1 text-xs text-white/80">{caption}</p>
          </figcaption>
        </figure>
        <div className="flex flex-col justify-center gap-6 p-6 text-center sm:p-10 md:text-left">{children}</div>
      </div>
    </div>
  );
}
