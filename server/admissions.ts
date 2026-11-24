import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type {
  AcademicPerformanceData,
  AdmissionApplication,
  AdmissionDocumentCategory,
  ApplicationStatus,
  ApplicationType,
  PreviousAcademicBackground,
  ResultSlipVerificationStatus,
  Senior3ResultsRecord
} from '../src/types';
import { db } from './database';
import { DEFAULT_DOCUMENT_CATEGORIES, documentCategoriesFor, normalizeDocumentCategories } from './admissionConfig';

export const APPLICATION_TYPES: ApplicationType[] = [
  'NEW_STUDENT_SENIOR4',
  'SCHOOL_TRANSFER',
  'OTHER_ADMISSION'
];

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'DOCUMENTS_REQUIRED',
  'ADDITIONAL_INFO_REQUIRED',
  'APPROVED',
  'REJECTED',
  'WAITLISTED'
];

export const REVIEW_DECISION_STATUSES: ApplicationStatus[] = [
  'UNDER_REVIEW',
  'DOCUMENTS_REQUIRED',
  'ADDITIONAL_INFO_REQUIRED',
  'APPROVED',
  'REJECTED',
  'WAITLISTED'
];

export const RESULT_SLIP_VERIFICATION_STATUSES: ResultSlipVerificationStatus[] = [
  'NOT_YET_VERIFIED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'VERIFICATION_FAILED',
  'ADDITIONAL_DOCUMENT_REQUIRED'
];

export const TRANSFER_REASONS = [
  'Family relocation',
  'Moving to another district',
  'Better learning opportunities',
  'Change of school environment',
  'Family circumstances',
  'Academic reasons',
  'Financial circumstances',
  'Other reason'
] as const;

export const DOCUMENT_TYPES: Record<ApplicationType, string[]> = {
  NEW_STUDENT_SENIOR4: ['SENIOR3_RESULTS', 'PREVIOUS_REPORT', 'OTHER'],
  SCHOOL_TRANSFER: ['PREVIOUS_REPORT', 'TRANSFER_LETTER', 'STUDENT_ID', 'OTHER'],
  OTHER_ADMISSION: ['PREVIOUS_REPORT', 'SUPPORTING_DOCUMENT', 'OTHER']
};

const MAX_TEXT = 200_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 8;

export interface AdmissionFormData {
  applicationType: ApplicationType;
  applicantFullName: string;
  applicantDob: string;
  applicantGender?: 'M' | 'F';
  applicantPhone: string;
  applicantEmail?: string;
  applicantDistrict: string;
  applicantSector?: string;
  applicantCell?: string;
  applicantResidence: string;
  guardianFullName: string;
  guardianPhone: string;
  guardianRelationship: string;
  academicYear: string;
  previousSchoolName?: string;
  previousSchoolLocation?: string;
  academicYearCompleted?: string;
  senior3CompletionYear?: string;
  senior3CompletionStatus?: string;
  previousCombination?: string;
  requestedLevel?: string;
  requestedCombination?: string;
  previousAcademicPerformance?: string;
  reasonForChoosingSchool?: string;
  currentSchoolName?: string;
  currentSchoolLocation?: string;
  currentClass?: string;
  currentLevel?: string;
  transferAcademicYear?: string;
  requestedClass?: string;
  previousSchoolType?: string;
  transferReason?: string;
  transferReasonOther?: string;
  currentEducationLevel?: string;
  requestedEducationLevel?: string;
  previousSchoolOther?: string;
  applicationReason?: string;
  academicBackground?: PreviousAcademicBackground;
}

export type ValidationResult =
  | { ok: true; value: AdmissionFormData }
  | { ok: false; errors: string[] };

function cleanString(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string') return '';
  // Remove control characters (including null bytes) that could break storage or CSV export.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function required(
  errors: string[],
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {}
): string {
  const text = cleanString(value, options.max ?? MAX_TEXT);
  if (text.length < (options.min ?? 1)) {
    errors.push(`${label} is required.`);
  }
  return text;
}

