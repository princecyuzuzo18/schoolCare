import React, { useEffect, useMemo, useState } from 'react';
import type { AuditLogEntry } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import {
  ShieldAlert,
  Search,
  Lock,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Eye
} from 'lucide-react';

type CategoryFilter = 'ALL' | 'STAFF' | 'ACADEMIC' | 'HEALTH' | 'FINANCE' | 'COMMUNICATION' | 'SECURITY';

const CATEGORY_FILTERS: ReadonlyArray<{ id: CategoryFilter; labelKey: TranslationKey }> = [
  { id: 'ALL', labelKey: 'activityFilterAll' },
  { id: 'STAFF', labelKey: 'activityFilterStaff' },
  { id: 'ACADEMIC', labelKey: 'activityFilterAcademic' },
  { id: 'HEALTH', labelKey: 'activityFilterHealth' },
  { id: 'FINANCE', labelKey: 'activityFilterFinance' },
  { id: 'COMMUNICATION', labelKey: 'activityFilterCommunication' },
  { id: 'SECURITY', labelKey: 'activityFilterSecurity' }
];

const MAX_VISIBLE = 100;

function matchesCategory(log: AuditLogEntry, category: CategoryFilter): boolean {
  if (category === 'ALL') return true;
  const action = log.action.toUpperCase();
  const entity = log.entityType.toUpperCase();
  switch (category) {
    case 'STAFF':
      return action.startsWith('STAFF_') || action === 'USER_LOGIN' || entity.includes('STAFF');
    case 'ACADEMIC':
      return ['MARK', 'REPORT', 'ACADEMIC', 'SUBJECT', 'CLASS', 'COMBINATION', 'HOMEWORK', 'TIMETABLE']
        .some(term => entity.includes(term) || action.includes(term));
    case 'HEALTH':
      return entity.includes('HEALTH') || action.includes('HEALTH');
    case 'FINANCE':
      return ['INVOICE', 'PAYMENT', 'FEE', 'FINANCE'].some(term => entity.includes(term) || action.includes(term));
    case 'COMMUNICATION':
      return ['NOTIFICATION', 'MESSAGE', 'EVENT', 'SMS', 'EMAIL'].some(term => entity.includes(term) || action.includes(term));
    case 'SECURITY':
      return ['PERMISSION', 'AUDIT', 'ACCESS', 'ROLE', 'LOGIN', 'SIGNUP', 'PASSWORD'].some(term =>
        entity.includes(term) || action.includes(term)
      );
    default:
      return true;
  }
}

export const AuditPage: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [todayOnly, setTodayOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await api.getAuditLogs();
        setLogs(data);
      } catch (err) {
        console.error(err);
        setError(t('alertLoadError'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = new Date().toDateString();
    return logs.filter(log => {
      if (!matchesCategory(log, category)) return false;
      if (todayOnly && new Date(log.timestamp).toDateString() !== today) return false;
      if (!query) return true;
      return (
        log.action.toLowerCase().includes(query) ||
        log.userName.toLowerCase().includes(query) ||
        log.details.toLowerCase().includes(query) ||
        log.entityType.toLowerCase().includes(query)
      );
    });
  }, [logs, search, category, todayOnly]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('activityAppendOnly')}</span>
          </span>
          <span className="text-xs text-slate-500">{t('activityScoped')}</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">{t('activityHistoryTitle')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t('activityHistorySubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">{t('activityAppendOnly')}</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-lg font-black text-white mt-2">{t('activityPermissionGated')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('activityReviewPermission')}</p>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">{t('activityPrivacy')}</span>
            <Lock className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-lg font-black text-white mt-2">{t('activitySensitiveRedacted')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('activityHistorySubtitle')}</p>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">{t('activityCountCard')}</span>
            <Eye className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-lg font-black text-white mt-2">{filtered.length}</p>
          <p className="text-xs text-slate-400 mt-1">{t('activityLatest')}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('activityFilterAll')}
            aria-label={t('activityFilterAll')}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_FILTERS.map(filter => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setCategory(filter.id)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 transition ${
                category === filter.id
                  ? 'bg-blue-700 text-white ring-blue-700'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {t(filter.labelKey)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTodayOnly(value => !value)}
            aria-pressed={todayOnly}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 transition ${
              todayOnly
                ? 'bg-emerald-700 text-white ring-emerald-700'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {t('activityTodayOnly')}
          </button>
        </div>
        <p className="flex items-start gap-1.5 text-[10px] text-slate-400">
          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
          {t('activityRedactionNote')}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-[11px] font-bold text-slate-600">
            {t('activityShowing')} {visible.length} {t('activityLatest')}
          </p>
          <p className="text-[10px] text-slate-400">{filtered.length > MAX_VISIBLE ? `… ${filtered.length}` : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">{t('activityTimestamp')}</th>
                <th className="py-3 px-4">{t('activityAction')}</th>
                <th className="py-3 px-4">{t('activityActor')}</th>
                <th className="py-3 px-4">{t('activityEntity')}</th>
                <th className="py-3 px-4">{t('activityDetails')}</th>
                <th className="py-3 px-4">{t('activityIp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {visible.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 text-slate-500 font-medium">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-bold text-blue-700">
                    <span className="bg-blue-50 px-2 py-0.5 rounded text-[10px] font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <p className="font-bold text-slate-900">{log.userName}</p>
                    <p className="text-[10px] text-slate-500">{log.userRole}</p>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">
                    {log.entityType} ({log.entityId.slice(0, 12)}...)
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-700 max-w-sm">
                    {log.details}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {t('activityNoRecords')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
