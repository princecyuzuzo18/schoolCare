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

  // Stage 1: scoped delegation and expanded staff directory/actions.
  const teacherSummary = await request('/api/staff/summary', { headers: { Cookie: teacherCookie } });
  check('Unauthorised user cannot see staff dashboard stats', teacherSummary.status === 403, `status ${teacherSummary.status}`);
  const headSummary = await request('/api/staff/summary', { headers: { Cookie: headCookie } });
  check(
    'Headteacher can see staff dashboard stats',
    headSummary.status === 200 && typeof headSummary.body?.total === 'number' &&
      typeof headSummary.body?.byRole?.TEACHER === 'number',
    `status ${headSummary.status}`
  );
  const directory = await request('/api/staff/directory?search=teacher&page=1&pageSize=5', {
    headers: { Cookie: headCookie }
  });
  check(
    'Headteacher can search the paginated staff directory',
    directory.status === 200 && Array.isArray(directory.body?.items) && directory.body.pageSize === 5,
    `status ${directory.status}`
  );

  // Give the test teacher a scoped staff-creation grant and verify enforcement.
  const scopedGrant = await request('/api/staff/accounts/user-teacher/permissions', {
    method: 'PUT',
    headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: ['staff.read', 'staff.create', 'staff.assign_roles', 'staff.write', 'invitations.manage'],
      roleScope: ['TEACHER']
    })
  });
  check('Scoped staff-creation delegation succeeds', scopedGrant.status === 200, `status ${scopedGrant.status}`);
  check(
    'Role scope is stored on the account',
    Array.isArray(scopedGrant.body?.user?.delegatedRoleScope) &&
      scopedGrant.body.user.delegatedRoleScope.includes('TEACHER'),
    JSON.stringify(scopedGrant.body?.user?.delegatedRoleScope)
  );

  const outOfScopeCreation = await request('/api/staff/invitations', {
    method: 'POST',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Out Of Scope Nurse',
      email: 'out.scope.nurse@schoolcare.rw',
      phone: '+250 700 999 700',
      role: 'NURSE',
      preferredLanguage: 'en'
    })
  });
  check(
    'Delegated user cannot create an out-of-scope role',
    outOfScopeCreation.status === 403,
    `status ${outOfScopeCreation.status}`
  );

  const scopedCreation = await request('/api/staff/invitations', {
    method: 'POST',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Scoped Teacher',
      email: 'scoped.teacher@schoolcare.rw',
      phone: '+250 700 999 701',
      role: 'TEACHER',
      staffId: 'STF-SCOPED-001',
      responsibilities: ['Mathematics', 'Class monitor'],
      employmentStartDate: '2026-01-15',
      deliveryMode: 'SECURE_ACTIVATION',
      preferredLanguage: 'en'
    })
  });
  check('Delegated user can create an in-scope teacher', scopedCreation.status === 201, `status ${scopedCreation.status}`);
  check(
    'Invitation carries the new staff fields without a token hash',
    scopedCreation.body?.invitation?.staffId === 'STF-SCOPED-001' &&
      Array.isArray(scopedCreation.body?.invitation?.responsibilities) &&
      !('tokenHash' in scopedCreation.body.invitation),
    JSON.stringify(scopedCreation.body?.invitation || {})
  );
  check(
    'Unconfigured delivery is reported as pending',
    scopedCreation.body?.deliveryPending === true && Array.isArray(scopedCreation.body?.delivery),
    JSON.stringify(scopedCreation.body?.delivery)
  );

  const scopedInvitationId = scopedCreation.body?.invitation?.id;
  if (scopedInvitationId) {
    const resend = await request(`/api/staff/invitations/${scopedInvitationId}/resend`, {
      method: 'POST',
      headers: { Cookie: teacherCookie }
    });
    check('Delegated user can resend an invitation', resend.status === 200, `status ${resend.status}`);
    check(
      'Resent invitation rotates the token without exposing a hash',
      typeof resend.body?.token === 'string' && !('tokenHash' in (resend.body?.invitation || {})),
      `status ${resend.status}`
    );
    const oldActivation = await request('/api/staff/invitations/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: scopedCreation.body?.token, password: 'a-valid-length-password' })
    });
    check('Previous activation token stops working after resend', oldActivation.status === 400, `status ${oldActivation.status}`);
  }

  const profileEdit = await request('/api/staff/accounts/user-nurse/profile', {
    method: 'PATCH',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+250 700 111 222', department: 'Mathematics', responsibilities: ['Algebra'] })
  });
  check('Delegated editor can update an in-scope profile', profileEdit.status === 200, `status ${profileEdit.status}`);

  const scopeRevoke = await request('/api/staff/accounts/user-teacher/permissions/revoke', {
    method: 'POST',
    headers: { Cookie: headCookie }
  });
  check('Headteacher can revoke scoped permissions', scopeRevoke.status === 200, `status ${scopeRevoke.status}`);
  const afterRevoke = await request('/api/staff/invitations', {
    method: 'POST',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Revoked Teacher',
      email: 'revoked.teacher@schoolcare.rw',
      phone: '+250 700 999 702',
      role: 'TEACHER',
      preferredLanguage: 'en'
    })
  });
  check('Revoked staff-creation permission is denied immediately', afterRevoke.status === 403, `status ${afterRevoke.status}`);

  const activity = await request('/api/staff/activity', { headers: { Cookie: headCookie } });
  check(
    'Headteacher can review staff activity',
    activity.status === 200 && Array.isArray(activity.body),
    `status ${activity.status}`
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
