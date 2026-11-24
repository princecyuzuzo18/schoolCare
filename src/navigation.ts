import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  HeartPulse,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Mail,
  MessageSquare,
  Package,
  Settings,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserCog,
  UserPlus,
  UserSquare2,
  Users
} from 'lucide-react';
import type { UserRole } from './types';
import type { TranslationKey } from './i18n';
import { isTabAllowedForRole } from './rbac';

export type NavSectionId =
  | 'overview'
  | 'academics'
  | 'people'
  | 'care'
  | 'operations'
  | 'insights'
  | 'system'
  | 'head-dashboard'
  | 'head-people'
  | 'head-academics'
  | 'head-operations'
  | 'head-finance'
  | 'head-communication'
  | 'head-reports'
  | 'head-settings';

export interface NavItem {
  id: string;
  label: string;
  labelKey?: TranslationKey;
  icon: LucideIcon;
  section: NavSectionId;
  description?: string;
  permissionKey?: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  items: NavItem[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    labelKey: 'navDashboard',
    icon: LayoutDashboard,
    section: 'overview',
    description: 'Role-based school overview'
  },
  {
    id: 'alert-center',
    label: 'Smart Alert Center',
    labelKey: 'navAlertCenter',
    icon: BellRing,
    section: 'overview',
    description: 'Actionable school alerts from existing records'
  },
  {
    id: 'approval-center',
    label: 'Approval Center',
    labelKey: 'navApprovalCenter',
    icon: ClipboardList,
    section: 'overview',
    description: 'Central queue for all school-level approvals'
  },
  {
    id: 'parent-portal',
    label: 'Parent Portal',
    labelKey: 'parentPortalTitle',
    icon: UserSquare2,
    section: 'overview',
    description: 'Guardian self-service portal'
  },
  {
    id: 'student-portal',
    label: 'Student Portal',
    icon: GraduationCap,
    section: 'overview',
    description: 'Student self-service portal'
  },
  {
    id: 'attendance',
    label: 'Attendance',
    labelKey: 'navAttendance',
    icon: UserCheck,
    section: 'academics',
    description: 'Daily roll call and absence tracking'
  },
  {
    id: 'academics',
    label: 'My Academic Work',
    labelKey: 'navTeacherAcademics',
    icon: BookOpen,
    section: 'academics',
    description: 'Assigned classes, marks entry and submission history'
  },
  {
    id: 'teacher-my-classes',
    label: 'My Classes',
    icon: Users,
    section: 'academics',
    description: 'Classes assigned to you for the selected term'
  },
  {
    id: 'teacher-marks-management',
    label: 'Marks Management',
    icon: ClipboardList,
    section: 'academics',
    description: 'Enter, save and submit marks for assigned pairs'
  },
  {
    id: 'teacher-examination-results',
    label: 'Examination Results',
    icon: GraduationCap,
    section: 'academics',
    description: 'Calculated results for your assigned classes and subjects'
  },
  {
    id: 'teacher-my-subjects',
    label: 'My Subjects',
    icon: BookOpen,
    section: 'academics',
    description: 'Subjects and classes assigned to you'
  },
  {
    id: 'teacher-submitted-marks',
    label: 'Submitted Marks',
    icon: ClipboardList,
    section: 'academics',
    description: 'Your submissions, review outcomes and correction history'
  },
  {
    id: 'academic-admin',
    label: 'Academic Administration',
    labelKey: 'navAcademicAdmin',
    icon: ClipboardList,
    section: 'academics',
    description: 'Years, terms, assignments, grading and marks approval'
  },
  {
    id: 'combination-management',
    label: 'Combination Management',
    labelKey: 'navCombinationManagement',
    icon: Layers,
    section: 'academics',
    description: 'Combinations, classes, subjects, teachers and student intake',
    permissionKey: 'combinations.write'
  },
  {
    id: 'report-printing',
    label: 'Report Cards & Printing',
    labelKey: 'navReportPrinting',
    icon: FileText,
    section: 'academics',
    description: 'Generate, print, download and distribute official report cards'
  },
  {
    id: 'timetable',
    label: 'Timetable & Lessons',
    labelKey: 'navTimetable',
    icon: Calendar,
    section: 'academics',
    description: 'Weekly lesson schedule'
  },
  {
    id: 'exams',
    label: 'Exams & Results',
    icon: ClipboardList,
    section: 'academics',
    description: 'Examination records and results'
  },
  {
    id: 'marking-guides',
    label: 'Marking Guides',
    icon: FileText,
    section: 'academics',
    description: 'Early exams and marking guides'
  },
  {
    id: 'teaching',
    label: 'Teaching & Learning',
    icon: BookOpen,
    section: 'academics',
    description: 'Teaching resources and lesson notes'
  },
  {
    id: 'students',
    label: 'Students & Enrollment',
    labelKey: 'navStudents',
    icon: Users,
    section: 'people',
    description: 'Student registry and enrollment'
  },
  {
    id: 'guardians',
    label: 'Parents & Guardians',
    labelKey: 'navGuardians',
    icon: UserSquare2,
    section: 'people',
    description: 'Guardian contact directory'
  },
  {
    id: 'admissions',
    label: 'Admissions Management',
    icon: UserSquare2,
    section: 'people',
    description: 'Review public admission applications'
  },
  {
    id: 'staff',
    label: 'Teachers & Staff',
    labelKey: 'navStaff',
    icon: Briefcase,
    section: 'people',
    description: 'Staff directory and assignments',
    permissionKey: 'staff.read'
  },
  {
    id: 'staff-management',
    label: 'Staff Management',
    labelKey: 'navStaffManagement',
    icon: UserCog,
    section: 'people',
    description: 'Create staff accounts, roles and invitations',
    permissionKey: 'staff.create'
  },
  {
    id: 'discipline',
    label: 'Discipline',
    icon: ShieldAlert,
    section: 'people',
    description: 'Student discipline records'
  },
  {
    id: 'health',
    label: 'Health & Emergency',
    labelKey: 'navHealth',
    icon: HeartPulse,
    section: 'care',
    description: 'Infirmary and emergency response'
  },
  {
    id: 'communication',
    label: 'Parent Communication',
    labelKey: 'navCommunication',
    icon: MessageSquare,
    section: 'care',
    description: 'Multi-channel parent notifications'
  },
  {
    id: 'sms-email',
    label: 'SMS & Email',
    icon: Mail,
    section: 'care',
    description: 'Bulk SMS and email messaging'
  },
  {
    id: 'events',
    label: 'Events & Calendar',
    labelKey: 'navEvents',
    icon: CalendarCheck,
    section: 'care',
    description: 'School events and calendar'
  },
  {
    id: 'finance',
    label: 'Fees & Finance',
    labelKey: 'navFinance',
    icon: CreditCard,
    section: 'operations',
    description: 'Invoices, payments and balances'
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    section: 'operations',
    description: 'School resource inventory'
  },
  {
    id: 'documents',
    label: 'School Documents',
    icon: FileText,
    section: 'operations',
    description: 'Staff and teacher documents'
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: Calendar,
    section: 'operations',
    description: 'Agendas, responses, minutes and follow-up tasks'
  },
  {
    id: 'collaboration',
    label: 'Collaboration Workspace',
    icon: Users,
    section: 'operations',
    description: 'Shared plans, notes and school improvement tasks'
  },
  {
    id: 'partner-schools',
    label: 'Partner Schools',
    icon: Building2,
    section: 'operations',
    description: 'Partner school relationships'
  },
  {
    id: 'innovations',
    label: 'Innovations',
    icon: Lightbulb,
    section: 'operations',
    description: 'Innovation initiatives'
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    labelKey: 'navReports',
    icon: FileText,
    section: 'insights',
    description: 'Official reports and analytics'
  },
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    labelKey: 'aiTitle',
    icon: Sparkles,
    section: 'insights',
    description: 'AI-powered school assistant'
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    labelKey: 'navAudit',
    icon: ShieldAlert,
    section: 'insights',
    description: 'Security and activity audit trail'
  },
  {
    id: 'permissions',
    label: 'Staff Permissions',
    labelKey: 'navPermissions',
    icon: KeyRound,
    section: 'system',
    description: 'Delegate and revoke operational permissions',
    permissionKey: 'permissions.delegate'
  },
  {
    id: 'signup-requests',
    label: 'Parent & Student Sign-ups',
    labelKey: 'signupRequestsTitle',
    icon: UserPlus,
    section: 'system',
    description: 'Review and approve parent and student registrations',
    permissionKey: 'invitations.manage'
  },
  {
    id: 'public-site',
    label: 'Public Website',
    labelKey: 'navPublicSite',
    icon: FileText,
    section: 'system',
    description: 'Manage approved public news, events and gallery photos',
    permissionKey: 'school.write'
  },
  {
    id: 'settings',
    label: 'School Settings',
    labelKey: 'navSettings',
    icon: Settings,
    section: 'system',
    description: 'School configuration',
    permissionKey: 'school.write'
  }
] as const;

