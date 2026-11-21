import React, { useEffect, useMemo, useState } from 'react';
import { api, ReportPrintData } from '../services/api';
import { ReportCardSheet } from '../components/ReportCardSheet';
import { downloadReportCardPdf, downloadReportCardsPdf, printReportCards } from '../services/reportPdf';
import type { AcademicTerm, AcademicYear, ReportCard, ReportDistribution } from '../types';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Printer,
  Send,
  ShieldCheck
} from 'lucide-react';

const DISTRIBUTION_LABELS: Record<string, string> = {
  NOT_GENERATED: 'Not generated',
  GENERATED: 'Generated',
  PRINTED: 'Printed',
  ISSUED: 'Issued',
  COLLECTED: 'Collected'
};

type PrintCard = ReportPrintData['cards'][number];

export const ReportPrintingPage: React.FC = () => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('all');
  const [studentId, setStudentId] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ReportPrintData | null>(null);
  const [distributions, setDistributions] = useState<ReportDistribution[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async (filters: { yearId?: string; termId?: string; classId?: string; studentId?: string } = {}) => {
    const effectiveYear = filters.yearId ?? yearId;
    const effectiveTerm = filters.termId ?? termId;
    const effectiveClass = filters.classId ?? classId;
    const effectiveStudent = filters.studentId ?? studentId;
    if (!effectiveYear || !effectiveTerm) return;
    setBusy(true);
    setError('');
    try {
      const [printData, distributionList] = await Promise.all([
        api.getReportPrintData({
          yearId: effectiveYear, termId: effectiveTerm,
          classId: effectiveClass === 'all' ? undefined : effectiveClass,
          studentId: effectiveStudent === 'all' ? undefined : effectiveStudent
        }),
        api.getDistributions(effectiveClass === 'all' ? {} : { classId: effectiveClass })
      ]);
      setData(printData);
      setDistributions(distributionList);
      setSelected([]);
      if (!printData.cards.some(card => card.id === previewId)) {
        setPreviewId(printData.cards[0]?.id || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report cards.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [yearList, classList] = await Promise.all([api.getAcademicYears(), api.getClasses()]);
        setYears(yearList);
        setClasses(classList.map(item => ({ id: item.id, name: item.name })));
        const initialYear = yearList.find(item => item.isActive)?.id || yearList[0]?.id || '';
        setYearId(initialYear);
        if (initialYear) {
          const termList = await api.getTerms(initialYear);
          setTerms(termList);
          const initialTerm = termList.find(item => item.isActive)?.id || termList[0]?.id || '';
          setTermId(initialTerm);
          if (initialTerm) await reload({ yearId: initialYear, termId: initialTerm });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report printing workspace.');
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!yearId) return;
    api.getTerms(yearId).then(list => {
      setTerms(list);
      setTermId(current => list.some(term => term.id === current) ? current : list.find(term => term.isActive)?.id || list[0]?.id || '');
    }).catch(err => setError(err instanceof Error ? err.message : 'Failed to load terms.'));
  }, [yearId]);

  useEffect(() => {
    if (!yearId || !termId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, termId, classId, studentId, status]);

  const cards = useMemo(() => {
    let list = data?.cards || [];
    if (status !== 'all') list = list.filter(card => (card.distribution || 'NOT_GENERATED') === status);
    if (search.trim()) {
      const needle = search.toLowerCase();
      list = list.filter(card => card.studentName.toLowerCase().includes(needle)
        || card.admissionNumber.toLowerCase().includes(needle));
    }
    return list;
  }, [data, status, search]);

  const selectedCards = useMemo(
    () => cards.filter(card => selected.includes(card.id)),
    [cards, selected]
  );
  const previewCard = useMemo(
    () => cards.find(card => card.id === previewId) || cards[0],
    [cards, previewId]
  );
  const printCards = useMemo(
    () => selectedCards.length > 0 ? selectedCards : cards,
    [selectedCards, cards]
  );

  const act = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await task();
      setMessage(success);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = () => act(
    () => api.generateReportCards({
      yearId, termId,
      classIds: classId === 'all' ? undefined : [classId],
      studentIds: studentId === 'all' || classId === 'all' ? undefined : [studentId]
    }),
    'Report cards generated from approved marks.'
  );

  const handlePublish = () => {
    if (selectedCards.length === 0) {
      setError('Select at least one report card to publish.');
      return;
    }
    act(() => api.publishReportCards(selectedCards.map(card => card.id)),
      `${selectedCards.length} report card(s) published to verified student and parent portals.`);
  };

  const handleUnpublish = () => {
    if (selectedCards.length === 0) {
      setError('Select at least one report card to unpublish.');
      return;
    }
    const reason = window.prompt('Reason for unpublishing these reports (recorded in the audit trail):', '');
    if (!reason?.trim()) return;
    act(async () => {
      for (const card of selectedCards) {
        await api.unpublishReportCard(card.id, reason.trim());
      }
    }, `${selectedCards.length} report card(s) unpublished and removed from portals.`);
  };

  const handleMarkPrinted = () => {
    if (printCards.length === 0) {
      setError('There are no report cards to record as printed.');
      return;
    }
    act(async () => {
      for (const card of printCards) {
        const record = distributions.find(item => item.reportCardId === card.id);
        if (record && ['GENERATED', 'PRINTED'].includes(record.status)) {
          await api.markReportPrinted(record.id);
        }
      }
    }, `${printCards.length} report card(s) recorded as printed. Collection remains unconfirmed.`);
  };

  const handlePrint = () => {
    if (printCards.length === 0) {
      setError('There are no report cards to print.');
      return;
    }
    printReportCards();
    handleMarkPrinted();
  };

  const handleIssue = (card: PrintCard) => {
    const record = distributions.find(item => item.reportCardId === card.id);
    if (!record) {
      setError('This report card has no distribution record. Generate reports first.');
      return;
    }
    const name = window.prompt('Who is receiving this report card?', '');
    if (!name?.trim()) return;
    const relationship = window.prompt('Relationship to student (optional)', 'Parent/Guardian') || '';
    act(() => api.issueReport(record.id, name.trim(), relationship),
      `Report issued to ${name.trim()}.`);
  };

  const handleCollect = (card: PrintCard) => {
    const record = distributions.find(item => item.reportCardId === card.id);
    if (!record) return;
    const name = window.prompt('Confirmation name of the person collecting the report:', '');
    if (!name?.trim()) return;
    act(() => api.confirmReportCollection(record.id, name.trim()),
      'Collection confirmed and recorded in the audit trail.');
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Report Cards &amp; Printing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate official A4 report cards from approved marks, print or download them, and track distribution.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
          <ShieldCheck size={14} /> Approved marks only
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: 'Academic year', value: yearId, set: setYearId, options: years.map(item => ({ id: item.id, name: item.name })) },
          { label: 'Term', value: termId, set: setTermId, options: terms.map(item => ({ id: item.id, name: item.name })) },
          { label: 'Class', value: classId, set: (value: string) => { setClassId(value); setStudentId('all'); }, options: [{ id: 'all', name: 'All classes' }, ...classes.map(item => ({ id: item.id, name: item.name }))] },
          { label: 'Student', value: studentId, set: setStudentId, options: [{ id: 'all', name: 'All students' }, ...(data?.cards || []).map(item => ({ id: item.studentId, name: item.studentName }))] },
          { label: 'Status', value: status, set: setStatus, options: ['all', 'NOT_GENERATED', 'GENERATED', 'PRINTED', 'ISSUED', 'COLLECTED'].map(value => ({ id: value, name: value === 'all' ? 'All statuses' : DISTRIBUTION_LABELS[value] })) },
          { label: 'Search', value: search, set: setSearch, options: [] }
        ].map(control => (
          <label key={control.label} className="text-xs font-bold text-slate-600">
            {control.label}
            {control.options.length > 0 ? (
              <select value={control.value} onChange={event => control.set(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
                {control.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            ) : (
              <input value={control.value} onChange={event => control.set(event.target.value)} placeholder="Name or admission no."
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            )}
          </label>
        ))}
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <button onClick={handleGenerate} disabled={busy || !yearId || !termId}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          <FileText size={16} /> Generate Reports
        </button>
        <button onClick={() => reload()} disabled={busy}
          className="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Refresh</button>
        <button onClick={handlePrint} disabled={busy || cards.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          <Printer size={16} /> Print {selectedCards.length ? `Selected (${selectedCards.length})` : 'All'}
        </button>
        <button onClick={() => downloadReportCardsPdf(
          (selectedCards.length ? selectedCards : cards) as ReportCard[], data?.school
        )} disabled={cards.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          <Download size={16} /> Download {selectedCards.length ? `Selected (${selectedCards.length})` : 'All'} PDF
        </button>
        <button onClick={handlePublish} disabled={busy || selectedCards.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          <Send size={16} /> Publish Selected
        </button>
        <button onClick={handleUnpublish} disabled={busy || selectedCards.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 disabled:opacity-50">
          Unpublish Selected
        </button>
        <button onClick={handleMarkPrinted} disabled={busy || selectedCards.length === 0}
          className="rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          Mark Printed
        </button>
      </div>

      {error && (
        <div className="no-print flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div className="no-print flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <div className="no-print overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3"><input type="checkbox" checked={cards.length > 0 && selected.length === cards.length}
                onChange={event => setSelected(event.target.checked ? cards.map(card => card.id) : [])} /></th>
              <th className="p-3">Student</th><th className="p-3">Admission no.</th><th className="p-3">Class</th>
              <th className="p-3">Average</th><th className="p-3">Grade</th><th className="p-3">Status</th><th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cards.map(card => {
              const record = distributions.find(item => item.reportCardId === card.id);
              return (
                <tr key={card.id} className="hover:bg-slate-50/60">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.includes(card.id)}
                      onChange={event => setSelected(prev => event.target.checked
                        ? [...prev, card.id] : prev.filter(id => id !== card.id))} />
                  </td>
                  <td className="p-3 font-semibold text-slate-800">{card.studentName}</td>
                  <td className="p-3 font-mono text-xs text-slate-600">{card.admissionNumber}</td>
                  <td className="p-3 text-xs">{card.className}</td>
                  <td className="p-3 font-bold">{card.overallAverage}%</td>
                  <td className="p-3">{card.overallGrade || '-'}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                      {DISTRIBUTION_LABELS[card.distribution || record?.status || 'NOT_GENERATED']}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      <button onClick={() => setPreviewId(card.id)} className="inline-flex items-center gap-1 text-blue-700"><Eye size={12} /> Preview</button>
                      <button onClick={() => downloadReportCardPdf(card as ReportCard, data?.school)} className="inline-flex items-center gap-1 text-emerald-700"><Download size={12} /> PDF</button>
                      {record && ['GENERATED', 'PRINTED'].includes(record.status) && (
                        <button onClick={() => handleIssue(card)} className="text-amber-700">Issue</button>
                      )}
                      {record?.status === 'ISSUED' && (
                        <button onClick={() => handleCollect(card)} className="text-indigo-700">Collect</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {cards.length === 0 && !busy && (
          <p className="p-6 text-center text-xs text-slate-400">
            No report cards match the current filters. Generate reports after marks have been approved.
          </p>
        )}
      </div>

      {previewCard && (
        <div className="no-print">
          <ReportCardSheet card={previewCard} school={data?.school} id="reb-report-card" />
        </div>
      )}

      <div className="print-only">
        {printCards.map(card => (
          <ReportCardSheet key={card.id} card={card} school={data?.school} />
        ))}
      </div>
    </div>
  );
};
