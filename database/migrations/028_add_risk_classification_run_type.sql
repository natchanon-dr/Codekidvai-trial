-- Migration 028: Add 'risk_classification' to mst_pipeline_runs.run_type
--
-- Context:
--   AI Model Layer (thesis Table 3.7) — LR (E1) + RF (E2) inference over
--   Behavioral (and, when available, Semantic) analysis results. Implemented
--   in lib/analysis/risk-classification.ts, registered in
--   worker/step-executors.ts as run_type "risk_classification".
--
--   The original CHECK constraint (migration 019) only allowed
--   'full_pipeline', 'behavioral', 'sequential', 'semantic', 'assessment'.
--   This migration extends it to also allow 'risk_classification' as an
--   independently-triggerable run type. It is intentionally NOT added to
--   the full_pipeline step list — it depends on Behavioral Analysis having
--   already completed for the dataset and is triggered separately.

ALTER TABLE public.mst_pipeline_runs
  DROP CONSTRAINT chk_mst_pipeline_runs_run_type;

ALTER TABLE public.mst_pipeline_runs
  ADD CONSTRAINT chk_mst_pipeline_runs_run_type CHECK (
    run_type IN ('full_pipeline', 'behavioral', 'sequential', 'semantic', 'assessment', 'risk_classification')
  );

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- ALTER TABLE public.mst_pipeline_runs
--   DROP CONSTRAINT chk_mst_pipeline_runs_run_type;
-- ALTER TABLE public.mst_pipeline_runs
--   ADD CONSTRAINT chk_mst_pipeline_runs_run_type CHECK (
--     run_type IN ('full_pipeline', 'behavioral', 'sequential', 'semantic', 'assessment')
--   );
-- (Rolling back will fail if any row already has run_type = 'risk_classification' —
-- delete or re-type those rows first.)
