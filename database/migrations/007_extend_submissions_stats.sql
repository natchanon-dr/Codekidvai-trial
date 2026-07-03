-- Migration 007: Extend trn_submissions with batch_id and learning stats
-- Adds per-student-batch-task unique submission tracking with run/attempt counts

-- 1. Add batch_id and stats columns
ALTER TABLE public.trn_submissions
ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.mst_experiment_batches(batch_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS total_run_count int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_attempt_count int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_correct_at timestamptz,
ADD COLUMN IF NOT EXISTS time_to_first_correct_sec int,
ADD COLUMN IF NOT EXISTS hint_viewed boolean NOT NULL DEFAULT false;

-- 2. Remove old unique constraint on session_id (one submission per session → one per student+batch+task)
ALTER TABLE public.trn_submissions
DROP CONSTRAINT IF EXISTS trn_submissions_session_id_key;

-- 3. Add new unique constraint: one record per student per batch per task
ALTER TABLE public.trn_submissions
ADD CONSTRAINT trn_submissions_student_batch_task_unique
UNIQUE (profile_id, batch_id, task_id);

-- 4. Remove orphaned records that have no batch_id (old test data)
DELETE FROM public.trn_submissions WHERE batch_id IS NULL;
