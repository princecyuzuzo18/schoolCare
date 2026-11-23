import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../services/api';
import {
  School,
  Student,
  AttendanceRecord,
  HealthIncident,
  NotificationMessage,
  Invoice,
  Payment,
  StaffMember,
  AcademicClass,
  AuditLogEntry,
  UserRole,
  HeadteacherDashboardView
} from '../types';
import type { TranslationKey } from '../i18n';
import {
  Users,
  UserCheck,
  HeartPulse,
  CreditCard,
  MessageSquare,
  AlertTriangle,
  ArrowRight,
  Plus,
  Sparkles,
  PhoneCall,
  CheckCircle,
  Clock,
  Send,
  Building,
  GraduationCap,
  BarChart3,
  UserCog,
  ShieldCheck,
  ClipboardList,
  CalendarCheck,
  UserPlus,
  UserSquare2,
  KeyRound,
  Layers,
  Settings,
  ClipboardCheck
} from 'lucide-react';

const CONTROL_CENTER_ACTIONS: WorkspaceAction[] = [
  { tab: 'students', labelKey: 'quickAddStudent', icon: UserPlus, tone: 'blue' },
  { tab: 'staff-management', labelKey: 'quickAddStaff', icon: UserCog, tone: 'indigo' },
  { tab: 'guardians', labelKey: 'quickAddParent', icon: UserSquare2, tone: 'emerald' },
  { tab: 'permissions', labelKey: 'quickManagePermissions', icon: KeyRound, tone: 'blue' },
  { tab: 'academic-admin', labelKey: 'quickManageClasses', icon: ClipboardCheck, tone: 'indigo' },
  { tab: 'combination-management', labelKey: 'quickManageCombinations', icon: Layers, tone: 'blue' },
  { tab: 'reports', labelKey: 'quickViewReports', icon: BarChart3, tone: 'amber' },
  { tab: 'settings', labelKey: 'quickSchoolSettings', icon: Settings, tone: 'emerald' }
];

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
  onOpenIncidentModal: (incident?: HealthIncident) => void;
}

const ROLE_SUMMARY_KEYS: Partial<Record<UserRole, TranslationKey>> = {
  SUPER_ADMIN: 'headteacherSummary',
  SCHOOL_ADMIN: 'headteacherSummary',
  HEAD_TEACHER: 'headteacherSummary',
  DEPUTY_HEAD: 'teacherSummary',
  TEACHER: 'teacherSummary',
  NURSE: 'nurseSummary',
  ACCOUNTANT: 'accountantSummary',
  DISCIPLINE_OFFICER: 'disciplineSummary',
  SCHOOL_IT: 'itSummary',
  ANIMATEUR: 'animateurSummary'
};

interface WorkspaceAction {
  tab: string;
  labelKey: TranslationKey;
  icon: typeof UserCog;
  tone: 'blue' | 'indigo' | 'emerald' | 'amber';
}

const ROLE_ACTIONS: Partial<Record<UserRole, WorkspaceAction[]>> = {
  SUPER_ADMIN: [
    { tab: 'combination-management', labelKey: 'quickManageCombinations', icon: Layers, tone: 'blue' },
    { tab: 'staff-management', labelKey: 'staffManagementAction', icon: UserCog, tone: 'indigo' },
    { tab: 'permissions', labelKey: 'permissionsAction', icon: ShieldCheck, tone: 'blue' },
    { tab: 'audit', labelKey: 'auditReviewAction', icon: ClipboardList, tone: 'emerald' }
  ],
  SCHOOL_ADMIN: [
    { tab: 'combination-management', labelKey: 'quickManageCombinations', icon: Layers, tone: 'blue' },
    { tab: 'staff-management', labelKey: 'staffManagementAction', icon: UserCog, tone: 'indigo' },
    { tab: 'permissions', labelKey: 'permissionsAction', icon: ShieldCheck, tone: 'blue' },
    { tab: 'audit', labelKey: 'auditReviewAction', icon: ClipboardList, tone: 'emerald' }
  ],
  HEAD_TEACHER: [
    { tab: 'combination-management', labelKey: 'quickManageCombinations', icon: Layers, tone: 'blue' },
    { tab: 'staff-management', labelKey: 'staffManagementAction', icon: UserCog, tone: 'indigo' },
    { tab: 'permissions', labelKey: 'permissionsAction', icon: ShieldCheck, tone: 'blue' },
    { tab: 'audit', labelKey: 'auditReviewAction', icon: ClipboardList, tone: 'emerald' }
  ],
  DEPUTY_HEAD: [
    { tab: 'attendance', labelKey: 'viewAttendance', icon: UserCheck, tone: 'blue' },
    { tab: 'academics', labelKey: 'viewStudents', icon: GraduationCap, tone: 'emerald' }
  ],
  TEACHER: [
    { tab: 'attendance', labelKey: 'viewAttendance', icon: UserCheck, tone: 'blue' },
    { tab: 'students', labelKey: 'viewStudents', icon: Users, tone: 'emerald' }
  ],
  NURSE: [
    { tab: 'health', labelKey: 'viewHealth', icon: HeartPulse, tone: 'blue' },
    { tab: 'students', labelKey: 'viewStudents', icon: Users, tone: 'emerald' }
  ],
  ACCOUNTANT: [
    { tab: 'finance', labelKey: 'viewFinance', icon: CreditCard, tone: 'amber' },
    { tab: 'reports', labelKey: 'viewReports', icon: BarChart3, tone: 'blue' }
  ],
  DISCIPLINE_OFFICER: [
    { tab: 'discipline', labelKey: 'viewDiscipline', icon: ShieldCheck, tone: 'blue' },
    { tab: 'attendance', labelKey: 'viewAttendance', icon: UserCheck, tone: 'emerald' }
  ],
  SCHOOL_IT: [
    { tab: 'staff', labelKey: 'viewStudents', icon: Users, tone: 'blue' },
    { tab: 'reports', labelKey: 'viewReports', icon: BarChart3, tone: 'emerald' }
  ],
  ANIMATEUR: [
    { tab: 'events', labelKey: 'viewEvents', icon: CalendarCheck, tone: 'blue' },
    { tab: 'communication', labelKey: 'sendMessage', icon: MessageSquare, tone: 'emerald' }
  ]
};

