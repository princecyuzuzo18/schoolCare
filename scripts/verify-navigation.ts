import {
  NAV_ITEM_MAP,
  NAV_ITEMS,
  getQuickNavItems,
  getVisibleNavItems,
  getVisibleNavSections,
  isPublicPortalRoute
} from '../src/navigation';
import { APP_ROUTES } from '../src/routes';
import { ROLE_ALLOWED_TABS, ROLE_DASHBOARD_MAP, isTabAllowedForRole, resolveRequestedTab } from '../src/rbac';
import { ROLE_DASHBOARD_TABS, getRoleDashboardTab } from '../src/roleDashboards';
import { translations } from '../src/i18n/translations';
import type { UserRole } from '../src/types';

type Check = { name: string; passed: boolean; detail?: string };

const ROLES = Object.keys(ROLE_ALLOWED_TABS) as UserRole[];
const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string) {
  checks.push({ name, passed, detail });
}

const navIds = NAV_ITEMS.map(item => item.id);
const routeIds = Object.keys(APP_ROUTES);

check('Navigation items are defined', NAV_ITEMS.length > 0, `${NAV_ITEMS.length} items`);

const duplicateNavIds = navIds.filter((id, index) => navIds.indexOf(id) !== index);
check('Navigation IDs are unique', duplicateNavIds.length === 0, duplicateNavIds.join(', '));

const navWithoutRoute = navIds.filter(id => !APP_ROUTES[id]);
check(
  'Every navigation item has a registered page route',
  navWithoutRoute.length === 0,
  navWithoutRoute.join(', ')
);

const routeWithoutNav = routeIds.filter(id => !navIds.includes(id));
check(
  'Every registered page route is reachable from navigation',
  routeWithoutNav.length === 0,
  routeWithoutNav.join(', ')
);

const mismatchedRouteIds = NAV_ITEMS.filter(item => APP_ROUTES[item.id]?.id !== item.id).map(item => item.id);
check(
  'Route registry keys match navigation targets',
  mismatchedRouteIds.length === 0,
  mismatchedRouteIds.join(', ')
);

const unreachableNavIds = navIds.filter(
  id => !ROLES.some(role => isTabAllowedForRole(role, id))
);
check(
  'Every navigation item is reachable by at least one role',
  unreachableNavIds.length === 0,
  unreachableNavIds.join(', ')
);

// Public marketing pages stay on the public site; the authenticated shell must
// not register or link to Home/Apply.
const publicOnlyTabs = ['landing', 'apply'];
check(
  'Authenticated portal does not register public Home or Apply pages',
  publicOnlyTabs.every(id => !APP_ROUTES[id]),
  publicOnlyTabs.filter(id => APP_ROUTES[id]).join(', ')
);
check(
  'Authenticated navigation does not contain public Home or Apply links',
  NAV_ITEMS.every(item => !publicOnlyTabs.includes(item.id)),
  NAV_ITEMS.filter(item => publicOnlyTabs.includes(item.id)).map(item => item.id).join(', ')
);
check(
  'No role can open the public landing page inside the portal',
  ROLES.every(role => !isTabAllowedForRole(role, 'landing')),
  ROLES.filter(role => isTabAllowedForRole(role, 'landing')).join(', ')
);
check(
  'Anonymous portal fallback is the login page, not the public landing page',
  getRoleDashboardTab(null) === 'login',
  getRoleDashboardTab(null)
);
check(
  'Anonymous landing hash resolves to the login page',
  resolveRequestedTab(null, 'landing') === 'login',
  resolveRequestedTab(null, 'landing')
);
check(
  'Anonymous parent/student sign-up routes stay public',
  ['parent-signup', 'student-signup'].every(route => isPublicPortalRoute(route))
);
check(
  'Anonymous staff activation routes stay public',
  isPublicPortalRoute('staff-activate-abc123')
);
check(
  'Anonymous private dashboard routes are still redirected to login',
  !isPublicPortalRoute('dashboard') && !isPublicPortalRoute('parent-portal')
);

// Delegated permission reductions must also hide tabs that the role normally
// includes. Server authorization remains authoritative; this keeps the menu
// consistent with what the API will actually allow.
check(
  'Role allowlist does not bypass a missing effective permission',
  !isTabAllowedForRole('HEAD_TEACHER', 'settings', ['students:read'])
);
check(
  'Role allowlist works when the effective permission is present',
  isTabAllowedForRole('HEAD_TEACHER', 'settings', ['school:write'])
);

const missingTranslations: string[] = [];
for (const item of NAV_ITEMS) {
  if (!item.labelKey) continue;
  for (const locale of ['en', 'rw'] as const) {
    const dictionary = translations[locale] as Record<string, string>;
    if (!(item.labelKey in dictionary)) {
      missingTranslations.push(`${item.id}:${locale}:${item.labelKey}`);
    }
  }
}
check(
  'Navigation translation keys exist in all locales',
  missingTranslations.length === 0,
  missingTranslations.join(', ')
);

check(
  'Dashboard map is shared with the server-authoritative mapping',
  JSON.stringify(ROLE_DASHBOARD_MAP) === JSON.stringify(ROLE_DASHBOARD_TABS)
);

