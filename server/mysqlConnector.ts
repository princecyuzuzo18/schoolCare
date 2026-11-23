import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface MysqlStatus {
  connected: boolean;
  engine: string;
  host: string;
  port: number;
  database: string;
  user: string;
  tableCount?: number;
  error?: string;
  mode: 'MYSQL_LIVE' | 'FALLBACK_PERSISTENT_JSON';
}

function positiveInt(value: string | undefined, fallback: number, min = 1, max = 65535): number {
  const text = (value ?? '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

// Connection timeout is exported so authentication timeouts stay in sync with the pool.
export const DB_CONNECT_TIMEOUT_MS = positiveInt(
  process.env.DB_CONNECT_TIMEOUT_MS,
  5000,
  500,
  60000
);

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: positiveInt(process.env.DB_PORT, 3306),
  // Legacy aliases are kept so existing installations keep working after the rename.
  user: process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db',
  connectTimeout: DB_CONNECT_TIMEOUT_MS,
  waitForConnections: true,
  connectionLimit: positiveInt(process.env.DB_CONNECTION_LIMIT, 10, 1, 100),
  queueLimit: positiveInt(process.env.DB_QUEUE_LIMIT, 10, 0, 1000),
  idleTimeout: 60_000,
  enableKeepAlive: true
};

let pool: mysql.Pool | null = null;
let lastKnownStatus: MysqlStatus = {
  connected: false,
  engine: 'MariaDB / MySQL (InnoDB)',
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  mode: 'FALLBACK_PERSISTENT_JSON'
};

export function getMysqlPool(): mysql.Pool | null {
  if (!pool) {
    try {
      pool = mysql.createPool(dbConfig);
    } catch (err: any) {
      console.warn('[MariaDB] Pool initialization deferred:', err?.message ?? err);
      pool = null;
    }
  }
  return pool;
}

/** Closes the connection pool on graceful server shutdown. Safe to call repeatedly. */
export async function closeMysqlPool(): Promise<void> {
  if (!pool) return;
  const currentPool = pool;
  pool = null;
  try {
    await currentPool.end();
  } catch (err: any) {
    console.warn('[MariaDB] Pool close failed:', err?.message ?? err);
  }
}

/** Returns a generic, credential-free message for a driver error. */
function friendlyError(err: any): string {
  switch (err?.code) {
    case 'ECONNREFUSED':
      return 'MariaDB is not accepting connections. Check that the service is running.';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'Database authentication failed. Check DB_USER and DB_PASSWORD in .env.';
    case 'ER_BAD_DB_ERROR':
      return 'The configured database does not exist. Run the database setup first.';
    case 'ETIMEDOUT':
    case 'PROTOCOL_SEQUENCE_TIMEOUT':
      return 'MariaDB connection timed out. Check DB_CONNECT_TIMEOUT_MS and server load.';
    default:
      return 'MariaDB connection check failed.';
  }
}

export async function checkMysqlHealth(): Promise<MysqlStatus> {
  try {
    const currentPool = getMysqlPool();
    if (!currentPool) {
      lastKnownStatus = {
        connected: false,
        engine: 'MariaDB / MySQL (unavailable)',
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        mode: 'FALLBACK_PERSISTENT_JSON',
        error: 'Database pool could not be initialized.'
      };
      return lastKnownStatus;
    }

    // mysql2 already applies connectTimeout and pool queue limits. Racing a
    // separate timer used to leak a connection if the timer won and the pool
    // handed out a connection afterwards.
    const connection = await currentPool.getConnection();
    try {
      const [rows] = await connection.query('SHOW TABLES');
      const tableCount = Array.isArray(rows) ? rows.length : 0;
      lastKnownStatus = {
        connected: true,
        engine: 'MariaDB / MySQL (InnoDB)',
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        tableCount,
        mode: 'MYSQL_LIVE'
      };
      return lastKnownStatus;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    lastKnownStatus = {
      connected: false,
      engine: 'MariaDB / MySQL (unavailable)',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      error: friendlyError(err),
      mode: 'FALLBACK_PERSISTENT_JSON'
    };
    return lastKnownStatus;
  }
}

export function getExportSqlPath(): string {
  const rootDir = process.cwd();
  return path.resolve(rootDir, 'mysql', 'schoolcare_db.sql');
}
