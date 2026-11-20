-- ====================================================================
-- SchoolCare staff governance — safe, additive migration
-- Run with: npm run db:migrate
--
-- This migration:
--   1. adds the staff roles that were previously only present in the JSON data;
--   2. applies the approved Headteacher role change to the two legacy accounts;
--   3. creates tables for staff accounts, invitations and permission grants.
--
-- It never drops a table, drops a column, deletes a row, or changes a password.
-- Existing role IDs stay the same; internal role codes remain uppercase.
-- ====================================================================

-- --- 1. Additional role codes ------------------------------------------------
INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES
  ('DISCIPLINE_OFFICER', 'Discipline & Student Welfare Officer', 'Student conduct, attendance patterns and welfare follow-up'),
  ('SCHOOL_IT', 'School ICT Officer', 'School systems, staff records and reporting data'),
  ('ANIMATEUR', 'Animateur / Student Activities Coordinator', 'Co-curricular activities, events and student communication');

-- --- 2. Approved legacy account role transition -----------------------------
-- user-super-admin is the school Headteacher. The previous Headteacher account
-- becomes the Student Activities Coordinator. Guarded by current values so a
-- re-run cannot overwrite a deliberate later change.
UPDATE `user_profiles`
SET `role_id` = 'HEAD_TEACHER'
WHERE `id` = 'user-super-admin' AND `role_id` = 'SUPER_ADMIN';

UPDATE `user_profiles`
SET `role_id` = 'ANIMATEUR'
WHERE `id` = 'user-head-teacher' AND `role_id` = 'HEAD_TEACHER';

-- --- 3. Staff account records -----------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_accounts` (
  `id` VARCHAR(100) NOT NULL,
  `user_id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `role_id` VARCHAR(50) NOT NULL,
  `professional_title` VARCHAR(150) NOT NULL,
  `department` VARCHAR(150) DEFAULT NULL,
  `status` ENUM('ACTIVE','INVITED','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `delegated_permissions` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(50) NOT NULL,
  `invited_at` DATETIME DEFAULT NULL,
  `accepted_at` DATETIME DEFAULT NULL,
  `last_modified_by` VARCHAR(50) DEFAULT NULL,
  `last_modified_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_account_user` (`user_id`),
  KEY `idx_staff_account_school` (`school_id`),
  KEY `idx_staff_account_role` (`role_id`),
  KEY `idx_staff_account_status` (`status`),
  CONSTRAINT `fk_staff_account_user`
    FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_staff_account_school`
    FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_staff_account_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- 4. One-time staff invitations ------------------------------------------
-- Only a SHA-256 token hash is stored. The raw token is shown once when the
-- Headteacher creates the invitation and is never persisted.
CREATE TABLE IF NOT EXISTS `staff_invitations` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `gender` ENUM('M','F') DEFAULT NULL,
  `role_id` VARCHAR(50) NOT NULL,
  `professional_title` VARCHAR(150) NOT NULL,
  `department` VARCHAR(150) DEFAULT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` VARCHAR(50) NOT NULL,
  `consumed_at` DATETIME DEFAULT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  `user_id` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_invitation_token_hash` (`token_hash`),
  KEY `idx_staff_invitation_school` (`school_id`),
  KEY `idx_staff_invitation_email` (`email`),
  KEY `idx_staff_invitation_expires` (`expires_at`),
  CONSTRAINT `fk_staff_invitation_school`
    FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_staff_invitation_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_staff_invitation_user`
    FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- 5. Append-only delegated permission history ----------------------------
CREATE TABLE IF NOT EXISTS `permission_grants` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `user_id` VARCHAR(50) NOT NULL,
  `previous_permissions` JSON DEFAULT NULL,
  `permissions` JSON DEFAULT NULL,
  `granted_by` VARCHAR(50) NOT NULL,
  `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` DATETIME DEFAULT NULL,
  `revoked_by` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_permission_grant_school` (`school_id`),
  KEY `idx_permission_grant_user` (`user_id`),
  KEY `idx_permission_grant_granted_at` (`granted_at`),
  CONSTRAINT `fk_permission_grant_school`
    FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_permission_grant_user`
    FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
