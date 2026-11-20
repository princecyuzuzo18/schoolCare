import type { UserProfile, UserRole } from '../src/types';
import {
  canDelegatePermissions,
  isProtectedRole,
  isSchoolLeader
} from '../src/roleCatalog';

export interface PermissionDefinition {
  code: string;
  legacyCode: string;
  labelKey: string;
  restricted: boolean;
}

/**
 * Canonical permissions use dot notation. Legacy colon notation stays valid so
 * existing call sites and stored data keep working during the transition.
 */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { code: 'dashboard.view', legacyCode: 'dashboard:read', labelKey: 'perm_dashboard_view', restricted: false },
  { code: 'school.read', legacyCode: 'school:read', labelKey: 'perm_school_read', restricted: false },
  { code: 'school.write', legacyCode: 'school:write', labelKey: 'perm_school_write', restricted: true },
  { code: 'students.read', legacyCode: 'students:read', labelKey: 'perm_students_read', restricted: false },
  { code: 'students.write', legacyCode: 'students:write', labelKey: 'perm_students_write', restricted: false },
  { code: 'guardians.read', legacyCode: 'guardians:read', labelKey: 'perm_guardians_read', restricted: false },
  { code: 'guardians.write', legacyCode: 'guardians:write', labelKey: 'perm_guardians_write', restricted: false },
  { code: 'attendance.read', legacyCode: 'attendance:read', labelKey: 'perm_attendance_read', restricted: false },
  { code: 'attendance.write', legacyCode: 'attendance:write', labelKey: 'perm_attendance_write', restricted: false },
  { code: 'health.read', legacyCode: 'health:read', labelKey: 'perm_health_read', restricted: false },
  { code: 'health.write', legacyCode: 'health:write', labelKey: 'perm_health_write', restricted: false },
  { code: 'finance.read', legacyCode: 'finance:read', labelKey: 'perm_finance_read', restricted: false },
  { code: 'finance.write', legacyCode: 'finance:write', labelKey: 'perm_finance_write', restricted: false },
  { code: 'academics.read', legacyCode: 'academics:read', labelKey: 'perm_academics_read', restricted: false },
  { code: 'academics.write', legacyCode: 'academics:write', labelKey: 'perm_academics_write', restricted: false },
  { code: 'staff.read', legacyCode: 'staff:read', labelKey: 'perm_staff_read', restricted: false },
  { code: 'staff.write', legacyCode: 'staff:write', labelKey: 'perm_staff_write', restricted: true },
  { code: 'staff.create', legacyCode: 'staff:create', labelKey: 'perm_staff_create', restricted: true },
  { code: 'staff.role.manage', legacyCode: 'staff:role', labelKey: 'perm_staff_role_manage', restricted: true },
  { code: 'discipline.read', legacyCode: 'discipline:read', labelKey: 'perm_discipline_read', restricted: false },
  { code: 'discipline.write', legacyCode: 'discipline:write', labelKey: 'perm_discipline_write', restricted: false },
  { code: 'reports.read', legacyCode: 'reports:read', labelKey: 'perm_reports_read', restricted: false },
  { code: 'audit.read', legacyCode: 'audit:read', labelKey: 'perm_audit_read', restricted: true },
  { code: 'audit.review', legacyCode: 'audit:review', labelKey: 'perm_audit_review', restricted: true },
  { code: 'notifications.read', legacyCode: 'notifications:read', labelKey: 'perm_notifications_read', restricted: false },
  { code: 'notifications.write', legacyCode: 'notifications:write', labelKey: 'perm_notifications_write', restricted: false },
  { code: 'permissions.delegate', legacyCode: 'permissions:delegate', labelKey: 'perm_permissions_delegate', restricted: true },
  { code: 'permissions.revoke', legacyCode: 'permissions:revoke', labelKey: 'perm_permissions_revoke', restricted: true },
  { code: 'invitations.manage', legacyCode: 'invitations:manage', labelKey: 'perm_invitations_manage', restricted: true }
];

