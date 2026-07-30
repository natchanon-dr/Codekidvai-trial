# Worker Runtime Validation Plan
# Phase 4 Dataset Analytics — Controlled Runtime Tests

Generated: 2026-07-24
Branch: feature/analytics-ui-cleanup
Schema validation: COMPLETE (14/14 PASS)
Runtime validation: PENDING — awaiting execution approval

---

## Current Status

| Layer | Status |
|---|---|
| Production schema (migrations 019–023) | ✅ VALIDATED |
| RPC security (REVOKE/GRANT/DEFINER) | ✅ VALIDATED |
| Worker runtime execution | ⏳ PENDING |

`mst_pipeline_runs` currently has **0 rows** — the worker has never run against
this database. Runtime behavior (claim, process, complete, cancel, recover) has
not been observed in production.

---

## Production Data Inventory

### Dataset available for testing

| Field | Value |
|---|---|
| Code | `PAQT0001` |
| ID | `49e5e3e6-4589-4a43-b5b9-37d1008529d8` |
| batch_type | pilot |
| task_set_id (batch FK) | `80982afc-1bdd-4d17-aefe-e1874187c63d` |
| Active | true |
| Sessions in batch | 168 |
| Attempts | 0 |
| Events (est.) | ~800 across all sessions |
| Submissions | 0 |

### Expected per-step outcome with current data

| Step | Expected | Reason |
|---|---|---|
| behavioral | ✅ PASS → result persisted | 168 sessions; attempts=0 but no InsufficientDataError check on attempts |
| sequential | ✅ PASS → result persisted | Events exist (~800); sequence stats computable |
| semantic | ⏭ DEFERRED | `DEFERRED_STEPS` — Phase 5; executor never called |
| assessment | ❌ FAIL (non-retryable) | 0 submissions → `InsufficientDataError` → `terminateRetries=true` |

**Expected final run status: `failed`** — correct behavior with current data.
This is NOT a Case A full-success run. It IS a valid test of:
- behavioral and sequential executors running against real data
- Semantic deferred path (DEFERRED_STEPS)
- Non-retryable error classification and terminateRetries

For a true Case A `completed` run, `trn_submissions` must have rows for this
batch (students must have submitted answers via the platform).

---

## 1. How Pipeline Runs Are Created

### Entry point

```
POST /api/researcher/dataset-analytics/[id]/runs
File: app/api/researcher/dataset-analytics/[id]/runs/route.ts
Auth: requireAdminOrResearcher (admin or researcher role session required)
```

### Required inputs

| Field | Source | Required | Notes |
|---|---|---|---|
| `id` | URL path param | ✅ | dataset UUID |
| `run_type` | JSON body | optional | default `"full_pipeline"` |
| `initiated_by` | JSON body | optional | label shown in UI |
| `idempotency_key` | JSON body or `X-Idempotency-Key` header | optional | enables safe retries |

### Trigger options

1. **Researcher UI**: Navigate to `/researcher/dataset-analytics` → select dataset → click "Run Analysis"
2. **Direct API call** (requires valid auth session cookie from a logged-in admin/researcher)
3. **Direct PostgREST INSERT** via service role key (bypasses Next.js auth — safe for controlled testing only)

### Guards in POST route

- Dataset must exist and `active=true`
- If `run_type="full_pipeline"`, rejects with 409 if a pending/running run already exists for this dataset
- Idempotency: `23505` conflict on `idempotency_key` returns existing run with 200

---

## 2. Runtime Prerequisites

Before the worker can process a run, ALL of the following must be true:

| Prerequisite | Current state | Notes |
|---|---|---|
| `mst_pipeline_runs` row with `status='pending'` | ❌ None | Must be created via API or seed SQL |
| `attempt_count < max_attempts` | — | Default: `0 < 3` ✓ |
| `analysis_steps` JSONB populated | — | Set by POST route for `full_pipeline` |
| `NEXT_PUBLIC_SUPABASE_URL` env var | ✅ In `.env.local` | `https://wvkewdqfxmlhratairnh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` env var | ✅ In `.env.local` | See `.env.local` |
| Worker process running | ❌ Not started | `npm run worker` |
| `mst_pipeline_run_results` table | ✅ Applied | Migration 023 confirmed |
| `fn_claim_pipeline_run` RPC | ✅ Applied | Migration 021 confirmed |

---

## 3. Proposed Case A / B / C Validation Plan

### Case A — Real data run (partial success expected)

**Goal:** Confirm worker claims a pending run, processes available steps correctly,
handles non-retryable failure at assessment, and leaves the database in a
consistent final state.

**Steps:**
1. Create a pending run via API (see observation queries below for curl)
2. Start worker: `npm run worker`
3. Observe logs for `run_claimed`, `step_started`, `step_completed`, `step_deferred`, `step_failed`
4. Verify DB state after run ends

**Expected DB state after Case A:**

