import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
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

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db',
  connectTimeout: 2000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 10
};

let pool: mysql.Pool | null = null;
let lastKnownStatus: MysqlStatus = {
  connected: false,
  engine: 'MySQL / XAMPP InnoDB',
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
      console.warn('[MySQL] Pool initialization deferred:', err.message);
      pool = null;
    }
  }
  return pool;
}

export async function checkMysqlHealth(): Promise<MysqlStatus> {
  try {
    const currentPool = getMysqlPool();
    if (!currentPool) {
      lastKnownStatus = {
        connected: false,
        engine: 'MySQL / XAMPP InnoDB',
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        mode: 'FALLBACK_PERSISTENT_JSON',
        error: 'MySQL pool could not be initialized'
      };
      return lastKnownStatus;
    }

    const connection = await Promise.race([
      currentPool.getConnection(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('MySQL connection timed out')), 3000))
    ]);
    try {
      const [rows] = await connection.query('SHOW TABLES');
      const tableCount = Array.isArray(rows) ? rows.length : 0;
      lastKnownStatus = {
        connected: true,
        engine: 'MySQL / XAMPP (MariaDB/InnoDB)',
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
      engine: 'MySQL / XAMPP (Local Daemon Offline)',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      error: err.code === 'ECONNREFUSED'
        ? 'XAMPP MySQL is not running on localhost:3306 (Fallback storage active)'
        : err.message,
      mode: 'FALLBACK_PERSISTENT_JSON'
    };
    return lastKnownStatus;
  }
}

export function getExportSqlPath(): string {
  const rootDir = process.cwd();
  return path.resolve(rootDir, 'mysql', 'schoolcare_db.sql');
}
