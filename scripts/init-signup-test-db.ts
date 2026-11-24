import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';
import { listMigrationFiles } from './migrationFiles';

dotenv.config();

const TEST_DB = 'schoolcare_signup_test';
const ROOT_DIR = process.cwd();
const DUMP_PATH = path.join(ROOT_DIR, 'mysql', 'schoolcare_db.sql');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'mysql', 'migrations');

interface MigrationRow extends RowDataPacket {
  checksum: string;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function assertTestDatabase(): void {
  const configured = process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db';
  if (configured !== TEST_DB) {
    throw new Error(
      `Refusing to initialize sign-up tests against "${configured}". ` +
      `Run with DB_DATABASE=${TEST_DB} DB_NAME=${TEST_DB}.`
    );
  }
}

function sanitizedDump(): string {
  const raw = fs.readFileSync(DUMP_PATH, 'utf8');
  return raw
    // The administrator creates the database; the app user only creates tables.
    .replace(/^CREATE DATABASE IF NOT EXISTS `schoolcare_db`[^;]*;\s*$/gim, '')
    // The database is verified empty, so DROP statements are unnecessary and
    // would require a privilege we deliberately do not grant to the app user.
    .replace(/^DROP (?:TABLE|VIEW|TRIGGER) IF EXISTS .*;\s*$/gim, '')
    // Never allow the base schema to switch back to the live database.
    .replace(/^USE `schoolcare_db`;\s*$/gim, `USE \`${TEST_DB}\`;`);
}

async function applyMigrations(connection: mysql.Connection): Promise<void> {
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
  let applied = 0;
  let skipped = 0;

  for (const filename of files) {
    const version = filename.slice(0, -4);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [existing] = await connection.execute<MigrationRow[]>(
      'SELECT checksum FROM schema_migrations WHERE version = ? LIMIT 1',
      [version]
    );
    if (existing.length > 0) {
      if (existing[0].checksum !== checksum) {
        throw new Error(`Migration ${filename} changed after it was recorded. Refusing to continue.`);
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
}

async function main(): Promise<void> {
  assertTestDatabase();

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: intEnv('DB_PORT', 3306, 1, 65535),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
    password: process.env.DB_PASSWORD || '',
    database: TEST_DB,
    connectTimeout: intEnv('DB_CONNECT_TIMEOUT_MS', 5000, 500, 60000),
    multipleStatements: true
  });

  try {
    const [tableRows] = await connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [TEST_DB]
    );
    const tableCount = Number(tableRows[0]?.count ?? 0);
    if (tableCount > 0) {
      throw new Error(
        `${TEST_DB} already contains ${tableCount} table(s). Refusing to import the schema. ` +
        'Drop and recreate the test database first (never schoolcare_db).'
      );
    }

    console.log(`Initializing ${TEST_DB} from the existing base schema...`);
    await connection.query(sanitizedDump());
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await applyMigrations(connection);
    console.log('Sign-up test database is ready.');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  if (code === 'ER_BAD_DB_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
    console.error(
      `Database ${TEST_DB} is missing or not granted to ${process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user'}. ` +
      'Run mysql/create_signup_test_db.sql as a MariaDB administrator first.'
    );
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
