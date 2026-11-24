import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  ListChecks,
  Plus,
  Printer,
  Search,
  Users
} from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  normalizeWorkspaceRecord,
  responseCounts,
  safeExternalLink,
  splitLines,
  splitList,
  toWorkspacePayload,
  withResponse,
  withTask,
  withToggledTask,
  type MeetingResponseValue,
  type WorkspaceMode,
  type WorkspaceRecord
} from '../utils/meetings';

type RawRecord = Record<string, unknown> & { id: string };
type StatusFilter = 'ALL' | 'OPEN' | 'DONE';

interface MeetingWorkspacePageProps {
  mode: WorkspaceMode;
}

interface FormState {
  title: string;
  date: string;
  time: string;
  link: string;
  invitees: string;
  agenda: string;
  notes: string;
  minutes: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  date: '',
  time: '',
  link: '',
  invitees: '',
  agenda: '',
  notes: '',
  minutes: ''
};

const EMPTY_TASK = { title: '', owner: '', dueDate: '' };

export const MeetingWorkspacePage: React.FC<MeetingWorkspacePageProps> = ({ mode }) => {
  const { t, language } = useLanguage();
  const { currentUser } = useAuth();
  const moduleKey = mode;

  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [task, setTask] = useState(EMPTY_TASK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const locale = language === 'rw' ? 'rw-RW' : 'en-GB';

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await api.getModuleRecords<RawRecord>(moduleKey);
      const normalized = raw.map(normalizeWorkspaceRecord);
      setRecords(normalized);
      setSelectedId(current => current && normalized.some(item => item.id === current) ? current : normalized[0]?.id ?? null);
    } catch (err) {
      console.error(err);
      setError(err instanceof ApiError ? err.message : t('alertLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [moduleKey]);

  const selected = useMemo(
    () => records.find(item => item.id === selectedId) ?? null,
    [records, selectedId]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter(item => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!query) return true;
      return [item.title, item.date, item.notes, item.minutes, ...item.invitees, ...item.agenda]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [records, search, statusFilter]);

  const describeError = (err: unknown, fallback: string) =>
    err instanceof ApiError ? err.message : fallback;

  const formatDate = (value: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const replaceRecord = (updated: WorkspaceRecord) => {
    setRecords(current => current.map(item => (item.id === updated.id ? updated : item)));
    setSelectedId(updated.id);
  };

  const saveStructured = async (updated: WorkspaceRecord) => {
    setSaving(true);
    setError('');
    try {
      const saved = await api.updateModuleRecord<RawRecord>(
        moduleKey,
        updated.id,
        toWorkspacePayload(updated)
      );
      replaceRecord(normalizeWorkspaceRecord(saved));
      setNotice(t('meetingSaved'));
    } catch (err) {
      setError(describeError(err, t('alertActionFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const title = form.title.trim();
    if (!title) {
      setError(t('meetingTitleLabel'));
      return;
    }

    const existing = editingId ? records.find(item => item.id === editingId) ?? null : null;
    const payload = toWorkspacePayload({
      id: editingId ?? undefined,
      title,
      date: form.date,
      time: form.time,
      link: form.link.trim(),
      invitees: splitList(form.invitees),
      agenda: splitLines(form.agenda),
      notes: form.notes,
      minutes: form.minutes,
      tasks: existing?.tasks ?? [],
      responses: existing?.responses ?? [],
      status: existing?.status ?? 'OPEN'
    });

    setSaving(true);
    setError('');
    try {
      const saved = editingId
        ? await api.updateModuleRecord<RawRecord>(moduleKey, editingId, payload)
        : await api.createModuleRecord<RawRecord>(moduleKey, payload);
      const normalized = normalizeWorkspaceRecord(saved);
      setRecords(current =>
        editingId
          ? current.map(item => (item.id === normalized.id ? normalized : item))
          : [normalized, ...current]
      );
      setSelectedId(normalized.id);
      resetForm();
      setNotice(t('meetingSaved'));
    } catch (err) {
      setError(describeError(err, t('alertActionFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: WorkspaceRecord) => {
    setForm({
      title: record.title,
      date: record.date,
      time: record.time,
      link: record.link,
      invitees: record.invitees.join(', '),
      agenda: record.agenda.join('\n'),
      notes: record.notes,
      minutes: record.minutes
    });
    setEditingId(record.id);
    setSelectedId(record.id);
    setNotice('');
  };

  const handleDelete = async (record: WorkspaceRecord) => {
    if (!window.confirm(`${t('delete')}: ${record.title}?`)) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteModuleRecord(moduleKey, record.id);
      setRecords(current => current.filter(item => item.id !== record.id));
      if (selectedId === record.id) setSelectedId(null);
      if (editingId === record.id) resetForm();
    } catch (err) {
      setError(describeError(err, t('alertActionFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleResponse = (value: MeetingResponseValue) => {
    if (!selected || !currentUser) return;
    void saveStructured(withResponse(
      selected,
      { id: currentUser.id, fullName: currentUser.fullName },
      value
    ));
  };

  const handleAddTask = () => {
    if (!selected || !task.title.trim()) return;
    void saveStructured(withTask(selected, task));
    setTask(EMPTY_TASK);
  };

  const counts = selected ? responseCounts(selected) : { YES: 0, NO: 0, MAYBE: 0 };
  const safeLink = selected ? safeExternalLink(selected.link) : null;
  const isMeetings = mode === 'meetings';
  const pageTitle = isMeetings ? t('meetingsTitle') : t('collaborationTitle');
  const pageSubtitle = isMeetings ? t('meetingsSubtitle') : t('collaborationSubtitle');
  const emptyText = isMeetings ? t('meetingNoRecords') : t('meetingNoCollaborationRecords');

  const handlePrint = () => {
    if (!selected) return;
    const body = document.body;
    const finish = () => {
      body.classList.remove('meeting-print-active');
      window.removeEventListener('afterprint', finish);
    };
    body.classList.add('meeting-print-active');
    window.addEventListener('afterprint', finish);
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-[#102B50]">{pageTitle}</h1>
          <p className="mt-1 text-xs text-slate-500">{pageSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!selected}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102B50] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-900 disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          {t('meetingPrintPdf')}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(280px,360px)_minmax(0,1fr)]">
        {/* Record list */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">{t('view')}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {filtered.length}
            </span>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label={t('search')}
              placeholder={t('search')}
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mb-3 flex gap-1.5">
            {(['ALL', 'OPEN', 'DONE'] as StatusFilter[]).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold ring-1 transition ${
                  statusFilter === status
                    ? 'bg-blue-700 text-white ring-blue-700'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {status === 'ALL' ? t('activityFilterAll') : status === 'DONE' ? t('meetingStatusDone') : t('meetingStatusOpen')}
              </button>
            ))}
          </div>
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {filtered.map(record => (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelectedId(record.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedId === record.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                }`}
              >
                <p className="truncate text-xs font-bold text-slate-900">{record.title || record.id}</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock className="h-3 w-3" />
                  {formatDate(record.date)} {record.time}
                </p>
                <p className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
                  <span><Users className="mr-0.5 inline h-3 w-3" />{record.invitees.length}</span>
                  <span><ListChecks className="mr-0.5 inline h-3 w-3" />{record.tasks.filter(item => item.status === 'DONE').length}/{record.tasks.length}</span>
                </p>
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-500">{emptyText}</p>
            )}
          </div>
        </section>

        {/* Create / edit form */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">
              {editingId ? t('meetingEdit') : t('meetingNew')}
            </h2>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-[11px] font-bold text-blue-700">
                {t('cancel')}
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label={t('meetingTitleLabel')}>
              <input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('meetingDateLabel')}>
                <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} className={inputClass} />
              </Field>
              <Field label={t('meetingTimeLabel')}>
                <input type="time" value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} className={inputClass} />
              </Field>
            </div>
            <Field label={t('meetingLinkLabel')}>
              <input type="url" value={form.link} onChange={event => setForm({ ...form, link: event.target.value })} placeholder="https://" className={inputClass} />
            </Field>
            <Field label={t('meetingInviteesLabel')}>
              <textarea rows={2} value={form.invitees} onChange={event => setForm({ ...form, invitees: event.target.value })} className={inputClass} />
            </Field>
            <Field label={t('meetingAgendaLabel')}>
              <textarea rows={3} value={form.agenda} onChange={event => setForm({ ...form, agenda: event.target.value })} className={inputClass} />
            </Field>
            <Field label={t('meetingNotesLabel')}>
              <textarea rows={3} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className={inputClass} />
            </Field>
            <Field label={t('meetingMinutesLabel')}>
              <textarea rows={3} value={form.minutes} onChange={event => setForm({ ...form, minutes: event.target.value })} className={inputClass} />
            </Field>
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {editingId ? t('save') : t('meetingNew')}
            </button>
          </form>
        </section>

        {/* Detail and structured actions */}
        <section className="space-y-4">
          {!selected && (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
              <FileText className="mr-2 h-5 w-5 text-slate-400" />
              {t('meetingSelectRecord')}
            </div>
          )}
          {selected && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{selected.title}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{formatDate(selected.date)}</span>
                      {selected.time && <span>• {selected.time}</span>}
                      <span className={`rounded-full px-2 py-0.5 font-bold ${selected.status === 'DONE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {selected.status === 'DONE' ? t('meetingStatusDone') : t('meetingStatusOpen')}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleEdit(selected)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                      {t('edit')}
                    </button>
                    <button type="button" onClick={() => void handleDelete(selected)} disabled={saving} className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      {t('delete')}
                    </button>
                  </div>
                </div>
                {safeLink ? (
                  <a href={safeLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('meetingOpenLink')}
                  </a>
                ) : selected.link ? (
                  <p className="mt-3 text-[11px] font-semibold text-amber-700">{t('meetingInvalidLink')}: {selected.link}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DetailCard title={t('meetingAgendaLabel')} icon={ListChecks}>
                  {selected.agenda.length ? (
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-700">
                      {selected.agenda.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                    </ol>
                  ) : <EmptyText text={t('meetingAgendaEmpty')} />}
                </DetailCard>

                <DetailCard title={t('meetingResponsesLabel')} icon={Users}>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {(['YES', 'NO', 'MAYBE'] as MeetingResponseValue[]).map(value => (
                      <button
                        key={value}
                        type="button"
                        disabled={saving || !currentUser}
                        onClick={() => handleResponse(value)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                      >
                        {value === 'YES' ? t('meetingResponseYes') : value === 'NO' ? t('meetingResponseNo') : t('meetingResponseMaybe')}
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 text-[10px] text-slate-500">
                    {t('meetingResponseYes')} {counts.YES} · {t('meetingResponseNo')} {counts.NO} · {t('meetingResponseMaybe')} {counts.MAYBE}
                  </p>
                  {selected.responses.length ? (
                    <ul className="space-y-1 text-xs text-slate-700">
                      {selected.responses.map(item => (
                        <li key={`${item.userId}-${item.respondedAt}`}>
                          <span className="font-semibold">{item.name}</span> — {
                            item.response === 'YES' ? t('meetingResponseYes') : item.response === 'NO' ? t('meetingResponseNo') : t('meetingResponseMaybe')
                          }
                        </li>
                      ))}
                    </ul>
                  ) : <EmptyText text={t('meetingResponsesEmpty')} />}
                </DetailCard>
              </div>

              <DetailCard title={t('meetingTasksLabel')} icon={ListChecks}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_130px_auto]">
                  <input value={task.title} onChange={event => setTask({ ...task, title: event.target.value })} placeholder={t('meetingTaskTitle')} className={inputClass} />
                  <input value={task.owner} onChange={event => setTask({ ...task, owner: event.target.value })} placeholder={t('meetingTaskOwner')} className={inputClass} />
                  <input type="date" value={task.dueDate} onChange={event => setTask({ ...task, dueDate: event.target.value })} aria-label={t('meetingTaskDue')} className={inputClass} />
                  <button type="button" onClick={handleAddTask} disabled={saving || !task.title.trim()} className="rounded-xl bg-slate-800 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">
                    {t('meetingAddTask')}
                  </button>
                </div>
                {selected.tasks.length ? (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {selected.tasks.map(item => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <div>
                          <p className={`font-semibold ${item.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.title}</p>
                          <p className="text-[10px] text-slate-500">
                            {item.owner || '—'} {item.dueDate ? `• ${formatDate(item.dueDate)}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveStructured(withToggledTask(selected, item.id))}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {item.status === 'DONE' ? t('meetingMarkOpen') : t('meetingMarkDone')}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <div className="mt-3"><EmptyText text={t('meetingTasksEmpty')} /></div>}
              </DetailCard>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DetailCard title={t('meetingNotesLabel')} icon={FileText}>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                    {selected.notes || t('meetingAgendaEmpty')}
                  </p>
                </DetailCard>
                <DetailCard title={t('meetingMinutesLabel')} icon={FileText}>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                    {selected.minutes || t('meetingMinutesEmpty')}
                  </p>
                </DetailCard>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Print-only structured sheet. The body class hides the interactive app. */}
      {selected && (
        <div id="meeting-print-sheet" className="hidden">
          <div className="border-b-2 border-slate-900 pb-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('reportInternalDraft')}</p>
            <h2 className="text-xl font-black uppercase text-[#102B50]">{selected.title}</h2>
            <p className="text-xs text-slate-600">{formatDate(selected.date)} {selected.time}</p>
          </div>
          <PrintSection title={t('meetingInviteesLabel')}>
            {selected.invitees.length ? selected.invitees.join(', ') : '—'}
          </PrintSection>
          <PrintSection title={t('meetingAgendaLabel')}>
            {selected.agenda.length ? selected.agenda.map((item, index) => `${index + 1}. ${item}`).join('\n') : t('meetingAgendaEmpty')}
          </PrintSection>
          <PrintSection title={t('meetingResponsesLabel')}>
            {selected.responses.length
              ? selected.responses.map(item => `${item.name}: ${item.response}`).join('\n')
              : t('meetingResponsesEmpty')}
          </PrintSection>
          <PrintSection title={t('meetingNotesLabel')}>
            {selected.notes || '—'}
          </PrintSection>
          <PrintSection title={t('meetingMinutesLabel')}>
            {selected.minutes || t('meetingMinutesEmpty')}
          </PrintSection>
          <PrintSection title={t('meetingTasksLabel')}>
            {selected.tasks.length
              ? selected.tasks.map(item => `[${item.status === 'DONE' ? 'x' : ' '}] ${item.title}${item.owner ? ` — ${item.owner}` : ''}${item.dueDate ? ` (${formatDate(item.dueDate)})` : ''}`).join('\n')
              : t('meetingTasksEmpty')}
          </PrintSection>
          <div className="mt-8 grid grid-cols-2 gap-8 text-center text-[10px] text-slate-600">
            <p className="border-t border-slate-400 pt-1">Chair / facilitator signature</p>
            <p className="border-t border-slate-400 pt-1">Minutes approver signature</p>
          </div>
        </div>
      )}
    </div>
  );
};

const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
  </label>
);

const DetailCard: React.FC<{ title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
    <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-slate-900">
      <Icon className="h-4 w-4 text-blue-700" />
      {title}
    </h3>
    {children}
  </div>
);

const EmptyText: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-xs italic text-slate-400">{text}</p>
);

const PrintSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-4">
    <h3 className="text-[11px] font-black uppercase tracking-wide text-[#102B50]">{title}</h3>
    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{children}</p>
  </section>
);