const SECTION_LABELS: Record<NavSectionId, string> = {
  overview: 'Overview',
  academics: 'Academics',
  people: 'People',
  care: 'Care & Communication',
  operations: 'Operations',
  insights: 'Insights',
  system: 'System',
  'head-dashboard': 'Dashboard',
  'head-people': 'People Management',
  'head-academics': 'Academic Management',
  'head-operations': 'School Operations',
  'head-finance': 'Finance',
  'head-communication': 'Communication',
  'head-reports': 'Reports & Analytics',
  'head-settings': 'School Settings'
};

const SECTION_ORDER: NavSectionId[] = [
  'overview',
  'academics',
  'people',
  'care',
  'operations',
  'insights',
  'system'
];

/**
 * The Headteacher workspace uses eight purpose-built sections. Existing tab
 * IDs, routes and API endpoints are preserved and simply grouped here.
 */
const HEADTEACHER_SECTION_ORDER: NavSectionId[] = [
  'head-dashboard',
  'head-people',
  'head-academics',
  'head-operations',
  'head-finance',
  'head-communication',
  'head-reports',
  'head-settings'
];

const HEADTEACHER_SECTION_LABELS: Record<string, string> = {
  'head-dashboard': 'Dashboard',
  'head-people': 'People Management',
  'head-academics': 'Academic Management',
  'head-operations': 'School Operations',
  'head-finance': 'Finance',
  'head-communication': 'Communication',
  'head-reports': 'Reports & Analytics',
  'head-settings': 'School Settings'
};

