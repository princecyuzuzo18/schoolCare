import mysql, { type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

interface CountRow extends RowDataPacket {
  count: number;
}

interface MigrationRow extends RowDataPacket {
  version: string;
  filename: string;
  applied_at: Date;
}

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function friendlyError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  switch (code) {
    case 'ECONNREFUSED':
      return 'MariaDB is not accepting connections. Start the MariaDB service and try again.';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'Database authentication failed. Check DB_USER and DB_PASSWORD in .env.';
    case 'ER_BAD_DB_ERROR':
      return 'The configured database does not exist. Run npm run db:setup first.';
    default:
      return error instanceof Error ? error.message : String(error);
  }
}

async function main(): Promise<void> {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: intEnv('DB_PORT', 3306, 1, 65535),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db',
    connectTimeout: intEnv('DB_CONNECT_TIMEOUT_MS', 5000, 500, 60000)
  };

  const connection = await mysql.createConnection(config);
  try {
    const [tableCountRows] = await connection.query<CountRow[]>(
      'SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );

    console.log(`Database:  ${config.database} (exists)`);
    console.log(`Tables:    ${tableCountRows[0].count}`);

    const [trackingRows] = await connection.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'"
    );

    if (trackingRows[0].count === 0) {
      console.log('Migrations: none recorded yet.');
    } else {
      const [migrations] = await connection.query<MigrationRow[]>(
        'SELECT version, filename, applied_at FROM schema_migrations ORDER BY version'
      );
      console.log('Migrations recorded:');
      for (const migration of migrations) {
        console.log(`  ${migration.version}  ${migration.filename}  ${migration.applied_at.toISOString()}`);
      }
    }

    const [staffTables] = await connection.query<TableRow[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('staff_accounts', 'staff_invitations', 'permission_grants')
       ORDER BY TABLE_NAME`
    );
    console.log(
      `Staff governance tables: ${
        staffTables.length === 3 ? 'present' : `missing (${3 - staffTables.length})`
      }`
    );
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`Status check failed: ${friendlyError(error)}`);
  process.exitCode = 1;
});
