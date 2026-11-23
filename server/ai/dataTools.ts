import { db } from '../database';
import type { UserRole } from '../../src/types';
import type { AiActorContext, AiDataContext, AiIntent } from './types';

const LEADERSHIP: UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD'];

function isLeadership(role: UserRole): boolean {
  return LEADERSHIP.includes(role);
}

/** `permissions` comes from the server's getEffectivePermissions(user). */
function can(actor: AiActorContext, permission: string): boolean {
  return actor.permissions.includes(permission) || actor.permissions.includes(permission.replace('.', ':'));
}

/** Class IDs a staff member may read. null means unrestricted, [] means none. */
function classScope(actor: AiActorContext, schoolId: string): string[] | null {
  if (isLeadership(actor.role)) return null;
  if (actor.role === 'PARENT' || actor.role === 'STUDENT') return null; // filtered by student IDs instead
  if (!can(actor, 'attendance.read')) return [];
  if (actor.role !== 'TEACHER') return null;
  const assignmentRows = db.getAcademicCollection<{ classId?: string; teacherIds?: string[]; isActive?: boolean }>(
    'classSubjectAssignments',
    schoolId
  );
  const classTeacherRows = db.getAcademicCollection<{ classId?: string; teacherId?: string }>(
    'classTeacherAssignments',
    schoolId
  );
  const ids = new Set<string>();
  for (const row of assignmentRows) {
    if (row.isActive === false) continue;
    if (row.teacherIds?.includes(actor.id) && row.classId) ids.add(row.classId);
  }
  for (const row of classTeacherRows) {
    if (row.teacherId === actor.id && row.classId) ids.add(row.classId);
  }
  return [...ids];
}

/** Resolve linked students from the authoritative user profile supplied by the route. */
function linkedStudentIds(actor: AiActorContext, rawLinked?: string[], rawStudent?: string): string[] {
  if (actor.role === 'PARENT') return Array.isArray(rawLinked) ? rawLinked.filter(id => typeof id === 'string') : [];
  if (actor.role === 'STUDENT') return typeof rawStudent === 'string' && rawStudent ? [rawStudent] : [];
  return [];
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = key(item) || 'UNKNOWN';
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function compactFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(facts);
  return json.length > 12_000 ? { notice: 'Dataset too large to include; only aggregates are provided.' } : facts;
}

async function buildStudentCount(actor: AiActorContext, schoolId: string): Promise<AiDataContext> {
  if (actor.role === 'PARENT' || actor.role === 'STUDENT') {
    return {
      intent: 'student_count',
      facts: {},
      sources: [],
      notice: 'School-wide enrollment totals are not available to this account. Only records linked to your own account may be discussed.'
    };
  }
  const students = db.getStudents(schoolId);
  const scope = classScope(actor, schoolId);
  const scoped = scope === null ? students : students.filter(student => scope.includes(student.classId));
  const byClass = countBy(scoped, student => student.className || student.classId);
  return {
    intent: 'student_count',
    facts: compactFacts({
      scope: scope === null ? 'school' : 'assigned classes only',
      total: scoped.length,
      active: scoped.filter(student => student.enrollmentStatus === 'ACTIVE').length,
      byClass: Object.fromEntries(Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 10))
    }),
    sources: [{ title: 'SchoolCare student registry', kind: 'DATABASE' }],
    notice: scope === null ? undefined : 'Count is limited to classes assigned to this account.'
  };
}

