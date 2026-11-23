import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';
import { listMigrationFiles } from './migrationFiles';

dotenv.config();

const ROOT_DIR = path.resolve(process.cwd());
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'mysql', 'migrations');

interface MigrationRow extends RowDataPacket {
  checksum: string;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function connectionConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: intEnv('DB_PORT', 3306, 1, 65535),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db',
    connectTimeout: intEnv('DB_CONNECT_TIMEOUT_MS', 5000, 500, 60000),
    multipleStatements: true
  };
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
  const config = connectionConfig();
  const connection = await mysql.createConnection(config);

  try {
    console.log(`Applying SchoolCare migrations to ${config.database} as ${config.user}...`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const files = listMigrationFiles(MIGRATIONS_DIR);

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let applied = 0;
    let skipped = 0;

    for (const filename of files) {
      const version = filename.slice(0, -4);
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      const [existing] = await connection.execute<MigrationRow[]>(
        'SELECT checksum FROM schema_migrations WHERE version = ? LIMIT 1',
        [version]
      );

      if (existing.length > 0) {
        if (existing[0].checksum !== checksum) {
          throw new Error(
            `Migration ${filename} changed after it was applied. Refusing to run it again; review it manually.`
          );
        }
        console.log(`  skip   ${filename} (already applied)`);
        skipped += 1;
        continue;
      }

      console.log(`  apply  ${filename}`);
      await connection.query(sql);
      await connection.execute(
        'INSERT INTO schema_migrations (version, filename, checksum) VALUES (?, ?, ?)',
        [version, filename, checksum]
      );
      applied += 1;
    }

    console.log(`Migrations: ${applied} applied, ${skipped} already applied.`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`Migration failed: ${friendlyError(error)}`);
  process.exitCode = 1;
});
