/**
 * Guarded Headteacher self-profile checks. JSON data is isolated in a temp
 * directory and MariaDB is pointed at a deliberately unused test database, so
 * no live school profile is read or modified.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';

type Check = { name: string; passed: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-profile-'));
  process.env.SCHOOLCARE_DATA_DIR = dataDir;
  process.env.SCHOOLCARE_SKIP_SERVER_START = '1';
  process.env.DB_DATABASE = 'schoolcare_profile_test_unavailable';
  process.env.DB_NAME = 'schoolcare_profile_test_unavailable';

  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');
  const { getStaffProfile } = await import('../server/staffAdministration');

  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  function cookieFor(userId: string): string {
    const headers: Record<string, string> = {};
    createSession(userId, {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
      }
    } as unknown as Response);
    return (headers['Set-Cookie'] || '').split(';')[0];
  }

  async function request(apiPath: string, cookie?: string, method = 'GET', payload?: unknown) {
    const response = await fetch(`${base}${apiPath}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const text = await response.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text for diagnostics
    }
    return { status: response.status, body };
  }

  const headCookie = cookieFor('user-super-admin');
  const teacherCookie = cookieFor('user-teacher');
  const original = { ...db.getUserById('user-super-admin')! };
  const schoolId = original.schoolId;
  const originalStaffProfile = getStaffProfile(schoolId, 'user-super-admin');
  const beforeAudit = db.getAuditLogs(schoolId).length;

  const anonymous = await request('/api/auth/me/profile', undefined, 'PATCH', { phone: '+250788000000' });
  check('Anonymous self-profile edit is rejected', anonymous.status === 401, `status ${anonymous.status}`);

  const teacher = await request('/api/auth/me/profile', teacherCookie, 'PATCH', { phone: '+250788000000' });
  check('Teacher self-profile edit is rejected', teacher.status === 403, `status ${teacher.status}`);

  const attempted = {
    fullName: 'MUNYENTWARI Olivier Verified',
    phone: '+250788111222',
    photoUrl: '',
    // Privileged fields must be ignored even when supplied in the body.
    id: 'spoofed-user',
    schoolId: 'other-school',
    email: 'attacker@example.com',
    role: 'SUPER_ADMIN',
    isActive: false,
    credentialsResetAt: '2000-01-01T00:00:00.000Z',
    delegatedPermissions: ['permissions.grant'],
    delegatedRoleScope: ['SUPER_ADMIN'],
    staffId: 'HACKED',
    department: 'Hacked'
  };
  const updated = await request('/api/auth/me/profile', headCookie, 'PATCH', attempted);
  check('Headteacher can update allowlisted profile fields', updated.status === 200, JSON.stringify(updated.body).slice(0, 300));

  const user = db.getUserById('user-super-admin')!;
  check('Display name is updated with consistent first and last names',
    user.fullName === attempted.fullName && user.firstName === 'MUNYENTWARI' && user.lastName === 'Olivier Verified',
    JSON.stringify({ fullName: user.fullName, firstName: user.firstName, lastName: user.lastName })
  );
  check('Phone and photo URL are updated', user.phone === attempted.phone && user.avatarUrl === '', `${user.phone} / ${user.avatarUrl}`);
  check('Identity, role and school remain immutable',
    user.id === original.id && user.email === original.email && user.role === original.role && user.schoolId === original.schoolId,
    JSON.stringify({ id: user.id, email: user.email, role: user.role, schoolId: user.schoolId })
  );
  check('Account status, credentials and delegations remain immutable',
    user.isActive === original.isActive && user.credentialsResetAt === original.credentialsResetAt &&
      JSON.stringify(user.delegatedPermissions) === JSON.stringify(original.delegatedPermissions),
    JSON.stringify({ isActive: user.isActive, credentialsResetAt: user.credentialsResetAt })
  );
  check('MariaDB mirror failure is reported honestly',
    updated.body?.databaseSync === 'unavailable',
    String(updated.body?.databaseSync)
  );

  const me = await request('/api/auth/me', headCookie);
  check('Signed-in session returns updated profile', me.status === 200 && me.body?.user?.fullName === attempted.fullName);

  const account = db.getStaffAccountByUserId('user-super-admin');
  check('Staff account mirror is updated', account?.phone === attempted.phone && account?.photoUrl === '', JSON.stringify({ phone: account?.phone, photoUrl: account?.photoUrl }));
  const staffMember = getStaffProfile(schoolId, 'user-super-admin');
  check('Staff directory mirror keeps the professional identity',
    staffMember?.fullName === attempted.fullName && staffMember?.staffId === originalStaffProfile?.staffId,
    JSON.stringify({ fullName: staffMember?.fullName, staffId: staffMember?.staffId })
  );

  const logs = db.getAuditLogs(schoolId);
  const profileLog = logs.find(entry => entry.action === 'UPDATE_OWN_PROFILE');
  check('Self-profile edit is appended to activity history', logs.length === beforeAudit + 1, `${beforeAudit} -> ${logs.length}`);
  check('Audit detail names fields but not values',
    Boolean(profileLog) && !profileLog!.details.includes(attempted.fullName) &&
      !profileLog!.details.includes(attempted.phone) &&
      profileLog!.details.includes('fullName') && profileLog!.details.includes('phone'),
    JSON.stringify(profileLog)
  );

  const emptyName = await request('/api/auth/me/profile', headCookie, 'PATCH', { fullName: '   ' });
  check('Empty display name is rejected', emptyName.status === 400, `status ${emptyName.status}`);
  const longName = await request('/api/auth/me/profile', headCookie, 'PATCH', { fullName: 'A'.repeat(151) });
  check('Overlong display name is rejected', longName.status === 400, `status ${longName.status}`);
  const wrongType = await request('/api/auth/me/profile', headCookie, 'PATCH', { phone: 12345 });
  check('Non-text profile value is rejected', wrongType.status === 400, `status ${wrongType.status}`);
  const noFields = await request('/api/auth/me/profile', headCookie, 'PATCH', { role: 'SUPER_ADMIN' });
  check('Privileged-only payload is rejected', noFields.status === 400, `status ${noFields.status}`);

  const serverSource = readFileSync(path.resolve('server.ts'), 'utf-8');
  check('Profile route is restricted to the Headteacher role',
    serverSource.includes("app.patch('/api/auth/me/profile', requireRole('HEAD_TEACHER')")
  );
  check('Profile route allowlist excludes privileged fields',
    !/for \(const field of \['fullName', 'phone', 'photoUrl', 'role'/.test(serverSource) &&
      serverSource.includes("const input: { fullName?: string; phone?: string; photoUrl?: string } = {}")
  );

  const settingsSource = readFileSync(path.resolve('src/pages/SettingsPage.tsx'), 'utf-8');
  check('Settings exposes only the editable self-profile fields',
    settingsSource.includes('canEditProfile') &&
      settingsSource.includes('fullName: profileForm.fullName') &&
      settingsSource.includes('phone: profileForm.phone') &&
      settingsSource.includes('photoUrl: profileForm.photoUrl') &&
      !settingsSource.includes('updateMyProfile({ role')
  );

  const enSource = readFileSync(path.resolve('src/i18n/en.ts'), 'utf-8');
  const rwSource = readFileSync(path.resolve('src/i18n/rw.ts'), 'utf-8');
  check('Profile notices are translated',
    enSource.includes('selfProfileUpdated:') && rwSource.includes('selfProfileUpdated:') &&
      enSource.includes('profileDbUnavailable:') && rwSource.includes('profileDbUnavailable:')
  );

  const profileFormKeys = [
    'profileReadonlySubtitle',
    'profileFullNameLabel',
    'profilePhoneLabel',
    'profilePhotoUrlLabel',
    'profileSave',
    'profileSaving'
  ];
  check('Profile form labels are translated and used',
    profileFormKeys.every(key => enSource.includes(`${key}:`) && rwSource.includes(`${key}:`)) &&
      settingsSource.includes("t('profileFullNameLabel')") &&
      settingsSource.includes("t('profilePhoneLabel')") &&
      settingsSource.includes("t('profilePhotoUrlLabel')") &&
      settingsSource.includes("'profileSave'")
  );

  server.close();
  const failed = checks.filter(item => !item.passed);
  for (const item of failed) console.error(`FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`${checks.length - failed.length}/${checks.length} Headteacher profile checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
