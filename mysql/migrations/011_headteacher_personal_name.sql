-- ====================================================================
-- SchoolCare headteacher personal name — safe, additive migration
--
-- Adds optional first/last name columns to user_profiles so the official
-- staff record can store the Headteacher's personal name without changing
-- the existing full_name display value, role, email, credential or any
-- foreign key. Column additions are idempotent; no row is deleted or
-- rewritten by this migration. The guarded, parameterized name update is
-- performed separately by scripts/update-headteacher-name.ts.
-- ====================================================================

SET @first_name_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_profiles'
    AND COLUMN_NAME = 'first_name'
);
SET @first_name_sql := IF(
  @first_name_exists = 0,
  'ALTER TABLE user_profiles ADD COLUMN first_name VARCHAR(150) DEFAULT NULL AFTER email',
  'SELECT 1'
);
PREPARE first_name_stmt FROM @first_name_sql;
EXECUTE first_name_stmt;
DEALLOCATE PREPARE first_name_stmt;

SET @last_name_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_profiles'
    AND COLUMN_NAME = 'last_name'
);
SET @last_name_sql := IF(
  @last_name_exists = 0,
  'ALTER TABLE user_profiles ADD COLUMN last_name VARCHAR(150) DEFAULT NULL AFTER first_name',
  'SELECT 1'
);
PREPARE last_name_stmt FROM @last_name_sql;
EXECUTE last_name_stmt;
DEALLOCATE PREPARE last_name_stmt;
