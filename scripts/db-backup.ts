/**
 * Portable database backup for SchoolCare.
 *
 * Uses the mysql2 connection already configured in .env, so it works on
 * machines where mariadb-dump/mysqldump is not installed. The dump is
 * additive-only data (CREATE TABLE + INSERT) and is never destructive.
 */
import { createGzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = path.resolve(process.cwd());
const BACKUP_DIR = path.join(ROOT_DIR, 'backups');

function intEnv(name: string, fallback: number, min = 1, max = 65535): number {
  const text = (process.env[name] ?? '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/** Identifiers originate in information_schema, but still quote them safely. */
function identifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: intEnv('DB_PORT', 3306),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db',
    connectTimeout: intEnv('DB_CONNECT_TIMEOUT_MS', 5000, 500, 60000)
  });

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `schoolcare_db_${stamp}.sql.gz`);
    const output = createWriteStream(target, { mode: 0o600 });
    const gzip = createGzip();
    const writer = pipeline(gzip, output);
    // Mark the promise as handled immediately; a query failure may otherwise
    // surface as an unhandled rejection before we reach `await writer`.
    writer.catch(() => undefined);

    try {
      const [tableRows] = await connection.query<RowDataPacket[]>('SHOW TABLES');
      const tables = tableRows.map(row => Object.values(row)[0] as string).filter(Boolean);

      gzip.write(`-- SchoolCare database backup\n-- Created: ${new Date().toISOString()}\n-- Database: ${connection.config.database}\n\n`);
      gzip.write('SET FOREIGN_KEY_CHECKS=0;\nSET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\nSET NAMES utf8mb4;\n\n');

      for (const table of tables) {
        const [createRows] = await connection.query<RowDataPacket[]>(`SHOW CREATE TABLE ${identifier(table)}`);
        const createSql = Object.values(createRows[0])[1] as string;
        // Restoring must never destroy existing data: use an idempotent CREATE
        // and omit DROP TABLE entirely. Restore into an EMPTY database; plain
        // INSERTs will fail on duplicate keys rather than silently replace rows.
        const safeCreateSql = createSql.replace(/^CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
        gzip.write(`${safeCreateSql};\n\n`);

        const [rows] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${identifier(table)}`);
        if (!rows.length) continue;
        const columns = Object.keys(rows[0]);
        const columnList = columns.map(identifier).join(', ');
        for (const row of rows) {
          const values = columns.map(column => sqlValue(row[column])).join(', ');
          gzip.write(`INSERT INTO ${identifier(table)} (${columnList}) VALUES (${values});\n`);
        }
        gzip.write('\n');
      }

      gzip.write('SET FOREIGN_KEY_CHECKS=1;\n');
      gzip.end();
      await writer;
      console.log(`Backup created: ${target} (${tables.length} tables, ${fs.statSync(target).size} bytes)`);
    } catch (error) {
      gzip.destroy();
      output.destroy();
      try {
        fs.unlinkSync(target);
      } catch {
        // The partial artifact may not have been created yet.
      }
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
