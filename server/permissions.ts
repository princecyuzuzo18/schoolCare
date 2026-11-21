import type { UserProfile, UserRole } from '../src/types';
import {
  ASSIGNABLE_STAFF_ROLES,
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
  { code: 'marks.write', legacyCode: 'marks:write', labelKey: 'perm_marks_write', restricted: false },
  { code: 'marks.review', legacyCode: 'marks:review', labelKey: 'perm_marks_review', restricted: true },
  { code: 'reports.publish', legacyCode: 'reports:publish', labelKey: 'perm_reports_publish', restricted: true },
  { code: 'reports.distribute', legacyCode: 'reports:distribute', labelKey: 'perm_reports_distribute', restricted: true },
  { code: 'staff.read', legacyCode: 'staff:read', labelKey: 'perm_staff_read', restricted: false },
  { code: 'staff.write', legacyCode: 'staff:write', labelKey: 'perm_staff_write', restricted: true },
  { code: 'staff.create', legacyCode: 'staff:create', labelKey: 'perm_staff_create', restricted: true },
  { code: 'staff.role.manage', legacyCode: 'staff:role', labelKey: 'perm_staff_role_manage', restricted: true },
  { code: 'staff.activate', legacyCode: 'staff:activate', labelKey: 'perm_staff_activate', restricted: true },
  { code: 'staff.suspend', legacyCode: 'staff:suspend', labelKey: 'perm_staff_suspend', restricted: true },
  { code: 'staff.archive', legacyCode: 'staff:archive', labelKey: 'perm_staff_archive', restricted: true },
  { code: 'staff.assign_roles', legacyCode: 'staff:assign_roles', labelKey: 'perm_staff_assign_roles', restricted: true },
  { code: 'discipline.read', legacyCode: 'discipline:read', labelKey: 'perm_discipline_read', restricted: false },
  { code: 'discipline.write', legacyCode: 'discipline:write', labelKey: 'perm_discipline_write', restricted: false },
  { code: 'reports.read', legacyCode: 'reports:read', labelKey: 'perm_reports_read', restricted: false },
  { code: 'reports.generate', legacyCode: 'reports:generate', labelKey: 'perm_reports_generate', restricted: false },
  { code: 'permissions.view', legacyCode: 'permissions:view', labelKey: 'perm_permissions_view', restricted: false },
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

/**
 * Staff-facing permission names requested by school leadership resolve to the
 * existing canonical codes. This keeps old stored permissions working while
 * exposing the granular vocabulary used in the delegation screen.
 */
const PERMISSION_ALIASES: Record<string, string> = {
  'staff.view': 'staff.read',
  'staff:view': 'staff.read',
  'staff.edit': 'staff.write',
  'staff:edit': 'staff.write',
  'staff.invite': 'invitations.manage',
  'staff:invite': 'invitations.manage',
  'students.view': 'students.read',
  'students:view': 'students.read',
  'students.create': 'students.write',
  'students:create': 'students.write',
  'students.edit': 'students.write',
  'students:edit': 'students.write',
  'parents.view': 'guardians.read',
  'parents:view': 'guardians.read',
  'parents.create': 'guardians.write',
  'parents:create': 'guardians.write',
  'parents.edit': 'guardians.write',
  'parents:edit': 'guardians.write',
  'academics.view': 'academics.read',
  'academics:view': 'academics.read',
  'academics.manage': 'academics.write',
  'academics:manage': 'academics.write',
  'finance.view': 'finance.read',
  'finance:view': 'finance.read',
  'finance.manage': 'finance.write',
  'finance:manage': 'finance.write',
  'health.view': 'health.read',
  'health:view': 'health.read',
  'health.manage': 'health.write',
  'health:manage': 'health.write',
  'discipline.view': 'discipline.read',
  'discipline:view': 'discipline.read',
  'discipline.manage': 'discipline.write',
  'discipline:manage': 'discipline.write',
  'reports.view': 'reports.read',
  'reports:view': 'reports.read'
};
for (const [alias, canonical] of Object.entries(PERMISSION_ALIASES)) {
  CANONICAL_BY_ALIAS.set(alias, canonical);
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
  'marks.write',
  'marks.review',
  'reports.publish',
  'reports.distribute',
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
  'staff.activate',
  'staff.suspend',
  'staff.archive',
  'staff.assign_roles',
  'reports.generate',
  'permissions.view',
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
    'marks.review', 'reports.read', 'reports.publish', 'discipline.read',
    'discipline.write', 'notifications.read'
  ],
  TEACHER: [
    'dashboard.view', 'students.read', 'attendance.read', 'attendance.write',
    'academics.read', 'marks.write', 'discipline.read', 'notifications.read'
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
 * Permissions that may appear in a delegation grant. Staff-management powers
 * are delegatable only by the Headteacher/School Admin and remain subject to a
 * role scope. Platform, school-ownership and further-delegation powers are
 * deliberately excluded.
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
  'marks.write',
  'marks.review',
  'reports.publish',
  'reports.distribute',
  'staff.read',
  'staff.write',
  'staff.create',
  'staff.activate',
  'staff.suspend',
  'staff.archive',
  'staff.assign_roles',
  'invitations.manage',
  'discipline.read',
  'discipline.write',
  'reports.read',
  'reports.generate',
  'permissions.view',
  'notifications.read',
  'notifications.write'
];

/** Only school leadership may pass these powers to another account. */
export const LEADER_ONLY_DELEGATABLE_PERMISSIONS = [
  'staff.write',
  'staff.create',
  'staff.activate',
  'staff.suspend',
  'staff.archive',
  'staff.assign_roles',
  'invitations.manage',
  'permissions.view',
  'reports.generate',
  'marks.review',
  'reports.publish',
  'reports.distribute'
];

const STAFF_CREATION_PERMISSIONS = ['staff.create', 'staff.assign_roles', 'invitations.manage'];

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

function isPlatformAdminRole(role?: UserRole | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN';
}

function isSchoolPermissionAdministrator(actor: UserProfile): boolean {
  return isSchoolLeader(actor.role) || actor.role === 'SCHOOL_ADMIN' || actor.role === 'SUPER_ADMIN';
}

function assertManageableTarget(actor: UserProfile, target: UserProfile): void {
  if (actor.id === target.id) {
    throw new PermissionError('You cannot modify your own staff account or permissions.');
  }
  if (isProtectedRole(target.role) || isSchoolLeader(target.role)) {
    throw new PermissionError('The Headteacher account cannot be modified by a delegate.');
  }
  if (isPlatformAdminRole(target.role) && actor.role !== 'SUPER_ADMIN') {
    throw new PermissionError('Only the Platform Super Admin may manage platform administrator accounts.');
  }
  assertSameSchool(actor, target);
}

function assertValidRoleScope(roleScope: UserRole[]): void {
  if (!Array.isArray(roleScope) || roleScope.length === 0) {
    throw new PermissionError('Choose at least one staff role this administrator may manage.');
  }
  const canonicalScope = [...new Set(roleScope)];
  if (canonicalScope.length !== roleScope.length) {
    throw new PermissionError('Each staff role may only be listed once.');
  }
  for (const role of canonicalScope) {
    if (!ASSIGNABLE_STAFF_ROLES.includes(role) || isProtectedRole(role) || isPlatformAdminRole(role)) {
      throw new PermissionError(`'${role}' cannot be assigned through delegated staff management.`);
    }
  }
}

function assertRoleWithinScope(actor: UserProfile, role: UserRole): void {
  if (!ASSIGNABLE_STAFF_ROLES.includes(role) || isProtectedRole(role) || isPlatformAdminRole(role)) {
    throw new PermissionError(`'${role}' cannot be assigned through staff management.`);
  }
  const scope = actor.delegatedRoleScope;
  if (Array.isArray(scope) && !scope.includes(role)) {
    throw new PermissionError('You are not authorised to manage this staff role.');
  }
}

export function assertCanGrantPermissions(
  actor: UserProfile,
  target: UserProfile,
  requestedPermissions: string[],
  roleScope?: UserRole[]
): void {
  if (!canDelegatePermissions(actor.role) || !hasPermission(actor, 'permissions.delegate')) {
    throw new PermissionError('Only the Headteacher or an authorised administrator may delegate permissions.');
  }
  assertManageableTarget(actor, target);

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
    if (LEADER_ONLY_DELEGATABLE_PERMISSIONS.includes(permission) && !isSchoolPermissionAdministrator(actor)) {
      throw new PermissionError(`Only the Headteacher may delegate '${permission}'.`);
    }
  }

  const includesStaffCreation = canonical.some(permission => STAFF_CREATION_PERMISSIONS.includes(permission));
  if (includesStaffCreation) {
    if (!canonical.includes('staff.read')) {
      throw new PermissionError('Staff creation delegation must include staff.view.');
    }
    for (const required of STAFF_CREATION_PERMISSIONS) {
      if (!canonical.includes(required)) {
        throw new PermissionError(`Staff creation delegation must include '${required}'.`);
      }
    }
    assertValidRoleScope(roleScope as UserRole[]);
    const ownScope = actor.delegatedRoleScope;
    if (Array.isArray(ownScope) && !(roleScope as UserRole[]).every(role => ownScope.includes(role))) {
      throw new PermissionError('You cannot delegate staff roles outside your own assigned scope.');
    }
  }
}

