import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Receipt,
  ShieldCheck,
  UserPlus,
  Users
} from 'lucide-react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import type { HeadteacherApprovalItem, HeadteacherDashboardView } from '../types';

interface ApprovalCenterPageProps {
  onNavigate: (tab: string) => void;
}

const TYPE_META: Record<
  HeadteacherApprovalItem['type'],
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  ADMISSION: { label: 'Admissions', icon: UserPlus, tone: 'bg-blue-50 text-blue-700' },
  MARKS: { label: 'Marks', icon: GraduationCap, tone: 'bg-violet-50 text-violet-700' },
  REPORT_CARD: { label: 'Report Cards', icon: FileCheck2, tone: 'bg-emerald-50 text-emerald-700' },
  SIGNUP: { label: 'Account Requests', icon: ShieldCheck, tone: 'bg-amber-50 text-amber-700' },
  STAFF_REQUEST: { label: 'Staff Requests', icon: Users, tone: 'bg-indigo-50 text-indigo-700' },
  FINANCE: { label: 'Finance', icon: Receipt, tone: 'bg-rose-50 text-rose-700' }
};

const TYPES = Object.keys(TYPE_META) as HeadteacherApprovalItem['type'][];

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export const ApprovalCenterPage: React.FC<ApprovalCenterPageProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<HeadteacherDashboardView | null>(null);
  const [filter, setFilter] = useState<'ALL' | HeadteacherApprovalItem['type']>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getHeadteacherDashboard();
        if (active) setSummary(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load approvals.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const items = useMemo(() => {
    const all = summary?.approvals.items ?? [];
    return filter === 'ALL' ? all : all.filter(item => item.type === filter);
  }, [summary, filter]);

  const byType = summary?.approvals.byType ?? {};

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">{t('navApprovalCenter')}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                One queue for admissions, marks, report cards, account requests, staff and finance.
                Only items you are permitted to review are shown.
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 text-white px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Pending</p>
            <p className="text-xl font-black">{summary?.approvals.total ?? 0}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {TYPES.map(type => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                filter === type
                  ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">{meta.label}</p>
              <p className="text-lg font-black text-slate-900">{byType[type] ?? 0}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Review queue</h2>
            <p className="text-[11px] text-slate-500">
              {filter === 'ALL' ? 'All approval types' : TYPE_META[filter].label}
            </p>
          </div>
          {filter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Show all
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading approvals…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-slate-700">You are all caught up</p>
            <p className="text-xs text-slate-500">No approvals are waiting in this queue.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map(item => {
              const meta = TYPE_META[item.type];
              const Icon = meta.icon;
              return (
                <li key={`${item.type}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${meta.tone}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="truncate text-xs text-slate-500">{item.detail}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {meta.label} · {item.status.replaceAll('_', ' ')} · {formatDate(item.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.tab)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Review
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ApprovalCenterPage;
