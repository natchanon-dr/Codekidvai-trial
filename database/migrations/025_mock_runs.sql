-- Migration 025: Mock pipeline run history
--
-- Each row records one execution of a mock pipeline config.
-- The outcome jsonb stores the full MockOutcome payload returned by the
-- simulation SSE stream (dataset stats, step timings, log lines, etc.).
--
-- Deployment order:
--   Apply after migration 024 (this table references trn_mock_configs).
--
-- Row lifecycle:
--   Created: researcher clicks "Run Pipeline" for a config.
--   Updated: SSE stream writes outcome when the run completes or fails.
--   Retained: indefinitely (historical audit of mock runs).
--   Deleted: cascades when the parent trn_mock_configs row is deleted.

CREATE TABLE IF NOT EXISTS public.trn_mock_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id   uuid        NOT NULL
              REFERENCES public.trn_mock_configs(id) ON DELETE CASCADE,

  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- Full MockOutcome payload (null until the run finishes).
  outcome     jsonb,

  -- Snapshot of the config at run time (config may be edited later).
  config_snapshot jsonb   NOT NULL DEFAULT '{}',

  started_at  timestamptz,
  completed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_mock_runs_completed_at
    CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

-- Fast lookup: all runs for a given config (run history panel).
CREATE INDEX IF NOT EXISTS idx_mock_runs_config_id
  ON public.trn_mock_runs (config_id, created_at DESC);

-- Fast lookup: latest run per config (used to show last-run status in table).
CREATE INDEX IF NOT EXISTS idx_mock_runs_config_status
  ON public.trn_mock_runs (config_id, status, created_at DESC);

-- RLS: same pattern as trn_mock_configs — service_role only via API layer.
ALTER TABLE public.trn_mock_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY mock_runs_service_role
  ON public.trn_mock_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.trn_mock_runs;
