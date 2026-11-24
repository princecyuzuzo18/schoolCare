/**
 * Academic management API: configuration, marks entry, calculations,
 * review/approval workflow and academic dashboards.
 */
import type { Express, Request, Response } from 'express';
import {
  AcademicClass,
  AcademicSettings,
  AcademicTerm,
  AcademicWorkflowEvent,
  AcademicYear,
  AcademicCombination,
  ClassLevel,
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

const MARKS_WORKSPACE_ROLES = new Set<UserProfile['role']>([
  'SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'
]);

function requireAcademicReader(req: Request): UserProfile {
  const actor = actorOf(req);
  if (
    !MARKS_WORKSPACE_ROLES.has(actor.role) ||
    (!hasPermission(actor, 'academics.read') && !isAcademicLeader(actor) && !canReviewMarks(actor))
  ) {
    throw new HttpError(403, 'You are not authorized to view academic marks data.');
  }
  return actor;
}

/** Resolves and validates the class/combination/level context of an assignment. */
function assignmentStructure(schoolId: string, classId: string, combinationId = '', levelId = '', strict = false) {
  const classInfo = db.getClasses(schoolId).find(item => item.id === classId);
  if (!classInfo) throw new HttpError(400, 'Unknown class.');
  if (strict && (classInfo.status ?? 'ACTIVE') === 'ARCHIVED') {
    throw new HttpError(400, 'Archived classes cannot receive new assignments.');
  }
  const combinations = db.getAcademicCollection<AcademicCombination>('combinations', schoolId);
  const levels = db.getAcademicCollection<ClassLevel>('classLevels', schoolId);
  const combination = combinations.find(item => item.id === (classInfo.combinationId || combinationId))
    ?? combinations.find(item => item.name.toLowerCase() === String(classInfo.combination || '').toLowerCase());
  const level = levels.find(item => item.id === (classInfo.levelId || levelId))
    ?? levels.find(item => item.name.toLowerCase() === String(classInfo.grade || classInfo.name).toLowerCase());

  if (strict && combinationId && combination && combinationId !== combination.id) {
    throw new HttpError(400, 'The selected combination does not match the selected class.');
  }
  if (strict && levelId && level && levelId !== level.id) {
    throw new HttpError(400, 'The selected class level does not match the selected class.');
  }

  return {
    classInfo,
    combination,
    level,
    combinationId: combinationId || combination?.id || '',
    levelId: levelId || level?.id || ''
  };
}

/** A subject must belong to the chosen combination/level and must not be archived. */
function teachableSubject(schoolId: string, subjectId: string, combination?: AcademicCombination, levelId = ''): Subject {
  const subject = db.getSubjects(schoolId).find(item => item.id === subjectId);
  if (!subject) throw new HttpError(400, 'Unknown subject.');
  if (subject.status === 'ARCHIVED') {
    throw new HttpError(400, 'Archived subjects cannot be selected for new marks assessments.');
  }
  if (combination?.subjects.length && !combination.subjects.some(item => item.subjectId === subjectId)) {
    throw new HttpError(400, 'This subject is not assigned to the selected combination.');
  }
  if (levelId && subject.levelIds?.length && !subject.levelIds.includes(levelId)) {
    throw new HttpError(400, 'This subject is not configured for the selected class level.');
  }
  return subject;
}

function validateTeacherIds(schoolId: string, ids: string[], _actor: UserProfile): string[] {
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id.trim()))];
  if (unique.length === 0) throw new HttpError(400, 'Select at least one teacher.');
  const teachingRoles: UserProfile['role'][] = ['TEACHER', 'DEPUTY_HEAD', 'HEAD_TEACHER'];
  for (const id of unique) {
    const user = db.getUserById(id);
    if (!user || user.schoolId !== schoolId || !teachingRoles.includes(user.role)) {
      throw new HttpError(400, `Teacher ${id} is not a teaching member of your school.`);
    }
  }
  return unique;
}

