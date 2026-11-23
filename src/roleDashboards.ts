import type { UserRole } from './types';

/**
 * Canonical role -> dashboard tab mapping.
 *
 * Imported by both the Express server (to tell the client which dashboard a
 * user is authorized for) and the React app (to validate hash routes). The
 * server always derives this from the role stored in its own database, never
 * from a browser-supplied value.
 */
export const ROLE_DASHBOARD_TABS: Record<UserRole, string> = {
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

export function getRoleDashboardTab(role?: UserRole | null): string {
  // Anonymous visitors belong on the public site; inside the portal their
  // only destination is the login page, never the public landing page.
  if (!role) return 'login';
  return ROLE_DASHBOARD_TABS[role] ?? 'dashboard';
}

export function getRoleDashboardUrl(role?: UserRole | null): string {
  return `/portal#/${getRoleDashboardTab(role)}`;
}
