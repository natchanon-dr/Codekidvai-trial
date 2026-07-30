-- Migration 020: Two-phase cancellation tracking for mst_pipeline_runs
--
-- Cancellation protocol:
--   Phase 1 — UI/API: SET cancellation_requested = true
--              (status stays 'pending' or 'running'; no immediate terminal flip)
--   Phase 2 — Worker: reads cancellation_requested, stops safely, then
--              SET status = 'cancelled', cancelled_at = now()
--
-- Terminal status rule:
--   A completed, failed, or cancelled run must not transition back to running.
--   Enforced at the application layer (API route guards).
--
-- Deferred to migration 021 (after PATCH route is updated to set both fields
-- atomically): the stricter constraint that cancelled_at IS NOT NULL whenever
-- status = 'cancelled'.

-- ── 1. Add new columns ────────────────────────────────────────────────────────

ALTER TABLE public.mst_pipeline_runs
  ADD COLUMN IF NOT EXISTS cancellation_requested boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz;

-- ── 2. Back-fill: ensure pre-existing cancelled rows satisfy the constraint ───
-- Safe no-op if no cancelled rows exist.
-- Must run BEFORE ADD CONSTRAINT so validation sees a consistent table.

UPDATE public.mst_pipeline_runs
SET cancellation_requested = true
WHERE status = 'cancelled'
  AND cancellation_requested = false;

-- ── 3. Consistency constraint ─────────────────────────────────────────────────
-- Prevents status = 'cancelled' from being written unless cancellation was
-- explicitly requested first.

ALTER TABLE public.mst_pipeline_runs
  ADD CONSTRAINT chk_pipeline_runs_cancellation_requested
    CHECK (
      status != 'cancelled' OR cancellation_requested = true
    );

-- ── 4. Partial index for worker and API polling ───────────────────────────────
-- Supports efficient lookup of runs awaiting cancellation acknowledgement:
--   WHERE cancellation_requested = true AND status IN ('pending', 'running')
-- Only rows with an active cancellation request appear in the index.

CREATE INDEX IF NOT EXISTS idx_mst_pipeline_runs_cancellation_requested
  ON public.mst_pipeline_runs (dataset_id)
  WHERE cancellation_requested = true;

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- ALTER TABLE public.mst_pipeline_runs
--   DROP CONSTRAINT IF EXISTS chk_pipeline_runs_cancellation_requested;
--
-- DROP INDEX IF EXISTS idx_mst_pipeline_runs_cancellation_requested;
--
-- ALTER TABLE public.mst_pipeline_runs
--   DROP COLUMN IF EXISTS cancelled_at,
--   DROP COLUMN IF EXISTS cancellation_requested;
