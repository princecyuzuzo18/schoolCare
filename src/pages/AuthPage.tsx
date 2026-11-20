import React, { FormEvent, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  Eye,
  EyeOff,
  Globe2,
  HeartHandshake,
  Mail,
  ShieldCheck,
  UsersRound
} from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageCode } from '../types';

type AuthView = 'login' | 'recovery';

interface AuthPageProps {
  onBack?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
  const { login, sessionExpired } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const chooseLanguage = (code: LanguageCode) => setLanguage(code);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
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
    setError('');
    setNotice('');
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

  const features = [
    { icon: UsersRound, label: t('authFeatureStudents') },
    { icon: BookOpenCheck, label: t('authFeaturePerformance') },
    { icon: CalendarCheck2, label: t('authFeatureAttendance') },
    { icon: HeartHandshake, label: t('authFeatureCommunication') }
  ];

  return (
    <main className="schoolcare-page-bg min-h-screen bg-transparent lg:grid lg:grid-cols-2">
      <aside className="relative isolate flex min-h-[410px] flex-col overflow-hidden bg-[color:var(--schoolcare-brand-900)] px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-14 lg:py-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-25"
          style={{ backgroundImage: "url('/school-classroom-scene.svg')" }}
        />
        <div aria-hidden="true" className="brand-gradient absolute inset-0 -z-10 opacity-90" />
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-white/40">
            <img src="/images/school-logo.png" alt={t('authLogoAlt')} className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">SchoolCare Rwanda</p>
            <h1 className="mt-1 text-sm font-bold leading-snug text-white sm:text-base">
              ES RUBENGERA SECONDARY SCHOOL
            </h1>
          </div>
        </div>

        <div className="my-auto max-w-xl py-12 lg:py-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-blue-100">
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <span>SchoolCare Rwanda</span>
          </div>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {t('authWelcome')}
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-blue-100 sm:text-lg">
            {t('authSchoolDescription')}
          </p>

          <ul className="mt-9 grid gap-4 sm:grid-cols-2" aria-label={t('authDescription')}>
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-medium text-white/95">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-200 ring-1 ring-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-white/15 pt-5 text-xs text-blue-100/90">
          <p className="font-semibold text-white">{t('authFooter')}</p>
          <p className="mt-1">© {new Date().getFullYear()} SchoolCare Rwanda · ES RUBENGERA SECONDARY SCHOOL</p>
        </footer>
      </aside>

      <section className="relative flex min-h-[530px] items-center justify-center bg-transparent px-5 pb-12 pt-24 sm:px-10 lg:min-h-screen lg:px-14 lg:py-16">
        <div className="absolute left-5 top-5 right-5 flex items-center justify-between gap-3 sm:left-8 sm:right-8 sm:top-8">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Home</span>
            </button>
          ) : <span />}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <Globe2 className="ml-2 h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="sr-only">{t('authLanguage')}</span>
            {(['en', 'rw'] as const).map(code => (
              <button
                key={code}
                type="button"
                onClick={() => chooseLanguage(code)}
                aria-pressed={language === code}
                aria-label={code === 'en' ? 'English' : 'Ikinyarwanda'}
                className={`min-h-10 min-w-12 rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  language === code ? 'bg-[color:var(--schoolcare-brand-900)] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md">
          {sessionExpired && view === 'login' && (
            <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {t('authSessionExpired')}
            </div>
          )}

          <div className="mb-8">
            <p className="text-sm font-bold text-blue-700">{t('authWelcome')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {view === 'login' ? t('authSignInHeading') : t('authForgotHeading')}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {view === 'login' ? t('authDescription') : t('authForgotDescription')}
            </p>
          </div>

          {view === 'login' ? (
            <form onSubmit={submitLogin} noValidate>
              <div className="space-y-5">
                <div>
                  <label htmlFor="auth-email" className="mb-2 block text-sm font-semibold text-slate-800">
                    {t('authEmail')}
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
                      aria-describedby={error ? 'auth-error' : undefined}
                      className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-password" className="mb-2 block text-sm font-semibold text-slate-800">
                    {t('authPassword')}
                  </label>
                  <div className="relative">
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
                      className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      aria-label={showPassword ? t('authHidePassword') : t('authShowPassword')}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      {showPassword
                        ? <EyeOff className="h-5 w-5" aria-hidden="true" />
                        : <Eye className="h-5 w-5" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setView('recovery');
                    setError('');
                    setNotice('');
                  }}
                  className="min-h-10 rounded-lg px-2 text-sm font-semibold text-blue-800 underline-offset-4 hover:underline"
                >
                  {t('authForgotPassword')}
                </button>
              </div>

              {error && (
                <p id="auth-error" role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#174B86] px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#123b6a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? t('authSigningIn') : t('authSignIn')}
                {!isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/parent-signup'; }}
                  className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
                >
                  {t('signupParentTitle')}
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/student-signup'; }}
                  className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
                >
                  {t('signupStudentTitle')}
                </button>
              </div>
              <p className="mt-5 text-center text-xs leading-5 text-slate-500">
                {t('authContactAdministrator')}
              </p>
            </form>
          ) : (
            <form onSubmit={submitRecovery} noValidate>
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
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <p id="recovery-help" className="mt-3 text-sm leading-6 text-slate-600">
                {t('authContactAdministrator')}
              </p>
              {error && (
                <p id="auth-error" role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {notice}
                </p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#174B86] px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#123b6a] disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? t('loading') : t('authSendResetLink')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setError('');
                  setNotice('');
                }}
                className="mt-4 flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-blue-800 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('authBackToSignIn')}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};
