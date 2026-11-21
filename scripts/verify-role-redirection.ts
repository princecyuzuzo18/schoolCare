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

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-redirect-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');
  const { isTabAllowedForRole } = await import('../src/rbac');
  type UserRole = import('../src/types').UserRole;
  type UserProfile = import('../src/types').UserProfile;

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

  function makeUser(id: string, role: UserRole, schoolId = 'school-es-rubengera-01', isActive = true): UserProfile {
    return {
      id,
      schoolId,
      email: `${id}@redirect.test`,
      fullName: `Test ${role}`,
      role,
      phone: '+250 700 000 000',
      avatarUrl: '',
      preferredLanguage: 'en',
      isActive
    };
  }

  // Expected destinations from the product role/dashboard table.
  const expectedDashboards: Record<UserRole, string> = {
    SUPER_ADMIN: 'dashboard',
    SCHOOL_ADMIN: 'dashboard',
    HEAD_TEACHER: 'dashboard',
    DEPUTY_HEAD: 'dashboard',
    TEACHER: 'attendance',
    NURSE: 'health',
    ACCOUNTANT: 'finance',
    DISCIPLINE_OFFICER: 'discipline',
    SCHOOL_IT: 'dashboard',
    ANIMATEUR: 'events',
    PARENT: 'parent-portal',
    STUDENT: 'student-portal'
  };

  const sessionCookies: Partial<Record<UserRole, string>> = {};

  const anonymous = await request('/api/auth/me');
  check('Session check requires authentication', anonymous.status === 401, `status ${anonymous.status}`);

  const forged = await request('/api/auth/me', { headers: { Cookie: 'schoolcare_session=forged-session-id' } });
  check('Forged session cookie is rejected', forged.status === 401, `status ${forged.status}`);

  for (const [role, expected] of Object.entries(expectedDashboards) as [UserRole, string][]) {
    const id = `redirect-${role.toLowerCase()}`;
    db.createUser(makeUser(id, role));
    const cookie = sessionCookie(id);
    sessionCookies[role] = cookie;
    const response = await request('/api/auth/me', { headers: { Cookie: cookie } });
    const body = response.body || {};

    check(
      `${role} session restores the authenticated account`,
      response.status === 200 && body.user?.role === role,
      `status ${response.status}, role ${body.user?.role}`
    );
    check(
      `${role} is sent to its authorized dashboard`,
      body.defaultDashboard === expected,
      `${body.defaultDashboard}, expected ${expected}`
    );
    check(
      `${role} dashboard URL matches its dashboard`,
      body.dashboardUrl === `/portal#/${expected}`,
      body.dashboardUrl
    );
    check(
      `${role} dashboard passes frontend RBAC validation`,
      isTabAllowedForRole(role, body.defaultDashboard),
      body.defaultDashboard
    );
    check(
      `${role} is never sent to a staff-only dashboard`,
      role === 'PARENT' || role === 'STUDENT'
        ? body.defaultDashboard !== 'dashboard'
        : true,
      body.defaultDashboard
    );
  }

  const inactiveId = 'redirect-inactive';
  db.createUser(makeUser(inactiveId, 'TEACHER', 'school-es-rubengera-01', false));
  const inactive = await request('/api/auth/me', { headers: { Cookie: sessionCookie(inactiveId) } });
  check('Inactive account cannot restore a session', inactive.status === 403, `status ${inactive.status}`);

  // A staff user cannot override tenant scope with a browser-supplied schoolId.
  const schoolA = 'school-es-rubengera-01';
  const schoolB = 'school-other-test';
  db.createUser(makeUser('redirect-scope-teacher', 'TEACHER', schoolA));
  const teacherCookie = sessionCookie('redirect-scope-teacher');

  const ownStudents = await request('/api/students', { headers: { Cookie: teacherCookie } });
  const crossSchoolStudents = await request('/api/students?schoolId=' + encodeURIComponent(schoolB), {
    headers: { Cookie: teacherCookie }
  });
  check(
    'Staff student list loads successfully',
    ownStudents.status === 200 && Array.isArray(ownStudents.body),
    `status ${ownStudents.status}`
  );
  check(
    'Browser-supplied schoolId cannot change staff school scope',
    crossSchoolStudents.status === 200 &&
      JSON.stringify(crossSchoolStudents.body) === JSON.stringify(ownStudents.body),
    `status ${crossSchoolStudents.status}`
  );

  const foreignRecords = (Array.isArray(crossSchoolStudents.body) ? crossSchoolStudents.body : []).filter(
    (student: any) => student.schoolId === schoolB || student.school_id === schoolB
  );
  check('No other school records leak into the response', foreignRecords.length === 0, `${foreignRecords.length} records`);

  const superCookie = sessionCookies.SUPER_ADMIN!;
  const superOtherSchool = await request('/api/students?schoolId=' + encodeURIComponent(schoolB), {
    headers: { Cookie: superCookie }
  });
  check(
    'Platform Super Admin may still target a school explicitly',
    superOtherSchool.status === 200 && Array.isArray(superOtherSchool.body),
    `status ${superOtherSchool.status}`
  );

  const failed = checks.filter(item => !item.passed);
  for (const item of checks) {
    const status = item.passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  }
  console.log('');
  console.log(`${checks.length - failed.length}/${checks.length} role redirection checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
} finally {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
  const { closeMysqlPool } = await import('../server/mysqlConnector');
  await closeMysqlPool();
  rmSync(tempDir, { recursive: true, force: true });
}
