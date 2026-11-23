/**
 * End-to-end regression checks for combination management.
 *
 * The test uses a temporary JSON store and disables MariaDB mirrors, so it
 * never touches real school data. It covers the archive/rename rules, the
 * Headteacher module and permissions, registration guards, lifecycle actions,
 * school isolation, teacher-sync, report-card context and the no-delete rule.
 *
 * Run with: npm run test:combinations
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Response } from 'express';
import { NAV_ITEMS, getQuickNavItems } from '../src/navigation';
import { APP_ROUTES } from '../src/routes';
import { isTabAllowedForRole } from '../src/rbac';
import { DELEGATABLE_PERMISSIONS, hasPermission } from '../server/permissions';

type Check = { name: string; passed: boolean; detail?: string };
type ApiResult = { status: number; body: any };

const checks: Check[] = [];
function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const pageSource = readFileSync(path.resolve('src/pages/CombinationManagementPage.tsx'), 'utf-8');
const attendanceSource = readFileSync(path.resolve('src/pages/AttendancePage.tsx'), 'utf-8');
for (const label of [
  'Combination Information', 'Subjects', 'Class and Level', 'Additional Information',
  'Save and Add Another', 'Update Subjects', 'Assign Teachers', 'View Students',
  'Activate', 'Deactivate', 'Archive', 'Restore'
]) {
  check(`Combination UI exposes "${label}"`, pageSource.includes(label));
}
check('Combination Management tab is registered in navigation',
  NAV_ITEMS.some(item => item.id === 'combination-management'));
check('Combination Management has a page route', Boolean(APP_ROUTES['combination-management']));
check('Headteacher can open Combination Management', isTabAllowedForRole('HEAD_TEACHER', 'combination-management'));
check('Teacher cannot open Combination Management', !isTabAllowedForRole('TEACHER', 'combination-management'));
check('Headteacher quick navigation includes Combination Management',
  (getQuickNavItems('HEAD_TEACHER') ?? []).some(item => item.id === 'combination-management'));
check('Attendance page uses the active-class selector', attendanceSource.includes('api.getActiveClasses()'));
const operationalSelectors = [
  ['Attendance', attendanceSource],
  ['Academics', readFileSync(path.resolve('src/pages/AcademicsPage.tsx'), 'utf-8')],
  ['Timetable', readFileSync(path.resolve('src/pages/TimetablePage.tsx'), 'utf-8')],
  ['Communication', readFileSync(path.resolve('src/pages/CommunicationPage.tsx'), 'utf-8')],
  ['Students', readFileSync(path.resolve('src/pages/StudentsPage.tsx'), 'utf-8')]
] as const;
check('Operational class selectors exclude archived classes',
  operationalSelectors.every(([, source]) =>
    source.includes('getActiveClasses()') || source.includes("status ?? 'ACTIVE') === 'ACTIVE'")),
  operationalSelectors.filter(([, source]) =>
    !source.includes('getActiveClasses()') && !source.includes("status ?? 'ACTIVE') === 'ACTIVE'"))
    .map(([name]) => name).join(', '));
check('Headteacher holds combination read/write permissions',
  hasPermission({ role: 'HEAD_TEACHER' } as any, 'combinations.read') &&
  hasPermission({ role: 'HEAD_TEACHER' } as any, 'combinations.write'));
check('Teacher does not hold combination write permission',
  !hasPermission({ role: 'TEACHER' } as any, 'combinations.write'));
check('Combination permissions cannot be delegated',
  !DELEGATABLE_PERMISSIONS.includes('combinations.read') &&
  !DELEGATABLE_PERMISSIONS.includes('combinations.write'));

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-combinations-test-'));
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

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const schoolId = 'school-es-rubengera-01';

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

  function jsonOptions(cookie: string, method: string, payload?: unknown): RequestInit {
    return {
      method,
      headers: { Cookie: cookie, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    };
  }

  const head = cookieFor('user-super-admin');
  const teacher = cookieFor('user-teacher');
  const year = db.getAcademicCollection<any>('academicYears', schoolId)[0];
  const term = db.getAcademicCollection<any>('terms', schoolId).find(item => item.isActive);
  check('Academic year and term are available for integration checks', Boolean(year && term));

  // --- Archived academic structure -------------------------------------------------
  const classes = db.getClasses(schoolId);
  const accountingClasses = classes.filter(item => item.name.toLowerCase().includes('accounting'));
  const accountingNames = ['Y1 Accounting', 'Y2 Accounting', 'Y3 Accounting'];
  check('Exactly three active Accounting classes exist',
    accountingClasses.length === 3 && accountingClasses.every(item => item.status === 'ACTIVE'),
    accountingClasses.map(item => item.name).join(', '));
  check('Accounting classes use Y1/Y2/Y3 names with stable IDs',
    accountingNames.every(name => accountingClasses.some(item => item.name === name)) &&
    ['class-l3-accounting-a', 'class-l4-accounting-a', 'class-l5-accounting-a']
      .every(id => accountingClasses.some(item => item.id === id)));
  check('No legacy Accounting Level 3/4/5 class names remain',
    !classes.some(item => /accounting\s*level\s*[345]/i.test(item.name)));

  const archivedClassIds = ['class-s3-a', 'class-l4-cst'];
  check('Senior 3 and CST classes are archived, not deleted',
    archivedClassIds.every(id => classes.some(item => item.id === id && item.status === 'ARCHIVED')));
  const activeClasses = db.getActiveClasses(schoolId);
  check('Archived classes are absent from active class options',
    archivedClassIds.every(id => !activeClasses.some(item => item.id === id)));

  const seededCombinations = db.getAcademicCollection<any>('combinations', schoolId);
  const archivedCodes = ['CST', 'GSC', 'LAN'];
  check('CST, General Science and Languages combinations are archived',
    archivedCodes.every(code => seededCombinations.some(item => item.code === code && item.status === 'ARCHIVED')));
  check('No archived O-Level or construction combination is active',
    !seededCombinations.some(item => item.status === 'ACTIVE' &&
      (item.educationLevel === 'O-Level' || ['CST', 'GSC', 'LAN'].includes(item.code))));

  const historicalStudents = db.getStudents(schoolId, undefined, undefined, true);
  check('Historical S3 and CST student records are preserved',
    ['std-clarisse-uwera-06', 'std-jeanpaul-habineza-05'].every(id =>
      historicalStudents.some(student => student.id === id)));

  // --- Permission and catalogue APIs ------------------------------------------------
  const headList = await request('/api/combinations?includeArchived=true', { headers: { Cookie: head } });
  check('Headteacher can list active and archived combinations',
    headList.status === 200 && headList.body.some((item: any) => item.status === 'ARCHIVED') &&
    headList.body.some((item: any) => item.status === 'ACTIVE'), `count=${headList.body?.length}`);

  const activeList = await request('/api/combinations/active', { headers: { Cookie: head } });
  check('Active combination endpoint excludes archived options',
    activeList.status === 200 && activeList.body.every((item: any) => item.status === 'ACTIVE') &&
    archivedCodes.every(code => !activeList.body.some((item: any) => item.code === code)));

  const teacherList = await request('/api/combinations', { headers: { Cookie: teacher } });
  check('Teacher cannot manage combinations', teacherList.status === 403, `status=${teacherList.status}`);
  const teacherActive = await request('/api/combinations/active', { headers: { Cookie: teacher } });
  check('Registration staff can load active combinations',
    teacherActive.status === 200 && teacherActive.body.length > 0, `status=${teacherActive.status}`);

  const catalog = await request('/api/combinations/catalog', { headers: { Cookie: head } });
  check('Catalog exposes active classes and archived classes separately',
    catalog.status === 200 && catalog.body.classes.every((item: any) => item.status === 'ACTIVE') &&
    archivedClassIds.every(id => catalog.body.archivedClasses.some((item: any) => item.id === id)));
  check('Catalog exposes subjects and teachers for assignment',
    catalog.body.subjects.length > 0 && catalog.body.teachers.some((item: any) => item.id === 'user-teacher'));

  const attendanceClasses = await request('/api/academics/classes?active=true', { headers: { Cookie: head } });
  check('Attendance class endpoint excludes archived S3 and CST classes',
    attendanceClasses.status === 200 &&
    archivedClassIds.every(id => !attendanceClasses.body.some((item: any) => item.id === id)) &&
    attendanceClasses.body.every((item: any) => (item.status ?? 'ACTIVE') === 'ACTIVE'),
    `count=${attendanceClasses.body?.length}`);

  // --- School isolation --------------------------------------------------------------
  db.createUser({
    id: 'user-combination-other-head', schoolId: 'school-other-combinations',
    email: 'other.combinations@schoolcare.rw', fullName: 'Other School Head',
    role: 'HEAD_TEACHER', phone: '+250 700 000 111', avatarUrl: '', preferredLanguage: 'en', isActive: true
  } as any);
  const otherHead = cookieFor('user-combination-other-head');
  const foreignList = await request('/api/combinations?schoolId=school-es-rubengera-01', { headers: { Cookie: otherHead } });
  check('Combination list is school-isolated', foreignList.status === 200 && foreignList.body.length === 0,
    `count=${foreignList.body?.length}`);
  const foreignDetail = await request('/api/combinations/comb-sod?schoolId=school-es-rubengera-01', { headers: { Cookie: otherHead } });
  check('Another school cannot open this school combination', foreignDetail.status === 404, `status=${foreignDetail.status}`);

  const isolationPayload = {
    name: 'Isolation Check', code: 'ISO-CHECK', educationLevel: 'TVET RTB',
    academicProgramme: 'Isolation', academicYear: year.name, classIds: [], subjects: [], teacherIds: [],
    schoolId: 'school-es-rubengera-01'
  };
  const isolationCreate = await request('/api/combinations?schoolId=school-es-rubengera-01',
    jsonOptions(otherHead, 'POST', isolationPayload));
  check('Browser-supplied schoolId is ignored on create',
    isolationCreate.status === 201 && isolationCreate.body.schoolId === 'school-other-combinations',
    `schoolId=${isolationCreate.body?.schoolId}`);

  // --- Create, duplicate guard and details ------------------------------------------
  const createPayload = {
    name: 'Verification Programme (VER)', code: 'VER', educationLevel: 'TVET RTB',
    academicProgramme: 'Verification', description: 'Temporary integration check.', academicYear: year.name,
    classIds: ['class-l3-sod-a'],
    subjects: [{ subjectId: 'subj-web-dev', isRequired: true, teacherIds: ['user-teacher'] }],
    teacherIds: ['user-teacher'], classTeacherId: 'user-teacher', department: 'Software Development'
  };
  const created = await request('/api/combinations', jsonOptions(head, 'POST', createPayload));
  check('Headteacher can create a combination', created.status === 201 && created.body.id.startsWith('comb-'),
    `status=${created.status}`);
  const combinationId = created.body.id;

  const duplicate = await request('/api/combinations', jsonOptions(head, 'POST', { ...createPayload, name: 'Duplicate' }));
  check('Duplicate combination codes are rejected', duplicate.status === 409, `status=${duplicate.status}`);
  const invalidReference = await request('/api/combinations',
    jsonOptions(head, 'POST', { ...createPayload, code: 'BAD-REF', classIds: ['class-foreign'] }));
  check('Combination cannot reference a class outside the school', invalidReference.status === 400,
    `status=${invalidReference.status}`);

  const detail = await request(`/api/combinations/${combinationId}`, { headers: { Cookie: head } });
  check('Combination details include classes, subjects, teachers and status',
    detail.status === 200 && detail.body.classes.length === 1 && detail.body.subjectDetails.length === 1 &&
    detail.body.teacherDetails.length === 1 && detail.body.status === 'ACTIVE' &&
    detail.body.studentCount === 0, `status=${detail.status}`);

  const patch = await request(`/api/combinations/${combinationId}`,
    jsonOptions(head, 'PATCH', { notes: 'Partial updates preserve stored fields.' }));
  check('Partial update preserves name, classes and subjects',
    patch.status === 200 && patch.body.name === createPayload.name &&
    patch.body.classIds.length === 1 && patch.body.subjects.length === 1 &&
    patch.body.notes === 'Partial updates preserve stored fields.', `status=${patch.status}`);

  const subjectUpdate = await request(`/api/combinations/${combinationId}/subjects`,
    jsonOptions(head, 'POST', { subjects: [
      { subjectId: 'subj-web-dev', isRequired: true, teacherIds: ['user-teacher'] },
      { subjectId: 'subj-math', isRequired: false, teacherIds: ['user-teacher'] }
    ] }));
  check('Combination subjects can be updated', subjectUpdate.status === 200 &&
    subjectUpdate.body.subjects.length === 2, `subjects=${subjectUpdate.body?.subjects?.length}`);

  const teacherAssign = await request(`/api/combinations/${combinationId}/teachers`,
    jsonOptions(head, 'POST', {
      teacherIds: ['user-teacher'], classTeacherId: 'user-teacher',
      subjects: [
        { subjectId: 'subj-web-dev', isRequired: true, teacherIds: ['user-teacher'] },
        { subjectId: 'subj-math', isRequired: false, teacherIds: ['user-teacher'] }
      ]
    }));
  check('Headteacher can assign combination teachers', teacherAssign.status === 200 &&
    teacherAssign.body.teacherIds.includes('user-teacher'), `status=${teacherAssign.status}`);

  const assignment = db.getAcademicCollection<any>('classSubjectAssignments', schoolId).find(item =>
    item.classId === 'class-l3-sod-a' && item.subjectId === 'subj-web-dev');
  check('Teacher assignments sync to existing marks-entry permissions',
    Boolean(assignment) && assignment.teacherIds.includes('user-teacher'));

  const teacherSummary = await request('/api/combinations/teacher-summary', { headers: { Cookie: head } });
  check('Teacher management view shows combination and subject assignments',
    teacherSummary.status === 200 && teacherSummary.body.some((item: any) =>
      item.id === 'user-teacher' && item.combinations.some((entry: any) => entry.id === combinationId)),
    `status=${teacherSummary.status}`);

  // --- Registration guards and metadata ---------------------------------------------
  const baseStudent = {
    firstName: 'Integration', lastName: 'Learner', gender: 'F', dob: '2011-05-12',
    classId: 'class-l3-sod-a', combination: 'Verification Programme (VER)', combinationId
  };
  const archivedClassRegistration = await request('/api/students',
    jsonOptions(head, 'POST', { ...baseStudent, classId: 'class-s3-a', combination: 'General Science & Languages', combinationId: 'comb-general-science-archived' }));
  check('Registration rejects an archived S3 class', archivedClassRegistration.status === 400,
    archivedClassRegistration.body?.error);
  const archivedCombinationRegistration = await request('/api/students',
    jsonOptions(head, 'POST', { ...baseStudent, combination: 'Building & Construction (CST)', combinationId: 'comb-cst-archived' }));
  check('Registration rejects an archived combination', archivedCombinationRegistration.status === 400,
    archivedCombinationRegistration.body?.error);

  const registered = await request('/api/students', jsonOptions(head, 'POST', baseStudent));
  check('Registration accepts an active managed combination', registered.status === 201,
    `status=${registered.status}`);
  check('New student stores combination and programme metadata',
    registered.body.combinationId === combinationId &&
    registered.body.educationLevel === 'TVET RTB' &&
    registered.body.academicProgramme === 'Verification', registered.body?.error);
  const registeredStudentId = registered.body.id;

  const studentsView = await request(`/api/combinations/${combinationId}/students`, { headers: { Cookie: head } });
  check('Combination student view reflects the new registration',
    studentsView.status === 200 && studentsView.body.studentCount === 1 &&
    studentsView.body.students[0].id === registeredStudentId);
  const preservedHistorical = await request('/api/combinations/comb-cst-archived/students', { headers: { Cookie: head } });
  check('Archived combination student view preserves historical learners',
    preservedHistorical.status === 200 && preservedHistorical.body.students.some((item: any) =>
      item.id === 'std-jeanpaul-habineza-05'));

  // --- Marks and report-card integration -------------------------------------------
  const marksEntry = await request(
    `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=class-l3-sod-a&subjectId=subj-web-dev`,
    { headers: { Cookie: teacher } }
  );
  check('Marks entry includes students from the managed combination',
    marksEntry.status === 200 && marksEntry.body.students.some((item: any) => item.id === registeredStudentId),
    `students=${marksEntry.body?.students?.length}`);

  let lastApproval: ApiResult | null = null;
  for (const subjectId of ['subj-web-dev', 'subj-math']) {
    const entry = await request(
      `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=class-l3-sod-a&subjectId=${subjectId}`,
      { headers: { Cookie: teacher } }
    );
    const marks = entry.body.students.flatMap((student: any) =>
      entry.body.categories.map((category: any) => ({
        studentId: student.id, categoryId: category.id,
        score: Math.round(category.maxMarks * 0.8), attendanceStatus: 'PRESENT'
      })));
    const submitted = await request('/api/academics/marks/save', jsonOptions(teacher, 'POST', {
      yearId: year.id, termId: term.id, classId: 'class-l3-sod-a', subjectId,
      marks, action: 'SUBMIT'
    }));
    check(`Synced teacher can submit ${subjectId} marks for the combination class`,
      submitted.status === 200 && submitted.body.submission.status === 'SUBMITTED', `status=${submitted.status}`);
    lastApproval = await request(`/api/academics/submissions/${submitted.body.submission.id}/approve`,
      jsonOptions(head, 'POST', { notes: 'Verified for combination regression check.' }));
    check(`Headteacher can approve ${subjectId} marks`, lastApproval.status === 200,
      `status=${lastApproval.status}`);
  }
  const approved = lastApproval!;

  const generated = await request('/api/academics/reports/generate', jsonOptions(head, 'POST', {
    yearId: year.id, termId: term.id, classId: 'class-l3-sod-a'
  }));
  const cards = await request(`/api/academics/reports/cards?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: head } });
  const card = (cards.body as any[]).find(item => item.studentId === registeredStudentId);
  check('Report cards are generated for registered combination students',
    generated.status === 200 && Boolean(card),
    `status=${generated.status} approvedCards=${approved.body?.generatedReportCards} missing=${JSON.stringify(generated.body?.missingByClass ?? generated.body?.error)}`);
  check('Report card captures combination, programme and academic level',
    Boolean(card) && card.combination === createPayload.name && card.programme === 'Verification' &&
    card.educationLevel === 'TVET RTB' && card.academicLevel === 'Level 3 RTB',
    card ? `${card.combination} / ${card.programme} / ${card.academicLevel}` : 'missing card');

  // --- Lifecycle without deletion ----------------------------------------------------
  const deactivated = await request(`/api/combinations/${combinationId}/status`,
    jsonOptions(head, 'POST', { action: 'DEACTIVATE', reason: 'Regression check' }));
  const activeAfterDeactivate = await request('/api/combinations/active', { headers: { Cookie: head } });
  check('Deactivated combination is hidden from registration options',
    deactivated.status === 200 && deactivated.body.status === 'INACTIVE' &&
    !activeAfterDeactivate.body.some((item: any) => item.id === combinationId));

  const archived = await request(`/api/combinations/${combinationId}/status`,
    jsonOptions(head, 'POST', { action: 'ARCHIVE', reason: 'Season ended' }));
  check('Archiving reports preserved dependent records without deletion',
    archived.status === 200 && archived.body.status === 'ARCHIVED' &&
    archived.body.dependentRecords.students === 1 && Boolean(archived.body.archivedAt));
  const archivedDetail = await request(`/api/combinations/${combinationId}`, { headers: { Cookie: head } });
  const cardsAfterArchive = await request(`/api/academics/reports/cards?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: head } });
  check('Archived combination keeps student, marks and report-card history',
    Boolean(card) && archivedDetail.status === 200 && archivedDetail.body.studentCount === 1 &&
    cardsAfterArchive.body.some((item: any) => item.id === card.id));

  const restored = await request(`/api/combinations/${combinationId}/status`,
    jsonOptions(head, 'POST', { action: 'RESTORE', reason: 'Reopened intake' }));
  const activeAfterRestore = await request('/api/combinations/active', { headers: { Cookie: head } });
  check('Restored combination returns to active registration options',
    restored.status === 200 && restored.body.status === 'ACTIVE' &&
    activeAfterRestore.body.some((item: any) => item.id === combinationId));

  const deleteAttempt = await request(`/api/combinations/${combinationId}`, { headers: { Cookie: head }, method: 'DELETE' });
  const deleteRouteAttempt = await request(`/api/combinations/${combinationId}/delete`,
    jsonOptions(head, 'POST', {}));
  check('No permanent delete endpoint is exposed', deleteAttempt.status === 404 && deleteRouteAttempt.status === 404,
    `statuses=${deleteAttempt.status}/${deleteRouteAttempt.status}`);

  const auditActions = db.getAuditLogs(schoolId).map(item => item.action);
  check('Combination lifecycle actions are audited',
    ['CREATE_COMBINATION', 'UPDATE_COMBINATION_SUBJECTS', 'ASSIGN_COMBINATION_TEACHERS',
      'DEACTIVATE_COMBINATION', 'ARCHIVE_COMBINATION', 'RESTORE_COMBINATION']
      .every(action => auditActions.includes(action)));
} catch (error) {
  check('Combination test completed without throwing', false,
    error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error));
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  const status = item.passed ? 'PASS' : 'FAIL';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`[${status}] ${item.name}${detail}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} combination checks passed.`);
if (failed.length > 0) process.exitCode = 1;