const CANONICAL_BY_ALIAS = new Map<string, string>();
for (const permission of PERMISSION_CATALOG) {
  CANONICAL_BY_ALIAS.set(permission.code, permission.code);
  CANONICAL_BY_ALIAS.set(permission.legacyCode, permission.code);
}

const ALL_PERMISSION_CODES = PERMISSION_CATALOG.map(permission => permission.code);

const OPERATIONAL_PERMISSIONS = [
  'dashboard.view',
  'school.read',
  'students.read',
  'students.write',
  'guardians.read',
  'guardians.write',
  'attendance.read',
  'attendance.write',
  'health.read',
  'health.write',
  'finance.read',
  'finance.write',
  'academics.read',
  'academics.write',
  'staff.read',
  'discipline.read',
  'discipline.write',
  'reports.read',
  'notifications.read',
  'notifications.write'
];

const HEADTEACHER_PERMISSIONS = [
  ...OPERATIONAL_PERMISSIONS,
  'school.write',
  'staff.write',
  'staff.create',
  'staff.role.manage',
  'audit.read',
  'audit.review',
  'permissions.delegate',
  'permissions.revoke',
  'invitations.manage'
];

/** Base permissions by role, always stored in canonical dot notation. */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSION_CODES],
  SCHOOL_ADMIN: [...HEADTEACHER_PERMISSIONS],
  HEAD_TEACHER: [...HEADTEACHER_PERMISSIONS],
  DEPUTY_HEAD: [
    'dashboard.view', 'students.read', 'attendance.read', 'academics.read',
    'reports.read', 'discipline.read', 'discipline.write', 'notifications.read'
  ],
  TEACHER: [
    'dashboard.view', 'students.read', 'attendance.read', 'attendance.write',
    'academics.read', 'discipline.read', 'notifications.read'
  ],
  NURSE: [
    'dashboard.view', 'health.read', 'health.write', 'students.read',
    'guardians.read', 'notifications.read', 'notifications.write'
  ],
  ACCOUNTANT: [
    'dashboard.view', 'finance.read', 'finance.write', 'students.read',
    'reports.read', 'notifications.read'
  ],
  DISCIPLINE_OFFICER: [
    'dashboard.view', 'students.read', 'students.write', 'guardians.read',
    'attendance.read', 'attendance.write', 'academics.read', 'discipline.read',
    'discipline.write', 'reports.read', 'notifications.read', 'notifications.write'
  ],
  SCHOOL_IT: [
    'dashboard.view', 'school.read', 'students.read', 'staff.read',
    'academics.read', 'reports.read', 'notifications.read', 'notifications.write'
  ],
  ANIMATEUR: [
    'dashboard.view', 'students.read', 'guardians.read', 'attendance.read',
    'discipline.read', 'reports.read', 'notifications.read', 'notifications.write'
  ],
  PARENT: [
    'dashboard.view', 'students.read', 'guardians.read', 'attendance.read',
    'academics.read', 'finance.read', 'notifications.read'
  ],
  STUDENT: [
    'dashboard.view', 'students.read', 'attendance.read', 'academics.read',
    'notifications.read'
  ]
};

/**
 * Permissions a Headteacher may delegate. Security-sensitive permissions are
 * deliberately excluded: they cannot be passed on to another account.
 */
export const DELEGATABLE_PERMISSIONS = [
  'dashboard.view',
  'school.read',
  'students.read',
  'students.write',
  'guardians.read',
  'guardians.write',
  'attendance.read',
  'attendance.write',
  'health.read',
  'health.write',
  'finance.read',
  'finance.write',
  'academics.read',
  'academics.write',
  'staff.read',
  'discipline.read',
  'discipline.write',
  'reports.read',
  'notifications.read',
  'notifications.write'
];

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export function canonicalPermission(permission: string): string {
  const normalized = permission.trim();
  return CANONICAL_BY_ALIAS.get(normalized) ?? normalized;
}

