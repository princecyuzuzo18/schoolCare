-- ====================================================================
-- SchoolCare public admissions — safe, additive migration
-- Run with: mysql -u root -p schoolcare_db < mysql/migrations/001_public_admissions.sql
-- This migration never drops, renames, or modifies existing tables.
-- ====================================================================

CREATE TABLE IF NOT EXISTS `admission_applications` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `reference_number` VARCHAR(50) NOT NULL UNIQUE,
  `application_type` ENUM('NEW_STUDENT_SENIOR4', 'SCHOOL_TRANSFER', 'OTHER_ADMISSION') NOT NULL,
  `status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  `academic_year` VARCHAR(20) NOT NULL,
  `applicant_full_name` VARCHAR(255) NOT NULL,
  `applicant_dob` DATE NOT NULL,
  `applicant_gender` ENUM('M', 'F') DEFAULT NULL,
  `applicant_phone` VARCHAR(50) NOT NULL,
  `applicant_email` VARCHAR(255) DEFAULT NULL,
  `applicant_district` VARCHAR(100) NOT NULL,
  `applicant_sector` VARCHAR(100) DEFAULT NULL,
  `applicant_cell` VARCHAR(100) DEFAULT NULL,
  `applicant_residence` TEXT NOT NULL,
  `guardian_full_name` VARCHAR(255) NOT NULL,
  `guardian_phone` VARCHAR(50) NOT NULL,
  `guardian_relationship` VARCHAR(50) NOT NULL,
  `previous_school_name` VARCHAR(255) DEFAULT NULL,
  `previous_school_location` VARCHAR(255) DEFAULT NULL,
  `academic_year_completed` VARCHAR(20) DEFAULT NULL,
  `senior3_completion_status` VARCHAR(100) DEFAULT NULL,
  `previous_combination` VARCHAR(255) DEFAULT NULL,
  `requested_level` VARCHAR(100) DEFAULT NULL,
  `requested_combination` VARCHAR(255) DEFAULT NULL,
  `previous_academic_performance` TEXT DEFAULT NULL,
  `reason_for_choosing_school` TEXT DEFAULT NULL,
  `current_school_name` VARCHAR(255) DEFAULT NULL,
  `current_school_location` VARCHAR(255) DEFAULT NULL,
  `current_class` VARCHAR(100) DEFAULT NULL,
  `current_level` VARCHAR(100) DEFAULT NULL,
  `transfer_academic_year` VARCHAR(20) DEFAULT NULL,
  `requested_class` VARCHAR(100) DEFAULT NULL,
  `previous_school_type` VARCHAR(100) DEFAULT NULL,
  `transfer_reason` VARCHAR(100) DEFAULT NULL,
  `transfer_reason_other` TEXT DEFAULT NULL,
  `current_education_level` VARCHAR(100) DEFAULT NULL,
  `requested_education_level` VARCHAR(100) DEFAULT NULL,
  `previous_school_other` VARCHAR(255) DEFAULT NULL,
  `application_reason` TEXT DEFAULT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` DATETIME DEFAULT NULL,
  `reviewed_by` VARCHAR(50) DEFAULT NULL,
  `reviewed_by_name` VARCHAR(255) DEFAULT NULL,
  `review_notes` TEXT DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_admission_reference` (`reference_number`),
  KEY `idx_admission_status` (`status`),
  KEY `idx_admission_type` (`application_type`),
  KEY `idx_admission_submitted` (`submitted_at`),
  CONSTRAINT `fk_admission_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_documents` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `document_type` VARCHAR(100) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_mime` VARCHAR(100) NOT NULL,
  `file_size` INT NOT NULL DEFAULT 0,
  `storage_path` VARCHAR(500) NOT NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_document_application` (`application_id`),
  CONSTRAINT `fk_document_application` FOREIGN KEY (`application_id`) REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_review_notes` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `reviewer_id` VARCHAR(50) NOT NULL,
  `reviewer_name` VARCHAR(255) NOT NULL,
  `reviewer_role` VARCHAR(50) NOT NULL,
  `note` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_review_note_application` (`application_id`),
  CONSTRAINT `fk_review_note_application` FOREIGN KEY (`application_id`) REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_status_history` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `from_status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED') DEFAULT NULL,
  `to_status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED') NOT NULL,
  `changed_by` VARCHAR(50) NOT NULL,
  `changed_by_name` VARCHAR(255) NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_history_application` (`application_id`),
  CONSTRAINT `fk_status_history_application` FOREIGN KEY (`application_id`) REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admission_verifications` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `reference_number` VARCHAR(50) NOT NULL,
  `contact_hash` VARCHAR(128) NOT NULL,
  `code_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consumed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_verification_reference` (`reference_number`),
  CONSTRAINT `fk_verification_application` FOREIGN KEY (`application_id`) REFERENCES `admission_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
