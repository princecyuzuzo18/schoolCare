/**
 * End-to-end verification for the Part A admissions workflows.
 *
 * Uses an isolated JSON store and upload directory so no real application data
 * is touched. MariaDB mirrors are intentionally skipped (DB_PORT is unusable),
 * and notification providers are disabled to avoid external network calls.
 *
 * Run with: npm run test:admissions
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Response as ExpressResponse } from 'express';

type Check = { name: string; passed: boolean; detail?: string };
type ApiResult = { status: number; body: any };

const checks: Check[] = [];
function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-admissions-test-'));
const uploadRoot = mkdtempSync(path.join(tempDir, 'uploads-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';
// The test issues more submissions than the production per-IP limit. Trust a
// forwarded test IP so each request gets its own rate-limit bucket.
process.env.TRUST_PROXY = '1';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_CONNECT_TIMEOUT_MS = '200';
process.env.ADMISSION_UPLOAD_DIR = uploadRoot;
// dotenv does not override an existing key, so these keep notifications offline.
process.env.SMTP_HOST = '';
process.env.SMTP_FROM = '';
process.env.SMS_GATEWAY_URL = '';
process.env.SMS_API_KEY = '';
process.env.ADMISSIONS_NOTIFICATION_EMAILS = '';
// Keep OCR offline; the upload itself must still succeed without extraction.
process.env.GEMINI_API_KEY = '';

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');
  const { db } = await import('../server/database');
  const { createSession } = await import('../server/sessions');
  const { hashValue } = await import('../server/admissions');
  const { DEFAULT_DOCUMENT_CATEGORIES } = await import('../server/admissionConfig');

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  function cookieFor(userId: string): string {
    const headers: Record<string, string> = {};
    createSession(userId, {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
      }
    } as unknown as ExpressResponse);
    return (headers['Set-Cookie'] || '').split(';')[0];
  }

  let testRequestCount = 0;
  async function request(apiPath: string, options: RequestInit = {}): Promise<ApiResult> {
    const headers = new Headers(options.headers);
    headers.set('X-Forwarded-For', `127.0.1.${(testRequestCount++ % 200) + 1}`);
    const response = await fetch(`${base}${apiPath}`, { ...options, headers });
    const text = await response.text();
    let body: any = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: response.status, body };
  }

  function rawRequest(apiPath: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${base}${apiPath}`, options);
  }

  function jsonOptions(method: string, payload: unknown, cookie?: string): RequestInit {
    return {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
  }

  function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  const head = cookieFor('user-super-admin');
  const parent = cookieFor('user-parent');
  const teacher = cookieFor('user-teacher');
  const staffUser = db.getUserById('user-super-admin')!;
  const staffRole = staffUser.role;
  const schoolId = 'school-es-rubengera-01';

  // 1. Public settings must be built from the school's real academic configuration.
  const initialSettingsResult = await request('/api/public/admissions/settings');
  const initialSettings = initialSettingsResult.body ?? {};
  check('Public admissions settings load without a session',
    initialSettingsResult.status === 200 && typeof initialSettings === 'object',
    `status=${initialSettingsResult.status}`);

  const seededYears = db.getAcademicCollection<any>('academicYears', schoolId)
    .map((item: any) => item.name).filter(Boolean);
  const seededCombinations = db.getAcademicCollection<any>('combinations', schoolId);
  const seededScales = db.getAcademicCollection<any>('gradingScales', schoolId);
  const seededScale = seededScales.find((item: any) => item.isActive) ?? seededScales[0];
  const seededGrades = (seededScale?.gradeBoundaries ?? []).map((item: any) => item.grade).filter(Boolean);
  const archivedCombinationNames = seededCombinations
    .filter((item: any) => item.status !== 'ACTIVE' || item.archivedAt)
    .map((item: any) => item.name);

  check('Public settings expose seeded academic years',
    initialSettingsResult.status === 200 && seededYears.length > 0 &&
      Array.isArray(initialSettings.academicYears) &&
      seededYears.every((name: string) => initialSettings.academicYears.includes(name)),
    `years=${initialSettings.academicYears?.length}`);
  check('Public settings expose seeded previous combinations',
    initialSettingsResult.status === 200 && seededCombinations.length > 0 &&
      Array.isArray(initialSettings.previousCombinations) &&
      initialSettings.previousCombinations.length === seededCombinations.length &&
      seededCombinations.every((item: any) =>
        initialSettings.previousCombinations.some((option: any) => option.name === item.name && option.id === item.id)),
    `combinations=${initialSettings.previousCombinations?.length}`);
  check('Public settings expose only open preferred combinations',
    initialSettingsResult.status === 200 && Array.isArray(initialSettings.preferredCombinations) &&
      initialSettings.preferredCombinations.length > 0 &&
      initialSettings.preferredCombinations.every((option: any) =>
        !archivedCombinationNames.includes(option.name) &&
        initialSettings.previousCombinations.some((previous: any) => previous.name === option.name)),
    `preferred=${initialSettings.preferredCombinations?.length}`);
  check('Public settings expose the seeded grading scale',
    initialSettingsResult.status === 200 && seededGrades.length > 0 &&
      Array.isArray(initialSettings.grading?.grades) &&
      seededGrades.every((grade: string) =>
        initialSettings.grading.grades.some((entry: any) => entry.grade === grade)) &&
      Number.isFinite(initialSettings.grading?.passMark),
    `grades=${initialSettings.grading?.grades?.length}`);
  check('Public settings expose seeded document categories',
    initialSettingsResult.status === 200 && Array.isArray(initialSettings.documentCategories) &&
      ['ACADEMIC_TRANSCRIPT', 'PREVIOUS_REPORT'].every(key =>
        initialSettings.documentCategories.some((category: any) => category.key === key)),
    `categories=${initialSettings.documentCategories?.length}`);

  // 2. Staff configure document categories; the result slip cannot be waived.
  const configuredCategories = DEFAULT_DOCUMENT_CATEGORIES.map(category => ({
    key: category.key,
    label: category.label,
    active: category.active,
    applicationTypes: category.applicationTypes ? [...category.applicationTypes] : undefined
  }));
  configuredCategories.push({
    key: 'TRANSCRIPT_ATTESTATION',
    label: 'Transcript attestation letter',
    active: true,
    applicationTypes: ['NEW_STUDENT_SENIOR4']
  });
  const settingsPatch = {
    // Legacy clients may still send a waiver; the server must ignore it.
    resultSlipRequired: false,
    resultSlipExceptionNote: 'Waived for the Part A admissions verification run.',
    documentCategories: configuredCategories
  };
  const patchedSettings = await request('/api/admissions/settings',
    jsonOptions('PATCH', settingsPatch, head));
  check('Staff cannot waive the Senior 3 result slip requirement',
    patchedSettings.status === 200 && patchedSettings.body.resultSlipRequired === true &&
      !patchedSettings.body.resultSlipExceptionNote,
    `status=${patchedSettings.status}`);
  check('Staff can still configure document categories',
    patchedSettings.status === 200 &&
      patchedSettings.body.documentCategories?.some((category: any) =>
        category.key === 'TRANSCRIPT_ATTESTATION' && category.label === 'Transcript attestation letter'),
    `status=${patchedSettings.status}`);

  const configuredPublic = await request('/api/public/admissions/settings');
  check('Public settings keep the result slip mandatory and expose configured categories',
    configuredPublic.status === 200 && configuredPublic.body.resultSlipRequired === true &&
      !configuredPublic.body.resultSlipExceptionNote &&
      configuredPublic.body.documentCategories?.some((category: any) =>
        category.key === 'TRANSCRIPT_ATTESTATION' &&
        category.label === 'Transcript attestation letter' &&
        category.applicationTypes?.includes('NEW_STUDENT_SENIOR4')),
    `status=${configuredPublic.status}`);
  check('Previous school report is available for Other Admission',
    configuredPublic.body.documentCategories?.some((category: any) =>
      category.key === 'PREVIOUS_REPORT' && category.active === true &&
      category.applicationTypes?.includes('OTHER_ADMISSION')),
    `status=${configuredPublic.status}`);

  // 6 (role check). Parent and teacher accounts have no admissions access.
  for (const [label, cookie] of [['Parent', parent], ['Teacher', teacher]] as Array<[string, string]>) {
    for (const endpoint of ['/api/admissions/applications', '/api/admissions/settings', '/api/admissions/export']) {
      const denied = await request(endpoint, { headers: { Cookie: cookie } });
      check(`${label} account is denied ${endpoint}`, denied.status === 403, `status=${denied.status}`);
    }
  }

  // 3. Public document uploads: format magic bytes, category rules, preview and removal.
  const pdfBytes = new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
  );
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
  ]);
  const jpgBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    0x00, 0x01, 0x02, 0x00, 0x00, 0x64, 0x00, 0x64, 0x00, 0x00, 0xff, 0xd9
  ]);

  function documentForm(
    documentType: string,
    bytes: Uint8Array,
    mime: string,
    fileName: string,
    applicationType = 'NEW_STUDENT_SENIOR4'
  ): FormData {
    const form = new FormData();
    form.append('applicationType', applicationType);
    form.append('documentType', documentType);
    const blobBytes = bytes.slice().buffer as ArrayBuffer;
    form.append('document', new Blob([blobBytes], { type: mime }), fileName);
    return form;
  }

  const pdfUpload = await request('/api/public/admissions/documents', {
    method: 'POST', body: documentForm('ACADEMIC_TRANSCRIPT', pdfBytes, 'application/pdf', 'transcript.pdf')
  });
  const pdfToken = pdfUpload.body?.uploadToken ?? '';
  check('Public upload accepts a PDF transcript with a one-time token',
    pdfUpload.status === 201 && /^[a-f0-9]{64}$/.test(pdfToken) &&
      pdfUpload.body.documentType === 'ACADEMIC_TRANSCRIPT' && pdfUpload.body.fileSize === pdfBytes.length,
    `status=${pdfUpload.status}`);

  const pngUpload = await request('/api/public/admissions/documents', {
    method: 'POST', body: documentForm('PREVIOUS_REPORT', pngBytes, 'image/png', 'previous-report.png')
  });
  check('Public upload accepts PNG magic bytes for an allowed category',
    pngUpload.status === 201 && /^[a-f0-9]{64}$/.test(pngUpload.body?.uploadToken ?? '') &&
      pngUpload.body.fileMime === 'image/png', `status=${pngUpload.status}`);

  const jpgUpload = await request('/api/public/admissions/documents', {
    method: 'POST', body: documentForm('ACADEMIC_TRANSCRIPT', jpgBytes, 'image/jpeg', 'transcript.jpg')
  });
  check('Public upload accepts JPG magic bytes for an allowed category',
    jpgUpload.status === 201 && /^[a-f0-9]{64}$/.test(jpgUpload.body?.uploadToken ?? '') &&
      jpgUpload.body.fileMime === 'image/jpeg', `status=${jpgUpload.status}`);

  const otherReportUpload = await request('/api/public/admissions/documents', {
    method: 'POST',
    body: documentForm('PREVIOUS_REPORT', pngBytes, 'image/png', 'other-previous-report.png', 'OTHER_ADMISSION')
  });
  const otherReportToken = otherReportUpload.body?.uploadToken ?? '';
  check('Other Admission accepts a previous school report',
    otherReportUpload.status === 201 && /^[a-f0-9]{64}$/.test(otherReportToken),
    `status=${otherReportUpload.status}`);

  const unknownCategory = await request('/api/public/admissions/documents', {
    method: 'POST', body: documentForm('UNLISTED_CATEGORY', pdfBytes, 'application/pdf', 'transcript.pdf')
  });
  check('Public upload rejects an unconfigured document type', unknownCategory.status === 400,
    `status=${unknownCategory.status}`);

  const wrongApplicationCategory = await request('/api/public/admissions/documents', {
    method: 'POST', body: documentForm('TRANSFER_LETTER', pdfBytes, 'application/pdf', 'transfer.pdf')
  });
  check('Public upload rejects a category not allowed for the application type',
    wrongApplicationCategory.status === 400, `status=${wrongApplicationCategory.status}`);

  const invalidContent = await request('/api/public/admissions/documents', {
    method: 'POST',
    body: documentForm('ACADEMIC_TRANSCRIPT', new TextEncoder().encode('this is not a pdf'),
      'application/pdf', 'broken.pdf')
  });
  check('Public upload rejects file content that does not match the PDF magic bytes',
    invalidContent.status === 400, `status=${invalidContent.status}`);

  const documentDir = path.join(uploadRoot, '.documents');
  const storedDocumentNames = existsSync(documentDir) ? readdirSync(documentDir) : [];
  const storedPdfName = storedDocumentNames.find(name => name.endsWith('.pdf'));
  check('Uploaded bytes are written under ADMISSION_UPLOAD_DIR',
    Boolean(storedPdfName) && existsSync(path.join(documentDir, storedPdfName!)) &&
      new TextDecoder().decode(readFileSync(path.join(documentDir, storedPdfName!)).subarray(0, 5)) === '%PDF-',
    `dir=${documentDir}`);

  function slipForm(bytes: Uint8Array, mime: string, fileName: string): FormData {
    const form = new FormData();
    form.append('resultSlip', new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }), fileName);
    return form;
  }

  const slipUpload = await request('/api/public/admissions/result-slips', {
    method: 'POST', body: slipForm(pdfBytes, 'application/pdf', 'senior3-results.pdf')
  });
  const slipToken = slipUpload.body?.uploadToken ?? '';
  const otherSlipUpload = await request('/api/public/admissions/result-slips', {
    method: 'POST', body: slipForm(pdfBytes, 'application/pdf', 'other-results-slip.pdf')
  });
  const otherSlipToken = otherSlipUpload.body?.uploadToken ?? '';
  check('Public result slip uploads return one-time tokens',
    slipUpload.status === 201 && otherSlipUpload.status === 201 &&
      /^[a-f0-9]{64}$/.test(slipToken) && /^[a-f0-9]{64}$/.test(otherSlipToken),
    `statuses=${slipUpload.status}/${otherSlipUpload.status}`);

  async function freshSlipToken(): Promise<string> {
    const upload = await request('/api/public/admissions/result-slips', {
      method: 'POST', body: slipForm(pdfBytes, 'application/pdf', 'senior3-results.pdf')
    });
    if (upload.status !== 201 || typeof upload.body?.uploadToken !== 'string') {
      throw new Error(`Result slip upload failed with status ${upload.status}`);
    }
    return upload.body.uploadToken;
  }

  const publicPreview = await rawRequest('/api/public/admissions/documents/preview',
    jsonOptions('POST', { uploadToken: pdfToken }));
  const previewBytes = new Uint8Array(await publicPreview.arrayBuffer());
  check('Public preview streams the original bytes inline',
    publicPreview.status === 200 && bytesEqual(previewBytes, pdfBytes) &&
      (publicPreview.headers.get('content-type') || '').includes('application/pdf') &&
      (publicPreview.headers.get('content-disposition') || '').includes('inline'),
    `status=${publicPreview.status}`);

  const removed = await request('/api/public/admissions/documents/remove',
    jsonOptions('POST', { uploadToken: pngUpload.body?.uploadToken }));
  const previewAfterRemove = await rawRequest('/api/public/admissions/documents/preview',
    jsonOptions('POST', { uploadToken: pngUpload.body?.uploadToken }));
  check('Public removal invalidates the upload token',
    removed.status === 200 && removed.body.removed === true && previewAfterRemove.status === 404,
    `remove=${removed.status} preview=${previewAfterRemove.status}`);

  // 4. Public application submission with a structured academic background and a document token.
  const preferredCombination =
    initialSettings.preferredCombinations.find((option: any) =>
      option.name !== initialSettings.previousCombinations[0]?.name)?.name ??
    initialSettings.preferredCombinations[0].name;
  const performanceGrade = initialSettings.grading.grades.find((entry: any) => entry.grade === 'A')?.grade ??
    initialSettings.grading.grades[0].grade;
  const validBackground = {
    academicYearCompleted: initialSettings.academicYears[0],
    seniorCompletionYear: '2025',
    previousCombination: initialSettings.previousCombinations[0].name,
    preferredCombination,
    performanceMarks: '82',
    performanceGrade,
    performanceDescription: 'Completed Senior 3 with consistent results.',
    previousSchoolName: 'Groupe Scolaire Kigali',
    previousSchoolLocation: 'Kigali, Rwanda',
    previousClassOrLevel: 'Senior 3',
    schoolIdentification: 'S3-2025-041',
    subjects: [
      { name: 'Mathematics', marks: '88', grade: 'A' },
      { name: 'English', marks: '79', grade: 'B' }
    ]
  };
  const validPayload: Record<string, unknown> = {
    applicationType: 'NEW_STUDENT_SENIOR4',
    applicantFullName: 'Aline Uwimana',
    applicantDob: '2009-04-12',
    applicantPhone: '+250 788 123 456',
    applicantDistrict: 'Gasabo',
    applicantSector: 'Remera',
    applicantResidence: 'Kigali, Gasabo, Remera',
    guardianFullName: 'Jean Uwimana',
    guardianPhone: '+250 789 654 321',
    guardianRelationship: 'Parent',
    previousSchoolName: 'Groupe Scolaire Kigali',
    previousSchoolLocation: 'Kigali, Rwanda',
    reasonForChoosingSchool: 'The school has strong TVET programmes and experienced teachers.',
    academicYear: String(initialSettings.academicYears[0]).replace(/\s+/g, ''),
    confirmAccurate: true,
    privacyAccepted: true,
    academicBackground: validBackground,
    resultSlipToken: slipToken,
    documentTokens: [{ key: 'ACADEMIC_TRANSCRIPT', token: pdfToken }]
  };

  let submissionFormCount = 0;
  async function submissionForm(overrides: Record<string, unknown> = {}): Promise<FormData> {
    const payload = { ...validPayload, ...overrides };
    // Tokens are single-use; every attempted submission needs a fresh slip.
    if (!('resultSlipToken' in overrides)) payload.resultSlipToken = await freshSlipToken();
    // Keep each attempted submission in its own rate-limit bucket. The public
    // submission handler generates the real reference number and ignores this.
    payload.referenceNumber = `verification-${++submissionFormCount}`;
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    return form;
  }

  function backgroundWith(patch: Record<string, unknown>): Record<string, unknown> {
    return { ...validBackground, ...patch };
  }

  const missingSlipSubmission = await request('/api/public/admissions/applications', {
    method: 'POST', body: await submissionForm({ resultSlipToken: undefined })
  });
  check('New Senior 4 submission without a result slip is rejected',
    missingSlipSubmission.status === 400 &&
      String(missingSlipSubmission.body?.error ?? '').includes('result slip'),
    `status=${missingSlipSubmission.status}`);

  const submission = await request('/api/public/admissions/applications', {
    method: 'POST', body: await submissionForm()
  });
  const applicationId = submission.body?.applicationId ?? '';
  const referenceNumber = submission.body?.referenceNumber ?? '';
  check('Public application submission succeeds with structured academic data and a document token',
    submission.status === 201 && /^SC-\d{4}-\d{5}$/.test(referenceNumber) &&
      submission.body.applicationStatus === 'SUBMITTED' && submission.body.resultSlipUploaded === true,
    `status=${submission.status} reference=${referenceNumber}`);

  const consumedUpload = db.getAdmissionDocumentUploadByTokenHash(hashValue(pdfToken));
  check('Submission consumes the temporary document upload',
    Boolean(consumedUpload?.consumedAt && consumedUpload.applicationId === applicationId &&
      consumedUpload.documentId), consumedUpload?.consumedAt);

  const otherSubmission = await request('/api/public/admissions/applications', {
    method: 'POST',
    body: await submissionForm({
      applicationType: 'OTHER_ADMISSION',
      resultSlipToken: otherSlipToken,
      documentTokens: [{ key: 'PREVIOUS_REPORT', token: otherReportToken }]
    })
  });
  const otherApplicationId = otherSubmission.body?.applicationId ?? '';
  const otherApplication = db.getAdmissions().find(item => item.id === otherApplicationId);
  check('Other Admission accepts both a result slip and a previous school report',
    otherSubmission.status === 201 && otherSubmission.body?.resultSlipUploaded === true &&
      otherApplication?.documents.some((item: any) => item.documentType === 'PREVIOUS_REPORT') === true &&
      otherApplication?.senior3Results?.resultSlipUploaded === true,
    `status=${otherSubmission.status}`);

  const removedBackgroundFields = new Set([
    'academicYearCompleted',
    'seniorCompletionYear',
    'previousCombination',
    'preferredCombination'
  ]);
  const minimalBackground = Object.fromEntries(
    Object.entries(validBackground).filter(([key]) => !removedBackgroundFields.has(key))
  );
  const minimalSubmission = await request('/api/public/admissions/applications', {
    method: 'POST',
    body: await submissionForm({ academicBackground: minimalBackground, documentTokens: [] })
  });
  check('Public application submission succeeds without removed Senior 3 fields',
    minimalSubmission.status === 201 && /^SC-\d{4}-\d{5}$/.test(minimalSubmission.body?.referenceNumber ?? ''),
    `status=${minimalSubmission.status} reference=${minimalSubmission.body?.referenceNumber ?? ''}`);

  // 5. Invalid academic-background values are rejected with HTTP 400.
  const invalidCases: Array<{ name: string; patch: Record<string, unknown> }> = [
    { name: 'an unconfigured academic year completed', patch: { academicYearCompleted: '1999 - 2000' } },
    { name: 'an unknown previous combination', patch: { previousCombination: 'Unlisted Combination' } },
    { name: 'an unknown preferred combination', patch: { preferredCombination: 'Unlisted Combination' } },
    { name: 'a grade outside the school grading scale', patch: { performanceGrade: 'Z' } },
    { name: 'non-numeric performance marks', patch: { performanceMarks: 'eighty' } },
    { name: 'non-numeric subject marks', patch: {
      subjects: [{ name: 'Mathematics', marks: 'eighty', grade: 'A' }]
    } }
  ];
  for (const invalidCase of invalidCases) {
    const result = await request('/api/public/admissions/applications', {
      method: 'POST', body: await submissionForm({ academicBackground: backgroundWith(invalidCase.patch) })
    });
    check(`Submission rejects ${invalidCase.name}`,
      result.status === 400 && Array.isArray(result.body?.errors) && result.body.errors.length > 0,
      `status=${result.status}`);
  }

  // 6. Staff see the structured record; internal upload tokens are never exposed.
  const detail = await request(`/api/admissions/applications/${applicationId}`, {
    headers: { Cookie: head }
  });
  const stored = detail.body?.application;
  const background = stored?.academicBackground;
  check('Staff application detail exposes the structured academic background with subject rows',
    detail.status === 200 && background?.academicYearCompleted === initialSettings.academicYears[0] &&
      background?.previousCombination === validBackground.previousCombination &&
      background?.preferredCombination === validBackground.preferredCombination &&
      background?.performanceGrade === validBackground.performanceGrade &&
      Array.isArray(background?.subjects) && background.subjects.length === 2 &&
      background.subjects.every((subject: any) => Boolean(subject.id && subject.name && subject.marks)),
    `subjects=${background?.subjects?.length}`);
  const attachedDocument = stored?.documents?.find((item: any) => item.documentType === 'ACADEMIC_TRANSCRIPT');
  check('Submitted application carries the consumed document in the upload directory',
    Boolean(attachedDocument) && attachedDocument.fileSize === pdfBytes.length &&
      existsSync(path.join(uploadRoot, attachedDocument.storagePath)), attachedDocument?.storagePath);
  check('Application detail does not expose internal upload tokens or token hashes',
    !JSON.stringify(stored).includes(pdfToken) && !JSON.stringify(stored).includes('uploadToken') &&
      !JSON.stringify(stored).includes('tokenHash'));

  // 7. Staff review decisions: validation, every decision, history and actor metadata.
  const rejectedWithoutReason = await request(`/api/admissions/applications/${applicationId}/status`,
    jsonOptions('POST', { status: 'REJECTED' }, head));
  check('Negative review decisions require a reason', rejectedWithoutReason.status === 400,
    `status=${rejectedWithoutReason.status}`);
  const documentsWithoutTypes = await request(`/api/admissions/applications/${applicationId}/status`,
    jsonOptions('POST', { status: 'DOCUMENTS_REQUIRED', reason: 'Please provide the stamped copy.' }, head));
  check('DOCUMENTS_REQUIRED requires requested document types', documentsWithoutTypes.status === 400,
    `status=${documentsWithoutTypes.status}`);
  const documentsWithShortReason = await request(`/api/admissions/applications/${applicationId}/status`,
    jsonOptions('POST', {
      status: 'DOCUMENTS_REQUIRED', reason: 'no',
      requestedDocumentTypes: ['ACADEMIC_TRANSCRIPT']
    }, head));
  check('DOCUMENTS_REQUIRED requires a meaningful reason', documentsWithShortReason.status === 400,
    `status=${documentsWithShortReason.status}`);

  const decisions: Array<{ status: string; reason?: string; requestedDocumentTypes?: string[] }> = [
    { status: 'UNDER_REVIEW' },
    {
      status: 'DOCUMENTS_REQUIRED',
      reason: 'Please provide the stamped transcript copy.',
      requestedDocumentTypes: ['ACADEMIC_TRANSCRIPT']
    },
    { status: 'ADDITIONAL_INFO_REQUIRED', reason: 'Please confirm the guardian phone number.' },
    { status: 'WAITLISTED', reason: 'The requested programme is currently full.' },
    { status: 'APPROVED' },
    { status: 'REJECTED', reason: 'The submitted documents do not meet the entry requirements.' }
  ];
  let previousStatus = submission.body.applicationStatus;
  for (const decision of decisions) {
    const result = await request(`/api/admissions/applications/${applicationId}/status`,
      jsonOptions('POST', decision, head));
    const updated = result.body?.application;
    const historyEntry = updated?.statusHistory?.slice(-1)[0];
    const reviewDecision = updated?.reviewDecisions?.[0];
    check(`Review decision ${decision.status} is accepted with actor metadata`,
      result.status === 200 && updated?.status === decision.status &&
        historyEntry?.fromStatus === previousStatus && historyEntry?.toStatus === decision.status &&
        historyEntry?.changedBy === 'user-super-admin' && Boolean(historyEntry?.changedByName) &&
        reviewDecision?.decision === decision.status && reviewDecision?.decidedBy === 'user-super-admin' &&
        reviewDecision?.decidedByRole === staffRole && Boolean(reviewDecision?.decidedByName),
      `status=${result.status}`);
    if (decision.requestedDocumentTypes) {
      check('DOCUMENTS_REQUIRED decision stores the requested document types',
        reviewDecision?.requestedDocumentTypes?.includes('ACADEMIC_TRANSCRIPT'));
    }
    previousStatus = decision.status;
  }

  const afterDecisions = await request(`/api/admissions/applications/${applicationId}`, {
    headers: { Cookie: head }
  });
  const finalApplication = afterDecisions.body?.application;
  check('Status history preserves SUBMITTED and appends every review decision',
    afterDecisions.status === 200 && Array.isArray(finalApplication?.statusHistory) &&
      finalApplication.statusHistory.length === decisions.length &&
      finalApplication.statusHistory[0].fromStatus === 'SUBMITTED' &&
      decisions.every((decision: { status: string }) =>
        finalApplication.statusHistory.some((entry: any) => entry.toStatus === decision.status)) &&
      Array.isArray(finalApplication?.reviewDecisions) &&
      finalApplication.reviewDecisions.length === decisions.length,
    `history=${finalApplication?.statusHistory?.length} decisions=${finalApplication?.reviewDecisions?.length}`);

  // 8. Staff document preview/download stream bytes and append access history.
  const documentId = attachedDocument?.id ?? '';
  const staffPreview = await rawRequest(
    `/api/admissions/applications/${applicationId}/documents/${documentId}/preview`,
    { headers: { Cookie: head } }
  );
  const staffPreviewBytes = new Uint8Array(await staffPreview.arrayBuffer());
  check('Staff document preview requires admissions access and streams bytes',
    staffPreview.status === 200 && bytesEqual(staffPreviewBytes, pdfBytes) &&
      (staffPreview.headers.get('content-disposition') || '').includes('inline'),
    `status=${staffPreview.status}`);

  const staffDownload = await rawRequest(
    `/api/admissions/applications/${applicationId}/documents/${documentId}/download`,
    { headers: { Cookie: head } }
  );
  const staffDownloadBytes = new Uint8Array(await staffDownload.arrayBuffer());
  check('Staff document download streams bytes with an attachment disposition',
    staffDownload.status === 200 && bytesEqual(staffDownloadBytes, pdfBytes) &&
      (staffDownload.headers.get('content-disposition') || '').includes('attachment'),
    `status=${staffDownload.status}`);

  const deniedDocument = await request(
    `/api/admissions/applications/${applicationId}/documents/${documentId}/preview`,
    { headers: { Cookie: parent } }
  );
  check('Parent account cannot preview staff application documents', deniedDocument.status === 403,
    `status=${deniedDocument.status}`);

  const afterAccess = await request(`/api/admissions/applications/${applicationId}`, {
    headers: { Cookie: head }
  });
  const accessHistory = afterAccess.body?.application?.documentAccessHistory ?? [];
  check('Document preview and download append audited access history with actor info',
    accessHistory.some((event: any) => event.action === 'PREVIEW' && event.documentId === documentId &&
      event.actorId === 'user-super-admin' && Boolean(event.actorName) && event.actorRole === staffRole) &&
      accessHistory.some((event: any) => event.action === 'DOWNLOAD' && event.documentId === documentId &&
        event.actorId === 'user-super-admin' && Boolean(event.actorName) && event.actorRole === staffRole),
    `events=${accessHistory.length}`);

  // 9. CSV export includes the academic-background fields and the reference number.
  const exportResponse = await rawRequest('/api/admissions/export', { headers: { Cookie: head } });
  const csv = await exportResponse.text();
  check('CSV export includes academic background columns, values and the reference number',
    exportResponse.status === 200 && csv.includes(referenceNumber) &&
      ['Academic Background', 'Previous Combination', 'Preferred Combination', 'Performance Grade']
        .every(header => csv.includes(header)) &&
      csv.includes(String(validBackground.previousCombination)) &&
      csv.includes(String(validBackground.preferredCombination)) &&
      csv.includes(String(validBackground.performanceGrade)),
    `status=${exportResponse.status}`);
  const deniedExport = await request('/api/admissions/export', { headers: { Cookie: teacher } });
  check('Teacher account cannot export admissions data', deniedExport.status === 403,
    `status=${deniedExport.status}`);
} catch (error) {
  check('Admissions workflow test completed without throwing', false, (error as Error).message);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.passed);
for (const item of checks) {
  const status = item.passed ? 'PASS' : 'FAIL';
  const detail = item.detail ? ` (${item.detail})` : '';
  console.log(`[${status}] ${item.name}${detail}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} admissions workflow checks passed.`);
if (failed.length > 0) process.exitCode = 1;
