import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
  ZoomIn
} from 'lucide-react';
import type {
  AcademicPerformanceData,
  AcademicResultSubject,
  AdmissionApplication,
  ApplicationStatus,
  ApplicationType,
  ResultSlipVerificationStatus
} from '../types';
import { api } from '../services/api';
import { useAdmissionsCopy } from '../i18n/admissions';

const STATUSES: ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUIRED',
  'APPROVED',
  'REJECTED'
];

const TYPE_LABELS: Record<ApplicationType, string> = {
  NEW_STUDENT_SENIOR4: 'New Student — Senior 4',
  SCHOOL_TRANSFER: 'School Transfer',
  OTHER_ADMISSION: 'Other Admission Request'
};

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  ADDITIONAL_INFO_REQUIRED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700'
};

const VERIFICATION_STATUSES: ResultSlipVerificationStatus[] = [
  'NOT_YET_VERIFIED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'VERIFICATION_FAILED',
  'ADDITIONAL_DOCUMENT_REQUIRED'
];

const VERIFICATION_STYLES: Record<ResultSlipVerificationStatus, string> = {
  NOT_YET_VERIFIED: 'bg-slate-100 text-slate-700',
  UNDER_VERIFICATION: 'bg-blue-100 text-blue-800',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  VERIFICATION_FAILED: 'bg-red-100 text-red-700',
  ADDITIONAL_DOCUMENT_REQUIRED: 'bg-amber-100 text-amber-800'
};

const emptyAcademicData = (): AcademicPerformanceData => ({
  studentName: '',
  examinationYear: '',
  subjects: [{ name: '', marks: '', grade: '' }],
  total: '',
  aggregate: '',
  division: ''
});

