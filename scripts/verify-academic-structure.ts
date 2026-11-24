/**
 * End-to-end regression checks for centralized academic structure management
 * and assignment-driven teacher marks entry.
 *
 * The test runs against a temporary JSON store with MariaDB disabled. It never
 * touches real school data. It covers managed levels/classes/subjects, allowed
 * and rejected assignments, active-assignment filtering, teacher isolation,
 * marks draft/submit, lifecycle status changes, preserved legacy records and
 * the exact teacher no-assignment message.
 *
 * Run with: npm run test:academic-structure
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Response } from 'express';
import { NO_ASSIGNMENT_MESSAGE } from '../src/teacherMarksMessages';

type Check = { name: string; passed: boolean; detail?: string };
type ApiResult = { status: number; body: any };

const checks: Check[] = [];
function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-structure-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_CONNECT_TIMEOUT_MS = '200';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const schoolId = 'school-es-rubengera-01';
  const suffix = Date.now().toString().slice(-7);
  const sourceRoot = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..');

  function cookieFor(userId: string): string {
    const headers: Record<string, string> = {};
    createSession(userId, {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
      }
    } as unknown as Response);
    return (headers['Set-Cookie'] || '').split(';')[0];
  }

  async function request(apiPath: string, options: RequestInit = {}): Promise<ApiResult> {
    const response = await fetch(`${base}${apiPath}`, options);
    const text = await response.text();
    let body: any = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, body };
  }

  function jsonOptions(cookie: string, method: string, payload: unknown): RequestInit {
    return {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {})
    };
  }

  const head = cookieFor('user-super-admin');
  const teacher = cookieFor('user-teacher');
  const deputy = cookieFor('user-deputy-head');
  const parent = cookieFor('user-parent');

  const year = db.getAcademicCollection<any>('academicYears', schoolId).find(item => item.isActive)
    ?? db.getAcademicCollection<any>('academicYears', schoolId)[0];
  const term = db.getAcademicCollection<any>('terms', schoolId)
    .find(item => item.academicYearId === year.id && item.isActive)
    ?? db.getAcademicCollection<any>('terms', schoolId).find(item => item.academicYearId === year.id);

  // ------------------------------------------------------------------
  // Static UI and migration guards.
  // ------------------------------------------------------------------
  const applyPage = readFileSync(path.join(sourceRoot, 'src/pages/AdmissionsPortalPage.tsx'), 'utf8');
  const removedApplyLabels = [
    'Academic year completed',
    'Year of Senior 3 completion',
    'Senior 3 completion status',
    'Previous combination or subjects',
    'Requested admission level',
    'Preferred academic combination'
  ];
  check('Public Apply form omits all six removed fields',
    removedApplyLabels.every(label => !applyPage.includes(label)),
    `labels found=${removedApplyLabels.filter(label => applyPage.includes(label)).join(', ') || 'none'}`);

  const teacherPage = readFileSync(path.join(sourceRoot, 'src/pages/TeacherAcademicsPage.tsx'), 'utf8');
  const marksPages = readFileSync(path.join(sourceRoot, 'src/pages/TeacherMarksPages.tsx'), 'utf8');
  const messageSource = readFileSync(path.join(sourceRoot, 'src/teacherMarksMessages.ts'), 'utf8');
  check('Teacher marks screens use the exact no-assignment message',
    teacherPage.includes('NO_ASSIGNMENT_MESSAGE') && marksPages.includes('NO_ASSIGNMENT_MESSAGE')
      && messageSource.includes(NO_ASSIGNMENT_MESSAGE));
  check('Teacher marks chain uses searchable API-backed selectors',
    teacherPage.includes('<SearchableSelect') && marksPages.includes('<SearchableSelect')
      && teacherPage.includes('getMyAssignments({ yearId, termId })'));
  check('Dependent selections are cleared when a parent changes',
    teacherPage.includes("clearDependents('combination')") && teacherPage.includes("clearDependents('level')")
      && marksPages.includes("clearDependents('combination')"));
  check('Teacher marks navigation uses the registered route id',
    marksPages.includes("onNavigate('teacher-marks-management')")
      && !marksPages.includes("onNavigate('marks-management')"));

  const adminPage = readFileSync(path.join(sourceRoot, 'src/pages/AcademicAdminPage.tsx'), 'utf8');
  check('Academic admin manages the full structure with confirmations and history',
    adminPage.includes('<SearchableSelect') && adminPage.includes('api.getClassLevels()')
      && adminPage.includes('api.createClassLevel') && adminPage.includes('api.setClassStatus')
      && adminPage.includes('api.setSubjectStatus') && adminPage.includes('api.updateAssignment')
      && adminPage.includes('<ConfirmDialog') && adminPage.includes('<HistoryDialog'));

  const migration = readFileSync(path.join(sourceRoot, 'mysql/migrations/013_academic_structure.sql'), 'utf8');
  check('Structure migration is additive and idempotent',
    migration.includes('CREATE TABLE IF NOT EXISTS') && migration.includes('ADD COLUMN')
      && !/DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM/i.test(migration));

  // ------------------------------------------------------------------
  // Existing records and derived levels.
  // ------------------------------------------------------------------
  const originalClassIds = db.getClasses(schoolId).map(item => item.id);
  const originalSubjectIds = db.getSubjects(schoolId).map(item => item.id);
  const originalAssignmentIds = db.getAcademicCollection<any>('classSubjectAssignments', schoolId).map(item => item.id);
  const originalStudentCount = db.getStudents(schoolId).length;

  const levelsResponse = await request('/api/academics/class-levels', { headers: { Cookie: head } });
  const derivedLevels = Array.isArray(levelsResponse.body) ? levelsResponse.body : [];
  check('Managed class levels are derived from existing classes',
    levelsResponse.status === 200 && derivedLevels.length >= 3
      && derivedLevels.some((item: any) => /L3/i.test(item.code))
      && derivedLevels.some((item: any) => /Y1/i.test(item.name)),
    `levels=${derivedLevels.length}`);

  const legacyS3 = db.getClasses(schoolId).find(item => item.id === 'class-s3-a');
  const linkedLegacyClass = db.getClasses(schoolId).find(item => item.id === 'class-l4-sod-a');
  check('Legacy classes keep stable IDs, links and archived status',
    Boolean(legacyS3 && legacyS3.status === 'ARCHIVED'
      && linkedLegacyClass?.levelId && linkedLegacyClass?.academicYearId),
    `s3=${legacyS3?.status} levelLink=${Boolean(linkedLegacyClass?.levelId)}`);

  const subjectResponse = await request('/api/academics/subjects', { headers: { Cookie: head } });
  check('Subjects carry default status and empty structure links',
    subjectResponse.status === 200 && subjectResponse.body.length > 0
      && subjectResponse.body.every((item: any) => item.status && Array.isArray(item.combinationIds) && Array.isArray(item.levelIds)),
    `subjects=${subjectResponse.body?.length}`);

  // ------------------------------------------------------------------
  // Permission enforcement.
  // ------------------------------------------------------------------
  const teacherLevelAttempt = await request('/api/academics/class-levels',
    jsonOptions(teacher, 'POST', { name: 'Denied', code: 'DENIED' }));
  check('Teachers cannot create managed class levels', teacherLevelAttempt.status === 403,
    `status=${teacherLevelAttempt.status}`);

  const teacherAssignmentList = await request('/api/academics/assignments', { headers: { Cookie: teacher } });
  check('Teachers cannot browse the full assignment administration list',
    teacherAssignmentList.status === 403, `status=${teacherAssignmentList.status}`);

  const parentWorkspace = await request('/api/academics/my-assignments', { headers: { Cookie: parent } });
  check('Parents cannot open the teacher assignment workspace', parentWorkspace.status === 403,
    `status=${parentWorkspace.status}`);

  // ------------------------------------------------------------------
  // Headteacher-managed combination, level, class and subject records.
  // ------------------------------------------------------------------
  const levelCode = `VERL${suffix}`;
  const levelResult = await request('/api/academics/class-levels',
    jsonOptions(head, 'POST', {
      name: 'Verification Level 4', code: levelCode,
      description: 'Structure verification level', academicProgramme: 'Software Development',
      combinationIds: ['comb-sod'], isActive: true
    }));
  const level = levelResult.body;
  check('Headteacher can create an active class level', levelResult.status === 201
    && level.combinationIds.includes('comb-sod') && level.isActive === true,
  `status=${levelResult.status}`);

  const duplicateLevel = await request('/api/academics/class-levels',
    jsonOptions(head, 'POST', { name: 'Duplicate', code: levelCode }));
  check('Duplicate class-level codes are rejected', duplicateLevel.status === 409,
    `status=${duplicateLevel.status}`);

  const invalidLevelLink = await request('/api/academics/class-levels',
    jsonOptions(head, 'POST', { name: 'Invalid Link', code: `BAD${suffix}`, combinationIds: ['comb-missing'] }));
  check('Class levels cannot link to a combination outside the school', invalidLevelLink.status === 400,
    `status=${invalidLevelLink.status}`);

  const subjectCode = `VERS${suffix}`;
  const subjectResult = await request('/api/academics/subjects',
    jsonOptions(head, 'POST', {
      name: 'Verification Subject', code: subjectCode, department: 'Verification',
      credits: 4, passMark: 50, status: 'ACTIVE',
      combinationIds: ['comb-sod'], levelIds: [level.id]
    }));
  const subject = subjectResult.body;
  check('Headteacher can create a subject linked to a combination and level', subjectResult.status === 201
    && subject.combinationIds.includes('comb-sod') && subject.levelIds.includes(level.id),
  `status=${subjectResult.status}`);

  const combinationResult = await request('/api/combinations/comb-sod', { headers: { Cookie: head } });
  const existingCombinationSubjects = combinationResult.body?.subjects ?? [];
  const linkSubject = await request('/api/combinations/comb-sod/subjects',
    jsonOptions(head, 'POST', {
      subjects: [
        ...existingCombinationSubjects.map((item: any) => ({
          subjectId: item.subjectId, isRequired: item.isRequired !== false, teacherIds: item.teacherIds ?? []
        })),
        { subjectId: subject.id, isRequired: true, teacherIds: [] }
      ]
    }));
  check('Managed subject is attached to the combination catalogue',
    linkSubject.status === 200 && (linkSubject.body?.subjects ?? []).some((item: any) => item.subjectId === subject.id),
    `status=${linkSubject.status}`);

  const classResult = await request('/api/academics/classes',
    jsonOptions(head, 'POST', {
      name: 'Verification Structure Class', code: `VERC${suffix}`,
      academicYearId: year.id, combinationId: 'comb-sod', levelId: level.id,
      classTeacherId: 'user-teacher', stream: 'A', room: 'Verification Lab', status: 'ACTIVE'
    }));
  const structureClass = classResult.body;
  check('Headteacher can create a class in the selected year/combination/level',
    classResult.status === 201 && structureClass.levelId === level.id
      && structureClass.combinationId === 'comb-sod' && structureClass.academicYearId === year.id,
    `status=${classResult.status}`);

  const studentResult = await request('/api/students',
    jsonOptions(head, 'POST', {
      firstName: 'Structure', lastName: 'Learner', gender: 'F', dob: '2011-05-12',
      classId: structureClass.id, combinationId: 'comb-sod', combination: 'Software Development (SOD)'
    }));
  check('Enrolled student is placed in the managed class', studentResult.status === 201
    && studentResult.body.classId === structureClass.id
    && studentResult.body.combinationId === 'comb-sod',
  `status=${studentResult.status}`);

  // ------------------------------------------------------------------
  // Assignment validation, active filtering and teacher isolation.
  // ------------------------------------------------------------------
  const wrongCombination = await request('/api/academics/assignments',
    jsonOptions(head, 'POST', {
      academicYearId: year.id, termId: term.id, classId: structureClass.id,
      subjectId: subject.id, combinationId: 'comb-nit', levelId: level.id,
      teacherIds: ['user-teacher']
    }));
  check('Assignments reject a combination that does not match the class', wrongCombination.status === 400,
    `status=${wrongCombination.status}`);

  const wrongSubject = await request('/api/academics/assignments',
    jsonOptions(head, 'POST', {
      academicYearId: year.id, termId: term.id, classId: structureClass.id,
      subjectId: 'subj-kinyarwanda', combinationId: 'comb-sod', levelId: level.id,
      teacherIds: ['user-teacher']
    }));
  check('Assignments reject a subject outside the selected combination', wrongSubject.status === 400,
    `status=${wrongSubject.status}`);

  const teacherAssignmentAttempt = await request('/api/academics/assignments',
    jsonOptions(teacher, 'POST', {
      academicYearId: year.id, termId: term.id, classId: structureClass.id,
      subjectId: subject.id, teacherIds: ['user-teacher']
    }));
  check('Teachers cannot create their own assignments', teacherAssignmentAttempt.status === 403,
    `status=${teacherAssignmentAttempt.status}`);

  const assignmentResult = await request('/api/academics/assignments',
    jsonOptions(head, 'POST', {
      academicYearId: year.id, termId: term.id, classId: structureClass.id,
      subjectId: subject.id, combinationId: 'comb-sod', levelId: level.id,
      teacherIds: ['user-teacher']
    }));
  const assignment = assignmentResult.body;
  check('Valid structure assignment is created with resolved names', assignmentResult.status === 201
    && assignment.combinationName === 'Software Development (SOD)'
    && assignment.levelName === 'Verification Level 4' && assignment.teacherNames.length === 1,
  `status=${assignmentResult.status}`);

  const historyResult = await request(`/api/academics/assignments/${assignment.id}/history`, { headers: { Cookie: head } });
  check('Assignment creation is recorded in history', historyResult.status === 200
    && historyResult.body.some((item: any) => item.action === 'ASSIGNMENT_CREATED'),
  `events=${historyResult.body?.length}`);

  const updatedAssignment = await request(`/api/academics/assignments/${assignment.id}`,
    jsonOptions(head, 'PATCH', { teacherIds: ['user-teacher', 'user-deputy-head'] }));
  check('Assignment teachers can be updated and remain auditable',
    updatedAssignment.status === 200 && updatedAssignment.body.teacherIds.length === 2,
    `status=${updatedAssignment.status}`);
  const updatedHistory = await request(`/api/academics/assignments/${assignment.id}/history`, { headers: { Cookie: head } });
  check('Assignment updates append a history event',
    updatedHistory.body.some((item: any) => item.action === 'ASSIGNMENT_UPDATED'));

  const isolatedAssignmentResult = await request('/api/academics/assignments',
    jsonOptions(head, 'POST', {
      academicYearId: year.id, termId: term.id, classId: structureClass.id,
      subjectId: 'subj-db-design', combinationId: 'comb-sod', levelId: level.id,
      teacherIds: ['user-deputy-head']
    }));
  check('A second teacher can hold a separate assignment in the same class',
    isolatedAssignmentResult.status === 201, `status=${isolatedAssignmentResult.status}`);

  const filteredAdminList = await request(
    `/api/academics/assignments?yearId=${year.id}&termId=${term.id}&combinationId=comb-sod&levelId=${level.id}`,
    { headers: { Cookie: head } }
  );
  const wrongAdminFilter = await request(
    `/api/academics/assignments?yearId=${year.id}&termId=${term.id}&combinationId=comb-nit&levelId=${level.id}`,
    { headers: { Cookie: head } }
  );
  check('Admin assignment list filters by combination and level',
    filteredAdminList.status === 200 && filteredAdminList.body.some((item: any) => item.id === assignment.id)
      && wrongAdminFilter.status === 200
      && !wrongAdminFilter.body.some((item: any) => item.id === assignment.id),
    `matching=${filteredAdminList.body?.length} wrong=${wrongAdminFilter.body?.length}`);

  const myFiltered = await request(
    `/api/academics/my-assignments?yearId=${year.id}&termId=${term.id}&combinationId=comb-sod&levelId=${level.id}`,
    { headers: { Cookie: teacher } }
  );
  const myWrongFilter = await request(
    `/api/academics/my-assignments?yearId=${year.id}&termId=${term.id}&combinationId=comb-nit&levelId=${level.id}`,
    { headers: { Cookie: teacher } }
  );
  check('Teacher workspace filters assignments by combination and level',
    myFiltered.status === 200 && myFiltered.body.assignments.some((item: any) => item.id === assignment.id)
      && myWrongFilter.status === 200 && myWrongFilter.body.assignments.length === 0,
    `matching=${myFiltered.body?.assignments?.length} wrong=${myWrongFilter.body?.assignments?.length}`);
  check('Teacher workspace never returns another teacher’s assignment',
    myFiltered.body.assignments.every((item: any) => item.teacherIds.includes('user-teacher'))
      && !myFiltered.body.assignments.some((item: any) => item.id === isolatedAssignmentResult.body.id));

  const deactivate = await request(`/api/academics/assignments/${assignment.id}`,
    jsonOptions(head, 'PATCH', { isActive: false }));
  const workspaceAfterDeactivate = await request(
    `/api/academics/my-assignments?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: teacher } }
  );
  check('Deactivated assignments disappear from the teacher selector',
    deactivate.status === 200
      && !workspaceAfterDeactivate.body.assignments.some((item: any) => item.id === assignment.id));

  const marksWhileInactive = await request(
    `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=${structureClass.id}&subjectId=${subject.id}`,
    { headers: { Cookie: teacher } }
  );
  check('Teacher cannot open marks for an inactive assignment', marksWhileInactive.status === 403,
    `status=${marksWhileInactive.status}`);

  const reactivate = await request(`/api/academics/assignments/${assignment.id}`,
    jsonOptions(head, 'PATCH', { isActive: true }));
  check('Assignment can be reactivated without losing history',
    reactivate.status === 200 && reactivate.body.history.length >= 3,
    `events=${reactivate.body.history?.length}`);

  // ------------------------------------------------------------------
  // Marks workflow through the managed chain.
  // ------------------------------------------------------------------
  const entryResult = await request(
    `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=${structureClass.id}&subjectId=${subject.id}`,
    { headers: { Cookie: teacher } }
  );
  const entry = entryResult.body;
  check('Marks sheet loads enrolled students and active assessments',
    entryResult.status === 200 && entry.students.some((item: any) => item.id === studentResult.body.id)
      && entry.categories.length > 0,
    `students=${entry.students?.length} categories=${entry.categories?.length}`);

  const isolatedMarks = await request(
    `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=${structureClass.id}&subjectId=subj-db-design`,
    { headers: { Cookie: teacher } }
  );
  const deputyMarks = await request(
    `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=${structureClass.id}&subjectId=subj-db-design`,
    { headers: { Cookie: deputy } }
  );
  check('Teacher isolation blocks an unassigned pair but allows the assigned teacher',
    isolatedMarks.status === 403 && deputyMarks.status === 200,
    `teacher=${isolatedMarks.status} deputy=${deputyMarks.status}`);

  function marksPayload(entryData: any, action: 'DRAFT' | 'SUBMIT', complete: boolean) {
    return {
      yearId: year.id,
      termId: term.id,
      classId: structureClass.id,
      subjectId: subject.id,
      action,
      marks: entryData.students.flatMap((student: any) => entryData.categories.map((category: any) => ({
        studentId: student.id,
        categoryId: category.id,
        score: !complete && category.code === 'EXAM' ? null : Math.round(category.maxMarks * 0.8),
        attendanceStatus: 'PRESENT',
        remark: complete ? 'Verified through the managed structure.' : undefined
      })))
    };
  }

  const draft = await request('/api/academics/marks/save',
    jsonOptions(teacher, 'POST', marksPayload(entry, 'DRAFT', false)));
  check('Teacher saves an incomplete draft through the assigned pair', draft.status === 200
    && draft.body.submission.status === 'DRAFT', `status=${draft.status}`);

  const incompleteSubmit = await request('/api/academics/marks/save',
    jsonOptions(teacher, 'POST', marksPayload(entry, 'SUBMIT', false)));
  check('Incomplete marks cannot be submitted', incompleteSubmit.status === 400,
    `status=${incompleteSubmit.status}`);

  const submitted = await request('/api/academics/marks/save',
    jsonOptions(teacher, 'POST', marksPayload(entry, 'SUBMIT', true)));
  check('Complete marks can be submitted for approval', submitted.status === 200
    && submitted.body.submission.status === 'SUBMITTED', `status=${submitted.status}`);

  // ------------------------------------------------------------------
  // Lifecycle status changes must never destroy existing records.
  // ------------------------------------------------------------------
  const archiveSubject = await request(`/api/academics/subjects/${subject.id}/status`,
    jsonOptions(head, 'PATCH', { status: 'ARCHIVED' }));
  const workspaceAfterSubjectArchive = await request(
    `/api/academics/my-assignments?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: teacher } }
  );
  const saveArchivedSubject = await request('/api/academics/marks/save',
    jsonOptions(teacher, 'POST', marksPayload(entry, 'DRAFT', true)));
  check('Archived subjects disappear from selectors and reject new marks',
    archiveSubject.status === 200
      && !workspaceAfterSubjectArchive.body.assignments.some((item: any) => item.subjectId === subject.id)
      && saveArchivedSubject.status === 400,
    `status=${archiveSubject.status} save=${saveArchivedSubject.status}`);

  const restoreSubject = await request(`/api/academics/subjects/${subject.id}/status`,
    jsonOptions(head, 'PATCH', { status: 'ACTIVE' }));
  check('Archived subject can be restored', restoreSubject.status === 200 && restoreSubject.body.status === 'ACTIVE',
    `status=${restoreSubject.status}`);

  const archiveClass = await request(`/api/academics/classes/${structureClass.id}/status`,
    jsonOptions(head, 'PATCH', { status: 'ARCHIVED' }));
  const workspaceAfterClassArchive = await request(
    `/api/academics/my-assignments?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: teacher } }
  );
  const saveArchivedClass = await request('/api/academics/marks/save',
    jsonOptions(teacher, 'POST', marksPayload(entry, 'DRAFT', true)));
  check('Archived classes disappear from selectors and reject new marks',
    archiveClass.status === 200
      && !workspaceAfterClassArchive.body.assignments.some((item: any) => item.classId === structureClass.id)
      && saveArchivedClass.status === 400,
    `status=${archiveClass.status} save=${saveArchivedClass.status}`);

  const restoreClass = await request(`/api/academics/classes/${structureClass.id}/status`,
    jsonOptions(head, 'PATCH', { status: 'ACTIVE' }));
  check('Archived class can be restored', restoreClass.status === 200 && restoreClass.body.status === 'ACTIVE',
    `status=${restoreClass.status}`);

  check('Legacy records remain intact after structure changes',
    originalClassIds.every(id => db.getClasses(schoolId).some(item => item.id === id))
      && originalSubjectIds.every(id => db.getSubjects(schoolId).some(item => item.id === id))
      && originalAssignmentIds.every(id =>
        db.getAcademicCollection<any>('classSubjectAssignments', schoolId).some(item => item.id === id))
      && db.getStudents(schoolId).length > originalStudentCount,
    `students=${originalStudentCount} -> ${db.getStudents(schoolId).length}`);

  check('Submitted marks remain stored after lifecycle changes',
    db.getAcademicCollection<any>('markSubmissions', schoolId).some(item =>
      item.classId === structureClass.id && item.subjectId === subject.id && item.status === 'SUBMITTED')
      && db.getAcademicCollection<any>('marks', schoolId).some(item =>
        item.classId === structureClass.id && item.subjectId === subject.id));

  const auditActions = db.getAuditLogs(schoolId).map(item => item.action);
  const requiredAuditActions = ['CREATE_CLASS_LEVEL', 'CREATE_CLASS', 'CREATE_SUBJECT', 'ASSIGN_TEACHER_SUBJECT',
    'SET_SUBJECT_STATUS', 'SAVE_MARKS_DRAFT', 'SUBMIT_MARKS'];
  check('Marks and structure actions are audited',
    requiredAuditActions.every(action => auditActions.includes(action)),
    `missing=${requiredAuditActions.filter(action => !auditActions.includes(action)).join(', ') || 'none'}`);
} catch (error) {
  check('Academic structure verification completed without a runtime error', false,
    error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  console.log(`[${item.passed ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} academic structure checks passed.`);
if (failed.length > 0) process.exit(1);
