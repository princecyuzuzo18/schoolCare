import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  GraduationCap,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
  Users
} from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageCode } from '../types';

const GoogleIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path fill="#4285F4" d="M21.35 12.27c0-.68-.06-1.35-.18-2H12v3.78h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.83-1.69 2.91-4.18 2.91-7.16Z" />
    <path fill="#34A853" d="M12 21.6c2.62 0 4.82-.87 6.43-2.36l-3.14-2.44c-.87.58-1.98.93-3.29.93-2.53 0-4.67-1.71-5.44-4.01H3.3v2.52A9.6 9.6 0 0 0 12 21.6Z" />
    <path fill="#FBBC05" d="M6.56 13.72A5.77 5.77 0 0 1 6.26 12c0-.6.1-1.18.3-1.72V7.76H3.3A9.6 9.6 0 0 0 2.4 12c0 1.55.37 3.01 1.02 4.24l3.14-2.52Z" />
    <path fill="#EA4335" d="M12 6.36c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.82 3.21 14.62 2.4 12 2.4A9.6 9.6 0 0 0 3.3 7.76l3.26 2.52C7.33 8.07 9.47 6.36 12 6.36Z" />
  </svg>
);

type AuthView = 'login' | 'recovery';
type LoginTab = 'parent' | 'student' | 'staff';

const LOGIN_TABS: ReadonlyArray<LoginTab> = ['parent', 'student', 'staff'];

