-- Migration 028: Add 'final_result' run type
--
-- Final Result Analysis (Traditional Auto Grading / TAG — see
-- docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md) needs its own
-- pipeline-run type so it can follow the same "1 Dataset -> N independent
-- Analysis runs" pattern as behavioral/sequential/semantic/assessment.
--
-- Unlike those four, a 'final_result' run has no ML model to train — it
-- is a synchronous snapshot: the API computes the real recorded
-- trn_submissions.is_passed/final_score outcome for the dataset's
-- sessions and writes the result immediately (status goes straight to
-- 'completed', never 'pending'/'running' in practice, though those
-- statuses remain valid for consistency with the existing CHECK
-- constraint and worker states).
--
-- PRE-EXISTING SCHEMA DRIFT DISCOVERED WHILE WRITING THIS MIGRATION:
-- 3 rows in mst_pipeline_runs (run_type='risk_classification') and 3
-- matching rows in mst_pipeline_run_results (analysis_type=
-- 'risk_classification'), created 2026-09-05, already exist in the
-- database but were NEVER a valid value under the CHECK constraint
-- defined in migration 019/023. This means the live constraint had
-- already drifted from what's in the migration files (or was altered
-- outside a tracked migration) before this change. This migration adds
-- 'risk_classification' back into both allowed lists alongside
-- 'final_result' so the ALTER does not reject those pre-existing rows —
-- it does NOT grant any new capability going forward (no current code
-- path in this repo creates 'risk_classification' rows); it only makes
-- the constraint accurately describe data that already exists. This
-- drift is unrelated to Final Result Analysis and is flagged here for
-- visibility, not resolved further in this milestone.
--
-- This ONLY adds allowed values to two existing CHECK constraints. It
-- does not remove or rename any existing value, does not touch any
-- existing row, and does not change any other table.

-- ── 1. mst_pipeline_runs.run_type ────────────────────────────────────────────

ALTER TABLE public.mst_pipeline_runs
  DROP CONSTRAINT IF EXISTS chk_mst_pipeline_runs_run_type;

ALTER TABLE public.mst_pipeline_runs
  ADD CONSTRAINT chk_mst_pipeline_runs_run_type
  CHECK (run_type IN ('full_pipeline', 'behavioral', 'sequential', 'semantic', 'assessment', 'final_result', 'risk_classification'));

-- ── 2. mst_pipeline_run_results.analysis_type ───────────────────────────────

ALTER TABLE public.mst_pipeline_run_results
  DROP CONSTRAINT IF EXISTS chk_pipeline_run_results_analysis_type;

ALTER TABLE public.mst_pipeline_run_results
  ADD CONSTRAINT chk_pipeline_run_results_analysis_type
  CHECK (analysis_type IN ('behavioral', 'sequential', 'semantic', 'assessment', 'final_result', 'risk_classification'));

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- ALTER TABLE public.mst_pipeline_run_results DROP CONSTRAINT IF EXISTS chk_pipeline_run_results_analysis_type;
-- ALTER TABLE public.mst_pipeline_run_results ADD CONSTRAINT chk_pipeline_run_results_analysis_type
--   CHECK (analysis_type IN ('behavioral', 'sequential', 'semantic', 'assessment', 'risk_classification'));
-- ALTER TABLE public.mst_pipeline_runs DROP CONSTRAINT IF EXISTS chk_mst_pipeline_runs_run_type;
-- ALTER TABLE public.mst_pipeline_runs ADD CONSTRAINT chk_mst_pipeline_runs_run_type
--   CHECK (run_type IN ('full_pipeline', 'behavioral', 'sequential', 'semantic', 'assessment', 'risk_classification'));
--
-- Note: rollback will fail if any 'final_result' rows already exist in
-- either table — delete or migrate those rows first.
