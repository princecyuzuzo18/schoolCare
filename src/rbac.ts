import type { UserRole } from './types';

export const ROLE_DASHBOARD_MAP: Record<UserRole, string> = {
  SUPER_ADMIN: 'dashboard',
  SCHOOL_ADMIN: 'dashboard',
  HEAD_TEACHER: 'dashboard',
  DEPUTY_HEAD: 'dashboard',
  TEACHER: 'attendance',
  NURSE: 'health',
  ACCOUNTANT: 'finance',
  PARENT: 'parent-portal',
  STUDENT: 'student-portal'
};

const ALL_ADMIN_TABS = [
  'landing','dashboard','parent-portal','student-portal','health','attendance','communication','students','guardians','academics','finance','staff','timetable','events','reports','audit','settings','admissions','documents','exams','marking-guides','teaching','report-cards','sms-email','collaboration','meetings','inventory','ai-assistant','discipline','partner-schools','innovations'
];

export const ROLE_ALLOWED_TABS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL_ADMIN_TABS,
  SCHOOL_ADMIN: ALL_ADMIN_TABS,
  HEAD_TEACHER: ['landing','dashboard','attendance','communication','students','guardians','academics','staff','timetable','events','reports','audit','admissions','documents','exams','marking-guides','teaching','report-cards','collaboration','meetings','discipline'],
  DEPUTY_HEAD: ['landing','dashboard','attendance','communication','students','academics','timetable','events','reports','exams','teaching','report-cards'],
  TEACHER: ['landing','dashboard','attendance','students','academics','timetable','events','reports','exams','marking-guides','teaching','report-cards'],
  NURSE: ['landing','dashboard','health','events','reports'],
  ACCOUNTANT: ['landing','dashboard','finance','events','reports','inventory'],
  PARENT: ['landing','parent-portal','events','reports'],
  STUDENT: ['landing','student-portal','events','reports']
};

export function getRoleDashboard(role?: UserRole | null): string {
  if (!role) {
    return 'landing';
  }
  return ROLE_DASHBOARD_MAP[role] ?? 'dashboard';
}

export function isTabAllowedForRole(role: UserRole | null | undefined, tab?: string): boolean {
  if (!tab || tab === 'landing') {
    return true;
  }
  if (!role) {
    return false;
  }
  const allowedTabs = ROLE_ALLOWED_TABS[role] ?? [getRoleDashboard(role)];
  return allowedTabs.includes(tab);
}

export function resolveRequestedTab(
  role: UserRole | null | undefined,
  requestedTab?: string,
  fallbackTab?: string
): string {
  const safeFallback = fallbackTab ?? getRoleDashboard(role);
  if (!requestedTab) {
    return safeFallback;
  }
  if (requestedTab === 'landing') {
    return 'landing';
  }
  if (isTabAllowedForRole(role, requestedTab)) {
    return requestedTab;
  }
  return safeFallback;
}
