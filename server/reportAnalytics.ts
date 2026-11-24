/**
 * Shared executive analytics builder. The JSON endpoint and the CSV export
 * both use this function so downloaded figures always match the on-screen
 * report and follow the same module-permission redaction rules.
 */
import { db } from './database';
import type { HealthIncident, ReportCard, School } from '../src/types';

export interface ReportAnalytics {
  generatedAt: string;
  school: School | undefined;
  term: string;
  scope: {
    term: string;
    combination: string | null;
    appliedTo: string[];
  };
  restrictedSections: string[];
  academics: {
    totalEvaluated: number;
    overallAverage: number;
    passRate: number;
    gradeDistribution: Record<string, number>;
    topStudents: ReportCard[];
  };
  attendance: {
    totalRecords: number;
    attendanceRate: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
    chronicAbsentCount: number;
    chronicAbsentStudents: unknown[];
  };
  health: {
    totalIncidents: number;
    urgentHealthCases: number;
    hospitalReferrals: number;
    parentAcknowledgmentRate: number;
    recentCases: HealthIncident[];
  };
  finance: {
    totalBilledRwf: number;
    totalCollectedRwf: number;
    totalOutstandingRwf: number;
    collectionEfficiency: number;
    paymentMethodsBreakdown: Record<string, number>;
  };
  communication: {
    totalDispatched: number;
    deliveredCount: number;
    deliverySuccessRate: number;
  };
}

