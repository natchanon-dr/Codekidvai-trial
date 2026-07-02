-- =============================================================================
-- Script 006: Clean up prototype task bank — keep SQL_TEXT only
--
-- Context:
--   The database currently contains mixed prototype tasks:
--   SQL_TEXT_*, SQL_BLOCK_*, SQL_PROC_*, ERD_*
--   This script removes all of those prototype tasks and their set mappings
--   so that script 007 can load a clean, English-only SQL_TEXT task bank.
--
-- Safety rules enforced:
--   - No tables are dropped or truncated.
--   - No user profiles (mst_profiles) are deleted.
--   - No auth users are deleted.
--   - No student activity data is deleted:
--       trn_learning_sessions, trn_attempts, trn_submissions, trn_event_logs
--   - Only rows matching the prototype task_code patterns are removed.
--   - Only set-task mappings for those prototype tasks are removed.
--   - Tasks outside these patterns are untouched.
--
-- Run order:
--   Step 1  Expand batch_type check constraint (add 'assignment_set', 'exam_set')
--   Step 2  Remove prototype set-task mappings
--   Step 3  Remove prototype tasks
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1: Expand batch_type check constraint
--
-- Migration 002 defined:
--   constraint chk_experiment_batch_type check (batch_type in ('pilot','main','practice'))
--
-- Script 007 needs to insert batches with batch_type = 'assignment_set' and
-- 'exam_set' which are the semantic values for the two set modes.
-- We drop the old constraint and recreate it with the expanded value list.
-- Migration 008's backfill logic already handles set_type_id for these values.
-- ---------------------------------------------------------------------------

alter table public.mst_experiment_batches
  drop constraint if exists chk_experiment_batch_type;

alter table public.mst_experiment_batches
  add constraint chk_experiment_batch_type
  check (batch_type in ('pilot', 'main', 'practice', 'assignment_set', 'exam_set'));


-- ---------------------------------------------------------------------------
-- STEP 2: Remove prototype set-task mappings
--
-- Delete rows from mst_assignment_set_tasks where the linked task has one of
-- the prototype task_code patterns. This must run BEFORE deleting from
-- mst_tasks to satisfy the foreign key constraint (even though cascade is
-- defined, being explicit avoids ambiguity and makes the intent clear).
--
-- Patterns removed:
--   SQL_TEXT_*   — prototype SQL text tasks (25 tasks from seed 001)
--   SQL_BLOCK_*  — prototype SQL block tasks (if any)
--   SQL_PROC_*   — prototype stored procedure tasks (10 tasks from seed 002)
--   ERD_*        — prototype ER diagram tasks (10 tasks from seed 003)
-- ---------------------------------------------------------------------------

delete from public.mst_assignment_set_tasks
where task_id in (
  select task_id
  from public.mst_tasks
  where task_code like 'SQL_TEXT_%'
     or task_code like 'SQL_BLOCK_%'
     or task_code like 'SQL_PROC_%'
     or task_code like 'ERD_%'
);


-- ---------------------------------------------------------------------------
-- STEP 3: Remove prototype tasks
--
-- Delete task rows matching the prototype code patterns.
-- Tasks with trn_learning_sessions, trn_attempts, trn_submissions, or
-- trn_event_logs linked via task_id use ON DELETE CASCADE — those
-- activity rows are NOT deleted by this script because only prototype
-- tasks (with generated code patterns) are targeted, and prototype tasks
-- should not have real student activity attached.
--
-- If a prototype task DOES have student activity linked:
--   The ON DELETE CASCADE on trn_learning_sessions(task_id) would delete
--   those sessions — but prototype tasks in a dev environment should not
--   have real student data. Stop and investigate before running if you
--   are unsure. The SELECT below lets you check first.
--
-- Verify before running (optional, read-only check):
--   select t.task_code, count(s.session_id) as session_count
--   from public.mst_tasks t
--   left join public.trn_learning_sessions s on s.task_id = t.task_id
--   where t.task_code like 'SQL_TEXT_%'
--      or t.task_code like 'SQL_BLOCK_%'
--      or t.task_code like 'SQL_PROC_%'
--      or t.task_code like 'ERD_%'
--   group by t.task_code
--   having count(s.session_id) > 0;
-- ---------------------------------------------------------------------------

delete from public.mst_tasks
where task_code like 'SQL_TEXT_%'
   or task_code like 'SQL_BLOCK_%'
   or task_code like 'SQL_PROC_%'
   or task_code like 'ERD_%';
