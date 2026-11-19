import type { LucideIcon } from 'lucide-react';
import {
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
  Home,
  LayoutDashboard,
  Lightbulb,
  Mail,
  MessageSquare,
  Package,
  Settings,
  ShieldAlert,
  Sparkles,
  UserCheck,
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
  | 'system';

export interface NavItem {
  id: string;
  label: string;
  labelKey?: TranslationKey;
  icon: LucideIcon;
  section: NavSectionId;
  description?: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  items: NavItem[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'landing',
    label: 'Home',
    labelKey: 'navLanding',
    icon: Home,
    section: 'overview',
    description: 'Public school landing page'
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    labelKey: 'navDashboard',
    icon: LayoutDashboard,
    section: 'overview',
    description: 'Role-based school overview'
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
    label: 'Academics & Marks',
    labelKey: 'navAcademics',
    icon: BookOpen,
    section: 'academics',
    description: 'Classes, subjects and assessments'
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
    id: 'report-cards',
    label: 'Report Cards',
    labelKey: 'navReportCards',
    icon: FileText,
    section: 'academics',
    description: 'Term report cards and analytics'
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
    description: 'Staff directory and assignments'
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
    label: 'Online Meetings',
    icon: Calendar,
    section: 'operations',
    description: 'Meeting schedules and links'
  },
  {
    id: 'collaboration',
    label: 'Collaboration',
    icon: Users,
    section: 'operations',
    description: 'School collaboration workspace'
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
    id: 'settings',
    label: 'School Settings',
    labelKey: 'navSettings',
    icon: Settings,
    section: 'system',
    description: 'School configuration'
  }
] as const;

const SECTION_LABELS: Record<NavSectionId, string> = {
  overview: 'Overview',
  academics: 'Academics',
  people: 'People',
  care: 'Care & Communication',
  operations: 'Operations',
  insights: 'Insights',
  system: 'System'
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

export const NAV_ITEM_MAP: Readonly<Record<string, NavItem>> = NAV_ITEMS.reduce(
  (map, item) => {
    map[item.id] = item;
    return map;
  },
  {} as Record<string, NavItem>
);

export function getVisibleNavSections(role: UserRole | null | undefined): NavSection[] {
  return SECTION_ORDER.map(sectionId => ({
    id: sectionId,
    label: SECTION_LABELS[sectionId],
    items: NAV_ITEMS.filter(
      item => item.section === sectionId && isTabAllowedForRole(role, item.id)
    )
  })).filter(section => section.items.length > 0);
}

export function getVisibleNavItems(role: UserRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter(item => isTabAllowedForRole(role, item.id));
}

export function getNavItem(id: string): NavItem | undefined {
  return NAV_ITEM_MAP[id];
}

const QUICK_NAV_PREFERENCES: Record<UserRole, string[]> = {
  SUPER_ADMIN: ['dashboard', 'health', 'attendance', 'finance'],
  SCHOOL_ADMIN: ['dashboard', 'health', 'attendance', 'finance'],
  HEAD_TEACHER: ['dashboard', 'attendance', 'students', 'reports'],
  DEPUTY_HEAD: ['dashboard', 'attendance', 'timetable', 'reports'],
  TEACHER: ['dashboard', 'attendance', 'timetable', 'reports'],
  NURSE: ['dashboard', 'health', 'events', 'reports'],
  ACCOUNTANT: ['dashboard', 'finance', 'inventory', 'reports'],
  PARENT: ['parent-portal', 'events', 'reports', 'health'],
  STUDENT: ['student-portal', 'events', 'reports', 'timetable']
};

export function getQuickNavItems(role: UserRole | null | undefined): NavItem[] {
  if (!role) {
    return [];
  }
  const preferredIds = QUICK_NAV_PREFERENCES[role] ?? ['dashboard'];
  const preferred = preferredIds
    .map(id => NAV_ITEM_MAP[id])
    .filter((item): item is NavItem => Boolean(item) && isTabAllowedForRole(role, item.id));

  if (preferred.length > 0) {
    return preferred.slice(0, 4);
  }

  return getVisibleNavItems(role).slice(0, 4);
}
