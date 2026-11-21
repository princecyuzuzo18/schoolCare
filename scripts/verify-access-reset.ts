import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Response } from 'express';

type Check = { name: string; passed: boolean; detail?: string };
type ApiResult = { status: number; body: any };

const checks: Check[] = [];
function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-access-reset-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;
let mysqlPool: Awaited<ReturnType<typeof import('../server/mysqlConnector')['getMysqlPool']>> | null = null;
let closeMysqlPoolFn: (() => Promise<void>) | undefined;
let hadCredentialBefore = false;

try {
  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');
  const { getMysqlPool, closeMysqlPool } = await import('../server/mysqlConnector');
  closeMysqlPoolFn = closeMysqlPool;

  mysqlPool = getMysqlPool();
  const targetUserId = 'user-teacher';
  if (mysqlPool) {
    const [rows] = await mysqlPool.query('SELECT user_id FROM user_auth_credentials WHERE user_id = ?', [targetUserId]);
    hadCredentialBefore = Array.isArray(rows) && rows.length > 0;
  }

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  function sessionCookie(userId: string): string {
    const headers: Record<string, string> = {};
    createSession(userId, {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
      }
    } as unknown as Response);
    return (headers['Set-Cookie'] || '').split(';')[0];
  }

  async function request(apiPath: string, options: RequestInit = {}): Promise<ApiResult> {
    const response = await fetch(`${base}${apiPath}`, options);
    const text = await response.text();
    let body: any = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body };
  }

  const head = db.getUserById('user-super-admin');
  const teacher = db.getUserById(targetUserId);
  if (!head || !teacher) {
    check('Access reset test accounts exist', false);
  } else {
    const headCookie = sessionCookie(head.id);
    const teacherCookie = sessionCookie(teacher.id);

    const unauth = await request(`/api/staff/accounts/${teacher.id}/reset-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    check('Anonymous access reset is rejected', unauth.status === 401, `status ${unauth.status}`);

    // Even a delegated teacher holding staff.write cannot reset credentials.
    db.setDelegatedPermissions(teacher.id, ['staff.write', 'staff.read']);
    const teacherReset = await request(`/api/staff/accounts/${teacher.id}/reset-access`, {
      method: 'POST',
      headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
      body: '{}'
    });
    check('A delegated teacher cannot reset staff access', teacherReset.status === 403, `status ${teacherReset.status}`);

    const beforeEpoch = db.getUserById(teacher.id)?.credentialsResetAt;
    const validSession = await request('/api/permissions', { headers: { Cookie: teacherCookie } });
    check('Teacher session is valid before the reset', validSession.status === 200, `status ${validSession.status}`);

    const reset = await request(`/api/staff/accounts/${teacher.id}/reset-access`, {
      method: 'POST',
      headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
      body: '{}'
    });
    check('Headteacher can reset staff access', reset.status === 200, `status ${reset.status}`);
    const tempPassword = reset.body?.temporaryPassword;
    check('A strong temporary password is returned once', typeof tempPassword === 'string' && tempPassword.length >= 18,
      `length ${String(tempPassword).length}`);

    const afterEpoch = db.getUserById(teacher.id)?.credentialsResetAt;
    check('Credential epoch advanced', Boolean(afterEpoch) && afterEpoch !== beforeEpoch, `${beforeEpoch} -> ${afterEpoch}`);

    const revokedSession = await request('/api/permissions', { headers: { Cookie: teacherCookie } });
    check('Existing staff session is revoked immediately', revokedSession.status === 401, `status ${revokedSession.status}`);

    const freshSession = sessionCookie(teacher.id);
    const freshRequest = await request('/api/permissions', { headers: { Cookie: freshSession } });
    check('A fresh session works with the new epoch', freshRequest.status === 200, `status ${freshRequest.status}`);

    const auditActions = db.getAuditLogs(head.schoolId).map(entry => entry.action);
    check('Audit trail records STAFF_ACCESS_RESET', auditActions.includes('STAFF_ACCESS_RESET'));
    const resetAudit = db.getAuditLogs(head.schoolId).find(entry => entry.action === 'STAFF_ACCESS_RESET');
    check('Audit entry never stores the temporary password',
      Boolean(resetAudit) && !JSON.stringify(resetAudit).includes(String(tempPassword)));
  }
} finally {
  // Leave the shared MariaDB credential table as we found it.
  if (mysqlPool && !hadCredentialBefore) {
    try {
      await mysqlPool.query('DELETE FROM user_auth_credentials WHERE user_id = ?', ['user-teacher']);
    } catch (error) {
      console.warn('[Access reset test] Credential cleanup failed:', (error as Error).message);
    }
  }
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
  if (mysqlPool && closeMysqlPoolFn) {
    await closeMysqlPoolFn();
  }
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  const status = item.passed ? 'PASS' : 'FAIL';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`[${status}] ${item.name}${detail}`);
}
console.log('');
console.log(`${checks.length - failed.length}/${checks.length} access reset checks passed.`);

if (failed.length > 0) process.exitCode = 1;
