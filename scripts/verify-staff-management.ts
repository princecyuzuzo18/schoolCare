import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UserRole } from '../src/types';
import { ASSIGNABLE_STAFF_ROLES } from '../src/roleCatalog';

type Check = { name: string; passed: boolean; detail?: string };

const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-staff-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;

try {
  const { db } = await import('../server/database');
  const {
    StaffManagementError,
    activateStaffInvitation,
    createStaffInvitation,
    publicInvitation,
    resendStaffInvitation
  } = await import('../server/staffManagement');
  const { archiveStaffAccount, getStaffProfile } = await import('../server/staffAdministration');

  const actor = db.getUserById('user-super-admin');
  check('Headteacher account exists after normalization', actor?.role === 'HEAD_TEACHER');

  const initialAccounts = db.getStaffAccounts('school-es-rubengera-01');
  check('Staff accounts were created additively', initialAccounts.length >= 7, `${initialAccounts.length} accounts`);

  if (!actor) {
    check('Invitation creation has an actor', false, 'no Headteacher account');
  } else {
    const created = createStaffInvitation(
      {
        fullName: 'Test Teacher',
        email: 'test.teacher@schoolcare.rw',
        phone: '+250 700 111 222',
        role: 'TEACHER',
        gender: 'F',
        preferredLanguage: 'rw'
      },
      actor
    );

    check('Invitation token is high entropy', created.token.length >= 40);
    check('Invitation token hash is stored', created.invitation.tokenHash.length === 64);
    check('Invitation expires in the future', new Date(created.invitation.expiresAt).getTime() > Date.now());
    check('Public invitation hides token hash', !('tokenHash' in publicInvitation(created.invitation)));

    try {
      createStaffInvitation(
        {
          fullName: 'Duplicate Teacher',
          email: 'TEST.TEACHER@schoolcare.rw',
          phone: '+250 700 111 223',
          role: 'TEACHER',
          preferredLanguage: 'en'
        },
        actor
      );
      check('Duplicate pending invitation is rejected', false, 'duplicate was accepted');
    } catch (error) {
      check('Duplicate pending invitation is rejected', error instanceof StaffManagementError);
    }

    for (const role of ASSIGNABLE_STAFF_ROLES) {
      const createdRole = createStaffInvitation(
        {
          fullName: `Test ${role}`,
          email: `role.${role.toLowerCase()}.test@schoolcare.rw`,
          phone: '+250 700 222 333',
          role,
          staffId: `STF-${role.slice(0, 3)}`,
          professionalTitle: 'Professional title',
          department: 'Test department',
          responsibilities: ['Duty one', 'Duty two'],
          employmentStartDate: '2026-01-10',
          deliveryMode: 'SECURE_ACTIVATION',
          preferredLanguage: 'en'
        },
        actor
      );
      check(
        `${role} invitation stores full professional details`,
        createdRole.invitation.role === role &&
          createdRole.invitation.staffId === `STF-${role.slice(0, 3)}` &&
          (createdRole.invitation.responsibilities || []).length === 2 &&
          createdRole.invitation.deliveryMode === 'SECURE_ACTIVATION'
      );
    }

    const oldTokenHash = created.invitation.tokenHash;
    const resent = resendStaffInvitation(created.invitation);
    check(
      'Resending an invitation rotates the token hash',
      resent.token !== created.token &&
        resent.invitation.tokenHash !== oldTokenHash &&
        Boolean(resent.invitation.resentAt)
    );

    try {
      createStaffInvitation(
        {
          fullName: 'Fake Head',
          email: 'fake.head@schoolcare.rw',
          phone: '+250 700 111 224',
          role: 'HEAD_TEACHER' as UserRole,
          preferredLanguage: 'en'
        },
        actor
      );
      check('Headteacher role cannot be invited', false, 'protected role was accepted');
    } catch (error) {
      check('Headteacher role cannot be invited', error instanceof StaffManagementError);
    }
  }

  const archived = archiveStaffAccount('school-es-rubengera-01', 'user-teacher', 'user-super-admin');
  check(
    'Archiving preserves the record and blocks sign-in',
    archived?.item.accountStatus === 'ARCHIVED' && archived.user.isActive === false
  );
  check(
    'Archived staff profile remains available',
    getStaffProfile('school-es-rubengera-01', 'user-teacher')?.accountStatus === 'ARCHIVED'
  );

  try {
    await activateStaffInvitation({ token: 'bad-token', password: 'a-very-long-password' });
    check('Malformed activation token is rejected', false, 'token was accepted');
  } catch (error) {
    check('Malformed activation token is rejected', error instanceof StaffManagementError);
  }

  const failed = checks.filter(item => !item.passed);
  for (const item of checks) {
    const status = item.passed ? 'PASS' : 'FAIL';
    const detail = item.detail ? ` (${item.detail})` : '';
    console.log(`[${status}] ${item.name}${detail}`);
  }
  console.log('');
  console.log(`${checks.length - failed.length}/${checks.length} staff-management checks passed.`);

  if (failed.length > 0) process.exitCode = 1;
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
