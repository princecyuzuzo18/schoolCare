import { checkMysqlHealth, closeMysqlPool } from '../server/mysqlConnector';

/**
 * Standalone MariaDB connection test.
 * Run with: npm run db:check
 * Prints configuration (never the password) and exits non-zero when the DB is unreachable.
 */
async function main(): Promise<void> {
  const status = await checkMysqlHealth();

  console.log('SchoolCare MariaDB connection check');
  console.log(`  host:      ${status.host}:${status.port}`);
  console.log(`  database:  ${status.database}`);
  console.log(`  user:      ${status.user}`);
  console.log(`  engine:    ${status.engine}`);
  console.log(`  connected: ${status.connected ? 'yes' : 'no'}`);
  if (status.tableCount !== undefined) {
    console.log(`  tables:    ${status.tableCount}`);
  }
  if (status.error) {
    console.log(`  error:     ${status.error}`);
  }

  await closeMysqlPool();
  process.exit(status.connected ? 0 : 1);
}

main().catch(async error => {
  console.error('Connection check failed:', error instanceof Error ? error.message : error);
  await closeMysqlPool();
  process.exit(1);
});