export function getEffectivePermissions(user?: UserProfile | null): string[] {
  if (!user || user.isActive === false) return [];
  const base = (ROLE_PERMISSIONS[user.role] ?? []).map(canonicalPermission);
  const grants = Array.isArray(user.delegatedPermissions) ? user.delegatedPermissions : [];
  const validGrants = grants
    .filter((permission): permission is string => typeof permission === 'string')
    .map(canonicalPermission)
    .filter(permission => DELEGATABLE_PERMISSIONS.includes(permission));
  return Array.from(new Set([...base, ...validGrants]));
}

export function hasPermission(user: UserProfile | null | undefined, permission: string): boolean {
  if (!user || user.isActive === false) return false;
  const canonical = canonicalPermission(permission);
  return getEffectivePermissions(user).includes(canonical);
}

function assertSameSchool(actor: UserProfile, target: UserProfile): void {
  if (actor.schoolId !== target.schoolId) {
    throw new PermissionError('Cross-school staff administration is not permitted.');
  }
}

export function assertCanGrantPermissions(
  actor: UserProfile,
  target: UserProfile,
  requestedPermissions: string[]
): void {
  if (!canDelegatePermissions(actor.role) || !hasPermission(actor, 'permissions.delegate')) {
    throw new PermissionError('Only the Headteacher may delegate permissions.');
  }
  if (actor.id === target.id) {
    throw new PermissionError('You cannot grant permissions to your own account.');
  }
  if (isProtectedRole(target.role) || isSchoolLeader(target.role)) {
    throw new PermissionError('The Headteacher account cannot be granted or modified by a delegate.');
  }
  assertSameSchool(actor, target);

  if (!Array.isArray(requestedPermissions) || requestedPermissions.length === 0) {
    throw new PermissionError('Select at least one permission to delegate.');
  }

  const canonical = requestedPermissions.map(canonicalPermission);
  const duplicates = canonical.filter((permission, index) => canonical.indexOf(permission) !== index);
  if (duplicates.length > 0) {
    throw new PermissionError('Each permission may only be listed once.');
  }

  for (const permission of canonical) {
    if (!DELEGATABLE_PERMISSIONS.includes(permission)) {
      throw new PermissionError(`'${permission}' cannot be delegated.`);
    }
    if (!hasPermission(actor, permission)) {
      throw new PermissionError(`You cannot delegate '${permission}' because you do not hold it.`);
    }
  }
}

export function assertCanRevokePermissions(actor: UserProfile, target: UserProfile): void {
  if (!canDelegatePermissions(actor.role) || !hasPermission(actor, 'permissions.revoke')) {
    throw new PermissionError('Only the Headteacher may revoke delegated permissions.');
  }
  if (actor.id === target.id) {
    throw new PermissionError('You cannot modify your own permissions.');
  }
  if (isProtectedRole(target.role) || isSchoolLeader(target.role)) {
    throw new PermissionError('The Headteacher account cannot be modified by a delegate.');
  }
  assertSameSchool(actor, target);
}

export function assertCanManageStaff(actor: UserProfile, target?: UserProfile): void {
  if (!hasPermission(actor, 'staff.create')) {
    throw new PermissionError('Only the Headteacher may manage staff accounts.');
  }
  if (target) {
    if (actor.id === target.id) {
      throw new PermissionError('You cannot modify your own staff account.');
    }
    if (isProtectedRole(target.role) || isSchoolLeader(target.role)) {
      throw new PermissionError('The Headteacher account cannot be modified by a delegate.');
    }
    assertSameSchool(actor, target);
  }
}

export function assertCanManageInvitations(actor: UserProfile): void {
  if (!hasPermission(actor, 'invitations.manage')) {
    throw new PermissionError('Only the Headteacher may manage staff invitations.');
  }
}

export function assertCanReviewAudit(actor: UserProfile): void {
  if (!hasPermission(actor, 'audit.review')) {
    throw new PermissionError('Only the Headteacher may review the security audit trail.');
  }
}