export function buildReportAnalytics(
  schoolId: string,
  permissions: readonly string[],
  term?: string,
  combination?: string
): ReportAnalytics {
  const selectedTerm = term || 'Term 1';
  const selectedCombination = combination && combination !== 'ALL' ? combination : null;

  // `reports.read` grants access to the report, not to every underlying
  // module. Each section is redacted unless the account can read that module.
  const permissionCodes = new Set(permissions.map(permission => permission.replace(':', '.')));
  const canRead = (code: string) => permissionCodes.has(code);
  const canReadStudents = canRead('students.read');
  const canReadAcademics = canRead('academics.read');
  const canReadAttendance = canRead('attendance.read') && canReadStudents;
  const canReadHealth = canRead('health.read') && canReadStudents;
  const canReadFinance = canRead('finance.read');
  const canReadCommunication = canRead('notifications.read');
  const restrictedSections = [
    !canReadAcademics && 'academics',
    !canReadAttendance && 'attendance',
    !canReadHealth && 'health',
    !canReadFinance && 'finance',
    !canReadCommunication && 'communication'
  ].filter(Boolean) as string[];

  const allStudents = db.getStudents(schoolId);
  const allReportCards = db.getReportCards(schoolId);
  const allAttendance = db.getAttendance(schoolId);
  const allHealth = db.getHealthIncidents(schoolId);
  const allInvoices = db.getInvoices(schoolId);
  const allPayments = db.getPayments(schoolId);
  const allMessages = db.getNotifications(schoolId);

  // Without publish rights, analytics may only use report cards already made
  // visible to the school community.
  const reportCardsInScope = allReportCards.filter(card =>
    (!selectedTerm || card.term === selectedTerm) &&
    (!selectedCombination || card.combination === selectedCombination)
  );
  const visibleReportCards = canRead('reports.publish')
    ? reportCardsInScope
    : reportCardsInScope.filter(card => Boolean(card.publishedAt) && card.status !== 'DRAFT');
  const students = canReadStudents ? allStudents : [];
  const reportCards = canReadAcademics ? visibleReportCards : [];
  const attendance = canReadAttendance ? allAttendance : [];
  const health = canReadHealth ? allHealth : [];
  const invoices = canReadFinance ? allInvoices : [];
  const payments = canReadFinance ? allPayments : [];
  const messages = canReadCommunication ? allMessages : [];

  const evaluatedCount = reportCards.length;
  const academicDenominator = evaluatedCount || 1;
  const overallAverage = evaluatedCount > 0 ? Number(
    (reportCards.reduce((acc, card) => acc + card.overallAverage, 0) / academicDenominator).toFixed(1)
  ) : 0;
  const passedStudents = reportCards.filter(card => card.overallAverage >= 50).length;
  const passRate = evaluatedCount > 0 ? Number(((passedStudents / academicDenominator) * 100).toFixed(1)) : 0;

  const gradeDistribution: Record<string, number> = {
    A: reportCards.filter(card => card.overallAverage >= 80).length,
    B: reportCards.filter(card => card.overallAverage >= 70 && card.overallAverage < 80).length,
    C: reportCards.filter(card => card.overallAverage >= 60 && card.overallAverage < 70).length,
    D: reportCards.filter(card => card.overallAverage >= 50 && card.overallAverage < 60).length,
    F: reportCards.filter(card => card.overallAverage < 50).length
  };

  const totalAtt = attendance.length;
  const attendanceDenominator = totalAtt || 1;
  const presentCount = attendance.filter(record => record.status === 'PRESENT').length;
  const absentCount = attendance.filter(record => record.status === 'ABSENT').length;
  const lateCount = attendance.filter(record => record.status === 'LATE').length;
  const excusedCount = attendance.filter(record =>
    ['EXCUSED', 'SICK', 'AUTHORIZED_LEAVE'].includes(record.status)
  ).length;
  const attendanceRate = totalAtt > 0 ? Number(((presentCount / attendanceDenominator) * 100).toFixed(1)) : 0;

  const chronicAbsentStudents = students.filter(student =>
    attendance.some(record => record.studentId === student.id && record.status === 'ABSENT' && !record.parentExplanation)
  );

  const urgentHealthCases = health.filter(item => item.priority === 'URGENT' || item.priority === 'EMERGENCY').length;
  const hospitalReferrals = health.filter(item => item.outcome === 'REFERRED_TO_HOSPITAL').length;
  const acknowledgedHealthAlerts = health.filter(item => item.parentAcknowledged).length;
  const ackRate = health.length > 0 ? Number(((acknowledgedHealthAlerts / health.length) * 100).toFixed(1)) : 0;

  const totalBilledRwf = invoices.reduce((acc, invoice) => acc + invoice.totalAmountRwf, 0);
  const totalCollectedRwf = invoices.reduce((acc, invoice) => acc + invoice.paidAmountRwf, 0);
  const totalOutstandingRwf = invoices.reduce((acc, invoice) => acc + invoice.balanceRwf, 0);
  const collectionEfficiency = totalBilledRwf > 0
    ? Number(((totalCollectedRwf / totalBilledRwf) * 100).toFixed(1))
    : 0;

  const paymentMethodsBreakdown: Record<string, number> = {
    MTN_MOMO: payments.filter(item => item.method === 'MTN_MOMO').reduce((acc, item) => acc + item.amountRwf, 0),
    BANK_TRANSFER: payments.filter(item => item.method === 'BANK_TRANSFER').reduce((acc, item) => acc + item.amountRwf, 0),
    AIRTEL_MONEY: payments.filter(item => item.method === 'AIRTEL_MONEY').reduce((acc, item) => acc + item.amountRwf, 0),
    CASH: payments.filter(item => item.method === 'CASH').reduce((acc, item) => acc + item.amountRwf, 0)
  };

  const totalDispatched = messages.length;
  const deliveredCount = messages.filter(item => item.status === 'DELIVERED' || item.status === 'ACKNOWLEDGED').length;
  const deliverySuccessRate = totalDispatched > 0
    ? Number(((deliveredCount / totalDispatched) * 100).toFixed(1))
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    school: db.getSchool(schoolId),
    term: selectedTerm,
    scope: {
      term: selectedTerm,
      combination: selectedCombination,
      appliedTo: ['academics']
    },
    restrictedSections,
    academics: {
      totalEvaluated: evaluatedCount,
      overallAverage,
      passRate,
      gradeDistribution,
      topStudents: reportCards.slice(0, 5)
    },
    attendance: {
      totalRecords: totalAtt,
      attendanceRate,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      chronicAbsentCount: chronicAbsentStudents.length,
      chronicAbsentStudents
    },
    health: {
      totalIncidents: health.length,
      urgentHealthCases,
      hospitalReferrals,
      parentAcknowledgmentRate: ackRate,
      recentCases: health.slice(0, 5)
    },
    finance: {
      totalBilledRwf,
      totalCollectedRwf,
      totalOutstandingRwf,
      collectionEfficiency,
      paymentMethodsBreakdown
    },
    communication: {
      totalDispatched,
      deliveredCount,
      deliverySuccessRate
    }
  };
}

const SECTION_KEYS: Readonly<Record<string, string>> = {
  ACADEMIC: 'academics',
  ATTENDANCE: 'attendance',
  HEALTH: 'health',
  FINANCE: 'finance',
  COMMUNICATION: 'communication'
};

