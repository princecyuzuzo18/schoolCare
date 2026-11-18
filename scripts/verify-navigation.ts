import { NAV_ITEMS, getQuickNavItems, getVisibleNavSections } from '../src/navigation';
import { APP_ROUTES } from '../src/routes';
import { ROLE_ALLOWED_TABS, ROLE_DASHBOARD_MAP, isTabAllowedForRole } from '../src/rbac';
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

for (const role of ROLES) {
  const dashboard = ROLE_DASHBOARD_MAP[role];
  check(
    `${role} default page is routable`,
    Boolean(dashboard) && Boolean(APP_ROUTES[dashboard]),
    dashboard
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