const HEADTEACHER_ITEM_SECTIONS: Record<string, NavSectionId> = {
  dashboard: 'head-dashboard',
  'alert-center': 'head-dashboard',
  'approval-center': 'head-dashboard',
  students: 'head-people',
  guardians: 'head-people',
  staff: 'head-people',
  'staff-management': 'head-people',
  admissions: 'head-people',
  'signup-requests': 'head-people',
  permissions: 'head-people',
  academics: 'head-academics',
  'academic-admin': 'head-academics',
  'combination-management': 'head-academics',
  timetable: 'head-academics',
  exams: 'head-academics',
  'marking-guides': 'head-academics',
  'report-printing': 'head-academics',
  teaching: 'head-academics',
  attendance: 'head-operations',
  discipline: 'head-operations',
  health: 'head-operations',
  events: 'head-operations',
  meetings: 'head-operations',
  collaboration: 'head-operations',
  'partner-schools': 'head-operations',
  innovations: 'head-operations',
  finance: 'head-finance',
  inventory: 'head-finance',
  communication: 'head-communication',
  'sms-email': 'head-communication',
  'public-site': 'head-communication',
  reports: 'head-reports',
  audit: 'head-reports',
  'ai-assistant': 'head-reports',
  settings: 'head-settings'
};

/** Items intentionally hidden from the Headteacher workspace only. */
const HEADTEACHER_HIDDEN_ITEM_IDS = new Set<string>(['documents']);

function isHeadteacherNavItemVisible(role: UserRole | null | undefined, item: NavItem): boolean {
  return !(role === 'HEAD_TEACHER' && HEADTEACHER_HIDDEN_ITEM_IDS.has(item.id));
}

