-- Migration 022: Enforce cancelled_at IS NOT NULL when status = 'cancelled'
--
-- Prerequisites:
--   - Migration 020 (cancellation_requested + cancelled_at columns)
--   - Migration 021 (worker fields)
--   - Worker deployed and confirmed to write cancelled_at atomically with
--     status='cancelled' for all cancellation paths.
--
-- Back-fill rule for legacy cancelled rows:
--   Rows with status='cancelled' and cancelled_at IS NULL pre-date the worker.
--   We set cancelled_at = created_at as a conservative sentinel — it represents
--   the earliest possible bound on when the run was cancelled, and preserves the
--   ordering invariant (cancelled_at >= created_at). This is documented here so
--   downstream analysis can filter on a validity cutoff if needed.
--
-- Back-fill rows before adding the constraint so validation sees a consistent table.

UPDATE public.mst_pipeline_runs
SET cancelled_at = created_at
WHERE status      = 'cancelled'
  AND cancelled_at IS NULL;

ALTER TABLE public.mst_pipeline_runs
  ADD CONSTRAINT chk_pipeline_runs_cancelled_at_not_null
    CHECK (
      status != 'cancelled' OR cancelled_at IS NOT NULL
    );

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- ALTER TABLE public.mst_pipeline_runs
--   DROP CONSTRAINT IF EXISTS chk_pipeline_runs_cancelled_at_not_null;
--
-- (Back-filled cancelled_at values cannot be reverted automatically; those rows
-- now have cancelled_at = created_at as a historical marker.)
