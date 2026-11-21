/**
 * Shared academic domain logic.
 *
 * All totals, percentages, grades, positions and report-card values are
 * calculated here from stored marks. The browser never supplies final results.
 */
import {
  AcademicClass,
  AcademicSettings,
  AcademicSubjectResult,
  AcademicTerm,
  MarkEntry,
  MarkSubmission,
  MissingAcademicRequirement,
  NotificationMessage,
  ReportCard,
  ReportCardSubjectRow,
  ReportDistribution,
  Student,
  UserProfile,
  AssessmentCategory,
  GradeBoundary,
  GradingScale,
  AcademicYear,
  ClassSubjectAssignment,
  ClassTeacherAssignment,
  AcademicWorkflowEvent,
  StudentResult,
  CalculationResult
} from '../src/types';
import { db } from './database';
import { hasPermission } from './permissions';

export class HttpError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Actual school/platform leadership, excluding delegated academic powers. */
export function isAcademicLeader(actor: UserProfile): boolean {
  return actor.role === 'SUPER_ADMIN' || actor.role === 'SCHOOL_ADMIN' || actor.role === 'HEAD_TEACHER';
}

export function isAcademicManager(actor: UserProfile): boolean {
  return isAcademicLeader(actor) || hasPermission(actor, 'academics.write');
}

export function canReviewMarks(actor: UserProfile): boolean {
  return (
    actor.role === 'SUPER_ADMIN' ||
    actor.role === 'SCHOOL_ADMIN' ||
    actor.role === 'HEAD_TEACHER' ||
    hasPermission(actor, 'marks.review')
  );
}

export function canPublishReports(actor: UserProfile): boolean {
  return (
    actor.role === 'SUPER_ADMIN' ||
    actor.role === 'SCHOOL_ADMIN' ||
    actor.role === 'HEAD_TEACHER' ||
    hasPermission(actor, 'reports.publish')
  );
}

export function canDistributeReports(actor: UserProfile): boolean {
  return (
    actor.role === 'SUPER_ADMIN' ||
    actor.role === 'SCHOOL_ADMIN' ||
    actor.role === 'HEAD_TEACHER' ||
    hasPermission(actor, 'reports.distribute')
  );
}

export function canGenerateReports(actor: UserProfile): boolean {
  return (
    actor.role === 'SUPER_ADMIN' ||
    actor.role === 'SCHOOL_ADMIN' ||
    actor.role === 'HEAD_TEACHER' ||
    hasPermission(actor, 'reports.generate')
  );
}

export function requireActor(actor?: UserProfile | null): UserProfile {
  if (!actor) throw new HttpError(401, 'Authentication required');
  return actor;
}

export function scopedSchoolId(req: { user?: UserProfile; query: Record<string, unknown>; body: unknown }): string {
  const actor = requireActor(req.user);
  if (actor.role === 'SUPER_ADMIN') {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const override = req.query.schoolId || body.schoolId;
    if (typeof override === 'string' && override) return override;
  }
  return actor.schoolId;
}

export function getSettings(schoolId: string): AcademicSettings {
  const settings = db.getAcademicCollection<AcademicSettings>('academicSettings', schoolId)[0];
  if (settings) return settings;
  return {
    schoolId,
    enableRanking: true,
    enablePromotionDecision: false,
    promotionPassAverage: 50,
    allowSelfApproval: false
  };
}

export function updateSettings(
  schoolId: string,
  updates: Partial<AcademicSettings>,
  actor: UserProfile
): AcademicSettings {
  const current = getSettings(schoolId);
  const next: AcademicSettings = { ...current, ...updates, schoolId, updatedAt: new Date().toISOString() };
  const all = db.getAcademicCollection<AcademicSettings>('academicSettings');
  const index = all.findIndex(item => item.schoolId === schoolId);
  if (index === -1) all.unshift(next);
  else all[index] = next;
  db.saveAcademicCollection('academicSettings', all);
  db.logAudit(
    schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_ACADEMIC_SETTINGS',
    'ACADEMIC_SETTINGS', schoolId, `Updated academic policy: ${Object.keys(updates).join(', ')}`
  );
  return next;
}

