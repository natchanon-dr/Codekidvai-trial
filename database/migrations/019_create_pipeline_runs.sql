-- Migration 019: mst_pipeline_runs — Pipeline Run History
-- Stores the history of analysis pipeline runs for each dataset.
-- run_type 'full_pipeline' triggers all four analysis sub-steps.
-- Individual sub-run types ('behavioral', 'sequential', 'semantic', 'assessment')
-- are recorded inside analysis_steps (jsonb) rather than as separate rows.

-- ── 1. Pipeline runs table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mst_pipeline_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id      uuid        NOT NULL REFERENCES public.mst_datasets(id) ON DELETE RESTRICT,
  run_type        text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  analysis_steps  jsonb,          -- Array of {analysis, status, started_at, completed_at, error}
  started_at      timestamptz,
  completed_at    timestamptz,
  error_summary   text,
  initiated_by    text,           -- user identifier (researcher email or participant_code)
  configuration   jsonb,          -- Optional run configuration snapshot
  result_version  text,           -- Artifact schema_version if produced
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_mst_pipeline_runs_run_type CHECK (
    run_type IN ('full_pipeline', 'behavioral', 'sequential', 'semantic', 'assessment')
  ),
  CONSTRAINT chk_mst_pipeline_runs_status CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_mst_pipeline_runs_dataset_id ON public.mst_pipeline_runs (dataset_id);
CREATE INDEX IF NOT EXISTS idx_mst_pipeline_runs_status     ON public.mst_pipeline_runs (status);
CREATE INDEX IF NOT EXISTS idx_mst_pipeline_runs_created_at ON public.mst_pipeline_runs (created_at DESC);

ALTER TABLE public.mst_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pipeline_runs" ON public.mst_pipeline_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.mst_pipeline_runs TO service_role;
