import type {
  AdmissionApplication,
  AdmissionReviewNote,
  AdmissionSettings,
  AdmissionSlipUpload,
  AdmissionStatusHistory,
  ResultSlipVerificationEvent,
  Senior3ResultsRecord
} from '../src/types';
import { getMysqlPool } from './mysqlConnector';

/**
 * Mirrors admissions writes into MySQL when a live MySQL connection is available.
 * The JSON store remains the source of truth so the app works without XAMPP.
 * All statements are parameterized; this module never interpolates user input.
 */
function toMySqlDate(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}

function nullable(value: unknown, max?: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  return max ? text.slice(0, max) : text;
}

export async function mirrorApplicationCreate(application: AdmissionApplication): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;

  await pool.execute(
    `INSERT IGNORE INTO admission_applications (
      id, school_id, reference_number, application_type, status, academic_year,
      applicant_full_name, applicant_dob, applicant_gender, applicant_phone, applicant_email,
      applicant_district, applicant_sector, applicant_cell, applicant_residence,
      guardian_full_name, guardian_phone, guardian_relationship,
      previous_school_name, previous_school_location, academic_year_completed,
      senior3_completion_status, previous_combination, requested_level, requested_combination,
      previous_academic_performance, reason_for_choosing_school,
      current_school_name, current_school_location, current_class, current_level,
      transfer_academic_year, requested_class, previous_school_type, transfer_reason,
      transfer_reason_other, current_education_level, requested_education_level,
      previous_school_other, application_reason,
      submitted_at, reviewed_at, reviewed_by, reviewed_by_name, review_notes, rejection_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      application.id,
      application.schoolId,
      application.referenceNumber,
      application.applicationType,
      application.status,
      application.academicYear,
      application.applicantFullName,
      application.applicantDob,
      nullable(application.applicantGender),
      application.applicantPhone,
      nullable(application.applicantEmail, 255),
      application.applicantDistrict,
      nullable(application.applicantSector, 100),
      nullable(application.applicantCell, 100),
      application.applicantResidence,
      application.guardianFullName,
      application.guardianPhone,
      application.guardianRelationship,
      nullable(application.previousSchoolName, 255),
      nullable(application.previousSchoolLocation, 255),
      nullable(application.academicYearCompleted, 20),
      nullable(application.senior3CompletionStatus, 100),
      nullable(application.previousCombination, 255),
      nullable(application.requestedLevel, 100),
      nullable(application.requestedCombination, 255),
      nullable(application.previousAcademicPerformance),
      nullable(application.reasonForChoosingSchool),
      nullable(application.currentSchoolName, 255),
      nullable(application.currentSchoolLocation, 255),
      nullable(application.currentClass, 100),
      nullable(application.currentLevel, 100),
      nullable(application.transferAcademicYear, 20),
      nullable(application.requestedClass, 100),
      nullable(application.previousSchoolType, 100),
      nullable(application.transferReason, 100),
      nullable(application.transferReasonOther),
      nullable(application.currentEducationLevel, 100),
      nullable(application.requestedEducationLevel, 100),
      nullable(application.previousSchoolOther, 255),
      nullable(application.applicationReason),
      toMySqlDate(application.submittedAt),
      toMySqlDate(application.reviewedAt),
      nullable(application.reviewedBy, 50),
      nullable(application.reviewedByName, 255),
      nullable(application.reviewNotes),
      nullable(application.rejectionReason)
    ]
  );

  for (const document of application.documents) {
    await pool.execute(
      `INSERT IGNORE INTO admission_documents
        (id, application_id, document_type, file_name, file_mime, file_size, storage_path, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        document.id,
        document.applicationId,
        document.documentType,
        document.fileName,
        document.fileMime,
        document.fileSize,
        document.storagePath,
        toMySqlDate(document.uploadedAt)
      ]
    );
  }
}

export async function mirrorApplicationUpdate(application: AdmissionApplication): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE admission_applications SET status = ?, reviewed_at = ?, reviewed_by = ?,
      reviewed_by_name = ?, review_notes = ?, rejection_reason = ? WHERE id = ?`,
    [
      application.status,
      toMySqlDate(application.reviewedAt),
      nullable(application.reviewedBy, 50),
      nullable(application.reviewedByName, 255),
      nullable(application.reviewNotes),
      nullable(application.rejectionReason),
      application.id
    ]
  );
}

export async function mirrorReviewNote(note: AdmissionReviewNote): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `INSERT IGNORE INTO admission_review_notes
      (id, application_id, reviewer_id, reviewer_name, reviewer_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.applicationId,
      note.reviewerId,
      note.reviewerName,
      note.reviewerRole,
      note.note,
      toMySqlDate(note.createdAt)
    ]
  );
}

