-- =============================================================================
-- Seed: Exam Set — EQT0001 (SQL Query Text, Basic, Set 1)
--
-- NOTE: Script 007 is the canonical seed for EQT0001 and the selected exam tasks.
-- This script is kept for reference and re-runnable safety.
--
-- Batch code   : EQT0001  (E = Exam, QT = Query Text, 0001 = first)
-- Task codes   : 10 tasks selected from the QT bank
-- set_type_id  : 2 = EXAM_SET
--
-- Selected tasks (easy -> hard):
--   order 1  -> QT0001  SELECT all
--   order 2  -> QT0003  WHERE filter by grade
--   order 3  -> QT0005  ORDER BY name
--   order 4  -> QT0010  Three-table JOIN
--   order 5  -> QT0013  HAVING clause
--   order 6  -> QT0015  WHERE OR
--   order 7  -> QT0018  SUM per assignment
--   order 8  -> QT0020  Subquery above-average
--   order 9  -> QT0025  Top scorers per course
--   order 10 -> QT0030  Full mixed report
-- =============================================================================

-- Step 1: Upsert batch header
insert into public.mst_experiment_batches (
  batch_code,
  batch_name,
  batch_type,
  batch_description,
  status,
  task_family_code,
  batch_running_no,
  set_type_id,
  feedback_policy_id,
  attempt_policy_id,
  visibility_policy_id,
  allow_run,
  allow_multiple_attempts,
  show_expected_result,
  show_score_to_student,
  show_hint,
  metadata_json
)
values (
  'EQT0001',
  'ชุดแบบทดสอบ SQL แบบเขียนคำสั่ง ชุดที่ 1',
  'exam_set',
  'ชุดแบบทดสอบสำหรับประเมินความสามารถในการเขียนคำสั่ง SQL พื้นฐาน ผู้เรียนต้องเขียนคำตอบด้วยตนเองจากโจทย์ที่กำหนด โดยไม่แสดงเฉลยหรือคำใบ้ระหว่างทำแบบทดสอบ',
  'active',
  'QT',
  1,
  2,
  2,
  2,
  2,
  true,
  false,
  false,
  false,
  false,
  '{"set_category":"sql_text","level":"basic","exam_type":"summative","target_audience":"beginner","task_count":10}'
)
on conflict (batch_code) do update set
  batch_name              = excluded.batch_name,
  batch_description       = excluded.batch_description,
  batch_type              = excluded.batch_type,
  status                  = excluded.status,
  task_family_code        = excluded.task_family_code,
  batch_running_no        = excluded.batch_running_no,
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


-- Step 2: Map 10 selected tasks into EQT0001
insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required, is_active, set_task_code)
select
  b.batch_id,
  t.task_id,
  m.task_order,
  true,
  true,
  b.batch_code || '_' || lpad(m.task_order::text, 4, '0')
from (
  values
    ('QT0001',  1),
    ('QT0003',  2),
    ('QT0005',  3),
    ('QT0010',  4),
    ('QT0013',  5),
    ('QT0015',  6),
    ('QT0018',  7),
    ('QT0020',  8),
    ('QT0025',  9),
    ('QT0030', 10)
) as m(task_code, task_order)
inner join public.mst_tasks              t on t.task_code  = m.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'EQT0001'
on conflict (batch_id, task_id) do update set
  task_order    = excluded.task_order,
  is_required   = excluded.is_required,
  is_active     = excluded.is_active,
  set_task_code = excluded.set_task_code,
  updated_at    = now();
