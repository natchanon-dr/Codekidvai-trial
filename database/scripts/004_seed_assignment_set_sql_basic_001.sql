-- =============================================================================
-- Seed: Assignment Set — SQL Basic 001
-- Maps SQL_TEXT_001 through SQL_TEXT_020 as a practice assignment set.
--
-- WARNING: mst_experiment_batches.batch_type has a check constraint that only
-- accepts ('pilot', 'main', 'practice'). The values 'assignment_set' and
-- 'exam_set' are NOT valid. This seed uses batch_type = 'practice' to
-- represent an assignment (practice) set. The new set_type_id column from
-- migration 008 stores the semantic value: 1 = ASSIGNMENT_SET.
-- =============================================================================

-- Step 1: Insert the experiment batch (assignment set header)
insert into public.mst_experiment_batches (
  batch_code,
  batch_name,
  batch_type,         -- constraint: must be 'pilot' | 'main' | 'practice'
  batch_description,
  status,
  -- new columns from migration 008 (add IF NOT EXISTS guard protects if 008 not yet run)
  set_type_id,        -- 1 = ASSIGNMENT_SET
  feedback_policy_id, -- 1 = IMMEDIATE
  attempt_policy_id,  -- 3 = UNLIMITED
  visibility_policy_id, -- 1 = VISIBLE_TO_STUDENT
  allow_run,
  allow_multiple_attempts,
  show_expected_result,
  show_score_to_student,
  show_hint,
  metadata_json
)
values (
  'SQL_ASSIGNMENT_BASIC_001',
  'SQL Basic Assignment Set 001',
  'practice',
  'Practice assignment set covering SQL fundamentals: SELECT, WHERE, ORDER BY, GROUP BY, JOIN, aggregates, and subqueries (tasks 001–020).',
  'active',
  1,
  1,
  3,
  1,
  true,
  true,
  true,
  true,
  true,
  '{"set_category":"sql_text","level":"basic","target_audience":"beginner"}'
)
on conflict (batch_code) do update set
  batch_name           = excluded.batch_name,
  batch_description    = excluded.batch_description,
  status               = excluded.status,
  set_type_id          = excluded.set_type_id,
  feedback_policy_id   = excluded.feedback_policy_id,
  attempt_policy_id    = excluded.attempt_policy_id,
  visibility_policy_id = excluded.visibility_policy_id,
  allow_run            = excluded.allow_run,
  allow_multiple_attempts = excluded.allow_multiple_attempts,
  show_expected_result = excluded.show_expected_result,
  show_score_to_student = excluded.show_score_to_student,
  show_hint            = excluded.show_hint,
  metadata_json        = excluded.metadata_json,
  updated_at           = now();


-- Step 2: Map tasks SQL_TEXT_001 through SQL_TEXT_020 into the assignment set
-- mst_assignment_set_tasks(batch_id, task_id, task_order, is_required)
-- Requires mst_assignment_set_tasks from migration 008.

insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required)
select
  b.batch_id,
  t.task_id,
  mapping.task_order,
  true as is_required
from (
  values
    ('SQL_TEXT_001',  1),
    ('SQL_TEXT_002',  2),
    ('SQL_TEXT_003',  3),
    ('SQL_TEXT_004',  4),
    ('SQL_TEXT_005',  5),
    ('SQL_TEXT_006',  6),
    ('SQL_TEXT_007',  7),
    ('SQL_TEXT_008',  8),
    ('SQL_TEXT_009',  9),
    ('SQL_TEXT_010', 10),
    ('SQL_TEXT_011', 11),
    ('SQL_TEXT_012', 12),
    ('SQL_TEXT_013', 13),
    ('SQL_TEXT_014', 14),
    ('SQL_TEXT_015', 15),
    ('SQL_TEXT_016', 16),
    ('SQL_TEXT_017', 17),
    ('SQL_TEXT_018', 18),
    ('SQL_TEXT_019', 19),
    ('SQL_TEXT_020', 20)
) as mapping(task_code, task_order)
inner join public.mst_tasks t         on t.task_code  = mapping.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'SQL_ASSIGNMENT_BASIC_001'
on conflict (batch_id, task_id) do update set
  task_order  = excluded.task_order,
  is_required = excluded.is_required,
  updated_at  = now();