export async function mirrorStatusHistory(history: AdmissionStatusHistory): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `INSERT IGNORE INTO admission_status_history
      (id, application_id, from_status, to_status, changed_by, changed_by_name, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      history.id,
      history.applicationId,
      history.fromStatus,
      history.toStatus,
      history.changedBy,
      history.changedByName,
      nullable(history.reason),
      toMySqlDate(history.createdAt)
    ]
  );
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export async function mirrorSenior3Results(record: Senior3ResultsRecord): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `INSERT INTO admission_senior3_results (
      application_id, document_id, result_slip_uploaded, slip_waived, slip_exception_note,
      previous_school_name, academic_year_completed, senior3_completion_year, previous_school_location,
      requested_level, requested_combination, ocr_status, ocr_message, ocr_at, ocr_data,
      applicant_reviewed, verified_summary, verification_status, verification_notes,
      verified_by, verified_by_name, verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      document_id = VALUES(document_id), result_slip_uploaded = VALUES(result_slip_uploaded),
      slip_waived = VALUES(slip_waived), slip_exception_note = VALUES(slip_exception_note),
      previous_school_name = VALUES(previous_school_name), academic_year_completed = VALUES(academic_year_completed),
      senior3_completion_year = VALUES(senior3_completion_year), previous_school_location = VALUES(previous_school_location),
      requested_level = VALUES(requested_level), requested_combination = VALUES(requested_combination),
      ocr_status = VALUES(ocr_status), ocr_message = VALUES(ocr_message), ocr_at = VALUES(ocr_at),
      ocr_data = VALUES(ocr_data), applicant_reviewed = VALUES(applicant_reviewed),
      verified_summary = VALUES(verified_summary), verification_status = VALUES(verification_status),
      verification_notes = VALUES(verification_notes), verified_by = VALUES(verified_by),
      verified_by_name = VALUES(verified_by_name), verified_at = VALUES(verified_at),
      updated_at = VALUES(updated_at)`,
    [
      record.applicationId,
      nullable(record.documentId, 50),
      record.resultSlipUploaded ? 1 : 0,
      record.slipWaived ? 1 : 0,
      nullable(record.slipExceptionNote),
      nullable(record.previousSchoolName, 255),
      nullable(record.academicYearCompleted, 20),
      nullable(record.senior3CompletionYear, 4),
      nullable(record.previousSchoolLocation, 255),
      nullable(record.requestedLevel, 100),
      nullable(record.requestedCombination, 255),
      record.ocrStatus,
      nullable(record.ocrMessage),
      toMySqlDate(record.ocrAt),
      jsonOrNull(record.extracted),
      jsonOrNull(record.applicantReviewed),
      jsonOrNull(record.verifiedSummary),
      record.verificationStatus,
      nullable(record.verificationNotes),
      nullable(record.verifiedBy, 50),
      nullable(record.verifiedByName, 255),
      toMySqlDate(record.verifiedAt),
      toMySqlDate(record.createdAt),
      toMySqlDate(record.updatedAt)
    ]
  );
}

export async function mirrorResultVerificationEvent(event: ResultSlipVerificationEvent): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `INSERT IGNORE INTO admission_result_verification_history
      (id, application_id, status, notes, changed_by, changed_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.applicationId,
      event.status,
      nullable(event.notes),
      event.changedBy,
      event.changedByName,
      toMySqlDate(event.createdAt)
    ]
  );
}

export async function mirrorAdmissionSettings(settings: AdmissionSettings): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `INSERT INTO admission_settings
      (id, result_slip_required, result_slip_exception_note, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      result_slip_required = VALUES(result_slip_required),
      result_slip_exception_note = VALUES(result_slip_exception_note),
      updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    [
      'public_admissions',
      settings.resultSlipRequired ? 1 : 0,
      nullable(settings.resultSlipExceptionNote),
      toMySqlDate(settings.updatedAt),
      nullable(settings.updatedBy, 50)
    ]
  );
}

export async function mirrorAdmissionSlipUpload(record: AdmissionSlipUpload): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  await pool.execute(
    `INSERT IGNORE INTO admission_slip_uploads (
      id, token_hash, storage_path, original_file_name, file_mime, file_size,
      created_at, expires_at, consumed_at, replaced_at, application_id, document_id,
      ocr_status, ocr_data, ocr_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.tokenHash,
      record.storagePath,
      record.originalFileName,
      record.fileMime,
      record.fileSize,
      toMySqlDate(record.createdAt),
      toMySqlDate(record.expiresAt),
      toMySqlDate(record.consumedAt),
      toMySqlDate(record.replacedAt),
      nullable(record.applicationId, 50),
      nullable(record.documentId, 50),
      record.ocrStatus,
      jsonOrNull(record.ocrData),
      nullable(record.ocrMessage)
    ]
  );
}
