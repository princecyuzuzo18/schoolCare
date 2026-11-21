import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { DB_CONNECT_TIMEOUT_MS, getMysqlPool } from './mysqlConnector';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export interface ProvisionableAccount {
  id: string;
  fullName: string;
  email: string;
  roleId: string;
  hasCredential: boolean;
}

interface PasswordHashRow extends RowDataPacket {
  password_hash: string;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

function requireMysqlPool() {
  const pool = getMysqlPool();
  if (!pool) {
    throw new Error('Database is unavailable. Check the MariaDB service and DB_* settings in .env.');
  }
  return pool;
}

export async function ensureCredentialTable(): Promise<void> {
  const pool = requireMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_auth_credentials (
      user_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_user_auth_credentials_profile
        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function listProvisionableAccounts(): Promise<ProvisionableAccount[]> {
  const pool = requireMysqlPool();
  const [rows] = await pool.query<Array<RowDataPacket & {
    id: string;
    full_name: string;
    email: string;
    role_id: string;
    has_credential: number;
  }>>(`
    SELECT up.id, up.full_name, up.email, up.role_id,
      EXISTS (
        SELECT 1 FROM user_auth_credentials AS credentials
        WHERE credentials.user_id = up.id
      ) AS has_credential
    FROM user_profiles AS up
    WHERE up.is_active = 1
    ORDER BY up.full_name, up.email
  `);

  return rows.map(row => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    roleId: row.role_id,
    hasCredential: Boolean(row.has_credential)
  }));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string | undefined): Promise<boolean> {
  if (!encoded) {
    await deriveKey(password, Buffer.alloc(16, 1));
    return false;
  }

  const [algorithm, n, r, p, saltHex, keyHex, ...extra] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    n !== String(SCRYPT_OPTIONS.N) ||
    r !== String(SCRYPT_OPTIONS.r) ||
    p !== String(SCRYPT_OPTIONS.p) ||
    !/^[a-f0-9]{32}$/i.test(saltHex || '') ||
    !/^[a-f0-9]{128}$/i.test(keyHex || '') ||
    extra.length > 0
  ) {
    throw new Error('Authentication credential has an invalid format.');
  }

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(actual, expected);
}

export async function getPasswordHash(email: string): Promise<string | undefined> {
  const pool = requireMysqlPool();
  const query = pool.execute<PasswordHashRow[]>(
    `SELECT credentials.password_hash
     FROM user_auth_credentials AS credentials
     INNER JOIN user_profiles AS profile ON profile.id = credentials.user_id
     WHERE LOWER(profile.email) = LOWER(?) AND profile.is_active = 1
     LIMIT 1`,
    [email.trim()]
  ).then(([rows]) => rows[0]?.password_hash);

  try {
    return await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Database is unavailable. Check the MariaDB service and DB_* settings in .env.')),
          DB_CONNECT_TIMEOUT_MS + 1000
        );
      })
    ]);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'PROTOCOL_SEQUENCE_TIMEOUT' ||
      /(?:mysql|database) is unavailable|connect|timed? ?out|refused/i.test(message)
    ) {
      throw new Error('Database is unavailable. Check the MariaDB service and DB_* settings in .env.');
    }
    throw error;
  }
}

export async function provisionInitialPassword(userId: string, password: string): Promise<void> {
  const pool = requireMysqlPool();
  const passwordHash = await hashPassword(password);
  await pool.execute(
    'INSERT INTO user_auth_credentials (user_id, password_hash) VALUES (?, ?)',
    [userId, passwordHash]
  );
}

/**
 * Replace an account's password hash in place. Used by the Headteacher's
 * secure access reset so the previous credential stops working immediately.
 * An upsert keeps this safe for accounts whose credential row is missing.
 */
export async function replacePassword(userId: string, password: string): Promise<void> {
  const pool = requireMysqlPool();
  const passwordHash = await hashPassword(password);
  await pool.execute(
    `INSERT INTO user_auth_credentials (user_id, password_hash) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [userId, passwordHash]
  );
}

export interface InvitedAccountProfile {
  id: string;
  schoolId: string;
  roleId: string;
  fullName: string;
  email: string;
  phone: string;
  preferredLanguage: string;
}

/**
 * Creates the MariaDB identity and its scrypt credential together.
 * The plaintext password never leaves this function and is never logged.
 */
export async function createInvitedAccount(
  profile: InvitedAccountProfile,
  password: string
): Promise<void> {
  const pool = requireMysqlPool();
  const passwordHash = await hashPassword(password);

  await pool.execute(
    `INSERT INTO user_profiles
      (id, school_id, role_id, full_name, email, phone, preferred_language, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      profile.id,
      profile.schoolId,
      profile.roleId,
      profile.fullName,
      profile.email,
      profile.phone,
      profile.preferredLanguage
    ]
  );

  try {
    await pool.execute(
      'INSERT INTO user_auth_credentials (user_id, password_hash) VALUES (?, ?)',
      [profile.id, passwordHash]
    );
  } catch (error) {
    // Roll back only the profile row created by this same activation attempt.
    await pool.execute('DELETE FROM user_profiles WHERE id = ?', [profile.id]);
    throw error;
  }
}
