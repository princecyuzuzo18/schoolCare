/**
 * Infrastructure hardening regression checks.
 *
 * Verifies the public health probe, baseline security headers and that the
 * private API remains protected. Uses an isolated data directory and an
 * ephemeral port; no existing data is modified.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

type Check = { name: string; passed: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-hardening-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json() as Record<string, unknown>;
  check('Public health probe returns 200', health.status === 200, `status ${health.status}`);
  check('Health probe reports ok', healthBody.status === 'ok', String(healthBody.status));
  check(
    'Health probe does not expose database/configuration details',
    !JSON.stringify(healthBody).match(/password|database|host|user|mysql|mariadb/i),
    JSON.stringify(healthBody)
  );

  check('X-Powered-By is hidden', health.headers.get('x-powered-by') === null);
  check('X-Content-Type-Options is set', health.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options is set', health.headers.get('x-frame-options') === 'SAMEORIGIN');
  check(
    'Referrer-Policy is set',
    health.headers.get('referrer-policy') === 'strict-origin-when-cross-origin'
  );
  check(
    'Permissions-Policy is set',
    (health.headers.get('permissions-policy') || '').includes('camera=()')
  );

  const protectedRoute = await fetch(`${base}/api/students`);
  check('Student API still requires a session', protectedRoute.status === 401, `status ${protectedRoute.status}`);

  const unknownApi = await fetch(`${base}/api/does-not-exist`);
  // Unauthenticated callers are rejected by the auth middleware before the
  // route fallback; authenticated callers receive the JSON 404 fallback.
  check(
    'Unknown API path is rejected with JSON',
    unknownApi.status === 401 || unknownApi.status === 404,
    `status ${unknownApi.status}`
  );
  check(
    'Unknown API path is not the SPA shell',
    (unknownApi.headers.get('content-type') || '').includes('application/json')
  );

  const { hashPassword, verifyPassword } = await import('../server/authCredentials');
  const testHash = await hashPassword('hardening-check-password');
  check('Valid scrypt credential verifies', await verifyPassword('hardening-check-password', testHash));
  check(
    'Malformed stored credential fails closed',
    (await verifyPassword('hardening-check-password', 'legacy$invalid')) === false
  );
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  console.log(`[${item.passed ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
}
console.log(`${checks.length - failed.length}/${checks.length} hardening checks passed.`);
if (failed.length) process.exitCode = 1;
