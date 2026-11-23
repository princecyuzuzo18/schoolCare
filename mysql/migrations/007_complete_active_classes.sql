-- ====================================================================
-- SchoolCare: complete the active class ↔ combination catalogue in MariaDB.
-- Additive only (INSERT IGNORE / guarded UPDATE). Existing student, marks,
-- attendance and report-card rows are never changed.
-- ====================================================================

INSERT IGNORE INTO `classes`
  (`id`, `school_id`, `name`, `grade_level`, `stream`, `combination`, `room_number`, `student_count`, `class_teacher_name`, `status`)
VALUES
  ('class-l3-sod-a', 'school-es-rubengera-01', 'Level 3 SOD A', 'Level 3 RTB', 'A', 'Software Development (SOD)', 'ICT Lab', 0, 'Unassigned', 'ACTIVE'),
  ('class-l3-nit-a', 'school-es-rubengera-01', 'Level 3 NIT A', 'Level 3 RTB', 'A', 'Networking (NIT)', 'ICT Lab', 0, 'Unassigned', 'ACTIVE'),
  ('class-l4-nit-a', 'school-es-rubengera-01', 'Level 4 NIT A', 'Level 4 RTB', 'A', 'Networking (NIT)', 'ICT Lab', 0, 'Unassigned', 'ACTIVE'),
  ('class-l5-nit-a', 'school-es-rubengera-01', 'Level 5 NIT A', 'Level 5 RTB', 'A', 'Networking (NIT)', 'ICT Lab', 0, 'Unassigned', 'ACTIVE');

INSERT IGNORE INTO `combination_classes` (`id`, `school_id`, `combination_id`, `class_id`)
VALUES
  ('cc-sod-l3', 'school-es-rubengera-01', 'comb-sod', 'class-l3-sod-a'),
  ('cc-nit-l3', 'school-es-rubengera-01', 'comb-nit', 'class-l3-nit-a'),
  ('cc-nit-l4', 'school-es-rubengera-01', 'comb-nit', 'class-l4-nit-a'),
  ('cc-nit-l5', 'school-es-rubengera-01', 'comb-nit', 'class-l5-nit-a');

UPDATE `classes` SET `combination_id` = 'comb-sod'
WHERE `school_id` = 'school-es-rubengera-01' AND `combination_id` IS NULL
  AND `id` IN ('class-l3-sod-a','class-l4-sod-a','class-l5-sod-b');
UPDATE `classes` SET `combination_id` = 'comb-nit'
WHERE `school_id` = 'school-es-rubengera-01' AND `combination_id` IS NULL
  AND `id` IN ('class-l3-nit-a','class-l4-nit-a','class-l5-nit-a');
UPDATE `classes` SET `combination_id` = 'comb-accounting'
WHERE `school_id` = 'school-es-rubengera-01' AND `combination_id` IS NULL
  AND `id` IN ('class-l3-accounting-a','class-l4-accounting-a','class-l5-accounting-a');
UPDATE `classes` SET `combination_id` = 'comb-cst-archived'
WHERE `school_id` = 'school-es-rubengera-01' AND `combination_id` IS NULL AND `id` = 'class-l4-cst';
UPDATE `classes` SET `combination_id` = 'comb-general-science-archived'
WHERE `school_id` = 'school-es-rubengera-01' AND `combination_id` IS NULL AND `id` = 'class-s3-a';
