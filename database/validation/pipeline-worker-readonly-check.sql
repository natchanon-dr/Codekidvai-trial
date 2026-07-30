-- Pipeline Worker — Read-Only Validation Queries
-- Run in DBeaver (or any psql client) against the production database.
-- Every query is SELECT-only or reads from system catalogs.
-- No data is inserted, updated, deleted, or any RPC called.
--
-- Usage in DBeaver:
--   Open SQL Editor → paste each section → Ctrl+Enter to run.
--   Compare actual results to the "Expected" comment on each query.
--
-- Sections:
--   [M1] Migration 019–023 schema presence
--   [M2] Worker column presence on mst_pipeline_runs
--   [M3] RPC function security (SECURITY DEFINER, search_path, GRANT)
--   [M4] Constraint presence
--   [M5] Migration 022 back-fill verification
--   [M6] Result table integrity
--   [M7] Live run health (optional — shows current pipeline state)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M1] Migration 019–023 — table presence
-- Expected: all 4 rows returned
-- ═══════════════════════════════════════════════════════════════════════════

SELECT table_name,
       pg_size_pretty(pg_total_relation_size(quote_ident(table_name)::regclass)) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'mst_datasets',            -- migration 018
    'mst_pipeline_runs',       -- migration 019
    'mst_pipeline_run_results' -- migration 023
  )
ORDER BY table_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected output:
--   mst_datasets             | <size>
--   mst_pipeline_run_results | <size>
--   mst_pipeline_runs        | <size>
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M2] Worker columns on mst_pipeline_runs (migrations 019–021)
-- Expected: all 12 column_name rows present
-- ═══════════════════════════════════════════════════════════════════════════

SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'mst_pipeline_runs'
  AND column_name  IN (
    'id', 'dataset_id', 'run_type', 'status',
    'analysis_steps', 'cancellation_requested', 'cancelled_at',
    'attempt_count', 'max_attempts', 'claimed_by',
    'lease_expires_at', 'idempotency_key'
  )
ORDER BY column_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected: 12 rows, one per column_name above.
-- Key checks:
--   attempt_count   → integer, NOT NULL, default 0
--   max_attempts    → integer, NOT NULL, default 3
--   claimed_by      → text, nullable (no default)
--   lease_expires_at→ timestamp with time zone, nullable
--   idempotency_key → text, nullable
--   cancellation_requested → boolean, NOT NULL, default false
--   cancelled_at    → timestamp with time zone, nullable
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M3a] RPC function presence and security settings
-- Expected: 3 rows, one per RPC
-- ═══════════════════════════════════════════════════════════════════════════

SELECT p.proname                                          AS function_name,
       p.prosecdef                                        AS security_definer,
       p.proconfig                                        AS config_params,
       pg_get_function_arguments(p.oid)                  AS arguments,
       pg_get_function_result(p.oid)                     AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fn_claim_pipeline_run',
    'fn_extend_pipeline_run_lease',
    'fn_recover_stale_pipeline_runs'
  )
ORDER BY p.proname;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected:
--   fn_claim_pipeline_run          | security_definer=true | {search_path=pg_catalog,public}
--   fn_extend_pipeline_run_lease   | security_definer=true | {search_path=pg_catalog,public}
--   fn_recover_stale_pipeline_runs | security_definer=true | {search_path=pg_catalog,public}
--
-- FAIL if:
--   security_definer = false  → function runs as caller, not owner
--   config_params IS NULL     → search_path not fixed (search_path injection risk)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M3b] RPC GRANT verification — only service_role should have EXECUTE
-- Expected: 3 rows (one per function), grantee = 'service_role' only
-- ═══════════════════════════════════════════════════════════════════════════

SELECT routine_name,
       grantee,
       privilege_type,
       is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'fn_claim_pipeline_run',
    'fn_extend_pipeline_run_lease',
    'fn_recover_stale_pipeline_runs'
  )
ORDER BY routine_name, grantee;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected:
--   fn_claim_pipeline_run          | service_role | EXECUTE
--   fn_extend_pipeline_run_lease   | service_role | EXECUTE
--   fn_recover_stale_pipeline_runs | service_role | EXECUTE
--
-- FAIL if:
--   grantee = 'PUBLIC' or 'anon' or 'authenticated' → REVOKE was ineffective
--   Any function is missing from results            → GRANT was not applied
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M4] Constraint presence
-- Expected: 5 constraints returned
-- ═══════════════════════════════════════════════════════════════════════════

SELECT conname          AS constraint_name,
       contype          AS type,        -- c=check, u=unique, f=foreign key
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
    'public.mst_pipeline_runs'::regclass,
    'public.mst_pipeline_run_results'::regclass
  )
  AND conname IN (
    'chk_mst_pipeline_runs_run_type',
    'chk_mst_pipeline_runs_status',
    'chk_pipeline_runs_cancellation_requested',
    'chk_pipeline_runs_cancelled_at_not_null',
    'uq_pipeline_run_results_idempotency'
  )
ORDER BY conname;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected: 5 rows.
--   chk_mst_pipeline_runs_run_type        → CHECK on run_type values
--   chk_mst_pipeline_runs_status          → CHECK on status values
--   chk_pipeline_runs_cancellation_requested → CHECK (status != 'cancelled' OR cancellation_requested)
--   chk_pipeline_runs_cancelled_at_not_null  → CHECK (status != 'cancelled' OR cancelled_at IS NOT NULL)
--   uq_pipeline_run_results_idempotency   → UNIQUE on idempotency_key
--
-- FAIL if any row is missing → migration was not applied or was rolled back.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M4b] Partial indexes for worker polling
-- Expected: 2 rows
-- ═══════════════════════════════════════════════════════════════════════════