/** Validate a permission template without a target account. Shared by the
 * permission-group module so groups can never contain authority the actor
 * cannot personally grant. */
export function assertCanDefinePermissionGroup(
  actor: UserProfile,
  requestedPermissions: string[],
  roleScope?: UserRole[]
): string[] {
  if (!canDelegatePermissions(actor.role) || !hasPermission(actor, 'permissions.delegate')) {
    throw new PermissionError('Only the Headteacher or an authorised administrator may define permission groups.');
  }

  if (!Array.isArray(requestedPermissions) || requestedPermissions.length === 0) {
    throw new PermissionError('Select at least one permission for the group.');
  }
  const canonical = requestedPermissions.map(canonicalPermission);
  if (canonical.some((permission, index) => canonical.indexOf(permission) !== index)) {
    throw new PermissionError('Each permission may only be listed once.');
  }

  for (const permission of canonical) {
    if (!DELEGATABLE_PERMISSIONS.includes(permission)) {
      throw new PermissionError(`'${permission}' cannot be delegated.`);
    }
    if (!hasPermission(actor, permission)) {
      throw new PermissionError(`You cannot add '${permission}' to a group because you do not hold it.`);
    }
    if (LEADER_ONLY_DELEGATABLE_PERMISSIONS.includes(permission) && !isSchoolPermissionAdministrator(actor)) {
      throw new PermissionError(`Only the Headteacher may add '${permission}' to a group.`);
    }
  }

  if (canonical.some(permission => STAFF_CREATION_PERMISSIONS.includes(permission))) {
    if (!canonical.includes('staff.read')) {
      throw new PermissionError('A staff-creation group must include staff.view.');
    }
    for (const required of STAFF_CREATION_PERMISSIONS) {
      if (!canonical.includes(required)) {
        throw new PermissionError(`A staff-creation group must include '${required}'.`);
      }
    }
    assertValidRoleScope(roleScope as UserRole[]);
    const ownScope = actor.delegatedRoleScope;
    if (Array.isArray(ownScope) && !(roleScope as UserRole[]).every(role => ownScope.includes(role))) {
      throw new PermissionError('A group cannot grant staff roles outside your own assigned scope.');
    }
  }

  return canonical;
}

