-- ====================================================================
-- SchoolCare: store the managed combination context on student records.
-- Additive only. Existing students keep their free-text combination/class
-- values; new registrations additionally record the managed combination ID.
-- ====================================================================

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `combination_id` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'combination_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `education_level` VARCHAR(100) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'education_level');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `academic_programme` VARCHAR(150) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'academic_programme');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'CREATE INDEX `idx_student_combination_school` ON `students` (`school_id`, `combination_id`)',
  'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME = 'idx_student_combination_school');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add a foreign key only when the column and an existing constraint are absent.
SET @has_fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'
    AND CONSTRAINT_NAME = 'fk_student_combination');
SET @sql = (SELECT IF(@has_fk = 0,
  'ALTER TABLE `students` ADD CONSTRAINT `fk_student_combination` FOREIGN KEY (`combination_id`) REFERENCES `combinations` (`id`) ON DELETE SET NULL',
  'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
