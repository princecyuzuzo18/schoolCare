import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileCheck2, History, Printer } from 'lucide-react';
import type { ReportCard, School } from '../types';
import { downloadReportCardPdf, printReportCards } from '../services/reportPdf';
import { ReportCardSheet } from './ReportCardSheet';

interface PortalReportCardsProps {
  cards: ReportCard[];
  school?: School | null;
  emptyMessage?: string;
}

/**
 * Read-only report history for parents and students. The server has already
 * restricted this list to published cards for the authenticated account.
 */
export const PortalReportCards: React.FC<PortalReportCardsProps> = ({
  cards,
  school,
  emptyMessage = 'No published report cards are available yet.'
}) => {
  const sorted = useMemo(
    () => [...cards].sort((a, b) => {
      const byDate = (b.publishedAt || b.issueDate || '').localeCompare(a.publishedAt || a.issueDate || '');
      if (byDate !== 0) return byDate;
      return (b.academicYear || '').localeCompare(a.academicYear || '') || (b.term || '').localeCompare(a.term || '');
    }),
    [cards]
  );

  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!sorted.some(card => card.id === selectedId)) {
      setSelectedId(sorted[0]?.id || '');
    }
  }, [sorted, selectedId]);

  const selected = sorted.find(card => card.id === selectedId) || sorted[0];

  const printSelected = () => {
    document.body.classList.add('portal-report-print-active');
    const cleanup = () => document.body.classList.remove('portal-report-print-active');
    window.addEventListener('afterprint', cleanup, { once: true });
    printReportCards();
    window.setTimeout(cleanup, 2000);
  };

  if (!selected) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
          <FileCheck2 size={16} />
          <span>Published official reports only ({sorted.length})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <History size={14} />
            <select
              value={selected.id}
              onChange={event => setSelectedId(event.target.value)}
              className="max-w-xs rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-xs"
              aria-label="Select published report card"
            >
              {sorted.map(card => (
                <option key={card.id} value={card.id}>
                  {card.academicYear} • {card.term}
                  {card.publishedAt ? ` • ${card.publishedAt.slice(0, 10)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => downloadReportCardPdf(selected, school || undefined)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
          >
            <Download size={14} /> Download PDF
          </button>
          <button
            type="button"
            onClick={printSelected}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
          >
            <Printer size={14} /> Print official copy
          </button>
        </div>
      </div>

      <ReportCardSheet card={selected} school={school} className="portal-report-sheet" />
    </div>
  );
};
