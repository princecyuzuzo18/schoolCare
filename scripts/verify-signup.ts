import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const TEST_DB = 'schoolcare_signup_test';
const TEST_PASSWORD = 'SignupTestPass123!';
const checks: string[] = [];
let failures = 0;

function requireCheck(name: string, condition: unknown, detail?: string): void {
  checks.push(name);
  if (condition) {
    console.log(`[PASS] ${name}${detail ? ` (${detail})` : ''}`);
    return;
  }
  failures += 1;
  console.error(`[FAIL] ${name}${detail ? ` (${detail})` : ''}`);
}

function expectHttp(name: string, actual: number, expected: number): void {
  requireCheck(name, actual === expected, `HTTP ${actual}, expected ${expected}`);
}

async function main(): Promise<void> {
  const configured = process.env.DB_DATABASE || process.env.DB_NAME || 'schoolcare_db';
  if (configured !== TEST_DB) {
    throw new Error(
      `Refusing to run sign-up tests against "${configured}". ` +
      `Run with DB_DATABASE=${TEST_DB} DB_NAME=${TEST_DB}.`
    );
  }

  process.env.DB_DATABASE = TEST_DB;
  process.env.DB_NAME = TEST_DB;
  process.env.SCHOOLCARE_SKIP_SERVER_START = '1';
  process.env.ADMISSION_TRACKING_SECRET = 'schoolcare-signup-test-secret';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  process.env.SMS_API_KEY = 'signup-test-key';
  process.env.SMS_SENDER_ID = 'SchoolCareTest';

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schoolcare-signup-test-'));
  process.env.SCHOOLCARE_DATA_DIR = dataDir;

  const codes: string[] = [];
  const smsServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += String(chunk);
    });
    req.on('end', () => {
      const match = body.match(/\b\d{6}\b/);
      if (match) codes.push(match[0]);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise<void>(resolve => smsServer.listen(0, '127.0.0.1', resolve));
  const smsPort = (smsServer.address() as AddressInfo).port;
  process.env.SMS_GATEWAY_URL = `http://127.0.0.1:${smsPort}/sms`;

  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { getMysqlPool, closeMysqlPool } = await import('../server/mysqlConnector');
  const { hashPassword } = await import('../server/authCredentials');

  const pool = getMysqlPool();
  if (!pool) throw new Error('MariaDB pool could not be initialized.');

  try {
    const [migrationRows] = await pool.execute(
      "SELECT version FROM schema_migrations WHERE version = '004_parent_student_signup'"
    );
    requireCheck(
      '004_parent_student_signup is applied in the test database',
      Array.isArray(migrationRows) && migrationRows.length === 1
    );

    // Seed deterministic credentials in the isolated test database only.
    const seedAccounts = [
      ['user-super-admin', 'esrubengera@gmail.com'],
      ['user-parent', 'parent@schoolcare.rw'],
      ['user-student', 'student@esrubengera.rw']
    ];
    for (const [userId] of seedAccounts) {
      const passwordHash = await hashPassword(TEST_PASSWORD);
      await pool.execute(
        `INSERT INTO user_auth_credentials (user_id, password_hash) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
        [userId, passwordHash]
      );
    }

    // Celestin is already the guardian of Eric; add Divine in the temporary
    // JSON store so a genuine multi-child parent signup can be tested.
    db.createGuardianLink({
      studentId: 'std-divine-keza-02',
      guardianId: 'grd-celestin-02',
      relationship: 'FATHER',
      emergencyPriority: 1,
      canPickup: true,
      isPrimary: false
    });

    db.createHealthIncident({
      id: 'signup-test-incident-divine',
      schoolId: 'school-es-rubengera-01',
      referenceNumber: 'EMG-TEST-0001',
      studentId: 'std-divine-keza-02',
      studentName: 'Divine Keza',
      studentClass: 'Senior 3 A',
      date: '2026-11-20',
      time: '10:00',
      category: 'ILLNESS',
      priority: 'URGENT',
      symptoms: 'Test symptom',
      observations: 'Integration test record',
      actionsTaken: 'Created for scoping test',
      responsibleStaffName: 'Test Nurse',
      guardianId: 'grd-angelique-03',
      guardianName: 'Angelique Nyirandikubwimana',
      guardianPhone: '+250 788 912 345',
      contactStatus: 'REACHED',
      parentAcknowledged: false,
      outcome: 'UNDER_OBSERVATION',
      resolved: false,
      createdAt: new Date().toISOString(),
      timeline: [{ time: '10:00', action: 'Created for integration test', actor: 'Test Suite' }]
    });

    const httpServer = app.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
    const baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

    const request = async (endpoint: string, options: {
      method?: string;
      body?: unknown;
      cookie?: string;
    } = {}): Promise<{ status: number; body: any; cookie: string }> => {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: options.method || 'GET',
        headers: {
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.cookie ? { Cookie: options.cookie } : {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'manual'
      });
      const text = await response.text();
      let body: any = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      const setCookie = response.headers.get('set-cookie') || '';
      return {
        status: response.status,
        body,
        cookie: options.cookie || (setCookie ? setCookie.split(';')[0] : '')
      };
    };

    const waitForCode = async (): Promise<string> => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const code = codes.shift();
        if (code) return code;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('No verification code reached the local fake SMS gateway.');
    };

    const login = async (email: string, password = TEST_PASSWORD): Promise<{
      status: number;
      body: any;
      cookie: string;
    }> => request('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    try {
      const invalidParent = await request('/api/public/accounts/parent/signup', {
        method: 'POST',
        body: {
          fullName: 'Test Parent',
          phone: '+250 788 456 789',
          email: 'invalid.parent@example.com',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          admissionNumber: 'ESR-9999-9999',
          preferredLanguage: 'en'
        }
      });
      expectHttp('Parent signup rejects an unknown admission number', invalidParent.status, 404);

      const invalidStudent = await request('/api/public/accounts/student/signup', {
        method: 'POST',
        body: {
          fullName: 'Unknown Student',
          admissionNumber: 'ESR-9999-9999',
          dob: '2008-01-01',
          email: 'invalid.student@example.com',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          preferredLanguage: 'en'
        }
      });
      expectHttp('Student signup rejects an unknown admission number', invalidStudent.status, 404);

      const unrelated = await request('/api/public/accounts/parent/signup', {
        method: 'POST',
        body: {
          fullName: 'Chantal Mukantabana',
          phone: '+250 788 888 707',
          email: 'unrelated.parent@example.com',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          admissionNumber: 'ESR-2024-0105',
          preferredLanguage: 'en'
        }
      });
      expectHttp('Parent signup rejects a child with unrelated guardian contact', unrelated.status, 403);

      const parentSignup = await request('/api/public/accounts/parent/signup', {
        method: 'POST',
        body: {
          fullName: 'Celestin Gasana',
          phone: '+250 788 456 789',
          email: '',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          admissionNumber: 'ESR-2024-0106',
          admissionNumbers: ['ESR-2024-0106', 'ESR-2024-0105'],
          preferredLanguage: 'en'
        }
      });
      expectHttp('Parent signup with two children is accepted', parentSignup.status, 201);
      const parentRequest = parentSignup.body?.request;
      requireCheck('Parent signup generates a sign-in email when none is supplied', Boolean(parentRequest?.signInEmail));
      requireCheck('Parent signup requires verification code', parentRequest?.contactType === 'SMS' && !parentRequest?.requiresManualReview);

      const parentCode = await waitForCode();
      const parentDuplicate = await request('/api/public/accounts/parent/signup', {
        method: 'POST',
        body: {
          fullName: 'Celestin Gasana',
          phone: '+250 788 456 789',
          email: 'celestin.gasana@karongi.gov.rw',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          admissionNumber: 'ESR-2024-0106',
          admissionNumbers: ['ESR-2024-0106', 'ESR-2024-0105'],
          preferredLanguage: 'en'
        }
      });
      expectHttp('Duplicate parent child link is rejected', parentDuplicate.status, 409);

      const parentVerified = await request('/api/public/accounts/verify', {
        method: 'POST',
        body: { requestId: parentRequest.id, code: parentCode }
      });
      expectHttp('Parent verification code is accepted', parentVerified.status, 200);
      requireCheck('Parent request moves to VERIFIED', parentVerified.body?.request?.status === 'VERIFIED');

      const blockedParentLogin = await login(parentRequest.signInEmail);
      expectHttp('Parent cannot sign in before approval', blockedParentLogin.status, 401);

      const headteacherLogin = await login('esrubengera@gmail.com');
      expectHttp('Headteacher sign-in still works', headteacherLogin.status, 200);
      requireCheck('Headteacher role is unchanged', headteacherLogin.body?.user?.role === 'HEAD_TEACHER');

      const staffList = await request('/api/staff/invitations', { cookie: headteacherLogin.cookie });
      expectHttp('Headteacher can manage staff invitations', staffList.status, 200);

      const approval = await request(`/api/account-signup-requests/${parentRequest.id}/approve`, {
        method: 'POST',
        cookie: headteacherLogin.cookie,
        body: { notes: 'Approved by sign-up integration test.' }
      });
      expectHttp('Headteacher can approve a verified parent request', approval.status, 200);
      requireCheck('Approved parent has exactly the linked children',
        approval.body?.user?.role === 'PARENT' &&
        (approval.body.user.linkedStudentIds || []).includes('std-eric-uwitonze-03') &&
        (approval.body.user.linkedStudentIds || []).includes('std-divine-keza-02') &&
        !(approval.body.user.linkedStudentIds || []).includes('std-kevin-ishimwe-01'));

      const parentLogin = await login(parentRequest.signInEmail);
      expectHttp('Approved parent can sign in', parentLogin.status, 200);
      const parentCookie = parentLogin.cookie;

      const ownChild = await request('/api/students/std-eric-uwitonze-03', { cookie: parentCookie });
      expectHttp('Parent can read a linked child record', ownChild.status, 200);
      const otherChild = await request('/api/students/std-kevin-ishimwe-01', { cookie: parentCookie });
      expectHttp('Parent cannot read an unlinked child record', otherChild.status, 403);
      const parentGuardians = await request('/api/guardians', { cookie: parentCookie });
      expectHttp('Parent guardian list loads', parentGuardians.status, 200);
      const parentGuardianIds = (parentGuardians.body || []).map((guardian: any) => guardian.id);
      requireCheck('Parent guardian list excludes unrelated guardians',
        parentGuardianIds.includes('grd-celestin-02') &&
        parentGuardianIds.includes('grd-angelique-03') &&
        !parentGuardianIds.includes('grd-chantal-01'),
        parentGuardianIds.join(', '));

      const parentDashboard = await request('/api/portal/dashboard', { cookie: parentCookie });
      expectHttp('Parent dashboard loads', parentDashboard.status, 200);
      const dashboardStudentIds = (parentDashboard.body?.students || []).map((student: any) => student.id);
      requireCheck('Parent dashboard contains only linked children',
        dashboardStudentIds.length === 2 &&
        dashboardStudentIds.includes('std-eric-uwitonze-03') &&
        dashboardStudentIds.includes('std-divine-keza-02'),
        dashboardStudentIds.join(', '));

      const linkedIncident = await request('/api/portal/health-incidents/signup-test-incident-divine/acknowledge', {
        method: 'POST',
        cookie: parentCookie,
        body: { notes: 'Acknowledged by integration test.' }
      });
      expectHttp('Parent can acknowledge a linked child incident', linkedIncident.status, 200);

      const parentStaffInvite = await request('/api/staff/invitations', {
        method: 'POST',
        cookie: parentCookie,
        body: {
          fullName: 'Illegal Staff',
          email: 'illegal.staff@example.com',
          phone: '+250 788 000 000',
          role: 'TEACHER',
          preferredLanguage: 'en'
        }
      });
      expectHttp('Parent cannot create a staff invitation', parentStaffInvite.status, 403);

      const studentSignup = await request('/api/public/accounts/student/signup', {
        method: 'POST',
        body: {
          fullName: 'Divine Keza',
          admissionNumber: 'ESR-2024-0105',
          dob: '2008-08-23',
          email: 'divine.keza.signup@example.com',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          preferredLanguage: 'en'
        }
      });
      expectHttp('Student signup is accepted', studentSignup.status, 201);
      const studentRequest = studentSignup.body?.request;
      const studentCode = await waitForCode();

      const studentDuplicate = await request('/api/public/accounts/student/signup', {
        method: 'POST',
        body: {
          fullName: 'Divine Keza',
          admissionNumber: 'ESR-2024-0105',
          dob: '2008-08-23',
          email: 'divine.keza.signup@example.com',
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          preferredLanguage: 'en'
        }
      });
      expectHttp('Duplicate student account is rejected', studentDuplicate.status, 409);

      const studentVerified = await request('/api/public/accounts/verify', {
        method: 'POST',
        body: { requestId: studentRequest.id, code: studentCode }
      });
      expectHttp('Student verification code is accepted', studentVerified.status, 200);

      const blockedStudentLogin = await login('divine.keza.signup@example.com');
      expectHttp('Student cannot sign in before approval', blockedStudentLogin.status, 401);

      const studentApproval = await request(`/api/account-signup-requests/${studentRequest.id}/approve`, {
        method: 'POST',
        cookie: headteacherLogin.cookie,
        body: { notes: 'Approved by sign-up integration test.' }
      });
      expectHttp('Headteacher can approve a verified student request', studentApproval.status, 200);
      requireCheck('Approved student is linked to one student record',
        studentApproval.body?.user?.role === 'STUDENT' &&
        studentApproval.body.user.studentId === 'std-divine-keza-02');

      const studentLogin = await login('divine.keza.signup@example.com');
      expectHttp('Approved student can sign in', studentLogin.status, 200);
      const studentCookie = studentLogin.cookie;

      const ownRecord = await request('/api/students/std-divine-keza-02', { cookie: studentCookie });
      expectHttp('Student can read own record', ownRecord.status, 200);
      const otherRecord = await request('/api/students/std-eric-uwitonze-03', { cookie: studentCookie });
      expectHttp('Student cannot read another student record', otherRecord.status, 403);
      const studentGuardians = await request('/api/guardians', { cookie: studentCookie });
      expectHttp('Student guardian list loads', studentGuardians.status, 200);
      const studentGuardianIds = (studentGuardians.body || []).map((guardian: any) => guardian.id);
      requireCheck('Student guardian list contains only own guardian',
        studentGuardianIds.length === 1 && studentGuardianIds[0] === 'grd-angelique-03',
        studentGuardianIds.join(', '));

      const studentDashboard = await request('/api/portal/dashboard', { cookie: studentCookie });
      expectHttp('Student dashboard loads', studentDashboard.status, 200);
      requireCheck('Student dashboard contains only own record',
        (studentDashboard.body?.students || []).length === 1 &&
        studentDashboard.body.students[0]?.id === 'std-divine-keza-02');

      const studentStaffInvite = await request('/api/staff/invitations', {
        method: 'POST',
        cookie: studentCookie,
        body: {
          fullName: 'Illegal Staff',
          email: 'illegal.student.staff@example.com',
          phone: '+250 788 000 001',
          role: 'TEACHER',
          preferredLanguage: 'en'
        }
      });
      expectHttp('Student cannot create a staff invitation', studentStaffInvite.status, 403);

      const existingParentLogin = await login('parent@schoolcare.rw');
      expectHttp('Existing parent account still signs in', existingParentLogin.status, 200);
      const existingStudentLogin = await login('student@esrubengera.rw');
      expectHttp('Existing student account still signs in', existingStudentLogin.status, 200);
      const existingParentPortal = await request('/api/portal/dashboard', { cookie: existingParentLogin.cookie });
      expectHttp('Existing parent dashboard still loads', existingParentPortal.status, 200);
      const existingStudentPortal = await request('/api/portal/dashboard', { cookie: existingStudentLogin.cookie });
      expectHttp('Existing student dashboard still loads', existingStudentPortal.status, 200);

      assert.equal(failures, 0, `${failures} sign-up check(s) failed.`);
      console.log(`All ${checks.length} sign-up integration checks passed.`);
    } finally {
      httpServer.close();
    }
  } finally {
    await closeMysqlPool();
    smsServer.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  if (code === 'ER_BAD_DB_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
    console.error(
      `Database ${TEST_DB} is missing or not granted to ${process.env.DB_USERNAME || process.env.DB_USER || 'schoolcare_user'}. ` +
      `Run mysql/create_signup_test_db.sql as an administrator, then npm run test:signup:init.`
    );
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
