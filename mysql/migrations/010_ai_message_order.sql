-- Add a monotonic sequence to AI messages so rapid turns in the same second
-- remain in insertion order for conversation history and regeneration.
-- Additive only; scoped entirely to the AI assistant tables.

SET @ai_seq_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_messages'
    AND COLUMN_NAME = 'seq'
);
SET @ai_seq_sql := IF(
  @ai_seq_exists = 0,
  'ALTER TABLE ai_messages ADD COLUMN seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY uq_ai_message_seq (seq)',
  'SELECT 1'
);
PREPARE ai_seq_stmt FROM @ai_seq_sql;
EXECUTE ai_seq_stmt;
DEALLOCATE PREPARE ai_seq_stmt;
