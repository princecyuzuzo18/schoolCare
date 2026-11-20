import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, LockKeyhole, Search } from 'lucide-react';
import type { AdmissionTrackingSummary } from '../types';
import { api } from '../services/api';
import { useAdmissionsCopy } from '../i18n/admissions';
import { PublicAdmissionsFooter, PublicAdmissionsHeader } from '../components/PublicAdmissionsChrome';

interface AdmissionTrackingPageProps {
  onBackHome: () => void;
}

export const AdmissionTrackingPage: React.FC<AdmissionTrackingPageProps> = ({ onBackHome }) => {
  const copy = useAdmissionsCopy();
  const [referenceNumber, setReferenceNumber] = useState('');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [requiresCode, setRequiresCode] = useState(false);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<AdmissionTrackingSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSummary(null);
    setRequiresCode(false);
    setCode('');
    setReferenceNumber('');
    setContact('');
    setMessage('');
    setError('');
  };

  const verify = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.verifyAdmissionTracking(referenceNumber.trim(), contact.trim(), code.trim() || undefined);
      setSummary(result.application);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setLoading(false);
    }
  };

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!referenceNumber.trim() || !contact.trim()) {
      setError(copy.fixErrors);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.requestAdmissionTrackingCode(referenceNumber.trim(), contact.trim());
      setMessage(result.message);
      if (result.requiresCode) {
        setRequiresCode(true);
      } else {
        await verify();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (status: AdmissionTrackingSummary['status']): string => {
    if (status === 'UNDER_REVIEW') return copy.statusUnderReview;
    if (status === 'ADDITIONAL_INFO_REQUIRED') return copy.statusAdditional;
    if (status === 'APPROVED') return copy.statusApproved;
    if (status === 'REJECTED') return copy.statusRejected;
    return copy.statusSubmitted;
  };

  const typeLabel = (type: AdmissionTrackingSummary['applicationType']): string => {
    if (type === 'SCHOOL_TRANSFER') return copy.typeTransferTitle;
    if (type === 'OTHER_ADMISSION') return copy.typeOtherTitle;
    return copy.typeNewTitle;
  };

  return (
    <div className="schoolcare-page-bg apply-page flex min-h-screen flex-col bg-transparent">
      <PublicAdmissionsHeader onBackHome={onBackHome} showTrackingLink={false} />

      <main className="apply-shell flex-1 py-10 sm:py-14">
        <button type="button" onClick={onBackHome} className="apply-back-link mb-6">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {copy.successHome}
        </button>

        {!summary ? (
          <section className="apply-card mx-auto max-w-2xl p-6 sm:p-9">
            <span className="apply-type-icon"><Search className="h-5 w-5" aria-hidden="true" /></span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#064E3B] sm:text-3xl">{copy.trackTitle}</h1>
            <p className="mt-2 text-sm leading-7 text-[#52615C]">{copy.trackIntro}</p>

            {error && <div role="alert" className="apply-alert mt-5">{error}</div>}
            {message && <div className="mt-5 rounded-xl border border-[#D6A84F]/40 bg-[#FBF6E9] p-3 text-sm text-[#6D5B2F]">{message}</div>}

            <form onSubmit={requestCode} className="mt-7 space-y-5">
              <label className="block" htmlFor="track-reference">
                <span className="mb-1.5 block apply-label">{copy.referenceNumber}</span>
                <input id="track-reference" value={referenceNumber} onChange={event => setReferenceNumber(event.target.value.toUpperCase())} className="admission-input font-mono uppercase" placeholder="SC-2026-00001" required />
              </label>
              <label className="block" htmlFor="track-contact">
                <span className="mb-1.5 block apply-label">{copy.contact}</span>
                <input id="track-contact" value={contact} onChange={event => setContact(event.target.value)} className="admission-input" autoComplete="off" required />
              </label>
              {requiresCode && (
                <label className="block" htmlFor="track-code">
                  <span className="mb-1.5 block apply-label">{copy.verificationCode}</span>
                  <input id="track-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="admission-input text-center font-mono text-xl tracking-[0.4em]" inputMode="numeric" required />
                </label>
              )}
              <button type={requiresCode ? 'button' : 'submit'} onClick={requiresCode ? verify : undefined} className="admission-primary-btn w-full" disabled={loading}>
                {loading ? copy.submitting : requiresCode ? copy.checkStatus : copy.sendCode}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>

            <p className="mt-6 flex items-start gap-2 text-xs leading-6 text-[#6B7874]">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#0B6B51]" aria-hidden="true" /> {copy.privacyText}
            </p>
          </section>
        ) : (
          <section className="apply-card mx-auto max-w-2xl p-6 sm:p-9">
            <span className="apply-success-icon"><CheckCircle2 className="h-8 w-8" aria-hidden="true" /></span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#064E3B]">{copy.statusTitle}</h1>
            <dl className="mt-6 divide-y divide-[#EEE9DD] rounded-2xl border border-[#E9E4D9]">
              {[
                { label: copy.referenceNumber, value: summary.referenceNumber },
                { label: copy.stepDetails, value: typeLabel(summary.applicationType) },
                { label: copy.submittedOn, value: new Date(summary.submittedAt).toLocaleDateString() },
                { label: copy.statusTitle, value: statusLabel(summary.status) }
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <dt className="text-sm font-semibold text-[#6B7874]">{row.label}</dt>
                  <dd className="break-words text-sm font-bold text-[#064E3B]">{row.value}</dd>
                </div>
              ))}
              {summary.schoolResponse && (
                <div className="px-4 py-3">
                  <dt className="text-sm font-semibold text-[#6B7874]">{copy.schoolResponse}</dt>
                  <dd className="mt-1 text-sm text-[#31413C]">{summary.schoolResponse}</dd>
                </div>
              )}
            </dl>
            <p className="mt-5 flex items-start gap-2 text-xs leading-6 text-[#6B7874]">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#0B6B51]" aria-hidden="true" /> {copy.successKeep}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={reset} className="admission-primary-btn">{copy.trackAnother}</button>
              <button type="button" onClick={onBackHome} className="admission-secondary-btn">{copy.successHome}</button>
            </div>
          </section>
        )}
      </main>

      <PublicAdmissionsFooter />
    </div>
  );
};
