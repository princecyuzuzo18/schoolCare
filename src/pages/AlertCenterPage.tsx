import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  HeartPulse,
  Info,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import type {
  HeadteacherAttentionItem,
  HeadteacherDashboardView,
  HealthIncident,
  NotificationMessage
} from '../types';

interface AlertCenterPageProps {
  onNavigate: (tab: string) => void;
}

type SeverityFilter = 'ALL' | HeadteacherAttentionItem['severity'];

const SEVERITY_CLASSES: Record<HeadteacherAttentionItem['severity'], string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-slate-100 text-slate-700'
};

const SEVERITIES: HeadteacherAttentionItem['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function formatWhen(value: string | null): string {
  if (!value) return 'No deadline recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export const AlertCenterPage: React.FC<AlertCenterPageProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<HeadteacherDashboardView | null>(null);
  const [incidents, setIncidents] = useState<HealthIncident[]>([]);
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  const [category, setCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [dashboardResult, healthResult, notificationResult] = await Promise.allSettled([
      api.getHeadteacherDashboard(),
      api.getHealthIncidents(),
      api.getNotifications()
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setSummary(dashboardResult.value);
    } else {
      setError(t('alertLoadError'));
    }
    if (healthResult.status === 'fulfilled') setIncidents(healthResult.value);
    if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const attentionItems = summary?.attention.items ?? [];
  const categories = useMemo(
    () => Array.from(new Set(attentionItems.map(item => item.category))).sort(),
    [attentionItems]
  );
  const filteredAttention = useMemo(
    () => attentionItems.filter(item =>
      (severity === 'ALL' || item.severity === severity) &&
      (category === 'ALL' || item.category === category)
    ),
    [attentionItems, severity, category]
  );
  const urgentIncidents = useMemo(
    () => incidents.filter(item =>
      !item.resolved && (item.priority === 'URGENT' || item.priority === 'EMERGENCY')
    ),
    [incidents]
  );
  const urgentNotifications = useMemo(
    () => notifications.filter(item =>
      item.status !== 'ACKNOWLEDGED' &&
      (item.priority === 'URGENT' || item.priority === 'EMERGENCY' || item.category === 'EMERGENCY')
    ),
    [notifications]
  );

  const acknowledgeIncident = async (incident: HealthIncident) => {
    setBusyKey(`incident-${incident.id}`);
    setNotice('');
    try {
      await api.acknowledgeIncident(incident.id, 'Acknowledged in Smart Alert Center');
      setNotice(t('alertIncidentAcknowledged'));
      await load();
    } catch {
      setNotice(t('alertActionFailed'));
    } finally {
      setBusyKey(null);
    }
  };

  const acknowledgeNotification = async (message: NotificationMessage) => {
    setBusyKey(`notification-${message.id}`);
    setNotice('');
    try {
      await api.acknowledgeNotification(message.id);
      setNotice(t('alertNotificationAcknowledged'));
      await load();
    } catch {
      setNotice(t('alertActionFailed'));
    } finally {
      setBusyKey(null);
    }
  };

  const totalSignals = attentionItems.length + urgentIncidents.length + urgentNotifications.length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-[#2B1A12] to-[#7C3E1D] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black">{t('navAlertCenter')}</h1>
              <p className="mt-1 max-w-2xl text-xs text-orange-100">{t('alertCenterSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 px-4 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-orange-100">Open signals</p>
              <p className="text-xl font-black">{totalSignals}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('alertRefresh')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Needs your attention</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">{t('alertAttentionSource')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={severity}
              onChange={event => setSeverity(event.target.value as SeverityFilter)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              aria-label={t('alertAllSeverities')}
            >
              <option value="ALL">{t('alertAllSeverities')}</option>
              {SEVERITIES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              aria-label={t('alertAllCategories')}
            >
              <option value="ALL">{t('alertAllCategories')}</option>
              {categories.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {loading && attentionItems.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">{t('alertLoading')}</p>
        ) : filteredAttention.length === 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold">{t('alertNoAttention')}</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredAttention.map(item => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">{item.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${SEVERITY_CLASSES[item.severity]}`}>
                    {item.severity}
                  </span>
                </div>
                <dl className="mt-3 space-y-1.5 text-[11px] text-slate-600">
                  <div><dt className="font-semibold text-slate-700">What happened:</dt> <dd className="inline">{item.whatHappened}</dd></div>
                  <div><dt className="font-semibold text-slate-700">Why it matters:</dt> <dd className="inline">{item.whyItMatters}</dd></div>
                  <div><dt className="font-semibold text-slate-700">{t('alertActionNeeded')}:</dt> <dd className="inline">{item.actionNeeded}</dd></div>
                  <div><dt className="font-semibold text-slate-700">{t('alertResponsible')}:</dt> <dd className="inline">{item.responsible}</dd></div>
                  <div><dt className="font-semibold text-slate-700">{t('alertWhen')}:</dt> <dd className="inline">{formatWhen(item.dueAt)}</dd></div>
                </dl>
                <button
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-800"
                >
                  {t('alertOpenModule')} <ArrowRight className="h-3 w-3" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-red-600" />
              <h2 className="text-sm font-bold text-slate-900">{t('alertHealthSignals')}</h2>
            </div>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
              {urgentIncidents.length}
            </span>
          </div>
          {urgentIncidents.length === 0 ? (
            <p className="mt-3 text-[11px] text-slate-500">{t('alertNoHealthAlerts')}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {urgentIncidents.map(incident => (
                <div key={incident.id} className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{incident.studentName} · {incident.studentClass}</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">{incident.category} · {incident.priority} · {incident.contactStatus}</p>
                    </div>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-700">{incident.symptoms}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('health')}
                      className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                    >
                      {t('alertOpenModule')}
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === `incident-${incident.id}`}
                      onClick={() => void acknowledgeIncident(incident)}
                      className="rounded-lg bg-red-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      {busyKey === `incident-${incident.id}` ? t('alertAcknowledging') : t('alertAcknowledge')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900">{t('alertNotificationSignals')}</h2>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {urgentNotifications.length}
            </span>
          </div>
          {urgentNotifications.length === 0 ? (
            <p className="mt-3 text-[11px] text-slate-500">{t('alertNoNotificationAlerts')}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {urgentNotifications.map(message => (
                <div key={message.id} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{message.titleEn}</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">{message.channel} · {message.priority} · {message.status}</p>
                    </div>
                    <BellRing className="h-4 w-4 shrink-0 text-amber-600" />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-700">{message.contentEn}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('communication')}
                      className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      {t('alertOpenModule')}
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === `notification-${message.id}`}
                      onClick={() => void acknowledgeNotification(message)}
                      className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-800 disabled:opacity-60"
                    >
                      {busyKey === `notification-${message.id}` ? t('alertAcknowledging') : t('alertAcknowledge')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="flex items-start gap-1.5 text-[10px] text-slate-400">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        This center reads existing records. Acknowledging a health incident or message uses the original module endpoint and is recorded in the audit trail.
      </p>
    </div>
  );
};