export function getAcademicYear(schoolId: string, id?: string): AcademicYear | undefined {
  const years = db.getAcademicCollection<AcademicYear>('academicYears', schoolId);
  if (id) return years.find(year => year.id === id);
  const settings = getSettings(schoolId);
  return years.find(year => year.id === settings.academicYearId) ?? years.find(year => year.isActive);
}

export function getTerm(schoolId: string, id?: string, yearId?: string): AcademicTerm | undefined {
  const terms = db.getAcademicCollection<AcademicTerm>('terms', schoolId);
  if (id) return terms.find(term => term.id === id);
  const settings = getSettings(schoolId);
  const targetYear = yearId ?? settings.academicYearId;
  return terms.find(term => term.id === settings.termId && (!targetYear || term.academicYearId === targetYear))
    ?? terms.find(term => term.isActive && (!targetYear || term.academicYearId === targetYear))
    ?? terms.find(term => !targetYear || term.academicYearId === targetYear);
}

export function getCategories(schoolId: string): AssessmentCategory[] {
  return db.getAcademicCollection<AssessmentCategory>('assessmentCategories', schoolId)
    .filter(category => category.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getScale(schoolId: string, settings = getSettings(schoolId)): GradingScale | undefined {
  const scales = db.getAcademicCollection<GradingScale>('gradingScales', schoolId);
  return scales.find(scale => scale.id === settings.gradingScaleId)
    ?? scales.find(scale => scale.isActive)
    ?? scales[0];
}

export function gradeFor(percentage: number, scale?: GradingScale): GradeBoundary {
  const boundaries = [...(scale?.gradeBoundaries ?? [])].sort((a, b) => b.minPercentage - a.minPercentage);
  const match = boundaries.find(boundary => percentage >= boundary.minPercentage && percentage <= boundary.maxPercentage);
  return match ?? { grade: 'N/A', minPercentage: 0, maxPercentage: 0, description: 'Not graded' };
}

export function getAssignments(
  schoolId: string,
  yearId?: string,
  termId?: string,
  classId?: string,
  subjectId?: string
): ClassSubjectAssignment[] {
  let list = db.getAcademicCollection<ClassSubjectAssignment>('classSubjectAssignments', schoolId)
    .filter(item => item.isActive);
  if (yearId) list = list.filter(item => item.academicYearId === yearId);
  if (termId) list = list.filter(item => item.termId === termId);
  if (classId && classId !== 'all') list = list.filter(item => item.classId === classId);
  if (subjectId && subjectId !== 'all') list = list.filter(item => item.subjectId === subjectId);
  return list;
}

export function assertTeacherAssignment(
  actor: UserProfile,
  schoolId: string,
  yearId: string,
  termId: string,
  classId: string,
  subjectId: string
): void {
  // Only real leadership may bypass class/subject assignment. A delegated
  // academic permission must not become a back door to arbitrary marks entry.
  if (isAcademicLeader(actor)) return;
  const assigned = getAssignments(schoolId, yearId, termId, classId, subjectId)
    .some(item => item.teacherIds.includes(actor.id));
  if (!assigned) {
    throw new HttpError(403, 'You are not assigned to this class and subject for the selected term.');
  }
}

export function getClassStudents(schoolId: string, classId: string): Student[] {
  return db.getStudents(schoolId).filter(
    student => student.classId === classId && student.enrollmentStatus === 'ACTIVE'
  );
}

export function getSubmission(
  schoolId: string,
  yearId: string,
  termId: string,
  classId: string,
  subjectId: string
): MarkSubmission | undefined {
  return db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(
    item => item.academicYearId === yearId && item.termId === termId &&
      item.classId === classId && item.subjectId === subjectId
  );
}

export function ensureSubmission(
  schoolId: string,
  yearId: string,
  termId: string,
  classId: string,
  subjectId: string,
  actor: UserProfile
): MarkSubmission {
  const existing = getSubmission(schoolId, yearId, termId, classId, subjectId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const submission: MarkSubmission = {
    id: uid('sub'),
    schoolId,
    academicYearId: yearId,
    termId,
    classId,
    subjectId,
    teacherId: actor.id,
    status: 'DRAFT',
    history: [{ action: 'DRAFT_CREATED', by: actor.id, byName: actor.fullName, role: actor.role, at: now }],
    createdAt: now,
    updatedAt: now
  };
  db.addAcademicRecord('markSubmissions', submission);
  return submission;
}

export function getMarks(
  schoolId: string,
  yearId: string,
  termId: string,
  classId: string,
  subjectId: string
): MarkEntry[] {
  return db.getAcademicCollection<MarkEntry>('marks', schoolId).filter(
    item => item.academicYearId === yearId && item.termId === termId &&
      item.classId === classId && item.subjectId === subjectId
  );
}

/**
 * Calculates all results for one class/term from persisted marks.
 */
export function calculateClassResults(
  schoolId: string,
  yearId: string,
  termId: string,
  classId: string,
  subjectIds?: string[]
): CalculationResult {
  const categories = getCategories(schoolId);
  const settings = getSettings(schoolId);
  const scale = getScale(schoolId, settings);
  const assignments = getAssignments(schoolId, yearId, termId, classId);
  const selectedSubjects = subjectIds && subjectIds.length > 0
    ? assignments.filter(item => subjectIds.includes(item.subjectId))
    : assignments;
  const subjects = db.getSubjects(schoolId);
  const students = getClassStudents(schoolId, classId);
  const marks = db.getAcademicCollection<MarkEntry>('marks', schoolId).filter(
    item => item.academicYearId === yearId && item.termId === termId && item.classId === classId
  );
  const users = db.getUsers(schoolId);
  const missing: MissingAcademicRequirement[] = [];

  const studentResults: StudentResult[] = students.map(student => {
    const subjectResults: AcademicSubjectResult[] = selectedSubjects.map(assignment => {
      const subject = subjects.find(item => item.id === assignment.subjectId);
      const subjectMarks = marks.filter(
        item => item.studentId === student.id && item.subjectId === assignment.subjectId
      );
      let weightedSum = 0;
      let activeWeight = 0;
      let totalMarks = 0;
      let complete = true;
      const breakdown: AcademicSubjectResult['categories'] = [];

      for (const category of categories) {
        const mark = subjectMarks.find(item => item.categoryId === category.id);
        const status = mark?.attendanceStatus ?? 'PRESENT';
        let score = mark?.score ?? null;
        if (score === null && status === 'ABSENT') score = 0;
        const excluded = score === null && status === 'EXCUSED';
        if (score === null && !excluded) {
          complete = false;
          missing.push({
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`,
            subjectId: assignment.subjectId,
            subjectName: subject?.name ?? assignment.subjectId,
            categoryId: category.id,
            categoryName: category.name,
            reason: status === 'ABSENT' ? 'Absent mark requires a zero entry' : 'Mark not entered'
          });
        }
        breakdown.push({
          categoryId: category.id,
          code: category.code,
          name: category.name,
          score,
          maxMarks: category.maxMarks,
          weightPercentage: category.weightPercentage,
          attendanceStatus: status
        });
        if (score !== null && !excluded) {
          totalMarks += score;
          weightedSum += (score / Math.max(1, category.maxMarks)) * category.weightPercentage;
          activeWeight += category.weightPercentage;
        }
      }

      const percentage = activeWeight > 0 ? round((weightedSum / activeWeight) * 100) : 0;
      const boundary = gradeFor(percentage, scale);
      const byCode = (code: string) => breakdown.find(item => item.code === code);
      const categoryMark = (code: string) => subjectMarks.find(
        item => item.categoryId === categories.find(category => category.code === code)?.id
      );
      const coursework = byCode('COURSEWORK');
      const test = byCode('TEST');
      const exam = byCode('EXAM');
      const teacher = users.find(user => assignment.teacherIds.includes(user.id));

      return {
        subjectId: assignment.subjectId,
        subjectName: subject?.name ?? assignment.subjectId,
        subjectCode: subject?.code ?? '',
        teacherName: teacher?.fullName ?? 'Not assigned',
        categories: breakdown,
        courseworkScore: coursework?.score ?? 0,
        courseworkMax: coursework?.maxMarks ?? 0,
        testScore: test?.score ?? 0,
        testMax: test?.maxMarks ?? 0,
        examScore: exam?.score ?? 0,
        examMax: exam?.maxMarks ?? 0,
        totalMarks: round(totalMarks),
        percentage,
        grade: boundary.grade,
        gradeDescription: boundary.description,
        remark: categoryMark('EXAM')?.remark ?? categoryMark('COURSEWORK')?.remark ?? '',
        rankInClass: 0,
        isComplete: complete
      };
    });

    const average = subjectResults.length > 0
      ? round(subjectResults.reduce((sum, item) => sum + item.percentage, 0) / subjectResults.length)
      : 0;
    const boundary = gradeFor(average, scale);
    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      classId,
      subjects: subjectResults,
      totalMarks: round(subjectResults.reduce((sum, item) => sum + item.totalMarks, 0)),
      average,
      grade: boundary.grade,
      gradeDescription: boundary.description,
      rank: 0,
      isComplete: subjectResults.length > 0 && subjectResults.every(item => item.isComplete)
    };
  });

  // Competition ranking: equal averages share the same position.
  const ranked = [...studentResults].sort((a, b) => b.average - a.average);
  ranked.forEach((student, index) => {
    const rank = index > 0 && ranked[index - 1].average === student.average
      ? studentResults.find(item => item.studentId === ranked[index - 1].studentId)?.rank ?? index + 1
      : index + 1;
    const target = studentResults.find(item => item.studentId === student.studentId);
    if (target) target.rank = rank;
  });

  for (const subject of selectedSubjects) {
    const values = studentResults
      .map(student => student.subjects.find(item => item.subjectId === subject.subjectId)?.percentage)
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) continue;
    const rankOrder = studentResults
      .map(student => ({ id: student.studentId, value: student.subjects.find(item => item.subjectId === subject.subjectId)?.percentage ?? 0 }))
      .sort((a, b) => b.value - a.value);
    rankOrder.forEach((entry, index) => {
      const student = studentResults.find(item => item.studentId === entry.id);
      const result = student?.subjects.find(item => item.subjectId === subject.subjectId);
      if (result) result.rankInClass = index + 1;
    });
  }

  const subjectPerformance = selectedSubjects.map(assignment => {
    const values = studentResults
      .map(student => student.subjects.find(item => item.subjectId === assignment.subjectId)?.percentage)
      .filter((value): value is number => typeof value === 'number');
    const subject = subjects.find(item => item.id === assignment.subjectId);
    const name = subject?.name ?? assignment.subjectId;
    const passMark = subject?.passMark || scale?.passMark || 50;
    return {
      subjectId: assignment.subjectId,
      subjectName: name,
      average: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
      highest: values.length ? Math.max(...values) : 0,
      lowest: values.length ? Math.min(...values) : 0,
      passRate: values.length ? round(values.filter(value => value >= passMark).length / values.length * 100) : 0,
      studentCount: values.length
    };
  });

  const classAverage = studentResults.length
    ? round(studentResults.reduce((sum, student) => sum + student.average, 0) / studentResults.length)
    : 0;

  return { students: studentResults, missing, classAverage, subjectPerformance, categories, scale };
}

export function getApprovedSubmissionIds(
  schoolId: string,
  yearId: string,
  termId: string,
  classId: string,
  subjectIds: string[]
): string[] {
  return subjectIds
    .map(subjectId => getSubmission(schoolId, yearId, termId, classId, subjectId))
    .filter((submission): submission is MarkSubmission => Boolean(submission) && submission!.status === 'APPROVED')
    .map(submission => submission!.id);
}

export interface ReportGenerationResult {
  cards: ReportCard[];
  missing: MissingAcademicRequirement[];
}

/**
 * Builds (but does not publish) report cards from approved marks only.
 */
export function generateReportCards(
  schoolId: string,
  year: AcademicYear,
  term: AcademicTerm,
  classId: string,
  actor: UserProfile,
  options: { studentIds?: string[]; subjectIds?: string[] } = {}
): ReportGenerationResult {
  const assignmentList = getAssignments(schoolId, year.id, term.id, classId)
    .filter(item => !options.subjectIds || options.subjectIds.includes(item.subjectId));
  if (assignmentList.length === 0) {
    throw new HttpError(400, 'No subjects are assigned to this class for the selected term.');
  }
  const approvedSubjectIds = assignmentList
    .filter(item => getSubmission(schoolId, year.id, term.id, classId, item.subjectId)?.status === 'APPROVED')
    .map(item => item.subjectId);
  const missing: MissingAcademicRequirement[] = assignmentList
    .filter(item => !approvedSubjectIds.includes(item.subjectId))
    .map(item => ({
      studentId: '',
      studentName: '',
      subjectId: item.subjectId,
      subjectName: db.getSubjects(schoolId).find(subject => subject.id === item.subjectId)?.name ?? item.subjectId,
      reason: 'Marks are not approved for this subject'
    }));

  const results = calculateClassResults(schoolId, year.id, term.id, classId, approvedSubjectIds);
  missing.push(...results.missing);
  if (missing.length > 0) {
    // Never create an official report from incomplete or unapproved records.
    return { cards: [], missing };
  }
  const settings = getSettings(schoolId);
  const academicClass = db.getClasses(schoolId).find(item => item.id === classId);
  const users = db.getUsers(schoolId);
  const headteacher = users.find(user => user.role === 'HEAD_TEACHER') ?? users.find(user => user.role === 'SCHOOL_ADMIN');
  const classTeacherAssignment = db.getAcademicCollection<ClassTeacherAssignment>('classTeacherAssignments', schoolId)
    .find(item => item.classId === classId);
  const classTeacher = users.find(user => user.id === classTeacherAssignment?.teacherId);

  const sourceSubmissionIds = getApprovedSubmissionIds(schoolId, year.id, term.id, classId, approvedSubjectIds);
  const issueDate = new Date().toISOString().slice(0, 10);
  const targetStudents = options.studentIds?.length
    ? results.students.filter(student => options.studentIds!.includes(student.studentId))
    : results.students;

  const cards: ReportCard[] = [];
  for (const student of targetStudents) {
    const subjects: ReportCardSubjectRow[] = student.subjects.map(subject => ({
      subjectName: subject.subjectName,
      subjectCode: subject.subjectCode,
      catScore: subject.courseworkScore,
      catMax: subject.courseworkMax,
      examScore: subject.examScore,
      examMax: subject.examMax,
      courseworkScore: subject.courseworkScore,
      courseworkMax: subject.courseworkMax,
      testScore: subject.testScore,
      testMax: subject.testMax,
      totalMarks: subject.totalMarks,
      totalPercent: subject.percentage,
      percentage: subject.percentage,
      grade: subject.grade,
      rankInClass: settings.enableRanking ? subject.rankInClass : 0,
      teacherComment: subject.remark,
      teacherName: subject.teacherName
    }));

    const card: ReportCard = {
      id: uid('rc'),
      schoolId,
      studentId: student.studentId,
      studentName: student.studentName,
      admissionNumber: student.admissionNumber,
      className: academicClass?.name ?? '',
      classId,
      combination: academicClass?.combination ?? '',
      academicYear: year.name,
      term: term.name,
      subjects,
      overallAverage: student.average,
      overallGrade: student.grade,
      overallRank: settings.enableRanking ? student.rank : 0,
      totalStudentsInClass: results.students.length,
      attendanceDaysPresent: 0,
      attendanceTotalDays: 0,
      conductScore: '',
      classTeacherRemarks: '',
      headTeacherRemarks: '',
      isApproved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: actor.id,
      publishedAt: undefined,
      publishedBy: undefined,
      generatedAt: new Date().toISOString(),
      generatedBy: actor.id,
      issueDate,
      classTeacherName: classTeacher?.fullName ?? academicClass?.classTeacherName ?? '',
      headTeacherName: headteacher?.fullName ?? '',
      strengths: '',
      areasForImprovement: '',
      promotionDecision: settings.enablePromotionDecision
        ? (student.average >= (settings.promotionPassAverage ?? 50) ? 'PROMOTED' : 'NOT_PROMOTED')
        : undefined,
      sourceSubmissionIds,
      status: 'APPROVED'
    };
    const savedCard = db.upsertReportCard(card);
    cards.push(savedCard);
    ensureDistribution(schoolId, savedCard, actor);
  }
  if (cards.length > 0) {
    db.logAudit(
      schoolId, actor.id, actor.fullName, actor.role, 'GENERATE_REPORT_CARDS', 'REPORT_CARD',
      classId, `Generated ${cards.length} report card(s) from approved marks for ${year.name} / ${term.name}`
    );
  }
  return { cards, missing };
}

export function ensureDistribution(schoolId: string, card: ReportCard, actor: UserProfile): ReportDistribution {
  const existing = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId)
    .find(item => item.reportCardId === card.id);
  const now = new Date().toISOString();
  if (existing) {
    // Regenerated content invalidates any previous print/issue/collect state.
    // It never advances a record; it only returns it to GENERATED.
    if (existing.status === 'GENERATED') return existing;
    const reset = db.updateAcademicRecord<ReportDistribution>('reportDistributions', existing.id, schoolId, {
      status: 'GENERATED',
      printedAt: undefined,
      issuedAt: undefined,
      issuedToName: undefined,
      issuedToRelationship: undefined,
      collectedAt: undefined,
      collectedByName: undefined,
      updatedAt: now,
      history: addHistory({
        action: 'REGENERATED', by: actor.id, byName: actor.fullName, role: actor.role, at: now,
        note: 'Report card regenerated from current approved marks.'
      }, existing.history)
    });
    if (reset) {
      db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'RESET_REPORT_DISTRIBUTION',
        'REPORT_DISTRIBUTION', reset.id, `Regenerated report returned to GENERATED for ${reset.studentName}`);
      return reset;
    }
    return existing;
  }

  const distribution: ReportDistribution = {
    id: uid('dist'),
    schoolId,
    reportCardId: card.id,
    studentId: card.studentId,
    studentName: card.studentName,
    className: card.className,
    academicYear: card.academicYear,
    term: card.term,
    status: 'GENERATED',
    generatedAt: now,
    staffId: actor.id,
    staffName: actor.fullName,
    history: [{ action: 'GENERATED', by: actor.id, byName: actor.fullName, role: actor.role, at: now }],
    createdAt: now,
    updatedAt: now
  };
  return db.addAcademicRecord('reportDistributions', distribution);
}

export function addHistory(
  event: AcademicWorkflowEvent,
  history: AcademicWorkflowEvent[] = []
): AcademicWorkflowEvent[] {
  return [...history, event];
}

export function queueAcademicNotification(
  schoolId: string,
  recipientId: string,
  recipientName: string,
  titleEn: string,
  titleRw: string,
  contentEn: string,
  contentRw: string,
  relatedEntityId?: string
): void {
  const message: NotificationMessage = {
    id: uid('note'),
    schoolId,
    recipientId,
    recipientName,
    recipientPhone: '',
    channel: 'IN_APP',
    category: 'ACADEMIC',
    priority: 'ROUTINE',
    titleEn,
    titleRw,
    contentEn,
    contentRw,
    status: 'DELIVERED',
    createdAt: new Date().toISOString(),
    relatedEntityId
  };
  db.queueNotification(message);
}

/**
 * Queues one in-app deadline reminder per assignee per day when the configured
 * marks-submission window has elapsed. This is intentionally triggered by
 * normal academic dashboard reads so no external scheduler is required.
 */
export function notifySubmissionDeadlines(schoolId: string): number {
  const settings = getSettings(schoolId);
  const term = getTerm(schoolId);
  if (!term) return 0;
  const start = term.startDate || term.createdAt;
  if (!start) return 0;
  const days = settings.submissionDeadlineDays ?? 14;
  const dueAt = new Date(start).getTime() + days * 24 * 60 * 60 * 1000;
  if (Date.now() < dueAt) return 0;

  const year = getAcademicYear(schoolId, term.academicYearId) ?? getAcademicYear(schoolId, term.id);
  if (!year) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.getNotifications(schoolId);
  const subjects = db.getSubjects(schoolId);
  const classes = db.getClasses(schoolId);
  const users = db.getUsers(schoolId);
  let queued = 0;

  for (const assignment of getAssignments(schoolId, year.id, term.id)) {
    const submission = getSubmission(schoolId, year.id, term.id, assignment.classId, assignment.subjectId);
    if (submission && ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(submission.status)) continue;
    const subjectName = subjects.find(item => item.id === assignment.subjectId)?.name ?? assignment.subjectId;
    const className = classes.find(item => item.id === assignment.classId)?.name ?? assignment.classId;
    for (const teacherId of assignment.teacherIds) {
      const relatedEntityId = `deadline:${assignment.id}:${teacherId}:${today}`;
      if (existing.some(item => item.relatedEntityId === relatedEntityId)) continue;
      const teacher = users.find(item => item.id === teacherId);
      if (!teacher) continue;
      queueAcademicNotification(
        schoolId, teacher.id, teacher.fullName,
        'Marks submission deadline passed', 'Igihe cyo kwinjiza amanota cyarangiye',
        `The submission window for ${subjectName} (${className}) has passed. Submit or update your marks.`,
        `Igihe cyo kwinjiza amanota ya ${subjectName} (${className}) cyarangiye. Yohereze cyangwa uzihindure.`,
        relatedEntityId
      );
      queued += 1;
    }
  }
  return queued;
}

export function notifyTeachers(
  schoolId: string,
  teacherIds: string[],
  titleEn: string,
  titleRw: string,
  contentEn: string,
  contentRw: string,
  relatedEntityId?: string
): void {
  const users = db.getUsers(schoolId);
  for (const teacherId of Array.from(new Set(teacherIds))) {
    const user = users.find(item => item.id === teacherId);
    if (user) queueAcademicNotification(schoolId, user.id, user.fullName, titleEn, titleRw, contentEn, contentRw, relatedEntityId);
  }
}

export function notifyParentsAndStudents(
  schoolId: string,
  studentId: string,
  studentName: string,
  titleEn: string,
  titleRw: string,
  contentEn: string,
  contentRw: string,
  relatedEntityId?: string
): void {
  const recipients = db.getUsers(schoolId).filter(
    user => user.studentId === studentId || user.linkedStudentIds?.includes(studentId)
  );
  for (const user of recipients) {
    queueAcademicNotification(schoolId, user.id, user.fullName, titleEn, titleRw, contentEn, contentRw, relatedEntityId);
  }
  void studentName;
}

export function attendanceSummary(schoolId: string, classId: string, term?: AcademicTerm) {
  let records = db.getAttendance(schoolId, undefined, classId);
  if (term?.startDate) records = records.filter(record => record.date >= term.startDate!);
  if (term?.endDate) records = records.filter(record => record.date <= term.endDate!);
  const present = records.filter(record => ['PRESENT', 'LATE'].includes(record.status)).length;
  return { present, total: records.length };
}