export const AdmissionsManagementPage: React.FC = () => {
  const copy = useAdmissionsCopy();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<{ search: string; applicationType: string; status: string; academicYear: string }>({
    search: '',
    applicationType: '',
    status: '',
    academicYear: ''
  });
  const [selected, setSelected] = useState<AdmissionApplication | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('UNDER_REVIEW');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [settings, setSettings] = useState<{ resultSlipRequired: boolean; resultSlipExceptionNote?: string }>({
    resultSlipRequired: true
  });
  const [exceptionNote, setExceptionNote] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<ResultSlipVerificationStatus>('NOT_YET_VERIFIED');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [verificationData, setVerificationData] = useState<AcademicPerformanceData>(emptyAcademicData);

  const loadSettings = useCallback(async () => {
    try {
      const result = await api.getAdmissionSettings();
      setSettings(result);
      setExceptionNote(result.resultSlipExceptionNote || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    }
  }, [copy.genericError]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getAdmissionApplications({
        search: filters.search || undefined,
        applicationType: (filters.applicationType || undefined) as ApplicationType | undefined,
        status: (filters.status || undefined) as ApplicationStatus | undefined,
        academicYear: filters.academicYear || undefined
      });
      setApplications(result.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setLoading(false);
    }
  }, [copy.genericError, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), filters.search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);

  const years = useMemo(
    () => Array.from(new Set(applications.map(item => item.academicYear))).sort().reverse(),
    [applications]
  );

  const openApplication = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.getAdmissionApplication(id);
      setSelected(result.application);
      setStatus(result.application.status === 'SUBMITTED' ? 'UNDER_REVIEW' : result.application.status);
      setNote('');
      setReason('');
      const results = result.application.senior3Results;
      setVerificationStatus(results?.verificationStatus || 'NOT_YET_VERIFIED');
      setVerificationNotes(results?.verificationNotes || '');
      setVerificationData(results?.verifiedSummary || results?.applicantReviewed || results?.extracted || emptyAcademicData());
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!selected || note.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api.addAdmissionReviewNote(selected.id, note.trim());
      setSelected(result.application);
      setNote('');
      setFeedback(copy.addNote);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.updateAdmissionStatus(selected.id, status, reason.trim());
      setSelected(result.application);
      setReason('');
      setFeedback(result.notifications.some(item => item.sent) ? copy.notificationNote : copy.messagingOff);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.updateAdmissionSettings({
        resultSlipRequired: settings.resultSlipRequired,
        resultSlipExceptionNote: settings.resultSlipRequired ? undefined : exceptionNote.trim()
      });
      setSettings(result);
      setExceptionNote(result.resultSlipExceptionNote || '');
      setFeedback(copy.settingsSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const saveVerification = async (nextStatus: ResultSlipVerificationStatus) => {
    if (!selected?.senior3Results) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.updateResultVerification(selected.id, {
        status: nextStatus,
        notes: verificationNotes.trim(),
        academicPerformance: verificationData
      });
      setSelected(result.application);
      setVerificationStatus(nextStatus);
      setFeedback(copy.resultVerification);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const verificationLabel = (status: ResultSlipVerificationStatus) => {
    switch (status) {
      case 'UNDER_VERIFICATION': return copy.statusUnder;
      case 'VERIFIED': return copy.statusVerified;
      case 'VERIFICATION_FAILED': return copy.statusFailed;
      case 'ADDITIONAL_DOCUMENT_REQUIRED': return copy.statusAdditionalDoc;
      default: return copy.statusNotYet;
    }
  };

  const hasAcademicData = (data?: AcademicPerformanceData) => Boolean(
    data?.studentName ||
      data?.examinationYear ||
      data?.total ||
      data?.aggregate ||
      data?.division ||
      data?.subjects.some(subject => subject.name || subject.marks || subject.grade)
  );

  const setVerificationField = <K extends keyof AcademicPerformanceData>(key: K, value: AcademicPerformanceData[K]) => {
    setVerificationData(previous => ({ ...previous, [key]: value }));
  };

  const setVerificationSubject = (index: number, key: keyof AcademicResultSubject, value: string) => {
    setVerificationData(previous => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) =>
        subjectIndex === index ? { ...subject, [key]: value } : subject
      )
    }));
  };

  const renderAcademicCard = (title: string, data?: AcademicPerformanceData, highlight = false) => (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {!hasAcademicData(data) ? (
        <p className="mt-2 text-sm text-slate-500">{copy.notProvided}</p>
      ) : (
        <dl className="mt-2 space-y-1.5 text-xs text-slate-700">
          <div><dt className="inline font-semibold">{copy.studentNameOnSlip}: </dt><dd className="inline">{data?.studentName || copy.notProvided}</dd></div>
          <div><dt className="inline font-semibold">{copy.examinationYear}: </dt><dd className="inline">{data?.examinationYear || copy.notProvided}</dd></div>
          {data?.subjects.length ? data.subjects.map((subject, index) => (
            <div key={`${title}-${index}`}>
              <dt className="inline font-semibold">{subject.name || copy.subject}: </dt>
              <dd className="inline">{[subject.marks, subject.grade].filter(Boolean).join(' · ') || copy.notProvided}</dd>
            </div>
          )) : <div>{copy.subject}: {copy.notProvided}</div>}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div><dt className="block font-semibold">{copy.total}</dt><dd>{data?.total || copy.notProvided}</dd></div>
            <div><dt className="block font-semibold">{copy.aggregate}</dt><dd>{data?.aggregate || copy.notProvided}</dd></div>
            <div><dt className="block font-semibold">{copy.division}</dt><dd>{data?.division || copy.notProvided}</dd></div>
          </div>
        </dl>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{copy.adminTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{copy.adminSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> {copy.stepReview}
          </button>
          <a href="/api/admissions/export" download className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">
            <Download className="h-4 w-4" /> {copy.exportCsv}
          </a>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-4 w-4" />{error}</div>}
      {feedback && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</div>}

      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-amber-900">{copy.slipSettings}</h2>
            <p className="mt-1 text-xs text-amber-800">{copy.slipRequiredHint}</p>
            <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={settings.resultSlipRequired}
                onChange={event => setSettings(previous => ({ ...previous, resultSlipRequired: event.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-blue-700"
              />
              {copy.slipRequiredSetting}
            </label>
            {!settings.resultSlipRequired && (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">{copy.slipExceptionReason}</span>
                <textarea
                  value={exceptionNote}
                  onChange={event => setExceptionNote(event.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-amber-200 bg-white p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={busy || (!settings.resultSlipRequired && exceptionNote.trim().length < 5)}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {copy.saveSettings}
            </button>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              value={filters.search}
              onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="relative">
            <Filter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <select
              value={filters.applicationType}
              onChange={event => setFilters(previous => ({ ...previous, applicationType: event.target.value }))}
              className="w-full appearance-none rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">{copy.filterType}</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <select
            value={filters.status}
            onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            aria-label={copy.filterStatus}
          >
            <option value="">{copy.filterStatus}</option>
            {STATUSES.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
          </select>
          <select
            value={filters.academicYear}
            onChange={event => setFilters(previous => ({ ...previous, academicYear: event.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            aria-label={copy.filterYear}
          >
            <option value="">{copy.filterYear}</option>
            {years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> {copy.stepReview}…</div>
        ) : applications.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{copy.noApplications}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{copy.referenceNumber}</th>
                  <th className="px-4 py-3 font-semibold">{copy.applicant}</th>
                  <th className="px-4 py-3 font-semibold">{copy.stepDetails}</th>
                  <th className="px-4 py-3 font-semibold">{copy.submitted}</th>
                  <th className="px-4 py-3 font-semibold">{copy.statusTitle}</th>
                  <th className="px-4 py-3 font-semibold">{copy.verificationStatusLabel}</th>
                  <th className="px-4 py-3 text-right font-semibold">{copy.viewDetails}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map(application => (
                  <tr key={application.id} className="hover:bg-sky-50/50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-800">{application.referenceNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{application.applicantFullName}</p>
                      <p className="text-xs text-slate-500">{application.applicantDistrict}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[application.applicationType]}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(application.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[application.status]}`}>
                        {application.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {application.senior3Results ? (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${VERIFICATION_STYLES[application.senior3Results.verificationStatus]}`}>
                          {verificationLabel(application.senior3Results.verificationStatus)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => void openApplication(application.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">
                        <Eye className="h-4 w-4" /> {copy.viewDetails}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {applications.length} {copy.applicationsCount} · {copy.notificationNote}
      </p>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="presentation">
          <button type="button" aria-label={copy.close} className="flex-1" onClick={() => setSelected(null)} />
          <aside role="dialog" aria-modal="true" aria-label={copy.applicationDetails} className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{copy.applicationDetails}</h2>
                <p className="font-mono text-sm text-blue-700">{selected.referenceNumber}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                <Clock3 className="h-4 w-4" />
                {TYPE_LABELS[selected.applicationType]} · {new Date(selected.submittedAt).toLocaleString()}
              </div>

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.personalHeading}</h3>
                <dl className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
                  {[
                    [copy.fullName, selected.applicantFullName],
                    [copy.dateOfBirth, selected.applicantDob],
                    [copy.phone, selected.applicantPhone],
                    [copy.email, selected.applicantEmail],
                    [copy.district, `${selected.applicantDistrict}${selected.applicantSector ? ` / ${selected.applicantSector}` : ''}`],
                    [copy.residence, selected.applicantResidence]
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="break-words font-semibold text-slate-800">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.guardianHeading}</h3>
                <p className="mt-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                  {selected.guardianFullName} · {selected.guardianPhone} · {selected.guardianRelationship}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.stepDetails}</h3>
                <dl className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
                  {Object.entries({
                    [copy.previousSchool]: selected.previousSchoolName || selected.currentSchoolName || selected.previousSchoolOther,
                    [copy.previousSchoolLocation]: selected.previousSchoolLocation || selected.currentSchoolLocation,
                    [copy.yearCompleted]: selected.academicYearCompleted || selected.transferAcademicYear,
                    [copy.senior3Status]: selected.senior3CompletionStatus,
                    [copy.requestedLevel]: selected.requestedLevel || selected.requestedClass || selected.requestedEducationLevel,
                    [copy.transferReason]: selected.transferReasonOther || selected.transferReason || selected.reasonForChoosingSchool || selected.applicationReason
                  }).filter(([, value]) => Boolean(value)).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="break-words font-semibold text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.documentsList}</h3>
                {selected.documents.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">{copy.noDocuments}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {selected.documents.map(document => (
                      <li key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                          <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                          <span className="truncate">{document.fileName}</span>
                          <span className="shrink-0 text-xs text-slate-400">{document.documentType.replaceAll('_', ' ')}</span>
                        </span>
                        <a
                          href={api.getAdmissionDocumentUrl(selected.id, document.id)}
                          download
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <Download className="h-4 w-4" /> {copy.download}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {selected.senior3Results && (
                <section className="border-t border-slate-200 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.resultVerification}</h3>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${VERIFICATION_STYLES[selected.senior3Results.verificationStatus]}`}>
                      {verificationLabel(selected.senior3Results.verificationStatus)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{copy.compareHint}</p>

                  <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-4 text-xs sm:grid-cols-2">
                    <div><span className="block font-semibold text-slate-500">{copy.referenceNumber}</span>{selected.referenceNumber}</div>
                    <div><span className="block font-semibold text-slate-500">{copy.applicant}</span>{selected.applicantFullName}</div>
                    <div><span className="block font-semibold text-slate-500">{copy.previousSchool}</span>{selected.senior3Results.previousSchoolName || copy.notProvided}</div>
                    <div><span className="block font-semibold text-slate-500">{copy.yearCompleted}</span>{selected.senior3Results.academicYearCompleted || copy.notProvided}</div>
                    <div><span className="block font-semibold text-slate-500">{copy.yearCompletedSenior3}</span>{selected.senior3Results.senior3CompletionYear || copy.notProvided}</div>
                    <div><span className="block font-semibold text-slate-500">{copy.requestedLevel}</span>{selected.senior3Results.requestedLevel || copy.notProvided}</div>
                  </div>

                  {(() => {
                    const slipDocument = selected.documents.find(document => document.documentType === 'SENIOR3_RESULTS');
                    if (!slipDocument) {
                      return <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{copy.resultSlipNotUploaded}</p>;
                    }
                    return (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                          <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                          <span className="truncate">{slipDocument.fileName}</span>
                        </span>
                        <span className="flex gap-2">
                          <a
                            href={api.getAdmissionDocumentPreviewUrl(selected.id, slipDocument.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          >
                            <ZoomIn className="h-4 w-4" /> {copy.viewSlip}
                          </a>
                          <a
                            href={api.getAdmissionDocumentUrl(selected.id, slipDocument.id)}
                            download
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          >
                            <Download className="h-4 w-4" /> {copy.download}
                          </a>
                        </span>
                      </div>
                    );
                  })()}

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {renderAcademicCard(copy.extractedInfo, selected.senior3Results.extracted)}
                    {renderAcademicCard(copy.applicantInfo, selected.senior3Results.applicantReviewed)}
                    {renderAcademicCard(copy.correctedInfo, selected.senior3Results.verifiedSummary, true)}
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.correctedInfo}</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="mb-1 block text-xs font-semibold text-slate-600">{copy.studentNameOnSlip}</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          value={verificationData.studentName || ''}
                          onChange={event => setVerificationField('studentName', event.target.value)}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-semibold text-slate-600">{copy.examinationYear}</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          value={verificationData.examinationYear || ''}
                          onChange={event => setVerificationField('examinationYear', event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="mt-3 space-y-2">
                      {verificationData.subjects.map((subject, index) => (
                        <div key={`verification-subject-${index}`} className="grid gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_auto]">
                          <input
                            className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                            placeholder={copy.subject}
                            value={subject.name}
                            onChange={event => setVerificationSubject(index, 'name', event.target.value)}
                          />
                          <input
                            className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                            placeholder={copy.marks}
                            value={subject.marks || ''}
                            onChange={event => setVerificationSubject(index, 'marks', event.target.value)}
                          />
                          <input
                            className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                            placeholder={copy.grade}
                            value={subject.grade || ''}
                            onChange={event => setVerificationSubject(index, 'grade', event.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setVerificationData(previous => ({ ...previous, subjects: previous.subjects.filter((_, subjectIndex) => subjectIndex !== index) }))}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            aria-label={`${copy.removeSubject} ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setVerificationData(previous => ({ ...previous, subjects: [...previous.subjects, { name: '', marks: '', grade: '' }] }))}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
                      >
                        <Send className="h-3.5 w-3.5" /> {copy.addSubject}
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {(['total', 'aggregate', 'division'] as const).map(key => (
                        <label key={key}>
                          <span className="mb-1 block text-xs font-semibold text-slate-600">{copy[key]}</span>
                          <input
                            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            value={verificationData[key] || ''}
                            onChange={event => setVerificationField(key, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{copy.verificationStatusLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      {VERIFICATION_STATUSES.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setVerificationStatus(item)}
                          className={`rounded-full px-3 py-2 text-xs font-bold ${verificationStatus === item ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          {verificationLabel(item)}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={verificationNotes}
                      onChange={event => setVerificationNotes(event.target.value)}
                      rows={3}
                      placeholder={copy.verificationNotes}
                      className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveVerification(verificationStatus)}
                        disabled={busy || (verificationStatus === 'VERIFIED' && !hasAcademicData(verificationData)) || (['VERIFICATION_FAILED', 'ADDITIONAL_DOCUMENT_REQUIRED'].includes(verificationStatus) && verificationNotes.trim().length < 5)}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        <ShieldCheck className="h-4 w-4" /> {copy.saveVerification}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVerificationStatus('VERIFIED');
                          void saveVerification('VERIFIED');
                        }}
                        disabled={busy || !hasAcademicData(verificationData)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" /> {copy.markVerified}
                      </button>
                    </div>
                    {verificationStatus === 'VERIFIED' && !hasAcademicData(verificationData) && (
                      <p className="mt-2 text-xs font-semibold text-red-700">{copy.verifiedSummaryRequired}</p>
                    )}
                  </div>

                  {selected.senior3Results.verifiedAt && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      {copy.verifiedBy}: {selected.senior3Results.verifiedByName || copy.notProvided} · {copy.verifiedAt}: {new Date(selected.senior3Results.verifiedAt).toLocaleString()}
                    </div>
                  )}

                  {selected.senior3Results.verificationHistory.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.verificationHistory}</h4>
                      <div className="mt-2 space-y-2">
                        {selected.senior3Results.verificationHistory.map(event => (
                          <div key={event.id} className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                            <span className="font-bold text-slate-800">{verificationLabel(event.status)}</span> · {event.changedByName} · {new Date(event.createdAt).toLocaleString()}
                            {event.notes && <p className="mt-1 whitespace-pre-wrap">{event.notes}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.reviewNotes}</h3>
                <p className="mt-1 text-xs text-slate-400">{copy.internalOnly}</p>
                <div className="mt-3 space-y-2">
                  {selected.reviewHistory.length === 0 ? <p className="text-sm text-slate-500">—</p> : selected.reviewHistory.map(item => (
                    <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-slate-800">{item.reviewerName} <span className="text-xs font-normal text-slate-400">· {new Date(item.createdAt).toLocaleString()}</span></p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.note}</p>
                    </div>
                  ))}
                </div>
                <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder={copy.notePlaceholder} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <button type="button" onClick={() => void addNote()} disabled={busy || note.trim().length < 2} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  <Send className="h-4 w-4" /> {copy.addNote}
                </button>
              </section>

              <section className="border-t border-slate-200 pt-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{copy.changeStatus}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUSES.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setStatus(item)}
                      className={`rounded-full px-3 py-2 text-xs font-bold ${status === item ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {item.replaceAll('_', ' ')}
                    </button>
                  ))}
                </div>
                {(status === 'REJECTED' || status === 'ADDITIONAL_INFO_REQUIRED') && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{copy.statusReason}</span>
                    <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => void changeStatus()}
                  disabled={busy || ((status === 'REJECTED' || status === 'ADDITIONAL_INFO_REQUIRED') && reason.trim().length < 5)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {copy.saveStatus}
                </button>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
