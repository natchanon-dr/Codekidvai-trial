-- Migration 026: Add simulation metadata snapshot column to trn_mock_configs
-- Stores at-save snapshot: dataset_type, code, activity_type, task_type,
-- simulation_seed, target_at_risk_rate, target_missing_submission_rate,
-- target_submission_rate. Immutable after creation.

ALTER TABLE public.trn_mock_configs
  ADD COLUMN IF NOT EXISTS simulation_metadata jsonb NOT NULL DEFAULT '{}';
