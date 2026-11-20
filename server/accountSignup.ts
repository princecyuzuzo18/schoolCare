import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Guardian, LanguageCode, Student, UserProfile } from '../src/types';
import { db } from './database';
import { getMysqlPool } from './mysqlConnector';
import { hashPassword } from './authCredentials';
import { generateVerificationCode, hashValue, isValidPhone, normalizeContact } from './admissions';
import { emailConfigured, sendAccountVerificationCode, smsConfigured } from './notifications';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

type SignupRole = 'PARENT' | 'STUDENT';
type ContactChannel = 'EMAIL' | 'SMS' | 'MANUAL';

export interface ParentSignupInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  admissionNumber: string;
  /** Optional additional admission numbers for a parent with several children. */
  admissionNumbers?: string[] | string;
  preferredLanguage: LanguageCode;
}

export interface StudentSignupInput {
  fullName: string;
  admissionNumber: string;
  dob: string;
  email: string;
  password: string;
  confirmPassword: string;
  preferredLanguage: LanguageCode;
}

export interface SignupRequestView {
  id: string;
  role: SignupRole;
  fullName: string;
  phone: string;
  email: string | null;
  /** The address the new account will sign in with (supplied or generated). */
  signInEmail: string;
  admissionNumber: string;
  status: string;
  contactType: ContactChannel;
  verificationSent: boolean;
  requiresManualReview: boolean;
  message: string;
  createdAt: string;
}

interface SignupRow extends RowDataPacket {
  id: string;
  school_id: string;
  role_id: SignupRole;
  full_name: string;
  phone: string;
  email: string | null;
  password_hash: string;
  admission_number: string;
  student_id: string | null;
  guardian_id: string | null;
  contact_type: ContactChannel;
  verification_contact: string | null;
  contact_hash: string;
  code_hash: string | null;
  code_expires_at: Date | null;
  attempts: number;
  status: string;
  requires_manual_review: number;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

interface GuardianContact {
  guardian: Guardian;
  contact: string;
  channel: Exclude<ContactChannel, 'MANUAL'>;
}

export class SignupError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'SignupError';
  }
}

