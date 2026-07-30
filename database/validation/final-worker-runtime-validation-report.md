# Worker Pipeline — Final Validation Report

**Branch:** `feature/analytics-ui-cleanup`  
**Date:** 2026-07-24  
**Database:** Production Supabase (`wvkewdqfxmlhratairnh.supabase.co`)  
**Dataset:** PAQT0001 (`49e5e3e6-4589-4a43-b5b9-37d1008529d8`)

---

## 1. What Was Validated

End-to-end validation of the Phase 4 dataset analytics pipeline worker against the production
database, covering:

- Production schema correctness (migrations 019–023)
- RPC security and function grants
- Worker claim, processing, lease, and recovery paths
- Cancellation API signal layer
- Real worker execution against live production data

---

## 2. Schema Validation — 14/14 PASS

All checks run via read-only PostgREST queries against production.

| Check | Description | Result |
|---|---|---|
| M1 | Table presence: `mst_datasets`, `mst_pipeline_runs`, `mst_pipeline_run_results` | ✅ PASS |
| M2 | Worker columns on `mst_pipeline_runs` (12 columns, correct types and defaults) | ✅ PASS |
| M3a | RPC presence: all 3 functions with `SECURITY DEFINER` + fixed `search_path` | ✅ PASS |
| M3b | RPC grants: `EXECUTE` to `service_role` only; `PUBLIC`/`anon` revoked | ✅ PASS |
| M4 | Constraint presence: 5 constraints (run_type, status, cancellation, cancelled_at, idempotency) | ✅ PASS |
| M4b | Partial indexes: worker-poll index and idempotency unique index | ✅ PASS |
| M5 | Migration 022 back-fill: no cancelled rows with NULL `cancelled_at` | ✅ PASS |
| M5b | Constraint definition: `CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)` | ✅ PASS |
| M6a | Result table columns: 8 columns in correct order and types | ✅ PASS |
| M6b | Result table grants: `INSERT` + `SELECT` only; no `UPDATE`/`DELETE` | ✅ PASS |
| M6c | Result table indexes: 4 indexes (PK, idempotency UNIQUE, run_id, dataset+analysis) | ✅ PASS |
| M7 | Live run health: `stale_runs=0`, `cancelled_missing_timestamp=0` | ✅ PASS |
| M7b | Semantic result rows: 0 (executor is deferred; no result ever persisted) | ✅ PASS |
| M7c | Result schema version: all rows at `schema_version='1.0.0'` | ✅ PASS |

---

## 3. Controlled Runtime Validation

### Case C — Stale Lease / Crash Recovery: PASS

Two controlled rows inserted with expired leases and `claimed_by='dead-worker-validation-test'`.

| Sub-case | Setup | Recovery call | Expected | Actual |
|---|---|---|---|---|
| C1 — retryable (`attempt_count=1`, `max_attempts=3`) | `status=running`, stale lease | `fn_recover_stale_pipeline_runs` | `status=pending`, `claimed_by=NULL` | ✅ PASS |
| C2 — exhausted (`attempt_count=3`, `max_attempts=3`) | `status=running`, stale lease | same RPC | `status=failed`, error_summary set | ✅ PASS |

RPC returned `2` rows recovered. Test rows deleted and verified gone.

---

### Case B — Cancellation API Signal Layer: PASS

One controlled pending run inserted. PATCH endpoint exercised via service role.

| Check | Expected | Actual |
|---|---|---|
| PATCH sets `cancellation_requested=true` | yes | ✅ PASS |
| `status` remains `pending` (worker transitions to `cancelled`) | `pending` | ✅ PASS |
| `claimed_by` stays NULL | NULL | ✅ PASS |
| `lease_expires_at` stays NULL | NULL | ✅ PASS |
| Duplicate PATCH (idempotency guard) | 0 rows affected | ✅ PASS |
| Wrong `dataset_id` ownership guard | 0 rows affected | ✅ PASS |

Note: `status='cancelled'` and `cancelled_at` are written by the worker when it detects
`cancellation_requested=true` at the top of its processing loop. The DB constraint
`chk_pipeline_runs_cancelled_at_not_null` (verified in M4) ensures no row can reach
`status='cancelled'` without `cancelled_at`. The worker-side transition was not exercised
in Case B (worker was not started). The API signal layer is fully validated.

Test row deleted and verified gone.

---

### Case A — Real Worker Runtime Execution: PASS

**Worker:** `worker-ce6ea782`  
**Run ID:** `40a0c98d-f71a-4fab-8e06-b900df626c20`  
**Production data at execution time:** 168 sessions, 2 learners, 30 submissions

