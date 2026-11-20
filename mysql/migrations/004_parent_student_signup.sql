-- SchoolCare parent/student self-service sign-up.
-- Additive only: creates new tables and never drops, resets or overwrites existing data.

CREATE TABLE IF NOT EXISTS account_signup_requests (
  id VARCHAR(100) NOT NULL,
  school_id VARCHAR(50) NOT NULL,
  role_id ENUM('PARENT', 'STUDENT') NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  admission_number VARCHAR(50) NOT NULL,
  student_id VARCHAR(50) NULL,
  guardian_id VARCHAR(50) NULL,
  contact_type ENUM('EMAIL', 'SMS', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
  verification_contact VARCHAR(255) NULL,
  contact_hash VARCHAR(128) NOT NULL,
  code_hash VARCHAR(128) NULL,
  code_expires_at DATETIME NULL,
  attempts INT NOT NULL DEFAULT 0,
  status ENUM('PENDING', 'VERIFIED', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  requires_manual_review TINYINT(1) NOT NULL DEFAULT 0,
  review_notes TEXT NULL,
  reviewed_by VARCHAR(50) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_signup_status (status),
  KEY idx_signup_email (email),
  KEY idx_signup_student (student_id),
  KEY idx_signup_admission (admission_number),
  CONSTRAINT fk_signup_school FOREIGN KEY (school_id) REFERENCES schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_signup_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL,
  CONSTRAINT fk_signup_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_student_links (
  user_id VARCHAR(50) NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  scope ENUM('PARENT', 'STUDENT') NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, student_id, scope),
  KEY idx_account_student_scope (scope),
  KEY idx_account_student_student (student_id),
  CONSTRAINT fk_account_student_user FOREIGN KEY (user_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_account_student_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_guardian_links (
  user_id VARCHAR(50) NOT NULL,
  guardian_id VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, guardian_id),
  UNIQUE KEY uq_account_guardian_guardian (guardian_id),
  CONSTRAINT fk_account_guardian_user FOREIGN KEY (user_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_account_guardian_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_signup_students (
  request_id VARCHAR(100) NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  admission_number VARCHAR(50) NOT NULL,
  PRIMARY KEY (request_id, student_id),
  KEY idx_signup_student_request_student (student_id),
  CONSTRAINT fk_signup_student_request FOREIGN KEY (request_id) REFERENCES account_signup_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_signup_student_record FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
