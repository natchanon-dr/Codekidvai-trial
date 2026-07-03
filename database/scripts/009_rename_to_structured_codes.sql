-- =============================================================================
-- Script 009: Rename existing batch/task codes to structured format
--
-- Context:
--   Migration 009 added task_family_code, batch_running_no, set_task_code.
--   The existing rows in the database still have old-style codes:
--     SQL_ASSIGNMENT_BASIC_001  →  AQT0001
--     SQL_EXAM_BASIC_001        →  EQT0001
--     SQL_TEXT_001 … 030        →  QT0001 … QT0030
--
-- This script:
--   Step 1  Rename batch_code and populate new batch columns
--   Step 2  Rename task_code in mst_tasks
--   Step 3  Populate set_task_code in mst_assignment_set_tasks
--
-- Safety rules:
--   - No rows are deleted.
--   - No tables are dropped or truncated.
--   - No profile, session, attempt, or event data is touched.
--   - WHERE clauses target only the known old-style codes.
--   - Each UPDATE is idempotent (re-running is safe because the old codes
--     will not match after the first run).
--
-- Prerequisites: migration 009 must be run first.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1: Rename batch codes and populate new structured columns
-- ---------------------------------------------------------------------------

update public.mst_experiment_batches
set
  batch_code       = 'AQT0001',
  task_family_code = 'QT',
  batch_running_no = 1
where batch_code = 'SQL_ASSIGNMENT_BASIC_001';

update public.mst_experiment_batches
set
  batch_code       = 'EQT0001',
  task_family_code = 'QT',
  batch_running_no = 1
where batch_code = 'SQL_EXAM_BASIC_001';


-- ---------------------------------------------------------------------------
-- STEP 2: Rename task codes  SQL_TEXT_NNN  →  QT<NNNN>
--
-- Extracts the numeric suffix, casts to int to strip leading zeros, then
-- zero-pads to 4 digits with lpad.
--   SQL_TEXT_001  →  QT0001
--   SQL_TEXT_030  →  QT0030
-- ---------------------------------------------------------------------------

update public.mst_tasks
set task_code = 'QT' || lpad(
  substring(task_code from 'SQL_TEXT_0*(\d+)')::integer::text,
  4, '0'
)
where task_code like 'SQL_TEXT_%';


-- ---------------------------------------------------------------------------
-- STEP 3: Populate set_task_code in mst_assignment_set_tasks
--
-- Format: <batch_code>_<task_order zero-padded to 4 digits>
--   AQT0001 + task_order 1  →  AQT0001_0001
--   EQT0001 + task_order 3  →  EQT0001_0003
-- ---------------------------------------------------------------------------

update public.mst_assignment_set_tasks ast
set set_task_code = b.batch_code || '_' || lpad(ast.task_order::text, 4, '0')
from public.mst_experiment_batches b
where ast.batch_id     = b.batch_id
  and ast.set_task_code is null;
