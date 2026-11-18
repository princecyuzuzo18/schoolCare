import type { NextFunction, Request, Response } from 'express';
import { db } from './database';
import type { UserProfile, UserRole } from '../src/types';
import { getSessionUserId } from './sessions';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: [
    'school:read', 'school:write', 'students:read', 'students:write', 'guardians:read',
    'guardians:write', 'attendance:read', 'attendance:write', 'health:read', 'health:write',
    'finance:read', 'finance:write', 'academics:read', 'academics:write', 'staff:read',
    'staff:write', 'reports:read', 'audit:read', 'notifications:read', 'notifications:write'
  ],
  SCHOOL_ADMIN: [
    'school:read', 'school:write', 'students:read', 'students:write', 'guardians:read',
    'guardians:write', 'attendance:read', 'attendance:write', 'health:read', 'health:write',
    'finance:read', 'finance:write', 'academics:read', 'academics:write', 'staff:read',
    'staff:write', 'reports:read', 'audit:read', 'notifications:read', 'notifications:write'
  ],
  HEAD_TEACHER: [
    'students:read', 'attendance:read', 'attendance:write', 'academics:read', 'academics:write',
    'reports:read', 'notifications:read', 'guardians:read'
  ],
  DEPUTY_HEAD: [
    'students:read', 'attendance:read', 'academics:read', 'reports:read', 'notifications:read'
  ],
  TEACHER: [
    'students:read', 'attendance:read', 'attendance:write', 'academics:read', 'notifications:read'
  ],
  NURSE: [
    'health:read', 'health:write', 'students:read', 'guardians:read', 'notifications:read',
    'notifications:write'
  ],
  ACCOUNTANT: [
    'finance:read', 'finance:write', 'students:read', 'reports:read', 'notifications:read'
  ],
  PARENT: [
    'students:read', 'guardians:read', 'attendance:read', 'academics:read', 'finance:read',
    'notifications:read'
  ],
  STUDENT: [
    'students:read', 'attendance:read', 'academics:read', 'notifications:read'
  ]
};

export function authenticateUser(req: Request, res: Response, next: NextFunction): void {
  const userId = getSessionUserId(req);
  const user = userId ? db.getUserById(userId) : undefined;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user || !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden: user role is not permitted for this action.' });
      return;
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const allowed = ROLE_PERMISSIONS[user.role] ?? [];
    if (!allowed.includes(permission)) {
      res.status(403).json({ error: `Forbidden: missing '${permission}' permission.` });
      return;
    }

    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}

export {};
