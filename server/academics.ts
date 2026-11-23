/**
 * Academic management API: configuration, marks entry, calculations,
 * review/approval workflow and academic dashboards.
 */
import type { Express, Request, Response } from 'express';
import {
  AcademicClass,
  AcademicSettings,
  AcademicTerm,
  AcademicYear,
  Subject,
  ClassSubjectAssignment,
  AssessmentCategory,
  GradingScale,
  MarkAttendanceStatus,
  MarkEntry,
  MarkSubmission,
  ReportCard,
  ReportDistribution,
  UserProfile
} from '../src/types';
import { db } from './database';
import { hasPermission, PermissionError } from './permissions';
import {
  HttpError,
  addHistory,
  assertTeacherAssignment,
  calculateClassResults,
  canGenerateReports,
  canPublishReports,
  canReviewMarks,
  ensureSubmission,
  generateReportCards,
  getAcademicYear,
  getAssignments,
  getCategories,
  getClassStudents,
  getMarks,
  getScale,
  getSettings,
  getSubmission,
  getTerm,
  isAcademicLeader,
  isAcademicManager,
  notifySubmissionDeadlines,
  notifyTeachers,
  requireActor,
  round,
  scopedSchoolId,
  uid,
  updateSettings
} from './academicCore';

type AsyncHandler = (req: Request, res: Response) => void | Promise<void>;

function wrap(handler: AsyncHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof PermissionError) {
        res.status(403).json({ error: error.message });
        return;
      }
      console.error('Academic API error:', error);
      res.status(500).json({ error: 'Academic request failed.' });
    }
  };
}

function actorOf(req: Request): UserProfile {
  return requireActor(req.user);
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function str(value: unknown, field: string, required = true): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!required && (value === undefined || value === null || value === '')) return '';
  throw new HttpError(400, `${field} is required.`);
}

function num(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new HttpError(400, `${field} must be a number.`);
  return parsed;
}

function optionalNum(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return num(value, field);
}

function requireManager(req: Request): UserProfile {
  const actor = actorOf(req);
  if (!isAcademicManager(actor)) {
    throw new HttpError(403, 'Only the Headteacher or an authorized academic administrator may do this.');
  }
  return actor;
}

function requireReviewer(req: Request): UserProfile {
  const actor = actorOf(req);
  if (!canReviewMarks(actor)) throw new HttpError(403, 'You are not authorized to review marks.');
  return actor;
}

function resolveScope(req: Request) {
  const schoolId = scopedSchoolId(req);
  const body = bodyOf(req);
  const year = getAcademicYear(schoolId, (req.query.yearId as string) || (body.yearId as string))
    ?? (() => { throw new HttpError(400, 'No academic year is configured.'); })();
  const term = getTerm(schoolId, (req.query.termId as string) || (body.termId as string), year.id)
    ?? (() => { throw new HttpError(400, 'No term is configured for the selected academic year.'); })();
  return { schoolId, year, term };
}

function submissionView(submission: MarkSubmission) {
  const schoolId = submission.schoolId;
  const subjects = db.getSubjects(schoolId);
  const teacher = db.getUserById(submission.teacherId);
  const classInfo = db.getClasses(schoolId).find(item => item.id === submission.classId);
  return {
    ...submission,
    subjectName: subjects.find(item => item.id === submission.subjectId)?.name ?? submission.subjectId,
    className: classInfo?.name ?? submission.classId,
    teacherName: teacher?.fullName ?? 'Unknown teacher'
  };
}

