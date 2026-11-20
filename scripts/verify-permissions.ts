import type { UserProfile, UserRole } from '../src/types';
import { canDelegatePermissions, isStaffRole, isSchoolLeader } from '../src/roleCatalog';
import {
  DELEGATABLE_PERMISSIONS,
  PermissionError,
  assertCanGrantPermissions,
  assertCanManageInvitations,
  assertCanActivateStaff,
  assertCanArchiveStaff,
  assertCanAssignStaffRole,
  assertCanCreateStaffRole,
  assertCanEditStaff,
  assertCanManageStaff,
  assertCanReviewAudit,
  assertCanSuspendStaff,
  assertCanViewStaff,
  hasPermission
} from '../server/permissions';

type Check = { name: string; passed: boolean; detail?: string };

const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

function expectDenied(name: string, action: () => void): void {
  try {
    action();
    check(name, false, 'action was unexpectedly allowed');
  } catch (error) {
    check(name, error instanceof PermissionError, error instanceof Error ? error.message : String(error));
  }
}

function user(id: string, role: UserRole, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id,
    schoolId: 'school-es-rubengera-01',
    email: `${id}@schoolcare.rw`,
    fullName: id,
    role,
    phone: '+250 700 000 000',
    avatarUrl: '',
    preferredLanguage: 'en',
    ...overrides
  };
}

const head = user('user-head', 'HEAD_TEACHER');
const teacher = user('user-teacher', 'TEACHER');
const student = user('user-student', 'STUDENT');
const nominatedTeacher = user('user-teacher-2', 'TEACHER');
const legacyHead = user('user-legacy-head', 'HEAD_TEACHER');
const otherSchoolTeacher = user('user-other', 'TEACHER', { schoolId: 'school-other' });

check(
  'Headteacher professional code is the only school leader code',
  isSchoolLeader('HEAD_TEACHER') && !isSchoolLeader('SUPER_ADMIN') && !isSchoolLeader('DEPUTY_HEAD')
);

for (const role of ['TEACHER', 'NURSE', 'ACCOUNTANT', 'DISCIPLINE_OFFICER', 'SCHOOL_IT', 'ANIMATEUR'] as UserRole[]) {
  check(`${role} is a staff role`, isStaffRole(role));
}
check('Parent is not a staff role', !isStaffRole('PARENT'));
check('Student is not a staff role', !isStaffRole('STUDENT'));

for (const permission of [
  'staff.create',
  'staff.role.manage',
  'permissions.delegate',
  'permissions.revoke',
  'invitations.manage',
  'audit.review',
  'school.write'
]) {
  check(`Headteacher holds '${permission}'`, hasPermission(head, permission));
}

check(
  'School administrator and Headteacher can delegate',
  canDelegatePermissions('SCHOOL_ADMIN') && canDelegatePermissions('HEAD_TEACHER') &&
    !canDelegatePermissions('TEACHER')
);
check('Legacy colon permission names still resolve', hasPermission(head, 'students:read'));
check('Delegated dot permission is effective', hasPermission(user('user-nurse', 'NURSE', { delegatedPermissions: ['finance.write'] }), 'finance.write'));
check('Inactive user has no effective permissions', !hasPermission(user('user-off', 'HEAD_TEACHER', { isActive: false }), 'students.read'));
check('Unknown permission is denied', !hasPermission(head, 'superuser.anything'));

for (const sensitivePermission of [
  'staff.role.manage',
  'school.write',
  'permissions.delegate',
  'permissions.revoke',
  'audit.read',
  'audit.review'
]) {
  check(`'${sensitivePermission}' is not delegatable`, !DELEGATABLE_PERMISSIONS.includes(sensitivePermission));
}
for (const scopedPermission of ['staff.create', 'staff.assign_roles', 'invitations.manage']) {
  check(`'${scopedPermission}' is only delegatable with a role scope`, DELEGATABLE_PERMISSIONS.includes(scopedPermission));
}

try {
  assertCanGrantPermissions(head, nominatedTeacher, ['students.read', 'attendance.write']);
  check('Headteacher can delegate operational permissions', true);
} catch (error) {
  check('Headteacher can delegate operational permissions', false, error instanceof Error ? error.message : String(error));
}

