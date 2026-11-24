-- ====================================================================
-- SchoolCare admission academic background and secure document workflow
-- Safe, additive migration. It never drops, renames, truncates or edits
-- existing records. New values are appended to existing status enums.
--
-- Applied with: npm run db:migrate
-- ====================================================================

ALTER TABLE `admission_applications`
  MODIFY COLUMN `status` ENUM(
    'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED',
    'DRAFT', 'DOCUMENTS_REQUIRED', 'WAITLISTED'
  ) NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN `academic_background` JSON DEFAULT NULL AFTER `rejection_reason`;

ALTER TABLE `admission_status_history`
  MODIFY COLUMN `from_status` ENUM(
    'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED',
    'DRAFT', 'DOCUMENTS_REQUIRED', 'WAITLISTED'
  ) DEFAULT NULL,
  MODIFY COLUMN `to_status` ENUM(
    'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED',
    'DRAFT', 'DOCUMENTS_REQUIRED', 'WAITLISTED'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS `admission_academic_subjects` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `subject_name` VARCHAR(255) NOT NULL,
  `marks` VARCHAR(60) DEFAULT NULL,
  `grade` VARCHAR(60) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academic_subject_application` (`application_id`),
  CONSTRAINT `fk_academic_subject_application` FOREIGN KEY (`application_id`)
    REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_document_uploads` (
  `id` VARCHAR(50) NOT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `application_id` VARCHAR(50) DEFAULT NULL,
  `document_id` VARCHAR(50) DEFAULT NULL,
  `document_type` VARCHAR(100) NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `original_file_name` VARCHAR(255) NOT NULL,
  `file_mime` VARCHAR(100) NOT NULL,
  `file_size` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `consumed_at` DATETIME DEFAULT NULL,
  `replaced_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admission_doc_token_hash` (`token_hash`),
  KEY `idx_admission_doc_upload_application` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_document_access_log` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `document_id` VARCHAR(50) NOT NULL,
  `actor_id` VARCHAR(50) NOT NULL,
  `actor_name` VARCHAR(255) NOT NULL,
  `actor_role` VARCHAR(50) NOT NULL,
  `action` ENUM('PREVIEW', 'DOWNLOAD') NOT NULL,
  `ip` VARCHAR(100) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_document_access_application` (`application_id`),
  KEY `idx_document_access_document` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_review_decisions` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `decision` ENUM(
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED',
    'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'WAITLISTED'
  ) NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `requested_document_types` JSON DEFAULT NULL,
  `decided_by` VARCHAR(50) NOT NULL,
  `decided_by_name` VARCHAR(255) NOT NULL,
  `decided_by_role` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_review_decision_application` (`application_id`),
  CONSTRAINT `fk_review_decision_application` FOREIGN KEY (`application_id`)
    REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `admission_settings`
  ADD COLUMN `document_categories` JSON DEFAULT NULL AFTER `result_slip_exception_note`;

-- --------------------------------------------------------------------
-- Reversible down migration (manual; only after confirming no records use
-- DRAFT, DOCUMENTS_REQUIRED or WAITLISTED):
--
-- ALTER TABLE `admission_settings` DROP COLUMN `document_categories`;
-- DROP TABLE IF EXISTS `admission_review_decisions`;
-- DROP TABLE IF EXISTS `admission_document_access_log`;
-- DROP TABLE IF EXISTS `admission_document_uploads`;
-- DROP TABLE IF EXISTS `admission_academic_subjects`;
-- ALTER TABLE `admission_applications` DROP COLUMN `academic_background`;
-- ALTER TABLE `admission_applications`
--   MODIFY COLUMN `status` ENUM('SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFO_REQUIRED','APPROVED','REJECTED')
--   NOT NULL DEFAULT 'SUBMITTED';
-- ALTER TABLE `admission_status_history`
--   MODIFY COLUMN `from_status` ENUM('SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFO_REQUIRED','APPROVED','REJECTED') DEFAULT NULL,
--   MODIFY COLUMN `to_status` ENUM('SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFO_REQUIRED','APPROVED','REJECTED') NOT NULL;
-- --------------------------------------------------------------------
