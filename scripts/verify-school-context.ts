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
  process.env.SCHOOLCARE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-school-context-'));
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

  async function request(apiPath: string, cookie?: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${apiPath}`, {
      ...init,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) }
    });
    const text = await response.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON response retained as text for diagnostics.
    }
    return { status: response.status, body };
  }

  const ownSchoolId = 'school-es-rubengera-01';
  const otherSchoolId = 'school-context-test';
  const ownHead = db.getUserById('user-super-admin');
  if (!ownHead || ownHead.role !== 'HEAD_TEACHER') {
    check('Headteacher fixture exists', false, `role ${ownHead?.role}`);
  } else {
    const template = db.getSchool(ownSchoolId)!;
    db.getSchools().push({
      ...template,
      id: otherSchoolId,
      name: 'Other Context School',
      code: 'OTHER-CONTEXT'
    } as any);
    db.createUser({
      id: 'user-context-other-head',
      schoolId: otherSchoolId,
      email: 'context.head@schoolcare.rw',
      fullName: 'Other Context Head',
      role: 'HEAD_TEACHER',
      phone: '+250700000019',
      avatarUrl: '',
      preferredLanguage: 'en',
      isActive: true
    });
    check('Two-school fixture created', true);

    const anonymous = await request('/api/schools/me');
    check('School context requires authentication', anonymous.status === 401, `status ${anonymous.status}`);

    const ownContext = await request('/api/schools/me', cookieFor('user-super-admin'));
    check(
      'Headteacher school context comes from the account',
      ownContext.status === 200 && ownContext.body?.id === ownSchoolId,
      `${ownContext.status} ${ownContext.body?.id}`
    );

    const otherContext = await request('/api/schools/me', cookieFor('user-context-other-head'));
    check(
      'Second school receives its own identity',
      otherContext.status === 200 && otherContext.body?.id === otherSchoolId && otherContext.body?.name === 'Other Context School',
      `${otherContext.status} ${otherContext.body?.id}/${otherContext.body?.name}`
    );

    const crossSchoolPatch = await request(`/api/schools/${otherSchoolId}`, cookieFor('user-super-admin'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Taken Over School' })
    });
    check(
      'Headteacher cannot edit another school',
      crossSchoolPatch.status === 403,
      `status ${crossSchoolPatch.status}`
    );

    const idPatch = await request(`/api/schools/${ownSchoolId}`, cookieFor('user-super-admin'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'school-renamed-by-client', name: 'Renamed School' })
    });
    const afterPatch = db.getSchool(ownSchoolId);
    check(
      'School identity cannot be changed through settings',
      idPatch.status === 200 && afterPatch?.id === ownSchoolId && afterPatch?.name === 'Renamed School',
      `${idPatch.status} ${afterPatch?.id}/${afterPatch?.name}`
    );

    const publicList = await request('/api/schools');
    check(
      'Public school directory remains available',
      publicList.status === 200 && Array.isArray(publicList.body) && publicList.body.length >= 2,
      `status ${publicList.status} count ${publicList.body?.length}`
    );
  }

  server.close();
  const failed = checks.filter(item => !item.passed);
  for (const item of failed) console.error(`FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`${checks.length - failed.length}/${checks.length} school-context checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
