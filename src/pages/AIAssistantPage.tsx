import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle, BookOpen, Check, FileText, RefreshCw, Settings2, Sparkles, Trash2, Upload
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api, ApiError } from '../services/api';
import AiChat from '../components/AiChat';
import type {
  AiIntent, AiKnowledgeDocument, AiSettings, AiUsageStats, LanguageCode, UserRole
} from '../types';

const KNOWLEDGE_MANAGERS: UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD'];
const SETTINGS_ADMINS: UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER'];
const ALL_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'NURSE',
  'ACCOUNTANT', 'DISCIPLINE_OFFICER', 'SCHOOL_IT', 'ANIMATEUR', 'PARENT', 'STUDENT'
];
const INTENTS: AiIntent[] = [
  'general', 'student_count', 'attendance_summary', 'academic_summary', 'my_results',
  'announcements', 'finance_summary', 'knowledge'
];
type Tab = 'chat' | 'knowledge' | 'settings';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function KnowledgePanel({ canManage }: { canManage: boolean }) {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<AiKnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [visibility, setVisibility] = useState<'SCHOOL' | 'SHARED'>('SCHOOL');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await api.listAiKnowledge());
      setError('');
    } catch (err) {
      setError(messageOf(err, t('aiErrorGeneric')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (file: File | null) => {
    if (!file) return;
    if (!/\.(txt|md|markdown|csv|json)$/i.test(file.name)) {
      setError('Only .txt, .md, .csv and .json documents are supported.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title.trim() || file.name);
      form.append('category', category.trim() || 'general');
      form.append('visibility', visibility);
      await api.uploadAiKnowledge(form);
      setTitle('');
      setNotice(t('aiSettingsSaved'));
      await load();
    } catch (err) {
      setError(messageOf(err, t('aiErrorGeneric')));
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const changeStatus = async (document: AiKnowledgeDocument, status: 'READY' | 'ARCHIVED') => {
    try {
      await api.updateAiKnowledge(document.id, { status });
      await load();
    } catch (err) {
      setError(messageOf(err, t('aiErrorGeneric')));
    }
  };

  const remove = async (document: AiKnowledgeDocument) => {
    if (!window.confirm(`${t('aiKnowledgeRemove')} "${document.title}"?`)) return;
    try {
      await api.deleteAiKnowledge(document.id);
      await load();
    } catch (err) {
      setError(messageOf(err, t('aiErrorGeneric')));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-[color:var(--schoolcare-brand-900)]">{t('aiKnowledgeBase')}</h2>
            <p className="mt-1 text-xs text-slate-600">{t('aiKnowledgeHint')}</p>
          </div>
        </div>
        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">{notice}</div>
        )}
        {canManage && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              {t('aiKnowledgeTitle')}
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              {t('aiKnowledgeCategory')}
              <input
                value={category}
                onChange={event => setCategory(event.target.value)}
                maxLength={80}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              {t('aiKnowledgeVisibility')}
              <select
                value={visibility}
                onChange={event => setVisibility(event.target.value as 'SCHOOL' | 'SHARED')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="SCHOOL">{t('aiKnowledgeSchoolOnly')}</option>
                <option value="SHARED">{t('aiKnowledgeShared')}</option>
              </select>
            </label>
            <div className="flex items-end">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,.csv,.json"
                className="hidden"
                onChange={event => void upload(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {saving ? t('aiThinking') : t('aiKnowledgeUpload')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p role="status" className="text-sm text-slate-500">{t('loading')}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">{t('aiKnowledgeEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map(document => (
              <li key={document.id} className="flex flex-wrap items-center gap-2 py-3">
                <FileText className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{document.title}</p>
                  <p className="text-xs text-slate-500">
                    {document.category} · {document.visibility === 'SHARED' ? t('aiKnowledgeShared') : t('aiKnowledgeSchoolOnly')} · {document.status}
                  </p>
                </div>
                {canManage && document.status !== 'ARCHIVED' && (
                  <button
                    type="button"
                    onClick={() => void changeStatus(document, 'ARCHIVED')}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {t('aiKnowledgeArchive')}
                  </button>
                )}
                {canManage && document.status === 'ARCHIVED' && (
                  <button
                    type="button"
                    onClick={() => void changeStatus(document, 'READY')}
                    className="rounded-lg border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                  >
                    {t('aiRetry')}
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void remove(document)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    title={t('aiKnowledgeRemove')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [usage, setUsage] = useState<AiUsageStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.getAiSettings(), api.getAiUsage(30)]).then(([settingsResult, usageResult]) => {
      if (!active) return;
      if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value);
      else setError(messageOf(settingsResult.reason, t('aiErrorGeneric')));
      if (usageResult.status === 'fulfilled') setUsage(usageResult.value);
    });
    return () => { active = false; };
  }, [t]);

  const patch = (change: Partial<AiSettings>) => {
    setSettings(previous => previous ? { ...previous, ...change } : previous);
  };

  const toggleList = <T,>(list: T[] | null, value: T): T[] | null => {
    const current = list ?? [];
    return current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.updateAiSettings(settings);
      setSettings(saved);
      setNotice(t('aiSettingsSaved'));
    } catch (err) {
      setError(messageOf(err, t('aiErrorGeneric')));
    } finally {
      setSaving(false);
    }
  };

  const purge = async () => {
    if (!window.confirm(t('aiSettingsPurge') + '?')) return;
    try {
      await api.purgeAiData();
      setNotice(t('aiSettingsSaved'));
    } catch (err) {
      setError(messageOf(err, t('aiErrorGeneric')));
    }
  };

  if (!settings) {
    return (
      <div className="p-6">
        <p role="status" className="text-sm text-slate-600">{t('loading')}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[color:var(--schoolcare-brand-900)]">{t('aiSettings')}</h2>
        </div>
        {error && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>
        )}
        {notice && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">{notice}</div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.isEnabled}
              onChange={event => patch({ isEnabled: event.target.checked })}
              className="h-4 w-4 accent-blue-700"
            />
            {t('aiSettingsEnabled')}
          </label>
          <label className="text-xs font-medium text-slate-700">
            {t('aiSettingsModel')}
            <input
              value={settings.model}
              onChange={event => patch({ model: event.target.value })}
              maxLength={100}
              placeholder="gemini-flash-latest"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            {t('aiSettingsDefaultLanguage')}
            <select
              value={settings.defaultLanguage}
              onChange={event => patch({ defaultLanguage: event.target.value as LanguageCode })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="en">English</option>
              <option value="rw">Kinyarwanda</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            {t('aiSettingsRateLimit')}
            <input
              type="number"
              min={1}
              max={10000}
              value={settings.rateLimitPerHour}
              onChange={event => patch({ rateLimitPerHour: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            {t('aiSettingsRetention')}
            <input
              type="number"
              min={1}
              max={3650}
              value={settings.retentionDays}
              onChange={event => patch({ retentionDays: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-slate-700">{t('aiSettingsAllowedRoles')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_ROLES.map(role => (
              <label key={role} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.allowedRoles === null || settings.allowedRoles.includes(role)}
                  onChange={() => patch({ allowedRoles: toggleList(settings.allowedRoles, role) })}
                  className="h-3 w-3 accent-blue-700"
                />
                {role.replaceAll('_', ' ')}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{t('aiAutomatic')} = null / all roles.</p>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-slate-700">{t('aiSettingsPermittedTools')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTENTS.map(intent => (
              <label key={intent} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.permittedTools === null || settings.permittedTools.includes(intent)}
                  onChange={() => patch({ permittedTools: toggleList(settings.permittedTools, intent) })}
                  className="h-3 w-3 accent-blue-700"
                />
                {intent.replaceAll('_', ' ')}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {t('aiSettingsSave')}
          </button>
          <button
            type="button"
            onClick={() => void purge()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('aiSettingsPurge')}
          </button>
        </div>
      </div>

      {usage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-[color:var(--schoolcare-brand-900)]">{t('aiSettingsUsage')}</h3>
          {usage.rows.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">{t('aiKnowledgeEmpty')}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {usage.rows.slice(0, 8).map((row, index) => (
                <li key={`${row.action}-${row.status}-${index}`} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1">
                  <span>{row.action} · {row.status}{row.errorCode ? ` · ${row.errorCode}` : ''}</span>
                  <span className="font-semibold">{row.count} · {row.averageLatencyMs} ms</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const AIAssistantPage: React.FC = () => {
  const { role } = useAuth();
  const { t } = useLanguage();
  const canManageKnowledge = role !== null && KNOWLEDGE_MANAGERS.includes(role);
  const canManageSettings = role !== null && SETTINGS_ADMINS.includes(role);
  const [tab, setTab] = useState<Tab>('chat');

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode; visible: boolean }> = [
    { id: 'chat', label: t('aiTitle'), icon: <Sparkles size={15} aria-hidden="true" />, visible: true },
    { id: 'knowledge', label: t('aiKnowledgeBase'), icon: <BookOpen size={15} aria-hidden="true" />, visible: true },
    { id: 'settings', label: t('aiSettings'), icon: <Settings2 size={15} aria-hidden="true" />, visible: canManageSettings }
  ];

  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[color:var(--schoolcare-brand-900)] sm:text-xl">{t('aiTitle')}</h1>
          <p className="text-xs text-slate-600 sm:text-sm">{t('aiTagline')}</p>
        </div>
        <nav aria-label={t('aiTitle')} className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.filter(item => item.visible).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === item.id ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {tab === 'chat' && <AiChat />}
        {tab === 'knowledge' && <KnowledgePanel canManage={canManageKnowledge} />}
        {tab === 'settings' && canManageSettings && <SettingsPanel />}
      </div>
    </div>
  );
};
