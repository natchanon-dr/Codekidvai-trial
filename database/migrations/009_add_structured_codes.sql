-- =============================================================================
-- Migration 009: Add structured code columns
--
-- Adds three new columns to support the structured batch/task/set-task code
-- design.  All additions use IF NOT EXISTS so this migration is idempotent.
-- No existing columns, rows, constraints, or keys are changed.
--
-- New columns:
--   mst_experiment_batches.task_family_code  varchar(2)
--     Short code for the task family:
--       QT = Query Text (SQL Text)
--       SP = Stored Procedure
--       ER = ER Diagram
--       QB = Query Block (SQL Block)
--
--   mst_experiment_batches.batch_running_no  integer
--     Sequential number within the (SetType, TaskFamily) combination.
--     Combined with SetType prefix and task_family_code gives the human-
--     readable batch_code, e.g. AQT0001.
--
--   mst_assignment_set_tasks.set_task_code  varchar(20)
--     Code of a task within a specific set.
--     Format: <batch_code>_<task_order zero-padded to 4 digits>
--     Examples: AQT0001_0001, EQT0001_0003
-- =============================================================================

alter table public.mst_experiment_batches
  add column if not exists task_family_code varchar(2),
  add column if not exists batch_running_no  integer;

alter table public.mst_assignment_set_tasks
  add column if not exists set_task_code varchar(20);
