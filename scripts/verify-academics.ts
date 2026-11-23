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

// Use the JSON store for this domain test; MariaDB mirrors are verified separately.
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-academics-test-'));
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

  function post(apiPath: string, payload: unknown, cookie: string): RequestInit {
    return {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
  }

  const teacher = cookieFor('user-teacher');
  const head = cookieFor('user-super-admin');
  const deputy = cookieFor('user-deputy-head');
  const parent = cookieFor('user-parent');
  const student = cookieFor('user-student');
  const schoolId = 'school-es-rubengera-01';
  const classId = 'class-l4-sod-a';
  const year = db.getAcademicCollection<any>('academicYears', schoolId)[0];
  const term = db.getAcademicCollection<any>('terms', schoolId).find((item: any) => item.isActive);
  check('Academic seed configuration exists', Boolean(year && term), `${year?.name} / ${term?.name}`);

  const workspace = await request('/api/academics/my-assignments', { headers: { Cookie: teacher } });
  check('Teacher sees only assigned pairs', workspace.status === 200 && workspace.body.assignments.length >= 3,
    `assignments=${workspace.body?.assignments?.length}`);

  const deadlineNotices = await request('/api/notifications', { headers: { Cookie: head } });
  check('Overdue submission reminders are queued in-app',
    deadlineNotices.status === 200 && deadlineNotices.body.some((item: any) =>
      String(item.relatedEntityId || '').startsWith('deadline:')),
    `notices=${deadlineNotices.body?.length}`);

  const deputyDirectory = await request('/api/academics/teachers', { headers: { Cookie: deputy } });
  check('Reviewer-only deputy can load the academic teacher directory',
    deputyDirectory.status === 200 && deputyDirectory.body.length > 0,
    `teachers=${deputyDirectory.body?.length}`);
  const deputyConfig = await request('/api/academics/assessment-categories',
    post('/api/academics/assessment-categories', {
      code: 'DEPUTY_DENIED', name: 'Denied', maxMarks: 1, weightPercentage: 1
    }, deputy));
  check('Reviewer-only deputy cannot change academic configuration', deputyConfig.status === 403,
    `status=${deputyConfig.status}`);

  const forbidden = await request(`/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=class-l3-sod-a&subjectId=subj-web-dev`,
    { headers: { Cookie: teacher } });
  check('Teacher cannot open an unassigned class/subject', forbidden.status === 403, `status=${forbidden.status}`);

  async function entryFor(subjectId: string) {
    const result = await request(`/api/academics/marks-entry?yearId=${year.id}&termId=${term.id}&classId=${classId}&subjectId=${subjectId}`,
      { headers: { Cookie: teacher } });
    return result.body;
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

  const first = await entryFor('subj-web-dev');
  check('Marks entry returns class students and categories',
    first.students.length > 0 && first.categories.length === 3,
    `students=${first.students?.length} categories=${first.categories?.length}`);

  const draft = await request('/api/academics/marks/save', post('/api/academics/marks/save', {
    yearId: year.id, termId: term.id, classId, subjectId: 'subj-web-dev',
    marks: marksFor(first, false), action: 'DRAFT'
  }, teacher));
  check('Teacher can save an incomplete draft', draft.status === 200 && draft.body.submission.status === 'DRAFT',
    `status=${draft.status}`);

  const incompleteSubmit = await request('/api/academics/marks/save', post('/api/academics/marks/save', {
    yearId: year.id, termId: term.id, classId, subjectId: 'subj-web-dev',
    marks: marksFor(first, false), action: 'SUBMIT'
  }, teacher));
  check('Incomplete marks cannot be submitted', incompleteSubmit.status === 400, `status=${incompleteSubmit.status}`);

  const submitted = await request('/api/academics/marks/save', post('/api/academics/marks/save', {
    yearId: year.id, termId: term.id, classId, subjectId: 'subj-web-dev',
    marks: marksFor(first, true), action: 'SUBMIT'
  }, teacher));
  check('Complete marks can be submitted', submitted.status === 200 && submitted.body.submission.status === 'SUBMITTED',
    `status=${submitted.status}`);

  const selfApprove = await request(`/api/academics/submissions/${submitted.body.submission.id}/approve`, post('', {}, teacher));
  check('Teacher cannot approve their own marks', selfApprove.status === 403, `status=${selfApprove.status}`);

  const returned = await request(`/api/academics/submissions/${submitted.body.submission.id}/return`,
    post('', { reason: 'Please verify the exam column.' }, deputy));
  check('Deputy head with marks.review can return marks with a reason',
    returned.status === 200 && returned.body.status === 'RETURNED', `status=${returned.status}`);
  check('Return reason is stored on the submission', returned.body.correctionReason === 'Please verify the exam column.');

  const resubmit = await request('/api/academics/marks/save', post('/api/academics/marks/save', {
    yearId: year.id, termId: term.id, classId, subjectId: 'subj-web-dev',
    marks: marksFor(first, true), action: 'SUBMIT'
  }, teacher));
  check('Returned marks can be corrected and resubmitted', resubmit.status === 200, `status=${resubmit.status}`);

  const teacherGenerate = await request('/api/academics/reports/generate', post('/api/academics/reports/generate', {
    yearId: year.id, termId: term.id
  }, teacher));
  check('Teachers cannot generate school-wide official reports', teacherGenerate.status === 403,
    `status=${teacherGenerate.status}`);

  const deputyGenerate = await request('/api/academics/reports/generate', post('/api/academics/reports/generate', {
    yearId: year.id, termId: term.id
  }, deputy));
  check('Reviewer-only deputy cannot generate official reports', deputyGenerate.status === 403,
    `status=${deputyGenerate.status}`);

  const subjects = ['subj-web-dev', 'subj-db-design', 'subj-math'];
  let finalApproval: ApiResult | null = null;
  for (const subjectId of subjects) {
    let entry = await entryFor(subjectId);
    if (entry.submission?.status !== 'SUBMITTED') {
      const saved = await request('/api/academics/marks/save', post('/api/academics/marks/save', {
        yearId: year.id, termId: term.id, classId, subjectId,
        marks: marksFor(entry, true), action: 'SUBMIT'
      }, teacher));
      check(`Marks submitted for ${subjectId}`, saved.status === 200, `status=${saved.status}`);
      entry = await entryFor(subjectId);
    }
    finalApproval = await request(`/api/academics/submissions/${entry.submission.id}/approve`, post('', { notes: 'Verified.' }, head));
    check(`Marks approved for ${subjectId}`, finalApproval.status === 200, `status=${finalApproval.status}`);
  }

  const generated = finalApproval?.body?.generatedReportCards ?? 0;
  check('Report cards are generated only after all subjects are approved', generated >= first.students.length,
    `generated=${generated}`);

  const beforePublish = await request('/api/academics/reports/cards', { headers: { Cookie: parent } });
  check('Parents cannot see newly generated unpublished report cards',
    beforePublish.status === 200 && beforePublish.body.every((card: any) =>
      Boolean(card.publishedAt) && !(card.academicYear === year.name && card.term === term.name)),
    `cards=${beforePublish.body?.length}`);

  const staffCards = await request(`/api/academics/reports/cards?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: head } });
  const cards = staffCards.body as any[];
  check('Staff can list generated report cards', staffCards.status === 200 && cards.length >= first.students.length,
    `cards=${cards.length}`);
  check('Generated report cards use approved data only', cards.every(card => card.isApproved && card.sourceSubmissionIds?.length === 3));

  const calculatedCard = cards.find(card => card.studentId === 'std-kevin-ishimwe-01');
  check('Backend calculates totals, percentages and grades from stored marks',
    Boolean(calculatedCard) && calculatedCard.overallAverage === 80 && calculatedCard.overallGrade === 'A' &&
      calculatedCard.subjects.every((subject: any) =>
        subject.percentage === 80 && subject.totalMarks === 80 && subject.catMax + subject.testMax + subject.examMax === 100),
    calculatedCard ? `${calculatedCard.overallAverage}% ${calculatedCard.overallGrade}` : 'missing card');

  const publish = await request('/api/academics/reports/publish-batch', post('', { ids: cards.map(card => card.id) }, deputy));
  check('Deputy head with reports.publish can publish report cards in a batch',
    publish.status === 200 && publish.body.published >= cards.length,
    `published=${publish.body?.published}`);

  const regenerate = await request('/api/academics/reports/generate', post('', {
    yearId: year.id, termId: term.id, classIds: [classId]
  }, head));
  check('Published reports can be regenerated from approved marks',
    regenerate.status === 200 && regenerate.body.generated >= cards.length,
    `status=${regenerate.status} generated=${regenerate.body?.generated}`);
  const afterRegenerate = await request(`/api/academics/reports/cards?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: head } });
  const regeneratedCards = (afterRegenerate.body as any[]).filter(card => cards.some(original => original.id === card.id));
  check('Regenerating a report card does not silently unpublish it',
    afterRegenerate.status === 200 && regeneratedCards.length >= cards.length &&
      regeneratedCards.every(card => Boolean(card.publishedAt)),
    `published=${regeneratedCards.filter(card => Boolean(card.publishedAt)).length}/${regeneratedCards.length}`);

  const parentAfter = await request('/api/academics/reports/cards', { headers: { Cookie: parent } });
  check('Parents see only their published, linked children reports',
    parentAfter.status === 200 && parentAfter.body.length > 0 && parentAfter.body.every((card: any) =>
      ['std-kevin-ishimwe-01', 'std-clarisse-uwera-06'].includes(card.studentId) && Boolean(card.publishedAt)),
    `cards=${parentAfter.body?.length}`);

  const studentAfter = await request('/api/academics/reports/cards', { headers: { Cookie: student } });
  check('Students see only their own published report card',
    studentAfter.status === 200 && studentAfter.body.every((card: any) => card.studentId === 'std-kevin-ishimwe-01'),
    `cards=${studentAfter.body?.length}`);

  const otherCard = cards.find(card => card.studentId !== 'std-kevin-ishimwe-01');
  if (otherCard) {
    const denied = await request(`/api/academics/reports/${otherCard.id}`, { headers: { Cookie: student } });
    check('Student cannot open another student report card', denied.status === 403, `status=${denied.status}`);
  }

  const distributions = await request('/api/academics/distributions', { headers: { Cookie: head } });
  const record = distributions.body.find((item: any) => item.reportCardId === cards[0].id);
  check('Report generation creates a distribution record', Boolean(record) && record.status === 'GENERATED', record?.status);

  const portalDistributions = await request('/api/academics/distributions', { headers: { Cookie: parent } });
  check('Parents cannot enumerate distribution tracking records', portalDistributions.status === 403,
    `status=${portalDistributions.status}`);

  const printed = await request(`/api/academics/distributions/${record.id}/printed`, post('', {}, head));
  check('Printing is recorded without auto-collecting',
    printed.status === 200 && printed.body.status === 'PRINTED' && !printed.body.collectedAt,
    printed.body?.status);
  const issued = await request(`/api/academics/distributions/${record.id}/issue`,
    post('', { issuedToName: 'Chantal Mukantabana', relationship: 'Parent' }, head));
  check('Issue records recipient and confirmation fields',
    issued.status === 200 && issued.body.status === 'ISSUED' && issued.body.issuedToName === 'Chantal Mukantabana');
  const collected = await request(`/api/academics/distributions/${record.id}/collect`,
    post('', { collectedByName: 'Chantal Mukantabana' }, head));
  check('Collection requires explicit confirmation',
    collected.status === 200 && collected.body.status === 'COLLECTED' && Boolean(collected.body.collectedAt));

  const printedRegression = await request(`/api/academics/distributions/${record.id}/printed`, post('', {}, head));
  check('Collected reports cannot be moved back to PRINTED', printedRegression.status === 409,
    `status=${printedRegression.status}`);

  const notes = await request(`/api/academics/distributions/${record.id}`, {
    method: 'PATCH', headers: { Cookie: head, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Collected at school office.' })
  });
  check('Distribution note edits are accepted and audited', notes.status === 200 && notes.body.notes === 'Collected at school office.',
    `status=${notes.status}`);

  const actions = db.getAuditLogs(schoolId).map(item => item.action);
  for (const action of ['RETURN_MARKS', 'APPROVE_MARKS', 'GENERATE_REPORT_CARDS', 'PUBLISH_REPORT_CARDS_BATCH',
    'MARK_REPORT_PRINTED', 'ISSUE_REPORT_CARD', 'CONFIRM_REPORT_COLLECTION', 'UPDATE_REPORT_DISTRIBUTION_NOTES']) {
    check(`Audit trail records ${action}`, actions.includes(action));
  }

  const unpublishTarget = cards[1] ?? cards[0];
  const unpublish = await request(`/api/academics/reports/${unpublishTarget.id}/unpublish`,
    post('', { reason: 'Correction required before reissue.' }, deputy));
  check('Publisher can unpublish a report with an audited reason',
    unpublish.status === 200 && !unpublish.body.publishedAt, `status=${unpublish.status}`);
  const parentAfterUnpublish = await request('/api/academics/reports/cards', { headers: { Cookie: parent } });
  check('Unpublished reports disappear from parent portals',
    parentAfterUnpublish.status === 200 && !parentAfterUnpublish.body.some((card: any) => card.id === unpublishTarget.id),
    `cards=${parentAfterUnpublish.body?.length}`);

  const reopenSourceId = cards[0].sourceSubmissionIds?.[cards[0].sourceSubmissionIds.length - 1];
  const reopen = await request(`/api/academics/submissions/${reopenSourceId}/reopen`,
    post('', { reason: 'Marks correction requested.' }, head));
  check('Approved marks can be reopened with a reason',
    reopen.status === 200 && reopen.body.submission.status === 'RETURNED', `status=${reopen.status}`);
  const staleCard = await request(`/api/academics/reports/${cards[0].id}`, { headers: { Cookie: head } });
  check('Reopened marks invalidate the official report card',
    staleCard.status === 200 && !staleCard.body.card.isApproved && !staleCard.body.card.publishedAt &&
      staleCard.body.card.status === 'DRAFT', staleCard.body?.card?.status);
  const republishStale = await request(`/api/academics/reports/${cards[0].id}/publish`, post('', {}, deputy));
  check('A stale report card cannot be republished', republishStale.status === 409,
    `status=${republishStale.status}`);
  const distributionsAfterReopen = await request('/api/academics/distributions', { headers: { Cookie: head } });
  const resetRecord = distributionsAfterReopen.body.find((item: any) => item.id === record.id);
  check('Reopening marks resets distribution to GENERATED', resetRecord?.status === 'GENERATED',
    resetRecord?.status);

  const missingAssignment = await request('/api/academics/assignments', post('/api/academics/assignments', {
    academicYearId: year.id, termId: term.id, classId: 'class-l3-sod-a',
    subjectId: 'subj-web-dev', teacherIds: ['user-teacher']
  }, head));
  const dashboardAfter = await request(`/api/academics/dashboard?yearId=${year.id}&termId=${term.id}`, { headers: { Cookie: head } });
  check('Non-submitters include assignments with no saved marks',
    missingAssignment.status === 201 && dashboardAfter.body.notSubmitted.some((item: any) =>
      item.id === `missing-${missingAssignment.body.id}`),
    `notSubmitted=${dashboardAfter.body?.notSubmitted?.length}`);

  const categoryPatch = await request('/api/academics/assessment-categories/ac-coursework', {
    method: 'PATCH', headers: { Cookie: head, 'Content-Type': 'application/json' },
    body: JSON.stringify({ weightPercentage: 31 })
  });
  await request('/api/academics/assessment-categories/ac-coursework', {
    method: 'PATCH', headers: { Cookie: head, 'Content-Type': 'application/json' },
    body: JSON.stringify({ weightPercentage: 30 })
  });
  check('Existing assessment categories can be edited',
    categoryPatch.status === 200 && categoryPatch.body.weightPercentage === 31,
    `status=${categoryPatch.status}`);

  const laterActions = db.getAuditLogs(schoolId).map(item => item.action);
  for (const action of ['UNPUBLISH_REPORT_CARD', 'REOPEN_APPROVED_MARKS', 'RESET_REPORT_DISTRIBUTION']) {
    check(`Audit trail records ${action}`, laterActions.includes(action));
  }

  db.createUser({
    id: 'user-other-academic-head',
    schoolId: 'school-other-academic-test',
    email: 'other.academic.head@schoolcare.rw',
    fullName: 'Other Academic Head',
    role: 'HEAD_TEACHER',
    phone: '+250 700 111 000',
    avatarUrl: '',
    preferredLanguage: 'en',
    isActive: true
  } as any);
  const otherCookie = cookieFor('user-other-academic-head');
  const foreignYears = await request('/api/academics/years', { headers: { Cookie: otherCookie } });
  check('Academic configuration is school-isolated',
    foreignYears.status === 200 && foreignYears.body.length === 0,
    `years=${foreignYears.body?.length}`);

  const unknownApi = await request('/api/academics/does-not-exist', { headers: { Cookie: head } });
  check('Unknown API endpoints return JSON errors, not the SPA HTML shell',
    unknownApi.status === 404 && String(unknownApi.body?.error || '').includes('Unknown API endpoint'),
    `status=${unknownApi.status}`);
} catch (error) {
  check('Academic workflow test completed without throwing', false, (error as Error).message);
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
console.log(`\n${checks.length - failed.length}/${checks.length} academic workflow checks passed.`);
if (failed.length > 0) process.exitCode = 1;
