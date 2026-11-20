import type { UserRole } from './types';

export const ROLE_DASHBOARD_MAP: Record<UserRole, string> = {
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

const ALL_ADMIN_TABS = [
  'landing','dashboard','parent-portal','student-portal','health','attendance','communication','students','guardians','academics','finance','staff','staff-management','permissions','signup-requests','public-site','timetable','events','reports','audit','settings','admissions','documents','exams','marking-guides','teaching','report-cards','sms-email','collaboration','meetings','inventory','ai-assistant','discipline','partner-schools','innovations'
];

export const ROLE_ALLOWED_TABS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL_ADMIN_TABS,
  SCHOOL_ADMIN: ALL_ADMIN_TABS,
  HEAD_TEACHER: ['landing','dashboard','attendance','communication','students','guardians','academics','staff','staff-management','permissions','public-site','timetable','events','reports','audit','settings','admissions','documents','exams','marking-guides','teaching','report-cards','sms-email','collaboration','meetings','inventory','ai-assistant','discipline','partner-schools','innovations'],
  DEPUTY_HEAD: ['landing','dashboard','attendance','communication','students','academics','timetable','events','reports','exams','teaching','report-cards'],
  TEACHER: ['landing','dashboard','attendance','students','academics','timetable','events','reports','exams','marking-guides','teaching','report-cards'],
  NURSE: ['landing','dashboard','health','events','reports'],
  ACCOUNTANT: ['landing','dashboard','finance','events','reports','inventory'],
  DISCIPLINE_OFFICER: ['landing','dashboard','attendance','students','guardians','discipline','events','reports','communication'],
  SCHOOL_IT: ['landing','dashboard','students','staff','reports','events','ai-assistant'],
  ANIMATEUR: ['landing','dashboard','events','students','communication','attendance','reports'],
  PARENT: ['landing','parent-portal','events','reports'],
  STUDENT: ['landing','student-portal','events','reports']
};

/**
 * Frontend mirror of the backend permission matrix. The server remains
 * authoritative; these checks only prevent showing unusable navigation.
 */
export const TAB_PERMISSION_REQUIREMENTS: Record<string, string> = {
  dashboard: 'dashboard.view',
  health: 'health.read',
  attendance: 'attendance.read',
  communication: 'notifications.read',
  'sms-email': 'notifications.read',
  students: 'students.read',
  guardians: 'guardians.read',
  academics: 'academics.read',
  finance: 'finance.read',
  inventory: 'finance.read',
  staff: 'staff.read',
  'staff-management': 'staff.create',
  permissions: 'permissions.delegate',
  'signup-requests': 'invitations.manage',
  'public-site': 'school.write',
  audit: 'audit.review',
  settings: 'school.write',
  reports: 'reports.read',
  discipline: 'discipline.read',
  events: 'notifications.read',
  admissions: 'students.read'
};

export function getRoleDashboard(role?: UserRole | null): string {
  if (!role) {
    return 'landing';
  }
  return ROLE_DASHBOARD_MAP[role] ?? 'dashboard';
}

export function isTabAllowedForRole(
  role: UserRole | null | undefined,
  tab?: string,
  effectivePermissions?: readonly string[]
): boolean {
  if (!tab || tab === 'landing') {
    return true;
  }
  if (!role) {
    return false;
  }

  const allowedTabs = ROLE_ALLOWED_TABS[role] ?? [getRoleDashboard(role)];
  if (allowedTabs.includes(tab)) {
    return true;
  }

  if (!effectivePermissions || effectivePermissions.length === 0) {
    return false;
  }
  const requiredPermission = TAB_PERMISSION_REQUIREMENTS[tab];
  return Boolean(
    requiredPermission &&
      effectivePermissions.some(
        permission => permission === requiredPermission || permission.replace(':', '.') === requiredPermission
      )
  );
}

export function resolveRequestedTab(
  role: UserRole | null | undefined,
  requestedTab?: string,
  fallbackTab?: string,
  effectivePermissions?: readonly string[]
): string {
  const safeFallback = fallbackTab ?? getRoleDashboard(role);
  if (!requestedTab) {
    return safeFallback;
  }
  if (requestedTab === 'landing') {
    return 'landing';
  }
  if (isTabAllowedForRole(role, requestedTab, effectivePermissions)) {
    return requestedTab;
  }
  return safeFallback;
}
