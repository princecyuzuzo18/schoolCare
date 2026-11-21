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

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-isolation-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;
let closeMysqlPoolFn: (() => Promise<void>) | undefined;
let isolationMysqlPool: Awaited<ReturnType<typeof import('../server/mysqlConnector')['getMysqlPool']>> | null = null;

try {
  const { closeMysqlPool, getMysqlPool } = await import('../server/mysqlConnector');
  closeMysqlPoolFn = closeMysqlPool;
  isolationMysqlPool = getMysqlPool();
  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');

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

  function jsonPost(body: unknown, cookie: string): RequestInit {
    return {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
  }

  const ownSchool = 'school-es-rubengera-01';
  const otherSchool = 'school-other-isolation-test';
  const head = db.getUserById('user-super-admin');
  if (!head || head.role !== 'HEAD_TEACHER') {
    check('Headteacher test account exists', false, `role ${head?.role}`);
  } else {
    db.createUser({
      id: 'user-other-head',
      schoolId: otherSchool,
      email: 'other.head@schoolcare.rw',
      fullName: 'Other School Head',
      role: 'HEAD_TEACHER',
      phone: '+250 700 000 009',
      avatarUrl: '',
      preferredLanguage: 'en',
      isActive: true
    });
    db.getSchools().push({
      id: otherSchool,
      name: 'Other Test School',
      code: 'OTHER-TEST',
      type: 'Secondary',
      motto: '',
      logoUrl: '',
      province: 'Western',
      district: 'Karongi',
      sector: 'Rubengera',
      country: 'RW',
      phone: '',
      emergencyPhone: '',
      email: 'other@schoolcare.rw',
      website: '',
      currency: 'RWF',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any);

    const ownStudent = db.createStudent({
      id: 'student-own-isolation',
      schoolId: ownSchool,
      admissionNumber: 'ISO-OWN-001',
      firstName: 'Own',
      lastName: 'Student',
      gender: 'F',
      dob: '2010-01-01',
      className: 'S3 A',
      combination: 'SOD',
      enrollmentStatus: 'ACTIVE',
      admissionDate: '2026-01-10',
      createdAt: new Date().toISOString()
    } as any);
    const otherStudent = db.createStudent({
      id: 'student-other-isolation',
      schoolId: otherSchool,
      admissionNumber: 'ISO-OTHER-001',
      firstName: 'Other',
      lastName: 'Student',
      gender: 'M',
      dob: '2010-02-01',
      className: 'S3 B',
      combination: 'CST',
      enrollmentStatus: 'ACTIVE',
      admissionDate: '2026-01-10',
      createdAt: new Date().toISOString()
    } as any);

    // The list endpoint reads live student rows from MariaDB when it is
    // connected, so mirror the two test learners there as well.
    if (isolationMysqlPool) {
      try {
        await isolationMysqlPool.execute(
          `INSERT INTO schools (id, name, code, type, province, district, sector, country, phone, emergency_phone, email, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [otherSchool, 'Other Test School', 'OTHER-TEST', 'Secondary', 'Western', 'Karongi', 'Rubengera', 'RW',
            '+250700000009', '+250700000009', 'other@schoolcare.rw', 'RWF']
        );
        for (const student of [ownStudent, otherStudent]) {
          await isolationMysqlPool.execute(
            `INSERT INTO students (id, school_id, admission_number, first_name, last_name, gender, dob, class_name, combination, enrollment_status, admission_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE first_name = VALUES(first_name)`,
            [student.id, student.schoolId, student.admissionNumber, student.firstName, student.lastName,
              student.gender, student.dob, student.className, student.combination, student.enrollmentStatus,
              student.admissionDate]
          );
        }
      } catch (error) {
        console.warn('[Isolation test] MySQL student seeding failed:', (error as Error).message);
      }
    }

    const otherGuardian = db.createGuardian({
      id: 'guardian-other-isolation',
      schoolId: otherSchool,
      fullName: 'Other Guardian',
      relationship: 'GUARDIAN',
      phone: '+250 700 000 008',
      preferredLanguage: 'en',
      preferredChannel: 'SMS',
      isVerified: true,
      canPickup: true,
      emergencyPriority: 1
    } as any, otherStudent.id);
    const otherIncident = db.createHealthIncident({
      id: 'incident-other-isolation',
      schoolId: otherSchool,
      referenceNumber: 'EMG-ISO-001',
      studentId: otherStudent.id,
      studentName: 'Other Student',
      studentClass: 'S3 B',
      date: '2026-11-21',
      time: '09:00',
      category: 'ILLNESS',
      priority: 'URGENT',
      symptoms: 'Fever',
      observations: 'Resting',
      actionsTaken: 'Initial care',
      responsibleStaffName: 'Other Nurse',
      contactStatus: 'PENDING',
      parentAcknowledged: false,
      outcome: 'RESTING_IN_INFIRMARY',
      resolved: false,
      createdAt: new Date().toISOString(),
      timeline: []
    } as any);
    const otherNotification = db.queueNotification({
      id: 'notification-other-isolation',
      schoolId: otherSchool,
      recipientId: otherGuardian.id,
      recipientName: otherGuardian.fullName,
      recipientPhone: otherGuardian.phone,
      channel: 'SMS',
      category: 'GENERAL',
      priority: 'ROUTINE',
      titleEn: 'Other school notice',
      titleRw: 'Ibindi',
      contentEn: 'Other school content',
      contentRw: 'Ibindi',
      status: 'QUEUED',
      createdAt: new Date().toISOString()
    } as any);

    const headCookie = sessionCookie(head.id);
    const otherCookie = sessionCookie('user-other-head');

    const detail = await request(`/api/students/${otherStudent.id}`, { headers: { Cookie: headCookie } });
    check('Cross-school student detail is denied', detail.status === 403, `status ${detail.status}`);
    const ownDetail = await request(`/api/students/${ownStudent.id}`, { headers: { Cookie: headCookie } });
    check('Own-school student detail is allowed', ownDetail.status === 200, `status ${ownDetail.status}`);

    const update = await request(`/api/students/${otherStudent.id}`, {
      method: 'PATCH',
      headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Hacked' })
    });
    check('Cross-school student update is denied', update.status === 403, `status ${update.status}`);

    const guardians = await request(`/api/guardians/student/${otherStudent.id}`, { headers: { Cookie: headCookie } });
    check('Cross-school guardian list is denied', guardians.status === 403, `status ${guardians.status}`);

    const createGuardian = await request('/api/guardians', {
      ...jsonPost({ fullName: 'Bad Guardian', phone: '+250 700 000 007', studentId: otherStudent.id }, headCookie)
    });
    check('Cross-school guardian link creation is denied', createGuardian.status === 403, `status ${createGuardian.status}`);

    const incidentDetail = await request(`/api/health-incidents/${otherIncident.id}`, { headers: { Cookie: headCookie } });
    check('Cross-school health incident detail is denied', incidentDetail.status === 403, `status ${incidentDetail.status}`);
    const incidentAction = await request(`/api/health-incidents/${otherIncident.id}/action`, {
      ...jsonPost({ action: 'Tampered by other school' }, headCookie)
    });
    check('Cross-school health incident update is denied', incidentAction.status === 403, `status ${incidentAction.status}`);

    const incidentCreate = await request('/api/health-incidents', {
      ...jsonPost({ studentId: otherStudent.id, studentName: 'Other Student', symptoms: 'Fever' }, headCookie)
    });
    check('Cross-school health incident creation is denied', incidentCreate.status === 403, `status ${incidentCreate.status}`);

    const notificationAck = await request(`/api/notifications/${otherNotification.id}/acknowledge`, {
      method: 'POST',
      headers: { Cookie: headCookie }
    });
    check('Cross-school notification acknowledgement is denied', notificationAck.status === 404 || notificationAck.status === 403, `status ${notificationAck.status}`);

    const payment = await request('/api/finance/payments', {
      ...jsonPost({ studentId: otherStudent.id, amountRwf: 1000, method: 'CASH' }, headCookie)
    });
    check('Cross-school payment creation is denied', payment.status === 403, `status ${payment.status}`);

    const schoolUpdate = await request(`/api/schools/${otherSchool}`, {
      method: 'PATCH',
      headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ motto: 'Hacked' })
    });
    check('Cross-school settings update is denied', schoolUpdate.status === 403, `status ${schoolUpdate.status}`);

    const ownSchoolUpdate = await request(`/api/schools/${ownSchool}`, {
      method: 'PATCH',
      headers: { Cookie: headCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ motto: 'Excellence in service' })
    });
    check('Own-school settings update is allowed', ownSchoolUpdate.status === 200, `status ${ownSchoolUpdate.status}`);

    const spoofedList = await request('/api/students?schoolId=school-other-isolation-test', { headers: { Cookie: headCookie } });
    const spoofedIds = Array.isArray(spoofedList.body) ? spoofedList.body.map((s: any) => s.id) : [];
    check(
      'Browser-supplied schoolId is ignored by headteacher',
      spoofedList.status === 200 && spoofedIds.includes(ownStudent.id) && !spoofedIds.includes(otherStudent.id),
      JSON.stringify(spoofedIds)
    );

    const attendance = await request('/api/attendance/batch', {
      ...jsonPost({
        records: [{
          id: 'attendance-spoof-test',
          schoolId: otherSchool,
          studentId: ownStudent.id,
          studentName: 'Own Student',
          className: 'S3 A',
          date: '2026-11-21',
          status: 'PRESENT'
        }],
        notifyAbsences: false
      }, headCookie)
    });
    const ownAttendance = db.getAttendance(ownSchool).find(record => record.id === 'attendance-spoof-test');
    const otherAttendance = db.getAttendance(otherSchool).find(record => record.id === 'attendance-spoof-test');
    check('Attendance batch accepts in-school student', attendance.status === 200, `status ${attendance.status}`);
    check('Spoofed attendance schoolId is overwritten', ownAttendance?.schoolId === ownSchool && !otherAttendance,
      `own=${ownAttendance?.schoolId} other=${otherAttendance?.schoolId}`);

    const otherHeadList = await request('/api/students', { headers: { Cookie: otherCookie } });
    const otherHeadIds = Array.isArray(otherHeadList.body) ? otherHeadList.body.map((s: any) => s.id) : [];
    check(
      'Other school headteacher sees only their own students',
      otherHeadIds.includes(otherStudent.id) && !otherHeadIds.includes(ownStudent.id),
      JSON.stringify(otherHeadIds)
    );
  }
} finally {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
  if (isolationMysqlPool) {
    try {
      await isolationMysqlPool.execute('DELETE FROM students WHERE id IN (?, ?)', [
        'student-own-isolation',
        'student-other-isolation'
      ]);
      await isolationMysqlPool.execute('DELETE FROM schools WHERE id = ?', ['school-other-isolation-test']);
    } catch (error) {
      console.warn('[Isolation test] MySQL cleanup failed:', (error as Error).message);
    }
  }
  if (closeMysqlPoolFn) {
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
console.log(`${checks.length - failed.length}/${checks.length} school isolation checks passed.`);

if (failed.length > 0) process.exitCode = 1;
