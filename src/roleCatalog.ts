import type { UserRole } from './types';

export interface RoleDefinition {
  code: UserRole;
  labelKey: string;
  isStaff: boolean;
  isSchoolLeader: boolean;
  canDelegate: boolean;
}

/**
 * Single source of truth for school-role semantics.
 * Internal codes stay uppercase for compatibility with existing JSON data,
 * MariaDB role IDs and frontend role maps.
 */
export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  SUPER_ADMIN: {
    code: 'SUPER_ADMIN',
    labelKey: 'role_SUPER_ADMIN',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: true
  },
  SCHOOL_ADMIN: {
    code: 'SCHOOL_ADMIN',
    labelKey: 'role_SCHOOL_ADMIN',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: true
  },
  HEAD_TEACHER: {
    code: 'HEAD_TEACHER',
    labelKey: 'role_HEAD_TEACHER',
    isStaff: true,
    isSchoolLeader: true,
    canDelegate: true
  },
  DEPUTY_HEAD: {
    code: 'DEPUTY_HEAD',
    labelKey: 'role_DEPUTY_HEAD',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  TEACHER: {
    code: 'TEACHER',
    labelKey: 'role_TEACHER',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  NURSE: {
    code: 'NURSE',
    labelKey: 'role_NURSE',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  ACCOUNTANT: {
    code: 'ACCOUNTANT',
    labelKey: 'role_ACCOUNTANT',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  DISCIPLINE_OFFICER: {
    code: 'DISCIPLINE_OFFICER',
    labelKey: 'role_DISCIPLINE_OFFICER',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  SCHOOL_IT: {
    code: 'SCHOOL_IT',
    labelKey: 'role_SCHOOL_IT',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  ANIMATEUR: {
    code: 'ANIMATEUR',
    labelKey: 'role_ANIMATEUR',
    isStaff: true,
    isSchoolLeader: false,
    canDelegate: false
  },
  PARENT: {
    code: 'PARENT',
    labelKey: 'role_PARENT',
    isStaff: false,
    isSchoolLeader: false,
    canDelegate: false
  },
  STUDENT: {
    code: 'STUDENT',
    labelKey: 'role_STUDENT',
    isStaff: false,
    isSchoolLeader: false,
    canDelegate: false
  }
};

/**
 * Current school leader used only for static document sign-offs where a
 * report-card snapshot is unavailable. Live displays read the account's
 * fullName from the database instead.
 */
export const HEADTEACHER_DISPLAY_NAME = 'MUNYENTWARI Olivier';

/** Professional display names used in staff management and audit records. */
export const PROFESSIONAL_TITLES: Record<UserRole, string> = {
  SUPER_ADMIN: 'Platform Administrator',
  SCHOOL_ADMIN: 'School Administrator',
  HEAD_TEACHER: 'Headteacher',
  DEPUTY_HEAD: 'Deputy Head Teacher',
  TEACHER: 'Teacher / Instructor',
  NURSE: 'School Nurse / Health Officer',
  ACCOUNTANT: 'Accountant / Bursar',
  DISCIPLINE_OFFICER: 'Discipline & Student Welfare Officer',
  SCHOOL_IT: 'School ICT Officer',
  ANIMATEUR: 'Animateur / Student Activities Coordinator',
  PARENT: 'Parent / Guardian',
  STUDENT: 'Student'
};

export function getProfessionalTitle(role?: UserRole | null): string {
  return role ? PROFESSIONAL_TITLES[role] : 'Staff Member';
}

/** Roles that may hold a staff record. */
export const STAFF_ROLE_CODES: UserRole[] = [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'HEAD_TEACHER',
  'DEPUTY_HEAD',
  'TEACHER',
  'NURSE',
  'ACCOUNTANT',
  'DISCIPLINE_OFFICER',
  'SCHOOL_IT',
  'ANIMATEUR'
];

/** Roles the Headteacher may create through Staff Management. */
export const ASSIGNABLE_STAFF_ROLES: UserRole[] = [
  'DEPUTY_HEAD',
  'TEACHER',
  'NURSE',
  'ACCOUNTANT',
  'DISCIPLINE_OFFICER',
  'SCHOOL_IT',
  'ANIMATEUR'
];

/** Protected roles can never be created, modified or granted by a delegated user. */
export const PROTECTED_ROLES: UserRole[] = ['SUPER_ADMIN', 'HEAD_TEACHER'];

export function getRoleDefinition(role?: UserRole | null): RoleDefinition | undefined {
  return role ? ROLE_DEFINITIONS[role] : undefined;
}

export function isStaffRole(role?: UserRole | null): boolean {
  return Boolean(role && ROLE_DEFINITIONS[role]?.isStaff);
}

export function isSchoolLeader(role?: UserRole | null): boolean {
  return role === 'HEAD_TEACHER';
}

export function canDelegatePermissions(role?: UserRole | null): boolean {
  return Boolean(role && ROLE_DEFINITIONS[role]?.canDelegate);
}

export function isProtectedRole(role?: UserRole | null): boolean {
  return Boolean(role && PROTECTED_ROLES.includes(role));
}
