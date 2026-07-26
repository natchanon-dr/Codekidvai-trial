-- Migration 024: Mock pipeline configuration store
--
-- Stores persistent mock configurations created by researchers.
-- Each config defines the parameters for a simulated AI pipeline run:
-- cohort size, at-risk rate, missing-submission rate, activity type,
-- task type distribution, and optional linkage to a real class/task-set.
--
-- Deployment order:
--   Apply before migration 025 (trn_mock_runs references this table).
--
-- Row lifecycle:
--   Created: researcher clicks "+ Create Mock" in the MockLab UI.
--   Updated: researcher edits config via the Edit modal.
--   Soft-deleted: active = false (toggle in UI).
--   Hard-deleted: explicit DELETE (cascades to trn_mock_runs).

CREATE TABLE IF NOT EXISTS public.trn_mock_configs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL,
  name             text        NOT NULL DEFAULT '',

  -- Cohort parameters
  n_students       int         NOT NULL DEFAULT 10
                               CHECK (n_students BETWEEN 5 AND 200),
  at_risk_rate     int         NOT NULL DEFAULT 35
                               CHECK (at_risk_rate BETWEEN 0 AND 100),
  missing_rate     int         NOT NULL DEFAULT 7
                               CHECK (missing_rate BETWEEN 0 AND 100),
  seed             int         NOT NULL DEFAULT 42,

  -- Activity / task typing
  set_family       text        NOT NULL DEFAULT 'assignment'
                               CHECK (set_family IN ('assignment', 'lab', 'exam')),
  task_type_counts jsonb       NOT NULL DEFAULT '{}',

  -- Optional linkage to a real class/task-set
  task_set_id      uuid,
  task_ids         jsonb       NOT NULL DEFAULT '[]',

  -- Lifecycle
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_mock_configs_code UNIQUE (code)
);

-- Fast lookup: active configs ordered by creation date (main list view).
CREATE INDEX IF NOT EXISTS idx_mock_configs_active_created
  ON public.trn_mock_configs (active, created_at DESC);

-- Fast lookup: filter by activity type.
CREATE INDEX IF NOT EXISTS idx_mock_configs_set_family
  ON public.trn_mock_configs (set_family);

-- Auto-update updated_at on any row change.
CREATE OR REPLACE FUNCTION fn_touch_mock_config()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mock_configs_updated_at
  BEFORE UPDATE ON public.trn_mock_configs
  FOR EACH ROW EXECUTE FUNCTION fn_touch_mock_config();

-- RLS: researchers can read and write their own session's configs.
-- For now we enable RLS but grant full access to service_role only;
-- the Next.js API layer uses supabaseAdmin and enforces researcher auth.
ALTER TABLE public.trn_mock_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY mock_configs_service_role
  ON public.trn_mock_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_mock_configs_updated_at ON public.trn_mock_configs;
-- DROP FUNCTION IF EXISTS fn_touch_mock_config();
-- DROP TABLE IF EXISTS public.trn_mock_configs;
