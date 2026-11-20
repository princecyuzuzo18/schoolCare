import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UserRole } from '../src/types';

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
    publicInvitation
  } = await import('../server/staffManagement');

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
