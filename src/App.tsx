import React, { useEffect, useState } from 'react';
import { CitizenPortal } from './components/CitizenPortal';
import { OfficialDashboard } from './components/OfficialDashboard';
import { AnalyticsView } from './components/AnalyticsView';
import { AdminDashboard } from './components/AdminDashboard';
import { KioskMode } from './components/KioskMode';
import { TicketDetailModal } from './components/TicketDetailModal';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './components/LandingPage';
import { AppShell, EmptyState, buttonStyles, type ShellAccount } from './components/jansunwayi-ui';
import { AuthRole, AuthSession, GrievanceComplaint } from './types';
import { restoreSessions, logout as logoutRequest, type Sessions } from './services/auth';
import { Link, navigate, usePathname } from './lib/router';

type Route =
  | { page: 'landing' }
  | { page: 'citizen'; trackingId?: string; track?: boolean }
  | { page: 'official' }
  | { page: 'analytics' }
  | { page: 'admin' }
  | { page: 'kiosk' }
  | { page: 'not-found' };

function matchRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return { page: 'landing' };
  if (clean === '/file') return { page: 'citizen' };
  if (clean === '/track') return { page: 'citizen', track: true };
  const track = clean.match(/^\/track\/([^/]+)$/);
  if (track) return { page: 'citizen', track: true, trackingId: decodeURIComponent(track[1]) };
  if (clean === '/official') return { page: 'official' };
  if (clean === '/analytics') return { page: 'analytics' };
  if (clean === '/admin') return { page: 'admin' };
  if (clean === '/kiosk') return { page: 'kiosk' };
  return { page: 'not-found' };
}

const TITLES: Record<Route['page'], string> = {
  landing: 'JanSunwayi AI — Every voice, heard',
  citizen: 'File a Grievance — JanSunwayi AI',
  official: 'Official Dashboard — JanSunwayi AI',
  analytics: 'CMO Monitor — JanSunwayi AI',
  admin: 'AI Engine Administration — JanSunwayi AI',
  kiosk: 'CSC Grievance Kiosk — JanSunwayi AI',
  'not-found': 'Page not found — JanSunwayi AI',
};

export default function App() {
  const path = usePathname();
  const route = matchRoute(path);

  // Citizen, official and CMO Monitor sessions are independent logins.
  const [sessions, setSessions] = useState<Sessions>({});
  const [sessionLoading, setSessionLoading] = useState(true);

  const [selectedTicket, setSelectedTicket] = useState<GrievanceComplaint | null>(null);
  const [authModalRole, setAuthModalRole] = useState<AuthRole | null>(null);
  const [complaintsVersion, setComplaintsVersion] = useState(0);

  useEffect(() => {
    restoreSessions()
      .then(setSessions)
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    document.title = route.page === 'citizen' && route.track ? 'Track a Grievance — JanSunwayi AI' : TITLES[route.page];
  }, [route.page, route.page === 'citizen' && route.track]);

  const currentOfficial = sessions.official?.official ?? null;
  const currentCitizen = sessions.citizen?.citizen ?? null;
  const currentCmo = sessions.cmo?.cmo ?? null;

  const handleAuthSuccess = (s: AuthSession) => {
    setSessions((prev) => ({ ...prev, [s.role]: s }));
    navigate(s.role === 'official' ? '/official' : s.role === 'cmo' ? '/analytics' : '/file');
  };

  // Signs out only the account that belongs to the page you are on.
  const handleLogout = async (role: AuthRole) => {
    await logoutRequest(role);
    setSessions((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
    if (role === 'citizen') navigate('/file');
  };

  // The public landing page and the kiosk don't depend on the session.
  if (route.page === 'landing') return <LandingPage />;
  // Kiosk mode takes over the full screen (Common Service Centre walk-up UI)
  if (route.page === 'kiosk') return <KioskMode onExit={() => navigate('/')} />;

  if (route.page === 'not-found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold text-brand">404</h1>
          <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
          <Link to="/" className={`mt-6 ${buttonStyles({ variant: 'primary' })}`}>
            Go home
          </Link>
        </div>
      </div>
    );
  }

  // The account control follows the surface you are on, and each surface has
  // its own login: the Citizen Portal (citizen), the Official Dashboard
  // (official) and the CMO Monitor (cmo). The Admin dashboard carries its own
  // separate login, so it shows none here.
  const authContext: AuthRole | null =
    route.page === 'citizen'
      ? 'citizen'
      : route.page === 'official'
      ? 'official'
      : route.page === 'analytics'
      ? 'cmo'
      : null;

  const account: ShellAccount | null =
    authContext === 'citizen' && currentCitizen
      ? { name: currentCitizen.name, detail: currentCitizen.mobile, warn: false }
      : authContext === 'official' && currentOfficial
      ? {
          name: currentOfficial.name,
          detail: currentOfficial.verified === false ? 'Pending HQ verification' : currentOfficial.designation,
          warn: currentOfficial.verified === false
        }
      : authContext === 'cmo' && currentCmo
      ? {
          name: currentCmo.name,
          detail: currentCmo.approved ? currentCmo.designation || 'CMO Monitor' : 'Awaiting admin approval',
          warn: !currentCmo.approved
        }
      : null;

  return (
    <AppShell
      account={account}
      loginLabel={
        authContext === 'citizen'
          ? 'Citizen Login'
          : authContext === 'official'
          ? 'Officer Login'
          : authContext === 'cmo'
          ? 'CMO Login'
          : null
      }
      onLogin={() => authContext && setAuthModalRole(authContext)}
      onLogout={() => authContext && handleLogout(authContext)}
    >
      {sessionLoading ? (
        <EmptyState title="Loading JanSunwayi AI…" body="Restoring your session." />
      ) : (
        <>
          {route.page === 'citizen' && (
            <CitizenPortal
              // Remount when the tracked ID changes so the lookup re-runs.
              key={route.trackingId ?? (route.track ? 'track' : 'file')}
              citizenUser={currentCitizen}
              onOpenAuthModal={() => setAuthModalRole('citizen')}
              onLogout={() => handleLogout('citizen')}
              initialSubTab={route.track ? 'track' : 'submit'}
              initialTrackingId={route.trackingId}
            />
          )}
          {route.page === 'official' && (
            <OfficialDashboard
              currentUser={currentOfficial}
              onSelectTicket={(ticket) => setSelectedTicket(ticket)}
              onOpenAuthModal={() => setAuthModalRole('official')}
              refreshKey={complaintsVersion}
            />
          )}
          {route.page === 'analytics' && (
            <AnalyticsView currentUser={currentCmo} onOpenAuthModal={() => setAuthModalRole('cmo')} />
          )}
          {route.page === 'admin' && <AdminDashboard />}
        </>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={(updated) => {
            setSelectedTicket(updated);
            setComplaintsVersion((v) => v + 1);
          }}
        />
      )}

      {/* Auth Modal (Login / Signup — Citizen or Official) */}
      {authModalRole && (
        <AuthModal
          initialRole={authModalRole}
          lockRole
          onClose={() => setAuthModalRole(null)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </AppShell>
  );
}
