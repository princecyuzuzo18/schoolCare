import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, School, PermissionsResponse } from '../types';
import { api } from '../services/api';
import { getRoleDashboard } from '../rbac';

export const REDIRECT_TARGET_KEY = 'schoolcare_redirect_target';

interface AuthContextType {
  currentUser: UserProfile | null;
  role: UserRole | null;
  school: School | null;
  defaultDashboard: string;
  dashboardUrl: string;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  availableUsers: UserProfile[];
  effectivePermissions: string[];
  delegatablePermissions: string[];
  leaderOnlyDelegatablePermissions: string[];
  delegatableRoleScope: UserRole[];
  permissionCatalog: PermissionsResponse['catalog'];
  rolePermissions: PermissionsResponse['rolePermissions'] | null;
  hasPermission: (permission: string) => boolean;
  refreshPermissions: () => Promise<void>;
  refreshSchool: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [defaultDashboard, setDefaultDashboard] = useState<string>(() => getRoleDashboard(null));
  const [dashboardUrl, setDashboardUrl] = useState<string>('/portal#/landing');
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [permissions, setPermissions] = useState<PermissionsResponse | null>(null);

  const loadPermissions = async () => {
    try {
      const data = await api.getPermissions();
      setPermissions(data);
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setPermissions(null);
    }
  };

  const initAuth = async () => {
    try {
      setIsLoading(true);
      // An anonymous visitor gets 401 from /auth/me; that must not prevent the
      // public school details from loading.
      const [schoolResult, authResult] = await Promise.allSettled([api.getSchool(), api.getMe()]);
      if (schoolResult.status === 'fulfilled') {
        setSchool(schoolResult.value);
      }
      if (authResult.status === 'fulfilled' && authResult.value.user) {
        const session = authResult.value;
        setCurrentUser(session.user);
        setDefaultDashboard(session.defaultDashboard || getRoleDashboard(session.user?.role));
        setDashboardUrl(session.dashboardUrl || `/portal#/${getRoleDashboard(session.user?.role)}`);
        setAvailableUsers([]);
        await loadPermissions();
      } else {
        setCurrentUser(null);
        setPermissions(null);
        setDefaultDashboard(getRoleDashboard(null));
        setDashboardUrl('/portal#/landing');
      }
    } catch (err) {
      console.error('Failed to initialize auth:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setCurrentUser(null);
      sessionStorage.removeItem(REDIRECT_TARGET_KEY);
      setSessionExpired(true);
    };
    window.addEventListener('schoolcare:session-expired', handleSessionExpired);
    return () => window.removeEventListener('schoolcare:session-expired', handleSessionExpired);
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const session = await api.login(email, password);
    const { user } = session;
    if (!user) {
      throw new Error('The server did not return an authenticated account.');
    }
    const authorizedDashboard = session.defaultDashboard || getRoleDashboard(user.role);
    setCurrentUser(user);
    setDefaultDashboard(authorizedDashboard);
    setDashboardUrl(session.dashboardUrl || `/portal#/${authorizedDashboard}`);
    await loadPermissions();
    setSessionExpired(false);
    if (typeof window !== 'undefined') {
      // A successful login always wins over any stale or deep-link target.
      window.sessionStorage.setItem(REDIRECT_TARGET_KEY, authorizedDashboard);
    }
    return user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      setPermissions(null);
      setDefaultDashboard(getRoleDashboard(null));
      setDashboardUrl('/portal#/landing');
      sessionStorage.removeItem(REDIRECT_TARGET_KEY);
      setSessionExpired(false);
    }
  };

  const switchRole = async (_targetRole: UserRole) => {
    return;
  };

  const refreshSchool = async () => {
    const data = await api.getSchool();
    setSchool(data);
  };

  const role = currentUser?.role ?? null;
  const effectivePermissions = permissions?.effectivePermissions ?? [];

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        school,
        defaultDashboard,
        dashboardUrl,
        isLoading,
        sessionExpired,
        login,
        logout,
        switchRole,
        availableUsers,
        effectivePermissions,
        delegatablePermissions: permissions?.delegatablePermissions ?? [],
        leaderOnlyDelegatablePermissions: permissions?.leaderOnlyDelegatablePermissions ?? [],
        delegatableRoleScope: permissions?.delegatableRoleScope ?? [],
        permissionCatalog: permissions?.catalog ?? [],
        rolePermissions: permissions?.rolePermissions ?? null,
        hasPermission: (permission: string) => effectivePermissions.includes(permission),
        refreshPermissions: loadPermissions,
        refreshSchool
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