function withExportMetadata(
  section: string,
  analytics: ReportAnalytics,
  rows: string[][]
): string[][] {
  return [
    ['School', analytics.school?.name ?? ''],
    ['Report section', section],
    ['Term filter', analytics.scope.term],
    ['Trade filter', analytics.scope.combination ?? 'ALL'],
    ['Generated at', analytics.generatedAt],
    ['Restricted sections', analytics.restrictedSections.join(', ') || 'none'],
    [],
    ...rows
  ];
}

/** Build CSV rows from the exact same analytics object used by the page. */
export function buildReportCsvRows(section: string, analytics: ReportAnalytics): string[][] {
  const normalized = section.toUpperCase();
  if (!(normalized in SECTION_KEYS)) {
    return withExportMetadata(section, analytics, [
      ['Section', 'Status'],
      [normalized, 'UNKNOWN SECTION']
    ]);
  }
  if (analytics.restrictedSections.includes(SECTION_KEYS[normalized])) {
    return withExportMetadata(section, analytics, [
      ['Section', 'Status'],
      [normalized, 'RESTRICTED - your account cannot read the underlying module records']
    ]);
  }

  let rows: string[][];
  switch (normalized) {
    case 'ACADEMIC':
      rows = [
        ['Student Name', 'Admission No', 'Class', 'Combination', 'Term', 'Overall Avg (%)', 'Rank in Class', 'Status'],
        ...analytics.academics.topStudents.map(card => [
          card.studentName,
          card.admissionNumber,
          card.className,
          card.combination ?? '',
          card.term,
          String(card.overallAverage),
          `#${card.overallRank} of ${card.totalStudentsInClass}`,
          card.status ?? (card.isApproved ? 'APPROVED' : 'DRAFT')
        ])
      ];
      break;
    case 'ATTENDANCE':
      rows = [
        ['Attendance Metric', 'Value', 'Percentage'],
        ['Total Evaluated Sessions', String(analytics.attendance.totalRecords), '100%'],
        ['Present', String(analytics.attendance.presentCount), `${analytics.attendance.attendanceRate}%`],
        ['Absent', String(analytics.attendance.absentCount), ''],
        ['Late', String(analytics.attendance.lateCount), ''],
        ['Excused / Sick', String(analytics.attendance.excusedCount), ''],
        ['Unexcused absence follow-ups', String(analytics.attendance.chronicAbsentCount), '']
      ];
      break;
    case 'HEALTH':
      rows = [
        ['Health Registry Metric', 'Count'],
        ['Total Incidents', String(analytics.health.totalIncidents)],
        ['Urgent / Emergency Cases', String(analytics.health.urgentHealthCases)],
        ['Hospital / Health Center Referrals', String(analytics.health.hospitalReferrals)],
        ['Parent Acknowledgment Rate', `${analytics.health.parentAcknowledgmentRate}%`]
      ];
      break;
    case 'FINANCE':
      rows = [
        ['Category', 'Amount (RWF)'],
        ['Total Billed', String(analytics.finance.totalBilledRwf)],
        ['Total Collected', String(analytics.finance.totalCollectedRwf)],
        ['Total Outstanding Balance', String(analytics.finance.totalOutstandingRwf)],
        ['Collection Efficiency', `${analytics.finance.collectionEfficiency}%`],
        ['MTN Mobile Money', String(analytics.finance.paymentMethodsBreakdown.MTN_MOMO ?? 0)],
        ['Bank Transfer', String(analytics.finance.paymentMethodsBreakdown.BANK_TRANSFER ?? 0)],
        ['Airtel Money', String(analytics.finance.paymentMethodsBreakdown.AIRTEL_MONEY ?? 0)],
        ['Cash', String(analytics.finance.paymentMethodsBreakdown.CASH ?? 0)]
      ];
      break;
    default:
      rows = [
        ['Communication Audit', 'Value'],
        ['Total Dispatched', String(analytics.communication.totalDispatched)],
        ['Delivered / Acknowledged', String(analytics.communication.deliveredCount)],
        ['Recorded Delivery Rate', `${analytics.communication.deliverySuccessRate}%`]
      ];
  }
  return withExportMetadata(section, analytics, rows);
}

/** UTF-8 BOM keeps Excel from mangling Kinyarwanda text; cells are escaped. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const escapeCell = (value: string) => {
    let safe = String(value ?? '');
    if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '\uFEFF' + rows.map(row => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
