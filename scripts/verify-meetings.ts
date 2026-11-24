/**
 * Meetings and Collaboration workspace checks. Uses an isolated data directory
 * and an ephemeral port; no live school record is read, created or modified.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
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
  process.env.SCHOOLCARE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-meetings-'));
  process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');
  const {
    normalizeWorkspaceRecord,
    safeExternalLink,
    splitList,
    toWorkspacePayload
  } = await import('../src/utils/meetings');

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

  async function request(
    apiPath: string,
    cookie?: string,
    method = 'GET',
    payload?: unknown
  ) {
    const response = await fetch(`${base}${apiPath}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
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

  // --- UI and translation contract ------------------------------------------------
  const routesSource = readFileSync(path.resolve('src/routes.tsx'), 'utf-8');
  check(
    'Structured workspace replaces generic meeting CRUD',
    routesSource.includes('<MeetingWorkspacePage mode="meetings" />') &&
      routesSource.includes('<MeetingWorkspacePage mode="collaboration" />') &&
      !routesSource.includes('moduleKey="meetings"') &&
      !routesSource.includes('moduleKey="collaboration"')
  );

  const pageSource = readFileSync(path.resolve('src/pages/MeetingWorkspacePage.tsx'), 'utf-8');
  for (const feature of [
    'meetingInviteesLabel',
    'meetingAgendaLabel',
    'meetingResponsesLabel',
    'meetingTasksLabel',
    'meetingMinutesLabel',
    'meetingPrintPdf',
    'meeting-print-sheet'
  ]) {
    check(`Meeting workspace exposes ${feature}`, pageSource.includes(feature));
  }

  const enSource = readFileSync(path.resolve('src/i18n/en.ts'), 'utf-8');
  const rwSource = readFileSync(path.resolve('src/i18n/rw.ts'), 'utf-8');
  check(
    'New meeting labels are translated in English and Kinyarwanda',
    enSource.includes('meetingMinutesLabel:') && rwSource.includes('meetingMinutesLabel:') &&
      enSource.includes('meetingResponsesLabel:') && rwSource.includes('meetingResponsesLabel:')
  );

  check('External links accept http(s) only', safeExternalLink('https://example.com/meeting') === 'https://example.com/meeting');
  check('Unsafe external links are not clickable', safeExternalLink('javascript:alert(1)') === null);
  check('Invitee lists accept commas, semicolons and newlines', splitList('Alice; Bob\nClementine').length === 3);

  const legacy = normalizeWorkspaceRecord({
    id: 'legacy-generic-meeting',
    title: 'Legacy meeting',
    attendees: ['Legacy Attendee'],
    link: 'https://example.com/legacy',
    tasks: [{ id: 'legacy-task', title: 'Legacy task', status: 'OPEN' }]
  });
  check('Legacy generic records remain readable', legacy.invitees.includes('Legacy Attendee') && legacy.tasks[0]?.id === 'legacy-task');

  // --- API gates and structured persistence --------------------------------------
  const anonymous = await request('/api/modules/meetings');
  check('Meeting records require authentication', anonymous.status === 401, `status ${anonymous.status}`);

  const nurse = await request('/api/modules/meetings', cookieFor('user-nurse'));
  check('Unauthorized role cannot read meeting records', nurse.status === 403, `status ${nurse.status}`);

  const headCookie = cookieFor('user-super-admin');
  const teacherCookie = cookieFor('user-teacher');
  const teacherRead = await request('/api/modules/meetings', teacherCookie);
  check('Teacher can read shared meeting records', teacherRead.status === 200, `status ${teacherRead.status}`);

  const head = db.getUserById('user-super-admin');
  const schoolId = head?.schoolId ?? 'school-es-rubengera-01';
  const structuredPayload = {
    // Reserved fields must be ignored by the server.
    id: 'spoofed-id',
    schoolId: 'other-school',
    createdBy: 'spoofed-actor',
    title: 'Staff coordination meeting',
    date: '2026-11-25',
    time: '10:00',
    link: 'javascript:alert(1)',
    invitees: ['MUNYENTWARI Olivier', 'Teacher One'],
    agenda: ['Opening', 'Term planning'],
    notes: 'Discussion notes',
    minutes: 'Approved minutes',
    tasks: [{ id: 'task-followup', title: 'Circulate minutes', owner: 'Teacher One', dueDate: '2026-11-30', status: 'OPEN' }],
    responses: [{ userId: 'user-teacher', name: 'Teacher One', response: 'YES', respondedAt: '2026-11-24T09:00:00.000Z' }],
    status: 'OPEN'
  };

  const created = await request('/api/modules/meetings', headCookie, 'POST', structuredPayload);
  check('Headteacher can create a structured meeting', created.status === 201, `status ${created.status}`);
  const createdRecord = created.body as Record<string, unknown>;
  check('Client cannot spoof record identity or school', createdRecord.id !== 'spoofed-id' && createdRecord.schoolId === schoolId, JSON.stringify({ id: createdRecord.id, schoolId: createdRecord.schoolId }));
  check(
    'Structured invitations, agenda, tasks and responses are persisted',
    Array.isArray(createdRecord.invitees) && (createdRecord.invitees as unknown[]).length === 2 &&
      Array.isArray(createdRecord.agenda) && (createdRecord.agenda as unknown[]).length === 2 &&
      Array.isArray(createdRecord.tasks) && (createdRecord.tasks as any[])[0]?.id === 'task-followup' &&
      Array.isArray(createdRecord.responses) && (createdRecord.responses as any[])[0]?.response === 'YES',
    JSON.stringify(createdRecord)
  );
  check('Unsafe meeting link is stored but never rendered clickable', createdRecord.link === 'javascript:alert(1)' && safeExternalLink(String(createdRecord.link)) === null);

  const normalized = normalizeWorkspaceRecord(createdRecord);
  check('Created record normalizes without losing structured fields', normalized.invitees.length === 2 && normalized.tasks.length === 1 && normalized.responses.length === 1);
  check('Server payload builder keeps structured fields for updates', Array.isArray(toWorkspacePayload(normalized).tasks));

  const listed = await request('/api/modules/meetings', headCookie);
  check(
    'Structured meeting is returned in the module list',
    listed.status === 200 && (listed.body as any[]).some(item => item.id === createdRecord.id && Array.isArray(item.agenda)),
    `status ${listed.status}`
  );
  check('Records stay scoped to the actor school', !db.getModuleRecords('other-school', 'meetings').some(item => item.id === createdRecord.id));

  const closed = normalizeWorkspaceRecord(createdRecord);
  closed.status = 'DONE';
  closed.tasks = closed.tasks.map(task => ({ ...task, status: 'DONE' }));
  const patched = await request(
    `/api/modules/meetings/${encodeURIComponent(String(createdRecord.id))}`,
    headCookie,
    'PATCH',
    toWorkspacePayload(closed)
  );
  check('Status and task progress can be updated', patched.status === 200 && (patched.body as any)?.status === 'DONE' && (patched.body as any)?.tasks?.[0]?.status === 'DONE', `status ${patched.status}`);

  const collaboration = await request('/api/modules/collaboration', headCookie, 'POST', {
    title: 'School improvement workspace',
    invitees: ['Deputy Head'],
    agenda: ['Literacy strategy'],
    notes: 'Shared notes',
    minutes: 'Agreed actions',
    tasks: [{ id: 'collab-task', title: 'Review literacy data', owner: 'Deputy Head', dueDate: '', status: 'OPEN' }],
    responses: [],
    status: 'OPEN'
  });
  check('Collaboration records use the same structured store', collaboration.status === 201 && Array.isArray((collaboration.body as any)?.tasks), `status ${collaboration.status}`);

  const logs = db.getAuditLogs(schoolId);
  check('Meeting creation is recorded in activity history', logs.some(item => item.action === 'CREATE_MODULE_RECORD' && item.entityType === 'MEETINGS'));
  check('Collaboration creation is recorded in activity history', logs.some(item => item.action === 'CREATE_MODULE_RECORD' && item.entityType === 'COLLABORATION'));
  check('Structured update is recorded in activity history', logs.some(item => item.action === 'UPDATE_MODULE_RECORD' && item.entityType === 'MEETINGS'));

  server.close();
  const failed = checks.filter(item => !item.passed);
  for (const item of failed) console.error(`FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`${checks.length - failed.length}/${checks.length} meeting workspace checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