for (const role of ROLES) {
  const dashboard = ROLE_DASHBOARD_MAP[role];
  check(
    `${role} default page is routable`,
    Boolean(dashboard) && Boolean(APP_ROUTES[dashboard]),
    dashboard
  );
  check(
    `${role} default page matches the shared dashboard map`,
    getRoleDashboardTab(role) === dashboard
  );
  check(
    `${role} default page is allowed by RBAC`,
    isTabAllowedForRole(role, dashboard),
    dashboard
  );
  check(
    `${role} default page is not the public landing page`,
    dashboard !== 'landing',
    dashboard
  );
  check(
    `${role} landing hash resolves to the authorized dashboard`,
    resolveRequestedTab(role, 'landing', dashboard) === dashboard,
    resolveRequestedTab(role, 'landing', dashboard)
  );
  check(
    `${role} apply hash resolves to the authorized dashboard`,
    resolveRequestedTab(role, 'apply', dashboard) === dashboard,
    resolveRequestedTab(role, 'apply', dashboard)
  );
  check(
    `${role} visible menu excludes public Home and Apply links`,
    getVisibleNavItems(role).every(item => !publicOnlyTabs.includes(item.id)),
    getVisibleNavItems(role).filter(item => publicOnlyTabs.includes(item.id)).map(item => item.id).join(', ')
  );

  const visibleSections = getVisibleNavSections(role);
  const visibleItems = visibleSections.flatMap(section => section.items);

  check(
    `${role} has a navigation menu`,
    visibleItems.length > 0,
    `${visibleItems.length} items`
  );

  const forbiddenVisible = visibleItems.filter(item => !isTabAllowedForRole(role, item.id));
  check(
    `${role} menu respects RBAC permissions`,
    forbiddenVisible.length === 0,
    forbiddenVisible.map(item => item.id).join(', ')
  );

  const unroutableVisible = visibleItems.filter(item => !APP_ROUTES[item.id]);
  check(
    `${role} menu pages are all registered`,
    unroutableVisible.length === 0,
    unroutableVisible.map(item => item.id).join(', ')
  );

  const quickNav = getQuickNavItems(role);
  check(
    `${role} quick navigation is available`,
    quickNav.length > 0,
    quickNav.map(item => item.id).join(', ')
  );
  check(
    `${role} quick navigation respects RBAC permissions`,
    quickNav.every(item => isTabAllowedForRole(role, item.id)),
    quickNav.filter(item => !isTabAllowedForRole(role, item.id)).map(item => item.id).join(', ')
  );
  check(
    `${role} quick navigation pages are all registered`,
    quickNav.every(item => Boolean(APP_ROUTES[item.id])),
    quickNav.filter(item => !APP_ROUTES[item.id]).map(item => item.id).join(', ')
  );
}

const headteacherSections = getVisibleNavSections('HEAD_TEACHER');
const expectedHeadteacherSections = [
  'Dashboard',
  'People Management',
  'Academic Management',
  'School Operations',
  'Finance',
  'Communication',
  'Reports & Analytics',
  'School Settings'
];
check(
  'Headteacher sidebar uses the eight requested sections',
  JSON.stringify(headteacherSections.map(section => section.label)) ===
    JSON.stringify(expectedHeadteacherSections),
  headteacherSections.map(section => section.label).join(' | ')
);

const headteacherVisibleIds = headteacherSections.flatMap(section => section.items).map(item => item.id);
const headteacherTabs = ROLE_ALLOWED_TABS.HEAD_TEACHER;
const hiddenHeadteacherTabs = ['documents'];
const missingGroupedTabs = headteacherTabs.filter(
  id => !hiddenHeadteacherTabs.includes(id) && !headteacherVisibleIds.includes(id)
);
check(
  'Grouping preserves every Headteacher page except intentionally hidden entries',
  missingGroupedTabs.length === 0,
  missingGroupedTabs.join(', ')
);
check(
  'Headteacher sidebar hides School Documents',
  !headteacherVisibleIds.includes('documents'),
  headteacherVisibleIds.join(', ')
);
check(
  'School Documents remains registered for other roles',
  Boolean(NAV_ITEM_MAP.documents) && Boolean(APP_ROUTES.documents),
  `nav=${Boolean(NAV_ITEM_MAP.documents)} route=${Boolean(APP_ROUTES.documents)}`
);

const headteacherDashboardSection = headteacherSections.find(section => section.label === 'Dashboard');
check(
  'Headteacher Dashboard section includes the Smart Alert Center',
  Boolean(headteacherDashboardSection?.items.some(item => item.id === 'alert-center')),
  headteacherDashboardSection?.items.map(item => item.id).join(', ') ?? ''
);
check(
  'Smart Alert Center is limited to school leadership roles',
  ROLES
    .filter(role => !['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER'].includes(role))
    .every(role => !isTabAllowedForRole(role, 'alert-center')),
  ROLES.filter(role => isTabAllowedForRole(role, 'alert-center')).join(', ')
);

const failed = checks.filter(item => !item.passed);

for (const item of checks) {
  const status = item.passed ? 'PASS' : 'FAIL';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`[${status}] ${item.name}${detail}`);
}

console.log('');
console.log(
  `${checks.length - failed.length}/${checks.length} navigation checks passed for ${ROLES.length} roles, ${navIds.length} navigation items and ${routeIds.length} routes.`
);

if (failed.length > 0) {
  process.exitCode = 1;
}
