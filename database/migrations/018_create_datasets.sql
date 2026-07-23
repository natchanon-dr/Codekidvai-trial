-- Migration 018: mst_datasets — Research Dataset Registry
-- Creates the dataset registry table and a safe code-allocation mechanism.
-- Code format: [batch_code:1][activity_code:1][task_code:2][running_number:4_zero_padded]
-- Example: MAQT0001 (Main / Assignment / SQL Query / run #1)
--          MAEX0001 (Main / Assignment / Exam — no task type)
--
-- NOTE: batch_type values here use 'trial' (not 'practice').
--       The existing mst_experiment_batches CHECK still uses 'practice'.
--       A follow-up migration to align mst_experiment_batches is deferred.

-- ── 1. Dataset counters (safe serial per 4-char prefix) ─────────────────────

CREATE TABLE IF NOT EXISTS public.mst_dataset_counters (
  prefix    varchar(4)  PRIMARY KEY,
  next_val  integer     NOT NULL DEFAULT 1,
  CONSTRAINT chk_mst_dataset_counters_next_val CHECK (next_val BETWEEN 1 AND 10000)
);

ALTER TABLE public.mst_dataset_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_counters" ON public.mst_dataset_counters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.mst_dataset_counters TO service_role;

-- ── 2. Dataset registry ──────────────────────────────────────────────────────
--
-- task_type is nullable — Exam datasets have no specific task type.
-- task_set_id stores the batch_id (mst_experiment_batches) the dataset covers.
-- No FK on task_set_id because it references a different table than mst_tasks.

CREATE TABLE IF NOT EXISTS public.mst_datasets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         varchar(8)  UNIQUE NOT NULL,
  name         text        NOT NULL,
  batch_type   text        NOT NULL,
  set_family   text        NOT NULL,
  task_type    text,                   -- nullable: NULL for Exam datasets
  class_id     uuid        REFERENCES public.tb_classes(class_id) ON DELETE SET NULL,
  task_set_id  uuid,                   -- batch_id from mst_experiment_batches (no FK, soft ref)
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,            -- soft-delete; NULL = live
  CONSTRAINT chk_mst_datasets_batch_type CHECK (batch_type IN ('main', 'trial', 'pilot')),
  CONSTRAINT chk_mst_datasets_set_family CHECK (set_family IN ('assignment', 'lab', 'exam')),
  CONSTRAINT chk_mst_datasets_task_type  CHECK (
    task_type IS NULL OR task_type IN ('sql_text', 'stored_procedure', 'sql_block', 'er_diagram')
  ),
  -- Exam must have no task_type; non-exam must have one
  CONSTRAINT chk_mst_datasets_exam_task_type CHECK (
    (set_family = 'exam' AND task_type IS NULL) OR
    (set_family <> 'exam' AND task_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_mst_datasets_batch_type   ON public.mst_datasets (batch_type);
CREATE INDEX IF NOT EXISTS idx_mst_datasets_set_family   ON public.mst_datasets (set_family);
CREATE INDEX IF NOT EXISTS idx_mst_datasets_task_type    ON public.mst_datasets (task_type);
CREATE INDEX IF NOT EXISTS idx_mst_datasets_active       ON public.mst_datasets (active);
CREATE INDEX IF NOT EXISTS idx_mst_datasets_archived_at  ON public.mst_datasets (archived_at);
CREATE INDEX IF NOT EXISTS idx_mst_datasets_class_id     ON public.mst_datasets (class_id);
CREATE INDEX IF NOT EXISTS idx_mst_datasets_task_set_id  ON public.mst_datasets (task_set_id);

ALTER TABLE public.mst_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_datasets" ON public.mst_datasets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.mst_datasets TO service_role;

-- ── 3. Safe code allocation function ────────────────────────────────────────
--
-- Parameters:
--   p_batch_code    'M' | 'T' | 'P'
--   p_activity_code 'A' | 'L' | 'E'
--   p_task_code     'QT' | 'QB' | 'SP' | 'ER' | 'EX' (EX = Exam, no task type)
--
-- Returns: 8-char code string, e.g. 'MAQT0001', 'MAEX0001'

CREATE OR REPLACE FUNCTION public.allocate_dataset_code(
  p_batch_code    text,
  p_activity_code text,
  p_task_code     text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix   varchar(4);
  v_next_val integer;
  v_code     varchar(8);
BEGIN
  v_prefix := p_batch_code || p_activity_code || p_task_code;

  -- Ensure counter row exists
  INSERT INTO public.mst_dataset_counters (prefix, next_val)
  VALUES (v_prefix, 1)
  ON CONFLICT (prefix) DO NOTHING;

  -- Lock counter row for this transaction
  SELECT next_val INTO v_next_val
  FROM public.mst_dataset_counters
  WHERE prefix = v_prefix
  FOR UPDATE;

  IF v_next_val > 9999 THEN
    RAISE EXCEPTION 'Code space exhausted for prefix %', v_prefix
      USING ERRCODE = 'P0001';
  END IF;

  -- Advance counter
  UPDATE public.mst_dataset_counters
  SET next_val = next_val + 1
  WHERE prefix = v_prefix;

  v_code := v_prefix || lpad(v_next_val::text, 4, '0');
  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_dataset_code(text, text, text) TO service_role;
