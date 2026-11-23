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
  check(
    'Dashboard exposes all required summary groups',
    Boolean(
      summary.body?.generatedAt &&
        summary.body?.totals &&
        summary.body?.attendance &&
        summary.body?.academics &&
        summary.body?.approvals &&
        Array.isArray(summary.body?.activities) &&
        Array.isArray(summary.body?.notifications) &&
        Array.isArray(summary.body?.events)
    ),
    Object.keys(summary.body ?? {}).join(', ')
  );
  check(
    'Dashboard totals count students, staff, parents and classes',
    typeof summary.body?.totals?.students === 'number' &&
      typeof summary.body?.totals?.staff === 'number' &&
      typeof summary.body?.totals?.parents === 'number' &&
      typeof summary.body?.totals?.activeClasses === 'number',
    JSON.stringify(summary.body?.totals)
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
