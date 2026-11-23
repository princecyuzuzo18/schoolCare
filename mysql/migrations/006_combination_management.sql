-- ====================================================================
-- SchoolCare: academic combination management + level normalization.
-- Additive and idempotent. No table, row, mark, attendance or report card
-- is deleted. Discontinued classes/combinations are ARCHIVED, not dropped.
-- ====================================================================

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `classes` ADD COLUMN `status` ENUM(''ACTIVE'',''INACTIVE'',''ARCHIVED'') NOT NULL DEFAULT ''ACTIVE''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `classes` ADD COLUMN `archived_at` DATETIME NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'archived_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `classes` ADD COLUMN `archived_by` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'archived_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `classes` ADD COLUMN `combination_id` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'combination_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Safe, additive archive markers. Historical students keep their class_id and
-- denormalized class_name/combination, so existing results and cards still work.
UPDATE `classes` SET `status` = 'ARCHIVED', `archived_at` = COALESCE(`archived_at`, NOW()),
  `archived_by` = COALESCE(`archived_by`, 'system-migration')
WHERE `id` IN ('class-s3-a', 'class-l4-cst') AND `status` <> 'ARCHIVED';

-- Accounting levels: replace legacy Level 3/4/5 display names with Y1/Y2/Y3.
-- IDs are deliberately unchanged so historical links remain valid.
INSERT INTO `classes`
  (`id`, `school_id`, `name`, `grade_level`, `stream`, `combination`, `room_number`, `student_count`, `class_teacher_name`, `status`)
