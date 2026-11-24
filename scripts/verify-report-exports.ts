/**
 * Executive report export checks. Uses an isolated data directory and an
 * ephemeral port; no live school record is read, exported or modified.
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
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-reports-'));
  process.env.SCHOOLCARE_DATA_DIR = dataDir;
  process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');
  const { toCsv } = await import('../server/reportAnalytics');

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
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text for diagnostics
    }
    return { status: response.status, text, bytes, body, headers: response.headers };
  }

  const schoolId = 'school-es-rubengera-01';
  const headCookie = cookieFor('user-super-admin');
  const teacherCookie = cookieFor('user-teacher');
  const accountantCookie = cookieFor('user-accountant');

  const scopeBase = {
    schoolId,
    academicYear: '2025 - 2026',
    subjects: [],
    attendanceDaysPresent: 1,
    attendanceTotalDays: 1,
    conductScore: '',
    classTeacherRemarks: '',
    headTeacherRemarks: '',
    isApproved: true,
    status: 'APPROVED'
  } as any;

  const scopedCard = db.upsertReportCard({
    ...scopeBase,
    id: 'rc-export-scope-a',
    studentId: 'student-export-scope-a',
    studentName: 'Scope Learner Alpha',
    admissionNumber: 'EXPORT-A',
    className: 'Level 4 EXPORT A',
    combination: 'EXPORTTEST',
    term: 'Term 2',
    overallAverage: 91,
    overallRank: 1,
    totalStudentsInClass: 2
  } as any);
  const otherCombinationCard = db.upsertReportCard({
    ...scopeBase,
    id: 'rc-export-scope-b',
    studentId: 'student-export-scope-b',
    studentName: 'Scope Learner Beta',
    admissionNumber: 'EXPORT-B',
    className: 'Level 4 OTHER B',
    combination: 'OTHERTEST',
    term: 'Term 2',
    overallAverage: 88,
    overallRank: 2,
    totalStudentsInClass: 2
  } as any);
  const otherTermCard = db.upsertReportCard({
    ...scopeBase,
    id: 'rc-export-scope-old',
    studentId: 'student-export-scope-old',
    studentName: 'Scope Learner Old',
    admissionNumber: 'EXPORT-OLD',
    className: 'Level 4 EXPORT A',
    combination: 'EXPORTTEST',
    term: 'Term 1',
    overallAverage: 99,
    overallRank: 1,
    totalStudentsInClass: 1
  } as any);

  check('Test report cards were created', Boolean(scopedCard && otherCombinationCard && otherTermCard));

  const anonymous = await request('/api/reports/analytics/export?section=ACADEMIC');
  check('Report export requires authentication', anonymous.status === 401, `status ${anonymous.status}`);

  const teacher = await request('/api/reports/analytics/export?section=ACADEMIC', teacherCookie);
  check('Teacher without reports.read cannot export', teacher.status === 403, `status ${teacher.status}`);

  const scopedJson = await request(
    '/api/reports/analytics?term=Term%202&combination=EXPORTTEST',
    headCookie
  );
  const scopedIds = (scopedJson.body?.academics?.topStudents || []).map((card: any) => card.id);
  check('Headteacher can read scoped analytics', scopedJson.status === 200, `status ${scopedJson.status}`);
  check(
    'Term and trade filters are applied to report cards',
    scopedIds.includes(scopedCard.id) && !scopedIds.includes(otherCombinationCard.id) && !scopedIds.includes(otherTermCard.id),
    JSON.stringify(scopedIds)
  );
  check(
    'Analytics reports the applied filters',
    scopedJson.body?.scope?.term === 'Term 2' && scopedJson.body?.scope?.combination === 'EXPORTTEST' &&
      JSON.stringify(scopedJson.body?.scope?.appliedTo || []).includes('academics'),
    JSON.stringify(scopedJson.body?.scope)
  );

  const defaultJson = await request('/api/reports/analytics', headCookie);
  const defaultIds = (defaultJson.body?.academics?.topStudents || []).map((card: any) => card.id);
  check(
    'Default analytics uses Term 1 without an undeclared trade filter',
    defaultJson.body?.scope?.term === 'Term 1' && defaultJson.body?.scope?.combination === null &&
      !defaultIds.includes(scopedCard.id),
    JSON.stringify({ scope: defaultJson.body?.scope, ids: defaultIds })
  );

  const beforeAudit = db.getAuditLogs(schoolId).length;
  const scopedExport = await request(
    '/api/reports/analytics/export?section=ACADEMIC&term=Term%202&combination=EXPORTTEST',
    headCookie
  );
  check('Headteacher can export a report', scopedExport.status === 200, `status ${scopedExport.status}`);
  check(
    'Export is served as UTF-8 CSV with an attachment filename',
    (scopedExport.headers.get('content-type') || '').includes('text/csv') &&
      (scopedExport.headers.get('content-disposition') || '').includes('attachment; filename='),
    `${scopedExport.headers.get('content-type')} / ${scopedExport.headers.get('content-disposition')}`
  );
  check('Export begins with a UTF-8 BOM for Excel', scopedExport.text.startsWith('\uFEFF'));
  check(
    'Export rows match the filtered JSON view',
    scopedExport.text.includes('Scope Learner Alpha') &&
      scopedExport.text.includes('EXPORT-A') &&
      !scopedExport.text.includes('Scope Learner Beta') &&
      !scopedExport.text.includes('Scope Learner Old'),
    scopedExport.text.slice(0, 400)
  );
  check(
    'Export metadata declares the filters and no hidden restrictions',
    scopedExport.text.includes('Term filter,Term 2') &&
      scopedExport.text.includes('Trade filter,EXPORTTEST') &&
      scopedExport.text.includes('Restricted sections,none'),
    scopedExport.text.slice(0, 400)
  );

  const logs = db.getAuditLogs(schoolId);
  const exportLog = logs.find(entry => entry.action === 'EXPORT_EXECUTIVE_REPORT');
  check('Report export was appended to activity history', logs.length === beforeAudit + 1, `${beforeAudit} -> ${logs.length}`);
  check(
    'Export audit detail contains no learner name',
    Boolean(exportLog) &&
      !exportLog!.details.includes('Scope Learner Alpha') &&
      exportLog!.details.includes('Term 2') &&
      exportLog!.details.includes('EXPORTTEST'),
    JSON.stringify(exportLog)
  );

  const accountantExport = await request('/api/reports/analytics/export?section=ACADEMIC', accountantCookie);
  check(
    'Restricted section export is honest instead of silently empty',
    accountantExport.status === 200 &&
      accountantExport.text.includes('RESTRICTED - your account cannot read the underlying module records') &&
      !accountantExport.text.includes('Scope Learner Alpha'),
    accountantExport.text.slice(0, 400)
  );
  check(
    'Restricted export names the withheld sections',
    accountantExport.text.includes('Restricted sections,"academics, attendance, health"'),
    accountantExport.text.slice(0, 400)
  );

  const unsafeFilename = await request('/api/reports/analytics/export?section=..%2F..%2Fetc%2Fpasswd', headCookie);
  const disposition = unsafeFilename.headers.get('content-disposition') || '';
  check(
    'Export filename cannot contain path separators',
    unsafeFilename.status === 200 && !disposition.includes('/') && !disposition.includes('..'),
    disposition
  );

  const escaped = toCsv([['Name'], ['=HYPERLINK("x")'], ['A "quoted", name']]);
  check('CSV formula-looking cells are neutralised', escaped.includes('\'=HYPERLINK'), escaped);
  check('CSV quotes and commas are escaped', escaped.includes('"A ""quoted"", name"'), escaped);

  server.close();
  const failed = checks.filter(item => !item.passed);
  for (const item of failed) console.error(`FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`${checks.length - failed.length}/${checks.length} report export checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
