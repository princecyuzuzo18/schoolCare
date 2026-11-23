import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, REDIRECT_TARGET_KEY, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EmergencyBanner } from './components/EmergencyBanner';
import { HealthIncidentModal } from './components/HealthIncidentModal';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import AiAssistantLauncher from './components/AiAssistantLauncher';

import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { AdmissionsPortalPage } from './pages/AdmissionsPortalPage';
import { AdmissionTrackingPage } from './pages/AdmissionTrackingPage';
import { StaffActivationPage } from './pages/StaffActivationPage';
import { AccountSignupPage } from './pages/AccountSignupPage';

import { api } from './services/api';
import { HealthIncident, Student, Guardian } from './types';
import { isTabAllowedForRole, resolveRequestedTab } from './rbac';
import { getNavItem, getQuickNavItems } from './navigation';
import { getRoute } from './routes';
import { AlertTriangle, Menu, X } from 'lucide-react';

function readHashTab(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return raw || null;
}

const MainApp: React.FC = () => {
  const { role, currentUser, isLoading, effectivePermissions, defaultDashboard } = useAuth();
  const { t } = useLanguage();

  const [currentTab, setCurrentTab] = useState<string>('landing');
  const [accessDeniedTab, setAccessDeniedTab] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<HealthIncident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Health Incident Modal
  const [activeModalIncident, setActiveModalIncident] = useState<HealthIncident | null>(null);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  const mainRef = useRef<HTMLElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const loadGlobalState = async () => {
    try {
      const [inc, stu, grd] = await Promise.all([
        api.getHealthIncidents(),
        api.getStudents(),
        api.getGuardians()
      ]);
      setIncidents(inc);
      setStudents(stu);
      setGuardians(grd);
    } catch (err) {
      console.error('Failed to load global state:', err);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setIncidents([]);
      setStudents([]);
      setGuardians([]);
      return;
    }
    loadGlobalState();
  }, [role, currentUser]);

  const handleNavigate = useCallback((tab: string) => {
    const nextTab = resolveRequestedTab(role, tab, defaultDashboard, effectivePermissions);
    setAccessDeniedTab(null);
    setCurrentTab(nextTab);
    setMobileMenuOpen(false);
    const nextHash = `#/${nextTab}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [role, defaultDashboard, effectivePermissions]);

  useEffect(() => {
    const syncRoute = () => {
      const requested = readHashTab();

      if (!currentUser) {
        const publicTabs = new Set(['login', 'apply', 'track']);
        if (requested && !publicTabs.has(requested)) {
          sessionStorage.setItem(REDIRECT_TARGET_KEY, requested);
          history.replaceState(null, '', '#/login');
          window.dispatchEvent(new Event('hashchange'));
        }
        setCurrentTab('landing');
        return;
      }

      const fallback = defaultDashboard;
      const storedRedirect = sessionStorage.getItem(REDIRECT_TARGET_KEY);
      const target = !requested || requested === 'login'
        ? (storedRedirect && isTabAllowedForRole(role, storedRedirect, effectivePermissions) ? storedRedirect : fallback)
        : requested;

      sessionStorage.removeItem(REDIRECT_TARGET_KEY);
      const nextTab = resolveRequestedTab(role, target, fallback, effectivePermissions);

      const requestedPrivateTab = requested && requested !== 'login' && requested !== 'landing';
      setAccessDeniedTab(
        requestedPrivateTab && !isTabAllowedForRole(role, requested, effectivePermissions) ? requested : null
      );
      setCurrentTab(nextTab);

      const nextHash = `#/${nextTab}`;
      if (window.location.hash !== nextHash) {
        history.replaceState(null, '', nextHash);
      }
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, [currentUser, role, defaultDashboard, effectivePermissions]);

  useEffect(() => {
    if (!currentUser) return;
    mainRef.current?.focus({ preventScroll: true });
    const activeItem = getNavItem(currentTab);
    document.title = `${activeItem?.label ?? 'SchoolCare'} | SchoolCare Rwanda`;
  }, [currentTab, currentUser]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const menu = mobileMenuRef.current;
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = menu?.querySelectorAll<HTMLElement>(focusableSelector);
    focusable?.[0]?.focus();
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !menu) return;

      const items = Array.from(menu.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        item => item.offsetParent !== null
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [mobileMenuOpen]);

  const urgentCases = incidents.filter(i => !i.resolved && (i.priority === 'URGENT' || i.priority === 'EMERGENCY'));
  const mobileQuickNavItems = getQuickNavItems(role, effectivePermissions).map(item => ({
    id: item.id,
    label: item.labelKey ? t(item.labelKey) : item.label,
    icon: item.icon
  }));
  const activeNavItem = getNavItem(currentTab);
  const activeTabLabel = activeNavItem
    ? activeNavItem.labelKey
      ? t(activeNavItem.labelKey)
      : activeNavItem.label
    : currentTab;

  const handleOpenIncident = (inc?: HealthIncident) => {
    setActiveModalIncident(inc || null);
    setIsHealthModalOpen(true);
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await api.acknowledgeIncident(id, 'Acknowledged via Emergency Top Banner');
      loadGlobalState();
    } catch (err) {
      console.error(err);
    }
  };

  const routeContext = {
    onNavigate: handleNavigate,
    onOpenIncidentModal: handleOpenIncident
  };

  const renderRoute = (tab: string) => {
    const route = getRoute(tab) ?? getRoute(defaultDashboard) ?? getRoute('dashboard');
    return route ? route.render(routeContext) : null;
  };

  if (isLoading) {
    return (
      <main className="schoolcare-page-bg flex min-h-screen items-center justify-center px-6 text-center">
        <p role="status" className="text-sm font-medium text-slate-600">{t('loading')}</p>
      </main>
    );
  }

  if (!currentUser) {
    return <PublicSite />;
  }

  return (
    <div className="schoolcare-app schoolcare-page-bg min-h-screen flex flex-col text-slate-900">
      <a
        href="#main-content"
        className="skip-link"
        onClick={event => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to main content
      </a>

      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onNavigate={handleNavigate}
        urgentIncidentCount={urgentCases.length}
      />

      {/* Emergency Alert Banner */}
      <EmergencyBanner
        incidents={incidents}
        onOpenIncident={handleOpenIncident}
        onAcknowledge={handleAcknowledge}
      />

      {/* Unauthorized dashboard/page access */}
      {accessDeniedTab && (
        <div
          role="alert"
          className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{t('accessDeniedTitle')}</p>
            <p className="text-xs leading-5">
              {t('accessDeniedBody')} ({getNavItem(accessDeniedTab)?.label ?? accessDeniedTab})
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAccessDeniedTab(null)}
            className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            {t('accessDeniedDismiss')}
          </button>
        </div>
      )}

      {/* Mobile Top Controls Toggle */}
      <div className="md:hidden bg-white px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shadow-sm">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="p-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-2 hover:bg-slate-50 transition-colors"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>Menu</span>
        </button>
        <span className="text-xs font-semibold text-slate-700">
          {activeTabLabel}
        </span>
      </div>

      {/* Body Area */}
      {currentTab === 'landing' ? (
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="app-main min-w-0 flex-1 overflow-x-hidden outline-none"
        >
          {renderRoute('landing')}
        </main>
      ) : (
        <div className="flex-1 flex max-w-full">
          {/* Desktop Sidebar */}
          <div className="hidden md:block">
            <Sidebar
              currentTab={currentTab}
              onNavigate={handleNavigate}
              urgentIncidentCount={urgentCases.length}
            />
          </div>

          {/* Mobile Overlay Sidebar */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 flex md:hidden" role="presentation">
              <button
                type="button"
                aria-label="Close navigation menu"
                className="fixed inset-0 bg-black/50"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div
                id="mobile-navigation"
                ref={mobileMenuRef}
                role="dialog"
                aria-modal="true"
                aria-label="SchoolCare navigation"
                className="relative w-72 bg-white h-full z-10 shadow-2xl flex flex-col"
              >
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <span className="font-bold text-sm text-[color:var(--schoolcare-brand-900)]">SchoolCare Menu</span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 text-slate-400"
                    aria-label="Close navigation menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <Sidebar
                    currentTab={currentTab}
                    onNavigate={handleNavigate}
                    urgentIncidentCount={urgentCases.length}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main Content View */}
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="app-main min-w-0 flex-1 overflow-x-hidden min-h-[calc(100vh-4rem)] pb-20 md:pb-8 outline-none"
          >
            <AiAssistantLauncher currentTab={currentTab} />
            {renderRoute(
              isTabAllowedForRole(role, currentTab, effectivePermissions) ? currentTab : defaultDashboard
            )}
          </main>
        </div>
      )}

      {/* Global Health Incident Modal */}
      <HealthIncidentModal
        incident={activeModalIncident}
        students={students}
        guardians={guardians}
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
        onSaved={() => {
          setIsHealthModalOpen(false);
          loadGlobalState();
        }}
      />

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav
        aria-label="Quick navigation"
        className="mobile-quick-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-[var(--schoolcare-border)] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"
      >
        {mobileQuickNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleNavigate(id)}
            aria-current={currentTab === id ? 'page' : undefined}
            className={`relative flex min-w-14 flex-col items-center gap-1 text-[10px] font-semibold p-1.5 rounded-xl transition-colors ${
              currentTab === id ? 'text-blue-700 bg-blue-50' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {id === 'health' && urgentCases.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-600 absolute top-1 right-3 ring-2 ring-white" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
          className="relative flex min-w-14 flex-col items-center gap-1 text-[10px] font-semibold p-1.5 rounded-xl text-slate-500 hover:bg-slate-50"
        >
          <Menu className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
};

const PublicSite: React.FC = () => {
  const [showLogin, setShowLogin] = useState(() => readHashTab() === 'login');

  useEffect(() => {
    const sync = () => setShowLogin(readHashTab() === 'login');
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    sync();
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  if (showLogin) {
    return (
      <AuthPage
        onBack={() => {
          window.location.hash = '#/';
        }}
      />
    );
  }

  return (
    <LandingPage
      onNavigate={tab => {
        window.location.hash = tab === 'apply' ? '#/apply' : tab === 'track' ? '#/track' : '#/login';
      }}
      publicMode
    />
  );
};

/** Public admission pages are intentionally outside the authenticated shell. */
const PublicRouteGate: React.FC = () => {
  const [route, setRoute] = useState<string | null>(() => readHashTab());

  useEffect(() => {
    const sync = () => setRoute(readHashTab());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  if (route === 'apply') {
    return (
      <AdmissionsPortalPage
        onBackHome={() => { window.location.hash = '#/'; }}
        onOpenTracking={() => { window.location.hash = '#/track'; }}
      />
    );
  }
  if (route === 'track') {
    return <AdmissionTrackingPage onBackHome={() => { window.location.hash = '#/'; }} />;
  }
  if (route === 'parent-signup' || route === 'student-signup') {
    return (
      <AccountSignupPage
        mode={route === 'parent-signup' ? 'parent' : 'student'}
        onBack={() => { window.location.hash = '#/login'; }}
        onSignIn={() => { window.location.hash = '#/login'; }}
      />
    );
  }
  if (route?.startsWith('staff-activate')) {
    return (
      <StaffActivationPage
        onActivated={() => { window.location.hash = '#/login'; }}
        onBackHome={() => { window.location.hash = '#/'; }}
      />
    );
  }
  return <MainApp />;
};

export default function App() {
  return (
    <LanguageProvider>
      <AccessibilityProvider>
        <AuthProvider>
          <PublicRouteGate />
        </AuthProvider>
      </AccessibilityProvider>
    </LanguageProvider>
  );
}
