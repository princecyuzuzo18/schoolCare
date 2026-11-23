-- SchoolCare AI Assistant (additive, reversible by dropping these tables only).
-- All AI records are scoped by school_id and user_id. No existing table is altered.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id CHAR(36) NOT NULL,
  school_id VARCHAR(150) NOT NULL,
  user_id VARCHAR(150) NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_ai_conversation_owner (school_id, user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  school_id VARCHAR(150) NOT NULL,
  user_id VARCHAR(150) NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  sources JSON NULL DEFAULT NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_message_conversation (conversation_id, created_at),
  KEY idx_ai_message_owner (school_id, user_id, created_at),
  CONSTRAINT fk_ai_message_conversation FOREIGN KEY (conversation_id)
    REFERENCES ai_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_feedback (
  id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  school_id VARCHAR(150) NOT NULL,
  user_id VARCHAR(150) NOT NULL,
  helpful TINYINT(1) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_feedback_message_user (message_id, user_id),
  KEY idx_ai_feedback_owner (school_id, user_id),
  CONSTRAINT fk_ai_feedback_message FOREIGN KEY (message_id)
    REFERENCES ai_messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(150) NOT NULL,
  user_id VARCHAR(150) NOT NULL,
  user_role VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT '',
  status ENUM('OK','ERROR') NOT NULL,
  error_code VARCHAR(60) NULL DEFAULT NULL,
  latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_usage_school (school_id, created_at),
  KEY idx_ai_usage_status (status, error_code, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_settings (
  school_id VARCHAR(150) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  model VARCHAR(100) NOT NULL DEFAULT '',
  default_language VARCHAR(8) NOT NULL DEFAULT 'en',
  rate_limit_per_hour INT UNSIGNED NOT NULL DEFAULT 60,
  retention_days INT UNSIGNED NOT NULL DEFAULT 180,
  allowed_roles JSON NULL DEFAULT NULL,
  permitted_tools JSON NULL DEFAULT NULL,
  updated_by VARCHAR(150) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id CHAR(36) NOT NULL,
  school_id VARCHAR(150) NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  visibility ENUM('SCHOOL','SHARED') NOT NULL DEFAULT 'SCHOOL',
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT 'text/plain',
  content MEDIUMTEXT NOT NULL,
  status ENUM('PROCESSING','READY','ARCHIVED') NOT NULL DEFAULT 'READY',
  uploaded_by VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_knowledge_school (school_id, status, category),
  KEY idx_ai_knowledge_visibility (visibility, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
