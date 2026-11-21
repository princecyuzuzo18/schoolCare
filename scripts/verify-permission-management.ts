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

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-perm-mgmt-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');
  const { db } = await import('../server/database');
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

  function withBody(method: string, body: unknown, cookie: string): RequestInit {
    return {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
  }

  const head = db.getUserById('user-super-admin');
  const teacher = db.getUserById('user-teacher');
  if (!head || !teacher) {
    check('Permission management test accounts exist', false);
  } else {
    const headCookie = sessionCookie(head.id);
    const teacherCookie = sessionCookie(teacher.id);

    const unauth = await request('/api/permission-groups');
    check('Anonymous permission-group request is rejected', unauth.status === 401, `status ${unauth.status}`);

    const teacherCreate = await request('/api/permission-groups', withBody('POST', {
      name: 'Unauthorized group',
      permissions: ['students.read']
    }, teacherCookie));
    check('Teacher cannot create a permission group', teacherCreate.status === 403, `status ${teacherCreate.status}`);

    const restricted = await request('/api/permission-groups', withBody('POST', {
      name: 'Forbidden group',
      permissions: ['school.write']
    }, headCookie));
    check('Headteacher cannot put restricted permissions in a group', restricted.status === 403, `status ${restricted.status}`);

    const empty = await request('/api/permission-groups', withBody('POST', {
      name: 'Empty group',
      permissions: []
    }, headCookie));
    check('Empty permission group is rejected', empty.status === 400, `status ${empty.status}`);

    const created = await request('/api/permission-groups', withBody('POST', {
      name: 'Classroom support',
      description: 'View learners and record attendance',
      permissions: ['students.read', 'attendance.write']
    }, headCookie));
    check('Headteacher can create a permission group', created.status === 201, `status ${created.status}`);
    const groupId = created.body?.id;

    const listed = await request('/api/permission-groups', { headers: { Cookie: headCookie } });
    check(
      'Headteacher can list school permission groups',
      listed.status === 200 && Array.isArray(listed.body) && listed.body.some((g: any) => g.id === groupId),
      `status ${listed.status}`
    );

    const teacherList = await request('/api/permission-groups', { headers: { Cookie: teacherCookie } });
    check('Teacher cannot view permission groups', teacherList.status === 403, `status ${teacherList.status}`);

    const assigned = await request(`/api/permission-groups/${groupId}/assign`, withBody('POST', {
      userId: teacher.id
    }, headCookie));
    check('Headteacher can assign a permission group', assigned.status === 200, `status ${assigned.status}`);
    const effective = assigned.body?.user?.delegatedPermissions || [];
    check(
      'Assigned group grants exactly its permissions',
      effective.includes('students.read') && effective.includes('attendance.write') && effective.length === 2,
      JSON.stringify(effective)
    );

    const teacherDelegate = await request('/api/staff/accounts/user-nurse/permissions', withBody('PUT', {
      permissions: ['students.read']
    }, teacherCookie));
    check('Delegated teacher cannot pass permissions on', teacherDelegate.status === 403, `status ${teacherDelegate.status}`);

    const revokeOne = await request(`/api/staff/accounts/${teacher.id}/permissions/revoke-one`, withBody('POST', {
      permission: 'students:read'
    }, headCookie));
    check('Headteacher can revoke a single permission', revokeOne.status === 200, `status ${revokeOne.status}`);
    const afterRevoke = revokeOne.body?.user?.delegatedPermissions || [];
    check(
      'Only the selected permission was revoked',
      !afterRevoke.includes('students.read') && afterRevoke.includes('attendance.write'),
      JSON.stringify(afterRevoke)
    );

    const history = await request(`/api/staff/accounts/${teacher.id}/permission-grants`, { headers: { Cookie: headCookie } });
    check('Grant history is available to the Headteacher', history.status === 200 && Array.isArray(history.body), `status ${history.status}`);
    check(
      'Grant history records who granted each permission',
      Array.isArray(history.body) && history.body.some((entry: any) => entry.grantedBy === head.id),
      JSON.stringify(history.body?.[0] || {})
    );
    check(
      'Grant history records the single-permission revocation',
      Array.isArray(history.body) && history.body.some((entry: any) => entry.revokedBy === head.id),
      ''
    );

    const teacherHistory = await request(`/api/staff/accounts/${teacher.id}/permission-grants`, { headers: { Cookie: teacherCookie } });
    check('Teacher cannot view grant history', teacherHistory.status === 403, `status ${teacherHistory.status}`);

    const archiveGroup = await request(`/api/permission-groups/${groupId}`, {
      method: 'DELETE',
      headers: { Cookie: headCookie }
    });
    check('Headteacher can archive a permission group', archiveGroup.status === 200, `status ${archiveGroup.status}`);
    const afterArchive = await request('/api/permission-groups', { headers: { Cookie: headCookie } });
    check('Archived group is hidden', !afterArchive.body.some((g: any) => g.id === groupId));
    check(
      'Archiving a template does not silently revoke existing staff grants',
      (db.getUserById(teacher.id)?.delegatedPermissions || []).includes('attendance.write')
    );

    const auditActions = db.getAuditLogs(db.getUserById('user-super-admin')!.schoolId).map(entry => entry.action);
    for (const action of [
      'PERMISSION_GROUP_CREATED',
      'PERMISSION_GROUP_ASSIGNED',
      'STAFF_PERMISSION_REVOKED',
      'PERMISSION_GROUP_ARCHIVED'
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
console.log(`${checks.length - failed.length}/${checks.length} permission management checks passed.`);

if (failed.length > 0) process.exitCode = 1;
