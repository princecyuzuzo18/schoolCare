-- ====================================================================
-- SCHOOLCARE — MYSQL & XAMPP DATABASE EXPORT
-- Initial School: ES RUBENGERA RTB (Karongi District, Rwanda)
-- Compatible with: MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+, XAMPP & phpMyAdmin
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET NAMES utf8mb4;

-- 1. Create Database if not exists
CREATE DATABASE IF NOT EXISTS `schoolcare_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `schoolcare_db`;

-- --------------------------------------------------------
-- Table: schools
-- --------------------------------------------------------
DROP TABLE IF EXISTS `schools`;
CREATE TABLE `schools` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `type` VARCHAR(100) DEFAULT 'Secondary & Technical TVET',
  `motto` TEXT,
  `logo_url` TEXT,
  `province` VARCHAR(100) NOT NULL,
  `district` VARCHAR(100) NOT NULL,
  `sector` VARCHAR(100) NOT NULL,
  `country` VARCHAR(100) DEFAULT 'Rwanda',
  `phone` VARCHAR(50) NOT NULL,
  `emergency_phone` VARCHAR(50) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `website` VARCHAR(255),
  `currency` VARCHAR(10) DEFAULT 'RWF',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `schools` (`id`, `name`, `code`, `type`, `motto`, `province`, `district`, `sector`, `phone`, `emergency_phone`, `email`, `website`, `currency`) VALUES
('school-es-rubengera-01', 'ES RUBENGERA RTB', 'ESR-RTB-RW', 'Secondary & Technical TVET School (RTB)', 'Ubumenyi, Umurimo, Ubupfura — Knowledge, Skill, Integrity', 'Western Province', 'Karongi', 'Rubengera', '+250 788 340 120', '+250 788 999 112', 'info@esrubengera.rw', 'https://esrubengera.ac.rw', 'RWF');

-- --------------------------------------------------------
-- Table: roles
-- --------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`id`, `name`, `description`) VALUES
('SUPER_ADMIN', 'Super Administrator', 'National oversight & platform administrator'),
('SCHOOL_ADMIN', 'School Administrator', 'Head of ICT & School Systems Management'),
('HEAD_TEACHER', 'Head Teacher / Principal', 'Directeur d’établissement'),
('DEPUTY_HEAD', 'Deputy Head Teacher', 'Dean of Studies & Discipline'),
('TEACHER', 'Teacher / Instructor', 'Academic instruction, CAT marks & roll-call'),
('NURSE', 'School Nurse / Health Officer', 'Infirmary, emergency triage, hospital referral'),
('ACCOUNTANT', 'Accountant / Bursar', 'Fee collection, MoMo reconciliation, invoicing'),
('PARENT', 'Parent / Guardian', 'Family portal, attendance alerts & emergency consent'),
('STUDENT', 'Student', 'Learner profile, marks, timetable, homework');

-- --------------------------------------------------------
-- Table: user_profiles
-- --------------------------------------------------------
DROP TABLE IF EXISTS `user_auth_credentials`;
DROP TABLE IF EXISTS `user_profiles`;
CREATE TABLE `user_profiles` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `role_id` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `first_name` VARCHAR(150) DEFAULT NULL,
  `last_name` VARCHAR(150) DEFAULT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `avatar_url` TEXT,
  `preferred_language` VARCHAR(5) DEFAULT 'rw',
  `is_active` TINYINT(1) DEFAULT 1,
  `last_login` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `user_profiles` (`id`, `school_id`, `role_id`, `full_name`, `email`, `phone`, `preferred_language`) VALUES
('user-super-admin', 'school-es-rubengera-01', 'SUPER_ADMIN', 'MUNYENTWARI Olivier', 'esrubengera@gmail.com', '+250 788 111 000', 'en'),
('user-school-admin', 'school-es-rubengera-01', 'SCHOOL_ADMIN', 'Innocent Niyitegeka', 'admin@esrubengera.rw', '+250 788 222 101', 'rw'),
('user-head-teacher', 'school-es-rubengera-01', 'HEAD_TEACHER', 'Jean Bosco Mugiraneza', 'headteacher@esrubengera.rw', '+250 788 333 202', 'rw'),
('user-deputy-head', 'school-es-rubengera-01', 'DEPUTY_HEAD', 'Claire Mukamana', 'deputy@esrubengera.rw', '+250 788 444 303', 'en'),
('user-teacher', 'school-es-rubengera-01', 'TEACHER', 'Patrick Nshimiyimana', 'teacher@esrubengera.rw', '+250 788 555 404', 'rw'),
('user-nurse', 'school-es-rubengera-01', 'NURSE', 'Aline Uwimana', 'nurse@esrubengera.rw', '+250 788 666 505', 'rw'),
('user-accountant', 'school-es-rubengera-01', 'ACCOUNTANT', 'Eric Bizimana', 'accountant@esrubengera.rw', '+250 788 777 606', 'en'),
('user-parent', 'school-es-rubengera-01', 'PARENT', 'Chantal Mukantabana', 'parent@schoolcare.rw', '+250 788 888 707', 'rw'),
('user-student', 'school-es-rubengera-01', 'STUDENT', 'Kevin Ishimwe', 'student@esrubengera.rw', '+250 788 999 808', 'en');

-- Personal name of the current Headteacher (guarded by account ID and email).
UPDATE `user_profiles`
SET `first_name` = 'MUNYENTWARI', `last_name` = 'Olivier'
WHERE `id` = 'user-super-admin' AND LOWER(`email`) = LOWER('esrubengera@gmail.com');

-- --------------------------------------------------------
-- Table: user_auth_credentials
-- Password hashes only; plaintext passwords are never stored.
-- --------------------------------------------------------
CREATE TABLE `user_auth_credentials` (
  `user_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_auth_credentials_profile`
    FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: classes
-- --------------------------------------------------------
DROP TABLE IF EXISTS `classes`;
CREATE TABLE `classes` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `grade_level` VARCHAR(50) NOT NULL,
  `stream` VARCHAR(10) DEFAULT 'A',
  `combination` VARCHAR(150),
  `room_number` VARCHAR(50),
  `student_count` INT DEFAULT 0,
  `class_teacher_name` VARCHAR(150),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `classes` (`id`, `school_id`, `name`, `grade_level`, `stream`, `combination`, `room_number`, `student_count`, `class_teacher_name`) VALUES
('class-l3-sod-a', 'school-es-rubengera-01', 'Level 3 SOD A', 'Level 3 RTB', 'A', 'Software Development (SOD)', 'ICT Lab', 0, 'Unassigned'),
('class-l4-sod-a', 'school-es-rubengera-01', 'Level 4 SOD A', 'Level 4 RTB', 'A', 'Software Development (SOD)', 'Lab 2 - ICT Building', 38, 'Patrick Nshimiyimana'),
('class-l5-sod-b', 'school-es-rubengera-01', 'Level 5 SOD B', 'Level 5 RTB', 'B', 'Software Development (SOD)', 'Lab 1 - Innovation Center', 35, 'Jean Damascene Kayitare'),
('class-l3-nit-a', 'school-es-rubengera-01', 'Level 3 NIT A', 'Level 3 RTB', 'A', 'Networking (NIT)', 'ICT Lab', 0, 'Unassigned'),
('class-l4-nit-a', 'school-es-rubengera-01', 'Level 4 NIT A', 'Level 4 RTB', 'A', 'Networking (NIT)', 'ICT Lab', 0, 'Unassigned'),
('class-l5-nit-a', 'school-es-rubengera-01', 'Level 5 NIT A', 'Level 5 RTB', 'A', 'Networking (NIT)', 'ICT Lab', 0, 'Unassigned'),
('class-l4-cst', 'school-es-rubengera-01', 'Level 4 CST', 'Level 4 RTB', 'A', 'Building & Construction Technology', 'Workshop 3', 42, 'Alexis Manirakiza'),
('class-s3-a', 'school-es-rubengera-01', 'Senior 3 A', 'O-Level S3', 'A', 'General Science & Languages', 'Block B - Room 104', 45, 'Jeannette Mukarugwiza');

-- --------------------------------------------------------
-- Table: subjects
-- --------------------------------------------------------
DROP TABLE IF EXISTS `subjects`;
CREATE TABLE `subjects` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `department` VARCHAR(100) NOT NULL,
  `credits` INT DEFAULT 4,
  `pass_mark` DECIMAL(5,2) DEFAULT 50.00,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `subjects` (`id`, `school_id`, `name`, `code`, `department`, `credits`, `pass_mark`) VALUES
('subj-web-dev', 'school-es-rubengera-01', 'Web Application Development', 'SOD401', 'Software Development', 5, 50.00),
('subj-db-design', 'school-es-rubengera-01', 'Database Architecture & SQL', 'SOD402', 'Software Development', 5, 50.00),
('subj-math', 'school-es-rubengera-01', 'Applied Mathematics & Statistics', 'MTH401', 'Mathematics', 4, 50.00),
('subj-english', 'school-es-rubengera-01', 'Professional English & Communication', 'ENG401', 'Languages', 3, 50.00),
('subj-kinyarwanda', 'school-es-rubengera-01', 'Ikinyarwanda n’Umuco Nyarwanda', 'KIN401', 'Languages', 3, 50.00),
('subj-entrepreneurship', 'school-es-rubengera-01', 'Entrepreneurship & Innovation', 'ENT401', 'Business & Management', 3, 50.00);

-- --------------------------------------------------------
-- Table: students
-- --------------------------------------------------------
DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `admission_number` VARCHAR(50) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `gender` ENUM('M', 'F') DEFAULT 'M',
  `dob` DATE NOT NULL,
  `class_id` VARCHAR(50),
  `class_name` VARCHAR(100),
  `combination` VARCHAR(150),
  `enrollment_status` VARCHAR(50) DEFAULT 'ACTIVE',
  `admission_date` DATE DEFAULT CURRENT_DATE,
  `blood_group` VARCHAR(10) DEFAULT 'O+',
  `allergies` TEXT,
  `medical_notes` TEXT,
  `photo_url` TEXT,
  `national_id` VARCHAR(30),
  `previous_school` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admission` (`school_id`, `admission_number`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `students` (`id`, `school_id`, `admission_number`, `first_name`, `last_name`, `gender`, `dob`, `class_id`, `class_name`, `combination`, `blood_group`, `allergies`, `medical_notes`, `photo_url`) VALUES
('std-kevin-ishimwe-01', 'school-es-rubengera-01', 'ESR-2024-0104', 'Kevin', 'Ishimwe', 'M', '2008-04-12', 'class-l4-sod-a', 'Level 4 SOD A', 'Software Development (SOD)', 'O+', 'Penicillin', 'Has mild asthma, keeps inhaler at infirmary.', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200'),
('std-divine-keza-02', 'school-es-rubengera-01', 'ESR-2024-0105', 'Divine', 'Keza', 'F', '2008-08-23', 'class-l4-sod-a', 'Level 4 SOD A', 'Software Development (SOD)', 'A+', 'None', 'None', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200'),
('std-eric-uwitonze-03', 'school-es-rubengera-01', 'ESR-2024-0106', 'Eric', 'Uwitonze', 'M', '2007-11-15', 'class-l4-sod-a', 'Level 4 SOD A', 'Software Development (SOD)', 'B+', 'Dust mite', 'Sports athlete - track & basketball', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200'),
('std-sandrine-mutoni-04', 'school-es-rubengera-01', 'ESR-2024-0107', 'Sandrine', 'Mutoni', 'F', '2008-01-30', 'class-l4-sod-a', 'Level 4 SOD A', 'Software Development (SOD)', 'AB+', 'None', 'None', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'),
('std-jeanpaul-habineza-05', 'school-es-rubengera-01', 'ESR-2024-0108', 'Jean-Paul', 'Habineza', 'M', '2007-06-19', 'class-l4-cst', 'Level 4 CST', 'Building & Construction', 'O-', 'None', 'None', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200'),
('std-clarisse-uwera-06', 'school-es-rubengera-01', 'ESR-2024-0109', 'Clarisse', 'Uwera', 'F', '2009-03-14', 'class-s3-a', 'Senior 3 A', 'General Science & Languages', 'O+', 'None', 'Sibling of Kevin Ishimwe', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200');

-- --------------------------------------------------------
-- Table: guardians
-- --------------------------------------------------------
DROP TABLE IF EXISTS `guardians`;
CREATE TABLE `guardians` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `relationship` VARCHAR(50) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `alt_phone` VARCHAR(50),
  `email` VARCHAR(255),
  `national_id` VARCHAR(30),
  `occupation` VARCHAR(150),
  `address` TEXT,
  `preferred_language` VARCHAR(5) DEFAULT 'rw',
  `preferred_channel` VARCHAR(20) DEFAULT 'WHATSAPP',
  `is_verified` TINYINT(1) DEFAULT 1,
  `can_pickup` TINYINT(1) DEFAULT 1,
  `emergency_priority` INT DEFAULT 1,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `guardians` (`id`, `school_id`, `full_name`, `relationship`, `phone`, `alt_phone`, `email`, `address`, `preferred_language`, `preferred_channel`, `is_verified`, `can_pickup`, `emergency_priority`) VALUES
('grd-chantal-01', 'school-es-rubengera-01', 'Chantal Mukantabana', 'MOTHER', '+250 788 888 707', '+250 722 341 902', 'chantal.mukantabana@gmail.com', 'Rubengera Sector, Gitwa Cell, Karongi District', 'rw', 'WHATSAPP', 1, 1, 1),
('grd-celestin-02', 'school-es-rubengera-01', 'Celestin Gasana', 'FATHER', '+250 788 456 789', '+250 733 998 877', 'celestin.gasana@karongi.gov.rw', 'Kibuye Town, Karongi District', 'rw', 'SMS', 1, 1, 1),
('grd-angelique-03', 'school-es-rubengera-01', 'Angelique Nyirandikubwimana', 'MOTHER', '+250 788 912 345', NULL, 'angelique.nyira@yahoo.fr', 'Bwishyura Sector, Karongi District', 'rw', 'SMS', 1, 1, 1);

-- --------------------------------------------------------
-- Table: student_guardians (Many-to-Many)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `student_guardians`;
CREATE TABLE `student_guardians` (
  `student_id` VARCHAR(50) NOT NULL,
  `guardian_id` VARCHAR(50) NOT NULL,
  `relationship` VARCHAR(50) NOT NULL,
  `emergency_priority` INT DEFAULT 1,
  `can_pickup` TINYINT(1) DEFAULT 1,
  `is_primary` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`student_id`, `guardian_id`),
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `student_guardians` (`student_id`, `guardian_id`, `relationship`, `emergency_priority`, `can_pickup`, `is_primary`) VALUES
('std-kevin-ishimwe-01', 'grd-chantal-01', 'MOTHER', 1, 1, 1),
('std-clarisse-uwera-06', 'grd-chantal-01', 'MOTHER', 1, 1, 1),
('std-eric-uwitonze-03', 'grd-celestin-02', 'FATHER', 1, 1, 1),
('std-divine-keza-02', 'grd-angelique-03', 'MOTHER', 1, 1, 1);

-- --------------------------------------------------------
-- Table: attendance_records
-- --------------------------------------------------------
DROP TABLE IF EXISTS `attendance_records`;
CREATE TABLE `attendance_records` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `student_name` VARCHAR(150) NOT NULL,
  `class_id` VARCHAR(50) NOT NULL,
  `class_name` VARCHAR(100) NOT NULL,
  `date` DATE NOT NULL,
  `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'SICK', 'AUTHORIZED_LEAVE') DEFAULT 'PRESENT',
  `recorded_by_staff_id` VARCHAR(50),
  `recorded_by_name` VARCHAR(150),
  `remarks` TEXT,
  `parent_notified` TINYINT(1) DEFAULT 0,
  `parent_explanation` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_date` (`student_id`, `date`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `attendance_records` (`id`, `school_id`, `student_id`, `student_name`, `class_id`, `class_name`, `date`, `status`, `recorded_by_staff_id`, `recorded_by_name`, `remarks`, `parent_notified`, `parent_explanation`) VALUES
('att-01', 'school-es-rubengera-01', 'std-kevin-ishimwe-01', 'Kevin Ishimwe', 'class-l4-sod-a', 'Level 4 SOD A', '2026-11-05', 'PRESENT', 'user-teacher', 'Patrick Nshimiyimana', 'Present on roll call', 0, NULL),
('att-02', 'school-es-rubengera-01', 'std-divine-keza-02', 'Divine Keza', 'class-l4-sod-a', 'Level 4 SOD A', '2026-11-05', 'PRESENT', 'user-teacher', 'Patrick Nshimiyimana', 'Present on roll call', 0, NULL),
('att-03', 'school-es-rubengera-01', 'std-eric-uwitonze-03', 'Eric Uwitonze', 'class-l4-sod-a', 'Level 4 SOD A', '2026-11-05', 'ABSENT', 'user-teacher', 'Patrick Nshimiyimana', 'Unexplained absence morning roll-call', 1, 'Family medical appointment in Kigali; arriving 1:00 PM.'),
('att-04', 'school-es-rubengera-01', 'std-sandrine-mutoni-04', 'Sandrine Mutoni', 'class-l4-sod-a', 'Level 4 SOD A', '2026-11-05', 'LATE', 'user-teacher', 'Patrick Nshimiyimana', 'Arrived 8:25 AM due to rain delay on Rubengera road', 1, NULL),
('att-06', 'school-es-rubengera-01', 'std-clarisse-uwera-06', 'Clarisse Uwera', 'class-s3-a', 'Senior 3 A', '2026-11-05', 'PRESENT', 'user-teacher', 'Jeannette Mukarugwiza', 'Present on roll call', 0, NULL);

-- --------------------------------------------------------
-- Table: health_incidents
-- --------------------------------------------------------
DROP TABLE IF EXISTS `health_incidents`;
CREATE TABLE `health_incidents` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `reference_number` VARCHAR(50) NOT NULL UNIQUE,
  `student_id` VARCHAR(50) NOT NULL,
  `student_name` VARCHAR(150) NOT NULL,
  `student_class` VARCHAR(100) NOT NULL,
  `date` DATE NOT NULL,
  `time` VARCHAR(20) NOT NULL,
  `category` ENUM('ILLNESS', 'ACCIDENT', 'INJURY', 'EMERGENCY', 'OTHER') DEFAULT 'ILLNESS',
  `priority` ENUM('ROUTINE', 'URGENT', 'EMERGENCY') DEFAULT 'URGENT',
  `symptoms` TEXT NOT NULL,
  `observations` TEXT,
  `temperature` VARCHAR(20),
  `pulse` VARCHAR(20),
  `actions_taken` TEXT NOT NULL,
  `responsible_staff_name` VARCHAR(150) NOT NULL,
  `guardian_id` VARCHAR(50),
  `guardian_name` VARCHAR(150),
  `guardian_phone` VARCHAR(50),
  `contact_status` ENUM('PENDING', 'ATTEMPTED', 'REACHED', 'UNREACHABLE', 'ESCALATED', 'ACKNOWLEDGED') DEFAULT 'ATTEMPTED',
  `parent_acknowledged` TINYINT(1) DEFAULT 0,
  `parent_acknowledged_at` DATETIME,
  `parent_response_notes` TEXT,
  `medical_referral` VARCHAR(255),
  `outcome` ENUM('RETURNED_TO_CLASS', 'RESTING_IN_INFIRMARY', 'PICKED_UP_BY_GUARDIAN', 'REFERRED_TO_HOSPITAL', 'UNDER_OBSERVATION') DEFAULT 'RESTING_IN_INFIRMARY',
  `resolved` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `health_incidents` (`id`, `school_id`, `reference_number`, `student_id`, `student_name`, `student_class`, `date`, `time`, `category`, `priority`, `symptoms`, `observations`, `temperature`, `pulse`, `actions_taken`, `responsible_staff_name`, `guardian_id`, `guardian_name`, `guardian_phone`, `contact_status`, `parent_acknowledged`, `parent_acknowledged_at`, `parent_response_notes`, `medical_referral`, `outcome`, `resolved`) VALUES
('inc-2026-0042', 'school-es-rubengera-01', 'EMG-2026-0042', 'std-kevin-ishimwe-01', 'Kevin Ishimwe', 'Level 4 SOD A', '2026-11-05', '09:20', 'ILLNESS', 'URGENT', 'High fever (39.2°C), severe shivering, dizziness and headache during Coding practical exam.', 'Suspected acute malaria; rapid pulse (105 bpm).', '39.2 °C', '105 bpm', 'Administered oral rehydration, cold sponge bath to lower temperature. Kept in school infirmary bed under observation.', 'Aline Uwimana (School Nurse)', 'grd-chantal-01', 'Chantal Mukantabana (Mother)', '+250 788 888 707', 'ACKNOWLEDGED', 1, '2026-11-05 09:42:10', 'Mother acknowledged via WhatsApp. Arranging taxi to take Kevin to Rubengera Health Center for RDT blood test.', 'Rubengera Health Center (Centre de Santé Rubengera)', 'REFERRED_TO_HOSPITAL', 0),
('inc-2026-0043', 'school-es-rubengera-01', 'EMG-2026-0043', 'std-eric-uwitonze-03', 'Eric Uwitonze', 'Level 4 SOD A', '2026-11-04', '16:15', 'INJURY', 'ROUTINE', 'Mild right ankle sprain during inter-class soccer training on school playground.', 'Swelling around lateral malleolus, able to bear partial weight.', '36.8 °C', NULL, 'Applied R.I.C.E. protocol (Rest, Ice pack 20 min, Elastic compression bandage).', 'Aline Uwimana (School Nurse)', 'grd-celestin-02', 'Celestin Gasana (Father)', '+250 788 456 789', 'REACHED', 1, '2026-11-04 16:45:00', 'Father reached via phone call. Advised that student will rest at home next day.', NULL, 'PICKED_UP_BY_GUARDIAN', 1);

-- --------------------------------------------------------
-- Table: messages (Notification Queue)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `recipient_id` VARCHAR(50),
  `recipient_name` VARCHAR(150) NOT NULL,
  `recipient_phone` VARCHAR(50) NOT NULL,
  `channel` ENUM('SMS', 'WHATSAPP', 'EMAIL', 'IN_APP') DEFAULT 'SMS',
  `category` VARCHAR(50) NOT NULL,
  `priority` VARCHAR(30) DEFAULT 'ROUTINE',
  `title_en` VARCHAR(255) NOT NULL,
  `title_rw` VARCHAR(255) NOT NULL,
  `content_en` TEXT NOT NULL,
  `content_rw` TEXT NOT NULL,
  `status` ENUM('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED') DEFAULT 'DELIVERED',
  `provider` VARCHAR(100),
  `provider_reference` VARCHAR(100),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `messages` (`id`, `school_id`, `recipient_id`, `recipient_name`, `recipient_phone`, `channel`, `category`, `priority`, `title_en`, `title_rw`, `content_en`, `content_rw`, `status`, `provider`, `provider_reference`) VALUES
('msg-01', 'school-es-rubengera-01', 'grd-chantal-01', 'Chantal Mukantabana', '+250 788 888 707', 'WHATSAPP', 'HEALTH', 'URGENT', 'URGENT HEALTH ALERT: Kevin Ishimwe at Infirmary', 'UBUTUMWA BW’UBUZIMA BWIKUBYE: Kevin Ishimwe ari mu Buvuzi bw’Ishuri', 'Dear Chantal, your son Kevin Ishimwe (L4 SOD A) is currently receiving care at the school infirmary with high fever (39.2°C). Please review in SchoolCare app or call Nurse Aline.', 'Mubyeyi Chantal, umuhungu wawe Kevin Ishimwe (L4 SOD A) ari kwitabwaho mu buvuzi bw’ishuri afite umuriro mwinshi (39.2°C). Nyamuneka kanda hano wemeze.', 'ACKNOWLEDGED', 'WHATSAPP_CLOUD_API', 'WAMID-EMG-2026-42'),
('msg-02', 'school-es-rubengera-01', 'grd-celestin-02', 'Celestin Gasana', '+250 788 456 789', 'SMS', 'ATTENDANCE', 'ROUTINE', 'Absence Notification: Eric Uwitonze', 'Kumenyesha Gusiba: Eric Uwitonze', 'Notice: Eric Uwitonze (L4 SOD A) was recorded absent today 05/11/2026 at morning roll call.', 'Icyitonderwa: Eric Uwitonze (L4 SOD A) ntiyabonetse ku ishuri uyu munsi 05/11/2026 mu gitondo.', 'DELIVERED', 'MTN_RW_SMS_GATEWAY', 'MTN-SMS-884920');

-- --------------------------------------------------------
-- Table: invoices & payments (Finance RWF)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `invoices`;
CREATE TABLE `invoices` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `invoice_number` VARCHAR(50) NOT NULL UNIQUE,
  `student_id` VARCHAR(50) NOT NULL,
  `student_name` VARCHAR(150) NOT NULL,
  `class_name` VARCHAR(100) NOT NULL,
  `term` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `total_amount_rwf` DECIMAL(12,2) NOT NULL,
  `paid_amount_rwf` DECIMAL(12,2) DEFAULT 0.00,
  `balance_rwf` DECIMAL(12,2) NOT NULL,
  `due_date` DATE NOT NULL,
  `status` ENUM('PENDING', 'PARTIAL', 'PAID', 'OVERDUE') DEFAULT 'PENDING',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `invoices` (`id`, `school_id`, `invoice_number`, `student_id`, `student_name`, `class_name`, `term`, `title`, `total_amount_rwf`, `paid_amount_rwf`, `balance_rwf`, `due_date`, `status`) VALUES
('inv-01', 'school-es-rubengera-01', 'INV-2026-0042', 'std-kevin-ishimwe-01', 'Kevin Ishimwe', 'Level 4 SOD A', 'Term 2', 'Term 2 Tuition & Practical Lab Fee', 85000.00, 50000.00, 35000.00, '2026-11-30', 'PARTIAL'),
('inv-02', 'school-es-rubengera-01', 'INV-2026-0043', 'std-divine-keza-02', 'Divine Keza', 'Level 4 SOD A', 'Term 2', 'Term 2 Tuition & Practical Lab Fee', 85000.00, 85000.00, 0.00, '2026-11-30', 'PAID'),
('inv-03', 'school-es-rubengera-01', 'INV-2026-0044', 'std-clarisse-uwera-06', 'Clarisse Uwera', 'Senior 3 A', 'Term 2', 'Term 2 O-Level Tuition Fee', 65000.00, 65000.00, 0.00, '2026-11-30', 'PAID');

DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `invoice_id` VARCHAR(50),
  `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
  `student_id` VARCHAR(50) NOT NULL,
  `student_name` VARCHAR(150) NOT NULL,
  `amount_rwf` DECIMAL(12,2) NOT NULL,
  `method` ENUM('MTN_MOMO', 'AIRTEL_MONEY', 'BANK_TRANSFER', 'CASH') DEFAULT 'MTN_MOMO',
  `reference` VARCHAR(100) NOT NULL UNIQUE,
  `payer_name` VARCHAR(150) NOT NULL,
  `payer_phone` VARCHAR(50) NOT NULL,
  `status` ENUM('COMPLETED', 'PENDING', 'FAILED') DEFAULT 'COMPLETED',
  `payment_date` DATE DEFAULT CURRENT_DATE,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `payments` (`id`, `school_id`, `invoice_id`, `receipt_number`, `student_id`, `student_name`, `amount_rwf`, `method`, `reference`, `payer_name`, `payer_phone`, `status`, `payment_date`) VALUES
('pay-01', 'school-es-rubengera-01', 'inv-01', 'REC-2026-0091', 'std-kevin-ishimwe-01', 'Kevin Ishimwe', 50000.00, 'MTN_MOMO', 'MTN-MOMO-RW-9823412', 'Chantal Mukantabana', '+250 788 888 707', 'COMPLETED', '2026-10-22'),
('pay-02', 'school-es-rubengera-01', 'inv-02', 'REC-2026-0092', 'std-divine-keza-02', 'Divine Keza', 85000.00, 'BANK_TRANSFER', 'BK-TRF-003847291', 'Angelique Nyirandikubwimana', '+250 788 912 345', 'COMPLETED', '2026-10-18');

-- --------------------------------------------------------
-- Table: audit_logs (Law No 058/2021 Compliance)
-- --------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(100) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `user_id` VARCHAR(50),
  `user_name` VARCHAR(150),
  `user_role` VARCHAR(50),
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` VARCHAR(100) NOT NULL,
  `details` TEXT,
  `ip_address` VARCHAR(50),
  `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `audit_logs` (`id`, `school_id`, `user_id`, `user_name`, `user_role`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`) VALUES
('log-01', 'school-es-rubengera-01', 'user-nurse', 'Aline Uwimana', 'NURSE', 'CREATE_HEALTH_INCIDENT', 'HEALTH_INCIDENT', 'inc-2026-0042', 'Logged urgent health incident for Kevin Ishimwe (Temp 39.2°C). Dispatched guardian SMS/WhatsApp notification.', '197.243.18.42'),
('log-02', 'school-es-rubengera-01', 'user-parent', 'Chantal Mukantabana', 'PARENT', 'ACKNOWLEDGE_HEALTH_ALERT', 'HEALTH_INCIDENT', 'inc-2026-0042', 'Guardian acknowledged emergency alert via SchoolCare Parent Portal with hospital transfer note.', '197.243.22.11');

SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- ADMISSION SYSTEM TABLES (Safe Migration — No Existing Data Modified)
-- ====================================================================

-- Admission Applications
CREATE TABLE IF NOT EXISTS `admission_applications` (
  `id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `reference_number` VARCHAR(50) NOT NULL UNIQUE,
  `application_type` ENUM('NEW_STUDENT_SENIOR4', 'SCHOOL_TRANSFER', 'OTHER_ADMISSION') NOT NULL,
  `status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED') DEFAULT 'SUBMITTED',
  `academic_year` VARCHAR(20) NOT NULL,

  `applicant_full_name` VARCHAR(255) NOT NULL,
  `applicant_dob` DATE NOT NULL,
  `applicant_gender` ENUM('M', 'F'),
  `applicant_phone` VARCHAR(50) NOT NULL,
  `applicant_email` VARCHAR(255),
  `applicant_district` VARCHAR(100) NOT NULL,
  `applicant_sector` VARCHAR(100),
  `applicant_cell` VARCHAR(100),
  `applicant_residence` TEXT NOT NULL,

  `guardian_full_name` VARCHAR(255) NOT NULL,
  `guardian_phone` VARCHAR(50) NOT NULL,
  `guardian_relationship` VARCHAR(50) NOT NULL,

  `previous_school_name` VARCHAR(255),
  `previous_school_location` VARCHAR(255),
  `academic_year_completed` VARCHAR(20),
  `senior3_completion_status` VARCHAR(100),
  `previous_combination` VARCHAR(255),
  `requested_level` VARCHAR(100),
  `requested_combination` VARCHAR(255),
  `previous_academic_performance` TEXT,
  `reason_for_choosing_school` TEXT,

  `current_school_name` VARCHAR(255),
  `current_school_location` VARCHAR(255),
  `current_class` VARCHAR(100),
  `current_level` VARCHAR(100),
  `transfer_academic_year` VARCHAR(20),
  `requested_class` VARCHAR(100),
  `previous_school_type` VARCHAR(100),
  `transfer_reason` VARCHAR(100),
  `transfer_reason_other` TEXT,

  `current_education_level` VARCHAR(100),
  `requested_education_level` VARCHAR(100),
  `previous_school_other` VARCHAR(255),
  `application_reason` TEXT,

  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` DATETIME,
  `reviewed_by` VARCHAR(50),
  `reviewed_by_name` VARCHAR(255),
  `review_notes` TEXT,
  `rejection_reason` TEXT,

  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admission Documents
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
  FOREIGN KEY (`application_id`) REFERENCES `admission_applications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admission Review Notes
CREATE TABLE IF NOT EXISTS `admission_review_notes` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `reviewer_id` VARCHAR(50) NOT NULL,
  `reviewer_name` VARCHAR(255) NOT NULL,
  `reviewer_role` VARCHAR(50) NOT NULL,
  `note` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`application_id`) REFERENCES `admission_applications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admission Status History
CREATE TABLE IF NOT EXISTS `admission_status_history` (
  `id` VARCHAR(50) NOT NULL,
  `application_id` VARCHAR(50) NOT NULL,
  `from_status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'),
  `to_status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED') NOT NULL,
  `changed_by` VARCHAR(50) NOT NULL,
  `changed_by_name` VARCHAR(255) NOT NULL,
  `reason` TEXT,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`application_id`) REFERENCES `admission_applications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time codes for public application tracking (no account required)
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
  FOREIGN KEY (`application_id`) REFERENCES `admission_applications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