function requirePool() {
  const pool = getMysqlPool();
  if (!pool) {
    throw new SignupError('MariaDB is unavailable. Try again when the school database is online.', 503);
  }
  return pool;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function validDob(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validatePassword(password: string, confirmPassword: string): void {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new SignupError(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`);
  }
  if (password !== confirmPassword) {
    throw new SignupError('Passwords do not match.');
  }
}

function validateLanguage(value: unknown): LanguageCode {
  return value === 'en' || value === 'rw' ? value : 'rw';
}

/**
 * Email is optional in the sign-up forms. SchoolCare still signs users in by
 * email, so a deterministic local address is generated when none is supplied.
 * It is returned to the applicant and stored like any other email address.
 */
function signInEmail(role: SignupRole, seed: string): string {
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
  const suffix = normalized || randomBytes(4).toString('hex');
  return `${role.toLowerCase()}.${suffix}@signup.schoolcare.local`;
}

function suppliedOrGeneratedEmail(email: unknown, role: SignupRole, seed: string): string {
  const supplied = clean(email, 254);
  if (supplied) {
    if (!EMAIL_RE.test(supplied)) {
      throw new SignupError('Enter a valid email address.');
    }
    return supplied;
  }
  return signInEmail(role, seed);
}

function parseAdmissionNumbers(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;,]+/)
      : [];
  return Array.from(
    new Set(
      parts
        .map(item => clean(item, 50).toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, 10);
}

export function validateParentSignupInput(input: ParentSignupInput): ParentSignupInput {
  const admissionNumbers = parseAdmissionNumbers([
    input.admissionNumber,
    ...(Array.isArray(input.admissionNumbers)
      ? input.admissionNumbers
      : parseAdmissionNumbers(input.admissionNumbers))
  ].filter(Boolean));
  const normalized: ParentSignupInput = {
    fullName: clean(input.fullName, 255),
    phone: clean(input.phone, 50),
    email: suppliedOrGeneratedEmail(input.email, 'PARENT', clean(input.phone, 50)),
    password: typeof input.password === 'string' ? input.password : '',
    confirmPassword: typeof input.confirmPassword === 'string' ? input.confirmPassword : '',
    admissionNumber: admissionNumbers[0] || '',
    admissionNumbers,
    preferredLanguage: validateLanguage(input.preferredLanguage)
  };

  if (normalized.fullName.length < 3) {
    throw new SignupError('Enter your full name.');
  }
  if (!isValidPhone(normalized.phone)) {
    throw new SignupError('Enter a valid phone number.');
  }
  if (admissionNumbers.length === 0) {
    throw new SignupError('Enter at least one student admission number.');
  }
  validatePassword(normalized.password, normalized.confirmPassword);
  return normalized;
}

export function validateStudentSignupInput(input: StudentSignupInput): StudentSignupInput {
  const normalized: StudentSignupInput = {
    fullName: clean(input.fullName, 255),
    admissionNumber: clean(input.admissionNumber, 50).toUpperCase(),
    dob: clean(input.dob, 10),
    email: suppliedOrGeneratedEmail(input.email, 'STUDENT', clean(input.admissionNumber, 50)),
    password: typeof input.password === 'string' ? input.password : '',
    confirmPassword: typeof input.confirmPassword === 'string' ? input.confirmPassword : '',
    preferredLanguage: validateLanguage(input.preferredLanguage)
  };

  if (normalized.fullName.length < 3) {
    throw new SignupError('Enter your full name.');
  }
  if (!normalized.admissionNumber) {
    throw new SignupError('Enter your admission number.');
  }
  if (!validDob(normalized.dob)) {
    throw new SignupError('Enter a valid date of birth.');
  }
  validatePassword(normalized.password, normalized.confirmPassword);
  return normalized;
}

function findSchool() {
  const school = db.getSchools()[0];
  if (!school) throw new SignupError('The school profile is not available.', 503);
  return school;
}

export function findStudentByAdmissionNumber(schoolId: string, admissionNumber: string): Student | undefined {
  const target = admissionNumber.trim().toUpperCase();
  return db.getStudents(schoolId).find(student => student.admissionNumber.trim().toUpperCase() === target);
}

function assertActiveStudent(student: Student): void {
  if (student.enrollmentStatus !== 'ACTIVE') {
    throw new SignupError('That admission number is not linked to an active student record.');
  }
}

function fullNameMatches(fullName: string, student: Student): boolean {
  const expected = normalizeName(`${student.firstName} ${student.lastName}`);
  const supplied = normalizeName(fullName);
  return Boolean(expected && supplied && expected === supplied);
}

function contactCandidates(guardian: Guardian): Array<{ contact: string; channel: 'EMAIL' | 'SMS' }> {
  const candidates: Array<{ contact: string; channel: 'EMAIL' | 'SMS' }> = [];
  if (guardian.email) candidates.push({ contact: guardian.email, channel: 'EMAIL' });
  if (guardian.phone) candidates.push({ contact: guardian.phone, channel: 'SMS' });
  if (guardian.altPhone) candidates.push({ contact: guardian.altPhone, channel: 'SMS' });
  return candidates;
}

/**
 * A parent may only link children whose school records share the supplied
 * contact. This prevents a parent from claiming an unrelated student by
 * entering a known admission number.
 */
function findSharedParentGuardianContact(
  students: Student[],
  suppliedPhone: string,
  suppliedEmail: string
): { contact?: GuardianContact; hasGuardianRecords: boolean } {
  const supplied = new Set([suppliedEmail, suppliedPhone].map(normalizeContact).filter(Boolean));
  if (students.length === 0) return { hasGuardianRecords: false };

  const guardiansByStudent = students.map(student => db.getGuardiansForStudent(student.id));
  const hasGuardianRecords = guardiansByStudent.every(entries => entries.length > 0);
  if (supplied.size === 0) return { hasGuardianRecords };

  const matchesByStudent = guardiansByStudent.map(entries => {
    const matches: GuardianContact[] = [];
    for (const { guardian } of entries) {
      for (const candidate of contactCandidates(guardian)) {
        if (supplied.has(normalizeContact(candidate.contact))) {
          matches.push({ guardian, contact: candidate.contact, channel: candidate.channel });
        }
      }
    }
    return matches;
  });
  if (matchesByStudent.some(matches => matches.length === 0)) {
    // Guardian records exist but the applicant supplied unrelated contact details.
    // Do not create a claimable request; a staff member must resolve the mismatch.
    if (hasGuardianRecords) {
      throw new SignupError(
        'The phone or email does not match the guardian contact on the school record.',
        403
      );
    }
    return { hasGuardianRecords };
  }

  const shared = matchesByStudent[0].filter(candidate =>
    matchesByStudent.every(matches =>
      matches.some(item => normalizeContact(item.contact) === normalizeContact(candidate.contact))
    )
  );
  if (shared.length === 0) {
    throw new SignupError(
      'The supplied contact is not shared by all linked student records.',
      403
    );
  }

  return {
    contact:
      shared.find(item => item.channel === 'EMAIL' && emailConfigured()) ||
      shared.find(item => item.channel === 'SMS' && smsConfigured()) ||
      shared[0],
    hasGuardianRecords
  };
}

function findStudentGuardianContact(student: Student): GuardianContact | undefined {
  const matches: GuardianContact[] = [];
  for (const { guardian } of db.getGuardiansForStudent(student.id)) {
    for (const candidate of contactCandidates(guardian)) {
      matches.push({ guardian, contact: candidate.contact, channel: candidate.channel });
    }
  }
  return (
    matches.find(item => item.channel === 'EMAIL' && emailConfigured()) ||
    matches.find(item => item.channel === 'SMS' && smsConfigured()) ||
    matches[0]
  );
}

function maskContact(contact: string): string {
  if (contact.includes('@')) {
    const [local, domain] = contact.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return contact.length > 4 ? `${contact.slice(0, 4)}***${contact.slice(-2)}` : '***';
}

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(10).toString('hex')}`;
}

function hashComparison(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rowToView(row: SignupRow): SignupRequestView {
  const verificationSent =
    row.status === 'VERIFIED' || row.status === 'APPROVED' || Boolean(row.code_hash);
  let message = 'Your request is pending approval. You can sign in after the school approves it.';
  if (row.status === 'VERIFIED') {
    message = 'Verification complete. Your account is awaiting school approval.';
  } else if (row.requires_manual_review) {
    message = 'Your details were saved. The school will review them before activating the account.';
  } else if (row.status === 'APPROVED') {
    message = 'Your account has been approved. You can sign in now.';
  }

  return {
    id: row.id,
    role: row.role_id,
    fullName: row.full_name,
    phone: maskContact(row.phone),
    email: row.email ? maskContact(row.email) : null,
    signInEmail: row.email || '',
    admissionNumber: row.admission_number,
    status: row.status,
    contactType: row.contact_type,
    verificationSent,
    requiresManualReview: row.requires_manual_review === 1,
    message,
    createdAt: row.created_at.toISOString()
  };
}

async function getRequestRow(id: string): Promise<SignupRow> {
  const pool = requirePool();
  const [rows] = await pool.execute<SignupRow[]>(
    `SELECT * FROM account_signup_requests WHERE id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) throw new SignupError('That sign-up request could not be found.', 404);
  return rows[0];
}

async function hasPendingRequest(studentId: string, role: SignupRole): Promise<boolean> {
  const pool = requirePool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM account_signup_requests request
     JOIN account_signup_students link ON link.request_id = request.id
     WHERE request.status IN ('PENDING', 'VERIFIED')
       AND request.role_id = ?
       AND link.student_id = ?`,
    [role, studentId]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function assertEmailAvailable(email: string, allowedUserId?: string): Promise<void> {
  if (db.getUserByEmail(email)) {
    throw new SignupError('An account with that email address already exists.', 409);
  }
  const pool = requirePool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM user_profiles WHERE LOWER(email) = LOWER(?) LIMIT 1',
    [email]
  );
  const existingId = rows[0]?.id as string | undefined;
  if (existingId && existingId !== allowedUserId) {
    throw new SignupError('An account with that email address already exists.', 409);
  }
}

async function assertStudentAccountAvailable(studentId: string, role: SignupRole): Promise<void> {
  const conflictingJsonUser = db
    .getUsers()
    .some(user =>
      user.role === role &&
      (user.studentId === studentId || Boolean(user.linkedStudentIds?.includes(studentId)))
    );
  if (conflictingJsonUser) {
    throw new SignupError('An account of this type is already linked to that student record.', 409);
  }
  const pool = requirePool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT user_id FROM account_student_links WHERE student_id = ? AND scope = ? LIMIT 1',
    [studentId, role]
  );
  if (rows.length > 0) {
    throw new SignupError('An account of this type is already linked to that student record.', 409);
  }
}

async function sendCodeForRow(row: SignupRow, code: string): Promise<boolean> {
  const contact = row.verification_contact || '';
  if (!contact) return false;
  const channel = row.contact_type === 'EMAIL' ? 'email' : 'sms';
  const result = await sendAccountVerificationCode(contact, channel, code);
  return result.sent;
}

async function insertSignupRequest(values: {
  schoolId: string;
  role: SignupRole;
  fullName: string;
  phone: string;
  email: string;
  passwordHash: string;
  admissionNumber: string;
  studentIds: string[];
  guardianId: string | null;
  contactType: ContactChannel;
  verificationContact: string | null;
  contactHash: string;
  codeHash: string | null;
  codeExpiresAt: Date | null;
  requiresManualReview: boolean;
}): Promise<SignupRow> {
  const pool = requirePool();
  const id = newId('signup');
  await pool.execute(
    `INSERT INTO account_signup_requests
      (id, school_id, role_id, full_name, phone, email, password_hash, admission_number,
       student_id, guardian_id, contact_type, verification_contact, contact_hash,
       code_hash, code_expires_at, attempts, status, requires_manual_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?)`,
    [
      id,
      values.schoolId,
      values.role,
      values.fullName,
      values.phone,
      values.email,
      values.passwordHash,
      values.admissionNumber,
      values.studentIds[0],
      values.guardianId,
      values.contactType,
      values.verificationContact,
      values.contactHash,
      values.codeHash,
      values.codeExpiresAt,
      values.requiresManualReview ? 1 : 0
    ]
  );
  for (const studentId of values.studentIds) {
    await pool.execute(
      `INSERT INTO account_signup_students (request_id, student_id, admission_number)
       SELECT ?, id, admission_number FROM students WHERE id = ? LIMIT 1`,
      [id, studentId]
    );
  }
  return getRequestRow(id);
}

export async function getSignupRequestView(requestId: string): Promise<SignupRequestView> {
  return rowToView(await getRequestRow(clean(requestId, 100)));
}

async function getRequestStudentIds(requestId: string): Promise<string[]> {
  const pool = requirePool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT student_id FROM account_signup_students WHERE request_id = ? ORDER BY student_id',
    [requestId]
  );
  return rows.map(row => String(row.student_id)).filter(Boolean);
}

export async function createParentSignupRequest(input: ParentSignupInput): Promise<SignupRequestView> {
  const value = validateParentSignupInput(input);
  const school = findSchool();
  const students: Student[] = [];

  for (const admissionNumber of value.admissionNumbers || [value.admissionNumber]) {
    const student = findStudentByAdmissionNumber(school.id, admissionNumber);
    if (!student) {
      throw new SignupError(`No student record was found for admission number ${admissionNumber}.`);
    }
    assertActiveStudent(student);
    if (students.some(item => item.id === student.id)) continue;
    await assertStudentAccountAvailable(student.id, 'PARENT');
    if (await hasPendingRequest(student.id, 'PARENT')) {
      throw new SignupError('A sign-up request is already pending for that email and student.', 409);
    }
    students.push(student);
  }

  const existingParent = db.getUserByEmail(value.email);
  if (existingParent && existingParent.role !== 'PARENT') {
    throw new SignupError('An account with that email address already exists.', 409);
  }
  await assertEmailAvailable(value.email, existingParent?.id);

  const guardianMatch = findSharedParentGuardianContact(students, value.phone, value.email);
  const guardianContact = guardianMatch.contact;
  const passwordHash = await hashPassword(value.password);
  const contactForHash = guardianContact?.contact || value.phone;
  const code = guardianContact ? generateVerificationCode() : '';
  const codeHash = guardianContact ? hashValue(`${'PENDING'}:${code}`) : null;
  const contactHash = hashValue(normalizeContact(contactForHash));

  let row = await insertSignupRequest({
    schoolId: school.id,
    role: 'PARENT',
    fullName: value.fullName,
    phone: value.phone,
    email: value.email,
    passwordHash,
    admissionNumber: students[0].admissionNumber,
    studentIds: students.map(student => student.id),
    guardianId: guardianContact?.guardian.id || null,
    contactType: guardianContact?.channel || 'MANUAL',
    verificationContact: guardianContact?.contact || null,
    contactHash,
    codeHash,
    codeExpiresAt: guardianContact ? new Date(Date.now() + CODE_TTL_MS) : null,
    requiresManualReview: !guardianContact
  });

  if (guardianContact) {
    const realCodeHash = hashValue(`${row.id}:${code}`);
    const pool = requirePool();
    await pool.execute(
      'UPDATE account_signup_requests SET code_hash = ? WHERE id = ?',
      [realCodeHash, row.id]
    );
    const sent = await sendAccountVerificationCode(
      guardianContact.contact,
      guardianContact.channel === 'EMAIL' ? 'email' : 'sms',
      code
    );
    if (!sent.sent) {
      await pool.execute(
        `UPDATE account_signup_requests
         SET code_hash = NULL, code_expires_at = NULL, requires_manual_review = 1
         WHERE id = ?`,
        [row.id]
      );
    }
    row = await getRequestRow(row.id);
  }

  db.logAudit(
    school.id,
    existingParent?.id || '',
    value.fullName,
    'PARENT',
    'ACCOUNT_SIGNUP_REQUESTED',
    'ACCOUNT_SIGNUP_REQUEST',
    row.id,
    `Parent sign-up requested for ${students.map(student => student.admissionNumber).join(', ')}.`,
    undefined
  );

  return rowToView(row);
}

export async function createStudentSignupRequest(input: StudentSignupInput): Promise<SignupRequestView> {
  const value = validateStudentSignupInput(input);
  const school = findSchool();
  const student = findStudentByAdmissionNumber(school.id, value.admissionNumber);
  if (!student) {
    throw new SignupError('No student record was found for that admission number.');
  }
  assertActiveStudent(student);
  if (!fullNameMatches(value.fullName, student) || value.dob !== student.dob) {
    throw new SignupError('The name or date of birth does not match the student record.');
  }
  await assertEmailAvailable(value.email);
  await assertStudentAccountAvailable(student.id, 'STUDENT');
  if (await hasPendingRequest(student.id, 'STUDENT')) {
    throw new SignupError('A sign-up request is already pending for that email and student.', 409);
  }

  const guardianContact = findStudentGuardianContact(student);
  const passwordHash = await hashPassword(value.password);
  const code = guardianContact ? generateVerificationCode() : '';
  const contactHash = hashValue(normalizeContact(guardianContact?.contact || student.admissionNumber));

  let row = await insertSignupRequest({
    schoolId: school.id,
    role: 'STUDENT',
    fullName: value.fullName,
    phone: student.admissionNumber,
    email: value.email,
    passwordHash,
    admissionNumber: student.admissionNumber,
    studentIds: [student.id],
    guardianId: guardianContact?.guardian.id || null,
    contactType: guardianContact?.channel || 'MANUAL',
    verificationContact: guardianContact?.contact || null,
    contactHash,
    codeHash: guardianContact ? hashValue(`${'PENDING'}:${code}`) : null,
    codeExpiresAt: guardianContact ? new Date(Date.now() + CODE_TTL_MS) : null,
    requiresManualReview: !guardianContact
  });

  if (guardianContact) {
    const realCodeHash = hashValue(`${row.id}:${code}`);
    const pool = requirePool();
    await pool.execute(
      'UPDATE account_signup_requests SET code_hash = ? WHERE id = ?',
      [realCodeHash, row.id]
    );
    const sent = await sendAccountVerificationCode(
      guardianContact.contact,
      guardianContact.channel === 'EMAIL' ? 'email' : 'sms',
      code
    );
    if (!sent.sent) {
      await pool.execute(
        `UPDATE account_signup_requests
         SET code_hash = NULL, code_expires_at = NULL, requires_manual_review = 1
         WHERE id = ?`,
        [row.id]
      );
    }
    row = await getRequestRow(row.id);
  }

  db.logAudit(
    school.id,
    '',
    value.fullName,
    'STUDENT',
    'ACCOUNT_SIGNUP_REQUESTED',
    'ACCOUNT_SIGNUP_REQUEST',
    row.id,
    `Student sign-up requested for admission number ${student.admissionNumber}.`,
    undefined
  );

  return rowToView(row);
}

export async function verifySignupRequest(requestId: string, code: string): Promise<SignupRequestView> {
  const id = clean(requestId, 100);
  const submitted = clean(code, 10);
  if (!id || !/^\d{6}$/.test(submitted)) {
    throw new SignupError('Enter the 6-digit verification code.');
  }

  const row = await getRequestRow(id);
  if (row.status !== 'PENDING') {
    throw new SignupError('This sign-up request has already been processed.', 409);
  }
  if (!row.code_hash || row.requires_manual_review) {
    throw new SignupError('This request requires school review instead of a verification code.');
  }
  if (row.code_expires_at && row.code_expires_at.getTime() < Date.now()) {
    const pool = requirePool();
    await pool.execute("UPDATE account_signup_requests SET status = 'EXPIRED' WHERE id = ?", [id]);
    throw new SignupError('The verification code has expired. Request a new one.');
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    throw new SignupError('Too many incorrect codes. Request a new one.', 429);
  }

  const expected = row.code_hash;
  const actual = hashValue(`${id}:${submitted}`);
  if (!hashComparison(expected, actual)) {
    const pool = requirePool();
    await pool.execute(
      'UPDATE account_signup_requests SET attempts = attempts + 1 WHERE id = ?',
      [id]
    );
    throw new SignupError('That verification code is not correct.');
  }

  const pool = requirePool();
  await pool.execute(
    `UPDATE account_signup_requests
     SET status = 'VERIFIED', code_hash = NULL, code_expires_at = NULL, attempts = 0
     WHERE id = ?`,
    [id]
  );
  db.logAudit(
    row.school_id,
    '',
    row.full_name,
    row.role_id,
    'ACCOUNT_SIGNUP_VERIFIED',
    'ACCOUNT_SIGNUP_REQUEST',
    id,
    'Contact verification code accepted.',
    undefined
  );
  return rowToView(await getRequestRow(id));
}

export async function resendSignupCode(requestId: string): Promise<SignupRequestView> {
  const id = clean(requestId, 100);
  const row = await getRequestRow(id);
  if (row.status !== 'PENDING') {
    throw new SignupError('This sign-up request has already been processed.', 409);
  }
  if (row.requires_manual_review || !row.guardian_id) {
    throw new SignupError('This request requires school review instead of a verification code.');
  }

  const code = generateVerificationCode();
  const pool = requirePool();
  await pool.execute(
    `UPDATE account_signup_requests
     SET code_hash = ?, code_expires_at = ?, attempts = 0
     WHERE id = ?`,
    [hashValue(`${id}:${code}`), new Date(Date.now() + CODE_TTL_MS), id]
  );

  const sent = await sendCodeForRow(await getRequestRow(id), code);
  if (!sent) {
    throw new SignupError('The verification message could not be sent. Contact the school.', 503);
  }
  return rowToView(await getRequestRow(id));
}

export async function listSignupRequests(schoolId: string): Promise<SignupRequestView[]> {
  const pool = requirePool();
  const [rows] = await pool.execute<SignupRow[]>(
    `SELECT * FROM account_signup_requests WHERE school_id = ? ORDER BY created_at DESC`,
    [schoolId]
  );
  return rows.map(rowToView);
}

async function createOrReuseJsonUser(params: {
  id: string;
  role: SignupRole;
  email: string;
  fullName: string;
  phone: string;
  preferredLanguage: LanguageCode;
  schoolId: string;
}): Promise<UserProfile> {
  const existing = db.getUserByEmail(params.email);
  if (existing) {
    if (existing.role !== params.role) {
      throw new SignupError('An account with that email address already exists.', 409);
    }
    return existing;
  }

  return db.createUser({
    id: params.id,
    schoolId: params.schoolId,
    email: params.email,
    fullName: params.fullName,
    role: params.role,
    phone: params.phone,
    avatarUrl: '',
    preferredLanguage: params.preferredLanguage,
    isActive: true,
    createdAt: new Date().toISOString()
  });
}

async function ensureMariaDbIdentity(params: {
  id: string;
  schoolId: string;
  role: SignupRole;
  fullName: string;
  email: string;
  phone: string;
  preferredLanguage: LanguageCode;
  passwordHash: string;
}): Promise<{ createdProfile: boolean; createdCredential: boolean }> {
  const pool = requirePool();
  const [profiles] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM user_profiles WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 2',
    [params.id, params.email]
  );
  if (profiles.length > 0 && profiles[0].id !== params.id) {
    throw new SignupError('An account with that email address already exists.', 409);
  }

  let createdProfile = false;
  if (profiles.length === 0) {
    await pool.execute(
      `INSERT INTO user_profiles
        (id, school_id, role_id, full_name, email, phone, preferred_language, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        params.id,
        params.schoolId,
        params.role,
        params.fullName,
        params.email,
        params.phone,
        params.preferredLanguage
      ]
    );
    createdProfile = true;
  }

  const [credentials] = await pool.execute<RowDataPacket[]>(
    'SELECT user_id FROM user_auth_credentials WHERE user_id = ? LIMIT 1',
    [params.id]
  );
  let createdCredential = false;
  if (credentials.length === 0) {
    await pool.execute(
      'INSERT INTO user_auth_credentials (user_id, password_hash) VALUES (?, ?)',
      [params.id, params.passwordHash]
    );
    createdCredential = true;
  }

  return { createdProfile, createdCredential };
}

async function insertMappings(params: {
  userId: string;
  studentId: string;
  guardianId: string | null;
  role: SignupRole;
}): Promise<void> {
  const pool = requirePool();
  await pool.execute(
    `INSERT IGNORE INTO account_student_links (user_id, student_id, scope, is_primary)
     VALUES (?, ?, ?, 1)`,
    [params.userId, params.studentId, params.role]
  );
  if (params.role === 'PARENT' && params.guardianId) {
    await pool.execute(
      'INSERT IGNORE INTO account_guardian_links (user_id, guardian_id) VALUES (?, ?)',
      [params.userId, params.guardianId]
    );
  }
}

function ensureParentJsonLinks(user: UserProfile, studentId: string, guardianId: string): void {
  if (!user.linkedStudentIds) user.linkedStudentIds = [];
  if (!user.linkedStudentIds.includes(studentId)) user.linkedStudentIds.push(studentId);
  if (!user.linkedGuardianIds) user.linkedGuardianIds = [];
  if (!user.linkedGuardianIds.includes(guardianId)) user.linkedGuardianIds.push(guardianId);
}

function createGuardianForApproval(row: SignupRow): Guardian {
  return {
    id: newId('grd'),
    schoolId: row.school_id,
    fullName: row.full_name,
    relationship: 'GUARDIAN',
    phone: row.phone,
    email: row.email || undefined,
    address: '',
    preferredLanguage: 'rw',
    preferredChannel: row.contact_type === 'EMAIL' ? 'EMAIL' : 'SMS',
    isVerified: true,
    canPickup: true,
    emergencyPriority: 1
  };
}

async function ensureMariaDbGuardian(guardian: Guardian): Promise<boolean> {
  const pool = requirePool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM guardians WHERE id = ? LIMIT 1',
    [guardian.id]
  );
  if (rows.length > 0) return false;

  await pool.execute(
    `INSERT INTO guardians
      (id, school_id, full_name, relationship, phone, alt_phone, email, address,
       preferred_language, preferred_channel, is_verified, can_pickup, emergency_priority)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, 1, ?)`,
    [
      guardian.id,
      guardian.schoolId,
      guardian.fullName,
      guardian.relationship,
      guardian.phone,
      guardian.email || null,
      guardian.address || '',
      guardian.preferredLanguage,
      guardian.preferredChannel,
      guardian.emergencyPriority
    ]
  );
  return true;
}

export async function approveSignupRequest(
  requestId: string,
  reviewer: UserProfile,
  notes = ''
): Promise<UserProfile> {
  const row = await getRequestRow(clean(requestId, 100));
  if (row.school_id !== reviewer.schoolId) {
    throw new SignupError('You can only review requests for your own school.', 403);
  }
  const eligible = row.status === 'VERIFIED' || (row.status === 'PENDING' && row.requires_manual_review === 1);
  if (!eligible) {
    throw new SignupError('Only verified or manually reviewable requests can be approved.', 409);
  }

  const requestStudentIds = await getRequestStudentIds(row.id);
  const students = requestStudentIds
    .map(id => db.getStudentById(id))
    .filter((student): student is Student => Boolean(student));
  if (students.length === 0) {
    throw new SignupError('The linked student record is no longer available.', 409);
  }

  const existingJsonUser = db.getUserByEmail(row.email || '');
  if (existingJsonUser && existingJsonUser.role !== row.role_id) {
    throw new SignupError('An account with that email address already exists.', 409);
  }
  await assertEmailAvailable(row.email || '', existingJsonUser?.id);
  for (const student of students) {
    await assertStudentAccountAvailable(student.id, row.role_id);
  }

  const preferredLanguage = existingJsonUser?.preferredLanguage || 'rw';
  const userId = existingJsonUser?.id || newId(row.role_id === 'PARENT' ? 'par' : 'stu');
  let createdProfile = false;
  let createdCredential = false;
  const mappedStudentIds: string[] = [];
  let createdJsonGuardian = false;
  let createdMariaGuardian = false;
  let guardianId: string | null = row.guardian_id;

  try {
    const identity = await ensureMariaDbIdentity({
      id: userId,
      schoolId: row.school_id,
      role: row.role_id,
      fullName: row.full_name,
      email: row.email || '',
      phone: row.phone,
      preferredLanguage,
      passwordHash: row.password_hash
    });
    createdProfile = identity.createdProfile;
    createdCredential = identity.createdCredential;

    if (row.role_id === 'PARENT') {
      let guardian = db.getGuardians(row.school_id).find(item => item.id === guardianId);
      if (!guardian) {
        guardian = createGuardianForApproval(row);
        db.createGuardian(guardian);
        createdJsonGuardian = true;
        guardianId = guardian.id;
      }
      createdMariaGuardian = await ensureMariaDbGuardian(guardian);
    }

    for (const student of students) {
      await insertMappings({ userId, studentId: student.id, guardianId, role: row.role_id });
      mappedStudentIds.push(student.id);
    }

    const user = await createOrReuseJsonUser({
      id: userId,
      role: row.role_id,
      email: row.email || '',
      fullName: row.full_name,
      phone: row.phone,
      preferredLanguage,
      schoolId: row.school_id
    });

    if (row.role_id === 'PARENT' && guardianId) {
      for (const student of students) {
        ensureParentJsonLinks(user, student.id, guardianId);
        const primaryExists = db.getGuardiansForStudent(student.id).some(item => item.link.isPrimary);
        db.createGuardianLink({
          studentId: student.id,
          guardianId,
          relationship: 'GUARDIAN',
          emergencyPriority: 1,
          canPickup: true,
          isPrimary: !primaryExists
        });
      }
    }
    if (row.role_id === 'STUDENT' && !user.studentId) {
      user.studentId = students[0].id;
    }
    db.persist();

    const pool = requirePool();
    await pool.execute(
      `UPDATE account_signup_requests
       SET status = 'APPROVED', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?, guardian_id = ?
       WHERE id = ?`,
      [reviewer.id, clean(notes, 500) || null, guardianId, row.id]
    );
    db.logAudit(
      row.school_id,
      reviewer.id,
      reviewer.fullName,
      reviewer.role,
      'ACCOUNT_SIGNUP_APPROVED',
      'ACCOUNT_SIGNUP_REQUEST',
      row.id,
      `Approved ${row.role_id} account for ${row.full_name}.`,
      undefined
    );
    return user;
  } catch (error) {
    const pool = getMysqlPool();
    if (pool && mappedStudentIds.length > 0) {
      for (const studentId of mappedStudentIds) {
        await pool.execute(
          'DELETE FROM account_student_links WHERE user_id = ? AND student_id = ? AND scope = ?',
          [userId, studentId, row.role_id]
        );
      }
      if (row.role_id === 'PARENT' && guardianId) {
        await pool.execute('DELETE FROM account_guardian_links WHERE user_id = ? AND guardian_id = ?', [userId, guardianId]);
      }
    }
    if (pool && createdMariaGuardian && guardianId) {
      await pool.execute('DELETE FROM guardians WHERE id = ?', [guardianId]);
    }
    if (createdJsonGuardian && guardianId) {
      db.deleteGuardian(guardianId);
    }
    if (pool && createdCredential && createdProfile) {
      await pool.execute('DELETE FROM user_auth_credentials WHERE user_id = ?', [userId]);
    }
    if (pool && createdProfile) {
      await pool.execute('DELETE FROM user_profiles WHERE id = ?', [userId]);
    }
    throw error;
  }
}

export async function rejectSignupRequest(
  requestId: string,
  reviewer: UserProfile,
  notes = ''
): Promise<SignupRequestView> {
  const row = await getRequestRow(clean(requestId, 100));
  if (row.school_id !== reviewer.schoolId) {
    throw new SignupError('You can only review requests for your own school.', 403);
  }
  if (row.status === 'APPROVED') {
    throw new SignupError('An approved request cannot be rejected.', 409);
  }
  const pool = requirePool();
  await pool.execute(
    `UPDATE account_signup_requests
     SET status = 'REJECTED', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
     WHERE id = ?`,
    [reviewer.id, clean(notes, 500) || null, row.id]
  );
  db.logAudit(
    row.school_id,
    reviewer.id,
    reviewer.fullName,
    reviewer.role,
    'ACCOUNT_SIGNUP_REJECTED',
    'ACCOUNT_SIGNUP_REQUEST',
    row.id,
    `Rejected ${row.role_id} sign-up for ${row.full_name}.`,
    undefined
  );
  return rowToView(await getRequestRow(row.id));
}
