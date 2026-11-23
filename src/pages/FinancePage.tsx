import React, { useEffect, useState } from 'react';
import { Invoice, Payment, FeeStructure, Student } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  FileText,
  DollarSign,
  Smartphone,
  Building,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const FinancePage: React.FC = () => {
  const { t } = useLanguage();
  const { school } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Record Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('35000');
  const [paymentMethod, setPaymentMethod] = useState<'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER' | 'CASH'>('MTN_MOMO');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active receipt view modal
  const [viewReceipt, setViewReceipt] = useState<Payment | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [inv, pay, stu] = await Promise.all([
        api.getInvoices(),
        api.getPayments(),
        api.getStudents()
      ]);
      setInvoices(inv);
      setPayments(pay);
      setStudents(stu);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalBilled = invoices.reduce((acc, i) => acc + i.totalAmountRwf, 0);
  const totalCollected = invoices.reduce((acc, i) => acc + i.paidAmountRwf, 0);
  const totalOutstanding = invoices.reduce((acc, i) => acc + i.balanceRwf, 0);

  const handleOpenPay = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPaymentAmount(String(inv.balanceRwf));
    setPayerName(inv.studentName + ' Parent');
    setShowPaymentModal(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a positive payment amount.');
      return;
    }
    if (amount > selectedInvoice.balanceRwf) {
      alert(`Amount exceeds the outstanding balance of ${selectedInvoice.balanceRwf.toLocaleString()} RWF.`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.recordPayment({
        invoiceId: selectedInvoice.id,
        studentId: selectedInvoice.studentId,
        studentName: selectedInvoice.studentName,
        amountRwf: amount,
        method: paymentMethod,
        payerName: payerName || 'Guardian',
        payerPhone: payerPhone
      });

      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      setShowPaymentModal(false);
      setViewReceipt(res.payment);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Payment processing failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.studentName.toLowerCase().includes(q) ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.className.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Bursar & Financial Accounting</span>
            </span>
            <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('financeTitle')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Billing in Rwandan Francs (RWF), MTN Mobile Money, Bank of Kigali (BK) & Cash reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenPay(invoices[0])}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t('recordPayment')}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase text-slate-500">{t('totalBilled')}</span>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {totalBilled.toLocaleString()} <span className="text-sm font-semibold text-slate-500">RWF</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">Term 2 School & TVET Practical Lab Fees</p>
        </div>

        <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 shadow-xs">
          <span className="text-xs font-bold uppercase text-emerald-800">{t('totalCollected')}</span>
          <p className="text-2xl font-black text-emerald-700 mt-2">
            {totalCollected.toLocaleString()} <span className="text-sm font-semibold text-emerald-600">RWF</span>
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            {Math.round((totalCollected / (totalBilled || 1)) * 100)}% Collection Rate Achieved
          </p>
        </div>

        <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 shadow-xs">
          <span className="text-xs font-bold uppercase text-amber-800">{t('totalOutstanding')}</span>
          <p className="text-2xl font-black text-amber-800 mt-2">
            {totalOutstanding.toLocaleString()} <span className="text-sm font-semibold text-amber-600">RWF</span>
          </p>
          <p className="text-xs text-amber-700 mt-1">Due by 30 November 2026</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice #, student name, class..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Grid: Invoices Table & Recent Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Invoices */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Student Term Invoices</h3>
            <span className="text-xs text-slate-500">{filteredInvoices.length} Invoices</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Student & Class</th>
                  <th className="py-3 px-4">Total Billed</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{inv.studentName}</p>
                      <p className="text-[11px] text-slate-500">{inv.className}</p>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {inv.totalAmountRwf.toLocaleString()} RWF
                    </td>
                    <td className="py-3 px-4 text-emerald-700 font-bold">
                      {inv.paidAmountRwf.toLocaleString()} RWF
                    </td>
                    <td className="py-3 px-4 text-red-700 font-black">
                      {inv.balanceRwf.toLocaleString()} RWF
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inv.status === 'PARTIAL'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {inv.balanceRwf > 0 ? (
                        <button
                          onClick={() => handleOpenPay(inv)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
                        >
                          Receive Payment
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-600">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments Receipts Feed */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Official Payment Receipts</span>
            </h3>
            <span className="text-xs text-slate-500 font-semibold">{payments.length}</span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {payments.map(pay => (
              <div
                key={pay.id}
                onClick={() => setViewReceipt(pay)}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-700">{pay.receiptNumber}</span>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">{pay.studentName}</p>
                    <p className="text-[11px] text-slate-500">
                      {pay.method.replace('_', ' ')} • Ref: {pay.reference}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-emerald-700">+{pay.amountRwf.toLocaleString()} RWF</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{pay.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Record Fee Payment</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900">
                <p className="font-bold">{selectedInvoice.studentName} ({selectedInvoice.className})</p>
                <p className="text-blue-800 text-[11px]">
                  Invoice {selectedInvoice.invoiceNumber} • Remaining Balance: {selectedInvoice.balanceRwf.toLocaleString()} RWF
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold bg-white"
                >
                  <option value="MTN_MOMO">MTN Mobile Money (*182#)</option>
                  <option value="AIRTEL_MONEY">Airtel Money Rwanda</option>
                  <option value="BANK_TRANSFER">Bank of Kigali / BPR Transfer</option>
                  <option value="CASH">Cash at Bursar Desk</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Amount Paid (RWF) *</label>
                <input
                  type="number"
                  min="1"
                  max={selectedInvoice?.balanceRwf}
                  step="1"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payer Name</label>
                <input
                  type="text"
                  value={payerName}
                  onChange={e => setPayerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  placeholder="e.g. Chantal Mukantabana"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payer Phone (+250)</label>
                <input
                  type="text"
                  value={payerPhone}
                  onChange={e => setPayerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {isSubmitting ? 'Recording...' : 'Generate Official Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Printable Receipt Modal */}
      {viewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                Official SchoolCare Receipt
              </span>
              <button onClick={() => setViewReceipt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              <p className="font-extrabold text-sm uppercase text-[#102B50]">{school?.name || 'ES RUBENGERA RTB'}</p>
              <p className="text-[11px] text-slate-500">Rubengera, Karongi District, Rwanda</p>
              <div className="pt-2 border-t border-slate-200">
                <p className="text-[11px] text-slate-500">Receipt Reference</p>
                <p className="text-base font-mono font-black text-slate-900">{viewReceipt.receiptNumber}</p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Student:</span>
                <span className="font-bold text-slate-800">{viewReceipt.studentName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-black text-emerald-700 text-sm">{viewReceipt.amountRwf.toLocaleString()} RWF</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Method:</span>
                <span className="font-semibold text-slate-800">{viewReceipt.method.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono text-slate-700">{viewReceipt.reference}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Payer:</span>
                <span className="font-medium text-slate-800">{viewReceipt.payerName} ({viewReceipt.payerPhone})</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Date:</span>
                <span className="font-mono text-slate-800">{viewReceipt.date}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
