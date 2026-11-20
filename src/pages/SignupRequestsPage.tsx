import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { SignupRequestView } from '../types';

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export const SignupRequestsPage: React.FC = () => {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<SignupRequestView[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRequests(await api.getSignupRequests());
    } catch (loadError) {
      setError(messageOf(loadError, t('signupSubmitError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      if (action === 'approve') await api.approveSignupRequest(id, notes[id] || '');
      else await api.rejectSignupRequest(id, notes[id] || '');
      setNotice(action === 'approve' ? t('signupApprovedMessage') : t('signupReject'));
      await load();
    } catch (reviewError) {
      setError(messageOf(reviewError, t('signupSubmitError')));
    } finally {
      setBusyId('');
    }
  };

  const canReview = (request: SignupRequestView) =>
    request.status === 'VERIFIED' || (request.status === 'PENDING' && request.requiresManualReview);

  return (
    <section className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('signupRequestsTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('signupRequestsSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} /> {t('viewReports')}
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">…</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          {t('signupNoRequests')}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(request => (
            <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{request.fullName}</p>
                  <p className="text-sm text-slate-600">
                    {request.role} · {request.admissionNumber} · {request.email || request.phone}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-400">{request.id}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {t('signupStatus')}: {request.status}
                </span>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-600">{t('signupReviewNotes')}</span>
                <input
                  value={notes[request.id] || ''}
                  onChange={event => setNotes(prev => ({ ...prev, [request.id]: event.target.value }))}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>

              {canReview(request) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => review(request.id, 'approve')}
                    disabled={busyId === request.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    <CheckCircle2 size={16} /> {t('signupApprove')}
                  </button>
                  <button
                    type="button"
                    onClick={() => review(request.id, 'reject')}
                    disabled={busyId === request.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <XCircle size={16} /> {t('signupReject')}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} /> {t('signupVerifiedMessage')}
      </p>
    </section>
  );
};
