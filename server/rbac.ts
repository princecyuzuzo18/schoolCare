import type { NextFunction, Request, Response } from 'express';
import { db } from './database';
import type { UserProfile, UserRole } from '../src/types';
import { hasPermission, ROLE_PERMISSIONS } from './permissions';
import { getSessionUserId } from './sessions';

export { ROLE_PERMISSIONS };

export function authenticateUser(req: Request, res: Response, next: NextFunction): void {
  const userId = getSessionUserId(req);
  const user = userId ? db.getUserById(userId) : undefined;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (user.isActive === false) {
    res.status(403).json({ error: 'This account is inactive. Contact the Headteacher.' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user || user.isActive === false || !allowedRoles.includes(user.role)) {
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

    if (!hasPermission(user, permission)) {
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