#### Worker log (verbatim)

```
{"event":"worker_started","worker_id":"worker-ce6ea782"}
{"event":"run_claimed","run_id":"40a0c98d...","attempt":1,"step_count":4}
{"event":"step_started","step":"behavioral","attempt":1}
{"event":"step_completed","step":"behavioral","duration_ms":2245}
{"event":"step_started","step":"sequential","attempt":1}
{"event":"step_completed","step":"sequential","duration_ms":1838}
{"event":"step_deferred","step":"semantic","reason":"phase_5_not_enabled"}
{"event":"step_started","step":"assessment","attempt":1}
{"event":"step_completed","step":"assessment","duration_ms":2283}
{"event":"run_completed","run_id":"40a0c98d..."}
```

#### Step verification

| Step | Status | Result row persisted | Notes |
|---|---|---|---|
| behavioral | `completed` (2245 ms) | ✅ yes — `schema_version=1.0.0` | `learner_count=2`, `avg_success_rate=0.48` |
| sequential | `completed` (1838 ms) | ✅ yes — `schema_version=1.0.0` | `learner_count=2` |
| semantic | `deferred` — `phase_5_not_enabled` | ✅ none (correct) | Executor never called; step marked deferred |
| assessment | `completed` (2283 ms) | ✅ yes — `schema_version=1.0.0` | `submission_count=30`, `pass_rate=0.97`, `avg_score=13.63` |

#### DB state after run

| Field | Expected | Actual |
|---|---|---|
| `status` | `completed` | `completed` |
| `attempt_count` | 1 | 1 |
| `claimed_by` | NULL | NULL |
| `lease_expires_at` | NULL | NULL |
| `error_summary` | NULL | NULL |
| `mst_pipeline_run_results` rows | 3 (behavioral, sequential, assessment) | 3 |
| Semantic result rows | 0 | 0 |
| Duplicate result rows | 0 | 0 |

Worker stopped via SIGINT cleanly after run completed.

---

## 4. Production Bug Found and Fixed

**Symptom:** Every pipeline run failed at the behavioral step with:
```
Dataset fetch failed: column mst_datasets.task_id does not exist
```

**Root cause:** `fetchDataset()` in `lib/analysis/assessment.ts` selected `task_id` from
`mst_datasets`. That column has never existed in the production schema — only `task_set_id`
does. The field was declared in the internal `DatasetRow` interface and included in the
Supabase `.select()` string but was never read by any executor logic downstream.

**Fix:** Removed `task_id` from the `DatasetRow` interface (1 line) and from the
`.select()` string (1 line). Pure subtraction — no behavioural change beyond stopping the
DB error.

**Commit:** `ceffe5f` — `fix(analysis): remove non-existent task_id column from fetchDataset query`  
**File:** `lib/analysis/assessment.ts`  
**Checks after fix:** `next build` clean · 296/296 unit tests pass · `tsc --noEmit` clean

---

## 5. Remaining Limitations

### Semantic step intentionally deferred (Phase 5)

The semantic analysis step is listed in `DEFERRED_STEPS` in `worker/step-executors.ts`.
The worker marks it `deferred` with `deferred_reason='phase_5_not_enabled'` and continues
to the next step. No semantic result row is ever written to `mst_pipeline_run_results`.
This is by design and is not a defect. Semantic analysis will be enabled when the Phase 5
research scope is approved.

### Integration tests require an isolated database

The 23 integration tests in `__tests__/integration/pipeline-worker.integration.test.ts`
auto-skip when `INTEGRATION_SUPABASE_URL` is absent. They require a local Supabase
instance with migrations applied in the correct Expand-Migrate-Contract order
(019→020→021→023→022). Setup instructions are in `.env.test.example`. Until an isolated
test database is provisioned, these tests will remain skipped in CI.

---

## 6. Final Conclusion

Production schema validation and controlled worker runtime validation are complete.

All 14 schema checks pass. All three controlled runtime cases (C: stale lease recovery,
B: cancellation signal layer, A: real execution) pass. The one production bug found during
validation — a phantom column reference in `fetchDataset` — has been identified, fixed,
and committed (`ceffe5f`). The worker claims runs correctly via `fn_claim_pipeline_run`,
processes steps in order, defers semantic as expected, persists results idempotently to
`mst_pipeline_run_results`, and clears `claimed_by`/`lease_expires_at` on terminal
transitions.

The pipeline is ready for production use subject to the Phase 5 semantic enablement
decision and optional provisioning of an isolated integration test database.
