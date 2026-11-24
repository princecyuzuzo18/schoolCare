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
  ClipboardCheck,
  Info,
  MapPin,
  CalendarDays,
  TrendingUp,
  ListChecks,
  Wallet,
  BookOpen,
  AlertCircle,
  CheckCircle2
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
  headteacherName: string;
  onNavigate: (tab: string) => void;
}

interface ActivityFeedItem {
  id: string;
  title: string;
  actor: string;
  time: string;
  status: string;
  detail: string;
  tab: string;
}

function formatDisplayDate(value: string): string {
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-RW', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function entityDestination(entityType: string): string {
  const map: Record<string, string> = {
    STUDENT: 'students',
    STAFF: 'staff-management',
    USER: 'staff-management',
    ATTENDANCE: 'attendance',
    MARK_SUBMISSION: 'academic-admin',
    REPORT_CARD: 'report-printing',
    INVOICE: 'finance',
    PAYMENT: 'finance',
    EVENT: 'events',
    ADMISSION_APPLICATION: 'admissions'
  };
  return map[entityType] ?? 'approval-center';
}

const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-slate-100 text-slate-700'
};

const HeadteacherOverview: React.FC<HeadteacherOverviewProps> = ({ summary, headteacherName, onNavigate }) => {
  const { totals, attendance, academics, approvals, attention, performance, events, activities, notifications, finance } = summary;
  const [trendDays, setTrendDays] = useState(14);
  const [classFilter, setClassFilter] = useState('ALL');

  const today = summary.generatedAt.slice(0, 10);
  const todayActivity: ActivityFeedItem[] = [
    ...activities
      .filter(item => String(item.timestamp).slice(0, 10) === today)
      .map(item => ({
        id: item.id,
        title: item.action.replaceAll('_', ' ').toLowerCase().replace(/^\w/, char => char.toUpperCase()),
        actor: `${item.userName} · ${item.userRole}`,
        time: item.timestamp,
        status: 'Recorded',
        detail: item.details || `${item.entityType} update`,
        tab: entityDestination(item.entityType)
      })),
    ...notifications
      .filter(item => String(item.createdAt).slice(0, 10) === today)
      .map(item => ({
        id: item.id,
        title: item.titleEn,
        actor: `${item.channel} · ${item.recipientName}`,
        time: item.createdAt,
        status: item.status,
        detail: item.contentEn,
        tab: 'communication'
      }))
  ]
    .sort((left, right) => right.time.localeCompare(left.time))
    .slice(0, 8);

  const cards = [
    { title: 'Total Students', value: totals.students, explanation: 'Learners currently in the school register.', source: 'Student register', tab: 'students', icon: Users, tone: 'bg-blue-50 text-blue-700' },
    { title: 'Total Staff', value: totals.staff, explanation: 'Active staff members registered at the school.', source: 'Staff directory', tab: 'staff', icon: UserCog, tone: 'bg-indigo-50 text-indigo-700' },
    { title: 'Total Teachers', value: totals.teachers, explanation: 'Active staff whose role is Teacher.', source: 'Staff roles', tab: 'staff-management', icon: BookOpen, tone: 'bg-sky-50 text-sky-700' },
    { title: 'Total Classes', value: totals.activeClasses, explanation: 'Classes currently marked active.', source: 'Academic classes', tab: 'academic-admin', icon: GraduationCap, tone: 'bg-amber-50 text-amber-700' },
    { title: "Today's Attendance", value: attendance.rate === null ? 'No data available' : `${attendance.rate}%`, explanation: attendance.total ? `Based on ${attendance.total} attendance records submitted today.` : 'No roll call has been submitted today.', source: 'Attendance records', tab: 'attendance', icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700' },
    { title: 'Students Absent Today', value: attendance.absent, explanation: 'Absence records recorded for today.', source: 'Attendance records', tab: 'attendance', icon: AlertCircle, tone: 'bg-red-50 text-red-700' },
    { title: 'Pending Admissions', value: totals.pendingAdmissions, explanation: 'Applications submitted or under review.', source: 'Admissions applications', tab: 'admissions', icon: UserPlus, tone: 'bg-violet-50 text-violet-700' },
    { title: 'Published Academic Results', value: totals.publishedResults, explanation: 'Report cards already published to families.', source: 'Report cards', tab: 'report-printing', icon: CheckCircle2, tone: 'bg-teal-50 text-teal-700' },
    { title: 'Pending Academic Approvals', value: totals.pendingAcademicApprovals, explanation: 'Marks submissions and report cards waiting for review.', source: 'Marks and report cards', tab: 'approval-center', icon: ClipboardCheck, tone: 'bg-orange-50 text-orange-700' },
    { title: 'Outstanding Fees', value: finance ? `${new Intl.NumberFormat('en-RW').format(finance.outstanding)} RWF` : 'No data available', explanation: finance ? 'Total balance across recorded invoices.' : 'Finance data is not available for this account.', source: 'Invoices', tab: 'finance', icon: Wallet, tone: 'bg-yellow-50 text-yellow-700' }
  ];

  const trend = performance.attendanceTrend.slice(-trendDays);
  const classRows = classFilter === 'ALL'
    ? performance.classPerformance
    : performance.classPerformance.filter(row => row.className === classFilter);
  const completionTotal = performance.examinationCompletion.total;
  const completionRows = [
    { label: 'Approved', value: performance.examinationCompletion.approved },
    { label: 'Submitted / under review', value: performance.examinationCompletion.submitted },
    { label: 'Returned to teacher', value: performance.examinationCompletion.returned },
    { label: 'Draft', value: performance.examinationCompletion.draft }
  ];

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-[#102B50] to-[#1D4E89] p-6 text-white shadow-sm">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Headteacher workspace</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome, {headteacherName}</h2>
            <p className="mt-1 text-sm text-blue-100">Headteacher – {summary.schoolName}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-blue-100">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Academic year: {summary.academicPeriod.academicYear ?? 'No data available'}</span>
              <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Term: {summary.academicPeriod.term ?? 'No data available'}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {summary.schoolName}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {formatDisplayDate(summary.generatedAt)}</span>
            </div>
            <p className="mt-2 text-[11px] text-blue-200">Academic period source: {summary.academicPeriod.source}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" onClick={() => onNavigate('settings')} className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">Profile & settings</button>
            <button type="button" onClick={() => onNavigate('communication')} className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">Notification center</button>
            <button type="button" onClick={() => onNavigate('approval-center')} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#102B50] hover:bg-blue-50">Quick actions ({approvals.total})</button>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">School overview</h3>
            <p className="text-[11px] text-slate-500">Each number comes from the school record shown underneath it. Click a card to open the related module.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <button key={card.title} type="button" onClick={() => onNavigate(card.tab)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                <div className="flex items-start justify-between gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.tone}`}><Icon className="h-4 w-4" /></span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <p className="mt-3 text-xl font-black text-slate-900">{card.value}</p>
                <p className="text-[11px] font-bold text-slate-700">{card.title}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{card.explanation}</p>
                <p className="mt-2 border-t border-slate-100 pt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Source: {card.source}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Needs Your Attention</h3>
            <p className="text-[11px] text-slate-500">What happened, why it matters, who is responsible, and the action to take.</p>
          </div>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-[11px] font-bold text-orange-800">{attention.total} item{attention.total === 1 ? '' : 's'}</span>
        </div>
        {attention.items.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-5 w-5" />
            <p className="text-xs font-semibold">Nothing needs your attention right now. All recorded queues are clear.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {attention.items.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">{item.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${SEVERITY_CLASSES[item.severity] ?? SEVERITY_CLASSES.LOW}`}>{item.severity}</span>
                </div>
                <dl className="mt-3 space-y-1.5 text-[11px] text-slate-600">
                  <div><dt className="font-semibold text-slate-700">What happened:</dt> <dd className="inline">{item.whatHappened}</dd></div>
                  <div><dt className="font-semibold text-slate-700">Why it matters:</dt> <dd className="inline">{item.whyItMatters}</dd></div>
                  <div><dt className="font-semibold text-slate-700">Action needed:</dt> <dd className="inline">{item.actionNeeded}</dd></div>
                  <div><dt className="font-semibold text-slate-700">Responsible:</dt> <dd className="inline">{item.responsible}</dd></div>
                  <div><dt className="font-semibold text-slate-700">When:</dt> <dd className="inline">{item.dueAt ? formatDisplayDate(item.dueAt) : 'No deadline recorded; review as soon as possible.'}</dd></div>
                </dl>
                <button type="button" onClick={() => onNavigate(item.tab)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-800">Take action <ArrowRight className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Today's School Activity</h3>
            <p className="text-[11px] text-slate-500">Recorded updates, responsible person, time and current status.</p>
          </div>
          <button type="button" onClick={() => onNavigate('audit')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-900">View full history →</button>
        </div>
        {todayActivity.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-xs font-semibold text-slate-600">No activity has been recorded today.</p>
            <p className="mt-1 text-[11px] text-slate-500">New registrations, attendance submissions, marks approvals and staff actions will appear here.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {todayActivity.map(item => (
              <button key={item.id} type="button" onClick={() => onNavigate(item.tab)} className="flex w-full items-start justify-between gap-4 py-3 text-left hover:bg-slate-50">
                <div>
                  <p className="text-xs font-bold text-slate-800">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.detail}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{item.actor} · {formatDisplayDate(item.time)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{item.status}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">School performance overview</h3>
            <p className="text-[11px] text-slate-500">Only recorded data is shown. Use the filters to focus the view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-[10px] font-semibold text-slate-500">
              Attendance window
              <select value={trendDays} onChange={event => setTrendDays(Number(event.target.value))} className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
              </select>
            </label>
            <label className="text-[10px] font-semibold text-slate-500">
              Class
              <select value={classFilter} onChange={event => setClassFilter(event.target.value)} className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
                <option value="ALL">All classes</option>
                {performance.classPerformance.map(row => <option key={row.className} value={row.className}>{row.className}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">Attendance trend</h4>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            {trend.length === 0 ? (
              <p className="mt-4 text-[11px] text-slate-500">No data available. Attendance appears after roll calls are submitted.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {trend.map(point => (
                  <div key={point.date} className="grid grid-cols-[74px_1fr_44px] items-center gap-2 text-[10px]">
                    <span className="text-slate-500">{point.date.slice(5)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${point.rate ?? 0}%` }} />
                    </div>
                    <span className="text-right font-bold text-slate-700">{point.rate === null ? '—' : `${point.rate}%`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">Class performance</h4>
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
            {classRows.length === 0 ? (
              <p className="mt-4 text-[11px] text-slate-500">No data available. Class averages appear after report cards are generated.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-slate-500"><th className="pb-2">Class</th><th className="pb-2">Evaluated</th><th className="pb-2">Average</th><th className="pb-2">Pass</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {classRows.map(row => (
                      <tr key={row.className}>
                        <td className="py-2 font-semibold text-slate-800">{row.className}</td>
                        <td className="py-2">{row.evaluated}</td>
                        <td className="py-2">{row.average === null ? '—' : `${row.average}%`}</td>
                        <td className="py-2">{row.passRate === null ? '—' : `${row.passRate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[10px] text-slate-400">Subject-level performance is not available until subject marks are recorded.</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">Examination completion</h4>
              <ListChecks className="h-4 w-4 text-amber-600" />
            </div>
            {completionTotal === 0 ? (
              <p className="mt-4 text-[11px] text-slate-500">No data available. No marks submissions have been recorded.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {completionRows.map(row => {
                  const rate = Math.round((row.value / completionTotal) * 100);
                  return (
                    <div key={row.label} className="grid grid-cols-[1fr_70px_36px] items-center gap-2 text-[10px]">
                      <span className="text-slate-600">{row.label}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${rate}%` }} /></div>
                      <span className="text-right font-bold text-slate-700">{row.value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">Staff task completion</h4>
              <UserCog className="h-4 w-4 text-indigo-600" />
            </div>
            {!performance.staffTaskCompletion ? (
              <p className="mt-4 text-[11px] text-slate-500">No data available for this account.</p>
            ) : (
              <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                <p>Invitations: <span className="font-bold text-slate-800">{performance.staffTaskCompletion.total}</span></p>
                <p>Activated: <span className="font-bold text-emerald-700">{performance.staffTaskCompletion.activated}</span></p>
                <p>Awaiting activation: <span className="font-bold text-amber-700">{performance.staffTaskCompletion.pending}</span></p>
              </div>
            )}
            {finance && (
              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
                <p className="font-bold text-slate-800">Finance summary</p>
                <p className="mt-1">Billed: {new Intl.NumberFormat('en-RW').format(finance.billed)} RWF</p>
                <p>Collected: {new Intl.NumberFormat('en-RW').format(finance.collected)} RWF</p>
                <p>Outstanding: {new Intl.NumberFormat('en-RW').format(finance.outstanding)} RWF</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Upcoming events</h3>
            <CalendarCheck className="h-4 w-4 text-blue-600" />
          </div>
          {events.length === 0 ? (
            <p className="mt-3 text-[11px] text-slate-500">No upcoming events are recorded.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {events.map(event => (
                <div key={event.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-[11px] font-semibold text-slate-800">{event.titleEn}</span>
                  <span className="text-[10px] text-slate-500">{event.date} {event.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Approval queue</h3>
            <ClipboardList className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">{approvals.total} item{approvals.total === 1 ? '' : 's'} waiting. Open the Approval Center to review them.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(approvals.byType).map(([type, count]) => (
              <span key={type} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">{type.replaceAll('_', ' ')}: {count}</span>
            ))}
            {approvals.total === 0 && <span className="text-[11px] text-slate-500">No approvals waiting.</span>}
          </div>
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Info className="h-3 w-3" />
        Figures are generated from existing school records at {formatDisplayDate(summary.generatedAt)}. Unavailable information is labelled instead of shown as zero.
      </p>
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
  const isHeadteacher = role === 'HEAD_TEACHER';
  const headteacherName = currentUser?.fullName?.trim() || 'MUNYENTWARI Olivier';
  const showLegacyHeadteacherTiles = !(isHeadteacher && headteacherSummary);

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
            {isHeadteacher ? `Welcome, ${headteacherName}` : `Muraho, ${currentUser?.fullName || 'Administrator'}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isHeadteacher
              ? `Headteacher – ${school?.name || 'ES RUBENGERA RTB'}`
              : 'Smart School Operations, Health Emergency & Parent Communication System'}
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
      {isSchoolAdministrator && !isHeadteacher && (
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
        <HeadteacherOverview
          summary={headteacherSummary}
          headteacherName={headteacherName}
          onNavigate={onNavigate}
        />
      )}

      {/* KPI Stats Cards */}
      {showLegacyHeadteacherTiles && (
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
      )}

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
