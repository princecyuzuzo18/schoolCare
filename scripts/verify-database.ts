import mysql, { type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

type Check = { name: string; passed: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function friendlyError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  switch (code) {
    case 'ECONNREFUSED': return 'MariaDB is not accepting connections.';
    case 'ER_ACCESS_DENIED_ERROR': return 'Database authentication failed. Check DB_USER and DB_PASSWORD in .env.';
    case 'ER_BAD_DB_ERROR': return 'The configured database does not exist.';
    default: return error instanceof Error ? error.message : String(error);
  }
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: intEnv('DB_PORT', 3306, 1, 65535),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db',
    connectTimeout: intEnv('DB_CONNECT_TIMEOUT_MS', 5000, 500, 60000)
  });

  try {
    const [roleRows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM roles WHERE id IN ('HEAD_TEACHER','DISCIPLINE_OFFICER','SCHOOL_IT','ANIMATEUR')"
    );
    const roleIds = new Set(roleRows.map(row => String(row.id)));
    check(
      'Required role codes exist',
      ['HEAD_TEACHER','DISCIPLINE_OFFICER','SCHOOL_IT','ANIMATEUR'].every(id => roleIds.has(id)),
      Array.from(roleIds).sort().join(', ')
    );

    const [lowercaseRoles] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM roles WHERE id <> UPPER(id)'
    );
    check('Role codes remain uppercase', lowercaseRoles.length === 0);

    const [userRows] = await connection.query<RowDataPacket[]>(
      "SELECT id, role_id FROM user_profiles WHERE id IN ('user-super-admin','user-head-teacher')"
    );
    const rolesById = new Map(userRows.map(row => [String(row.id), String(row.role_id)]));
    check('user-super-admin is HEAD_TEACHER', rolesById.get('user-super-admin') === 'HEAD_TEACHER', rolesById.get('user-super-admin'));
    check('user-head-teacher is ANIMATEUR', rolesById.get('user-head-teacher') === 'ANIMATEUR', rolesById.get('user-head-teacher'));

    const [tableRows] = await connection.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS tableName FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'staff_accounts','staff_invitations','permission_grants',
           'students','user_auth_credentials','admission_applications'
         )`
    );
    const tableNames = new Set(tableRows.map(row => String(row.tableName)));
    check(
      'Required application tables exist',
      ['staff_accounts','staff_invitations','permission_grants','students','user_auth_credentials','admission_applications']
        .every(name => tableNames.has(name)),
      Array.from(tableNames).sort().join(', ')
    );

    const [invitationColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_invitations'`
    );
    const invitationColumnNames = new Set(invitationColumns.map(row => String(row.columnName)));
    check('Invitation stores token hash', invitationColumnNames.has('token_hash'));
    check('Invitation never stores raw token', !invitationColumnNames.has('token'));

    const [invalidHashes] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM user_auth_credentials WHERE password_hash NOT LIKE 'scrypt$%'"
    );
    check('Stored credentials use scrypt hashes', Number(invalidHashes[0].count) === 0);

    const [migrationRows] = await connection.query<RowDataPacket[]>(
      "SELECT version FROM schema_migrations WHERE version = '003_staff_governance'"
    );
    check('Staff governance migration is recorded', migrationRows.length === 1);

    const failed = checks.filter(item => !item.passed);
    for (const item of checks) {
      const prefix = item.passed ? '[PASS]' : '[FAIL]';
      const detail = item.detail ? ` (${item.detail})` : '';
      console.log(`${prefix} ${item.name}${detail}`);
    }
    console.log(`${checks.length - failed.length}/${checks.length} database checks passed.`);
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`Database check failed: ${friendlyError(error)}`);
  process.exitCode = 1;
});