```sql
-- mst_pipeline_runs row
status         = 'failed'
attempt_count  = 3  (= max_attempts, set by terminateRetries)
claimed_by     = NULL
lease_expires_at = NULL
error_summary  LIKE '[insufficient_data]%'

-- analysis_steps JSONB
behavioral.status  = 'completed'
sequential.status  = 'completed'
semantic.status    = 'deferred', deferred_reason = 'phase_5_not_enabled'
assessment.status  = 'failed'

-- mst_pipeline_run_results
2 rows: one for behavioral, one for sequential
0 rows for semantic (deferred — executor never ran)
0 rows for assessment (failed before persist)
```

---

### Case B — Cancellation path

**Goal:** Confirm API cancellation is respected mid-run; completed steps are
preserved; pending steps become cancelled; final state is correct.

**Steps:**
1. Insert a controlled test run (seed SQL below — requires approval)
2. Optionally start worker and let it claim the run
3. PATCH cancel while run is pending or running
4. Verify final state

**Simpler alternative (no worker needed):**
Insert a run, PATCH cancel immediately (while still pending), observe that
the constraint guard works and final state is `cancelled`.

---

### Case C — Stale lease / crash recovery

**Goal:** Confirm `fn_recover_stale_pipeline_runs` correctly resets orphaned
running runs and respects `max_attempts`.

**Steps:**
1. Insert a controlled test run with `status='running'`, `claimed_by='dead-worker-test'`,
   `lease_expires_at = now() - interval '2 hours'` (seed SQL below)
2. Call `fn_recover_stale_pipeline_runs` via service role
3. Verify run returns to `pending` (or `failed` if `attempt_count >= max_attempts`)

**This case requires NO worker process and NO real data.**

---

## 4. SQL Observation Queries (read-only)

Run these in DBeaver or via service role to observe runtime state.

### 4a — Current run overview

```sql
SELECT
    id,
    status,
    attempt_count,
    max_attempts,
    claimed_by,
    lease_expires_at,
    cancellation_requested,
    cancelled_at,
    created_at,
    CASE
        WHEN status = 'running' AND lease_expires_at < now()
        THEN 'STALE'
        ELSE 'OK'
    END AS lease_health
FROM public.mst_pipeline_runs
ORDER BY created_at DESC;
```

### 4b — Step-level detail for latest run

```sql
SELECT
    id,
    status,
    jsonb_array_elements(analysis_steps) AS step
FROM public.mst_pipeline_runs
ORDER BY created_at DESC
LIMIT 1;
```

### 4c — Persisted results

```sql
SELECT
    r.run_id,
    r.analysis_type,
    r.schema_version,
    r.created_at,
    jsonb_object_keys(r.result) AS result_keys
FROM public.mst_pipeline_run_results r
ORDER BY r.created_at DESC;
```

### 4d — Full result for specific analysis type

```sql
SELECT result
FROM public.mst_pipeline_run_results
WHERE run_id = '<run_id_here>'
  AND analysis_type = 'behavioral';
```

### 4e — Stale run detection

```sql
SELECT id, claimed_by, lease_expires_at, attempt_count, max_attempts
FROM public.mst_pipeline_runs
WHERE status = 'running'
  AND lease_expires_at < now();
```

---

## 5. Seed SQL for Cases B and C

**⚠ DO NOT EXECUTE without explicit approval.**
**These inserts create test rows in production. All are tagged with**
**`initiated_by = '[VALIDATION-TEST]'` for easy identification and cleanup.**

### 5a — Case B seed: simple pending run (cancellation test)

```sql
-- Creates a pending run for PAQT0001. Safe to cancel immediately.
-- Reversible: DELETE FROM public.mst_pipeline_runs WHERE initiated_by = '[VALIDATION-TEST-B]';

INSERT INTO public.mst_pipeline_runs (
    dataset_id,
    run_type,
    status,
    analysis_steps,
    max_attempts,
    initiated_by
)
VALUES (
    '49e5e3e6-4589-4a43-b5b9-37d1008529d8',  -- PAQT0001
    'full_pipeline',
    'pending',
    '[
        {"analysis":"behavioral","status":"pending","started_at":null,"completed_at":null,"error":null},
        {"analysis":"sequential","status":"pending","started_at":null,"completed_at":null,"error":null},
        {"analysis":"semantic","status":"pending","started_at":null,"completed_at":null,"error":null},
        {"analysis":"assessment","status":"pending","started_at":null,"completed_at":null,"error":null}
    ]'::jsonb,
    3,
    '[VALIDATION-TEST-B]'
)
RETURNING id, status, created_at;
```

### 5b — Case C seed: stale running run (recovery test)