function optional(errors: string[], value: unknown, label: string, max = MAX_TEXT): string | undefined {
  const text = cleanString(value, max);
  if (!text) return undefined;
  return text;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('250') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `250${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `250${digits}`;
  return digits;
}

export function isValidPhone(raw: unknown): boolean {
  const normalized = normalizePhone(cleanString(raw, 40));
  return /^2507\d{8}$/.test(normalized) || (normalized.length >= 8 && normalized.length <= 15);
}

export function normalizeContact(raw: unknown): string {
  const value = cleanString(raw, 200).toLowerCase();
  if (value.includes('@')) return value;
  return normalizePhone(value);
}

export function contactMatches(application: AdmissionApplication, rawContact: unknown): boolean {
  const contact = normalizeContact(rawContact);
  if (!contact) return false;
  const candidates = [
    application.applicantPhone,
    application.applicantEmail,
    application.guardianPhone
  ].filter(Boolean) as string[];
  return candidates.some(candidate => normalizeContact(candidate) === contact);
}

function validDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

export function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function validateSubmission(body: unknown, options?: PublicAdmissionOptions): ValidationResult {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: string[] = [];

  // Honeypot: bots fill every field. Real users never see this one.
  if (cleanString(input.website)) {
    return { ok: false, errors: ['Application could not be submitted. Please try again.'] };
  }

  const applicationType = cleanString(input.applicationType, 40);
  if (!APPLICATION_TYPES.includes(applicationType as ApplicationType)) {
    errors.push('Select a valid application type.');
  }

  const applicantFullName = required(errors, input.applicantFullName, 'Full name', { min: 2, max: 120 });
  const applicantDob = required(errors, input.applicantDob, 'Date of birth', { max: 20 });
  if (applicantDob && (!validDate(applicantDob) || new Date(`${applicantDob}T00:00:00Z`) > new Date())) {
    errors.push('Enter a valid date of birth.');
  }
  const applicantPhone = cleanString(input.applicantPhone, 50);
  if (!isValidPhone(applicantPhone)) errors.push('Enter a valid phone number.');

  const applicantEmail = optional(errors, input.applicantEmail, 'Email address', 160);
  if (applicantEmail && !EMAIL_RE.test(applicantEmail)) errors.push('Enter a valid email address.');

  const applicantDistrict = required(errors, input.applicantDistrict, 'District', { min: 2, max: 100 });
  const applicantSector = optional(errors, input.applicantSector, 'Sector', 100);
  const applicantCell = optional(errors, input.applicantCell, 'Cell', 100);
  const applicantResidence = required(errors, input.applicantResidence, 'Current residence', { min: 5, max: 500 });

  const rawGender = cleanString(input.applicantGender, 10);
  const applicantGender = rawGender === 'M' || rawGender === 'F' ? rawGender : undefined;

  // Guardian details are always required — applicants are typically minors.
  const guardianFullName = required(errors, input.guardianFullName, "Parent/guardian's full name", { min: 2, max: 120 });
  const guardianPhone = cleanString(input.guardianPhone, 50);
  if (!isValidPhone(guardianPhone)) errors.push("Enter a valid parent/guardian's phone number.");
  const guardianRelationship = required(errors, input.guardianRelationship, 'Relationship with applicant', { min: 2, max: 60 });

  const academicYearInput = cleanString(input.academicYear, 20);
  const academicYear = /^\d{4}(-\d{2,4})?$/.test(academicYearInput)
    ? academicYearInput
    : currentAcademicYear();

  if (input.confirmAccurate !== 'true' && input.confirmAccurate !== true) {
    errors.push('Confirm that the information provided is accurate.');
  }
  if (input.privacyAccepted !== 'true' && input.privacyAccepted !== true) {
    errors.push('Accept the privacy notice before submitting.');
  }

  const academicBackground = normalizePreviousAcademicBackground(input.academicBackground);
  if (academicBackground) {
    if (
      options?.academicYears.length &&
      academicBackground.academicYearCompleted &&
      !options.academicYears.includes(academicBackground.academicYearCompleted)
    ) {
      errors.push('Select a valid academic year completed.');
    }
    if (academicBackground.seniorCompletionYear && !/^(19|20)\d{2}$/.test(academicBackground.seniorCompletionYear)) {
      errors.push('Enter a valid year of senior completion.');
    }
    if (
      options?.previousCombinations.length &&
      academicBackground.previousCombination &&
      academicBackground.previousCombination !== 'NOT_APPLICABLE' &&
      !options.previousCombinations.some(item => item.name === academicBackground.previousCombination)
    ) {
      errors.push('Select a valid previous combination.');
    }
    if (
      options?.preferredCombinations.length &&
      academicBackground.preferredCombination &&
      !options.preferredCombinations.some(item => item.name === academicBackground.preferredCombination)
    ) {
      errors.push('Select a preferred combination that is open for admission.');
    }
    if (
      options?.grading.grades.length &&
      academicBackground.performanceGrade &&
      !options.grading.grades.some(item => item.grade === academicBackground.performanceGrade)
    ) {
      errors.push('Select a grade from the school’s configured grading scale.');
    }
    if (academicBackground.performanceMarks && !/^\d{1,3}(\.\d{1,2})?$/.test(academicBackground.performanceMarks)) {
      errors.push('Enter performance marks as a number up to 100.');
    }
    if (academicBackground.subjects.some(subject => subject.marks && !/^\d{1,3}(\.\d{1,2})?$/.test(subject.marks))) {
      errors.push('Subject marks must be numbers up to 100.');
    }
  }

  const value: AdmissionFormData = {
    applicationType: applicationType as ApplicationType,
    applicantFullName,
    applicantDob,
    applicantGender,
    applicantPhone,
    applicantEmail,
    applicantDistrict,
    applicantSector,
    applicantCell,
    applicantResidence,
    guardianFullName,
    guardianPhone,
    guardianRelationship,
    academicYear,
    academicBackground
  };

  if (applicationType === 'NEW_STUDENT_SENIOR4') {
    value.previousSchoolName = required(errors, input.previousSchoolName || input.previousSchool, 'Previous school name', { min: 2, max: 180 });
    value.previousSchoolLocation = required(errors, input.previousSchoolLocation, 'Previous school location', { min: 2, max: 180 });
    value.previousAcademicPerformance = optional(errors, input.previousAcademicPerformance, 'Previous academic performance', 1000);
    value.reasonForChoosingSchool = required(errors, input.reasonForChoosingSchool, 'Reason for choosing our school', { min: 10, max: 2000 });
  } else if (applicationType === 'SCHOOL_TRANSFER') {
    value.currentSchoolName = required(errors, input.currentSchoolName, 'Current school name', { min: 2, max: 180 });
    value.currentSchoolLocation = required(errors, input.currentSchoolLocation, 'Current school location', { min: 2, max: 180 });
    value.currentClass = required(errors, input.currentClass, 'Current class', { min: 1, max: 60 });
    value.currentLevel = required(errors, input.currentLevel, 'Current level', { min: 1, max: 60 });
    value.transferAcademicYear = required(errors, input.transferAcademicYear, 'Academic year', { min: 4, max: 20 });
    value.requestedClass = required(errors, input.requestedClass, 'Requested class at our school', { min: 1, max: 60 });
    value.previousSchoolType = optional(errors, input.previousSchoolType, 'Previous school type', 100);
    value.transferReason = required(errors, input.transferReason, 'Reason for transferring', { min: 3, max: 100 });
    if (value.transferReason && !(TRANSFER_REASONS as readonly string[]).includes(value.transferReason)) {
      errors.push('Select a valid transfer reason.');
    }
    if (value.transferReason === 'Other reason') {
      value.transferReasonOther = required(errors, input.transferReasonOther, 'Please explain the transfer reason', { min: 5, max: 2000 });
    }
  } else if (applicationType === 'OTHER_ADMISSION') {
    // Removed fields (currentEducationLevel, requestedEducationLevel, previousSchool, applicationReason)
    // are intentionally not required/submitted. Preserve stored values in DB for historical records.
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * Normalizes academic data without ever filling in a missing value.
 * Marks/grades are kept as printed strings so unknown grading scales are never recalculated.
 */
export function normalizeAcademicPerformance(raw: unknown): AcademicPerformanceData {
  const source = typeof raw === 'string' ? parseJsonObject(raw) : raw;
  const input = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const subjectsInput = Array.isArray(input.subjects) ? input.subjects.slice(0, 25) : [];
  const subjects = subjectsInput
    .map(item => {
      const subject = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        name: cleanString(subject.name, 160),
        marks: cleanString(subject.marks, 40) || undefined,
        grade: cleanString(subject.grade, 40) || undefined
      };
    })
    .filter(subject => Boolean(subject.name || subject.marks || subject.grade));

  return {
    studentName: cleanString(input.studentName, 160) || undefined,
    examinationYear: cleanString(input.examinationYear, 20) || undefined,
    subjects,
    total: cleanString(input.total, 40) || undefined,
    aggregate: cleanString(input.aggregate, 40) || undefined,
    division: cleanString(input.division, 80) || undefined
  };
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

export function hasActualAcademicData(data?: AcademicPerformanceData): boolean {
  if (!data) return false;
  const hasSubject = data.subjects.some(subject => Boolean(subject.name && (subject.marks || subject.grade)));
  return Boolean(hasSubject || data.total || data.aggregate || data.division);
}

/**
 * Normalizes the structured academic-background object. Values are cleaned but
 * never invented: an empty field stays empty and no grading scheme is inferred.
 */
export function normalizePreviousAcademicBackground(raw: unknown): PreviousAcademicBackground | undefined {
  const source = typeof raw === 'string' ? parseJsonObject(raw) : raw;
  const input = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const performance = normalizeAcademicPerformance({
    subjects: input.subjects,
    total: input.performanceMarks,
    division: input.performanceGrade
  });
  const academicYearCompleted = cleanString(input.academicYearCompleted, 20);
  const seniorCompletionYear = cleanString(input.seniorCompletionYear, 4);
  const previousCombination = cleanString(input.previousCombination, 180);
  const preferredCombination = cleanString(input.preferredCombination, 180);
  const performanceMarks = cleanString(input.performanceMarks, 40);
  const performanceGrade = cleanString(input.performanceGrade, 40);
  const performanceDescription = cleanString(input.performanceDescription, 1000);
  const previousSchoolName = cleanString(input.previousSchoolName, 180);
  const previousSchoolLocation = cleanString(input.previousSchoolLocation, 180);
  const previousClassOrLevel = cleanString(input.previousClassOrLevel, 100);
  const schoolIdentification = cleanString(input.schoolIdentification, 100);
  const subjects = performance.subjects.map((subject, index) => ({
    id: cleanString(subject.id, 100) || `sub-${index + 1}`,
    name: subject.name,
    marks: subject.marks,
    grade: subject.grade
  }));

  const hasData = Boolean(
    academicYearCompleted ||
      seniorCompletionYear ||
      previousCombination ||
      preferredCombination ||
      performanceMarks ||
      performanceGrade ||
      performanceDescription ||
      previousSchoolName ||
      previousSchoolLocation ||
      previousClassOrLevel ||
      schoolIdentification ||
      subjects.length > 0
  );
  if (!hasData) return undefined;

  return {
    academicYearCompleted: academicYearCompleted || undefined,
    seniorCompletionYear: /^(19|20)\d{2}$/.test(seniorCompletionYear) ? seniorCompletionYear : undefined,
    previousCombination: previousCombination || undefined,
    preferredCombination: preferredCombination || undefined,
    performanceMarks: performanceMarks || undefined,
    performanceGrade: performanceGrade || undefined,
    performanceDescription: performanceDescription || undefined,
    previousSchoolName: previousSchoolName || undefined,
    previousSchoolLocation: previousSchoolLocation || undefined,
    previousClassOrLevel: previousClassOrLevel || undefined,
    schoolIdentification: schoolIdentification || undefined,
    subjects
  };
}

export interface PublicAdmissionOption {
  id: string;
  name: string;
  code?: string;
}

export interface PublicAdmissionGrading {
  name?: string;
  passMark?: number;
  grades: Array<{ grade: string; description?: string; minPercentage: number; maxPercentage: number }>;
}

export interface PublicAdmissionOptions {
  academicYears: string[];
  previousCombinations: PublicAdmissionOption[];
  preferredCombinations: PublicAdmissionOption[];
  documentCategories: AdmissionDocumentCategory[];
  grading: PublicAdmissionGrading;
}

/**
 * Loads real configuration from the existing academic-year and combination
 * modules. Preferred combinations are limited to ACTIVE, non-archived records
 * that still have capacity; inactive and archived programmes are never exposed.
 */
export function getPublicAdmissionOptions(school?: { id?: string }): PublicAdmissionOptions {
  const schoolId = school?.id;
  const years = schoolId ? db.getAcademicCollection<any>('academicYears', schoolId) : [];
  const combinations = schoolId ? db.getAcademicCollection<any>('combinations', schoolId) : [];
  const students = schoolId ? db.getStudents(schoolId) : [];
  const scales = schoolId ? db.getAcademicCollection<any>('gradingScales', schoolId) : [];
  const academicSettings = schoolId ? db.getAcademicCollection<any>('academicSettings', schoolId)[0] : undefined;
  const scale =
    scales.find(item => item.id === academicSettings?.gradingScaleId) ??
    scales.find(item => item.isActive) ??
    scales[0];
  const academicYears = years
    .map(item => cleanString(item.name, 20))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  const previousCombinations = combinations.map(item => ({
    id: cleanString(item.id, 60),
    name: cleanString(item.name, 180),
    code: cleanString(item.code, 60) || undefined
  }));

  const preferredCombinations = combinations
    .filter(item => cleanString(item.status, 20).toUpperCase() === 'ACTIVE' && !item.archivedAt)
    .filter(item => {
      const capacity = Number(item.maxCapacity);
      if (!Number.isFinite(capacity) || capacity <= 0) return true;
      const enrolled = students.filter(student =>
        student.combinationId ? student.combinationId === item.id : student.combination === item.name
      ).length;
      return enrolled < capacity;
    })
    .map(item => ({
      id: cleanString(item.id, 60),
      name: cleanString(item.name, 180),
      code: cleanString(item.code, 60) || undefined
    }));

  const grading: PublicAdmissionGrading = {
    name: cleanString(scale?.name, 120) || undefined,
    passMark: Number.isFinite(Number(scale?.passMark)) ? Number(scale.passMark) : undefined,
    grades: Array.isArray(scale?.gradeBoundaries)
      ? scale.gradeBoundaries.map((boundary: any) => ({
          grade: cleanString(boundary?.grade, 40),
          description: cleanString(boundary?.description, 160) || undefined,
          minPercentage: Number(boundary?.minPercentage),
          maxPercentage: Number(boundary?.maxPercentage)
        })).filter((item: { grade: string; minPercentage: number; maxPercentage: number }) =>
          item.grade && Number.isFinite(item.minPercentage) && Number.isFinite(item.maxPercentage)
        )
      : []
  };

  return {
    academicYears: academicYears.length > 0 ? academicYears : [currentAcademicYear()],
    previousCombinations,
    preferredCombinations,
    documentCategories: DEFAULT_DOCUMENT_CATEGORIES.map(category => ({ ...category })),
    grading
  };
}

export function configuredDocumentTypes(type: ApplicationType): string[] {
  const settings = normalizeDocumentCategories(db.getAdmissionSettings().documentCategories);
  return documentCategoriesFor(settings, type).map(category => category.key);
}

interface Senior3ResultsOptions {
  documentId?: string;
  resultSlipUploaded: boolean;
  slipWaived?: boolean;
  slipExceptionNote?: string;
  ocrStatus: Senior3ResultsRecord['ocrStatus'];
  ocrMessage?: string;
  ocrAt?: string;
  extracted?: AcademicPerformanceData;
  applicantReviewed?: AcademicPerformanceData;
}

export function buildSenior3ResultsRecord(
  data: AdmissionFormData,
  applicationId: string,
  options: Senior3ResultsOptions
): Senior3ResultsRecord {
  const now = new Date().toISOString();
  return {
    applicationId,
    documentId: options.documentId,
    resultSlipUploaded: options.resultSlipUploaded,
    slipWaived: options.slipWaived,
    slipExceptionNote: options.slipExceptionNote,
    previousSchoolName: data.previousSchoolName,
    academicYearCompleted: data.academicYearCompleted,
    senior3CompletionYear: data.senior3CompletionYear,
    previousSchoolLocation: data.previousSchoolLocation,
    requestedLevel: data.requestedLevel,
    requestedCombination: data.requestedCombination,
    ocrStatus: options.ocrStatus,
    ocrMessage: options.ocrMessage,
    ocrAt: options.ocrAt,
    extracted: options.extracted,
    applicantReviewed: options.applicantReviewed,
    verificationStatus: 'NOT_YET_VERIFIED',
    verificationHistory: [],
    createdAt: now,
    updatedAt: now
  };
}

let referenceLock: Promise<void> = Promise.resolve();

export async function nextReferenceNumber(): Promise<string> {
  const run = async () => {
    const year = new Date().getUTCFullYear();
    const prefix = `SC-${year}-`;
    const used = db
      .getAdmissions()
      .map(item => item.referenceNumber)
      .filter(ref => ref.startsWith(prefix));
    let sequence = used.reduce((max, ref) => {
      const parsed = Number.parseInt(ref.slice(prefix.length), 10);
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    let reference = '';
    do {
      sequence += 1;
      reference = `${prefix}${String(sequence).padStart(5, '0')}`;
    } while (used.includes(reference));
    return reference;
  };

  const result = referenceLock.then(run, run);
  referenceLock = result.then(() => undefined, () => undefined);
  return result;
}

export function buildApplication(
  data: AdmissionFormData,
  schoolId: string,
  referenceNumber: string
): AdmissionApplication {
  return {
    ...data,
    id: `app-${crypto.randomUUID()}`,
    referenceNumber,
    schoolId,
    applicationType: data.applicationType,
    status: 'SUBMITTED',
    academicYear: data.academicYear,
    submittedAt: new Date().toISOString(),
    documents: [],
    reviewHistory: [],
    statusHistory: [],
    documentAccessHistory: [],
    reviewDecisions: []
  };
}

export function trackingSecret(): string {
  const configured = process.env.ADMISSION_TRACKING_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!configured || configured.length < 32) {
      throw new Error('ADMISSION_TRACKING_SECRET must be at least 32 characters in production.');
    }
    return configured;
  }
  // Development/test fallback only. Production startup refuses to use it.
  return configured || 'schoolcare-admissions-local-secret';
}

export function hashValue(value: string): string {
  return crypto.createHmac('sha256', trackingSecret()).update(value).digest('hex');
}

export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function assertSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  const allowed = new Set<string>([`http://${req.headers.host}`, `https://${req.headers.host}`]);
  if (process.env.APP_URL) {
    allowed.add(process.env.APP_URL.replace(/\/$/, ''));
  }
  if (!allowed.has(origin)) {
    res.status(403).json({ error: 'This request is not allowed.' });
    return;
  }
  next();
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  prefix: string;
  /** Optional stable key override for endpoints without a public reference number. */
  keyFrom?: (req: Request, prefix: string) => string;
}

export function createRateLimiter({ windowMs, max, prefix, keyFrom }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyFrom
      ? keyFrom(req, prefix)
      : `${prefix}:${req.ip}:${cleanString(req.body?.referenceNumber, 60)}`;
    const current = hits.get(key);
    if (current && current.resetAt > now) {
      if (current.count >= max) {
        res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
        res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        return;
      }
      current.count += 1;
    } else {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    }
    if (hits.size > 5000) {
      for (const [entryKey, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(entryKey);
      }
    }
    next();
  };
}

export function getAllowedDocumentTypes(type: ApplicationType): string[] {
  const configured = configuredDocumentTypes(type);
  return configured.length > 0 ? configured : DOCUMENT_TYPES[type] ?? [];
}

export function isValidUpload(file: Express.Multer.File, allowedTypes: string[]): boolean {
  if (!allowedTypes.includes(file.fieldname)) return false;
  if (file.size > MAX_FILE_BYTES || file.size === 0) return false;
  const mime = file.mimetype.toLowerCase();
  const buffer = file.buffer;
  if (mime === 'application/pdf') {
    return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  }
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
}

export const UPLOAD_LIMITS = { maxFileBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES };
