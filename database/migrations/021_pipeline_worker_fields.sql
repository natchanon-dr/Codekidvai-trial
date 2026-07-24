-- Migration 021: Durable worker fields for mst_pipeline_runs
--
-- Deployment order (Expand-Migrate-Contract):
--   1. Apply this migration. Existing rows are unaffected (all new columns have
--      safe defaults or are nullable). The API continues to work unchanged.
--   2. Deploy and start the worker process (worker/index.ts).
--   3. Apply migration 022 (cancelled_at NOT NULL constraint) after the worker
--      is confirmed to write cancelled_at atomically with status='cancelled'.
--
-- New columns:
--   attempt_count      — incremented on each claim; claim RPC rejects rows >= max_attempts
--   max_attempts       — retry ceiling; default 3
--   claimed_by         — worker ID string set during claim, cleared on terminal transition
--   lease_expires_at   — UTC timestamp; worker must heartbeat before this expires
--   idempotency_key    — client-controlled dedup key; UNIQUE (nullable values excluded)

-- ── 1. Worker control columns ─────────────────────────────────────────────────

ALTER TABLE public.mst_pipeline_runs
  ADD COLUMN IF NOT EXISTS attempt_count    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts     int         NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS claimed_by       text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key  text;

-- ── 2. Idempotency index ──────────────────────────────────────────────────────
-- NULL values do not participate in UNIQUE, so rows without an idempotency_key
-- are always allowed. Partial WHERE clause makes this explicit.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mst_pipeline_runs_idempotency_key
  ON public.mst_pipeline_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 3. Worker polling index ───────────────────────────────────────────────────
-- Supports the claim subquery: status='pending' ordered by created_at ASC.

CREATE INDEX IF NOT EXISTS idx_mst_pipeline_runs_worker_poll
  ON public.mst_pipeline_runs (created_at ASC)
  WHERE status = 'pending';

-- ── 4. Atomic claim RPC ───────────────────────────────────────────────────────
-- Selects the oldest eligible pending run and transitions it to 'running' in a
-- single statement. FOR UPDATE SKIP LOCKED prevents concurrent workers from
-- claiming the same row. Returns the updated row, or no rows if none available.
--
-- Eligibility: status = 'pending' AND attempt_count < max_attempts
-- Side effects: status → 'running', started_at set (first claim only),
--               claimed_by set, lease_expires_at set, attempt_count incremented.

REVOKE ALL ON FUNCTION fn_claim_pipeline_run(text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fn_claim_pipeline_run(
  p_worker_id     text,
  p_lease_seconds int DEFAULT 300
)
RETURNS SETOF public.mst_pipeline_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.mst_pipeline_runs
  SET
    status           = 'running',
    started_at       = COALESCE(started_at, now()),
    claimed_by       = p_worker_id,
    lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
    attempt_count    = attempt_count + 1
  WHERE id = (
    SELECT id
    FROM public.mst_pipeline_runs
    WHERE status = 'pending'
      AND attempt_count < max_attempts
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION fn_claim_pipeline_run(text, int) TO service_role;

-- ── 5. Lease extension RPC ────────────────────────────────────────────────────
-- Called by the worker heartbeat during long-running steps. Only succeeds when
-- the caller still owns the run (claimed_by = p_worker_id) and status is still
-- 'running'. Returns the number of rows updated (0 means the lease was stolen
-- or the run transitioned — the worker should treat this as a terminal signal).

REVOKE ALL ON FUNCTION fn_extend_pipeline_run_lease(uuid, text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fn_extend_pipeline_run_lease(
  p_run_id        uuid,
  p_worker_id     text,
  p_lease_seconds int DEFAULT 300
)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH updated AS (
    UPDATE public.mst_pipeline_runs
    SET lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval
    WHERE id           = p_run_id
      AND claimed_by   = p_worker_id
      AND status       = 'running'
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

GRANT EXECUTE ON FUNCTION fn_extend_pipeline_run_lease(uuid, text, int) TO service_role;

-- ── 6. Stale-run recovery RPC ─────────────────────────────────────────────────
-- Resets running runs whose lease has expired. Runs below max_attempts go back
-- to 'pending' for retry. Runs at max_attempts transition to 'failed'.
-- Intended to be called periodically by the worker's recovery loop.

REVOKE ALL ON FUNCTION fn_recover_stale_pipeline_runs() FROM PUBLIC;

CREATE OR REPLACE FUNCTION fn_recover_stale_pipeline_runs()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH recovered AS (
    UPDATE public.mst_pipeline_runs
    SET
      status           = CASE
                           WHEN attempt_count >= max_attempts THEN 'failed'
                           ELSE 'pending'
                         END,
      claimed_by       = NULL,
      lease_expires_at = NULL,
      error_summary    = CASE
                           WHEN attempt_count >= max_attempts
                           THEN 'Run failed: exceeded maximum retry attempts (worker lease expired).'
                           ELSE error_summary
                         END
    WHERE status           = 'running'
      AND lease_expires_at < now()
    RETURNING 1
  )
  SELECT count(*)::int FROM recovered;
$$;

GRANT EXECUTE ON FUNCTION fn_recover_stale_pipeline_runs() TO service_role;

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- DROP FUNCTION IF EXISTS fn_recover_stale_pipeline_runs();
-- DROP FUNCTION IF EXISTS fn_extend_pipeline_run_lease(uuid, text, int);
-- DROP FUNCTION IF EXISTS fn_claim_pipeline_run(text, int);
-- DROP INDEX IF EXISTS idx_mst_pipeline_runs_worker_poll;
-- DROP INDEX IF EXISTS uidx_mst_pipeline_runs_idempotency_key;
-- ALTER TABLE public.mst_pipeline_runs
--   DROP COLUMN IF EXISTS idempotency_key,
--   DROP COLUMN IF EXISTS lease_expires_at,
--   DROP COLUMN IF EXISTS claimed_by,
--   DROP COLUMN IF EXISTS max_attempts,
--   DROP COLUMN IF EXISTS attempt_count;
