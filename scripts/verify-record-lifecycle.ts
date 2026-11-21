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

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-lifecycle-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { getStaffProfile } = await import('../server/staffAdministration');
  const { createSession } = await import('../server/sessions');

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  function sessionCookie(userId: string): string {
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
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body };
  }

  function post(body: unknown, cookie: string): RequestInit {
    return {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
  }

  const schoolId = 'school-es-rubengera-01';
  const actor = db.getUserById('user-super-admin');
  const teacher = db.getUserById('user-teacher');
  const student = db.getStudents(schoolId)[0];
  const guardian = db.getGuardians(schoolId)[0];
  if (!actor || !teacher || !student || !guardian) {
    check('Lifecycle test seed data exists', false, 'missing actor, teacher, student or guardian');
  } else {
    const cookie = sessionCookie(actor.id);
    const teacherCookie = sessionCookie(teacher.id);

    db.setDelegatedPermissions(teacher.id, ['students.read']);
    db.setDelegatedRoleScope(teacher.id, ['TEACHER']);

    const staffArchive = await request(`/api/staff/accounts/${teacher.id}/archive`, post({ reason: 'Left the school' }, cookie));
    check('Headteacher can archive staff with a reason', staffArchive.status === 200, `status ${staffArchive.status}`);
    check('Archived staff account is inactive', db.getUserById(teacher.id)?.isActive === false);
    check('Archived staff profile is preserved', Boolean(getStaffProfile(schoolId, teacher.id)));
    const archivedSession = await request('/api/permissions', { headers: { Cookie: teacherCookie } });
    check('Archived staff session is rejected', archivedSession.status === 403, `status ${archivedSession.status}`);

    const staffRestore = await request(`/api/staff/accounts/${teacher.id}/restore`, {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    check('Headteacher can restore archived staff', staffRestore.status === 200, `status ${staffRestore.status}`);
    check('Restored staff account is active', db.getUserById(teacher.id)?.isActive === true);
    check(
      'Restored staff does not inherit old delegated permissions',
      (db.getUserById(teacher.id)?.delegatedPermissions || []).length === 0 &&
        (db.getStaffAccountByUserId(teacher.id)?.delegatedPermissions || []).length === 0
    );

    const studentArchive = await request(`/api/students/${student.id}/archive`, post({ reason: 'Transferred out' }, cookie));
    check('Headteacher can archive a learner with a reason', studentArchive.status === 200, `status ${studentArchive.status}`);
    check(
      'Archived learner is hidden from the active list but retained by ID',
      !db.getStudents(schoolId).some(item => item.id === student.id) && Boolean(db.getStudentById(student.id))
    );
    check(
      'Archived learner keeps academic and financial history',
      db.getReportCards(schoolId, student.id).length >= 0 && db.getInvoices(schoolId, student.id).length >= 0
    );
    const studentRestore = await request(`/api/students/${student.id}/restore`, {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    check('Headteacher can restore a learner', studentRestore.status === 200, `status ${studentRestore.status}`);
    check('Restored learner appears in active list again', db.getStudents(schoolId).some(item => item.id === student.id));

    const guardianArchive = await request(`/api/guardians/${guardian.id}/archive`, post({ reason: 'No longer a guardian' }, cookie));
    check('Headteacher can archive a parent with a reason', guardianArchive.status === 200, `status ${guardianArchive.status}`);
    check(
      'Archived parent is hidden from active list but link history remains',
      !db.getGuardians(schoolId).some(item => item.id === guardian.id) &&
        db.getGuardiansForStudent(student.id).some(item => item.guardian.id === guardian.id)
    );
    const guardianRestore = await request(`/api/guardians/${guardian.id}/restore`, {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    check('Headteacher can restore a parent', guardianRestore.status === 200, `status ${guardianRestore.status}`);

    const unauthorizedStaffArchive = await request(`/api/staff/accounts/${teacher.id}/archive`, post({ reason: 'Unauthorized' }, teacherCookie));
    check('Teacher cannot archive staff', unauthorizedStaffArchive.status === 403, `status ${unauthorizedStaffArchive.status}`);

    const auditActions = db.getAuditLogs(schoolId).map(entry => entry.action);
    for (const action of [
      'STAFF_ACCOUNT_ARCHIVED',
      'STAFF_ACCOUNT_RESTORED',
      'STUDENT_ARCHIVED',
      'STUDENT_RESTORED',
      'GUARDIAN_ARCHIVED',
      'GUARDIAN_RESTORED'
    ]) {
      check(`Audit trail records ${action}`, auditActions.includes(action));
    }
  }
} finally {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  const status = item.passed ? 'PASS' : 'FAIL';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`[${status}] ${item.name}${detail}`);
}
console.log('');
console.log(`${checks.length - failed.length}/${checks.length} record lifecycle checks passed.`);

if (failed.length > 0) process.exitCode = 1;
