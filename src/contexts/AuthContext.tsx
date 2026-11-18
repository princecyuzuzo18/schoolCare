import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, School } from '../types';
import { api } from '../services/api';
import { getRoleDashboard } from '../rbac';

interface AuthContextType {
  currentUser: UserProfile | null;
  role: UserRole | null;
  school: School | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  availableUsers: UserProfile[];
  refreshSchool: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const initAuth = async () => {
    try {
      setIsLoading(true);
      const [schoolData, authResult] = await Promise.all([api.getSchool(), api.getMe()]);
      setSchool(schoolData);
      setCurrentUser(authResult.user);
      if (authResult.user) {
        setAvailableUsers([]);
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
      setSessionExpired(true);
    };
    window.addEventListener('schoolcare:session-expired', handleSessionExpired);
    return () => window.removeEventListener('schoolcare:session-expired', handleSessionExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    setCurrentUser(user);
    setSessionExpired(false);
    if (typeof window !== 'undefined') {
      const existingTarget = window.sessionStorage.getItem('schoolcare_redirect_target');
      if (!existingTarget) {
        window.sessionStorage.setItem('schoolcare_redirect_target', getRoleDashboard(user.role));
      }
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      sessionStorage.removeItem('schoolcare_redirect_target');
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

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        school,
        isLoading,
        sessionExpired,
        login,
        logout,
        switchRole,
        availableUsers,
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
