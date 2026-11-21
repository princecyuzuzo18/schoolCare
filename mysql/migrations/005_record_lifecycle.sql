-- SchoolCare: safe record lifecycle (archive / restore).
-- Additive and idempotent. No data is deleted, reset or overwritten.
-- The application keeps the authoritative runtime store in JSON; these columns
-- mirror the same lifecycle state in MariaDB for reporting and integrations.

-- staff_accounts.status must be able to represent an archived account.
ALTER TABLE `staff_accounts`
  MODIFY COLUMN `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE';

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `staff_accounts` ADD COLUMN `archived_at` DATETIME NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_accounts' AND COLUMN_NAME = 'archived_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `staff_accounts` ADD COLUMN `archived_by` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_accounts' AND COLUMN_NAME = 'archived_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `staff_accounts` ADD COLUMN `archive_reason` VARCHAR(500) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_accounts' AND COLUMN_NAME = 'archive_reason');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `staff_accounts` ADD COLUMN `archived_from_status` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_accounts' AND COLUMN_NAME = 'archived_from_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Learners: archive by soft-delete marker; enrollment_status history is unchanged.
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `archived_at` DATETIME NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'archived_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `archived_by` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'archived_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `archive_reason` VARCHAR(500) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'archive_reason');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `students` ADD COLUMN `archived_from_status` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'archived_from_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Parents / guardians: same soft-delete contract, links are never cascaded away.
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `guardians` ADD COLUMN `archived_at` DATETIME NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guardians' AND COLUMN_NAME = 'archived_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `guardians` ADD COLUMN `archived_by` VARCHAR(50) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guardians' AND COLUMN_NAME = 'archived_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `guardians` ADD COLUMN `archive_reason` VARCHAR(500) NULL',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guardians' AND COLUMN_NAME = 'archive_reason');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
