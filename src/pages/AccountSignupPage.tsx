import React, { FormEvent, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Globe2,
  Mail,
  Phone,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { getRoleDashboard } from '../rbac';
import { LanguageCode, SignupRequestView } from '../types';
import { PublicPageBackground } from '../components/PublicPageBackground';

interface AccountSignupPageProps {
  mode: 'parent' | 'student';
  onBack: () => void;
  onSignIn: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export const AccountSignupPage: React.FC<AccountSignupPageProps> = ({ mode, onBack, onSignIn }) => {
  const isParent = mode === 'parent';
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<SignupRequestView | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');

  const validate = (): string => {
    if (!fullName.trim() || !admissionNumber.trim() || !password || !confirmPassword) {
      return t('signupValidationRequired');
    }
    if (!isParent && !dob) return t('signupValidationDob');
    if (isParent && !phone.trim()) return t('signupValidationPhone');
    if (email.trim() && !EMAIL_RE.test(email.trim())) return t('signupValidationEmail');
    if (password.length < 12) return t('signupValidationPassword');
    if (password !== confirmPassword) return t('signupValidationPasswordMatch');
    return '';
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      const result = isParent
        ? await api.submitParentSignup({
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            password,
            confirmPassword,
            admissionNumber: admissionNumber.trim(),
            admissionNumbers: admissionNumber.split(/[;,]+/).map(value => value.trim()).filter(Boolean),
            preferredLanguage: language
          })
        : await api.submitStudentSignup({
            fullName: fullName.trim(),
            admissionNumber: admissionNumber.trim(),
            dob,
            email: email.trim(),
            password,
            confirmPassword,
            preferredLanguage: language
          });
      setRequest(result.request);
      setNotice(result.request.message);
    } catch (submitError) {
      setError(messageOf(submitError, t('signupSubmitError')));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request) return;
    setError('');
    setNotice('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('signupVerifyError'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.verifySignup(request.id, code.trim());
      setRequest(result.request);
      setNotice(result.request.message);
    } catch (verifyError) {
      setError(messageOf(verifyError, t('signupVerifyError')));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!request) return;
    setError('');
    setBusy(true);
    try {
      const result = await api.resendSignupCode(request.id);
      setRequest(result.request);
      setNotice(t('signupVerifySubtitle'));
    } catch (resendError) {
      setError(messageOf(resendError, t('signupVerifyError')));
    } finally {
      setBusy(false);
    }
  };

  const checkStatus = async () => {
    if (!request) return;
    setError('');
    setBusy(true);
    try {
      const result = await api.getSignupStatus(request.id);
      const status = result.request.status;
      // The public status endpoint intentionally omits the sign-in email; keep
      // the value from the original submission in local UI state.
      setRequest({ ...result.request, signInEmail: result.request.signInEmail || request.signInEmail });
      if (status === 'APPROVED') {
        setNotice(t('signupApprovedMessage'));
        // Email is optional on sign-up. When it was left blank the server
        // generated a sign-in address and returned it at submission time.
        const signInEmail = request.signInEmail || email.trim();
        const user = await login(signInEmail, password);
        window.location.hash = `#/${getRoleDashboard(user.role)}`;
        return;
      }
      if (status === 'REJECTED') {
        setError(t('signupPendingTitle'));
        return;
      }
      setNotice(result.request.message);
    } catch (statusError) {
      setError(messageOf(statusError, t('signupSubmitError')));
    } finally {
      setBusy(false);
    }
  };

  const statusMessage = request
    ? request.status === 'VERIFIED'
      ? t('signupVerifiedMessage')
      : request.status === 'APPROVED'
        ? t('signupApprovedMessage')
        : request.requiresManualReview
          ? t('signupManualReviewMessage')
          : t('signupPendingMessage')
    : '';

  return (
    <PublicPageBackground>
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
            >
              <ArrowLeft size={16} /> {t('signupBackToSignIn')}
            </button>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
              <Globe2 size={16} />
              <select
                aria-label={t('signupLanguage')}
                value={language}
                onChange={event => setLanguage(event.target.value as LanguageCode)}
                className="bg-transparent text-sm font-medium text-white outline-none [&_option]:text-slate-900"
              >
                <option value="en">English</option>
                <option value="rw">Kinyarwanda</option>
              </select>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur-sm">
          <div className="border-b border-slate-200 bg-[color:var(--schoolcare-brand-900)] px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              {isParent ? <UserRound size={28} /> : <BookOpenCheck size={28} />}
              <div>
                <h1 className="text-2xl font-bold">
                  {isParent ? t('signupParentTitle') : t('signupStudentTitle')}
                </h1>
                <p className="mt-1 text-sm text-white/80">
                  {isParent ? t('signupParentSubtitle') : t('signupStudentSubtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {notice}
              </div>
            )}

            {!request && (
              <form onSubmit={submit} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t('signupFullName')}</span>
                  <input
                    value={fullName}
                    onChange={event => setFullName(event.target.value)}
                    maxLength={255}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t('signupAdmissionNumber')}</span>
                  <input
                    value={admissionNumber}
                    onChange={event => setAdmissionNumber(event.target.value.toUpperCase())}
                    maxLength={50}
                    placeholder={isParent ? 'ESR-2024-0104, ESR-2024-0105' : 'ESR-2024-0104'}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    required
                  />
                  {isParent && (
                    <span className="mt-1 block text-xs text-slate-500">{t('signupAdmissionNumbersHint')}</span>
                  )}
                </label>

                {isParent && (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t('signupPhone')}</span>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-blue-500">
                      <Phone size={16} className="text-slate-400" />
                      <input
                        value={phone}
                        onChange={event => setPhone(event.target.value)}
                        maxLength={50}
                        className="w-full outline-none"
                        required
                      />
                    </div>
                  </label>
                )}

                {!isParent && (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t('signupDob')}</span>
                    <input
                      type="date"
                      value={dob}
                      onChange={event => setDob(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      required
                    />
                  </label>
                )}

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t('signupEmail')}</span>
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-blue-500">
                    <Mail size={16} className="text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      maxLength={254}
                      className="w-full outline-none"
                    />
                  </div>
                  <span className="mt-1 block text-xs text-slate-500">{t('signupEmailOptionalHint')}</span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t('signupPassword')}</span>
                    <input
                      type="password"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      minLength={12}
                      maxLength={128}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t('signupConfirmPassword')}</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      minLength={12}
                      maxLength={128}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      required
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {busy ? '…' : isParent ? t('signupParentSubmit') : t('signupStudentSubmit')}
                </button>
              </form>
            )}

            {request && (
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="text-emerald-600" size={24} />
                    <div>
                      <p className="font-semibold text-slate-800">{t('signupPendingTitle')}</p>
                      <p className="text-sm text-slate-600">{statusMessage}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {t('signupRequestId')}: <span className="font-mono">{request.id}</span>
                  </p>
                  {request.signInEmail && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t('signupSignInEmail')}: <span className="font-mono">{request.signInEmail}</span>
                    </p>
                  )}
                </div>

                {request.status === 'PENDING' && request.verificationSent && !request.requiresManualReview && (
                  <form onSubmit={verify} className="space-y-3 rounded-xl border border-slate-200 p-4">
                    <h2 className="font-semibold text-slate-800">{t('signupVerifyTitle')}</h2>
                    <p className="text-sm text-slate-600">{t('signupVerifySubtitle')}</p>
                    <input
                      value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-blue-500"
                      required
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {t('signupVerifySubmit')}
                      </button>
                      <button
                        type="button"
                        onClick={resend}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                      >
                        {t('signupResendCode')}
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={checkStatus}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    <ShieldCheck size={16} /> {t('signupCheckingStatus')}
                  </button>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-blue-700 hover:underline"
                  >
                    {t('signupBackToSignIn')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        </div>
      </main>
    </PublicPageBackground>
  );
};
