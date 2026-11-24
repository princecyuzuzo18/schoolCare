/**
 * School Activity History checks. Runs against an isolated data directory and
 * an ephemeral port; no live school record is read or modified.
 */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';

type Check = { name: string; passed: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

async function main(): Promise<void> {
  process.env.SCHOOLCARE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-activity-'));
  process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');

  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  function cookieFor(userId: string): string {
    const headers: Record<string, string> = {};
    createSession(userId, {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
      }
    } as unknown as Response);
    return (headers['Set-Cookie'] || '').split(';')[0];
  }

  async function request(apiPath: string, cookie?: string) {
    const response = await fetch(`${base}${apiPath}`, {
      headers: { ...(cookie ? { Cookie: cookie } : {}) }
    });
    const text = await response.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text for diagnostics
    }
    return { status: response.status, body };
  }

  const headteacher = db.getUserById('user-super-admin');
  const schoolId = headteacher?.schoolId ?? 'school-es-rubengera-01';
  const before = db.getAuditLogs(schoolId).length;

  db.logAudit(
    schoolId,
    'verification-actor',
    'Verification Actor',
    'HEAD_TEACHER',
    'ACTIVITY_REDACTION_CHECK',
    'VERIFICATION',
    'verify-activity-1',
    'password=SuperSecret123 token=abcdef1234567890abcdef1234567890 phone +250788340120 email test@example.com learner Private Learner',
    '127.0.0.1'
  );

  const logs = db.getAuditLogs(schoolId);
  const logged = logs.find(entry => entry.id.startsWith('log-') && entry.action === 'ACTIVITY_REDACTION_CHECK');
  check('Activity record was appended', logs.length === before + 1, `${before} -> ${logs.length}`);
  check('Previous activity records are preserved', logs.length >= before, `${before} -> ${logs.length}`);
  check('Sensitive detail was redacted', Boolean(logged), JSON.stringify(logged));
  if (logged) {
    const detail = logged.details;
    check('Password is not copied into activity details', !detail.includes('SuperSecret123'), detail);
    check('Long token is not copied into activity details', !detail.includes('abcdef1234567890abcdef'), detail);
    check('Phone number is not copied into activity details', !detail.includes('+250788340120'), detail);
    check('Email address is not copied into activity details', !detail.includes('test@example.com'), detail);
    check('Redaction markers are present', detail.includes('[REDACTED]') && detail.includes('[PHONE REDACTED]') && detail.includes('[EMAIL REDACTED]'), detail);
    check('Actor and action are still useful', logged.userName === 'Verification Actor' && logged.action === 'ACTIVITY_REDACTION_CHECK', `${logged.userName} / ${logged.action}`);
    check('Activity details are length-bounded', detail.length <= 500, `${detail.length} characters`);
  }

  const anonymous = await request('/api/audit-logs');
  check('Activity history requires authentication', anonymous.status === 401, `status ${anonymous.status}`);

  const teacherCookie = cookieFor('user-teacher');
  const teacher = await request('/api/audit-logs', teacherCookie);
  check('Teacher cannot review activity history', teacher.status === 403, `status ${teacher.status}`);

  const headteacherCookie = cookieFor('user-super-admin');
  const authorized = await request('/api/audit-logs', headteacherCookie);
  check('Headteacher can review activity history', authorized.status === 200 && Array.isArray(authorized.body), `status ${authorized.status}`);
  check(
    'Activity API returns the redacted record',
    Array.isArray(authorized.body) &&
      authorized.body.some((entry: any) =>
        entry.action === 'ACTIVITY_REDACTION_CHECK' &&
        !JSON.stringify(entry).includes('SuperSecret123') &&
        !JSON.stringify(entry).includes('+250788340120')
      ),
    JSON.stringify(authorized.body?.[0])
  );

  const staffActivity = await request('/api/staff/activity', headteacherCookie);
  check('Staff activity view is permission-gated and readable', staffActivity.status === 200 && Array.isArray(staffActivity.body), `status ${staffActivity.status}`);
  check(
    'Staff activity view contains only staff-related actions',
    Array.isArray(staffActivity.body) &&
      staffActivity.body.every((entry: any) =>
        entry.entityType === 'STAFF_ACCOUNT' ||
        entry.entityType === 'STAFF_INVITATION' ||
        entry.entityType === 'STAFF_PERMISSION' ||
        entry.action.startsWith('STAFF_') ||
        entry.action === 'USER_LOGIN'
      ),
    `${staffActivity.body?.length ?? 0} entries`
  );

  server.close();
  const failed = checks.filter(item => !item.passed);
  for (const item of failed) console.error(`FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`${checks.length - failed.length}/${checks.length} activity history checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
