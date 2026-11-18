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
  AcademicClass
} from '../types';
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
  BarChart3
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
  onOpenIncidentModal: (incident?: HealthIncident) => void;
}

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
  const [loading, setLoading] = useState(true);

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
    try {
      setLoading(true);
      const [
        studentsData,
        classesData,
        attendanceData,
        incidentsData,
        notificationsData,
        invoicesData,
        paymentsData,
        staffData
      ] = await Promise.all([
        api.getStudents(),
        api.getClasses(),
        api.getAttendance(todayStr),
        api.getHealthIncidents(),
        api.getNotifications(),
        api.getInvoices(),
        api.getPayments(),
        api.getStaff()
      ]);

      setStudents(studentsData);
      setClasses(classesData);
      setAttendance(attendanceData);
      setIncidents(incidentsData);
      setNotifications(notificationsData);
      setInvoices(invoicesData);
      setPayments(paymentsData);
      setStaff(staffData);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
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

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
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
            <span className="text-emerald-600 font-semibold">{classes.length} Classes</span>
            <span>• TVET SOD, CST & O-Level</span>
          </div>
        </button>

        {/* Daily Attendance Rate */}
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

        {/* Urgent Health Cases */}
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

        {/* Fees Collected in RWF */}
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
              {classes.map(c => (
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
        </div>
      </div>
    </div>
  );
};
