-- SchoolCare academic marks, results, approval and report card schema.
-- Additive and idempotent: no existing table, column or row is dropped or modified.
-- Every academic table carries school_id so multi-school isolation is enforced.

CREATE TABLE IF NOT EXISTS `academic_years` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_academic_year_school_name` (`school_id`, `name`),
  KEY `idx_academic_year_school_active` (`school_id`, `is_active`),
  CONSTRAINT `fk_academic_year_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `terms` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `academic_year_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_term_school_year_name` (`school_id`, `academic_year_id`, `name`),
  KEY `idx_term_school_year` (`school_id`, `academic_year_id`),
  CONSTRAINT `fk_term_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_term_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_subject_assignments` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `academic_year_id` VARCHAR(50) NOT NULL,
  `term_id` VARCHAR(50) NOT NULL,
  `class_id` VARCHAR(50) NOT NULL,
  `subject_id` VARCHAR(50) NOT NULL,
  `teacher_ids` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_subject_scope` (`school_id`, `academic_year_id`, `term_id`, `class_id`, `subject_id`),
  KEY `idx_class_subject_class` (`school_id`, `class_id`),
  KEY `idx_class_subject_subject` (`school_id`, `subject_id`),
  CONSTRAINT `fk_class_subject_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_subject_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_subject_term` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_subject_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_subject_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_teacher_assignments` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `academic_year_id` VARCHAR(50) NOT NULL,
  `class_id` VARCHAR(50) NOT NULL,
  `teacher_id` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_teacher_scope` (`school_id`, `academic_year_id`, `class_id`, `teacher_id`),
  KEY `idx_class_teacher_teacher` (`school_id`, `teacher_id`),
  CONSTRAINT `fk_class_teacher_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_teacher_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_teacher_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_teacher_user` FOREIGN KEY (`teacher_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assessment_categories` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `max_marks` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `weight_percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessment_category_school_code` (`school_id`, `code`),
  KEY `idx_assessment_category_school_active` (`school_id`, `is_active`),
  CONSTRAINT `fk_assessment_category_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grading_scales` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `pass_mark` DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  `grade_boundaries` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_grading_scale_school_active` (`school_id`, `is_active`),
  CONSTRAINT `fk_grading_scale_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `academic_settings` (
  `school_id` VARCHAR(50) NOT NULL,
  `academic_year_id` VARCHAR(50) NULL,
  `term_id` VARCHAR(50) NULL,
  `grading_scale_id` VARCHAR(50) NULL,
  `enable_ranking` TINYINT(1) NOT NULL DEFAULT 1,
  `enable_promotion_decision` TINYINT(1) NOT NULL DEFAULT 0,
  `promotion_pass_average` DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  `comments_required_before_approval` TINYINT(1) NOT NULL DEFAULT 0,
  `submission_deadline_days` INT NULL,
  `settings` JSON NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`school_id`),
  CONSTRAINT `fk_academic_settings_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_academic_settings_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_academic_settings_term` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_academic_settings_scale` FOREIGN KEY (`grading_scale_id`) REFERENCES `grading_scales` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `student_marks` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `academic_year_id` VARCHAR(50) NOT NULL,
  `term_id` VARCHAR(50) NOT NULL,
  `class_id` VARCHAR(50) NOT NULL,
  `subject_id` VARCHAR(50) NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `category_id` VARCHAR(50) NOT NULL,
  `score` DECIMAL(6,2) NULL,
  `attendance_status` ENUM('PRESENT','ABSENT','EXCUSED') NOT NULL DEFAULT 'PRESENT',
  `remark` TEXT NULL,
  `updated_by` VARCHAR(50) NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_mark_scope` (`school_id`, `academic_year_id`, `term_id`, `class_id`, `subject_id`, `student_id`, `category_id`),
  KEY `idx_student_mark_student` (`school_id`, `student_id`),
  KEY `idx_student_mark_class_subject` (`school_id`, `class_id`, `subject_id`),
  CONSTRAINT `fk_student_mark_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_mark_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_mark_term` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_mark_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_mark_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_mark_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_mark_category` FOREIGN KEY (`category_id`) REFERENCES `assessment_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mark_submissions` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `academic_year_id` VARCHAR(50) NOT NULL,
  `term_id` VARCHAR(50) NOT NULL,
  `class_id` VARCHAR(50) NOT NULL,
  `subject_id` VARCHAR(50) NOT NULL,
  `teacher_id` VARCHAR(50) NOT NULL,
  `status` ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','RETURNED') NOT NULL DEFAULT 'DRAFT',
  `submitted_at` DATETIME NULL,
  `reviewed_at` DATETIME NULL,
  `reviewed_by` VARCHAR(50) NULL,
  `review_notes` TEXT NULL,
  `approved_at` DATETIME NULL,
  `approved_by` VARCHAR(50) NULL,
  `returned_at` DATETIME NULL,
  `correction_reason` TEXT NULL,
  `history` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mark_submission_scope` (`school_id`, `academic_year_id`, `term_id`, `class_id`, `subject_id`),
  KEY `idx_mark_submission_status` (`school_id`, `status`),
  KEY `idx_mark_submission_teacher` (`school_id`, `teacher_id`),
  CONSTRAINT `fk_mark_submission_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mark_submission_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mark_submission_term` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mark_submission_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mark_submission_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mark_submission_teacher_user` FOREIGN KEY (`teacher_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_cards` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `class_id` VARCHAR(50) NULL,
  `academic_year` VARCHAR(50) NOT NULL,
  `term` VARCHAR(50) NOT NULL,
  `subjects` JSON NULL,
  `summary` JSON NULL,
  `is_approved` TINYINT(1) NOT NULL DEFAULT 0,
  `published_at` DATETIME NULL,
  `generated_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_card_scope` (`school_id`, `student_id`, `academic_year`, `term`),
  KEY `idx_report_card_class` (`school_id`, `class_id`),
  KEY `idx_report_card_published` (`school_id`, `published_at`),
  CONSTRAINT `fk_report_card_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_card_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_card_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_card_subjects` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `report_card_id` VARCHAR(100) NOT NULL,
  `subject_id` VARCHAR(50) NOT NULL,
  `marks` JSON NULL,
  `grade` VARCHAR(10) NULL,
  `remark` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_card_subject` (`report_card_id`, `subject_id`),
  KEY `idx_report_card_subject_school` (`school_id`, `subject_id`),
  CONSTRAINT `fk_report_card_subject_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_card_subject_card` FOREIGN KEY (`report_card_id`) REFERENCES `report_cards` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_card_subject_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_distributions` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `report_card_id` VARCHAR(100) NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `student_name` VARCHAR(255) NOT NULL,
  `class_name` VARCHAR(150) NOT NULL,
  `academic_year` VARCHAR(50) NOT NULL,
  `term` VARCHAR(50) NOT NULL,
  `status` ENUM('NOT_GENERATED','GENERATED','PRINTED','ISSUED','COLLECTED') NOT NULL DEFAULT 'NOT_GENERATED',
  `generated_at` DATETIME NULL,
  `printed_at` DATETIME NULL,
  `issued_at` DATETIME NULL,
  `issued_to_name` VARCHAR(255) NULL,
  `issued_to_relationship` VARCHAR(100) NULL,
  `collected_at` DATETIME NULL,
  `collected_by_name` VARCHAR(255) NULL,
  `staff_id` VARCHAR(50) NOT NULL,
  `staff_name` VARCHAR(255) NOT NULL,
  `notes` TEXT NULL,
  `history` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_distribution_scope` (`school_id`, `report_card_id`),
  KEY `idx_report_distribution_status` (`school_id`, `status`),
  KEY `idx_report_distribution_student` (`school_id`, `student_id`),
  CONSTRAINT `fk_report_distribution_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_distribution_card` FOREIGN KEY (`report_card_id`) REFERENCES `report_cards` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_distribution_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_distribution_staff` FOREIGN KEY (`staff_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
