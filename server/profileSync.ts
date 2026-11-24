import { getMysqlPool } from './mysqlConnector';

export type ProfileSyncStatus = 'synced' | 'unavailable' | 'not-needed';

export interface ProfileSyncInput {
  userId: string;
  email: string;
  roleId: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Mirror an allowlisted self-profile edit into the MariaDB user_profiles row.
 *
 * Every value is bound as a parameter and the UPDATE is pinned to the
 * session-derived account id, role and email. A database failure is reported
 * honestly rather than pretending the authoritative credential row changed.
 */
export async function syncUserProfileToMysql(input: ProfileSyncInput): Promise<ProfileSyncStatus> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (input.fullName !== undefined) {
    assignments.push('full_name = ?');
    values.push(input.fullName);
  }
  if (input.firstName !== undefined) {
    assignments.push('first_name = ?');
    values.push(input.firstName);
  }
  if (input.lastName !== undefined) {
    assignments.push('last_name = ?');
    values.push(input.lastName);
  }
  if (input.phone !== undefined) {
    assignments.push('phone = ?');
    values.push(input.phone);
  }
  if (assignments.length === 0) return 'not-needed';

  const pool = getMysqlPool();
  if (!pool) return 'unavailable';

  values.push(input.userId, input.roleId, input.email);
  try {
    await pool.execute(
      `UPDATE user_profiles
       SET ${assignments.join(', ')}
       WHERE id = ? AND role_id = ? AND LOWER(email) = LOWER(?)
       LIMIT 1`,
      values as any[]
    );
    return 'synced';
  } catch (error) {
    console.warn('[Profile] MariaDB mirror unavailable:', error instanceof Error ? error.message : error);
    return 'unavailable';
  }
}
