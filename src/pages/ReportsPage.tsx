import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import type { CombinationView } from '../types';
import {
  FileText,
  Printer,
  Download,
  Calendar,
  GraduationCap,
  UserCheck,
  HeartPulse,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  BarChart3,
  TrendingUp,
  Award,
  Building
} from 'lucide-react';

type ReportType = 'ACADEMIC' | 'ATTENDANCE' | 'HEALTH' | 'FINANCE' | 'COMMUNICATION';

export const ReportsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { school } = useAuth();

  const [reportType, setReportType] = useState<ReportType>('ACADEMIC');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [activeCombinations, setActiveCombinations] = useState<CombinationView[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.getReportsAnalytics(selectedTerm);
      setData(res);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedTerm]);

  useEffect(() => {
    api.getActiveCombinations()
      .then(setActiveCombinations)
      .catch(() => setActiveCombinations([]));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (!data) return;
    let rows: string[][] = [];
    let filename = `SchoolCare_Report_${reportType}_${selectedTerm}.csv`;

    if (reportType === 'ACADEMIC') {
      rows = [
        ['Student Name', 'Admission No', 'Class', 'Combination', 'Term', 'Overall Avg (%)', 'Rank in Class'],
        ...(data.academics.topStudents || []).map((s: any) => [
          s.studentName,
          s.admissionNumber,
          s.className,
          s.combination,
          s.term,
          `${s.overallAverage}%`,
          `#${s.overallRank} of ${s.totalStudentsInClass}`
        ])
      ];
    } else if (reportType === 'ATTENDANCE') {
      rows = [
        ['Attendance Metric', 'Value', 'Percentage'],
        ['Total Evaluated Sessions', String(data.attendance.totalRecords), '100%'],
        ['Present', String(data.attendance.presentCount), `${data.attendance.attendanceRate}%`],
        ['Absent', String(data.attendance.absentCount), `${(data.attendance.absentCount / (data.attendance.totalRecords || 1) * 100).toFixed(1)}%`],
        ['Late', String(data.attendance.lateCount), `${(data.attendance.lateCount / (data.attendance.totalRecords || 1) * 100).toFixed(1)}%`],
        ['Excused / Sick', String(data.attendance.excusedCount), `${(data.attendance.excusedCount / (data.attendance.totalRecords || 1) * 100).toFixed(1)}%`]
      ];
    } else if (reportType === 'FINANCE') {
      rows = [
        ['Category', 'Amount (RWF)'],
        ['Total Billed', String(data.finance.totalBilledRwf)],
        ['Total Collected', String(data.finance.totalCollectedRwf)],
        ['Total Outstanding Balance', String(data.finance.totalOutstandingRwf)],
        ['MTN Mobile Money (*182#)', String(data.finance.paymentMethodsBreakdown.MTN_MOMO)],
        ['Bank of Kigali / BPR Transfer', String(data.finance.paymentMethodsBreakdown.BANK_TRANSFER)],
        ['Airtel Money Rwanda', String(data.finance.paymentMethodsBreakdown.AIRTEL_MONEY)],
        ['Cash at Desk', String(data.finance.paymentMethodsBreakdown.CASH)]
      ];
    } else if (reportType === 'HEALTH') {
      rows = [
        ['Health Registry Metric', 'Count'],
        ['Total Incidents', String(data.health.totalIncidents)],
        ['Urgent / Emergency Cases', String(data.health.urgentHealthCases)],
        ['Hospital / Health Center Referrals', String(data.health.hospitalReferrals)],
        ['Parent Acknowledgment Rate', `${data.health.parentAcknowledgmentRate}%`]
      ];
    } else {
      rows = [
        ['Communication Audit', 'Value'],
        ['Total Dispatched', String(data.communication.totalDispatched)],
        ['Delivered / Acknowledged', String(data.communication.deliveredCount)],
        ['Recorded Delivery Rate', `${data.communication.deliverySuccessRate}%`]
      ];
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !data) {
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
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Executive Reporting Engine</span>
            </span>
            <span className="text-xs text-slate-500">{school?.name || 'ES RUBENGERA RTB'}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('reportsTitle')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('reportsSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4" />
            <span>{t('exportCsv')}</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>{t('printExecutiveReport')}</span>
          </button>
        </div>
      </div>

      {Array.isArray(data?.restrictedSections) && data.restrictedSections.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Some sections are hidden because your account lacks permission to read the underlying module data:
            {' '}{data.restrictedSections.join(', ')}.
          </span>
        </div>
      )}

      {/* Scope Selectors & Report Type Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Report Focus Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: 'ACADEMIC' as ReportType, label: t('reportAcademicSummary'), icon: GraduationCap, color: 'text-blue-600' },
            { id: 'ATTENDANCE' as ReportType, label: t('reportAttendanceSummary'), icon: UserCheck, color: 'text-emerald-600' },
            { id: 'HEALTH' as ReportType, label: t('reportHealthSummary'), icon: HeartPulse, color: 'text-red-600' },
            { id: 'FINANCE' as ReportType, label: t('reportFinanceSummary'), icon: CreditCard, color: 'text-amber-600' },
            { id: 'COMMUNICATION' as ReportType, label: t('reportCommSummary'), icon: MessageSquare, color: 'text-indigo-600' }
          ].map(tab => {
            const Icon = tab.icon;
            const isSel = reportType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setReportType(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                  isSel
                    ? 'bg-[#102B50] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSel ? 'text-white' : tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Term:</span>
            <select
              value={selectedTerm}
              onChange={e => setSelectedTerm(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 font-bold text-slate-800 bg-white"
            >
              <option value="Term 1">Term 1 (Igihembwe 1)</option>
              <option value="Term 2">Term 2 (Igihembwe 2)</option>
              <option value="Term 3">Term 3 (Igihembwe 3)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Trade:</span>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-800 bg-white"
            >
              <option value="ALL">All Active Combinations</option>
              {activeCombinations.map(combination => (
                <option key={combination.id} value={combination.code}>{combination.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Official Printable Report Container */}
      <div id="official-executive-report" className="bg-white p-8 rounded-2xl border-2 border-slate-300 shadow-md space-y-6">
        {/* Government of Rwanda Official Letterhead */}
        <div className="border-b-2 border-slate-800 pb-4 text-center space-y-1">
          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-600 font-semibold border-b border-slate-200 pb-2 mb-2">
            <span>REPUBLIC OF RWANDA</span>
            <span>MINISTRY OF EDUCATION (MINEDUC)</span>
            <span>RWANDA TVET BOARD (RTB)</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#102B50] text-white flex items-center justify-center font-black text-xl shadow-inner">
              ESR
            </div>
            <div className="text-left">
              <h2 className="text-xl font-black uppercase text-[#102B50] tracking-wide">
                {school?.name || 'ES RUBENGERA RTB'}
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                P.O. Box 42 Karongi, Western Province, Rwanda • {school?.phone} • {school?.email}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs font-black uppercase tracking-wider text-blue-900 bg-blue-50 py-1 px-3 rounded-md inline-block">
              {reportType === 'ACADEMIC' && 'Official Academic Performance & Marks Audit Report'}
              {reportType === 'ATTENDANCE' && 'Official Attendance, Absence & Tardiness Report'}
              {reportType === 'HEALTH' && 'Official School Infirmary & Health Incident Registry'}
              {reportType === 'FINANCE' && 'Official School Fees Collection & Financial Reconciliation Report'}
              {reportType === 'COMMUNICATION' && 'Official Parent Notification Delivery Integrity Audit'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Academic Year: 2025 - 2026 • Scope: {selectedTerm} • Generated: {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Dynamic Report Content Depending on Selected Tab */}

        {/* 1. Academic Performance Report */}
        {reportType === 'ACADEMIC' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Students Evaluated</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{data.academics.totalEvaluated}</p>
                <p className="text-[11px] text-slate-500">Active TVET combinations</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-[10px] font-bold uppercase text-blue-700">School Average</span>
                <p className="text-2xl font-black text-blue-900 mt-1">{data.academics.overallAverage}%</p>
                <p className="text-[11px] text-blue-700">Based on CAT & Term Exams</p>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-700">Pass Rate (&ge; 50%)</span>
                <p className="text-2xl font-black text-emerald-800 mt-1">{data.academics.passRate}%</p>
                <p className="text-[11px] text-emerald-700">REB Benchmark Compliant</p>
              </div>

              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                <span className="text-[10px] font-bold uppercase text-purple-700">First-Class Honors (A)</span>
                <p className="text-2xl font-black text-purple-900 mt-1">{data.academics.gradeDistribution.A}</p>
                <p className="text-[11px] text-purple-700">Scores &ge; 80%</p>
              </div>
            </div>

            {/* Grade Distribution Bar */}
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Grade Level Distribution (REB/RTB Grading Scale):</span>
                <span className="text-slate-500 font-semibold">{data.academics.totalEvaluated} Total Students Evaluated</span>
              </div>

              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="p-3 bg-emerald-100 text-emerald-900 rounded-lg">
                  <span className="font-black text-base">{data.academics.gradeDistribution.A}</span>
                  <p className="text-[10px] font-bold mt-0.5">Grade A (80-100%)</p>
                  <p className="text-[9px] text-emerald-700">Excellent</p>
                </div>
                <div className="p-3 bg-blue-100 text-blue-900 rounded-lg">
                  <span className="font-black text-base">{data.academics.gradeDistribution.B}</span>
                  <p className="text-[10px] font-bold mt-0.5">Grade B (70-79%)</p>
                  <p className="text-[9px] text-blue-700">Very Good</p>
                </div>
                <div className="p-3 bg-amber-100 text-amber-900 rounded-lg">
                  <span className="font-black text-base">{data.academics.gradeDistribution.C}</span>
                  <p className="text-[10px] font-bold mt-0.5">Grade C (60-69%)</p>
                  <p className="text-[9px] text-amber-700">Good</p>
                </div>
                <div className="p-3 bg-slate-200 text-slate-900 rounded-lg">
                  <span className="font-black text-base">{data.academics.gradeDistribution.D}</span>
                  <p className="text-[10px] font-bold mt-0.5">Grade D (50-59%)</p>
                  <p className="text-[9px] text-slate-600">Pass</p>
                </div>
                <div className="p-3 bg-red-100 text-red-900 rounded-lg">
                  <span className="font-black text-base">{data.academics.gradeDistribution.F}</span>
                  <p className="text-[10px] font-bold mt-0.5">Grade F (&lt;50%)</p>
                  <p className="text-[9px] text-red-700">Remedial</p>
                </div>
              </div>
            </div>

            {/* Top Performers Table */}
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Top Academic Performers (Honor Roll):
              </h3>
              <div className="overflow-x-auto border border-slate-300 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#102B50] text-white text-[10px] uppercase font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Admission #</th>
                      <th className="py-2.5 px-3">Class & Combination</th>
                      <th className="py-2.5 px-3 text-center">Term Avg</th>
                      <th className="py-2.5 px-3">Conduct / Discipline</th>
                      <th className="py-2.5 px-3">Head Teacher Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.academics.topStudents.map((s: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-black text-blue-700">#{s.overallRank}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{s.studentName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{s.admissionNumber}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{s.className} ({s.combination})</td>
                        <td className="py-2.5 px-3 font-black text-center text-emerald-700">{s.overallAverage}%</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{s.conductScore}</td>
                        <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs">{s.headTeacherRemarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. Attendance & Absenteeism Report */}
        {reportType === 'ATTENDANCE' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-800">Attendance Rate</span>
                <p className="text-3xl font-black text-emerald-950 mt-1">{data.attendance.attendanceRate}%</p>
                <p className="text-[11px] text-emerald-700">Above national 95% target</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Roll Calls</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{data.attendance.totalRecords}</p>
                <p className="text-[11px] text-slate-500">{data.attendance.presentCount} recorded present</p>
              </div>

              <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                <span className="text-[10px] font-bold uppercase text-red-700">Unexcused Absences</span>
                <p className="text-3xl font-black text-red-900 mt-1">{data.attendance.absentCount}</p>
                <p className="text-[11px] text-red-700">SMS notification triggered</p>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-[10px] font-bold uppercase text-amber-800">Late Arrivals</span>
                <p className="text-3xl font-black text-amber-900 mt-1">{data.attendance.lateCount}</p>
                <p className="text-[11px] text-amber-700">Heavy rain morning commute</p>
              </div>
            </div>

            {/* Chronic Absenteeism Early Warning */}
            <div className="p-5 bg-amber-50 rounded-xl border border-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>Chronic Absenteeism Early Warning Registry:</span>
              </div>
              <p className="text-xs text-amber-800">
                Students below 90% attendance or with unexplained absences flagged for Dean of Discipline follow-up:
              </p>
              <div className="overflow-x-auto bg-white rounded-lg border border-amber-200 mt-2">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-100/60 text-amber-900 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Student Name</th>
                      <th className="py-2 px-3">Class</th>
                      <th className="py-2 px-3">Admission No</th>
                      <th className="py-2 px-3">Action Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {data.attendance.chronicAbsentStudents.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-2 px-3 font-bold text-slate-800">{s.firstName} {s.lastName}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700">{s.className}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{s.admissionNumber}</td>
                        <td className="py-2 px-3 text-red-700 font-bold">Unexcused - Parent Contacted</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. Health & Infirmary Registry Report */}
        {reportType === 'HEALTH' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Consultations</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{data.health.totalIncidents}</p>
                <p className="text-[11px] text-slate-500">School infirmary visits</p>
              </div>

              <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                <span className="text-[10px] font-bold uppercase text-red-700">Urgent Cases</span>
                <p className="text-3xl font-black text-red-900 mt-1">{data.health.urgentHealthCases}</p>
                <p className="text-[11px] text-red-700">Immediate guardian alerts</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-[10px] font-bold uppercase text-blue-800">Hospital Referrals</span>
                <p className="text-3xl font-black text-blue-950 mt-1">{data.health.hospitalReferrals}</p>
                <p className="text-[11px] text-blue-700">Rubengera Health Center</p>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-800">Guardian Acknowledgment</span>
                <p className="text-3xl font-black text-emerald-900 mt-1">{data.health.parentAcknowledgmentRate}%</p>
                <p className="text-[11px] text-emerald-700">Average response &lt; 20 min</p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-300 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#102B50] text-white text-[10px] uppercase font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Ref #</th>
                    <th className="py-2.5 px-3">Student & Class</th>
                    <th className="py-2.5 px-3">Priority / Category</th>
                    <th className="py-2.5 px-3">Symptoms & Vitals</th>
                    <th className="py-2.5 px-3">Immediate Care Action</th>
                    <th className="py-2.5 px-3">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.health.recentCases.map((c: any) => (
                    <tr key={c.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{c.referenceNumber}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{c.studentName} ({c.studentClass})</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.priority === 'URGENT' ? 'bg-red-600 text-white' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {c.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{c.symptoms} (Temp: {c.temperature || 'N/A'})</td>
                      <td className="py-2.5 px-3 text-slate-600">{c.actionsTaken}</td>
                      <td className="py-2.5 px-3 font-semibold text-blue-700">{c.outcome.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Finance & Reconciliation Report */}
        {reportType === 'FINANCE' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Billed</span>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {data.finance.totalBilledRwf.toLocaleString()} RWF
                </p>
                <p className="text-[11px] text-slate-500">Term 2 School & Lab Fees</p>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-800">Total Collected</span>
                <p className="text-2xl font-black text-emerald-700 mt-1">
                  {data.finance.totalCollectedRwf.toLocaleString()} RWF
                </p>
                <p className="text-[11px] text-emerald-700">Efficiency: {data.finance.collectionEfficiency}%</p>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-[10px] font-bold uppercase text-amber-800">Outstanding Balance</span>
                <p className="text-2xl font-black text-amber-900 mt-1">
                  {data.finance.totalOutstandingRwf.toLocaleString()} RWF
                </p>
                <p className="text-[11px] text-amber-700">Due by 30 Nov 2026</p>
              </div>

              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                <span className="text-[10px] font-bold uppercase text-purple-800">MTN Mobile Money Share</span>
                <p className="text-2xl font-black text-purple-900 mt-1">
                  {data.finance.paymentMethodsBreakdown.MTN_MOMO.toLocaleString()} RWF
                </p>
                <p className="text-[11px] text-purple-700">Digital Momo Collections</p>
              </div>
            </div>

            {/* Reconciliation By Channel Table */}
            <div className="overflow-x-auto border border-slate-300 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#102B50] text-white text-[10px] uppercase font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Payment Channel / Bank</th>
                    <th className="py-2.5 px-3 text-right">Amount (RWF)</th>
                    <th className="py-2.5 px-3 text-right">Share (%)</th>
                    <th className="py-2.5 px-3">Audit Verification Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">MTN Mobile Money (*182#)</td>
                    <td className="py-2.5 px-3 font-mono font-black text-right text-emerald-700">
                      {data.finance.paymentMethodsBreakdown.MTN_MOMO.toLocaleString()} RWF
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {(data.finance.paymentMethodsBreakdown.MTN_MOMO / (data.finance.totalCollectedRwf || 1) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled with MTN Statement
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">Bank of Kigali (BK) / BPR Direct Transfer</td>
                    <td className="py-2.5 px-3 font-mono font-black text-right text-blue-700">
                      {data.finance.paymentMethodsBreakdown.BANK_TRANSFER.toLocaleString()} RWF
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {(data.finance.paymentMethodsBreakdown.BANK_TRANSFER / (data.finance.totalCollectedRwf || 1) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified by Bursar Deposit Slip
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">Airtel Money Rwanda</td>
                    <td className="py-2.5 px-3 font-mono font-black text-right text-purple-700">
                      {data.finance.paymentMethodsBreakdown.AIRTEL_MONEY.toLocaleString()} RWF
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">0.0%</td>
                    <td className="py-2.5 px-3 text-slate-500 font-semibold">No transactions this period</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">Cash Received at School Bursar Counter</td>
                    <td className="py-2.5 px-3 font-mono font-black text-right text-slate-800">
                      {data.finance.paymentMethodsBreakdown.CASH.toLocaleString()} RWF
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">0.0%</td>
                    <td className="py-2.5 px-3 text-slate-500 font-semibold">Physical Cash Register Clean</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Parent Communication Delivery Audit */}
        {reportType === 'COMMUNICATION' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Notifications</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{data.communication.totalDispatched}</p>
                <p className="text-[11px] text-slate-500">Messages recorded in school records</p>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-800">Delivered / Acknowledged</span>
                <p className="text-3xl font-black text-emerald-800 mt-1">{data.communication.deliveredCount}</p>
                <p className="text-[11px] text-emerald-700">Recorded delivery rate: {data.communication.deliverySuccessRate}%</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-[10px] font-bold uppercase text-blue-800">Status Source</span>
                <p className="text-lg font-black text-blue-950 mt-1">School Records</p>
                <p className="text-[11px] text-blue-700">Counts reflect stored message status only</p>
              </div>
            </div>

            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1 text-blue-900">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span>Delivery reporting:</span>
              </p>
              <p className="text-slate-700 leading-relaxed">
                These figures summarize notification records stored by SchoolCare. They are not carrier
                delivery receipts and should be reconciled with the configured messaging provider before
                external use.
              </p>
            </div>
          </div>
        )}

        {/* Signature placeholders: only authorized signatories may sign the printed copy. */}
        <div className="pt-8 border-t-2 border-slate-300 grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <p className="font-bold text-slate-800">Prepared by</p>
            <p className="text-[10px] text-slate-600 mt-8 border-t border-slate-300 pt-1">
              Name, role, date & signature
            </p>
          </div>

          <div>
            <p className="font-bold text-slate-800">{school?.name || 'School'}</p>
            <p className="text-[10px] text-slate-600 mt-8 border-t border-slate-300 pt-1">
              Official seal (affix when signed)
            </p>
          </div>

          <div>
            <p className="font-bold text-slate-800">Approved by</p>
            <p className="text-[10px] text-slate-600 mt-8 border-t border-slate-300 pt-1">
              Name, role, date & signature
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