async function buildAttendance(actor: AiActorContext, schoolId: string, studentIds: string[]): Promise<AiDataContext> {
  if (actor.role === 'PARENT' || actor.role === 'STUDENT') {
    if (!studentIds.length) {
      return { intent: 'attendance_summary', facts: {}, sources: [], notice: 'No student is linked to this account.' };
    }
    let records = db.getAttendance(schoolId).filter(record => studentIds.includes(record.studentId));
    const dates = records.map(record => record.date).sort();
    if (dates.length > 30) {
      const cutoff = dates[dates.length - 30];
      records = records.filter(record => record.date >= cutoff);
    }
    return {
      intent: 'attendance_summary',
      facts: compactFacts({
        scope: 'linked students only',
        period: records.length ? { from: records[0].date, to: dates[dates.length - 1] } : null,
        totalRecords: records.length,
        byStatus: countBy(records, record => record.status)
      }),
      sources: [{ title: 'SchoolCare daily attendance register', kind: 'DATABASE' }]
    };
  }

  if (!can(actor, 'attendance.read')) {
    return { intent: 'attendance_summary', facts: {}, sources: [], notice: 'You are not authorized to view attendance records.' };
  }
  const scope = classScope(actor, schoolId);
  const records = db.getAttendance(schoolId).filter(record => scope === null || (record.classId && scope.includes(record.classId)));
  const dates = records.map(record => record.date).sort();
  const byClass = countBy(records, record => record.className || record.classId);
  return {
    intent: 'attendance_summary',
    facts: compactFacts({
      scope: scope === null ? 'school' : 'assigned classes only',
      period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      totalRecords: records.length,
      byStatus: countBy(records, record => record.status),
      byClass: Object.fromEntries(Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 10))
    }),
    sources: [{ title: 'SchoolCare daily attendance register', kind: 'DATABASE' }],
    notice: scope === null ? undefined : 'Summary is limited to classes assigned to this account.'
  };
}

async function buildMyResults(actor: AiActorContext, schoolId: string, studentIds: string[]): Promise<AiDataContext> {
  if (!studentIds.length) {
    return { intent: 'my_results', facts: {}, sources: [], notice: 'No student is linked to this account.' };
  }
  const results: Array<Record<string, unknown>> = [];
  for (const studentId of studentIds) {
    const cards = db.getReportCards(schoolId, studentId, { publishedOnly: true });
    if (!cards.length) continue;
    const latest = cards.sort((a, b) => String(b.publishedAt || b.generatedAt || '').localeCompare(String(a.publishedAt || a.generatedAt || '')))[0];
    const student = db.getStudentById(studentId);
    results.push({
      student: actor.role === 'STUDENT' ? 'Your record' : (student ? `${student.firstName} ${student.lastName}` : 'Linked child'),
      academicYear: latest.academicYear,
      term: latest.term,
      overallAverage: latest.overallAverage,
      overallGrade: latest.overallGrade,
      rank: latest.overallRank,
      classSize: latest.totalStudentsInClass,
      publishedAt: latest.publishedAt,
      subjects: latest.subjects.slice(0, 8).map(subject => ({
        name: subject.subjectName,
        percentage: subject.totalPercent ?? subject.percentage,
        grade: subject.grade
      })),
      strengths: latest.strengths,
      areasForImprovement: latest.areasForImprovement
    });
  }
  return {
    intent: 'my_results',
    facts: compactFacts({ publishedResults: results, publishedOnly: true }),
    sources: results.length ? [{ title: 'Published SchoolCare report cards', kind: 'DATABASE' }] : [],
    notice: results.length ? undefined : 'No published report card is available for the linked student(s).'
  };
}

