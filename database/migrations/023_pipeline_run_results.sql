-- Migration 023: Durable result storage for pipeline analysis steps
--
-- Each completed analysis step writes one row here. The idempotency_key
-- (run_id + ':' + analysis_type) prevents duplicate rows on worker retry.
--
-- Deployment order:
--   Apply this migration BEFORE starting the pipeline worker.
--   The worker's analysis executors INSERT here; if the table is absent
--   the INSERT throws and the run retries until max_attempts is reached.
--
-- Row lifecycle:
--   Created: worker marks a step complete.
--   Retained: indefinitely (historical record of analysis results).
--   Deleted: cascades when the parent mst_pipeline_runs row is deleted.

CREATE TABLE IF NOT EXISTS public.mst_pipeline_run_results (
  result_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid        NOT NULL REFERENCES public.mst_pipeline_runs(id) ON DELETE CASCADE,
  dataset_id      uuid        NOT NULL,
  analysis_type   text        NOT NULL,
  idempotency_key text        NOT NULL,
  result          jsonb       NOT NULL,
  schema_version  text        NOT NULL DEFAULT '1.0.0',
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_pipeline_run_results_analysis_type
    CHECK (analysis_type IN ('behavioral', 'sequential', 'semantic', 'assessment')),

  CONSTRAINT uq_pipeline_run_results_idempotency
    UNIQUE (idempotency_key)
);

-- Fast lookup: fetch all results for a given pipeline run (result display page).
CREATE INDEX IF NOT EXISTS idx_pipeline_run_results_run_id
  ON public.mst_pipeline_run_results (run_id);

-- Fast lookup: latest result per dataset per analysis type.
CREATE INDEX IF NOT EXISTS idx_pipeline_run_results_dataset_analysis
  ON public.mst_pipeline_run_results (dataset_id, analysis_type, created_at DESC);

-- Workers write results; Next.js API reads them.
GRANT SELECT, INSERT ON public.mst_pipeline_run_results TO service_role;

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- DROP INDEX IF EXISTS idx_pipeline_run_results_dataset_analysis;
-- DROP INDEX IF EXISTS idx_pipeline_run_results_run_id;
-- DROP TABLE IF EXISTS public.mst_pipeline_run_results;
