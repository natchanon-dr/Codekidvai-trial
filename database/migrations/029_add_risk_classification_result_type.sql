-- Migration 029: Add 'risk_classification' to mst_pipeline_run_results.analysis_type
--
-- Companion to migration 028 (mst_pipeline_runs.run_type). The risk_classification
-- worker step (lib/analysis/risk-classification.ts) persists its output via
-- persistResult(runId, datasetId, "risk_classification", result), which writes
-- into mst_pipeline_run_results.analysis_type — currently restricted by migration
-- 023 to 'behavioral', 'sequential', 'semantic', 'assessment'.

ALTER TABLE public.mst_pipeline_run_results
  DROP CONSTRAINT chk_pipeline_run_results_analysis_type;

ALTER TABLE public.mst_pipeline_run_results
  ADD CONSTRAINT chk_pipeline_run_results_analysis_type
    CHECK (analysis_type IN ('behavioral', 'sequential', 'semantic', 'assessment', 'risk_classification'));

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- ALTER TABLE public.mst_pipeline_run_results
--   DROP CONSTRAINT chk_pipeline_run_results_analysis_type;
-- ALTER TABLE public.mst_pipeline_run_results
--   ADD CONSTRAINT chk_pipeline_run_results_analysis_type
--     CHECK (analysis_type IN ('behavioral', 'sequential', 'semantic', 'assessment'));
-- (Rolling back will fail if any row already has analysis_type = 'risk_classification' —
-- delete or re-type those rows first.)
