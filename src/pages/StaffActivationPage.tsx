import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { api, ApiError } from '../services/api';
import type { LanguageCode } from '../types';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

interface StaffActivationPageProps {
  onActivated: () => void;
  onBackHome: () => void;
}

function readActivationToken(): string {
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get('token') || '';
}

export const StaffActivationPage: React.FC<StaffActivationPageProps> = ({ onActivated, onBackHome }) => {
  const { t } = useLanguage();
  const [token] = useState(readActivationToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError(t('missingActivationToken'));
      return;
    }
    if (password.length < 12) {
      setError(t('passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      await api.activateStaffInvitation({
        token,
        password,
        phone: phone.trim() || undefined,
        preferredLanguage
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('activationError'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="schoolcare-page-bg flex min-h-screen items-center justify-center bg-transparent px-4 py-10">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            SchoolCare
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t('staffActivation')}
          </span>
        </div>

        <h1 className="mt-4 text-xl font-black text-slate-900">{t('activationTitle')}</h1>
        <p className="mt-1 text-xs text-slate-500">{t('activationSubtitle')}</p>

        {done ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold text-emerald-900">{t('activationSuccess')}</p>
            <button
              type="button"
              onClick={onActivated}
              className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
            >
              {t('activationGoToLogin')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                {error}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="activation-token">
                {t('activationToken')}
              </label>
              <input
                id="activation-token"
                value={token}
                readOnly
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="activation-phone">
                {t('activationPhone')}
              </label>
              <input
                id="activation-phone"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="activation-language">
                {t('staffLanguage')}
              </label>
              <select
                id="activation-language"
                value={preferredLanguage}
                onChange={event => setPreferredLanguage(event.target.value as LanguageCode)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="rw">Ikinyarwanda</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="activation-password">
                {t('activationPassword')}
              </label>
              <input
                id="activation-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-[10px] text-slate-500">{t('passwordTooShort')}</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="activation-confirm">
                {t('activationConfirmPassword')}
              </label>
              <input
                id="activation-confirm"
                type="password"
                required
                minLength={12}
                maxLength={128}
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !token}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              <LockKeyhole className="h-3.5 w-3.5" />
              {busy ? t('activating') : t('activateAccountButton')}
            </button>
            <button
              type="button"
              onClick={onBackHome}
              className="w-full text-center text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              {t('backToHome')}
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
