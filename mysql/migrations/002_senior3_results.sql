-- ====================================================================
-- SchoolCare Senior 3 result slip verification — safe, additive migration
-- Run with: mysql -u root -p schoolcare_db < mysql/migrations/002_senior3_results.sql
-- This migration only creates new tables. It never drops or edits existing data.
-- ====================================================================

CREATE TABLE IF NOT EXISTS `admission_senior3_results` (
  `application_id` VARCHAR(50) NOT NULL,
  `document_id` VARCHAR(50) DEFAULT NULL,
  `result_slip_uploaded` TINYINT(1) NOT NULL DEFAULT 0,
  `slip_waived` TINYINT(1) NOT NULL DEFAULT 0,
  `slip_exception_note` TEXT DEFAULT NULL,
  `previous_school_name` VARCHAR(255) DEFAULT NULL,
  `academic_year_completed` VARCHAR(20) DEFAULT NULL,
  `senior3_completion_year` VARCHAR(4) DEFAULT NULL,
  `previous_school_location` VARCHAR(255) DEFAULT NULL,
  `requested_level` VARCHAR(100) DEFAULT NULL,
  `requested_combination` VARCHAR(255) DEFAULT NULL,
  `ocr_status` ENUM('NOT_ATTEMPTED','EXTRACTED','UNAVAILABLE','ERROR') NOT NULL DEFAULT 'NOT_ATTEMPTED',
  `ocr_message` TEXT DEFAULT NULL,
  `ocr_at` DATETIME DEFAULT NULL,
  `ocr_data` JSON DEFAULT NULL,
  `applicant_reviewed` JSON DEFAULT NULL,
  `verified_summary` JSON DEFAULT NULL,
  `verification_status` ENUM('NOT_YET_VERIFIED','UNDER_VERIFICATION','VERIFIED','VERIFICATION_FAILED','ADDITIONAL_DOCUMENT_REQUIRED') NOT NULL DEFAULT 'NOT_YET_VERIFIED',
  `verification_notes` TEXT DEFAULT NULL,
  `verified_by` VARCHAR(50) DEFAULT NULL,
  `verified_by_name` VARCHAR(255) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`application_id`),
  KEY `idx_senior3_verification_status` (`verification_status`),
  CONSTRAINT `fk_senior3_application` FOREIGN KEY (`application_id`) REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_result_verification_history` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `status` ENUM('NOT_YET_VERIFIED','UNDER_VERIFICATION','VERIFIED','VERIFICATION_FAILED','ADDITIONAL_DOCUMENT_REQUIRED') NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `changed_by` VARCHAR(50) NOT NULL,
  `changed_by_name` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_result_verification_application` (`application_id`),
  CONSTRAINT `fk_result_verification_application` FOREIGN KEY (`application_id`) REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_settings` (
  `id` VARCHAR(50) NOT NULL,
  `result_slip_required` TINYINT(1) NOT NULL DEFAULT 1,
  `result_slip_exception_note` TEXT DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  `updated_by` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_slip_uploads` (
  `id` VARCHAR(50) NOT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `original_file_name` VARCHAR(255) NOT NULL,
  `file_mime` VARCHAR(100) NOT NULL,
  `file_size` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `consumed_at` DATETIME DEFAULT NULL,
  `replaced_at` DATETIME DEFAULT NULL,
  `application_id` VARCHAR(50) DEFAULT NULL,
  `document_id` VARCHAR(50) DEFAULT NULL,
  `ocr_status` ENUM('NOT_ATTEMPTED','EXTRACTED','UNAVAILABLE','ERROR') NOT NULL DEFAULT 'NOT_ATTEMPTED',
  `ocr_data` JSON DEFAULT NULL,
  `ocr_message` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_slip_token_hash` (`token_hash`),
  KEY `idx_slip_application` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