export function registerAcademicRoutes(app: Express): void {
  // ------------------------------------------------------------------
  // Academic structure configuration (Headteacher / academic administrator)
  // ------------------------------------------------------------------

  app.get('/api/academics/years', wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    res.json(db.getAcademicCollection<AcademicYear>('academicYears', schoolId));
  }));

  app.post('/api/academics/years', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const year: AcademicYear = {
      id: uid('ay'),
      schoolId,
      name: str(b.name, 'Academic year name'),
      startDate: typeof b.startDate === 'string' ? b.startDate : undefined,
      endDate: typeof b.endDate === 'string' ? b.endDate : undefined,
      isActive: b.isActive === true,
      createdAt: new Date().toISOString()
    };
    const years = db.getAcademicCollection<AcademicYear>('academicYears');
    if (years.some(item => item.schoolId === schoolId && item.name.toLowerCase() === year.name.toLowerCase())) {
      throw new HttpError(409, 'An academic year with this name already exists.');
    }
    if (year.isActive) years.forEach(item => { if (item.schoolId === schoolId) item.isActive = false; });
    years.unshift(year);
    db.saveAcademicCollection('academicYears', years);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_ACADEMIC_YEAR', 'ACADEMIC_YEAR', year.id, `Created academic year ${year.name}`);
    res.status(201).json(year);
  }));

  app.patch('/api/academics/years/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const updates: Partial<AcademicYear> = {};
    if (b.name !== undefined) updates.name = str(b.name, 'Academic year name');
    if (b.startDate !== undefined) updates.startDate = typeof b.startDate === 'string' ? b.startDate : undefined;
    if (b.endDate !== undefined) updates.endDate = typeof b.endDate === 'string' ? b.endDate : undefined;
    if (b.isActive === true) updates.isActive = true;
    if (b.isActive === false) updates.isActive = false;
    const years = db.getAcademicCollection<AcademicYear>('academicYears');
    if (updates.isActive) years.forEach(item => { if (item.schoolId === schoolId) item.isActive = false; });
    db.saveAcademicCollection('academicYears', years);
    const updated = db.updateAcademicRecord<AcademicYear>('academicYears', req.params.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Academic year not found.');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_ACADEMIC_YEAR', 'ACADEMIC_YEAR', updated.id, `Updated academic year ${updated.name}`);
    res.json(updated);
  }));

  app.get('/api/academics/terms', wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    const yearId = req.query.yearId as string | undefined;
    let terms = db.getAcademicCollection<AcademicTerm>('terms', schoolId);
    if (yearId) terms = terms.filter(term => term.academicYearId === yearId);
    res.json(terms);
  }));

  app.post('/api/academics/terms', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const term: AcademicTerm = {
      id: uid('term'),
      schoolId,
      academicYearId: str(b.academicYearId ?? b.yearId, 'Academic year'),
      name: str(b.name, 'Term name'),
      startDate: typeof b.startDate === 'string' ? b.startDate : undefined,
      endDate: typeof b.endDate === 'string' ? b.endDate : undefined,
      isActive: b.isActive === true,
      createdAt: new Date().toISOString()
    };
    const terms = db.getAcademicCollection<AcademicTerm>('terms');
    if (terms.some(item => item.schoolId === schoolId && item.academicYearId === term.academicYearId && item.name.toLowerCase() === term.name.toLowerCase())) {
      throw new HttpError(409, 'A term with this name already exists in the academic year.');
    }
    if (term.isActive) terms.forEach(item => { if (item.schoolId === schoolId) item.isActive = false; });
    terms.unshift(term);
    db.saveAcademicCollection('terms', terms);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_TERM', 'TERM', term.id, `Created ${term.name}`);
    res.status(201).json(term);
  }));

  app.patch('/api/academics/terms/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const updates: Partial<AcademicTerm> = {};
    if (b.name !== undefined) updates.name = str(b.name, 'Term name');
    if (b.startDate !== undefined) updates.startDate = typeof b.startDate === 'string' ? b.startDate : undefined;
    if (b.endDate !== undefined) updates.endDate = typeof b.endDate === 'string' ? b.endDate : undefined;
    if (typeof b.isActive === 'boolean') updates.isActive = b.isActive;
    const terms = db.getAcademicCollection<AcademicTerm>('terms');
    if (updates.isActive) terms.forEach(item => { if (item.schoolId === schoolId) item.isActive = false; });
    db.saveAcademicCollection('terms', terms);
    const updated = db.updateAcademicRecord<AcademicTerm>('terms', req.params.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Term not found.');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_TERM', 'TERM', updated.id, `Updated ${updated.name}`);
    res.json(updated);
  }));

  app.post('/api/academics/classes', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const name = str(b.name, 'Class name');
    if (db.getClasses(schoolId).some(item => item.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'A class with this name already exists.');
    }
    const record: AcademicClass = {
      id: uid('class'),
      schoolId,
      name,
      grade: str(b.grade, 'Grade', false),
      stream: str(b.stream, 'Stream', false),
      combination: str(b.combination, 'Combination', false),
      classTeacherName: str(b.classTeacherName, 'Class teacher', false),
      room: str(b.room, 'Room', false),
      studentCount: 0
    };
    db.addClass(record);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_CLASS', 'ACADEMIC_CLASS', record.id, `Created class ${record.name}`);
    res.status(201).json(record);
  }));

  app.post('/api/academics/subjects', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const name = str(b.name, 'Subject name');
    const code = str(b.code, 'Subject code').toUpperCase();
    if (db.getSubjects(schoolId).some(item => item.code.toUpperCase() === code || item.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'A subject with this name or code already exists.');
    }
    const record: Subject = {
      id: uid('subj'),
      schoolId,
      name,
      code,
      department: str(b.department, 'Department', false),
      credits: optionalNum(b.credits, 'Credits') ?? 0,
      passMark: optionalNum(b.passMark, 'Pass mark') ?? getScale(schoolId)?.passMark ?? 50
    };
    db.addSubject(record);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_SUBJECT', 'SUBJECT', record.id, `Created subject ${record.name} (${record.code})`);
    res.status(201).json(record);
  }));

  // Teacher directory for assignment screens. This avoids exposing /api/users,
  // which is intentionally limited to school-owner administration.
  app.get('/api/academics/teachers', wrap((req, res) => {
    const actor = actorOf(req);
    if (!isAcademicManager(actor) && !canReviewMarks(actor) && !canPublishReports(actor)) {
      throw new HttpError(403, 'You are not authorized to view the academic teacher directory.');
    }
    const schoolId = scopedSchoolId(req);
    const teachingRoles: UserProfile['role'][] = ['TEACHER', 'DEPUTY_HEAD', 'HEAD_TEACHER'];
    res.json(db.getUsers(schoolId)
      .filter(user => teachingRoles.includes(user.role))
      .map(user => ({ id: user.id, fullName: user.fullName, role: user.role, email: user.email })));
  }));

  app.get('/api/academics/assignments', wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    res.json(getAssignments(
      schoolId,
      req.query.yearId as string,
      req.query.termId as string,
      req.query.classId as string,
      req.query.subjectId as string
    ));
  }));

  app.post('/api/academics/assignments', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const assignment = {
      id: uid('csa'),
      schoolId,
      academicYearId: str(b.academicYearId ?? b.yearId, 'Academic year'),
      termId: str(b.termId, 'Term'),
      classId: str(b.classId, 'Class'),
      subjectId: str(b.subjectId, 'Subject'),
      teacherIds: Array.isArray(b.teacherIds) ? b.teacherIds.filter((id): id is string => typeof id === 'string') : [],
      isActive: b.isActive !== false,
      createdAt: new Date().toISOString()
    };
    if (!db.getClasses(schoolId).some(item => item.id === assignment.classId)) throw new HttpError(400, 'Unknown class.');
    if (!db.getSubjects(schoolId).some(item => item.id === assignment.subjectId)) throw new HttpError(400, 'Unknown subject.');
    const existing = getAssignments(schoolId, assignment.academicYearId, assignment.termId, assignment.classId, assignment.subjectId)[0];
    if (existing) {
      const updated = db.updateAcademicRecord<ClassSubjectAssignment>('classSubjectAssignments', existing.id, schoolId, {
        teacherIds: assignment.teacherIds,
        isActive: assignment.isActive
      });
      const added = assignment.teacherIds.filter(id => !existing.teacherIds.includes(id));
      notifyTeachers(schoolId, added,
        'New subject assignment', 'Ishyirwa mu masomo yigishwa',
        `You have been assigned to teach a subject in the selected class and term.`,
        `Washyizwe mu kwigisha isomo muri iryo tsinda n'igihembwe.`, existing.id);
      db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_TEACHER_ASSIGNMENT', 'CLASS_SUBJECT_ASSIGNMENT', existing.id, `Updated teachers for ${assignment.classId}/${assignment.subjectId}`);
      res.json(updated);
      return;
    }
    db.addAcademicRecord('classSubjectAssignments', assignment);
    notifyTeachers(schoolId, assignment.teacherIds,
      'New subject assignment', 'Ishyirwa mu masomo yigishwa',
      `You have been assigned to teach a subject in the selected class and term.`,
      `Washyizwe mu kwigisha isomo muri iryo tsinda n'igihembwe.`);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'ASSIGN_TEACHER_SUBJECT', 'CLASS_SUBJECT_ASSIGNMENT', assignment.id, `Assigned ${assignment.teacherIds.length} teacher(s)`);
    res.status(201).json(assignment);
  }));

  app.patch('/api/academics/assignments/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const existing = db.getAcademicCollection<ClassSubjectAssignment>('classSubjectAssignments', schoolId)
      .find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Assignment not found.');
    const updates: Record<string, unknown> = {};
    if (Array.isArray(b.teacherIds)) updates.teacherIds = b.teacherIds.filter((id): id is string => typeof id === 'string');
    if (typeof b.isActive === 'boolean') updates.isActive = b.isActive;
    const updated = db.updateAcademicRecord('classSubjectAssignments', req.params.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Assignment not found.');
    const added = Array.isArray(updates.teacherIds)
      ? (updates.teacherIds as string[]).filter(id => !existing.teacherIds.includes(id)) : [];
    notifyTeachers(schoolId, added,
      'New subject assignment', 'Ishyirwa mu masomo yigishwa',
      `You have been assigned to teach a subject in the selected class and term.`,
      `Washyizwe mu kwigisha isomo muri iryo tsinda n'igihembwe.`, existing.id);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_TEACHER_ASSIGNMENT', 'CLASS_SUBJECT_ASSIGNMENT', updated.id, 'Updated class/subject assignment');
    res.json(updated);
  }));

  app.get('/api/academics/class-teachers', wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    res.json(db.getAcademicCollection('classTeacherAssignments', schoolId).filter(
      item => !req.query.yearId || (item as { academicYearId?: string }).academicYearId === req.query.yearId
    ));
  }));

  app.post('/api/academics/class-teachers', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const assignment = {
      id: uid('cta'),
      schoolId,
      academicYearId: str(b.academicYearId ?? b.yearId, 'Academic year'),
      classId: str(b.classId, 'Class'),
      teacherId: str(b.teacherId, 'Teacher'),
      createdAt: new Date().toISOString()
    };
    const list = db.getAcademicCollection('classTeacherAssignments');
    if (!list.some(item => {
      const record = item as { schoolId: string; academicYearId: string; classId: string; teacherId: string };
      return record.schoolId === schoolId && record.academicYearId === assignment.academicYearId &&
        record.classId === assignment.classId && record.teacherId === assignment.teacherId;
    })) {
      list.unshift(assignment);
      db.saveAcademicCollection('classTeacherAssignments', list);
    }
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'ASSIGN_CLASS_TEACHER', 'CLASS_TEACHER_ASSIGNMENT', assignment.id, `Assigned class teacher for ${assignment.classId}`);
    res.status(201).json(assignment);
  }));

  app.get('/api/academics/assessment-categories', wrap((req, res) => {
    res.json(getCategories(scopedSchoolId(req)));
  }));

  app.post('/api/academics/assessment-categories', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const maxMarks = num(b.maxMarks, 'Maximum marks');
    const weight = num(b.weightPercentage, 'Weight percentage');
    if (maxMarks <= 0 || weight < 0) throw new HttpError(400, 'Marks and weight must be positive.');
    const categories = getCategories(schoolId);
    if (categories.length >= 12) throw new HttpError(400, 'A maximum of 12 assessment categories is supported.');
    const category: AssessmentCategory = {
      id: uid('ac'),
      schoolId,
      code: str(b.code, 'Category code').toUpperCase(),
      name: str(b.name, 'Category name'),
      maxMarks,
      weightPercentage: weight,
      sortOrder: categories.length + 1,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    const all = db.getAcademicCollection<AssessmentCategory>('assessmentCategories');
    if (all.some(item => item.schoolId === schoolId && item.code === category.code && item.isActive)) {
      throw new HttpError(409, 'An active category with this code already exists.');
    }
    all.unshift(category);
    db.saveAcademicCollection('assessmentCategories', all);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_ASSESSMENT_CATEGORY', 'ASSESSMENT_CATEGORY', category.id, `Created ${category.name} (${maxMarks} marks, ${weight}%)`);
    res.status(201).json(category);
  }));

  app.patch('/api/academics/assessment-categories/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const updates: Partial<AssessmentCategory> = {};
    if (b.name !== undefined) updates.name = str(b.name, 'Category name');
    if (b.maxMarks !== undefined) updates.maxMarks = num(b.maxMarks, 'Maximum marks');
    if (b.weightPercentage !== undefined) updates.weightPercentage = num(b.weightPercentage, 'Weight percentage');
    if (b.sortOrder !== undefined) updates.sortOrder = num(b.sortOrder, 'Sort order');
    if (typeof b.isActive === 'boolean') updates.isActive = b.isActive;
    const updated = db.updateAcademicRecord<AssessmentCategory>('assessmentCategories', req.params.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Assessment category not found.');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_ASSESSMENT_CATEGORY', 'ASSESSMENT_CATEGORY', updated.id, `Updated ${updated.name}`);
    res.json(updated);
  }));

  app.get('/api/academics/grading-scales', wrap((req, res) => {
    res.json(db.getAcademicCollection<GradingScale>('gradingScales', scopedSchoolId(req)));
  }));

  app.post('/api/academics/grading-scales', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const boundaries = b.gradeBoundaries;
    if (!Array.isArray(boundaries) || boundaries.length === 0) throw new HttpError(400, 'At least one grade boundary is required.');
    const scale: GradingScale = {
      id: uid('gs'),
      schoolId,
      name: str(b.name, 'Grading scale name'),
      passMark: num(b.passMark, 'Pass mark'),
      gradeBoundaries: boundaries.map((entry: Record<string, unknown>) => ({
        grade: str(entry.grade, 'Grade'),
        minPercentage: num(entry.minPercentage, 'Minimum percentage'),
        maxPercentage: num(entry.maxPercentage, 'Maximum percentage'),
        description: str(entry.description, 'Grade description'),
        descriptionRw: typeof entry.descriptionRw === 'string' ? entry.descriptionRw : undefined
      })),
      isActive: true,
      createdAt: new Date().toISOString()
    };
    db.addAcademicRecord('gradingScales', scale);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_GRADING_SCALE', 'GRADING_SCALE', scale.id, `Created ${scale.name}`);
    res.status(201).json(scale);
  }));

  app.patch('/api/academics/grading-scales/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const updates: Partial<GradingScale> = {};
    if (b.name !== undefined) updates.name = str(b.name, 'Grading scale name');
    if (b.passMark !== undefined) updates.passMark = num(b.passMark, 'Pass mark');
    if (Array.isArray(b.gradeBoundaries)) {
      updates.gradeBoundaries = b.gradeBoundaries.map((entry: Record<string, unknown>) => ({
        grade: str(entry.grade, 'Grade'),
        minPercentage: num(entry.minPercentage, 'Minimum percentage'),
        maxPercentage: num(entry.maxPercentage, 'Maximum percentage'),
        description: str(entry.description, 'Grade description'),
        descriptionRw: typeof entry.descriptionRw === 'string' ? entry.descriptionRw : undefined
      }));
    }
    if (typeof b.isActive === 'boolean') updates.isActive = b.isActive;
    const updated = db.updateAcademicRecord<GradingScale>('gradingScales', req.params.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Grading scale not found.');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_GRADING_SCALE', 'GRADING_SCALE', updated.id, `Updated ${updated.name}`);
    res.json(updated);
  }));

  app.get('/api/academics/settings', wrap((req, res) => {
    const settings = getSettings(scopedSchoolId(req));
    res.json({ ...settings, activeScale: getScale(scopedSchoolId(req), settings) });
  }));

  app.patch('/api/academics/settings', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const updates: Partial<AcademicSettings> = {};
    if (b.academicYearId !== undefined) updates.academicYearId = str(b.academicYearId, 'Academic year');
    if (b.termId !== undefined) updates.termId = str(b.termId, 'Term');
    if (b.gradingScaleId !== undefined) updates.gradingScaleId = str(b.gradingScaleId, 'Grading scale');
    if (typeof b.enableRanking === 'boolean') updates.enableRanking = b.enableRanking;
    if (typeof b.enablePromotionDecision === 'boolean') updates.enablePromotionDecision = b.enablePromotionDecision;
    if (typeof b.allowSelfApproval === 'boolean') updates.allowSelfApproval = b.allowSelfApproval;
    if (typeof b.commentsRequiredBeforeApproval === 'boolean') updates.commentsRequiredBeforeApproval = b.commentsRequiredBeforeApproval;
    if (b.submissionDeadlineDays !== undefined) updates.submissionDeadlineDays = optionalNum(b.submissionDeadlineDays, 'Submission deadline days');
    if (b.promotionPassAverage !== undefined) updates.promotionPassAverage = num(b.promotionPassAverage, 'Promotion pass average');
    res.json(updateSettings(schoolId, updates, actor));
  }));

  // ------------------------------------------------------------------
  // Teacher workspace
  // ------------------------------------------------------------------

  app.get('/api/academics/my-assignments', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    notifySubmissionDeadlines(schoolId);
    const year = getAcademicYear(schoolId, req.query.yearId as string);
    const term = getTerm(schoolId, req.query.termId as string, year?.id);
    const assignments = getAssignments(schoolId, year?.id, term?.id)
      .filter(item => item.teacherIds.includes(actor.id));
    const classTeacherOf = db.getAcademicCollection<{ classId: string; teacherId: string }>('classTeacherAssignments', schoolId)
      .filter(item => item.teacherId === actor.id).map(item => item.classId);
    const subjects = db.getSubjects(schoolId);
    const classes = db.getClasses(schoolId);
    res.json({
      year,
      term,
      assignments: assignments.map(item => ({
        ...item,
        subjectName: subjects.find(subject => subject.id === item.subjectId)?.name ?? item.subjectId,
        subjectCode: subjects.find(subject => subject.id === item.subjectId)?.code ?? '',
        className: classes.find(classInfo => classInfo.id === item.classId)?.name ?? item.classId,
        status: getSubmission(schoolId, item.academicYearId, item.termId, item.classId, item.subjectId)?.status ?? 'DRAFT'
      })),
      classTeacherOf
    });
  }));

  app.get('/api/academics/marks-entry', wrap((req, res) => {
    const actor = actorOf(req);
    const { schoolId, year, term } = resolveScope(req);
    const classId = str(req.query.classId, 'Class');
    const subjectId = str(req.query.subjectId, 'Subject');
    assertTeacherAssignment(actor, schoolId, year.id, term.id, classId, subjectId);
    const submission = getSubmission(schoolId, year.id, term.id, classId, subjectId) ?? null;
    const students = getClassStudents(schoolId, classId);
    const marks = getMarks(schoolId, year.id, term.id, classId, subjectId);
    const results = calculateClassResults(schoolId, year.id, term.id, classId, [subjectId]);
    res.json({
      year,
      term,
      classInfo: db.getClasses(schoolId).find(item => item.id === classId),
      subject: db.getSubjects(schoolId).find(item => item.id === subjectId),
      categories: getCategories(schoolId),
      students: students.map(student => ({
        ...student,
        result: results.students.find(item => item.studentId === student.id)
      })),
      marks,
      submission,
      missing: results.missing.filter(item => item.subjectId === subjectId),
      canEdit: !submission || submission.status === 'DRAFT' || submission.status === 'RETURNED',
      isComplete: results.missing.length === 0
    });
  }));

  app.post('/api/academics/marks/save', wrap((req, res) => {
    const actor = actorOf(req);
    if (!hasPermission(actor, 'marks.write') && !isAcademicLeader(actor)) {
      throw new HttpError(403, 'You are not permitted to enter marks.');
    }
    const { schoolId, year, term } = resolveScope(req);
    const b = bodyOf(req);
    const classId = str(b.classId, 'Class');
    const subjectId = str(b.subjectId, 'Subject');
    assertTeacherAssignment(actor, schoolId, year.id, term.id, classId, subjectId);
    const submission = getSubmission(schoolId, year.id, term.id, classId, subjectId);
    if (submission && ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(submission.status)) {
      throw new HttpError(409, 'These marks are locked. Request a return or reopening before editing.');
    }
    const entries = b.marks;
    if (!Array.isArray(entries)) throw new HttpError(400, 'Marks array is required.');
    const categories = getCategories(schoolId);
    const students = getClassStudents(schoolId, classId);
    const currentMarks = getMarks(schoolId, year.id, term.id, classId, subjectId);
    const now = new Date().toISOString();
    const updates = new Map<string, MarkEntry>();

    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Invalid mark entry.');
      const entry = raw as Record<string, unknown>;
      const studentId = str(entry.studentId, 'Student');
      const categoryId = str(entry.categoryId, 'Assessment category');
      if (!students.some(student => student.id === studentId)) throw new HttpError(403, 'Student is not registered in this class.');
      const category = categories.find(item => item.id === categoryId);
      if (!category) throw new HttpError(400, 'Unknown or inactive assessment category.');
      const status: MarkAttendanceStatus = entry.attendanceStatus === 'ABSENT' || entry.attendanceStatus === 'EXCUSED'
        ? entry.attendanceStatus : 'PRESENT';
      let score: number | null = null;
      if (entry.score !== null && entry.score !== undefined && entry.score !== '') {
        score = num(entry.score, 'Score');
        if (score < 0 || score > category.maxMarks) {
          throw new HttpError(400, `${category.name} maximum is ${category.maxMarks}. Entered value is invalid.`);
        }
      }
      if (score === null && status === 'PRESENT') {
        // A blank mark is stored as null so the system can report it as missing.
        // It is never silently converted into a passing value.
      }
      const key = `${studentId}:${categoryId}`;
      const existing = currentMarks.find(item => item.studentId === studentId && item.categoryId === categoryId);
      updates.set(key, {
        id: existing?.id ?? uid('mark'),
        schoolId,
        academicYearId: year.id,
        termId: term.id,
        classId,
        subjectId,
        studentId,
        categoryId,
        score,
        attendanceStatus: status,
        remark: typeof entry.remark === 'string' ? entry.remark.slice(0, 1000) : undefined,
        updatedBy: actor.id,
        updatedAt: now
      });
    }

    const allMarks = db.getAcademicCollection<MarkEntry>('marks');
    const marksBeforeSubmit = structuredClone(allMarks);
    for (const record of updates.values()) {
      const index = allMarks.findIndex(item => item.id === record.id || (
        item.schoolId === schoolId && item.academicYearId === record.academicYearId &&
        item.termId === record.termId && item.classId === classId && item.subjectId === subjectId &&
        item.studentId === record.studentId && item.categoryId === record.categoryId
      ));
      if (index === -1) allMarks.push(record);
      else allMarks[index] = { ...allMarks[index], ...record, id: allMarks[index].id };
    }
    const action = b.action === 'SUBMIT' ? 'SUBMIT' : 'DRAFT';
    db.saveAcademicCollection('marks', allMarks);

    // Validate against the newly saved marks. If the submission is rejected,
    // restore the exact previous snapshot so a failed SUBMIT cannot leave
    // partial marks behind while the submission stays in DRAFT/RETURNED.
    if (action === 'SUBMIT') {
      try {
        const calculated = calculateClassResults(schoolId, year.id, term.id, classId, [subjectId]);
        if (calculated.missing.length > 0) {
          throw new HttpError(400, `Complete all marks before submitting. ${calculated.missing.length} mark(s) missing.`);
        }
      } catch (error) {
        db.saveAcademicCollection('marks', marksBeforeSubmit);
        throw error;
      }
    }
    const current = ensureSubmission(schoolId, year.id, term.id, classId, subjectId, actor);
    const updated = db.updateAcademicRecord<MarkSubmission>('markSubmissions', current.id, schoolId, {
      status: action === 'SUBMIT' ? 'SUBMITTED' : 'DRAFT',
      teacherId: current.teacherId,
      submittedAt: action === 'SUBMIT' ? now : undefined,
      updatedAt: now,
      history: addHistory({
        action: action === 'SUBMIT' ? 'MARKS_SUBMITTED' : 'DRAFT_SAVED',
        by: actor.id, byName: actor.fullName, role: actor.role, at: now,
        note: `${updates.size} mark(s) ${action === 'SUBMIT' ? 'submitted' : 'saved'}`
      }, current.history)
    });
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role,
      action === 'SUBMIT' ? 'SUBMIT_MARKS' : 'SAVE_MARKS_DRAFT', 'MARK_SUBMISSION', current.id,
      `${action === 'SUBMIT' ? 'Submitted' : 'Saved'} marks for ${classId}/${subjectId}`);

    if (action === 'SUBMIT') {
      const reviewers = db.getUsers(schoolId).filter(user => canReviewMarks(user) && user.id !== actor.id);
      notifyTeachers(schoolId, reviewers.map(user => user.id),
        'Marks submitted for review', 'Amanota yatanzwe kugenzurwa',
        'New marks are waiting for academic review.', 'Amanota nshya irategereje kugenzurwa.', current.id);
    }
    res.json({ saved: updates.size, submission: updated });
  }));

  // ------------------------------------------------------------------
  // Review, approval and results
  // ------------------------------------------------------------------

  app.get('/api/academics/submissions', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    let list = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId);
    if (!isAcademicManager(actor) && !canReviewMarks(actor)) {
      list = list.filter(item => item.teacherId === actor.id);
    }
    const status = req.query.status as string | undefined;
    if (status) list = list.filter(item => item.status === status);
    const yearId = req.query.yearId as string | undefined;
    if (yearId) list = list.filter(item => item.academicYearId === yearId);
    const termId = req.query.termId as string | undefined;
    if (termId) list = list.filter(item => item.termId === termId);
    res.json(list.map(submissionView).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }));

  app.get('/api/academics/submissions/:id', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (submission.teacherId !== actor.id && !canReviewMarks(actor) && !isAcademicManager(actor)) {
      throw new HttpError(403, 'You cannot view this submission.');
    }
    res.json(submissionView(submission));
  }));

  app.post('/api/academics/submissions/:id/submit', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (submission.teacherId !== actor.id && !isAcademicManager(actor)) throw new HttpError(403, 'Only the assigned teacher may submit these marks.');
    if (!['DRAFT', 'RETURNED'].includes(submission.status)) throw new HttpError(409, 'Only draft or returned marks can be submitted.');
    const calculated = calculateClassResults(schoolId, submission.academicYearId, submission.termId, submission.classId, [submission.subjectId]);
    if (calculated.missing.length > 0) throw new HttpError(400, `Complete ${calculated.missing.length} missing mark(s) before submitting.`);
    const now = new Date().toISOString();
    const updated = db.updateAcademicRecord<MarkSubmission>('markSubmissions', submission.id, schoolId, {
      status: 'SUBMITTED', submittedAt: now, updatedAt: now,
      history: addHistory({ action: 'MARKS_SUBMITTED', by: actor.id, byName: actor.fullName, role: actor.role, at: now }, submission.history)
    });
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'SUBMIT_MARKS', 'MARK_SUBMISSION', submission.id, 'Submitted marks for review');
    notifyTeachers(schoolId, db.getUsers(schoolId).filter(user => canReviewMarks(user)).map(user => user.id),
      'Marks ready for review', 'Amanota irategereje kugenzurwa', '', '', submission.id);
    res.json(updated);
  }));

  app.post('/api/academics/submissions/:id/return', wrap((req, res) => {
    const reviewer = requireReviewer(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(submission.status)) throw new HttpError(409, 'Only submitted marks can be returned.');
    const reason = str(bodyOf(req).reason, 'Reason for return');
    const now = new Date().toISOString();
    const updated = db.updateAcademicRecord<MarkSubmission>('markSubmissions', submission.id, schoolId, {
      status: 'RETURNED', returnedAt: now, reviewedAt: now, reviewedBy: reviewer.id,
      reviewedByName: reviewer.fullName, correctionReason: reason, updatedAt: now,
      history: addHistory({ action: 'RETURNED_FOR_CORRECTION', by: reviewer.id, byName: reviewer.fullName, role: reviewer.role, at: now, note: reason }, submission.history)
    });
    db.logAudit(schoolId, reviewer.id, reviewer.fullName, reviewer.role, 'RETURN_MARKS', 'MARK_SUBMISSION', submission.id, reason);
    notifyTeachers(schoolId, [submission.teacherId],
      'Marks returned for correction', 'Amanota yasubijwe kugirango ihindurwe',
      `Your marks submission was returned: ${reason}`, `Amanota yawe yasubijwe: ${reason}`, submission.id);
    res.json(updated);
  }));

  app.post('/api/academics/submissions/:id/approve', wrap((req, res) => {
    const reviewer = requireReviewer(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(submission.status)) throw new HttpError(409, 'Only submitted marks can be approved.');
    const settings = getSettings(schoolId);
    if (submission.teacherId === reviewer.id && !settings.allowSelfApproval) {
      throw new HttpError(403, 'You cannot approve your own marks. School policy has not enabled self-approval.');
    }
    const calculated = calculateClassResults(schoolId, submission.academicYearId, submission.termId, submission.classId, [submission.subjectId]);
    if (calculated.missing.length > 0) throw new HttpError(400, 'Incomplete marks cannot be approved.');
    const notes = typeof bodyOf(req).notes === 'string' ? String(bodyOf(req).notes).trim() : '';
    if (settings.commentsRequiredBeforeApproval && notes.length === 0) {
      throw new HttpError(400, 'School policy requires a review comment before approval.');
    }
    const now = new Date().toISOString();
    const updated = db.updateAcademicRecord<MarkSubmission>('markSubmissions', submission.id, schoolId, {
      status: 'APPROVED', approvedAt: now, approvedBy: reviewer.id, reviewedAt: now,
      reviewedBy: reviewer.id, reviewedByName: reviewer.fullName,
      reviewNotes: notes || undefined,
      updatedAt: now,
      history: addHistory({ action: 'APPROVED', by: reviewer.id, byName: reviewer.fullName, role: reviewer.role, at: now, note: notes || undefined }, submission.history)
    });
    const year = db.getAcademicCollection<AcademicYear>('academicYears', schoolId).find(item => item.id === submission.academicYearId);
    const term = db.getAcademicCollection<AcademicTerm>('terms', schoolId).find(item => item.id === submission.termId);
    let generated = 0;
    if (year && term && canGenerateReports(reviewer)) {
      generated = generateReportCards(schoolId, year, term, submission.classId, reviewer).cards.length;
    }
    db.logAudit(schoolId, reviewer.id, reviewer.fullName, reviewer.role, 'APPROVE_MARKS', 'MARK_SUBMISSION', submission.id, `Approved marks; generated ${generated} report card(s)`);
    notifyTeachers(schoolId, [submission.teacherId], 'Marks approved', 'Amanota yemewe', 'Your marks submission was approved.', 'Amanota yawe yemewe.', submission.id);
    res.json({ submission: updated, generatedReportCards: generated });
  }));

  app.post('/api/academics/submissions/:id/reopen', wrap((req, res) => {
    const reviewer = requireReviewer(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (submission.status !== 'APPROVED') throw new HttpError(409, 'Only approved marks can be reopened.');
    const reason = str(bodyOf(req).reason, 'Reason for reopening');
    const now = new Date().toISOString();
    const updated = db.updateAcademicRecord<MarkSubmission>('markSubmissions', submission.id, schoolId, {
      status: 'RETURNED', correctionReason: reason, updatedAt: now,
      history: addHistory({ action: 'REOPENED_AFTER_APPROVAL', by: reviewer.id, byName: reviewer.fullName, role: reviewer.role, at: now, note: reason }, submission.history)
    });
    const cards = db.getReportCards(schoolId).filter(card => card.sourceSubmissionIds?.includes(submission.id));
    const distributions = db.getAcademicCollection<ReportDistribution>('reportDistributions', schoolId);
    for (const card of cards) {
      db.updateReportCard(schoolId, card.id, {
        isApproved: false,
        publishedAt: undefined,
        publishedBy: undefined,
        status: 'DRAFT'
      });
      const distribution = distributions.find(item => item.reportCardId === card.id);
      if (distribution && distribution.status !== 'GENERATED') {
        db.updateAcademicRecord<ReportDistribution>('reportDistributions', distribution.id, schoolId, {
          status: 'GENERATED',
          printedAt: undefined,
          issuedAt: undefined,
          issuedToName: undefined,
          issuedToRelationship: undefined,
          collectedAt: undefined,
          collectedByName: undefined,
          updatedAt: now,
          history: addHistory({
            action: 'REOPENED', by: reviewer.id, byName: reviewer.fullName, role: reviewer.role, at: now, note: reason
          }, distribution.history)
        });
        db.logAudit(schoolId, reviewer.id, reviewer.fullName, reviewer.role, 'RESET_REPORT_DISTRIBUTION',
          'REPORT_DISTRIBUTION', distribution.id, `Reopened marks invalidated distribution for ${card.studentName}`);
      }
    }
    db.logAudit(schoolId, reviewer.id, reviewer.fullName, reviewer.role, 'REOPEN_APPROVED_MARKS', 'MARK_SUBMISSION', submission.id, reason);
    notifyTeachers(schoolId, [submission.teacherId], 'Approved marks reopened', 'Amanota yemewe yongeye gufungurwa', reason, reason, submission.id);
    res.json({ submission: updated, unpublishedReportCards: cards.length });
  }));

  app.get('/api/academics/results', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    const year = getAcademicYear(schoolId, req.query.yearId as string);
    const term = getTerm(schoolId, req.query.termId as string, year?.id);
    const classId = str(req.query.classId, 'Class');
    if (!year || !term) throw new HttpError(400, 'Select an academic year and term.');
    if (!isAcademicManager(actor) && !canReviewMarks(actor)) {
      assertTeacherAssignment(actor, schoolId, year.id, term.id, classId, str(req.query.subjectId, 'Subject'));
    }
    const subjectId = req.query.subjectId as string | undefined;
    res.json(calculateClassResults(schoolId, year.id, term.id, classId, subjectId ? [subjectId] : undefined));
  }));

  app.get('/api/academics/dashboard', wrap((req, res) => {
    const actor = actorOf(req);
    const schoolId = scopedSchoolId(req);
    notifySubmissionDeadlines(schoolId);
    const year = getAcademicYear(schoolId, req.query.yearId as string);
    const term = getTerm(schoolId, req.query.termId as string, year?.id);
    const submissions = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId)
      .filter(item => (!year || item.academicYearId === year.id) && (!term || item.termId === term.id));
    const visible = isAcademicManager(actor) || canReviewMarks(actor)
      ? submissions : submissions.filter(item => item.teacherId === actor.id);
    const assignments = getAssignments(schoolId, year?.id, term?.id);
    const teacherAssignments = assignments.filter(item => item.teacherIds.includes(actor.id));
    const published = db.getReportCards(schoolId, undefined, { publishedOnly: true });
    const classAverages = db.getClasses(schoolId).map(classInfo => ({
      classId: classInfo.id,
      className: classInfo.name,
      average: calculateClassResults(schoolId, year?.id ?? '', term?.id ?? '', classInfo.id).classAverage
    }));
    const notSubmitted = assignments
      .map(item => ({
        assignment: item,
        submission: getSubmission(schoolId, item.academicYearId, item.termId, item.classId, item.subjectId)
      }))
      .filter(({ submission }) => !submission || ['DRAFT', 'RETURNED'].includes(submission.status))
      .map(({ assignment: item, submission }) => submission ? submissionView(submission) : submissionView({
        id: `missing-${item.id}`,
        schoolId,
        academicYearId: item.academicYearId,
        termId: item.termId,
        classId: item.classId,
        subjectId: item.subjectId,
        teacherId: item.teacherIds[0] ?? '',
        status: 'DRAFT',
        history: [],
        createdAt: item.createdAt,
        updatedAt: item.createdAt
      }));
    res.json({
      totals: {
        assignments: assignments.length,
        myAssignments: teacherAssignments.length,
        draft: visible.filter(item => item.status === 'DRAFT').length,
        submitted: visible.filter(item => item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW').length,
        approved: visible.filter(item => item.status === 'APPROVED').length,
        returned: visible.filter(item => item.status === 'RETURNED').length,
        publishedReports: published.length,
        incompleteReports: db.getReportCards(schoolId).filter(card => !card.isApproved || !card.publishedAt).length
      },
      submissions: visible.map(submissionView),
      notSubmitted,
      classAverages,
      year,
      term
    });
  }));

}
