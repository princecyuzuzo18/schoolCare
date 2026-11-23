import type { Express, Request, Response } from 'express';
import { db } from './database';
import { requireRole } from './rbac';
import { getProfessionalTitle } from '../src/roleCatalog';
import type { UserProfile } from '../src/types';

/**
 * Platform-level control of the school's highest administrator.
 *
 * The headteacher cannot be appointed, promoted or replaced through delegated
 * staff management: ASSIGNABLE_STAFF_ROLES excludes HEAD_TEACHER and
 * SUPER_ADMIN. Only a Platform Super Admin may use this endpoint.
 */
export function registerHeadteacherAppointmentRoutes(app: Express): void {
  app.post(
    '/api/platform/headteacher/appoint',
    requireRole('SUPER_ADMIN'),
    (req: Request, res: Response) => {
      try {
        const actor = req.user as UserProfile;
        const { userId, schoolId } = req.body ?? {};

        if (typeof userId !== 'string' || !userId.trim()) {
          return res.status(400).json({ error: 'A target user is required.' });
        }
        if (typeof schoolId !== 'string' || !schoolId.trim()) {
          return res.status(400).json({ error: 'A school is required.' });
        }

        const target = db.getUserById(userId);
        if (!target) {
          return res.status(404).json({ error: 'Target account not found.' });
        }
        if (target.schoolId !== schoolId) {
          return res.status(403).json({ error: 'Target account belongs to another school.' });
        }
        if (target.role === 'SUPER_ADMIN') {
          return res.status(409).json({ error: 'Platform administrators cannot be appointed as headteacher.' });
        }

        const previousRole = target.role;
        db.updateUserRole(target.id, 'HEAD_TEACHER');

        const account = db.getStaffAccountByUserId(target.id);
        if (account) {
          db.updateStaffAccount(account.id, {
            role: 'HEAD_TEACHER',
            professionalTitle: getProfessionalTitle('HEAD_TEACHER')
          });
        }
        const staffMember = db.getStaff(schoolId).find(
          member => member.email.toLowerCase() === target.email.toLowerCase()
        );
        if (staffMember) {
          db.updateStaffMember(staffMember.id, {
            role: 'HEAD_TEACHER',
            title: getProfessionalTitle('HEAD_TEACHER')
          });
        }

        db.logAudit(
          schoolId,
          actor.id,
          actor.fullName,
          actor.role,
          'HEADTEACHER_APPOINTED',
          'STAFF_ACCOUNT',
          target.id,
          `${previousRole} -> HEAD_TEACHER`,
          req.ip
        );

        return res.json({ user: db.getUserById(target.id) });
      } catch (error) {
        console.error('[Platform] Headteacher appointment failed:', error);
        return res.status(500).json({ error: 'Unable to appoint the headteacher.' });
      }
    }
  );
}
