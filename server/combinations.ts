/**
 * SchoolCare combination management API.
 *
 * Every record is scoped to the authenticated user's school. A browser-sent
 * `schoolId` is never trusted; only a platform Super Admin may target another
 * school explicitly (via scopedSchoolId). Combinations are archived/deactivated,
 * never permanently deleted, so historical students, marks, attendance and
 * report cards keep their links.
 */
import type { Express, Request, Response } from 'express';
import {
  AcademicClass,
  AcademicCombination,
  CombinationStatus,
  CombinationSubject,
  CombinationView,
  CreateCombinationInput,
  Student,
  Subject,
  UserProfile
} from '../src/types';
import { db } from './database';
import { requireAnyPermission, requirePermission } from './rbac';
import { checkMysqlHealth, getMysqlPool } from './mysqlConnector';
import {
  getAcademicYear,
  getTerm,
  HttpError,
  scopedSchoolId,
  uid
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
      console.error('Combination API error:', error);
      res.status(500).json({ error: 'Combination request failed.' });
    }
  };
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function str(value: unknown, field: string, required = true): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!required && (value === undefined || value === null || value === '')) return '';
  throw new HttpError(400, `${field} is required.`);
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, `${field} must be a positive number.`);
  return parsed;
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be a list.`);
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()))];
}

function combinationOf(req: Request, id: string): AcademicCombination {
  const schoolId = scopedSchoolId(req);
  const record = db.getAcademicCollection<AcademicCombination>('combinations', schoolId)
    .find(item => item.id === id);
  if (!record) throw new HttpError(404, 'Combination not found in your school.');
  return record;
}

function saveCombinations(records: AcademicCombination[]): void {
  db.saveAcademicCollection('combinations', records);
}

function upsertCombination(record: AcademicCombination): void {
  const all = db.getAcademicCollection<AcademicCombination>('combinations');
  const index = all.findIndex(item => item.id === record.id && item.schoolId === record.schoolId);
  if (index === -1) all.unshift(record);
  else all[index] = record;
  saveCombinations(all);
}

function studentCountFor(schoolId: string, combination: AcademicCombination): number {
  const names = new Set(
    [combination.name, combination.academicProgramme]
      .filter(Boolean)
      .map(name => name.toLowerCase())
  );
  const classIds = new Set(combination.classIds);
  return db.getStudents(schoolId, undefined, undefined, true).filter(student => {
    if (student.combinationId) return student.combinationId === combination.id;
    const byName = names.has(String(student.combination || '').toLowerCase());
    const byClass = classIds.has(student.classId);
    // Legacy records may share a class with another combination (e.g. S3
    // General Science & Languages). Prefer the stored text when present.
    return byName || (!student.combination && byClass);
  }).length;
}

function viewOf(schoolId: string, combination: AcademicCombination): CombinationView {
  const classes = db.getClasses(schoolId);
  const subjects = db.getSubjects(schoolId);
  const users = db.getUsers(schoolId);
  const teacherName = (id: string) => users.find(user => user.id === id)?.fullName ?? id;

  return {
    ...combination,
    studentCount: studentCountFor(schoolId, combination),
    classes: combination.classIds.map(id => {
      const item = classes.find(classInfo => classInfo.id === id);
      return {
        id,
        name: item?.name ?? id,
        grade: item?.grade ?? '',
        status: item?.status ?? 'ACTIVE'
      };
    }),
    subjectDetails: combination.subjects.map(subject => {
      const item = subjects.find(entry => entry.id === subject.subjectId);
      return {
        ...subject,
        name: item?.name ?? subject.subjectId,
        code: item?.code ?? '',
        department: item?.department ?? '',
        teacherNames: subject.teacherIds.map(teacherName)
      };
    }),
    teacherDetails: combination.teacherIds.map(id => {
      const user = users.find(entry => entry.id === id);
      return { id, fullName: user?.fullName ?? id, role: user?.role ?? '' };
    }),
    classTeacher: combination.classTeacherId
      ? { id: combination.classTeacherId, fullName: teacherName(combination.classTeacherId) }
      : undefined
  };
}

function validateReferences(schoolId: string, input: CreateCombinationInput): void {
  const classes = db.getClasses(schoolId);
  for (const classId of input.classIds ?? []) {
    if (!classes.some(item => item.id === classId)) {
      throw new HttpError(400, `Class ${classId} does not belong to your school.`);
    }
  }
  const subjects = db.getSubjects(schoolId);
  for (const subject of input.subjects ?? []) {
    if (!subjects.some(item => item.id === subject.subjectId)) {
      throw new HttpError(400, `Subject ${subject.subjectId} does not belong to your school.`);
    }
  }
  const staff = db.getUsers(schoolId).filter(user =>
    ['TEACHER', 'DEPUTY_HEAD', 'HEAD_TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)
  );
  for (const teacherId of [
    ...(input.teacherIds ?? []),
    ...(input.subjects ?? []).flatMap(subject => subject.teacherIds),
    ...(input.classTeacherId ? [input.classTeacherId] : [])
  ]) {
    if (!staff.some(user => user.id === teacherId)) {
      throw new HttpError(400, `Teacher ${teacherId} is not a staff member of your school.`);
    }
  }
}

function normalizeInput(req: Request, partial: boolean): CreateCombinationInput {
  const b = bodyOf(req);
  const has = (field: string) => Object.prototype.hasOwnProperty.call(b, field);
  const schoolId = scopedSchoolId(req);
  const existing = partial && typeof req.params.id === 'string'
    ? combinationOf(req, req.params.id)
    : undefined;

  // PATCH requests may change one field; absent fields retain their stored values.
  const requiredText = (field: string, label: string, fallback = '') =>
    !partial || has(field) ? str(b[field], label, !partial) : fallback;
  const optionalText = (field: string, fallback = '') =>
    !has(field) ? fallback : typeof b[field] === 'string' ? (b[field] as string).trim() : '';

  const code = requiredText('code', 'Combination code', existing?.code ?? '');
  const duplicates = db.getAcademicCollection<AcademicCombination>('combinations')
    .filter(item => item.schoolId === schoolId && item.code.toLowerCase() === code.toLowerCase());

  const subjects = !partial || has('subjects')
    ? Array.isArray(b.subjects)
      ? (b.subjects as Record<string, unknown>[]).map(item => ({
          subjectId: str(item.subjectId, 'Subject'),
          isRequired: item.isRequired !== false,
          teacherIds: stringArray(item.teacherIds, 'Subject teachers')
        }))
      : []
    : (existing?.subjects ?? []).map(item => ({ ...item, teacherIds: [...item.teacherIds] }));

  const input: CreateCombinationInput = {
    name: requiredText('name', 'Combination name', existing?.name ?? ''),
    code,
    educationLevel: requiredText('educationLevel', 'Education level', existing?.educationLevel ?? ''),
    academicProgramme: requiredText('academicProgramme', 'Academic programme', existing?.academicProgramme ?? ''),
    description: optionalText('description', existing?.description ?? ''),
    academicYear: requiredText('academicYear', 'Academic year', existing?.academicYear ?? ''),
    status: b.status === 'INACTIVE' || b.status === 'ARCHIVED' ? b.status : existing?.status ?? 'ACTIVE',
    subjects,
    classIds: !partial || has('classIds')
      ? stringArray(b.classIds, 'Classes')
      : [...(existing?.classIds ?? [])],
    teacherIds: !partial || has('teacherIds')
      ? stringArray(b.teacherIds, 'Teachers')
      : [...(existing?.teacherIds ?? [])],
    classTeacherId: has('classTeacherId') || !partial
      ? (typeof b.classTeacherId === 'string' && b.classTeacherId.trim() ? b.classTeacherId.trim() : undefined)
      : existing?.classTeacherId,
    department: optionalText('department', existing?.department ?? ''),
    maxCapacity: has('maxCapacity') || !partial
      ? optionalNumber(b.maxCapacity, 'Maximum capacity')
      : existing?.maxCapacity,
    notes: optionalText('notes', existing?.notes ?? '')
  };

  const selfId = typeof req.params.id === 'string' ? req.params.id : '';
  if (code && duplicates.some(item => item.id !== selfId)) {
    throw new HttpError(409, 'A combination with this code already exists in your school.');
  }
  const seenSubjects = new Set<string>();
  for (const subject of input.subjects ?? []) {
    if (seenSubjects.has(subject.subjectId)) {
      throw new HttpError(400, 'A subject can only be added once to a combination.');
    }
    seenSubjects.add(subject.subjectId);
  }
  validateReferences(schoolId, input);
  return input;
}

/** Mirror the JSON-store record into MariaDB when the connection is healthy. */
async function mirrorCombination(record: AcademicCombination): Promise<void> {
  try {
    const pool = getMysqlPool();
    const health = await checkMysqlHealth();
    if (!pool || !health.connected) return;
    const json = (value: unknown) => JSON.stringify(value ?? []);
    await pool.execute(
      `INSERT INTO combinations
        (id, school_id, name, code, education_level, academic_programme, description,
         academic_year, status, class_ids, teacher_ids, class_teacher_id, department,
         max_capacity, notes, archived_at, archived_by, archive_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), education_level = VALUES(education_level),
         academic_programme = VALUES(academic_programme), description = VALUES(description),
         academic_year = VALUES(academic_year), status = VALUES(status),
         class_ids = VALUES(class_ids), teacher_ids = VALUES(teacher_ids),
         class_teacher_id = VALUES(class_teacher_id), department = VALUES(department),
         max_capacity = VALUES(max_capacity), notes = VALUES(notes),
         archived_at = VALUES(archived_at), archived_by = VALUES(archived_by),
         archive_reason = VALUES(archive_reason)`,
      [
        record.id, record.schoolId, record.name, record.code, record.educationLevel,
        record.academicProgramme, record.description ?? '', record.academicYear, record.status,
        json(record.classIds), json(record.teacherIds), record.classTeacherId ?? null,
        record.department ?? '', record.maxCapacity ?? null, record.notes ?? '',
        record.archivedAt ?? null, record.archivedBy ?? null, record.archiveReason ?? null
      ]
    );
    // The JSON record is authoritative: replace link rows so removed classes,
    // subjects and teachers do not linger in the relational mirror.
    await pool.execute(
      'DELETE FROM combination_classes WHERE school_id = ? AND combination_id = ?',
      [record.schoolId, record.id]
    );
    for (const classId of record.classIds) {
      await pool.execute(
        `INSERT IGNORE INTO combination_classes (id, school_id, combination_id, class_id)
         VALUES (?, ?, ?, ?)`,
        [`cc-${record.id}-${classId}`, record.schoolId, record.id, classId]
      );
    }
    await pool.execute(
      'DELETE FROM combination_subjects WHERE school_id = ? AND combination_id = ?',
      [record.schoolId, record.id]
    );
    for (const subject of record.subjects) {
      await pool.execute(
        `INSERT INTO combination_subjects (id, school_id, combination_id, subject_id, is_required, teacher_ids)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_required = VALUES(is_required), teacher_ids = VALUES(teacher_ids)`,
        [
          `cs-${record.id}-${subject.subjectId}`, record.schoolId, record.id,
          subject.subjectId, subject.isRequired ? 1 : 0, json(subject.teacherIds)
        ]
      );
    }
    await pool.execute(
      'DELETE FROM combination_teachers WHERE school_id = ? AND combination_id = ?',
      [record.schoolId, record.id]
    );
    for (const teacherId of record.teacherIds) {
      await pool.execute(
        `INSERT IGNORE INTO combination_teachers (id, school_id, combination_id, teacher_id)
         VALUES (?, ?, ?, ?)`,
        [`ct-${record.id}-${teacherId}`, record.schoolId, record.id, teacherId]
      );
    }
  } catch (error) {
    // MariaDB is a mirror; the JSON store remains authoritative.
    console.error('[MySQL] combination mirror failed:', error);
  }
}

/**
 * Keep class/subject teacher assignments in sync so the existing marks-entry
 * guard continues to restrict teachers to the subjects/classes they teach.
 */
function syncTeacherAssignments(record: AcademicCombination, actor: UserProfile): void {
  const schoolId = record.schoolId;
  const year = getAcademicYear(schoolId);
  const term = getTerm(schoolId, undefined, year?.id);
  if (!year || !term) return;

  const assignments = db.getAcademicCollection<any>('classSubjectAssignments');
  let changed = false;
  for (const classId of record.classIds) {
    for (const subject of record.subjects) {
      const teacherIds = subject.teacherIds.length ? subject.teacherIds : record.teacherIds;
      if (!teacherIds.length) continue;
      const index = assignments.findIndex(item =>
        item.schoolId === schoolId && item.academicYearId === year.id && item.termId === term.id &&
        item.classId === classId && item.subjectId === subject.subjectId
      );
      if (index === -1) {
        assignments.unshift({
          id: uid('csa'), schoolId, academicYearId: year.id, termId: term.id,
          classId, subjectId: subject.subjectId, teacherIds: [...teacherIds],
          isActive: true, createdAt: new Date().toISOString()
        });
        changed = true;
      } else if (JSON.stringify([...assignments[index].teacherIds].sort()) !== JSON.stringify([...teacherIds].sort())) {
        assignments[index] = { ...assignments[index], teacherIds: [...teacherIds], isActive: true };
        changed = true;
      }
    }
  }
  if (changed) {
    db.saveAcademicCollection('classSubjectAssignments', assignments);
    db.logAudit(
      schoolId, actor.id, actor.fullName, actor.role, 'SYNC_COMBINATION_TEACHERS',
      'COMBINATION', record.id, `Updated class/subject assignments for ${record.name}`
    );
  }
}

function audit(req: Request, actor: UserProfile, action: string, record: AcademicCombination, details: string): void {
  db.logAudit(record.schoolId, actor.id, actor.fullName, actor.role, action, 'COMBINATION', record.id, details, req.ip);
}

export function registerCombinationRoutes(app: Express): void {
  const read = requirePermission('combinations.read');
  const write = requirePermission('combinations.write');

  // Catalogue for the add/edit form. Registered before /:id routes.
  app.get('/api/combinations/catalog', read, wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    res.json({
      years: db.getAcademicCollection<any>('academicYears', schoolId),
      classes: db.getActiveClasses(schoolId),
      archivedClasses: db.getClasses(schoolId).filter(item => item.status === 'ARCHIVED'),
      subjects: db.getSubjects(schoolId),
      teachers: db.getUsers(schoolId).filter(user =>
        ['TEACHER', 'DEPUTY_HEAD', 'HEAD_TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)
      )
    });
  }));

  // Active combinations only — used by the student registration form.
  app.get('/api/combinations/active', requireAnyPermission('combinations.read', 'students.read'), wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    const list = db.getAcademicCollection<AcademicCombination>('combinations', schoolId)
      .filter(item => item.status === 'ACTIVE')
      .map(item => viewOf(schoolId, item));
    res.json(list);
  }));

  // Teacher-centric view for teacher management integration.
  app.get('/api/combinations/teacher-summary', read, wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    const combinations = db.getAcademicCollection<AcademicCombination>('combinations', schoolId);
    const users = db.getUsers(schoolId).filter(user =>
      ['TEACHER', 'DEPUTY_HEAD', 'HEAD_TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)
    );
    const subjects = db.getSubjects(schoolId);
    res.json(users.map(user => {
      const managed = combinations.filter(item =>
        item.teacherIds.includes(user.id) || item.classTeacherId === user.id
      );
      const taught = combinations.flatMap(item =>
        item.subjects
          .filter(subject => subject.teacherIds.includes(user.id))
          .map(subject => ({
            combinationId: item.id,
            combinationName: item.name,
            subjectId: subject.subjectId,
            subjectName: subjects.find(entry => entry.id === subject.subjectId)?.name ?? subject.subjectId
          }))
      );
      return {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        department: user.teacherDepartment ?? '',
        combinations: managed.map(item => ({ id: item.id, name: item.name, status: item.status })),
        subjects: taught
      };
    }));
  }));

  // Create a subject from inside the combination form (authorized staff only).
  app.post('/api/combinations/subjects', write, wrap((req, res) => {
    const actor = req.user as UserProfile;
    const schoolId = scopedSchoolId(req);
    const b = bodyOf(req);
    const name = str(b.name, 'Subject name');
    const code = str(b.code, 'Subject code');
    const department = str(b.department, 'Department');
    if (db.getSubjects(schoolId).some(item => item.code.toLowerCase() === code.toLowerCase())) {
      throw new HttpError(409, 'A subject with this code already exists in your school.');
    }
    const subject: Subject = {
      id: uid('subj'), schoolId, name, code, department,
      credits: optionalNumber(b.credits, 'Credits') ?? 4,
      passMark: optionalNumber(b.passMark, 'Pass mark') ?? 50
    };
    db.addSubject(subject);
    db.logAudit(schoolId, actor.id, actor.fullName, actor.role, 'CREATE_SUBJECT', 'SUBJECT', subject.id,
      `Created subject ${name} (${code}) from combination management`, req.ip);
    (async () => {
      try {
        const pool = getMysqlPool();
        const health = await checkMysqlHealth();
        if (pool && health.connected) {
          await pool.execute(
            `INSERT INTO subjects (id, school_id, name, code, department, credits, pass_mark)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [subject.id, subject.schoolId, subject.name, subject.code, subject.department, subject.credits, subject.passMark]
          );
        }
      } catch (error) {
        console.error('[MySQL] subject mirror failed:', error);
      }
    })();
    res.status(201).json(subject);
  }));

  app.get('/api/combinations', read, wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    let list = db.getAcademicCollection<AcademicCombination>('combinations', schoolId);
    const includeArchived = String(req.query.includeArchived ?? 'true') !== 'false';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const level = typeof req.query.educationLevel === 'string' ? req.query.educationLevel : '';
    const year = typeof req.query.academicYear === 'string' ? req.query.academicYear : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    if (!includeArchived) list = list.filter(item => item.status !== 'ARCHIVED');
    if (status) list = list.filter(item => item.status === status);
    if (level) list = list.filter(item => item.educationLevel.toLowerCase() === level.toLowerCase());
    if (year) list = list.filter(item => item.academicYear === year);
    if (search) {
      list = list.filter(item =>
        item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search) ||
        item.academicProgramme.toLowerCase().includes(search)
      );
    }
    res.json(list.map(item => viewOf(schoolId, item)));
  }));

  app.get('/api/combinations/:id', read, wrap((req, res) => {
    const schoolId = scopedSchoolId(req);
    const record = combinationOf(req, req.params.id);
    res.json(viewOf(schoolId, record));
  }));

  app.get('/api/combinations/:id/students', read, wrap((req, res) => {
    const record = combinationOf(req, req.params.id);
    const view = viewOf(record.schoolId, record);
    const names = new Set([record.name.toLowerCase(), record.academicProgramme.toLowerCase()]);
    const classIds = new Set(record.classIds);
    const students: Student[] = db.getStudents(record.schoolId, undefined, undefined, true).filter(student =>
      (student.combinationId && student.combinationId === record.id) ||
      names.has(String(student.combination || '').toLowerCase()) ||
      (!student.combination && classIds.has(student.classId))
    );
    res.json({
      combination: { id: view.id, name: view.name, status: view.status },
      studentCount: students.length,
      students: students.map(student => ({
        id: student.id, admissionNumber: student.admissionNumber,
        fullName: `${student.firstName} ${student.lastName}`,
        className: student.className, combination: student.combination,
        enrollmentStatus: student.enrollmentStatus, archivedAt: student.archivedAt
      }))
    });
  }));

  app.post('/api/combinations', write, wrap(async (req, res) => {
    const actor = req.user as UserProfile;
    const schoolId = scopedSchoolId(req);
    const input = normalizeInput(req, false);
    const now = new Date().toISOString();
    const record: AcademicCombination = {
      ...input,
      id: uid('comb'), schoolId,
      description: input.description ?? '',
      academicYear: input.academicYear,
      status: input.status ?? 'ACTIVE',
      subjects: (input.subjects ?? []).map((subject: CombinationSubject) => ({
        subjectId: subject.subjectId, isRequired: subject.isRequired, teacherIds: [...subject.teacherIds]
      })),
      classIds: [...(input.classIds ?? [])],
      teacherIds: [...(input.teacherIds ?? [])],
      createdAt: now, updatedAt: now
    };
    upsertCombination(record);
    syncTeacherAssignments(record, actor);
    await mirrorCombination(record);
    audit(req, actor, 'CREATE_COMBINATION', record, `Created combination ${record.name} (${record.code})`);
    res.status(201).json(viewOf(schoolId, record));
  }));

  app.patch('/api/combinations/:id', write, wrap(async (req, res) => {
    const actor = req.user as UserProfile;
    const existing = combinationOf(req, req.params.id);
    const input = normalizeInput(req, true);
    const b = bodyOf(req);
    const status: CombinationStatus = b.status === 'ACTIVE' || b.status === 'INACTIVE' || b.status === 'ARCHIVED'
      ? b.status : existing.status;
    const record: AcademicCombination = {
      ...existing,
      ...input,
      status,
      id: existing.id,
      schoolId: existing.schoolId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      archivedAt: status === 'ARCHIVED' ? (existing.archivedAt ?? new Date().toISOString()) : undefined,
      archivedBy: status === 'ARCHIVED' ? (existing.archivedBy ?? actor.id) : undefined
    };
    upsertCombination(record);
    syncTeacherAssignments(record, actor);
    await mirrorCombination(record);
    audit(req, actor, 'UPDATE_COMBINATION', record, `Updated combination ${record.name}`);
    res.json(viewOf(record.schoolId, record));
  }));

  app.post('/api/combinations/:id/subjects', write, wrap(async (req, res) => {
    const actor = req.user as UserProfile;
    const existing = combinationOf(req, req.params.id);
    const b = bodyOf(req);
    if (!Array.isArray(b.subjects)) throw new HttpError(400, 'Subjects list is required.');
    const candidate: CreateCombinationInput = {
      name: existing.name, code: existing.code, educationLevel: existing.educationLevel,
      academicProgramme: existing.academicProgramme, academicYear: existing.academicYear,
      classIds: existing.classIds, teacherIds: existing.teacherIds,
      classTeacherId: existing.classTeacherId,
      subjects: (b.subjects as Record<string, unknown>[]).map(item => ({
        subjectId: str(item.subjectId, 'Subject'),
        isRequired: item.isRequired !== false,
        teacherIds: stringArray(item.teacherIds, 'Subject teachers')
      }))
    };
    validateReferences(existing.schoolId, candidate);
    const record: AcademicCombination = {
      ...existing, subjects: candidate.subjects ?? [], updatedAt: new Date().toISOString()
    };
    upsertCombination(record);
    syncTeacherAssignments(record, actor);
    await mirrorCombination(record);
    audit(req, actor, 'UPDATE_COMBINATION_SUBJECTS', record,
      `Updated ${record.subjects.length} subjects for ${record.name}`);
    res.json(viewOf(record.schoolId, record));
  }));

  app.post('/api/combinations/:id/teachers', write, wrap(async (req, res) => {
    const actor = req.user as UserProfile;
    const existing = combinationOf(req, req.params.id);
    const b = bodyOf(req);
    const candidate: CreateCombinationInput = {
      name: existing.name, code: existing.code, educationLevel: existing.educationLevel,
      academicProgramme: existing.academicProgramme, academicYear: existing.academicYear,
      classIds: existing.classIds, teacherIds: stringArray(b.teacherIds, 'Teachers'),
      subjects: Array.isArray(b.subjects)
        ? (b.subjects as Record<string, unknown>[]).map(item => ({
            subjectId: str(item.subjectId, 'Subject'),
            isRequired: item.isRequired !== false,
            teacherIds: stringArray(item.teacherIds, 'Subject teachers')
          }))
        : existing.subjects,
      classTeacherId: typeof b.classTeacherId === 'string' && b.classTeacherId.trim()
        ? b.classTeacherId.trim() : existing.classTeacherId
    };
    validateReferences(existing.schoolId, candidate);
    const record: AcademicCombination = {
      ...existing,
      teacherIds: candidate.teacherIds ?? [],
      subjects: candidate.subjects ?? [],
      classTeacherId: candidate.classTeacherId,
      updatedAt: new Date().toISOString()
    };
    upsertCombination(record);
    syncTeacherAssignments(record, actor);
    await mirrorCombination(record);
    audit(req, actor, 'ASSIGN_COMBINATION_TEACHERS', record,
      `Assigned ${record.teacherIds.length} teacher(s) to ${record.name}`);
    res.json(viewOf(record.schoolId, record));
  }));

  // Lifecycle actions. There is intentionally NO delete endpoint.
  app.post('/api/combinations/:id/status', write, wrap(async (req, res) => {
    const actor = req.user as UserProfile;
    const existing = combinationOf(req, req.params.id);
    const action = str(bodyOf(req).action, 'Action').toUpperCase();
    const reason = typeof bodyOf(req).reason === 'string' ? String(bodyOf(req).reason).trim() : '';
    let status: CombinationStatus;
    if (action === 'ACTIVATE' || action === 'RESTORE') status = 'ACTIVE';
    else if (action === 'DEACTIVATE') status = 'INACTIVE';
    else if (action === 'ARCHIVE') status = 'ARCHIVED';
    else throw new HttpError(400, 'Unknown combination action.');

    const view = viewOf(existing.schoolId, existing);
    const record: AcademicCombination = {
      ...existing,
      status,
      archivedAt: status === 'ARCHIVED' ? new Date().toISOString() : undefined,
      archivedBy: status === 'ARCHIVED' ? actor.id : undefined,
      archiveReason: status === 'ARCHIVED' ? reason : undefined,
      updatedAt: new Date().toISOString()
    };
    upsertCombination(record);
    await mirrorCombination(record);
    audit(req, actor, `${action}_COMBINATION`, record,
      `${action} ${record.name}; ${view.studentCount} historical student(s) preserved`);
    res.json({
      ...viewOf(record.schoolId, record),
      dependentRecords: {
        students: view.studentCount,
        classes: record.classIds.length,
        subjects: record.subjects.length
      }
    });
  }));
}
