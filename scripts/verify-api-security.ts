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

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-api-test-'));
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

  const headCookie = sessionCookie('user-super-admin');
  const teacherCookie = sessionCookie('user-teacher');
  const legacyCookie = sessionCookie('user-head-teacher');

  const unauthenticated = await request('/api/staff/accounts');
  check('Anonymous staff request is rejected', unauthenticated.status === 401, `status ${unauthenticated.status}`);

  const teacherStaff = await request('/api/staff/accounts', {
    headers: { Cookie: teacherCookie }
  });
  check('Teacher cannot list staff accounts', teacherStaff.status === 403, `status ${teacherStaff.status}`);

  const headStaff = await request('/api/staff/accounts', {
    headers: { Cookie: headCookie }
  });
  check(
    'Headteacher can list staff accounts',
    headStaff.status === 200 && Array.isArray(headStaff.body),
    `status ${headStaff.status}`
  );

  const teacherAudit = await request('/api/audit-logs', {
    headers: { Cookie: teacherCookie }
  });
  check('Teacher cannot review audit logs', teacherAudit.status === 403, `status ${teacherAudit.status}`);

  const headAudit = await request('/api/audit-logs', {
    headers: { Cookie: headCookie }
  });
  check(
    'Headteacher can review audit logs',
    headAudit.status === 200 && Array.isArray(headAudit.body),
    `status ${headAudit.status}`
  );

  const grant = await request('/api/staff/accounts/user-head-teacher/permissions', {
    method: 'PUT',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['students:read'] })
  });
  check('Headteacher can delegate a permission', grant.status === 200, `status ${grant.status}`);
  check(
    'Delegated permission is stored in canonical form',
    Boolean(grant.body?.user?.delegatedPermissions?.includes('students.read')),
    JSON.stringify(grant.body?.user?.delegatedPermissions)
  );

  const selfGrant = await request('/api/staff/accounts/user-super-admin/permissions', {
    method: 'PUT',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['students.read'] })
  });
  check('Headteacher cannot self-grant', selfGrant.status === 403, `status ${selfGrant.status}`);

  const teacherGrant = await request('/api/staff/accounts/user-head-teacher/permissions', {
    method: 'PUT',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['students.read'] })
  });
  check('Teacher cannot grant permissions', teacherGrant.status === 403, `status ${teacherGrant.status}`);

  const protectedGrant = await request('/api/staff/accounts/user-head-teacher/permissions', {
    method: 'PUT',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['staff.create'] })
  });
  check('Sensitive permissions cannot be granted', protectedGrant.status === 403, `status ${protectedGrant.status}`);

  const permissionRevoke = await request('/api/staff/accounts/user-head-teacher/permissions/revoke', {
    method: 'POST',
    headers: { Cookie: headCookie }
  });
  check(
    'Headteacher can revoke delegated permissions',
    permissionRevoke.status === 200,
    `status ${permissionRevoke.status}`
  );

  const roleChange = await request('/api/staff/accounts/user-head-teacher/role', {
    method: 'PATCH',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'TEACHER' })
  });
  check('Headteacher can assign a staff role', roleChange.status === 200, `status ${roleChange.status}`);

  const headteacherPromotion = await request('/api/staff/accounts/user-head-teacher/role', {
    method: 'PATCH',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'HEAD_TEACHER' })
  });
  check(
    'Headteacher role cannot be assigned through the API',
    headteacherPromotion.status === 400,
    `status ${headteacherPromotion.status}`
  );

  const invitation = await request('/api/staff/invitations', {
    method: 'POST',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'API Test Nurse',
      email: 'api.nurse@schoolcare.rw',
      phone: '+250 700 999 888',
      role: 'NURSE',
      preferredLanguage: 'en'
    })
  });
  check('Headteacher can create an invitation', invitation.status === 201, `status ${invitation.status}`);
  check(
    'Invitation response contains an activation token',
    typeof invitation.body?.token === 'string' && invitation.body.token.length >= 40
  );
  check(
    'Invitation response never exposes a token hash',
    invitation.body?.invitation && !('tokenHash' in invitation.body.invitation)
  );

  const teacherInvitation = await request('/api/staff/invitations', {
    method: 'POST',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Unauthorized Teacher',
      email: 'unauthorized@schoolcare.rw',
      phone: '+250 700 999 887',
      role: 'TEACHER',
      preferredLanguage: 'en'
    })
  });
  check('Teacher cannot create invitations', teacherInvitation.status === 403, `status ${teacherInvitation.status}`);

  const invitationId = invitation.body?.invitation?.id;
  const token = invitation.body?.token;
  const invitationRevoke = await request(`/api/staff/invitations/${invitationId}/revoke`, {
    method: 'POST',
    headers: { Cookie: headCookie }
  });
  check(
    'Headteacher can revoke an invitation',
    invitationRevoke.status === 200,
    `status ${invitationRevoke.status}`
  );

  const revokedActivation = await request('/api/staff/invitations/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password: 'a-valid-length-password' })
  });
  check('Revoked invitation cannot be activated', revokedActivation.status === 400, `status ${revokedActivation.status}`);

  const suspension = await request('/api/staff/accounts/user-head-teacher/status', {
    method: 'PATCH',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'SUSPENDED' })
  });
  check('Headteacher can suspend a staff account', suspension.status === 200, `status ${suspension.status}`);

  const suspendedSession = await request('/api/permissions', {
    headers: { Cookie: legacyCookie }
  });
  check('Suspended account cannot use an existing session', suspendedSession.status === 403, `status ${suspendedSession.status}`);

  const auditAfter = await request('/api/audit-logs', {
    headers: { Cookie: headCookie }
  });
  const auditActions = Array.isArray(auditAfter.body)
    ? auditAfter.body.map((entry: { action?: string }) => entry.action)
    : [];
  for (const action of [
    'STAFF_PERMISSIONS_GRANTED',
    'STAFF_PERMISSIONS_REVOKED',
    'STAFF_ROLE_CHANGED',
    'STAFF_INVITATION_CREATED',
    'STAFF_INVITATION_REVOKED',
    'STAFF_ACCOUNT_SUSPENDED'
  ]) {
    check(`Audit trail records ${action}`, auditActions.includes(action));
  }

  const storedGrants = db.getPermissionGrants('school-es-rubengera-01');
  check(
    'Permission grant history is append-only',
    storedGrants.length >= 2 && storedGrants.some(record => record.permissions.includes('students.read')),
    `${storedGrants.length} records`
  );
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
console.log(`${checks.length - failed.length}/${checks.length} API security checks passed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