interface AuthPageProps {
  onBack?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
  const { login, sessionExpired } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [view, setView] = useState<AuthView>('login');
  const [loginTab, setLoginTab] = useState<LoginTab>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const chooseLanguage = (code: LanguageCode) => setLanguage(code);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/google/status')
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (active) setGoogleAvailable(Boolean(data?.available));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    if (new URLSearchParams(query).get('authError')) {
      setError(t('authGoogleError'));
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/login`);
    }
  }, [t]);

  const activeCopy = useMemo(() => {
    if (loginTab === 'parent') {
      return {
        heading: t('authParentLogin'),
        subtitle: t('authParentLoginDesc'),
        identifierLabel: t('authParentIdentifier'),
        identifierPlaceholder: t('authParentIdentifierPlaceholder'),
        submitLabel: t('authAccessParentPortal'),
        submittingLabel: t('authSigningInParent'),
        Icon: UserRound
      };
    }
    if (loginTab === 'student') {
      return {
        heading: t('authStudentLogin'),
        subtitle: t('authStudentLoginDesc'),
        identifierLabel: t('authStudentIdentifier'),
        identifierPlaceholder: t('authStudentIdentifierPlaceholder'),
        submitLabel: t('authAccessStudentPortal'),
        submittingLabel: t('authSigningInStudent'),
        Icon: GraduationCap
      };
    }
    return {
      heading: t('authStaffLogin'),
      subtitle: t('authStaffLoginDesc'),
      identifierLabel: t('authStaffIdentifier'),
      identifierPlaceholder: t('authStaffIdentifierPlaceholder'),
      submitLabel: t('authAccessStaffPortal'),
      submittingLabel: t('authSigningInStaff'),
      Icon: Users
    };
  }, [loginTab, t]);

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: LoginTab
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentIndex = LOGIN_TABS.indexOf(currentTab);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const nextTab = LOGIN_TABS[(currentIndex + step + LOGIN_TABS.length) % LOGIN_TABS.length];
    setLoginTab(nextTab);
    clearMessages();
    document.getElementById(`auth-tab-${nextTab}`)?.focus();
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError(t('authRequiredFields'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('authInvalidEmail'));
      return;
    }

    setIsSubmitting(true);
    try {
      // All tabs use the existing SchoolCare authentication endpoint.
      // The backend determines the authorized role and dashboard.
      await login(normalizedEmail, password);
    } catch (loginError) {
      if (loginError instanceof ApiError && loginError.status === 401) {
        setError(t('authInvalidCredentials'));
      } else if (loginError instanceof ApiError && loginError.status === 429) {
        setError(t('authTooManyAttempts'));
      } else if (loginError instanceof ApiError && loginError.status === 400) {
        setError(t('authRequiredFields'));
      } else if (loginError instanceof ApiError) {
        setError(loginError.message || t('authNetworkError'));
      } else {
        setError(t('authNetworkError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('authInvalidEmail'));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.requestPasswordReset(normalizedEmail);
      setNotice(t('authForgotRequestSent'));
    } catch (recoveryError) {
      if (recoveryError instanceof ApiError && recoveryError.status === 400) {
        setError(t('authInvalidEmail'));
      } else {
        setError(t('authRecoveryUnavailable'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const ActiveIcon = activeCopy.Icon;

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-900">
      <div className="public-site-bg__media" aria-hidden="true">
        <img src="/images/esrubengera/welcome.webp" alt="" loading="eager" fetchPriority="high" decoding="async" className="public-site-bg__image" />
        <div className="public-site-bg__overlay" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t('authBackToWebsite')}</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-1 backdrop-blur-sm">
            <Globe2 className="ml-2 h-4 w-4 text-blue-100" aria-hidden="true" />
            <span className="sr-only">{t('authLanguage')}</span>
            {(['en', 'rw'] as const).map(code => (
              <button
                key={code}
                type="button"
                onClick={() => chooseLanguage(code)}
                aria-pressed={language === code}
                aria-label={code === 'en' ? 'English' : 'Ikinyarwanda'}
                className={`min-h-10 min-w-12 rounded-lg px-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  language === code ? 'bg-white text-[#082B63]' : 'text-white hover:bg-white/10'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="w-full max-w-xl">
            <div className="mb-6 text-center text-white">
              <div className="mx-auto mb-4 grid h-20 w-20 place-items-center overflow-hidden rounded-3xl bg-white p-2 shadow-[0_20px_50px_rgba(0,0,0,0.25)] ring-1 ring-white/40">
                <img src="/images/school-logo.png" alt={t('authLogoAlt')} className="h-full w-full object-contain" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">ES RUBENGERA RTB</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t('authPortalTitle')}</h1>
              <p className="mt-2 text-sm text-blue-100 sm:text-base">{t('authPortalSubtitle')}</p>
            </div>

            <section
              aria-labelledby="auth-card-title"
              className="auth-card-enter overflow-hidden rounded-[2rem] border border-white/20 bg-white shadow-[0_30px_90px_rgba(8,43,99,0.35)]"
            >
              <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] px-6 py-6 sm:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1455A0]">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('authSecurePortal')}
                    </p>
                    <h2 id="auth-card-title" className="mt-3 text-2xl font-bold tracking-tight text-[#082B63]">
                      {view === 'login' ? activeCopy.heading : t('authForgotHeading')}
                    </h2>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      {view === 'login' ? activeCopy.subtitle : t('authForgotDescription')}
                    </p>
                  </div>
                  <span className="hidden rounded-2xl bg-blue-50 p-3 text-[#1455A0] sm:inline-flex">
                    <ActiveIcon className="h-6 w-6" aria-hidden="true" />
                  </span>
                </div>

                {view === 'login' && (
                  <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label={t('authLoginTabs')}>
                    {([
                      { id: 'parent' as const, label: t('authParentTabShort'), Icon: UserRound },
                      { id: 'student' as const, label: t('authStudentTabShort'), Icon: GraduationCap },
                      { id: 'staff' as const, label: t('authStaffTabShort'), Icon: Users }
                    ]).map(tab => {
                      const selected = loginTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          id={`auth-tab-${tab.id}`}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls={`login-panel-${tab.id}`}
                          onClick={() => {
                            setLoginTab(tab.id);
                            clearMessages();
                          }}
                          onKeyDown={event => handleTabKeyDown(event, tab.id)}
                          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0] ${
                            selected
                              ? 'bg-white text-[#082B63] shadow-sm ring-1 ring-slate-200'
                              : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                          }`}
                        >
                          <tab.Icon className="h-4 w-4" aria-hidden="true" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="px-6 py-6 sm:px-8 sm:py-7">
                {sessionExpired && view === 'login' && (
                  <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    {t('authSessionExpired')}
                  </div>
                )}

                {view === 'login' ? (
                  <form id={`login-panel-${loginTab}`} role="tabpanel" onSubmit={submitLogin} noValidate className="space-y-5">
                    <div>
                      <label htmlFor="auth-email" className="mb-2 block text-sm font-semibold text-slate-800">
                        {activeCopy.identifierLabel}
                      </label>
                      <div className="relative">
                        {loginTab === 'staff' ? (
                          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        ) : loginTab === 'parent' ? (
                          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        ) : (
                          <GraduationCap className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        )}
                        <input
                          id="auth-email"
                          name="email"
                          type="email"
                          autoComplete="username"
                          inputMode="email"
                          required
                          maxLength={254}
                          value={email}
                          onChange={event => setEmail(event.target.value)}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? 'auth-error' : 'auth-identifier-help'}
                          placeholder={activeCopy.identifierPlaceholder}
                          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-[#1455A0] focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                      <p id="auth-identifier-help" className="mt-2 text-xs text-slate-500">
                        {t('authIdentifierHelp')}
                      </p>
                    </div>

                    <div>
                      <label htmlFor="auth-password" className="mb-2 block text-sm font-semibold text-slate-800">
                        {t('authPassword')}
                      </label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                          id="auth-password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          maxLength={128}
                          value={password}
                          onChange={event => setPassword(event.target.value)}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? 'auth-error' : undefined}
                          placeholder="••••••••"
                          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-base text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-[#1455A0] focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(value => !value)}
                          aria-label={showPassword ? t('authHidePassword') : t('authShowPassword')}
                          aria-pressed={showPassword}
                          className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0]"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setView('recovery');
                          clearMessages();
                        }}
                        className="min-h-10 rounded-lg px-2 text-sm font-semibold text-[#1455A0] underline-offset-4 transition hover:text-[#082B63] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0]"
                      >
                        {t('authForgotPassword')}
                      </button>
                    </div>

                    {error && (
                      <p id="auth-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#082B63_0%,#1455A0_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(20,85,160,0.35)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0] disabled:cursor-wait disabled:opacity-70"
                    >
                      {isSubmitting ? activeCopy.submittingLabel : activeCopy.submitLabel}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </button>

                    {googleAvailable && (
                      <div>
                        <div className="relative flex items-center gap-3 py-1">
                          <span className="h-px flex-1 bg-slate-200" />
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('authOr')}</span>
                          <span className="h-px flex-1 bg-slate-200" />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.assign('/api/auth/google');
                          }}
                          className="mt-2 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0]"
                        >
                          <GoogleIcon />
                          {t('authGoogleContinue')}
                        </button>
                      </div>
                    )}

                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                      <p className="text-sm font-bold text-[#082B63]">{t('authCreateAccountTitle')}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-600">{t('authCreateAccountDescription')}</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = '#/parent-signup';
                          }}
                          className="min-h-11 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-[#1455A0] transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0]"
                        >
                          {t('authCreateParentAccount')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = '#/student-signup';
                          }}
                          className="min-h-11 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-[#1455A0] transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0]"
                        >
                          {t('authCreateStudentAccount')}
                        </button>
                      </div>
                    </div>

                    <p className="text-center text-xs leading-5 text-slate-500">{t('authContactAdministrator')}</p>
                  </form>
                ) : (
                  <form onSubmit={submitRecovery} noValidate className="space-y-4">
                    <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-slate-800">
                      {t('authRecoveryEmail')}
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        id="recovery-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        maxLength={254}
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'auth-error' : 'recovery-help'}
                        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 shadow-sm transition focus:border-[#1455A0] focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                    <p id="recovery-help" className="text-sm leading-6 text-slate-600">
                      {t('authContactAdministrator')}
                    </p>
                    {error && (
                      <p id="auth-error" role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        {error}
                      </p>
                    )}
                    {notice && (
                      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        {notice}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#082B63_0%,#1455A0_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(20,85,160,0.35)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                    >
                      {isSubmitting ? t('loading') : t('authSendResetLink')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        clearMessages();
                      }}
                      className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#1455A0] hover:underline"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      {t('authBackToSignIn')}
                    </button>
                  </form>
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={onBack}
                  className="mx-auto flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#1455A0] transition hover:bg-blue-50 hover:text-[#082B63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1455A0]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t('authBackToWebsite')}
                </button>
              </div>
            </section>

            <p className="mt-5 text-center text-xs text-blue-100/90">
              © {new Date().getFullYear()} SchoolCare Rwanda · ES RUBENGERA RTB
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};
