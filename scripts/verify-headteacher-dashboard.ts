import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';

type Check = { name: string; passed: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

async function main(): Promise<void> {
  process.env.SCHOOLCARE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-headteacher-'));
  process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');

  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  function cookieFor(userId: string): string {
    const headers: Record<string, string> = {};
    createSession(userId, {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
      }
    } as unknown as Response);
    return (headers['Set-Cookie'] || '').split(';')[0];
  }

  async function request(apiPath: string, cookie?: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${apiPath}`, {
      ...init,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) }
    });
    const text = await response.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      // retain raw text for diagnostics
    }
    return { status: response.status, body };
  }

  const headteacherCookie = cookieFor('user-super-admin');
  const teacherCookie = cookieFor('user-teacher');

  const anonymous = await request('/api/dashboard/headteacher');
  check('Headteacher dashboard requires authentication', anonymous.status === 401, `status ${anonymous.status}`);

  const teacher = await request('/api/dashboard/headteacher', teacherCookie);
  check('Teacher cannot access the Headteacher dashboard', teacher.status === 403, `status ${teacher.status}`);

  const summary = await request('/api/dashboard/headteacher', headteacherCookie);
  check('Headteacher dashboard returns 200', summary.status === 200, `status ${summary.status}`);

  const sessionProfile = await request('/api/auth/me', headteacherCookie);
  check(
    'Headteacher session uses the new personal name',
    sessionProfile.body?.user?.fullName === 'MUNYENTWARI Olivier' &&
      sessionProfile.body?.user?.firstName === 'MUNYENTWARI' &&
      sessionProfile.body?.user?.lastName === 'Olivier',
    JSON.stringify(sessionProfile.body?.user)
  );
  check(
    'Headteacher role and email are unchanged',
    sessionProfile.body?.user?.role === 'HEAD_TEACHER' &&
      sessionProfile.body?.user?.email === 'esrubengera@gmail.com',
    JSON.stringify({
      role: sessionProfile.body?.user?.role,
      email: sessionProfile.body?.user?.email
    })
  );

  const staffAccounts = await request('/api/staff/accounts', headteacherCookie);
  check(
    'Staff Management displays the new Headteacher name',
    Array.isArray(staffAccounts.body) &&
      staffAccounts.body.some((item: any) =>
        item.role === 'HEAD_TEACHER' && item.user?.fullName === 'MUNYENTWARI Olivier'
      ),
    JSON.stringify(staffAccounts.body?.find((item: any) => item.role === 'HEAD_TEACHER')?.user)
  );

  check(
    'Dashboard exposes all required summary groups',
    Boolean(
      summary.body?.generatedAt &&
        summary.body?.totals &&
        summary.body?.attendance &&
        summary.body?.academics &&
        summary.body?.performance &&
        summary.body?.attention &&
        summary.body?.approvals &&
        Array.isArray(summary.body?.activities) &&
        Array.isArray(summary.body?.notifications) &&
        Array.isArray(summary.body?.events)
    ),
    Object.keys(summary.body ?? {}).join(', ')
  );
  check(
    'Dashboard exposes the academic period and every expanded total',
    Boolean(summary.body?.academicPeriod) &&
      typeof summary.body.academicPeriod.source === 'string' &&
      'academicYear' in summary.body.academicPeriod &&
      'term' in summary.body.academicPeriod &&
      [
        'students', 'staff', 'teachers', 'parents', 'activeClasses', 'archivedStudents',
        'pendingAdmissions', 'publishedResults', 'pendingAcademicApprovals'
      ].every(key => typeof summary.body?.totals?.[key] === 'number'),
    JSON.stringify({ period: summary.body?.academicPeriod, totals: summary.body?.totals })
  );
  check(
    'Dashboard totals count students, staff, parents and classes',
    typeof summary.body?.totals?.students === 'number' &&
      typeof summary.body?.totals?.staff === 'number' &&
      typeof summary.body?.totals?.parents === 'number' &&
      typeof summary.body?.totals?.activeClasses === 'number',
    JSON.stringify(summary.body?.totals)
  );

  const performance = summary.body?.performance;
  const staffTaskCompletion = performance?.staffTaskCompletion;
  check(
    'Performance charts receive structured, bounded data',
    Array.isArray(performance?.attendanceTrend) &&
      performance.attendanceTrend.every((point: any) =>
        typeof point.date === 'string' &&
        typeof point.present === 'number' &&
        typeof point.total === 'number' &&
        (point.rate === null || (point.rate >= 0 && point.rate <= 100))
      ) &&
      Array.isArray(performance?.classPerformance) &&
      performance.classPerformance.every((row: any) =>
        typeof row.className === 'string' &&
        typeof row.evaluated === 'number' &&
        (row.average === null || typeof row.average === 'number') &&
        (row.passRate === null || (row.passRate >= 0 && row.passRate <= 100))
      ) &&
      performance?.examinationCompletion &&
      ['total', 'draft', 'submitted', 'approved', 'returned'].every(key =>
        typeof performance.examinationCompletion[key] === 'number'
      ) &&
      (staffTaskCompletion === null ||
        (staffTaskCompletion &&
          ['total', 'activated', 'pending'].every(key => typeof staffTaskCompletion[key] === 'number'))),
    JSON.stringify(performance)
  );

  const attention = summary.body?.attention;
  const attentionItems = Array.isArray(attention?.items) ? attention.items : [];
  check(
    'Needs-attention items explain the issue and the next action',
    typeof attention?.total === 'number' &&
      attention.total >= attentionItems.length &&
      attentionItems.length <= 12 &&
      attentionItems.every((item: any) =>
        ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.severity) &&
          ['id', 'category', 'title', 'whatHappened', 'whyItMatters', 'actionNeeded', 'responsible', 'status', 'tab', 'permission']
            .every(key => typeof item[key] === 'string' && item[key].length > 0) &&
          Object.prototype.hasOwnProperty.call(item, 'dueAt')
      ),
    JSON.stringify(attentionItems.map((item: any) => ({ id: item.id, severity: item.severity, tab: item.tab })))
  );

  const schoolId = 'school-es-rubengera-01';
  const expectedPendingAdmissions = db.getAdmissions(schoolId).filter(item =>
    item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW'
  ).length;
  const expectedPublishedResults = db.getReportCards(schoolId).filter(item => Boolean(item.publishedAt)).length;
  check(
    'Expanded totals match the stored school records',
    summary.body?.totals?.pendingAdmissions === expectedPendingAdmissions &&
      summary.body?.totals?.publishedResults === expectedPublishedResults,
    JSON.stringify({
      pendingAdmissions: summary.body?.totals?.pendingAdmissions,
      expectedPendingAdmissions,
      publishedResults: summary.body?.totals?.publishedResults,
      expectedPublishedResults
    })
  );
  const approvalsByType = summary.body?.approvals?.byType ?? {};
  check(
    'Approval counts agree with the approval queue',
    Object.values(approvalsByType).every(count => typeof count === 'number') &&
      summary.body?.approvals?.total === Object.values(approvalsByType).reduce((sum: number, count: any) => sum + count, 0) &&
      summary.body?.totals?.pendingAcademicApprovals ===
        ((approvalsByType.MARKS ?? 0) + (approvalsByType.REPORT_CARD ?? 0)),
    JSON.stringify({ totals: summary.body?.totals, byType: approvalsByType, total: summary.body?.approvals?.total })
  );
  check(
    'Approval Center lists only permitted item types',
    Array.isArray(summary.body?.approvals?.items) &&
      summary.body.approvals.items.every((item: any) =>
        ['ADMISSION', 'MARKS', 'REPORT_CARD', 'SIGNUP', 'STAFF_REQUEST', 'FINANCE'].includes(item.type)
      ),
    JSON.stringify(summary.body?.approvals?.byType)
  );
  check(
    'Approval items link back to an existing workspace tab',
    (summary.body?.approvals?.items ?? []).every((item: any) => Boolean(item.tab && item.permission)),
    JSON.stringify((summary.body?.approvals?.items ?? []).map((item: any) => item.tab))
  );
  check(
    'Dashboard ignores browser-supplied school IDs',
    summary.body?.schoolId === 'school-es-rubengera-01',
    String(summary.body?.schoolId)
  );
  check(
    'Upcoming events are filtered to today or later',
    (summary.body?.events ?? []).every((event: any) => String(event.date).slice(0, 10) >= new Date().toISOString().slice(0, 10)),
    JSON.stringify((summary.body?.events ?? []).map((event: any) => event.date))
  );

  const appointmentByHead = await request('/api/platform/headteacher/appoint', headteacherCookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user-teacher', schoolId: 'school-es-rubengera-01' })
  });
  check(
    'Headteacher cannot appoint another headteacher',
    appointmentByHead.status === 403,
    `status ${appointmentByHead.status}`
  );

  const appointmentByAnonymous = await request('/api/platform/headteacher/appoint', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user-teacher', schoolId: 'school-es-rubengera-01' })
  });
  check('Headteacher appointment requires authentication', appointmentByAnonymous.status === 401, `status ${appointmentByAnonymous.status}`);

  const targetBefore = db.getUserById('user-teacher');
  check('Delegated role change still excludes headteacher promotion', targetBefore?.role === 'TEACHER', String(targetBefore?.role));

  const csvPayload = JSON.stringify({
    csv: 'firstName,lastName,dob,gender,admissionNumber\nCSV,Learner,2010-05-01,F,CSV-TEST-001\nBad,Row,not-a-date,M,CSV-TEST-002'
  });
  const importByTeacher = await request('/api/students/import', teacherCookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: csvPayload
  });
  check('Teacher cannot bulk-import students', importByTeacher.status === 403, `status ${importByTeacher.status}`);

  const importByHead = await request('/api/students/import', headteacherCookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: csvPayload
  });
  check(
    'CSV import creates valid rows and reports invalid rows',
    importByHead.status === 200 && importByHead.body?.created === 1 && importByHead.body?.rejected === 1,
    JSON.stringify(importByHead.body)
  );
  check(
    'Imported student is scoped to the headteacher school',
    db.getStudents('school-es-rubengera-01').some(student => student.admissionNumber === 'CSV-TEST-001'),
    'CSV-TEST-001 not found'
  );

  const healthForHead = await request('/api/health-incidents', headteacherCookie);
  check(
    'Smart Alert Center health signals are readable by the Headteacher',
    healthForHead.status === 200 && Array.isArray(healthForHead.body),
    `status ${healthForHead.status}`
  );

  const notificationsForHead = await request('/api/notifications', headteacherCookie);
  check(
    'Smart Alert Center message signals are readable by the Headteacher',
    notificationsForHead.status === 200 && Array.isArray(notificationsForHead.body),
    `status ${notificationsForHead.status}`
  );

  check(
    'Every attention item can be rendered by the Smart Alert Center',
    Array.isArray(summary.body?.attention?.items) &&
      summary.body.attention.items.every((item: any) =>
        ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.severity) &&
        typeof item.tab === 'string' &&
        typeof item.actionNeeded === 'string'
      ),
    JSON.stringify(summary.body?.attention?.items?.slice(0, 1))
  );

  server.close();
  const failed = checks.filter(item => !item.passed);
  for (const item of failed) console.error(`FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`${checks.length - failed.length}/${checks.length} headteacher dashboard checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