function assignmentView(schoolId: string, record: ClassSubjectAssignment) {
  const structure = assignmentStructure(schoolId, record.classId, record.combinationId, record.levelId);
  return {
    ...record,
    combinationId: record.combinationId || structure.combinationId,
    levelId: record.levelId || structure.levelId,
    combinationName: structure.combination?.name ?? '',
    levelName: structure.level?.name ?? '',
    className: structure.classInfo.name,
    subjectName: db.getSubjects(schoolId).find(item => item.id === record.subjectId)?.name ?? record.subjectId,
    subjectCode: db.getSubjects(schoolId).find(item => item.id === record.subjectId)?.code ?? '',
    teacherNames: record.teacherIds.map(id => db.getUserById(id)?.fullName ?? id)
  };
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

  app.get('/api/academics/class-levels', wrap((req, res) => {
    requireAcademicReader(req);
    const schoolId = scopedSchoolId(req);
    let levels = db.getAcademicCollection<ClassLevel>('classLevels', schoolId);
    const combinationId = req.query.combinationId as string | undefined;
    if (combinationId) levels = levels.filter(item => item.combinationIds.includes(combinationId));
    if (req.query.activeOnly === 'true') levels = levels.filter(item => item.isActive);
    res.json(levels);
  }));

  app.post('/api/academics/class-levels', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const name = str(b.name, 'Level name');
    const code = str(b.code, 'Level code').toUpperCase();
    const all = db.getAcademicCollection<ClassLevel>('classLevels');
    if (all.some(item => item.schoolId === schoolId && item.code.toUpperCase() === code)) {
      throw new HttpError(409, 'A class level with this code already exists.');
    }
    const combinationIds = Array.isArray(b.combinationIds)
      ? [...new Set(b.combinationIds.filter((id): id is string => typeof id === 'string'))]
      : [];
    const combinations = db.getAcademicCollection<AcademicCombination>('combinations', schoolId);
    if (combinationIds.some(id => !combinations.some(item => item.id === id))) {
      throw new HttpError(400, 'Every linked combination must belong to your school.');
    }
    const now = new Date().toISOString();
    const level: ClassLevel = {
      id: uid('level'),
      schoolId,
      name,
      code,
      description: typeof b.description === 'string' ? b.description.trim() : undefined,
      academicProgramme: typeof b.academicProgramme === 'string' ? b.academicProgramme.trim() : undefined,
      combinationIds,
      isActive: b.isActive !== false,
      createdAt: now,
      updatedAt: now
    };
    db.addAcademicRecord('classLevels', level);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_CLASS_LEVEL', 'CLASS_LEVEL', level.id, `Created class level ${name} (${code})`);
    res.status(201).json(level);
  }));

  app.patch('/api/academics/class-levels/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const existing = db.getAcademicCollection<ClassLevel>('classLevels', schoolId).find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Class level not found.');
    const updates: Partial<ClassLevel> = { updatedAt: new Date().toISOString() };
    if (b.name !== undefined) updates.name = str(b.name, 'Level name');
    if (b.code !== undefined) {
      const code = str(b.code, 'Level code').toUpperCase();
      if (db.getAcademicCollection<ClassLevel>('classLevels', schoolId).some(item => item.id !== existing.id && item.code.toUpperCase() === code)) {
        throw new HttpError(409, 'A class level with this code already exists.');
      }
      updates.code = code;
    }
    if (b.description !== undefined) updates.description = typeof b.description === 'string' ? b.description.trim() : '';
    if (b.academicProgramme !== undefined) updates.academicProgramme = typeof b.academicProgramme === 'string' ? b.academicProgramme.trim() : '';
    if (Array.isArray(b.combinationIds)) {
      const ids = [...new Set(b.combinationIds.filter((id): id is string => typeof id === 'string'))];
      const combinations = db.getAcademicCollection<AcademicCombination>('combinations', schoolId);
      if (ids.some(id => !combinations.some(item => item.id === id))) {
        throw new HttpError(400, 'Every linked combination must belong to your school.');
      }
      updates.combinationIds = ids;
    }
    if (typeof b.isActive === 'boolean') updates.isActive = b.isActive;
    const updated = db.updateAcademicRecord<ClassLevel>('classLevels', existing.id, schoolId, updates);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_CLASS_LEVEL', 'CLASS_LEVEL', existing.id, `Updated class level ${updated?.name ?? existing.name}`);
    res.json(updated);
  }));

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
    const academicYearId = str(b.academicYearId ?? b.academicYear, 'Academic year', false)
      || getAcademicYear(schoolId)?.id || '';
    const combinationId = str(b.combinationId, 'Combination', false);
    const levelId = str(b.levelId, 'Class level', false);
    const classTeacherId = str(b.classTeacherId, 'Class teacher', false);
    const classes = db.getClasses(schoolId);
    const code = str(b.code, 'Class code', false)
      || `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}`;

    if (combinationId && !db.getAcademicCollection<AcademicCombination>('combinations', schoolId).some(item => item.id === combinationId)) {
      throw new HttpError(400, 'Unknown combination.');
    }
    if (levelId && !db.getAcademicCollection<ClassLevel>('classLevels', schoolId).some(item => item.id === levelId)) {
      throw new HttpError(400, 'Unknown class level.');
    }
    if (classTeacherId && !db.getUserById(classTeacherId)) {
      throw new HttpError(400, 'Unknown class teacher.');
    }
    if (classes.some(item => item.code?.toUpperCase() === code.toUpperCase())) {
      throw new HttpError(409, 'A class with this code already exists.');
    }
    if (classes.some(item =>
      item.name.toLowerCase() === name.toLowerCase() &&
      (item.academicYearId || '') === academicYearId &&
      (item.combinationId || '') === combinationId &&
      (item.levelId || '') === levelId
    )) {
      throw new HttpError(409, 'A class with this name already exists in the selected year and structure.');
    }

    const combinationName = db.getAcademicCollection<AcademicCombination>('combinations', schoolId)
      .find(item => item.id === combinationId)?.name ?? str(b.combination, 'Combination', false);
    const record: AcademicClass = {
      id: uid('class'),
      schoolId,
      name,
      code,
      academicYearId,
      grade: str(b.grade, 'Grade', false) || db.getAcademicCollection<ClassLevel>('classLevels', schoolId).find(item => item.id === levelId)?.name || '',
      stream: str(b.stream, 'Stream', false),
      combination: combinationName,
      combinationId: combinationId || undefined,
      levelId: levelId || undefined,
      classTeacherId: classTeacherId || undefined,
      classTeacherName: str(b.classTeacherName, 'Class teacher', false)
        || db.getUserById(classTeacherId)?.fullName || '',
      room: str(b.room, 'Room', false),
      studentCount: 0,
      status: b.status === 'INACTIVE' || b.status === 'ARCHIVED' ? b.status : 'ACTIVE'
    };
    db.addClass(record);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_CLASS', 'ACADEMIC_CLASS', record.id, `Created class ${record.name} (${record.code})`);
    res.status(201).json(record);
  }));

  app.patch('/api/academics/classes/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const existing = db.getClasses(schoolId).find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Class not found.');
    const updates: Partial<AcademicClass> = {};
    if (b.name !== undefined) updates.name = str(b.name, 'Class name');
    if (b.code !== undefined) {
      const code = str(b.code, 'Class code');
      if (db.getClasses(schoolId).some(item => item.id !== existing.id && item.code?.toUpperCase() === code.toUpperCase())) {
        throw new HttpError(409, 'A class with this code already exists.');
      }
      updates.code = code;
    }
    if (b.academicYearId !== undefined) updates.academicYearId = str(b.academicYearId, 'Academic year', false);
    if (b.combinationId !== undefined) {
      const id = str(b.combinationId, 'Combination', false);
      if (id && !db.getAcademicCollection<AcademicCombination>('combinations', schoolId).some(item => item.id === id)) {
        throw new HttpError(400, 'Unknown combination.');
      }
      updates.combinationId = id || undefined;
    }
    if (b.levelId !== undefined) {
      const id = str(b.levelId, 'Class level', false);
      if (id && !db.getAcademicCollection<ClassLevel>('classLevels', schoolId).some(item => item.id === id)) {
        throw new HttpError(400, 'Unknown class level.');
      }
      updates.levelId = id || undefined;
    }
    if (b.classTeacherId !== undefined) {
      const id = str(b.classTeacherId, 'Class teacher', false);
      if (id && !db.getUserById(id)) throw new HttpError(400, 'Unknown class teacher.');
      updates.classTeacherId = id || undefined;
      updates.classTeacherName = id ? db.getUserById(id)?.fullName ?? '' : '';
    }
    if (b.room !== undefined) updates.room = str(b.room, 'Room', false);
    if (b.status !== undefined) {
      if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(String(b.status))) throw new HttpError(400, 'Invalid class status.');
      updates.status = b.status as AcademicClass['status'];
      updates.archivedAt = b.status === 'ARCHIVED' ? new Date().toISOString() : undefined;
      updates.archivedBy = b.status === 'ARCHIVED' ? actor.id : undefined;
    }
    const updated = db.updateAcademicRecord<AcademicClass>('classes', existing.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Class not found.');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_CLASS', 'ACADEMIC_CLASS', updated.id, `Updated class ${updated.name}`);
    res.json(updated);
  }));

  app.patch('/api/academics/classes/:id/status', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const status = str(bodyOf(req).status, 'Status');
    if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) throw new HttpError(400, 'Invalid class status.');
    const existing = db.getClasses(schoolId).find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Class not found.');
    const updated = db.updateAcademicRecord<AcademicClass>('classes', existing.id, schoolId, {
      status: status as AcademicClass['status'],
      archivedAt: status === 'ARCHIVED' ? new Date().toISOString() : undefined,
      archivedBy: status === 'ARCHIVED' ? actor.id : undefined
    });
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'SET_CLASS_STATUS', 'ACADEMIC_CLASS', existing.id, `Class ${existing.name} set to ${status}`);
    res.json(updated);
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
    const combinationIds = Array.isArray(b.combinationIds)
      ? [...new Set(b.combinationIds.filter((id): id is string => typeof id === 'string'))] : [];
    const levelIds = Array.isArray(b.levelIds)
      ? [...new Set(b.levelIds.filter((id): id is string => typeof id === 'string'))] : [];
    if (combinationIds.some(id => !db.getAcademicCollection<AcademicCombination>('combinations', schoolId).some(item => item.id === id))) {
      throw new HttpError(400, 'Every linked combination must belong to your school.');
    }
    if (levelIds.some(id => !db.getAcademicCollection<ClassLevel>('classLevels', schoolId).some(item => item.id === id))) {
      throw new HttpError(400, 'Every linked class level must belong to your school.');
    }
    const record: Subject = {
      id: uid('subj'),
      schoolId,
      name,
      code,
      department: str(b.department, 'Department', false),
      credits: optionalNum(b.credits, 'Credits') ?? 0,
      passMark: optionalNum(b.passMark, 'Pass mark') ?? getScale(schoolId)?.passMark ?? 50,
      status: b.status === 'INACTIVE' || b.status === 'ARCHIVED' ? b.status : 'ACTIVE',
      combinationIds,
      levelIds,
      archivedAt: b.status === 'ARCHIVED' ? new Date().toISOString() : undefined
    };
    db.addSubject(record);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_SUBJECT', 'SUBJECT', record.id, `Created subject ${record.name} (${record.code})`);
    res.status(201).json(record);
  }));

  app.patch('/api/academics/subjects/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const existing = db.getSubjects(schoolId).find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Subject not found.');
    const updates: Partial<Subject> = {};
    if (b.name !== undefined) {
      const name = str(b.name, 'Subject name');
      if (db.getSubjects(schoolId).some(item => item.id !== existing.id && item.name.toLowerCase() === name.toLowerCase())) {
        throw new HttpError(409, 'A subject with this name already exists.');
      }
      updates.name = name;
    }
    if (b.code !== undefined) {
      const code = str(b.code, 'Subject code').toUpperCase();
      if (db.getSubjects(schoolId).some(item => item.id !== existing.id && item.code.toUpperCase() === code)) {
        throw new HttpError(409, 'A subject with this code already exists.');
      }
      updates.code = code;
    }
    if (b.department !== undefined) updates.department = str(b.department, 'Department', false);
    if (b.credits !== undefined) updates.credits = optionalNum(b.credits, 'Credits') ?? 0;
    if (b.passMark !== undefined) updates.passMark = num(b.passMark, 'Pass mark');
    if (b.combinationIds !== undefined) {
      const ids = [...new Set(Array.isArray(b.combinationIds)
        ? b.combinationIds.filter((id): id is string => typeof id === 'string') : [])];
      if (ids.some(id => !db.getAcademicCollection<AcademicCombination>('combinations', schoolId).some(item => item.id === id))) {
        throw new HttpError(400, 'Every linked combination must belong to your school.');
      }
      updates.combinationIds = ids;
    }
    if (b.levelIds !== undefined) {
      const ids = [...new Set(Array.isArray(b.levelIds)
        ? b.levelIds.filter((id): id is string => typeof id === 'string') : [])];
      if (ids.some(id => !db.getAcademicCollection<ClassLevel>('classLevels', schoolId).some(item => item.id === id))) {
        throw new HttpError(400, 'Every linked class level must belong to your school.');
      }
      updates.levelIds = ids;
    }
    if (b.status !== undefined) {
      if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(String(b.status))) throw new HttpError(400, 'Invalid subject status.');
      updates.status = b.status as Subject['status'];
      updates.archivedAt = b.status === 'ARCHIVED' ? new Date().toISOString() : undefined;
    }
    const updated = db.updateAcademicRecord<Subject>('subjects', existing.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Subject not found.');
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_SUBJECT', 'SUBJECT', updated.id, `Updated subject ${updated.name}`);
    res.json(updated);
  }));

  app.patch('/api/academics/subjects/:id/status', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const status = str(bodyOf(req).status, 'Status');
    if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) throw new HttpError(400, 'Invalid subject status.');
    const existing = db.getSubjects(schoolId).find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Subject not found.');
    const updated = db.updateAcademicRecord<Subject>('subjects', existing.id, schoolId, {
      status: status as Subject['status'],
      archivedAt: status === 'ARCHIVED' ? new Date().toISOString() : undefined
    });
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'SET_SUBJECT_STATUS', 'SUBJECT', existing.id, `Subject ${existing.name} set to ${status}`);
    res.json(updated);
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
    // Full assignment administration data is manager-only. Teachers use the
    // dedicated /my-assignments endpoint, which is scoped to their own ID.
    requireManager(req);
    const schoolId = scopedSchoolId(req);
    const filters = {
      yearId: req.query.yearId as string | undefined,
      termId: req.query.termId as string | undefined,
      classId: req.query.classId as string | undefined,
      subjectId: req.query.subjectId as string | undefined,
      combinationId: req.query.combinationId as string | undefined,
      levelId: req.query.levelId as string | undefined
    };
    const matches = (item: ClassSubjectAssignment) =>
      (!filters.yearId || item.academicYearId === filters.yearId)
      && (!filters.termId || item.termId === filters.termId)
      && (!filters.classId || filters.classId === 'all' || item.classId === filters.classId)
      && (!filters.subjectId || filters.subjectId === 'all' || item.subjectId === filters.subjectId);
    const records = req.query.includeInactive === 'true'
      ? db.getAcademicCollection<ClassSubjectAssignment>('classSubjectAssignments', schoolId).filter(matches)
      : getAssignments(schoolId, filters.yearId, filters.termId, filters.classId, filters.subjectId);
    const views = records.map(item => assignmentView(schoolId, item));
    res.json(views.filter(item =>
      (!filters.combinationId || item.combinationId === filters.combinationId)
      && (!filters.levelId || item.levelId === filters.levelId)
    ));
  }));

  app.get('/api/academics/assignments/:id/history', wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    const actor = actorOf(req);
    const record = db.getAcademicCollection<ClassSubjectAssignment>('classSubjectAssignments', schoolId)
      .find(item => item.id === req.params.id);
    if (!record) throw new HttpError(404, 'Assignment not found.');
    if (!isAcademicManager(actor) && !canReviewMarks(actor) && !record.teacherIds.includes(actor.id)) {
      throw new HttpError(403, 'You are not authorized to view this assignment history.');
    }
    res.json(record.history ?? []);
  }));

  app.post('/api/academics/assignments', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const academicYearId = str(b.academicYearId ?? b.yearId, 'Academic year');
    const termId = str(b.termId, 'Term');
    const classId = str(b.classId, 'Class');
    const subjectId = str(b.subjectId, 'Subject');
    if (!db.getAcademicCollection<AcademicYear>('academicYears', schoolId).some(item => item.id === academicYearId)) {
      throw new HttpError(400, 'Unknown academic year.');
    }
    if (!db.getAcademicCollection<AcademicTerm>('terms', schoolId).some(item => item.id === termId && item.academicYearId === academicYearId)) {
      throw new HttpError(400, 'The selected term does not belong to the academic year.');
    }
    const structure = assignmentStructure(schoolId, classId, str(b.combinationId, 'Combination', false), str(b.levelId, 'Class level', false), true);
    teachableSubject(schoolId, subjectId, structure.combination, structure.levelId);
    const teacherIds = validateTeacherIds(schoolId, Array.isArray(b.teacherIds) ? b.teacherIds : [], actor);
    const now = new Date().toISOString();
    const history: AcademicWorkflowEvent[] = [{
      action: 'ASSIGNMENT_CREATED',
      by: actor.id,
      byName: actor.fullName,
      role: actor.role,
      at: now,
      note: `${teacherIds.length} teacher(s) assigned.`
    }];
    const assignment: ClassSubjectAssignment = {
      id: uid('csa'),
      schoolId,
      academicYearId,
      termId,
      classId,
      subjectId,
      combinationId: structure.combinationId || undefined,
      levelId: structure.levelId || undefined,
      teacherIds,
      isActive: b.isActive !== false,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      history
    };
    const existing = db.getAcademicCollection<ClassSubjectAssignment>('classSubjectAssignments', schoolId).find(item =>
      item.academicYearId === academicYearId && item.termId === termId &&
      item.classId === classId && item.subjectId === subjectId
    );
    if (existing) {
      const updatedHistory = [...(existing.history ?? []), ...history.map(event => ({ ...event, action: 'ASSIGNMENT_UPDATED' }))];
      const updated = db.updateAcademicRecord<ClassSubjectAssignment>('classSubjectAssignments', existing.id, schoolId, {
        teacherIds,
        isActive: assignment.isActive,
        combinationId: assignment.combinationId,
        levelId: assignment.levelId,
        updatedAt: now,
        history: updatedHistory
      });
      const added = teacherIds.filter(id => !existing.teacherIds.includes(id));
      notifyTeachers(schoolId, added,
        'New subject assignment', 'Ishyirwa mu masomo yigishwa',
        `You have been assigned to teach a subject in the selected class and term.`,
        `Washyizwe mu kwigisha isomo muri iryo tsinda n'igihembwe.`, existing.id);
      db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_TEACHER_ASSIGNMENT', 'CLASS_SUBJECT_ASSIGNMENT', existing.id, `Updated teachers for ${classId}/${subjectId}`);
      res.json(assignmentView(schoolId, updated!));
      return;
    }
    db.addAcademicRecord('classSubjectAssignments', assignment);
    notifyTeachers(schoolId, teacherIds,
      'New subject assignment', 'Ishyirwa mu masomo yigishwa',
      `You have been assigned to teach a subject in the selected class and term.`,
      `Washyizwe mu kwigisha isomo muri iryo tsinda n'igihembwe.`);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'ASSIGN_TEACHER_SUBJECT', 'CLASS_SUBJECT_ASSIGNMENT', assignment.id, `Assigned ${teacherIds.length} teacher(s)`);
    res.status(201).json(assignmentView(schoolId, assignment));
  }));

  app.patch('/api/academics/assignments/:id', wrap((req, res) => {
    const actor = requireManager(req);
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const existing = db.getAcademicCollection<ClassSubjectAssignment>('classSubjectAssignments', schoolId)
      .find(item => item.id === req.params.id);
    if (!existing) throw new HttpError(404, 'Assignment not found.');
    const structure = assignmentStructure(schoolId, existing.classId, existing.combinationId, existing.levelId);
    const updates: Partial<ClassSubjectAssignment> = { updatedAt: new Date().toISOString() };
    if (Array.isArray(b.teacherIds)) {
      updates.teacherIds = validateTeacherIds(schoolId, b.teacherIds, actor);
    }
    if (typeof b.isActive === 'boolean') updates.isActive = b.isActive;
    if (b.combinationId !== undefined) {
      const id = str(b.combinationId, 'Combination', false);
      const next = id ? assignmentStructure(schoolId, existing.classId, id, updates.levelId || existing.levelId, true) : null;
      updates.combinationId = next?.combinationId || undefined;
    }
    if (b.levelId !== undefined) {
      const id = str(b.levelId, 'Class level', false);
      const next = id ? assignmentStructure(schoolId, existing.classId, updates.combinationId || existing.combinationId, id, true) : null;
      updates.levelId = next?.levelId || undefined;
    }
    if (updates.isActive !== false) {
      teachableSubject(schoolId, existing.subjectId,
        db.getAcademicCollection<AcademicCombination>('combinations', schoolId).find(item => item.id === (updates.combinationId || existing.combinationId)),
        updates.levelId || existing.levelId || '');
    }
    updates.history = [...(existing.history ?? []), {
      action: updates.isActive === false ? 'ASSIGNMENT_DEACTIVATED' : 'ASSIGNMENT_UPDATED',
      by: actor.id,
      byName: actor.fullName,
      role: actor.role,
      at: updates.updatedAt!,
      note: Array.isArray(updates.teacherIds) ? `Teachers: ${updates.teacherIds.length}.` : undefined
    }];
    const updated = db.updateAcademicRecord<ClassSubjectAssignment>('classSubjectAssignments', existing.id, schoolId, updates);
    if (!updated) throw new HttpError(404, 'Assignment not found.');
    const added = Array.isArray(updates.teacherIds)
      ? updates.teacherIds.filter(id => !existing.teacherIds.includes(id)) : [];
    notifyTeachers(schoolId, added,
      'New subject assignment', 'Ishyirwa mu masomo yigishwa',
      `You have been assigned to teach a subject in the selected class and term.`,
      `Washyizwe mu kwigisha isomo muri iryo tsinda n'igihembwe.`, existing.id);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'UPDATE_TEACHER_ASSIGNMENT', 'CLASS_SUBJECT_ASSIGNMENT', updated.id, `Updated assignment ${structure.classInfo.name}`);
    res.json(assignmentView(schoolId, updated));
  }));

  app.get('/api/academics/class-teachers', wrap((req, res) => {
    requireManager(req);
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
    const actor = requireAcademicReader(req);
    const schoolId = scopedSchoolId(req);
    notifySubmissionDeadlines(schoolId);
    const year = getAcademicYear(schoolId, req.query.yearId as string);
    const term = getTerm(schoolId, req.query.termId as string, year?.id);
    const activeSubjectIds = new Set(db.getSubjects(schoolId)
      .filter(subject => subject.status !== 'ARCHIVED').map(subject => subject.id));
    const activeClassIds = new Set(db.getClasses(schoolId)
      .filter(item => (item.status ?? 'ACTIVE') !== 'ARCHIVED').map(item => item.id));
    const combinationFilter = req.query.combinationId as string | undefined;
    const levelFilter = req.query.levelId as string | undefined;
    const assignments = getAssignments(schoolId, year?.id, term?.id)
      .filter(item => item.teacherIds.includes(actor.id)
        && activeSubjectIds.has(item.subjectId)
        && activeClassIds.has(item.classId))
      .map(item => assignmentView(schoolId, item))
      .filter(item => (!combinationFilter || item.combinationId === combinationFilter)
        && (!levelFilter || item.levelId === levelFilter));
    const classTeacherOf = db.getAcademicCollection<{ classId: string; teacherId: string }>('classTeacherAssignments', schoolId)
      .filter(item => item.teacherId === actor.id).map(item => item.classId);
    res.json({
      year,
      term,
      assignments: assignments.map(item => ({
        ...item,
        status: getSubmission(schoolId, item.academicYearId, item.termId, item.classId, item.subjectId)?.status ?? 'DRAFT'
      })),
      classTeacherOf
    });
  }));

  app.get('/api/academics/marks-entry', wrap((req, res) => {
    const actor = requireAcademicReader(req);
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
    const classInfo = db.getClasses(schoolId).find(item => item.id === classId);
    if (!classInfo || (classInfo.status ?? 'ACTIVE') === 'ARCHIVED') {
      throw new HttpError(400, 'Archived classes cannot accept new marks entries.');
    }
    assertTeacherAssignment(actor, schoolId, year.id, term.id, classId, subjectId);
    teachableSubject(schoolId, subjectId);
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
    const actor = requireAcademicReader(req);
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
    const actor = requireAcademicReader(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (submission.teacherId !== actor.id && !canReviewMarks(actor) && !isAcademicManager(actor)) {
      throw new HttpError(403, 'You cannot view this submission.');
    }
    res.json(submissionView(submission));
  }));

  app.post('/api/academics/submissions/:id/submit', wrap((req, res) => {
    const actor = requireAcademicReader(req);
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

  app.post('/api/academics/submissions/:id/review', wrap((req, res) => {
    const reviewer = requireReviewer(req);
    const schoolId = scopedSchoolId(req);
    const submission = db.getAcademicCollection<MarkSubmission>('markSubmissions', schoolId).find(item => item.id === req.params.id);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (submission.status !== 'SUBMITTED') throw new HttpError(409, 'Only newly submitted marks can start review.');
    const now = new Date().toISOString();
    const updated = db.updateAcademicRecord<MarkSubmission>('markSubmissions', submission.id, schoolId, {
      status: 'UNDER_REVIEW', reviewedAt: now, reviewedBy: reviewer.id,
      reviewedByName: reviewer.fullName, updatedAt: now,
      history: addHistory({ action: 'UNDER_REVIEW', by: reviewer.id, byName: reviewer.fullName, role: reviewer.role, at: now }, submission.history)
    });
    db.logAudit(schoolId, reviewer.id, reviewer.fullName, reviewer.role, 'REVIEW_MARKS', 'MARK_SUBMISSION', submission.id, 'Marks moved under review.');
    notifyTeachers(schoolId, [submission.teacherId],
      'Marks under review', 'Amanota ari kugenzurwa',
      'Your marks submission is now being reviewed.', 'Amanota yawe ari kugenzurwa.', submission.id);
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
          'REPORT_DISTRIBUTION', distribution.id, `Reopened marks invalidated distribution ${distribution.id}`);
      }
    }
    db.logAudit(schoolId, reviewer.id, reviewer.fullName, reviewer.role, 'REOPEN_APPROVED_MARKS', 'MARK_SUBMISSION', submission.id, reason);
    notifyTeachers(schoolId, [submission.teacherId], 'Approved marks reopened', 'Amanota yemewe yongeye gufungurwa', reason, reason, submission.id);
    res.json({ submission: updated, unpublishedReportCards: cards.length });
  }));

  app.get('/api/academics/results', wrap((req, res) => {
    const actor = requireAcademicReader(req);
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
    const actor = requireAcademicReader(req);
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