```sql
-- Creates a run that looks like a crashed worker left it.
-- attempt_count=1 < max_attempts=3 → recovery should reset to 'pending'.
-- Reversible: DELETE FROM public.mst_pipeline_runs WHERE initiated_by = '[VALIDATION-TEST-C1]';

INSERT INTO public.mst_pipeline_runs (
    dataset_id,
    run_type,
    status,
    analysis_steps,
    attempt_count,
    max_attempts,
    claimed_by,
    lease_expires_at,
    started_at,
    initiated_by
)
VALUES (
    '49e5e3e6-4589-4a43-b5b9-37d1008529d8',
    'full_pipeline',
    'running',
    '[{"analysis":"behavioral","status":"running","started_at":now(),"completed_at":null,"error":null}]'::jsonb,
    1,
    3,
    'dead-worker-validation-test',
    now() - interval '2 hours',   -- expired lease
    now() - interval '3 hours',
    '[VALIDATION-TEST-C1]'
)
RETURNING id, status, claimed_by, lease_expires_at;
```

### 5c — Case C variant: exhausted run (recovery → failed, not re-queued)

```sql
-- attempt_count = max_attempts → recovery must set status='failed', NOT 'pending'.
-- Reversible: DELETE FROM public.mst_pipeline_runs WHERE initiated_by = '[VALIDATION-TEST-C2]';

INSERT INTO public.mst_pipeline_runs (
    dataset_id,
    run_type,
    status,
    analysis_steps,
    attempt_count,
    max_attempts,
    claimed_by,
    lease_expires_at,
    started_at,
    initiated_by
)
VALUES (
    '49e5e3e6-4589-4a43-b5b9-37d1008529d8',
    'full_pipeline',
    'running',
    '[{"analysis":"behavioral","status":"running","started_at":now(),"completed_at":null,"error":null}]'::jsonb,
    3,    -- = max_attempts
    3,
    'dead-worker-validation-test',
    now() - interval '2 hours',
    now() - interval '3 hours',
    '[VALIDATION-TEST-C2]'
)
RETURNING id, status, claimed_by, lease_expires_at;
```

### Cleanup (run after validation is done)

```sql
-- Remove all test rows. Run this after each case is verified.
DELETE FROM public.mst_pipeline_runs
WHERE initiated_by LIKE '[VALIDATION-TEST%]';
-- Cascade delete removes mst_pipeline_run_results rows automatically.
```

---

## 6. Worker Command

**DO NOT START until explicitly approved.**

```bash
# Command
npm run worker

# Equivalent
npx tsx worker/index.ts

# Environment source (production)
# Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local

# To confirm it is pointing to the intended database, check startup log:
# {"event":"worker_started","worker_id":"worker-xxxxxxxx"}
# Then immediately check:
# {"event":"run_claimed","dataset_id":"49e5e3e6-...","worker_id":"worker-xxxxxxxx"}

# Stop safely
# Ctrl+C  →  sends SIGINT  →  worker logs {"event":"shutdown_requested"}
#            waits up to 30s for active job to finish
#            logs {"event":"worker_stopped"}
#
# If a run is actively processing, worker will finish the current step before exiting.
# Do NOT kill -9 (SIGKILL) — lease will expire and recovery will handle it, but
# it is cleaner to use Ctrl+C and wait for graceful shutdown.
```

### How to confirm database target before starting

```bash
# In a separate terminal, before npm run worker:
node -e "
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('URL:', url);
console.log('Key prefix:', key?.slice(0,20) + '...');
" --env-file .env.local
```

Expected output should show `https://wvkewdqfxmlhratairnh.supabase.co`.

---

## 7. Risk Notes

| Risk | Mitigation |
|---|---|
| Worker claims a run that fails non-retryably | `terminateRetries=true` sets `attempt_count=max_attempts` — run never re-queues |
| assessment InsufficientDataError on PAQT0001 | Expected with 0 submissions — confirms error path works correctly |
| behavioral/sequential results pollute production | These are real analysis results — valid data, not test artifacts |
| Case C seed rows not cleaned up | Delete explicitly using cleanup SQL above |
| Worker left running after test | Always stop with Ctrl+C; check `mst_pipeline_runs` for any `status='running'` rows after stopping |
| Second worker started accidentally | Safe — `FOR UPDATE SKIP LOCKED` prevents double-claim; but stop the extra worker |

---

## 8. Recommended Execution Order

```
Step 1  →  Approve Case C seed SQL (5b + 5c)
Step 2  →  Run Case C validation (no worker needed)
           INSERT seed rows → call fn_recover_stale_pipeline_runs → observe
           DELETE test rows

Step 3  →  Approve Case B seed SQL (5a)
           INSERT seed row → PATCH cancel via API → observe final state
           DELETE test row

Step 4  →  Approve worker start
           npm run worker (terminal 1)
           Poll DB in terminal 2 with observation query 4a
           Worker processes PAQT0001 run (if created via API or approved seed)
           Verify behavioral + sequential results in mst_pipeline_run_results
           Verify assessment fails non-retryably
           Stop worker (Ctrl+C)
```
