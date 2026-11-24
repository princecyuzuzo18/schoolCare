import type { UserRole } from './types';
import { getRoleDashboardTab, ROLE_DASHBOARD_TABS } from './roleDashboards';

/** Re-exported for existing callers; the shared module is the source of truth. */
export const ROLE_DASHBOARD_MAP = ROLE_DASHBOARD_TABS;
export { getRoleDashboardTab };

const ALL_ADMIN_TABS = [
  'dashboard','alert-center','approval-center','parent-portal','student-portal','health','attendance','communication','students','guardians','academics','academic-admin','combination-management','report-printing','finance','staff','staff-management','permissions','signup-requests','public-site','timetable','events','reports','audit','settings','admissions','documents','exams','marking-guides','teaching','sms-email','collaboration','meetings','inventory','ai-assistant','discipline','partner-schools','innovations'
];

export const ROLE_ALLOWED_TABS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL_ADMIN_TABS,
  SCHOOL_ADMIN: ALL_ADMIN_TABS,
  HEAD_TEACHER: ['dashboard','alert-center','approval-center','health','attendance','communication','students','guardians','academics','academic-admin','combination-management','report-printing','staff','staff-management','permissions','signup-requests','public-site','timetable','events','reports','audit','settings','admissions','documents','exams','marking-guides','teaching','sms-email','collaboration','meetings','inventory','ai-assistant','discipline','partner-schools','innovations'],
  DEPUTY_HEAD: ['dashboard','attendance','communication','students','academics','timetable','events','reports','report-printing','exams','teaching','admissions','ai-assistant'],
  TEACHER: ['dashboard','attendance','students','academics','timetable','events','reports','exams','marking-guides','teaching','ai-assistant'],
  NURSE: ['dashboard','health','events','reports','ai-assistant'],
  ACCOUNTANT: ['dashboard','finance','events','reports','inventory','ai-assistant'],
  DISCIPLINE_OFFICER: ['dashboard','attendance','students','guardians','discipline','events','reports','communication','ai-assistant'],
  SCHOOL_IT: ['dashboard','students','staff','reports','events','ai-assistant'],
  ANIMATEUR: ['dashboard','events','students','communication','attendance','reports','ai-assistant'],
  PARENT: ['parent-portal','events','reports','ai-assistant'],
  STUDENT: ['student-portal','events','reports','ai-assistant']
};

/**
 * Frontend mirror of the backend permission matrix. The server remains
 * authoritative; these checks only prevent showing unusable navigation.
 */
export const TAB_PERMISSION_REQUIREMENTS: Record<string, string> = {
  dashboard: 'dashboard.view',
  'alert-center': 'dashboard.view',
  'approval-center': 'dashboard.view',
  health: 'health.read',
  attendance: 'attendance.read',
  communication: 'notifications.read',
  'sms-email': 'notifications.read',
  students: 'students.read',
  guardians: 'guardians.read',
  academics: 'academics.read',
  'academic-admin': 'academics.write',
  'combination-management': 'combinations.write',
  'report-printing': 'reports.generate',
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
  events: 'notifications.read'
};

// Admissions uses role-based access on the server (see MODULE_ACCESS.admissions),
// not the generic permission matrix. Keep the UI mirror aligned so a delegated
// students.read account does not see a tab the API will reject.
const ADMISSIONS_READ_ROLES = new Set<UserRole>([
  'SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD'
]);

export function getRoleDashboard(role?: UserRole | null): string {
  return getRoleDashboardTab(role);
}

export function isTabAllowedForRole(
  role: UserRole | null | undefined,
  tab?: string,
  effectivePermissions?: readonly string[]
): boolean {
  if (!tab || !role) {
    return false;
  }

  const requiredPermission = TAB_PERMISSION_REQUIREMENTS[tab];
  // A tab with an explicit permission requirement must respect delegated
  // permission reductions even when the role normally includes that tab.
  // Callers that do not supply permissions keep the legacy role-only behavior.
  if (requiredPermission && effectivePermissions !== undefined) {
    const hasPermission = effectivePermissions.some(
      permission => permission === requiredPermission || permission.replace(':', '.') === requiredPermission
    );
    if (!hasPermission) return false;
  }

  const allowedTabs = ROLE_ALLOWED_TABS[role] ?? [getRoleDashboard(role)];
  if (allowedTabs.includes(tab)) {
    return true;
  }

  // Role-only tab: generic permissions must not expose it.
  if (tab === 'admissions') {
    return ADMISSIONS_READ_ROLES.has(role);
  }

  return false;
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
  // The public landing page is not part of the authenticated portal. A stale
  // or hand-typed #/landing hash must fall back to the role dashboard (or the
  // login page for anonymous visitors).
  if (requestedTab === 'landing') {
    return safeFallback;
  }
  if (isTabAllowedForRole(role, requestedTab, effectivePermissions)) {
    return requestedTab;
  }
  return safeFallback;
}