VALUES
  ('class-l3-accounting-a', 'school-es-rubengera-01', 'Y1 Accounting', 'Y1 Accounting', 'A', 'Accounting', 'Classroom TBD', 0, 'Unassigned', 'ACTIVE'),
  ('class-l4-accounting-a', 'school-es-rubengera-01', 'Y2 Accounting', 'Y2 Accounting', 'A', 'Accounting', 'Classroom TBD', 0, 'Unassigned', 'ACTIVE'),
  ('class-l5-accounting-a', 'school-es-rubengera-01', 'Y3 Accounting', 'Y3 Accounting', 'A', 'Accounting', 'Classroom TBD', 0, 'Unassigned', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `grade_level` = VALUES(`grade_level`),
  `combination` = VALUES(`combination`),
  `status` = IF(`status` = 'ARCHIVED', `status`, VALUES(`status`));

CREATE TABLE IF NOT EXISTS `combinations` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `education_level` VARCHAR(100) NOT NULL DEFAULT '',
  `academic_programme` VARCHAR(150) NOT NULL DEFAULT '',
  `description` TEXT NULL,
  `academic_year` VARCHAR(50) NOT NULL DEFAULT '',
  `status` ENUM('ACTIVE','INACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `class_ids` JSON NULL,
  `teacher_ids` JSON NULL,
  `class_teacher_id` VARCHAR(50) NULL,
  `department` VARCHAR(100) NULL,
  `max_capacity` INT NULL,
  `notes` TEXT NULL,
  `archived_at` DATETIME NULL,
  `archived_by` VARCHAR(50) NULL,
  `archive_reason` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combination_school_code` (`school_id`, `code`),
  KEY `idx_combination_school_status` (`school_id`, `status`),
  KEY `idx_combination_school_level` (`school_id`, `education_level`),
  KEY `idx_combination_school_year` (`school_id`, `academic_year`),
  CONSTRAINT `fk_combination_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_class_teacher` FOREIGN KEY (`class_teacher_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `combination_subjects` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `combination_id` VARCHAR(50) NOT NULL,
  `subject_id` VARCHAR(50) NOT NULL,
  `is_required` TINYINT(1) NOT NULL DEFAULT 1,
  `teacher_ids` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combination_subject` (`combination_id`, `subject_id`),
  KEY `idx_combination_subject_school` (`school_id`, `subject_id`),
  CONSTRAINT `fk_combination_subject_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_subject_combination` FOREIGN KEY (`combination_id`) REFERENCES `combinations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_subject_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `combination_classes` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `combination_id` VARCHAR(50) NOT NULL,
  `class_id` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combination_class` (`combination_id`, `class_id`),
  KEY `idx_combination_class_school` (`school_id`, `class_id`),
  CONSTRAINT `fk_combination_class_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_class_combination` FOREIGN KEY (`combination_id`) REFERENCES `combinations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_class_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `combination_teachers` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `combination_id` VARCHAR(50) NOT NULL,
  `teacher_id` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combination_teacher` (`combination_id`, `teacher_id`),
  KEY `idx_combination_teacher_school` (`school_id`, `teacher_id`),
  CONSTRAINT `fk_combination_teacher_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_teacher_combination` FOREIGN KEY (`combination_id`) REFERENCES `combinations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combination_teacher_user` FOREIGN KEY (`teacher_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Active programme catalogue. Archived entries are retained for historical
-- records but never returned by the active registration endpoints.
INSERT INTO `combinations`
  (`id`, `school_id`, `name`, `code`, `education_level`, `academic_programme`, `description`, `academic_year`, `status`, `class_ids`, `teacher_ids`, `department`, `created_at`)
VALUES
  ('comb-sod', 'school-es-rubengera-01', 'Software Development (SOD)', 'SOD', 'TVET RTB', 'Software Development', 'Software development and database pathways.', '2025 - 2026', 'ACTIVE', JSON_ARRAY('class-l3-sod-a','class-l4-sod-a','class-l5-sod-b'), JSON_ARRAY(), 'Software Development', NOW()),
  ('comb-nit', 'school-es-rubengera-01', 'Networking (NIT)', 'NIT', 'TVET RTB', 'Networking', 'Computer networking and infrastructure pathway.', '2025 - 2026', 'ACTIVE', JSON_ARRAY('class-l3-nit-a','class-l4-nit-a','class-l5-nit-a'), JSON_ARRAY(), 'Software Development', NOW()),
  ('comb-accounting', 'school-es-rubengera-01', 'Accounting', 'ACC', 'TVET RTB', 'Accounting', 'Y1, Y2 and Y3 Accounting programme.', '2025 - 2026', 'ACTIVE', JSON_ARRAY('class-l3-accounting-a','class-l4-accounting-a','class-l5-accounting-a'), JSON_ARRAY(), 'Business & Management', NOW()),
  ('comb-cst-archived', 'school-es-rubengera-01', 'Building & Construction (CST)', 'CST', 'TVET RTB', 'Building & Construction', 'Discontinued combination; historical records only.', '2025 - 2026', 'ARCHIVED', JSON_ARRAY('class-l4-cst'), JSON_ARRAY(), 'Construction', NOW()),
  ('comb-general-science-archived', 'school-es-rubengera-01', 'General Science', 'GSC', 'O-Level', 'General Science', 'Discontinued O-Level combination; historical records only.', '2025 - 2026', 'ARCHIVED', JSON_ARRAY('class-s3-a'), JSON_ARRAY(), 'Science', NOW()),
  ('comb-languages-archived', 'school-es-rubengera-01', 'Languages', 'LAN', 'O-Level', 'Languages', 'Discontinued O-Level combination; historical records only.', '2025 - 2026', 'ARCHIVED', JSON_ARRAY('class-s3-a'), JSON_ARRAY(), 'Languages', NOW())
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `status` = VALUES(`status`),
  `education_level` = VALUES(`education_level`),
  `academic_programme` = VALUES(`academic_programme`);

INSERT IGNORE INTO `combination_subjects` (`id`, `school_id`, `combination_id`, `subject_id`, `is_required`, `teacher_ids`)
VALUES
  ('cs-sod-web', 'school-es-rubengera-01', 'comb-sod', 'subj-web-dev', 1, JSON_ARRAY()),
  ('cs-sod-db', 'school-es-rubengera-01', 'comb-sod', 'subj-db-design', 1, JSON_ARRAY()),
  ('cs-sod-math', 'school-es-rubengera-01', 'comb-sod', 'subj-math', 1, JSON_ARRAY()),
  ('cs-sod-eng', 'school-es-rubengera-01', 'comb-sod', 'subj-english', 0, JSON_ARRAY()),
  ('cs-acc-math', 'school-es-rubengera-01', 'comb-accounting', 'subj-math', 1, JSON_ARRAY()),
  ('cs-acc-ent', 'school-es-rubengera-01', 'comb-accounting', 'subj-entrepreneurship', 1, JSON_ARRAY()),
  ('cs-acc-eng', 'school-es-rubengera-01', 'comb-accounting', 'subj-english', 0, JSON_ARRAY()),
  ('cs-nit-web', 'school-es-rubengera-01', 'comb-nit', 'subj-web-dev', 1, JSON_ARRAY()),
  ('cs-nit-math', 'school-es-rubengera-01', 'comb-nit', 'subj-math', 1, JSON_ARRAY()),
  ('cs-cst-math', 'school-es-rubengera-01', 'comb-cst-archived', 'subj-math', 1, JSON_ARRAY()),
  ('cs-gsc-math', 'school-es-rubengera-01', 'comb-general-science-archived', 'subj-math', 1, JSON_ARRAY()),
  ('cs-lan-eng', 'school-es-rubengera-01', 'comb-languages-archived', 'subj-english', 1, JSON_ARRAY()),
  ('cs-lan-kin', 'school-es-rubengera-01', 'comb-languages-archived', 'subj-kinyarwanda', 1, JSON_ARRAY());

INSERT IGNORE INTO `combination_classes` (`id`, `school_id`, `combination_id`, `class_id`)
VALUES
  ('cc-sod-l3', 'school-es-rubengera-01', 'comb-sod', 'class-l3-sod-a'),
  ('cc-sod-l4', 'school-es-rubengera-01', 'comb-sod', 'class-l4-sod-a'),
  ('cc-sod-l5', 'school-es-rubengera-01', 'comb-sod', 'class-l5-sod-b'),
  ('cc-nit-l3', 'school-es-rubengera-01', 'comb-nit', 'class-l3-nit-a'),
  ('cc-nit-l4', 'school-es-rubengera-01', 'comb-nit', 'class-l4-nit-a'),
  ('cc-nit-l5', 'school-es-rubengera-01', 'comb-nit', 'class-l5-nit-a'),
  ('cc-acc-y1', 'school-es-rubengera-01', 'comb-accounting', 'class-l3-accounting-a'),
  ('cc-acc-y2', 'school-es-rubengera-01', 'comb-accounting', 'class-l4-accounting-a'),
  ('cc-acc-y3', 'school-es-rubengera-01', 'comb-accounting', 'class-l5-accounting-a'),
  ('cc-cst-l4', 'school-es-rubengera-01', 'comb-cst-archived', 'class-l4-cst'),
  ('cc-gsc-s3', 'school-es-rubengera-01', 'comb-general-science-archived', 'class-s3-a'),
  ('cc-lan-s3', 'school-es-rubengera-01', 'comb-languages-archived', 'class-s3-a');