SELECT indexname,
       indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'mst_pipeline_runs'
  AND indexname  IN (
    'uidx_mst_pipeline_runs_idempotency_key',
    'idx_mst_pipeline_runs_worker_poll'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected:
--   uidx_mst_pipeline_runs_idempotency_key → UNIQUE INDEX WHERE idempotency_key IS NOT NULL
--   idx_mst_pipeline_runs_worker_poll      → INDEX on created_at WHERE status = 'pending'
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M5] Migration 022 back-fill — no cancelled row should have NULL cancelled_at
-- Expected: count = 0
-- ═══════════════════════════════════════════════════════════════════════════

SELECT count(*) AS orphaned_cancelled_rows
FROM public.mst_pipeline_runs
WHERE status       = 'cancelled'
  AND cancelled_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected: 0
-- FAIL if > 0 → migration 022 back-fill was not applied, or a new cancelled row
--               was written without cancelled_at (constraint enforcement gap).
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M5b] Verify the constraint actually fires — constraint definition check
-- (Read-only alternative to trying an invalid INSERT)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.mst_pipeline_runs'::regclass
  AND conname  = 'chk_pipeline_runs_cancelled_at_not_null';

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected:
--   CHECK ((status <> 'cancelled'::text OR cancelled_at IS NOT NULL))
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M6] mst_pipeline_run_results — schema correctness
-- ═══════════════════════════════════════════════════════════════════════════

-- [M6a] Column presence
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'mst_pipeline_run_results'
ORDER BY ordinal_position;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected columns (in order):
--   result_id       uuid        NOT NULL  gen_random_uuid()
--   run_id          uuid        NOT NULL  —
--   dataset_id      uuid        NOT NULL  —
--   analysis_type   text        NOT NULL  —
--   idempotency_key text        NOT NULL  —
--   result          jsonb       NOT NULL  —
--   schema_version  text        NOT NULL  '1.0.0'
--   created_at      timestamptz NOT NULL  now()
-- ─────────────────────────────────────────────────────────────────────────────

-- [M6b] GRANT check — service_role has SELECT + INSERT; no UPDATE/DELETE
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'mst_pipeline_run_results'
ORDER BY grantee, privilege_type;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected: service_role with INSERT and SELECT only.
-- FAIL if UPDATE or DELETE appear (would allow workers to overwrite results).
-- ─────────────────────────────────────────────────────────────────────────────

-- [M6c] Result idempotency index
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'mst_pipeline_run_results';

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected indexes:
--   mst_pipeline_run_results_pkey           — PRIMARY KEY on result_id
--   uq_pipeline_run_results_idempotency     — UNIQUE on idempotency_key
--   idx_pipeline_run_results_run_id         — on run_id (result page lookup)
--   idx_pipeline_run_results_dataset_analysis — on (dataset_id, analysis_type, created_at DESC)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M7] Live run health — current pipeline state overview (optional)
-- Safe to run against production; read-only.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
    status,
    count(*)                                  AS run_count,
    max(attempt_count)                        AS max_attempts_seen,
    count(*) FILTER (WHERE claimed_by IS NOT NULL) AS currently_claimed,
    count(*) FILTER (
      WHERE status = 'running'
        AND lease_expires_at < now()
    )                                         AS stale_runs,
    count(*) FILTER (
      WHERE status = 'cancelled'
        AND cancelled_at IS NULL
    )                                         AS cancelled_missing_timestamp
FROM public.mst_pipeline_runs
GROUP BY status
ORDER BY status;

-- ─────────────────────────────────────────────────────────────────────────────
-- Key checks:
--   stale_runs = 0              → no hung workers (recovery loop is healthy)
--   cancelled_missing_timestamp = 0 → migration 022 back-fill is complete
--   currently_claimed > 0       → a worker is actively processing (expected if running)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M7b] Deferred step correctness — semantic must never appear in results table
-- (semantic is Phase 5 deferred; its result should never be persisted)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT count(*) AS semantic_result_rows_should_be_zero
FROM public.mst_pipeline_run_results
WHERE analysis_type = 'semantic';

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected: 0
-- The processor marks semantic as "deferred" (not "completed"),
-- so the executor never runs and never persists a result.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- [M7c] Result schema version check — all results should be schema 1.0.0
-- ═══════════════════════════════════════════════════════════════════════════

SELECT schema_version, analysis_type, count(*) AS result_count
FROM public.mst_pipeline_run_results
GROUP BY schema_version, analysis_type
ORDER BY schema_version, analysis_type;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expected: all rows have schema_version = '1.0.0'
-- If results exist, confirms executors are persisting with the correct version.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- SUMMARY
-- Run all sections above. For each section note PASS or FAIL.
--
--   [M1] Table presence                → PASS if 3 rows returned
--   [M2] Worker columns                → PASS if 12 rows returned with correct types
--   [M3a] RPC security (DEFINER)       → PASS if all 3 have security_definer=true + config_params
--   [M3b] RPC GRANT                    → PASS if grantee=service_role only (no PUBLIC/anon)
--   [M4] Constraint presence           → PASS if 5 rows returned
--   [M4b] Partial indexes              → PASS if 2 rows returned
--   [M5] 022 back-fill                 → PASS if count = 0
--   [M5b] Constraint definition        → PASS if CHECK includes cancelled_at IS NOT NULL
--   [M6a] Result columns               → PASS if 8 columns in correct order
--   [M6b] Result GRANTs                → PASS if INSERT+SELECT only, no UPDATE/DELETE
--   [M6c] Result indexes               → PASS if 4 indexes returned
--   [M7] Live run health               → PASS if stale_runs=0, cancelled_missing=0
--   [M7b] Semantic result rows         → PASS if 0
--   [M7c] Result schema version        → PASS if all rows = '1.0.0'
-- ═══════════════════════════════════════════════════════════════════════════
