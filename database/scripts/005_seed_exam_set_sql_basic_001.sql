-- =============================================================================
-- Seed: Exam Set — SQL Basic 001
-- Maps selected SQL_TEXT tasks as a summative exam set (10 tasks total).
--
-- Selected tasks:
--   task_order 1  → SQL_TEXT_001 (SELECT all)
--   task_order 2  → SQL_TEXT_003 (WHERE filter)
--   task_order 3  → SQL_TEXT_005 (ORDER BY)
--   task_order 4  → SQL_TEXT_013 (HAVING)
--   task_order 5  → SQL_TEXT_015 (WHERE OR)
--   task_order 6  → SQL_TEXT_021 (CASE WHEN)
--   task_order 7  → SQL_TEXT_022 (COUNT per section)
--   task_order 8  → SQL_TEXT_023 (ORDER BY multi)
--   task_order 9  → SQL_TEXT_024 (JOIN + GROUP BY)
--   task_order 10 → SQL_TEXT_025 (full pipeline)
--
-- WARNING: mst_experiment_batches.batch_type has a check constraint that only
-- accepts ('pilot', 'main', 'practice'). This seed uses batch_type = 'main'
-- to represent a summative exam set. The new set_type_id column from
-- migration 008 stores the semantic value: 2 = EXAM_SET.
--
-- Exam policy differences vs assignment set:
--   - feedback_policy_id = 4 (AFTER_DUE_DATE — students see results only after exam closes)
--   - attempt_policy_id  = 2 (SINGLE_ATTEMPT — one attempt only)
--   - show_expected_result = false
--   - show_hint = false
--   - allow_multiple_attempts = false
-- =============================================================================

-- Step 1: Insert the experiment batch (exam set header)
insert into public.mst_experiment_batches (
  batch_code,
  batch_name,
  batch_type,           -- constraint: must be 'pilot' | 'main' | 'practice'
  batch_description,
  status,
  set_type_id,          -- 2 = EXAM_SET
  feedback_policy_id,   -- 4 = AFTER_DUE_DATE
  attempt_policy_id,    -- 2 = SINGLE_ATTEMPT (max_attempts = 1)
  visibility_policy_id, -- 1 = VISIBLE_TO_STUDENT
  allow_run,
  allow_multiple_attempts,
  show_expected_result,
  show_score_to_student,
  show_hint,
  metadata_json
)
values (
  'SQL_EXAM_BASIC_001',
  'SQL Basic Exam Set 001',
  'main',
  'Summative exam covering SQL fundamentals. Students have one attempt. Feedback and expected output are released after the exam closes.',
  'active',
  2,
  4,
  2,
  1,
  false,
  false,
  false,
  false,
  false,
  '{"set_category":"sql_text","level":"basic","exam_type":"summative","target_audience":"beginner"}'
)
on conflict (batch_code) do update set
  batch_name              = excluded.batch_name,
  batch_description       = excluded.batch_description,
  status                  = excluded.status,
  set_type_id             = excluded.set_type_id,
  feedback_policy_id      = excluded.feedback_policy_id,
  attempt_policy_id       = excluded.attempt_policy_id,
  visibility_policy_id    = excluded.visibility_policy_id,
  allow_run               = excluded.allow_run,
  allow_multiple_attempts = excluded.allow_multiple_attempts,
  show_expected_result    = excluded.show_expected_result,
  show_score_to_student   = excluded.show_score_to_student,
  show_hint               = excluded.show_hint,
  metadata_json           = excluded.metadata_json,
  updated_at              = now();


-- Step 2: Map selected tasks into the exam set
insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required)
select
  b.batch_id,
  t.task_id,
  mapping.task_order,
  true as is_required
from (
  values
    ('SQL_TEXT_001',  1),
    ('SQL_TEXT_003',  2),
    ('SQL_TEXT_005',  3),
    ('SQL_TEXT_013',  4),
    ('SQL_TEXT_015',  5),
    ('SQL_TEXT_021',  6),
    ('SQL_TEXT_022',  7),
    ('SQL_TEXT_023',  8),
    ('SQL_TEXT_024',  9),
    ('SQL_TEXT_025', 10)
) as mapping(task_code, task_order)
inner join public.mst_tasks t              on t.task_code  = mapping.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'SQL_EXAM_BASIC_001'
on conflict (batch_id, task_id) do update set
  task_order  = excluded.task_order,
  is_required = excluded.is_required,
  updated_at  = now();