const TONE_CLASSES: Record<WorkspaceAction['tone'], string> = {
  blue: 'bg-blue-50 text-blue-800 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-800 border-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  amber: 'bg-amber-50 text-amber-800 border-amber-100'
};

interface HeadteacherOverviewProps {
  summary: HeadteacherDashboardView;
  onNavigate: (tab: string) => void;
}

const HeadteacherOverview: React.FC<HeadteacherOverviewProps> = ({ summary, onNavigate }) => {
  const { totals, attendance, academics, approvals, events, notifications, activities } = summary;
  const peopleCards = [
    { label: 'Students', value: totals.students, tab: 'students', icon: Users, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Staff', value: totals.staff, tab: 'staff', icon: UserCog, tone: 'bg-indigo-50 text-indigo-700' },
    { label: 'Parents', value: totals.parents, tab: 'guardians', icon: UserSquare2, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Active Classes', value: totals.activeClasses, tab: 'academic-admin', icon: GraduationCap, tone: 'bg-amber-50 text-amber-700' }
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Headteacher Overview</h2>
          <p className="text-[11px] text-slate-500">
            Live school-wide snapshot · {summary.schoolName}
            {summary.currentTerm ? ` · ${summary.currentTerm}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('approval-center')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Approval Center
          <span className="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{approvals.total}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {peopleCards.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.tab)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.tone}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
              <p className="text-[11px] font-semibold text-slate-500">{card.label}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">Academic Performance</h3>
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">
            {academics.average === null ? '—' : `${academics.average}%`}
          </p>
          <p className="text-[11px] text-slate-500">
            Average across {academics.evaluated} evaluated report cards
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              Pass {academics.passRate === null ? '—' : `${academics.passRate}%`}
            </span>
            {Object.entries(academics.gradeDistribution)
              .filter(([, count]) => count > 0)
              .map(([grade, count]) => (
                <span key={grade} className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                  {grade}: {count}
                </span>
              ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">Today's Attendance</h3>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">
            {attendance.rate === null ? '—' : `${attendance.rate}%`}
          </p>
          <p className="text-[11px] text-slate-500">
            {attendance.present} present · {attendance.absent} absent · {attendance.late} late
          </p>
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="mt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
          >
            Open attendance →
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">Pending Approvals</h3>
            <ClipboardList className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{approvals.total}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(approvals.byType).map(([type, count]) => (
              <span key={type} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                {type.replaceAll('_', ' ')}: {count}
              </span>
            ))}
            {approvals.total === 0 && (
              <span className="text-[11px] text-slate-500">No approvals waiting.</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">Upcoming Events</h3>
            <CalendarCheck className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-3 space-y-2">
            {events.map(event => (
              <div key={event.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-[11px] font-semibold text-slate-800">{event.titleEn}</span>
                <span className="text-[10px] text-slate-500">
                  {new Date(event.date).toLocaleDateString()}
                </span>
              </div>
            ))}
            {events.length === 0 && <p className="text-[11px] text-slate-500">No upcoming events.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">Recent Activity & Notifications</h3>
            <MessageSquare className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-3 space-y-2">
            {activities.slice(0, 3).map(activity => (
              <div key={activity.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-800">
                  {activity.action.replaceAll('_', ' ')}
                </p>
                <p className="text-[10px] text-slate-500">
                  {activity.userName} · {new Date(activity.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
            {notifications.slice(0, 2).map(message => (
              <div key={message.id} className="rounded-lg bg-blue-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-800">{message.titleEn}</p>
                <p className="text-[10px] text-slate-500">{message.channel} · {message.status}</p>
              </div>
            ))}
            {activities.length === 0 && notifications.length === 0 && (
              <p className="text-[11px] text-slate-500">No recent activity.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onOpenIncidentModal }) => {
  const { role, currentUser, school } = useAuth();
  const { t } = useLanguage();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [incidents, setIncidents] = useState<HealthIncident[]>([]);
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [headteacherSummary, setHeadteacherSummary] = useState<HeadteacherDashboardView | null>(null);
  const [loading, setLoading] = useState(true);

  // Archived classes remain in records but are not offered as active options.
  const activeClasses = classes.filter(classItem => (classItem.status ?? 'ACTIVE') === 'ACTIVE');

  const now = new Date();
  const todayStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
  const todayLabel = new Intl.DateTimeFormat('en-RW', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(now);

  const loadData = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.getStudents(),
      api.getClasses(),
      api.getAttendance(todayStr),
      api.getHealthIncidents(),
      api.getNotifications(),
      api.getInvoices(),
      api.getPayments(),
      api.getStaff(),
      api.getAuditLogs(),
      api.getHeadteacherDashboard()
    ]);

    const value = <T,>(index: number): T | null =>
      results[index].status === 'fulfilled'
        ? (results[index] as PromiseFulfilledResult<T>).value
        : null;

    setStudents(value<Student[]>(0) ?? []);
    setClasses(value<AcademicClass[]>(1) ?? []);
    setAttendance(value<AttendanceRecord[]>(2) ?? []);
    setIncidents(value<HealthIncident[]>(3) ?? []);
    setNotifications(value<NotificationMessage[]>(4) ?? []);
    setInvoices(value<Invoice[]>(5) ?? []);
    setPayments(value<Payment[]>(6) ?? []);
    setStaff(value<StaffMember[]>(7) ?? []);
    setAuditLogs(value<AuditLogEntry[]>(8) ?? []);
    setHeadteacherSummary(value<HeadteacherDashboardView>(9));

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('A dashboard data source was unavailable:', result.reason);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [role]);

  // Calculations
  const presentCount = attendance.filter(a => a.status === 'PRESENT').length;
  const absentCount = attendance.filter(a => a.status === 'ABSENT').length;
  const lateCount = attendance.filter(a => a.status === 'LATE').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : null;

  const urgentIncidents = incidents.filter(i => !i.resolved && (i.priority === 'URGENT' || i.priority === 'EMERGENCY'));
  const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmountRwf, 0);
  const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmountRwf, 0);
  const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.balanceRwf, 0);

  const summaryKey = role ? ROLE_SUMMARY_KEYS[role] : undefined;
  const workspaceActions: WorkspaceAction[] = role ? ROLE_ACTIONS[role] ?? [] : [];
  const canViewStudents = ['SUPER_ADMIN','SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD','TEACHER','NURSE','ACCOUNTANT','DISCIPLINE_OFFICER','SCHOOL_IT','ANIMATEUR'].includes(role ?? '');
  const canViewAttendance = ['SUPER_ADMIN','SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD','TEACHER','DISCIPLINE_OFFICER','ANIMATEUR'].includes(role ?? '');
  const canViewHealth = ['SUPER_ADMIN','SCHOOL_ADMIN','HEAD_TEACHER','NURSE'].includes(role ?? '');
  const canViewFinance = ['SUPER_ADMIN','SCHOOL_ADMIN','HEAD_TEACHER','ACCOUNTANT'].includes(role ?? '');
  const isSchoolAdministrator = ['SUPER_ADMIN','SCHOOL_ADMIN','HEAD_TEACHER'].includes(role ?? '');

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Welcome */}
      <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-5 overflow-hidden bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-slate-200">
        <img
          src="/school-campus.svg"
          alt=""
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-2/5 object-cover object-center opacity-[0.12] [mask-image:linear-gradient(to_right,transparent,black_55%)]"
        />
        <div className="relative z-10">
          <div className="relative z-10 flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100">
              {t(`role_${role}` as any) || role}
            </span>
            <span className="text-xs text-slate-500">
              {school?.name} <span aria-hidden="true">·</span> {todayLabel}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
            Muraho, {currentUser?.fullName || 'Administrator'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Smart School Operations, Health Emergency & Parent Communication System
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSchoolAdministrator && (
            <button
              onClick={() => onNavigate('approval-center')}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 shadow-sm transition-colors flex items-center gap-2"
            >
              <ClipboardList className="w-4 h-4 text-blue-600" />
              <span>Approval Center</span>
              {headteacherSummary && headteacherSummary.approvals.total > 0 && (
                <span className="ml-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {headteacherSummary.approvals.total}
                </span>
              )}
            </button>
          )}

          {role === 'NURSE' && (
            <button
              onClick={() => onOpenIncidentModal()}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-colors flex items-center gap-2"
            >
              <HeartPulse className="w-4 h-4" />
              <span>{t('reportIncident')}</span>
            </button>
          )}

          {(role === 'TEACHER' || role === 'SCHOOL_ADMIN' || role === 'HEAD_TEACHER') && (
            <button
              onClick={() => onNavigate('attendance')}
              className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs shadow-sm transition-colors flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>{t('markAttendance')}</span>
            </button>
          )}

          <button
            onClick={() => onNavigate('reports')}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 shadow-sm transition-colors flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <span>Executive Reports</span>
          </button>

          <button
            onClick={() => onNavigate('communication')}
            className="px-4 py-2.5 rounded-xl bg-[#102B50] hover:bg-[#173b6c] text-white font-semibold text-xs shadow-sm transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>{t('sendMessage')}</span>
          </button>
        </div>
      </div>

      {/* Role-specific workspace */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t('roleWorkspace')}</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {summaryKey ? t(summaryKey) : t('roleWorkspaceSubtitle')}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {role ? t(`role_${role}` as TranslationKey) : ''}
          </span>
        </div>
        {workspaceActions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {workspaceActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.tab}
                  type="button"
                  onClick={() => onNavigate(action.tab)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors ${TONE_CLASSES[action.tone]}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(action.labelKey)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* School Super Administrator control center */}
      {isSchoolAdministrator && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-blue-900">{t('controlCenter')}</h2>
              <p className="mt-1 text-xs text-blue-800/80">{t('controlCenterSubtitle')}</p>
            </div>
            <span className="rounded-full bg-blue-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {t(`role_${role}` as TranslationKey)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {CONTROL_CENTER_ACTIONS.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.tab}
                  type="button"
                  onClick={() => onNavigate(action.tab)}
                  className={`inline-flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center text-[11px] font-bold transition-colors ${TONE_CLASSES[action.tone]} hover:brightness-95`}
                >
                  <Icon className="h-5 w-5" />
                  {t(action.labelKey)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Server-authoritative Headteacher overview */}
      {isSchoolAdministrator && headteacherSummary && (
        <HeadteacherOverview summary={headteacherSummary} onNavigate={onNavigate} />
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        {canViewStudents && (
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="group w-full text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 transition-all"
            aria-label={`View ${students.length} active students`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Students</span>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight text-slate-900 mt-3">{students.length}</p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
              <span className="text-emerald-600 font-semibold">{activeClasses.length} Active classes</span>
              <span>• Current TVET programmes</span>
            </div>
          </button>
        )}

        {/* Daily Attendance Rate */}
        {canViewAttendance && (
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="group w-full text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 transition-all"
            aria-label={attendanceRate === null ? 'Open attendance; no roll call recorded today' : `View today's attendance, ${attendanceRate}% present`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('attendanceRate')}</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight text-slate-900 mt-3">{attendanceRate === null ? '—' : `${attendanceRate}%`}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              {attendance.length > 0 ? (
                <>
                  <span className="text-emerald-700 font-semibold">{presentCount} Present</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-700 font-semibold">{absentCount} Absent</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-semibold">{lateCount} Late</span>
                </>
              ) : (
                <span>No roll call recorded today</span>
              )}
            </div>
          </button>
        )}

        {/* Urgent Health Cases */}
        {canViewHealth && (
          <button
            type="button"
            onClick={() => onNavigate('health')}
            aria-label={`View health center, ${urgentIncidents.length} urgent cases`}
            className={`group w-full text-left p-5 rounded-2xl border hover:-translate-y-0.5 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
              urgentIncidents.length > 0
                ? 'bg-red-50/70 border-red-200 shadow-xs hover:shadow-md'
                : 'bg-white border-slate-200 shadow-xs hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Health Infirmary</span>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${urgentIncidents.length > 0 ? 'bg-red-100 text-red-700' : 'bg-rose-50 text-rose-700 group-hover:bg-rose-100 transition-colors'}`}>
                <HeartPulse className="w-5 h-5" />
              </div>
            </div>
            <p className={`text-3xl font-bold tracking-tight mt-3 ${urgentIncidents.length > 0 ? 'text-red-800' : 'text-slate-900'}`}>
              {urgentIncidents.length} Urgent Case{urgentIncidents.length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
              <span className="text-slate-700 font-semibold">{incidents.length} total recorded</span>
              <span>• Direct parent tracking</span>
            </div>
          </button>
        )}

        {/* Fees Collected in RWF */}
        {canViewFinance && (
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="group w-full text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 transition-all"
            aria-label={`View finance, ${totalCollected.toLocaleString()} Rwandan francs collected`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('totalCollected')}</span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight text-slate-900 mt-3">
              {totalCollected.toLocaleString()} <span className="text-sm font-bold text-slate-500">{t('currency')}</span>
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
              <span className="text-amber-700 font-semibold">
                Bal: {totalOutstanding.toLocaleString()} {t('currency')}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Main Grid: Health Emergencies & Attendance Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Health & Emergencies Alert Hub */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{t('healthTitle')}</h3>
                  <p className="text-xs text-slate-600">Immediate logging, parent contact & clinic escalation</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('health')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>{t('view')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {incidents.slice(0, 3).map(inc => (
                <div
                  key={inc.id}
                  onClick={() => onOpenIncidentModal(inc)}
                  className={`p-4 rounded-xl border transition cursor-pointer hover:shadow-xs ${
                    inc.priority === 'URGENT' || inc.priority === 'EMERGENCY'
                      ? 'bg-red-50/70 border-red-200'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {inc.referenceNumber}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {inc.studentName} ({inc.studentClass})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inc.priority === 'URGENT' || inc.priority === 'EMERGENCY'
                              ? 'bg-red-600 text-white'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {inc.priority}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1 font-medium">{inc.symptoms}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                        <span>Staff: {inc.responsibleStaffName}</span>
                        <span>•</span>
                        <span className="text-blue-700 font-semibold">
                          Guardian: {inc.guardianName} ({inc.contactStatus})
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-slate-500">{inc.time}</span>
                      <div className="mt-1">
                        {inc.parentAcknowledged ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Acknowledged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" /> Pending Reply
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's Absences & Parent Justifications */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Daily Roll Call & Absence Tracking
                </h3>
              </div>
              <button
                onClick={() => onNavigate('attendance')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>{t('attendanceTitle')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {attendance.filter(a => a.status === 'ABSENT' || a.status === 'LATE').map(rec => (
                <div key={rec.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-900">{rec.studentName}</p>
                    <p className="text-[11px] text-slate-500">
                      {rec.className} • {rec.remarks || 'No roll-call note'}
                    </p>
                    {rec.parentExplanation && (
                      <p className="text-[11px] text-emerald-700 mt-1 font-medium bg-emerald-50 px-2 py-0.5 rounded">
                        Parent Note: "{rec.parentExplanation}"
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rec.status === 'ABSENT' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rec.status}
                    </span>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {rec.parentNotified ? 'SMS Alert Delivered' : 'Pending Alert'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Communication Feed & Classes Overview */}
        <div className="lg:col-span-5 space-y-6">
          {/* Recent Communication Log */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">{t('commTitle')}</h3>
              </div>
              <button
                onClick={() => onNavigate('communication')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>{t('view')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {notifications.slice(0, 3).map(msg => (
                <div key={msg.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      {msg.channel}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {msg.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 mt-1.5">{msg.titleEn}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{msg.contentEn}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-600">
                    <span>To: {msg.recipientName}</span>
                    <span>Provider: {msg.provider}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Academic Classes List */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Classes & TVET Trades</h3>
              </div>
              <button
                onClick={() => onNavigate('academics')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>{t('navAcademics')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {activeClasses.map(c => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{c.combination} • {c.room}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-blue-600">{c.studentCount} Students</span>
                    <p className="text-[10px] text-slate-600">{c.classTeacherName}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent administrative activity (Headteacher only) */}
          {isSchoolAdministrator && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">{t('recentAdminActivity')}</h3>
                </div>
                <button
                  onClick={() => onNavigate('audit')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <span>{t('view')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-3">
                {auditLogs.slice(0, 5).map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="mt-0.5 rounded-lg bg-indigo-100 p-1.5 text-indigo-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-slate-800">{entry.action.replaceAll('_', ' ')}</p>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-600">{entry.details}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {entry.userName} · {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <p className="text-xs text-slate-500">{t('noRecentActivity')}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
