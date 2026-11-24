import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Response } from 'express';

type Check = { name: string; passed: boolean; detail?: string };
type ApiResult = { status: number; body: any };

const checks: Check[] = [];
function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-teacher-marks-'));
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
  const { APP_ROUTES } = await import('../src/routes');
  const { getVisibleNavItems } = await import('../src/navigation');
  const { isTabAllowedForRole } = await import('../src/rbac');

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

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

  function post(payload: unknown, cookie: string): RequestInit {
    return {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {})
    };
  }

  const teacher = cookieFor('user-teacher');
  const head = cookieFor('user-super-admin');
  const deputy = cookieFor('user-deputy-head');
  const parent = cookieFor('user-parent');
  const classId = 'class-l4-sod-a';
  const subjects = ['subj-web-dev', 'subj-db-design', 'subj-math'];
  const year = db.getAcademicCollection<any>('academicYears', 'school-es-rubengera-01')[0];
  const term = db.getAcademicCollection<any>('terms', 'school-es-rubengera-01').find((item: any) => item.isActive);

  const expectedPages: Array<[string, string]> = [
    ['teacher-my-classes', 'My Classes'],
    ['teacher-marks-management', 'Marks Management'],
    ['teacher-examination-results', 'Examination Results'],
    ['teacher-my-subjects', 'My Subjects'],
    ['teacher-submitted-marks', 'Submitted Marks']
  ];
  for (const [id, title] of expectedPages) {
    check(`${title} has a matching route`, APP_ROUTES[id]?.title === title, APP_ROUTES[id]?.title);
    check(`${title} is visible to teachers`, getVisibleNavItems('TEACHER').some(item => item.id === id));
    check(`${title} is hidden from parents`, !isTabAllowedForRole('PARENT', id));
  }

  const assignmentsResponse = await request('/api/academics/my-assignments', { headers: { Cookie: teacher } });
  const assignments = assignmentsResponse.body?.assignments ?? [];
  check('Teacher My Classes data loads', assignmentsResponse.status === 200 && assignments.length >= 3,
    `assignments=${assignments.length}`);
  check('Assignments belong only to the signed-in teacher',
    assignments.every((item: any) => Array.isArray(item.teacherIds) && item.teacherIds.includes('user-teacher')));

  const dashboard = await request('/api/academics/dashboard', { headers: { Cookie: teacher } });
  check('Teacher dashboard uses real assignment statistics',
    dashboard.status === 200 && dashboard.body?.totals?.myAssignments === assignments.length,
    `myAssignments=${dashboard.body?.totals?.myAssignments}`);

  const parentDashboard = await request('/api/academics/dashboard', { headers: { Cookie: parent } });
  check('Parents cannot read the teacher marks dashboard', parentDashboard.status === 403,
    `status=${parentDashboard.status}`);

  const unassigned = await request(
    `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=class-l3-sod-a&subjectId=subj-web-dev`,
    { headers: { Cookie: teacher } }
  );
  check('Marks Management rejects an unassigned class/subject', unassigned.status === 403,
    `status=${unassigned.status}`);

  async function entryFor(subjectId: string) {
    const result = await request(
      `/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=${classId}&subjectId=${subjectId}`,
      { headers: { Cookie: teacher } }
    );
    return { result, entry: result.body };
  }

  function marksFor(entry: any, complete: boolean) {
    return entry.students.flatMap((student: any) => entry.categories.map((category: any) => ({
      studentId: student.id,
      categoryId: category.id,
      score: !complete && category.code === 'EXAM' ? null : Math.round(category.maxMarks * 0.8),
      attendanceStatus: 'PRESENT',
      remark: category.code === 'EXAM' && complete ? 'Consistent practical work.' : undefined
    })));
  }

  function savePayload(entry: any, action: 'DRAFT' | 'SUBMIT', complete: boolean) {
    return {
      yearId: year.id,
      termId: term.id,
      classId,
      subjectId: entry.subject.id,
      marks: marksFor(entry, complete),
      action
    };
  }

  const firstEntry = await entryFor(subjects[0]);
  check('Marks Management loads only students in the assigned class',
    firstEntry.result.status === 200 && firstEntry.entry.students.length > 0 &&
      firstEntry.entry.students.every((student: any) => student.classId === classId),
    `students=${firstEntry.entry.students?.length}`);

  const draft = await request('/api/academics/marks/save', post(savePayload(firstEntry.entry, 'DRAFT', false), teacher));
  check('Teacher can save an incomplete draft', draft.status === 200 && draft.body.submission.status === 'DRAFT',
    `status=${draft.status}`);

  const incompleteSubmit = await request('/api/academics/marks/save', post(savePayload(firstEntry.entry, 'SUBMIT', false), teacher));
  check('Incomplete marks cannot be submitted', incompleteSubmit.status === 400, `status=${incompleteSubmit.status}`);

  const submitted = await request('/api/academics/marks/save', post(savePayload(firstEntry.entry, 'SUBMIT', true), teacher));
  check('Complete marks can be submitted', submitted.status === 200 && submitted.body.submission.status === 'SUBMITTED',
    `status=${submitted.status}`);
  const submissionId = submitted.body.submission.id;

  const locked = await request('/api/academics/marks/save', post(savePayload(firstEntry.entry, 'DRAFT', true), teacher));
  check('Submitted marks are locked against edits', locked.status === 409, `status=${locked.status}`);

  for (const [name, cookie, route] of [
    ['approve', teacher, 'approve'],
    ['return', teacher, 'return'],
    ['review', teacher, 'review']
  ] as const) {
    const denied = await request(`/api/academics/submissions/${submissionId}/${route}`, post({ reason: 'Denied.' }, cookie));
    check(`Teacher cannot ${name} their own marks`, denied.status === 403, `status=${denied.status}`);
  }

  const submissions = await request('/api/academics/submissions', { headers: { Cookie: teacher } });
  check('Submitted Marks lists only the teacher own submissions',
    submissions.status === 200 && submissions.body.length > 0 &&
      submissions.body.every((item: any) => item.teacherId === 'user-teacher'),
    `submissions=${submissions.body?.length}`);
  const parentSubmissions = await request('/api/academics/submissions', { headers: { Cookie: parent } });
  check('Parents cannot list marks submissions', parentSubmissions.status === 403,
    `status=${parentSubmissions.status}`);

  const underReview = await request(`/api/academics/submissions/${submissionId}/review`, post({}, deputy));
  check('Reviewer can move submitted marks under review',
    underReview.status === 200 && underReview.body.status === 'UNDER_REVIEW',
    `status=${underReview.body?.status}`);
  check('Review action is recorded in the audit trail',
    db.getAuditLogs('school-es-rubengera-01').some(item => item.action === 'REVIEW_MARKS'));

  const returned = await request(`/api/academics/submissions/${submissionId}/return`,
    post({ reason: 'Please verify the exam column.' }, deputy));
  check('Reviewer can return marks under review with a reason',
    returned.status === 200 && returned.body.status === 'RETURNED' &&
      returned.body.correctionReason === 'Please verify the exam column.',
    `status=${returned.status}`);

  const resubmitted = await request(`/api/academics/submissions/${submissionId}/submit`, post({}, teacher));
  check('Teacher can resubmit returned marks',
    resubmitted.status === 200 && resubmitted.body.status === 'SUBMITTED',
    `status=${resubmitted.status}`);

  for (const subjectId of subjects.slice(1)) {
    const entry = await entryFor(subjectId);
    const saved = await request('/api/academics/marks/save', post(savePayload(entry.entry, 'SUBMIT', true), teacher));
    check(`Marks submitted for ${subjectId}`, saved.status === 200, `status=${saved.status}`);
  }

  let approvedCount = 0;
  for (const subjectId of subjects) {
    const entry = await entryFor(subjectId);
    const approved = await request(`/api/academics/submissions/${entry.entry.submission.id}/approve`,
      post({ notes: 'Verified.' }, head));
    check(`Reviewer can approve ${subjectId}`, approved.status === 200, `status=${approved.status}`);
    approvedCount += approved.body?.generatedReportCards ?? 0;
  }
  check('Approval generates report cards from approved marks only', approvedCount > 0,
    `generated=${approvedCount}`);

  const cards = await request(`/api/academics/reports/cards?yearId=${year.id}&termId=${term.id}`,
    { headers: { Cookie: head } });
  check('Examination Results are based on approved class records',
    cards.status === 200 && cards.body.length > 0 && cards.body.every((card: any) => card.isApproved),
    `cards=${cards.body?.length}`);

  const teacherPublish = await request('/api/academics/reports/publish-batch',
    post({ ids: cards.body.map((card: any) => card.id) }, teacher));
  check('Teacher cannot publish official results', teacherPublish.status === 403,
    `status=${teacherPublish.status}`);

  const published = await request('/api/academics/reports/publish-batch',
    post({ ids: cards.body.map((card: any) => card.id) }, deputy));
  check('Authorized reviewer can publish official results',
    published.status === 200 && published.body.published >= cards.body.length,
    `published=${published.body?.published}`);

  const results = await request(
    `/api/academics/results?yearId=${year.id}&termId=${term.id}&classId=${classId}&subjectId=${subjects[0]}`,
    { headers: { Cookie: teacher } }
  );
  check('Examination Results loads calculated assigned results',
    results.status === 200 && results.body.students.length > 0 && results.body.classAverage === 80,
    `average=${results.body?.classAverage}`);

  const forbiddenResults = await request(
    `/api/academics/results?yearId=${year.id}&termId=${term.id}&classId=class-l3-sod-a&subjectId=${subjects[0]}`,
    { headers: { Cookie: teacher } }
  );
  check('Examination Results rejects unassigned combinations', forbiddenResults.status === 403,
    `status=${forbiddenResults.status}`);
} catch (error) {
  check('Teacher marks verification completed without a runtime error', false,
    error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  console.log(`[${item.passed ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} teacher marks checks passed.`);
if (failed.length > 0) process.exit(1);