export const NAV_ITEM_MAP: Readonly<Record<string, NavItem>> = NAV_ITEMS.reduce(
  (map, item) => {
    map[item.id] = item;
    return map;
  },
  {} as Record<string, NavItem>
);

export function getVisibleNavSections(
  role: UserRole | null | undefined,
  effectivePermissions?: readonly string[]
): NavSection[] {
  const isHeadteacher = role === 'HEAD_TEACHER';
  const order = isHeadteacher ? HEADTEACHER_SECTION_ORDER : SECTION_ORDER;
  const labels = isHeadteacher ? HEADTEACHER_SECTION_LABELS : SECTION_LABELS;

  return order.map(sectionId => ({
    id: sectionId,
    label: labels[sectionId] ?? SECTION_LABELS[sectionId],
    items: NAV_ITEMS.filter(item => {
      const itemSection = isHeadteacher
        ? (HEADTEACHER_ITEM_SECTIONS[item.id] ?? 'head-operations')
        : item.section;
      return (
        itemSection === sectionId &&
        isHeadteacherNavItemVisible(role, item) &&
        isTabAllowedForRole(role, item.id, effectivePermissions)
      );
    })
  })).filter(section => section.items.length > 0);
}

export function getVisibleNavItems(
  role: UserRole | null | undefined,
  effectivePermissions?: readonly string[]
): NavItem[] {
  return NAV_ITEMS.filter(
    item =>
      isHeadteacherNavItemVisible(role, item) &&
      isTabAllowedForRole(role, item.id, effectivePermissions)
  );
}

export function getNavItem(id: string): NavItem | undefined {
  return NAV_ITEM_MAP[id];
}

const PUBLIC_PORTAL_ROUTES: ReadonlySet<string> = new Set([
  'login',
  'apply',
  'track',
  'parent-signup',
  'student-signup'
]);

/**
 * Hash routes that the portal gate renders outside the authenticated shell.
 * Anonymous route syncing must not rewrite these back to the login page.
 */
export function isPublicPortalRoute(route: string | null | undefined): boolean {
  if (!route) return false;
  return PUBLIC_PORTAL_ROUTES.has(route) || route.startsWith('staff-activate');
}

const QUICK_NAV_PREFERENCES: Record<UserRole, string[]> = {
  SUPER_ADMIN: ['dashboard', 'combination-management', 'health', 'finance'],
  SCHOOL_ADMIN: ['dashboard', 'combination-management', 'health', 'finance'],
  HEAD_TEACHER: ['dashboard', 'students', 'academic-admin', 'combination-management'],
  DEPUTY_HEAD: ['dashboard', 'report-printing', 'reports', 'attendance'],
  TEACHER: ['dashboard', 'academics', 'attendance', 'timetable'],
  NURSE: ['dashboard', 'health', 'events', 'reports'],
  ACCOUNTANT: ['dashboard', 'finance', 'inventory', 'reports'],
  DISCIPLINE_OFFICER: ['dashboard', 'discipline', 'attendance', 'students'],
  SCHOOL_IT: ['dashboard', 'students', 'staff', 'reports'],
  ANIMATEUR: ['dashboard', 'events', 'students', 'communication'],
  PARENT: ['parent-portal', 'events', 'reports', 'health'],
  STUDENT: ['student-portal', 'events', 'reports', 'timetable']
};

export function getQuickNavItems(
  role: UserRole | null | undefined,
  effectivePermissions?: readonly string[]
): NavItem[] {
  if (!role) {
    return [];
  }
  const preferredIds = QUICK_NAV_PREFERENCES[role] ?? ['dashboard'];
  const preferred = preferredIds
    .map(id => NAV_ITEM_MAP[id])
    .filter(
      (item): item is NavItem =>
        Boolean(item) && isTabAllowedForRole(role, item.id, effectivePermissions)
    );

  if (preferred.length > 0) {
    return preferred.slice(0, 4);
  }

  return getVisibleNavItems(role, effectivePermissions).slice(0, 4);
}
