import { jsPDF } from 'jspdf';
import type { ReportCard, School } from '../types';

/**
 * Client-side A4 PDF rendering for approved report-card data.
 * The service only renders values supplied by the server; it never invents
 * marks, grades, comments, attendance or promotion decisions.
 */

const PAGE_W = 297;
const PAGE_H = 210;
const M = 12;

function ascii(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmt(value: unknown, fallback = '-'): string {
  if (value === undefined || value === null || value === '') return fallback;
  return ascii(value);
}

function num(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(1).replace(/\.0$/, '') : '0';
}

function line(doc: jsPDF, y: number): number {
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.25);
  doc.line(M, y, PAGE_W - M, y);
  return y + 5;
}

function section(doc: jsPDF, title: string, value: string, x: number, y: number, width: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(ascii(title).toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(value || '-', width) as string[];
  doc.text(wrapped.slice(0, 2), x, y + 4.5);
}

function header(doc: jsPDF, school?: School, academicYear?: string, term?: string): number {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(ascii(school?.name || 'SchoolCare').toUpperCase(), PAGE_W / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const address = [school?.sector, school?.district, school?.province, school?.country]
    .filter(Boolean).map(ascii).join(', ');
  if (address) doc.text(address, PAGE_W / 2, 22, { align: 'center' });
  if (school?.motto) doc.text(ascii(school.motto), PAGE_W / 2, 27, { align: 'center' });
  if (school?.phone || school?.email) {
    doc.setFontSize(7.5);
    doc.text(ascii([school?.phone, school?.email].filter(Boolean).join('  |  ')), PAGE_W / 2, 31.5, { align: 'center' });
  }
  let y = line(doc, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TERM REPORT CARD / INDANGAMANOTA', PAGE_W / 2, y + 1, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(ascii([academicYear, term].filter(Boolean).join('  -  ')), PAGE_W / 2, y, { align: 'center' });
  return line(doc, y + 3);
}

function drawTable(doc: jsPDF, card: ReportCard, startY: number): number {
  const cols = [
    { key: 'no', label: '#', w: 8 },
    { key: 'subject', label: 'SUBJECT', w: 52 },
    { key: 'coursework', label: 'COURSEWORK', w: 22 },
    { key: 'test', label: 'TEST', w: 18 },
    { key: 'exam', label: 'EXAM', w: 18 },
    { key: 'total', label: 'TOTAL', w: 18 },
    { key: 'percent', label: '%', w: 14 },
    { key: 'grade', label: 'GRADE', w: 16 },
    { key: 'rank', label: 'RANK', w: 14 },
    { key: 'remarks', label: 'REMARKS', w: PAGE_W - 2 * M - (8 + 52 + 22 + 18 + 18 + 18 + 14 + 16 + 14) }
  ];
  let x = M;
  doc.setFillColor(226, 232, 240);
  doc.setTextColor(15, 23, 42);
  doc.rect(M, startY, PAGE_W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  for (const col of cols) {
    doc.text(col.label, x + 1.5, startY + 5.2);
    x += col.w;
  }
  let y = startY + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  card.subjects.forEach((subject, index) => {
    const remarks = doc.splitTextToSize(
      fmt(subject.teacherComment || subject.teacherName, '-'), cols[9].w - 3
    ) as string[];
    const rowH = Math.max(8, remarks.length * 3.4 + 3);
    if (y + rowH > PAGE_H - 54) {
      doc.addPage();
      y = 14;
    }
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, PAGE_W - 2 * M, rowH, 'F');
    }
    const values: string[] = [
      String(index + 1),
      fmt(subject.subjectName),
      `${num(subject.courseworkScore ?? subject.catScore)}/${num(subject.courseworkMax ?? subject.catMax)}`,
      `${num(subject.testScore)}/${num(subject.testMax)}`,
      `${num(subject.examScore)}/${num(subject.examMax)}`,
      num(subject.totalMarks ?? subject.catScore + subject.examScore),
      num(subject.percentage ?? subject.totalPercent),
      fmt(subject.grade),
      subject.rankInClass ? num(subject.rankInClass) : '-',
      ''
    ];
    x = M;
    values.forEach((value, colIndex) => {
      doc.text(value, x + 1.5, y + 5);
      x += cols[colIndex].w;
    });
    doc.text(remarks.slice(0, 3), M + cols.slice(0, 9).reduce((sum, col) => sum + col.w, 0) + 1.5, y + 5);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.line(M, y + rowH, PAGE_W - M, y + rowH);
    y += rowH;
  });
  return y + 3;
}

function comments(doc: jsPDF, y: number, card: ReportCard): number {
  const summary = [
    ['Overall average', `${num(card.overallAverage)}%`],
    ['Grade', fmt(card.overallGrade, '-')],
    ['Position', card.overallRank && card.overallRank > 0
      ? `${num(card.overallRank)} / ${num(card.totalStudentsInClass || 1)}` : '-'],
    ['Attendance', card.attendanceTotalDays
      ? `${num(card.attendanceDaysPresent)} / ${num(card.attendanceTotalDays)} days` : '-'],
    ['Conduct', fmt(card.conductScore || card.conductRemarks, '-')],
    ['Promotion', fmt(card.promotionDecision, 'Not configured')]
  ];
  const colW = (PAGE_W - 2 * M) / 3;
  let cursorY = y;
  summary.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = M + col * colW;
    const rowY = cursorY + row * 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(ascii(label).toUpperCase(), x + 1, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(ascii(value), x + 1, rowY + 4.5);
  });
  cursorY += 22;
  cursorY = line(doc, cursorY);

  const blocks: Array<[string, string | undefined]> = [
    ['Class teacher remarks', card.classTeacherRemarks],
    ['Head teacher remarks', card.headTeacherRemarks],
    ['Strengths', card.strengths],
    ['Areas for improvement', card.areasForImprovement]
  ];
  for (const [label, value] of blocks) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(ascii(label).toUpperCase(), M + 1, cursorY + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(fmt(value, 'Not recorded'), 180) as string[];
    doc.text(lines.slice(0, 2), M + 52, cursorY + 3);
    cursorY += Math.max(8, lines.slice(0, 2).length * 4 + 3);
  }
  return cursorY;
}

function signatures(doc: jsPDF, y: number, card: ReportCard, issueDate: string): void {
  const boxY = Math.max(y + 2, PAGE_H - 42);
  line(doc, boxY - 3);
  const third = (PAGE_W - 2 * M) / 3;
  const names = [
    ['Class teacher', card.classTeacherName],
    ['Head teacher', card.headTeacherName],
    ['Issued date', issueDate]
  ];
  names.forEach(([label, value], index) => {
    const x = M + index * third;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('........................................', x + 4, boxY + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(ascii(label), x + 4, boxY + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(fmt(value, '-'), x + 4, boxY + 20);
  });
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.circle(PAGE_W - M - 20, boxY + 18, 9, 'S');
  doc.setFontSize(6.5);
  doc.text('SCHOOL STAMP', PAGE_W - M - 20, boxY + 19, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Generated from approved marks - SchoolCare', M, PAGE_H - 6);
}

function drawCard(doc: jsPDF, card: ReportCard, school?: School, first = false): void {
  if (!first) doc.addPage();
  let y = header(doc, school, card.academicYear, card.term);
  const colW = (PAGE_W - 2 * M) / 2;
  section(doc, 'Student name', card.studentName, M, y, colW - 6);
  section(doc, 'Admission number', card.admissionNumber, M + colW, y, colW - 6);
  y += 12;
  section(doc, 'Class / combination', [card.className, card.combination].filter(Boolean).join(' - '), M, y, colW - 6);
  section(doc, 'Academic year / term', [card.academicYear, card.term].filter(Boolean).join(' - '), M + colW, y, colW - 6);
  y = line(doc, y + 12);
  y = drawTable(doc, card, y);
  y = comments(doc, y, card);
  signatures(doc, y, card, card.issueDate || new Date().toISOString().slice(0, 10));
}

export function downloadReportCardPdf(
  card: ReportCard,
  school?: School,
  filename?: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawCard(doc, card, school, true);
  doc.save(filename || `report-card-${card.admissionNumber || card.studentId}.pdf`);
}

export function downloadReportCardsPdf(
  cards: ReportCard[],
  school?: School,
  filename = 'schoolcare-report-cards.pdf'
): void {
  if (cards.length === 0) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  cards.forEach((card, index) => drawCard(doc, card, school, index === 0));
  doc.save(filename);
}

/**
 * Applies A4 landscape page rules only while an official report is printed, so
 * other printable modules keep their existing page setup.
 */
export function printReportCards(): void {
  const style = document.createElement('style');
  style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
  document.head.appendChild(style);
  const cleanup = () => {
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  window.setTimeout(cleanup, 2000);
}