export function assertCanRevokePermissions(actor: UserProfile, target: UserProfile): void {
  if (!canDelegatePermissions(actor.role) || !hasPermission(actor, 'permissions.revoke')) {
    throw new PermissionError('Only the Headteacher or an authorised administrator may revoke permissions.');
  }
  assertManageableTarget(actor, target);
}

export function assertCanViewStaff(actor: UserProfile): void {
  if (!hasPermission(actor, 'staff.read')) {
    throw new PermissionError('You are not authorised to view staff records.');
  }
}

export function assertCanCreateStaffRole(actor: UserProfile, role: UserRole): void {
  if (!hasPermission(actor, 'staff.create') && !hasPermission(actor, 'invitations.manage')) {
    throw new PermissionError('You are not authorised to add staff members.');
  }
  assertRoleWithinScope(actor, role);
}

export function assertCanEditStaff(actor: UserProfile, target: UserProfile): void {
  if (!hasPermission(actor, 'staff.write')) {
    throw new PermissionError('You are not authorised to edit staff information.');
  }
  assertManageableTarget(actor, target);
}

export function assertCanActivateStaff(actor: UserProfile, target: UserProfile): void {
  if (!hasPermission(actor, 'staff.activate')) {
    throw new PermissionError('You are not authorised to activate staff accounts.');
  }
  assertManageableTarget(actor, target);
}

export function assertCanSuspendStaff(actor: UserProfile, target: UserProfile): void {
  if (!hasPermission(actor, 'staff.suspend')) {
    throw new PermissionError('You are not authorised to suspend staff accounts.');
  }
  assertManageableTarget(actor, target);
}

export function assertCanArchiveStaff(actor: UserProfile, target: UserProfile): void {
  if (!hasPermission(actor, 'staff.archive')) {
    throw new PermissionError('You are not authorised to archive staff accounts.');
  }
  assertManageableTarget(actor, target);
}

/**
 * A credential reset revokes every active session and replaces the password.
 * It is sensitive enough that only the Headteacher (or platform/school admin)
 * may perform it, even if lower staff powers were delegated.
 */
export function assertCanResetStaffAccess(actor: UserProfile, target: UserProfile): void {
  if (!isSchoolPermissionAdministrator(actor)) {
    throw new PermissionError('Only the Headteacher may reset staff access.');
  }
  if (!hasPermission(actor, 'staff.write')) {
    throw new PermissionError('You are not authorised to reset staff access.');
  }
  assertManageableTarget(actor, target);
}

export function assertCanAssignStaffRole(actor: UserProfile, target: UserProfile, role: UserRole): void {
  if (!hasPermission(actor, 'staff.assign_roles')) {
    throw new PermissionError('You are not authorised to assign staff roles.');
  }
  assertRoleWithinScope(actor, role);
  assertManageableTarget(actor, target);
}

export function assertCanManageStaff(actor: UserProfile, target?: UserProfile): void {
  if (!hasPermission(actor, 'staff.create') && !hasPermission(actor, 'staff.write')) {
    throw new PermissionError('You are not authorised to manage staff accounts.');
  }
  if (target) assertManageableTarget(actor, target);
}

export function assertCanManageInvitations(actor: UserProfile): void {
  if (!hasPermission(actor, 'invitations.manage')) {
    throw new PermissionError('You are not authorised to manage staff invitations.');
  }
}

export function assertCanReviewAudit(actor: UserProfile): void {
  if (!hasPermission(actor, 'audit.review')) {
    throw new PermissionError('Only the Headteacher may review the security audit trail.');
  }
}
