import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../services/api';
import {
  Student,
  HealthIncident,
  AttendanceRecord,
  Invoice,
  Payment,
  ReportCard,
  HomeworkAssignment,
  PortalDashboardView
} from '../types';
import {
  UserSquare2,
  HeartPulse,
  UserCheck,
  GraduationCap,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Clock,
  ArrowRight,
  Printer,
  Sparkles,
  Download,
  Calendar,
  Send
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const ParentPortalPage: React.FC = () => {
  const { currentUser, school } = useAuth();
  const { t, language } = useLanguage();

  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [dashboard, setDashboard] = useState<PortalDashboardView | null>(null);
  const [incidents, setIncidents] = useState<HealthIncident[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalError, setPortalError] = useState('');

  // Absence excuse modal state
  const [showExcuseModal, setShowExcuseModal] = useState(false);
  const [excuseText, setExcuseText] = useState('');
  const [excuseRecordId, setExcuseRecordId] = useState('');

  // Payment simulation modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('35000');
  const [payMethod, setPayMethod] = useState<'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER'>('MTN_MOMO');
  const [payPhone, setPayPhone] = useState(currentUser?.phone || '');
  const [isProcessingPay, setIsProcessingPay] = useState(false);

  const loadPortalData = async () => {
    try {
      setLoading(true);
      setPortalError('');
      const data = await api.getPortalDashboard();
      const linkedIds = currentUser?.linkedStudentIds || [];
      const linkedStudents = data.students.filter(student => linkedIds.includes(student.id));
      setDashboard({ ...data, students: linkedStudents });
      setChildren(linkedStudents);
      setSelectedChildId(previous =>
        linkedStudents.some(student => student.id === previous) ? previous : linkedStudents[0]?.id || ''
      );
    } catch (err: any) {
      setPortalError(err?.message || 'Failed to load parent portal.');
      console.error('Failed to load parent portal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!dashboard || !selectedChildId) return;
    setIncidents(dashboard.healthIncidents.filter(item => item.studentId === selectedChildId));
    setAttendance(dashboard.attendance.filter(item => item.studentId === selectedChildId));
    setInvoices(dashboard.invoices.filter(item => item.studentId === selectedChildId));
    setPayments(dashboard.payments.filter(item => item.studentId === selectedChildId));
    setReportCards(dashboard.reportCards.filter(item => item.studentId === selectedChildId));
    setHomework(dashboard.homework.filter(item => item.classId === dashboard.students.find(s => s.id === selectedChildId)?.classId));
  }, [dashboard, selectedChildId]);

  const handleAcknowledgeIncident = async (incidentId: string) => {
    try {
      await api.acknowledgePortalIncident(incidentId, 'Parent confirmed via Parent Portal');
      loadPortalData();
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge');
    }
  };

  const handleSubmitExcuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excuseText.trim()) return;
    try {
      await api.explainPortalAbsence(excuseRecordId, excuseText);
      setShowExcuseModal(false);
      setExcuseText('');
      loadPortalData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit excuse');
    }
  };

  const handleMakePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoice = invoices[0];
    if (!invoice || !selectedChild) return;

    try {
      setIsProcessingPay(true);
      await api.recordPortalPayment({
        invoiceId: invoice.id,
        studentId: selectedChild.id,
        studentName: `${selectedChild.firstName} ${selectedChild.lastName}`,
        amountRwf: Number(payAmount),
        method: payMethod,
        reference: `MOMO-RW-${Date.now().toString().slice(-6)}`,
        payerPhone: payPhone
      });

      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      setShowPayModal(false);
      loadPortalData();
    } catch (err: any) {
      alert(err.message || 'Payment simulation failed');
    } finally {
      setIsProcessingPay(false);
    }
  };

  const handleSelectChild = (id: string) => setSelectedChildId(id);

  const selectedChild = children.find(c => c.id === selectedChildId) || children[0];
  const urgentCase = incidents.find(i => !i.resolved && (i.priority === 'URGENT' || i.priority === 'EMERGENCY'));
  const activeInvoice = invoices[0];
  const reportCard = reportCards[0];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {portalError || 'No child is linked to this parent account yet. Contact the school if you expected access.'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Child Selector */}
      <div className="relative overflow-hidden bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <img
          src="/school-campus.svg"
          alt=""
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-2/5 object-cover object-center opacity-[0.12] [mask-image:linear-gradient(to_right,transparent,black_55%)]"
        />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-800 ring-1 ring-inset ring-purple-100 flex items-center gap-1">
              <UserSquare2 className="w-3.5 h-3.5" />
              <span>{t('parentPortalTitle')}</span>
            </span>
            <span className="text-xs text-slate-500">
              {currentUser?.fullName} ({currentUser?.phone})
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
            Mwaramutse, {currentUser?.fullName || 'Parent'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('parentPortalSubtitle')}</p>
        </div>

        {/* Child Selector Tabs */}
        <div className="relative z-10 flex max-w-full items-center gap-2 overflow-x-auto bg-slate-50/90 p-1.5 rounded-2xl border border-slate-200">
          <span className="shrink-0 text-xs font-semibold text-slate-500 pl-2 pr-1">Linked Children:</span>
          {children.map(ch => (
            <button
              key={ch.id}
              onClick={() => handleSelectChild(ch.id)}
              className={`min-h-10 shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                selectedChildId === ch.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <img
                src={ch.photoUrl}
                alt={ch.firstName}
                className="w-5 h-5 rounded-full object-cover"
              />
              <span>{ch.firstName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Critical Health Alert Notification Banner (If Any) */}
      {urgentCase && (
        <div className="bg-gradient-to-r from-rose-700 to-red-700 text-white p-5 sm:p-6 rounded-2xl shadow-sm border border-red-800/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <HeartPulse className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-white text-red-900 uppercase">
                    {urgentCase.priority}: {urgentCase.referenceNumber}
                  </span>
                  <span className="text-xs text-red-100">Infirmary Notification</span>
                </div>
                <h3 className="text-base font-extrabold text-white mt-1">
                  Health alert for {urgentCase.studentName}: {urgentCase.symptoms}
                </h3>
                <p className="text-xs text-red-100 mt-0.5">
                  Vitals: Temp {urgentCase.temperature} • Action: {urgentCase.actionsTaken}
                  {urgentCase.medicalReferral && ` • Transfer to: ${urgentCase.medicalReferral}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!urgentCase.parentAcknowledged ? (
                <button
                  onClick={() => handleAcknowledgeIncident(urgentCase.id)}
                  className="px-5 py-2.5 rounded-xl bg-white text-red-900 font-extrabold text-xs shadow-lg hover:bg-red-50 transition flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Acknowledge & Confirm Arrival</span>
                </button>
              ) : (
                <span className="px-4 py-2 rounded-xl bg-emerald-500/30 border border-emerald-400 text-emerald-100 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Acknowledged at {new Date(urgentCase.parentAcknowledgedAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Student Dossier, Attendance & Finance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Child Profile Card */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-4">
            <img
              src={selectedChild.photoUrl}
              alt={selectedChild.firstName}
              className="w-18 h-22 object-cover rounded-xl border-2 border-blue-600 shadow-md"
            />
            <div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                Active Student
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-1">
                {selectedChild.firstName} {selectedChild.lastName}
              </h2>
              <p className="text-xs font-semibold text-blue-700">{selectedChild.className}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{selectedChild.combination}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Admission No:</span>
              <span className="font-mono font-bold text-slate-800">{selectedChild.admissionNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date of Birth:</span>
              <span className="font-medium text-slate-800">{selectedChild.dob}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Blood Group:</span>
              <span className="font-bold text-red-600">{selectedChild.bloodGroup || 'O+'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Medical Notes:</span>
              <span className="font-medium text-slate-700">{selectedChild.allergies || 'None'}</span>
            </div>
          </div>

          {/* Gate Pickup Status */}
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
            <p className="font-bold text-emerald-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Gate Pickup Authorization</span>
            </p>
            <p className="text-emerald-800 mt-0.5 text-[11px]">
              You ({currentUser?.fullName}) are registered as Primary Authorized Guardian with gate security.
            </p>
          </div>
        </div>

        {/* Academic Card & Report Card (Indangamanota) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                <span>Academic Performance (Indangamanota)</span>
              </h3>
              <p className="text-xs text-slate-500">Term 1 Official REB/RTB Certified Results</p>
            </div>

            {reportCard && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800">
                  Avg: {reportCard.overallAverage}% (Rank {reportCard.overallRank}/{reportCard.totalStudentsInClass})
                </span>
              </div>
            )}
          </div>

          {reportCard ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">CAT (/30)</th>
                      <th className="py-2 px-3">Exam (/70)</th>
                      <th className="py-2 px-3">Total (%)</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Teacher Comment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportCard.subjects.map((sub, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{sub.subjectName}</td>
                        <td className="py-2.5 px-3 font-mono">{sub.catScore}</td>
                        <td className="py-2.5 px-3 font-mono">{sub.examScore}</td>
                        <td className="py-2.5 px-3 font-bold text-blue-700">{sub.totalPercent}%</td>
                        <td className="py-2.5 px-3 font-black text-emerald-600">{sub.grade}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                          {sub.teacherComment}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-xs">
                <p className="font-bold text-blue-900">Head Teacher Decision:</p>
                <p className="text-slate-700 mt-0.5">{reportCard.headTeacherRemarks}</p>
                <p className="text-[11px] text-blue-800 font-medium mt-1">Conduct: {reportCard.conductScore}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Term 2 marks are currently being compiled by instructors.</p>
          )}
        </div>
      </div>

      {/* Second Row: Attendance & Fees Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Attendance Dossier & Submit Excuse */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <span>{t('attendanceTitle')}</span>
              </h3>
              <p className="text-xs text-slate-500">Daily roll call record for {selectedChild.firstName}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {attendance.map(rec => (
              <div key={rec.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800">{rec.date}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rec.status === 'PRESENT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : rec.status === 'ABSENT'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{rec.remarks || 'Standard roll call'}</p>
                  {rec.parentExplanation && (
                    <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                      Your Excuse: "{rec.parentExplanation}"
                    </p>
                  )}
                </div>

                {rec.status === 'ABSENT' && !rec.parentExplanation && (
                  <button
                    onClick={() => {
                      setExcuseRecordId(rec.id);
                      setShowExcuseModal(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
                  >
                    Submit Reason
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Fees & MTN MoMo Payment Tracker */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-600" />
                <span>School Fees & Financial Balance</span>
              </h3>
              <p className="text-xs text-slate-500">Rwandan Francs (RWF) Billing</p>
            </div>

            {activeInvoice && (
              <button
                onClick={() => setShowPayModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pay via MTN MoMo</span>
              </button>
            )}
          </div>

          {activeInvoice ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Fee</span>
                  <p className="text-base font-black text-slate-900 mt-1">
                    {activeInvoice.totalAmountRwf.toLocaleString()} RWF
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Paid to Date</span>
                  <p className="text-base font-black text-emerald-700 mt-1">
                    {activeInvoice.paidAmountRwf.toLocaleString()} RWF
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Balance Due</span>
                  <p className="text-base font-black text-red-700 mt-1">
                    {activeInvoice.balanceRwf.toLocaleString()} RWF
                  </p>
                </div>
              </div>

              {/* Payment Receipts History */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">Official Receipts:</span>
                {payments.map(pay => (
                  <div key={pay.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{pay.receiptNumber}</p>
                      <p className="text-[11px] text-slate-500">
                        {pay.method.replace('_', ' ')} • Ref: {pay.reference}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-emerald-700">+{pay.amountRwf.toLocaleString()} RWF</p>
                      <p className="text-[10px] text-slate-500">{pay.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No pending invoices found.</p>
          )}
        </div>
      </div>

      {/* Submit Absence Excuse Modal */}
      {showExcuseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Provide Absence Explanation</h3>
            <p className="text-xs text-slate-500">
              Submit justification for school records. This will be reviewed by the Class Teacher and Dean of Discipline.
            </p>
            <form onSubmit={handleSubmitExcuse} className="space-y-3">
              <textarea
                rows={3}
                value={excuseText}
                onChange={e => setExcuseText(e.target.value)}
                placeholder="e.g. Family medical appointment at Kibuye hospital..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowExcuseModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  Submit Excuse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Money Payment Simulation Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                School Fee Payment (RWF)
              </h3>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                ES RUBENGERA RTB
              </span>
            </div>

            <form onSubmit={handleMakePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold bg-white"
                >
                  <option value="MTN_MOMO">MTN Mobile Money (*182#)</option>
                  <option value="AIRTEL_MONEY">Airtel Money Rwanda</option>
                  <option value="BANK_TRANSFER">Bank of Kigali / BPR</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Amount to Pay (RWF)</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">MoMo Payer Number (+250)</label>
                <input
                  type="text"
                  value={payPhone}
                  onChange={e => setPayPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  required
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl text-[11px] text-amber-900 border border-amber-200">
                Notice: In production, a secure USSD push will trigger on your handset (*182# prompt). An official SchoolCare receipt (REC-2026-XXXX) is issued upon callback confirmation.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingPay}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {isProcessingPay ? 'Processing Push...' : 'Authorize MoMo Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
