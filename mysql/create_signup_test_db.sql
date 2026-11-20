-- ============================================================================
-- SchoolCare — one-time provision for the dedicated sign-up test database.
--
-- Run this as a MariaDB administrator (root or equivalent):
--   sudo mariadb < mysql/create_signup_test_db.sql
--   (or: sudo mysql < mysql/create_signup_test_db.sql)
--
-- This script does NOT change schoolcare_db, does NOT reset any password, and
-- does NOT grant access to any other database. It only creates a separate
-- test database and extends the existing schoolcare_user@localhost grants.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `schoolcare_signup_test`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Match the privileges already used by SchoolCare migrations and tests.
-- No DROP privilege is granted: test cleanup deletes rows, never tables.
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, REFERENCES, INDEX, ALTER
  ON `schoolcare_signup_test`.* TO 'schoolcare_user'@'localhost';
