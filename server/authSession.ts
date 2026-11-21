import type { AuthSessionResponse, UserProfile } from '../src/types';
import { getRoleDashboardTab, getRoleDashboardUrl } from '../src/roleDashboards';

/**
 * Build the session payload returned by /api/auth/login and /api/auth/me.
 * The dashboard is derived server-side from the stored account role; the
 * browser never gets to choose or alter its own authorized destination.
 */
export function buildAuthSessionView(user: UserProfile | null): AuthSessionResponse {
  return {
    user,
    defaultDashboard: getRoleDashboardTab(user?.role),
    dashboardUrl: getRoleDashboardUrl(user?.role)
  };
}