async function buildAcademicSummary(actor: AiActorContext, schoolId: string): Promise<AiDataContext> {
  if (!can(actor, 'academics.read')) {
    return { intent: 'academic_summary', facts: {}, sources: [], notice: 'You are not authorized to view academic summaries.' };
  }
  const scope = classScope(actor, schoolId);
  const cards = db.getReportCards(schoolId, undefined, { publishedOnly: true }).filter(card => {
    if (scope === null) return true;
    if (card.classId) return scope.includes(card.classId);
    const student = db.getStudentById(card.studentId);
    return Boolean(student && scope.includes(student.classId));
  });
  const byClass = countBy(cards, card => card.className || 'Unknown class');
  const averages = cards.map(card => Number(card.overallAverage)).filter(value => Number.isFinite(value));
  const average = averages.length ? Number((averages.reduce((sum, value) => sum + value, 0) / averages.length).toFixed(1)) : null;
  return {
    intent: 'academic_summary',
    facts: compactFacts({
      scope: scope === null ? 'school' : 'assigned classes only',
      publishedCards: cards.length,
      averageOfPublishedAverages: average,
      passCount: cards.filter(card => Number(card.overallAverage) >= 50).length,
      byClass: Object.fromEntries(Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 10))
    }),
    sources: [{ title: 'Published SchoolCare report cards', kind: 'DATABASE' }],
    notice: scope === null ? undefined : 'Summary is limited to classes assigned to this account.'
  };
}

async function buildFinance(actor: AiActorContext, schoolId: string): Promise<AiDataContext> {
  if (!can(actor, 'finance.read')) {
    return { intent: 'finance_summary', facts: {}, sources: [], notice: 'Financial records are restricted to authorized finance users.' };
  }
  const invoices = db.getInvoices(schoolId);
  const payments = db.getPayments(schoolId).filter(payment => payment.status === 'COMPLETED');
  const billed = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmountRwf || 0), 0);
  const paid = invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmountRwf || 0), 0);
  const received = payments.reduce((sum, payment) => sum + Number(payment.amountRwf || 0), 0);
  return {
    intent: 'finance_summary',
    facts: compactFacts({
      invoiceCount: invoices.length,
      totalBilledRwf: billed,
      totalPaidOnInvoicesRwf: paid,
      totalOutstandingRwf: invoices.reduce((sum, invoice) => sum + Number(invoice.balanceRwf || 0), 0),
      completedPaymentCount: payments.length,
      completedPaymentsRwf: received,
      byStatus: countBy(invoices, invoice => invoice.status)
    }),
    sources: [{ title: 'SchoolCare fee invoices and receipts', kind: 'DATABASE' }]
  };
}

async function buildAnnouncements(schoolId: string): Promise<AiDataContext> {
  const events = db.getEvents(schoolId).map(event => ({
    title: event.titleEn,
    titleRw: event.titleRw,
    date: event.date,
    time: event.time,
    category: event.category,
    description: event.descriptionEn,
    descriptionRw: event.descriptionRw
  }));
  return {
    intent: 'announcements',
    facts: compactFacts({
      events: events.slice(0, 12),
      note: 'Only school calendar events are available here. Check official documents for written announcements.'
    }),
    sources: events.length ? [{ title: 'SchoolCare school calendar', kind: 'DATABASE' }] : []
  };
}

/**
 * Build the only school data the model is allowed to see. Every branch uses
 * backend authorization and school-scoped, parameterized service functions.
 * The model never receives raw tables, credentials or unrestricted queries.
 */
export async function buildAuthorizedDataContext(options: {
  actor: AiActorContext;
  intent: AiIntent;
  schoolId: string;
  studentIds: string[];
}): Promise<AiDataContext> {
  const { actor, intent, schoolId, studentIds } = options;
  switch (intent) {
    case 'student_count': return buildStudentCount(actor, schoolId);
    case 'attendance_summary': return buildAttendance(actor, schoolId, studentIds);
    case 'my_results': return buildMyResults(actor, schoolId, studentIds);
    case 'academic_summary': return buildAcademicSummary(actor, schoolId);
    case 'finance_summary': return buildFinance(actor, schoolId);
    case 'announcements': return buildAnnouncements(schoolId);
    case 'knowledge':
    case 'general':
    default:
      return { intent: 'general', facts: {}, sources: [] };
  }
}

export function resolveStudentIds(actor: AiActorContext, profile?: { linkedStudentIds?: string[]; studentId?: string }): string[] {
  return linkedStudentIds(actor, profile?.linkedStudentIds, profile?.studentId);
}
