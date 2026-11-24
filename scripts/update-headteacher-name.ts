/**
 * One-time, guarded update of the current Headteacher's personal name.
 *
 * Run with: npx tsx scripts/update-headteacher-name.ts
 *
 * Targets the existing account by ID, role and email. It never creates an
 * account, changes credentials, role, permissions, email or foreign keys.
 * The MariaDB update is parameterized; the persistent JSON store is updated
 * structurally and written atomically. Take a full backup first with
 * `npm run db:backup`.
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = 'user-super-admin';
const ACCOUNT_EMAIL = 'esrubengera@gmail.com';
const ACCOUNT_ROLE = 'HEAD_TEACHER';
const OLD_FULL_NAME = 'Dr. Emmanuel Habimana';
const NEW_FIRST_NAME = 'MUNYENTWARI';
const NEW_LAST_NAME = 'Olivier';
const NEW_FULL_NAME = 'MUNYENTWARI Olivier';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function config() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db'
  };
}

async function main(): Promise<void> {
  const dataDir = process.env.SCHOOLCARE_DATA_DIR || path.resolve(process.cwd(), 'data');
  const jsonPath = path.join(dataDir, 'schoolcare_db.json');
  const originalJson = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(originalJson) as Record<string, any[]>;

  // --- Identify the single, existing Headteacher account --------------------
  const headteachers = (data.users || []).filter(user => user.role === ACCOUNT_ROLE);
  assert(headteachers.length === 1, `Expected exactly one HEAD_TEACHER account, found ${headteachers.length}.`);
  const account = headteachers[0];
  assert(account.id === ACCOUNT_ID, `Unexpected Headteacher ID: ${account.id}.`);
  assert(
    String(account.email).toLowerCase() === ACCOUNT_EMAIL,
    `Unexpected Headteacher email: ${account.email}.`
  );
  assert(account.isActive !== false, 'Headteacher account is inactive; refusing to update.');
  assert(
    account.fullName === OLD_FULL_NAME || account.fullName === NEW_FULL_NAME,
    `Unexpected current Headteacher name: ${account.fullName}.`
  );

  const userSnapshot = JSON.stringify({ ...account });
  const otherUsersBefore = JSON.stringify(
    (data.users || []).filter(user => user.id !== ACCOUNT_ID)
  );
  const otherStaffBefore = JSON.stringify(
    (data.staff || []).filter(member => member.id !== 'stf-06')
  );

  const staffMatches = (data.staff || []).filter(
    member => member.role === ACCOUNT_ROLE && String(member.email).toLowerCase() === ACCOUNT_EMAIL
  );
  assert(
    staffMatches.length === 1,
    `Expected exactly one Headteacher staff-directory record, found ${staffMatches.length}.`
  );
  const staffMember = staffMatches[0];

  const relatedCountsBefore = {
    students: (data.students || []).length,
    attendance: (data.attendance || []).length,
    reportCards: (data.reportCards || []).length,
    staffAccounts: (data.staffAccounts || []).filter(item => item.userId === ACCOUNT_ID).length,
    permissionGrants: (data.permissionGrants || []).filter(item => item.userId === ACCOUNT_ID).length
  };

  // --- Update the persistent JSON store -------------------------------------
  account.firstName = NEW_FIRST_NAME;
  account.lastName = NEW_LAST_NAME;
  account.fullName = NEW_FULL_NAME;
  staffMember.firstName = NEW_FIRST_NAME;
  staffMember.lastName = NEW_LAST_NAME;
  staffMember.fullName = NEW_FULL_NAME;

  let auditLogsUpdated = 0;
  for (const entry of data.auditLogs || []) {
    if (entry.userId === ACCOUNT_ID && entry.userName === OLD_FULL_NAME) {
      entry.userName = NEW_FULL_NAME;
      auditLogsUpdated += 1;
    }
  }

  assert(
    (data.users || []).filter(user => user.role === ACCOUNT_ROLE).length === 1,
    'Headteacher account count changed unexpectedly.'
  );
  assert(
    JSON.stringify((data.users || []).filter(user => user.id !== ACCOUNT_ID)) === otherUsersBefore,
    'Another user account would be changed; aborting.'
  );
  assert(
    JSON.stringify((data.staff || []).filter(member => member.id !== staffMember.id)) === otherStaffBefore,
    'Another staff record would be changed; aborting.'
  );

  const updatedJson = JSON.stringify(data, null, 2);
  const tempPath = `${jsonPath}.headteacher-name.tmp`;
  const mode = fs.statSync(jsonPath).mode;
  fs.writeFileSync(tempPath, updatedJson, { mode });
  fs.renameSync(tempPath, jsonPath);
  console.log(`JSON store updated: ${jsonPath} (${auditLogsUpdated} activity-history entries refreshed).`);

  // --- Update the MariaDB identity with a parameterized statement -----------
  const pool = mysql.createPool(config());
  try {
    type ProfileRow = RowDataPacket & {
      id: string;
      role_id: string;
      full_name: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    };
    const [profileRows] = await pool.execute<ProfileRow[]>(
      `SELECT id, role_id, full_name, email, first_name, last_name
       FROM user_profiles WHERE id = ? LIMIT 1`,
      [ACCOUNT_ID]
    );
    assert(profileRows.length === 1, `MariaDB profile ${ACCOUNT_ID} not found.`);
    const profile = profileRows[0];
    assert(profile.role_id === ACCOUNT_ROLE, `Unexpected MariaDB role: ${profile.role_id}.`);
    assert(
      String(profile.email).toLowerCase() === ACCOUNT_EMAIL,
      `Unexpected MariaDB email: ${profile.email}.`
    );
    assert(
      profile.full_name === OLD_FULL_NAME || profile.full_name === NEW_FULL_NAME,
      `Unexpected MariaDB name: ${profile.full_name}.`
    );

    const [credentialBefore] = await pool.execute<Array<RowDataPacket & { password_hash: string }>>(
      'SELECT password_hash FROM user_auth_credentials WHERE user_id = ? LIMIT 1',
      [ACCOUNT_ID]
    );
    assert(credentialBefore.length === 1, 'Headteacher password credential is missing.');

    const [otherProfilesBefore] = await pool.execute<ProfileRow[]>(
      'SELECT id, role_id, full_name, email, first_name, last_name FROM user_profiles WHERE id <> ? ORDER BY id',
      [ACCOUNT_ID]
    );

    // Every value is bound as a parameter. The WHERE clause additionally
    // pins the account ID, role and email so no other record can match.
    const [result] = await pool.execute(
      `UPDATE user_profiles
       SET full_name = ?, first_name = ?, last_name = ?
       WHERE id = ? AND role_id = ? AND LOWER(email) = LOWER(?)
         AND full_name IN (?, ?)
       LIMIT 1`,
      [
        NEW_FULL_NAME,
        NEW_FIRST_NAME,
        NEW_LAST_NAME,
        ACCOUNT_ID,
        ACCOUNT_ROLE,
        ACCOUNT_EMAIL,
        OLD_FULL_NAME,
        NEW_FULL_NAME
      ]
    );

    const [profileAfterRows] = await pool.execute<ProfileRow[]>(
      `SELECT id, role_id, full_name, email, first_name, last_name
       FROM user_profiles WHERE id = ? LIMIT 1`,
      [ACCOUNT_ID]
    );
    const profileAfter = profileAfterRows[0];
    assert(
      profileAfter?.full_name === NEW_FULL_NAME &&
        profileAfter.first_name === NEW_FIRST_NAME &&
        profileAfter.last_name === NEW_LAST_NAME,
      'MariaDB name verification failed.'
    );
    assert(profileAfter.role_id === ACCOUNT_ROLE, 'MariaDB role changed unexpectedly.');
    assert(String(profileAfter.email).toLowerCase() === ACCOUNT_EMAIL, 'MariaDB email changed unexpectedly.');

    const [credentialAfter] = await pool.execute<Array<RowDataPacket & { password_hash: string }>>(
      'SELECT password_hash FROM user_auth_credentials WHERE user_id = ? LIMIT 1',
      [ACCOUNT_ID]
    );
    assert(
      credentialAfter[0]?.password_hash === credentialBefore[0].password_hash,
      'Password hash changed unexpectedly.'
    );

    const [otherProfilesAfter] = await pool.execute<ProfileRow[]>(
      'SELECT id, role_id, full_name, email, first_name, last_name FROM user_profiles WHERE id <> ? ORDER BY id',
      [ACCOUNT_ID]
    );
    assert(
      JSON.stringify(otherProfilesAfter) === JSON.stringify(otherProfilesBefore),
      'Another MariaDB profile changed unexpectedly.'
    );

    console.log(
      `MariaDB updated: ${ACCOUNT_ID} (${String((result as { affectedRows?: number }).affectedRows)} row(s) affected; credential and other profiles unchanged).`
    );
  } finally {
    await pool.end();
  }

  // --- Final verification ----------------------------------------------------
  const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, any[]>;
  const savedAccount = (saved.users || []).find(user => user.id === ACCOUNT_ID);
  assert(savedAccount?.fullName === NEW_FULL_NAME, 'JSON full name verification failed.');
  assert(savedAccount?.firstName === NEW_FIRST_NAME, 'JSON first name verification failed.');
  assert(savedAccount?.lastName === NEW_LAST_NAME, 'JSON last name verification failed.');
  assert(
    savedAccount.email === JSON.parse(userSnapshot).email &&
      savedAccount.role === ACCOUNT_ROLE &&
      savedAccount.phone === JSON.parse(userSnapshot).phone &&
      savedAccount.credentialsResetAt === JSON.parse(userSnapshot).credentialsResetAt &&
      JSON.stringify(savedAccount.delegatedPermissions) ===
        JSON.stringify(JSON.parse(userSnapshot).delegatedPermissions),
    'Headteacher email/role/phone/credential epoch/permissions changed unexpectedly.'
  );

  const relatedCountsAfter = {
    students: (saved.students || []).length,
    attendance: (saved.attendance || []).length,
    reportCards: (saved.reportCards || []).length,
    staffAccounts: (saved.staffAccounts || []).filter(item => item.userId === ACCOUNT_ID).length,
    permissionGrants: (saved.permissionGrants || []).filter(item => item.userId === ACCOUNT_ID).length
  };
  assert(
    JSON.stringify(relatedCountsAfter) === JSON.stringify(relatedCountsBefore),
    'Related-record counts changed unexpectedly.'
  );
  assert(originalJson !== updatedJson, 'No JSON changes were written.');

  console.log('Verification passed: existing account preserved; related records unchanged.');
}

main().catch(error => {
  console.error(`Headteacher name update failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