expectDenied('Teacher cannot delegate permissions', () =>
  assertCanGrantPermissions(teacher, student, ['students.read'])
);
expectDenied('Headteacher cannot self-grant', () =>
  assertCanGrantPermissions(head, head, ['students.read'])
);
expectDenied('Headteacher cannot grant to another Headteacher', () =>
  assertCanGrantPermissions(head, legacyHead, ['students.read'])
);
expectDenied('Cross-school delegation is denied', () =>
  assertCanGrantPermissions(head, otherSchoolTeacher, ['students.read'])
);
expectDenied('School ownership cannot be delegated', () =>
  assertCanGrantPermissions(head, nominatedTeacher, ['school.write'])
);
expectDenied('Staff creation requires an explicit role scope', () =>
  assertCanGrantPermissions(head, nominatedTeacher, ['staff.create'])
);
expectDenied('Protected staff roles cannot be used as delegation scope', () =>
  assertCanGrantPermissions(
    head,
    nominatedTeacher,
    ['staff.read', 'staff.create', 'staff.assign_roles', 'invitations.manage'],
    ['HEAD_TEACHER' as UserRole]
  )
);
expectDenied('Empty delegation is denied', () =>
  assertCanGrantPermissions(head, nominatedTeacher, [])
);
expectDenied('Duplicate delegation is denied', () =>
  assertCanGrantPermissions(head, nominatedTeacher, ['students.read', 'students:read'])
);

try {
  assertCanManageStaff(head);
  assertCanManageStaff(head, nominatedTeacher);
  check('Headteacher can manage non-protected staff', true);
} catch (error) {
  check('Headteacher can manage non-protected staff', false, error instanceof Error ? error.message : String(error));
}

expectDenied('Teacher cannot manage staff', () => assertCanManageStaff(teacher));
expectDenied('Headteacher cannot modify another Headteacher', () => assertCanManageStaff(head, legacyHead));
expectDenied('Headteacher cannot modify own staff account', () => assertCanManageStaff(head, head));
expectDenied('Teacher cannot manage invitations', () => assertCanManageInvitations(teacher));
expectDenied('Teacher cannot review audit logs', () => assertCanReviewAudit(teacher));

try {
  assertCanManageInvitations(head);
  assertCanReviewAudit(head);
  check('Headteacher can manage invitations and review audit logs', true);
} catch (error) {
  check('Headteacher can manage invitations and review audit logs', false, error instanceof Error ? error.message : String(error));
}

const scopedDeputy = user('user-deputy', 'DEPUTY_HEAD', {
  delegatedPermissions: ['staff.create', 'staff.assign_roles', 'invitations.manage', 'staff.read'],
  delegatedRoleScope: ['TEACHER']
});

function expectAllowed(name: string, action: () => void): void {
  try {
    action();
    check(name, true);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
}

try {
  assertCanGrantPermissions(
    head,
    nominatedTeacher,
    ['staff.read', 'staff.create', 'staff.assign_roles', 'invitations.manage'],
    ['TEACHER']
  );
  check('Headteacher can delegate scoped staff creation', true);
} catch (error) {
  check('Headteacher can delegate scoped staff creation', false, error instanceof Error ? error.message : String(error));
}
expectAllowed('Delegated deputy can create an in-scope teacher', () =>
  assertCanCreateStaffRole(scopedDeputy, 'TEACHER')
);
expectDenied('Delegated deputy cannot create an out-of-scope nurse', () =>
  assertCanCreateStaffRole(scopedDeputy, 'NURSE')
);
expectDenied('Delegated deputy cannot create a Headteacher', () =>
  assertCanCreateStaffRole(scopedDeputy, 'HEAD_TEACHER')
);
expectDenied('Delegated deputy cannot pass on staff-creation powers', () =>
  assertCanGrantPermissions(scopedDeputy, teacher, ['staff.create'], ['TEACHER'])
);
expectDenied('Unauthorised teacher cannot add staff', () => assertCanCreateStaffRole(teacher, 'TEACHER'));
expectDenied('No self-promotion to Headteacher', () =>
  assertCanAssignStaffRole(head, head, 'HEAD_TEACHER')
);
expectDenied('Cross-school staff management is denied', () => assertCanManageStaff(head, otherSchoolTeacher));
expectAllowed('Headteacher can view, edit and change staff status', () => {
  assertCanViewStaff(head);
  assertCanEditStaff(head, teacher);
  assertCanActivateStaff(head, teacher);
  assertCanSuspendStaff(head, teacher);
  assertCanArchiveStaff(head, teacher);
  assertCanAssignStaffRole(head, teacher, 'TEACHER');
});
expectDenied('Deputy without staff.write cannot edit staff', () => assertCanEditStaff(scopedDeputy, teacher));

const revokedDeputy = user('user-revoked', 'DEPUTY_HEAD', { delegatedPermissions: [] });
check(
  'Revoked delegation takes effect immediately',
  !hasPermission(revokedDeputy, 'staff.create') && !hasPermission(revokedDeputy, 'staff.read')
);

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  const status = item.passed ? 'PASS' : 'FAIL';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`[${status}] ${item.name}${detail}`);
}
console.log('');
console.log(`${checks.length - failed.length}/${checks.length} permission checks passed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
