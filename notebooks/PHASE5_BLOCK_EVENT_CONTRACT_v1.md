# Phase 5 Block-Event Contract v1

**Version:** 1.0  
**Date:** 2026-08-18  
**Status:** APPROVED  
**Supersedes:** n/a (first Phase 5 contract)  
**Related:** `notebooks/PHASE4_RESEARCH_CONTRACT_v1.md`

---

> ⚠️ PILOT ONLY — NOT FINAL RESEARCH RESULTS  
> All Phase 5 block-event data collected under this contract is pilot data.  
> Confirmatory analysis remains prohibited until an approved label-validity gate  
> is satisfied (see PHASE4_RESEARCH_CONTRACT_v1.md §11 and §15).

---

## 1. Purpose

This document is the authoritative design contract for block-based event
collection in Phase 5 of the CKV thesis research pipeline. It governs:

- which events are collected and who emits them;
- how each event is structured in `trn_event_logs`;
- the canonical `answer_json` structure for `sql_block` submissions;
- atomic ordering, idempotency, and session-ownership requirements;
- the privacy and data-minimisation rules applied to block event data;
- the resolved research-design decisions from Thesis-Draft-08.

No Phase 5 block-event implementation (UI, API, migration, or notebook) may
begin before this document is merged into `main`.

---

## 2. Resolved Decision Register

| ID   | Decision                              | Resolution                                                                                                                                                    |
|------|---------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| D1-A | Vocabulary artifact strategy          | New `lib/research-artifacts/phase5/vocabulary_v1.json`. Phase 4 artifacts frozen. Tokens 6–9 reused from reserved slots.                                     |
| D1-B | `block_submit` semantics              | **Not activated.** One canonical final-submission event: `submit_answer`. Its `metadata_json` carries the final block sequence. Token 9 reserved.             |
| D1-C | `event_order` allocation mechanism    | Current count+1 pattern is **non-atomic** and must NOT be used for block events. M5.1A introduces an atomic DB RPC (advisory lock + MAX within transaction).  |
| D1-D | `get_blocks_for_student_task` scope   | Authorization deficiency confirmed (no assignment check). M5.1A adds a `trn_task_assignments` join to the RPC. Requires a new migration (M5.1A scope).        |
| D2-A | 2C3L scope — task types               | Design intent applies to all four thesis SQL task types: SQL Query, Stored Procedure, ER Diagram, Visual Query Builder. IOC/expert validation is a separate per-type gate. |
| D2-B | 60-participant threshold              | Thesis-wide total: **30 experimental + 30 control = 60 participants**. Not a per-task-type requirement. Not a per-phase requirement.                           |
| D3   | Canonical display names               | `sql_text` → SQL Query / Text-based; `stored_procedure` → Stored Procedure; `sql_block` → Visual Query Builder; `er_diagram` → ER Diagram.                    |
| D4   | Set-family filter — immediate action  | Disable/remove the invalid batch_type filter on the researcher legacy dataset page. A global `set_family` filter without `class_id` is undefined and must not be implemented. |
| D5   | Teacher submissions family resolution | Remove dead `batch_type === "exam_set"/"lab_set"` conditions. Full canonical fix (join `tb_class_sets` with `class_id`) is a separate tracked issue.           |

---

## 3. Canonical Event Names and Ownership

| Event         | Trigger                                          | Emitter                            | Server counterpart? |
|---------------|--------------------------------------------------|------------------------------------|---------------------|
| `block_add`   | User clicks an available block                   | Client → server append endpoint    | No — single emission only |
| `block_move`  | User clicks ↑/↓ or completes drag-drop           | Client → server append endpoint    | No |
| `block_delete`| User clicks Delete on a selected block           | Client → server append endpoint    | No |
| `submit_answer` | User submits final block assembly (existing)   | Client fires; server echoes (existing Phase 4 duplicate pair) | Yes — existing pattern preserved |

### Not Activated

`block_submit` (vocabulary token 9) is **reserved and not activated** in Phase 5.

A distinct `block_submit` event may be activated in a future phase only if the
product introduces a separate builder-finalisation action that is logically
prior to the graded submit button — for example, a "Lock Assembly" step
before the student can press Submit. Without such a distinct product action,
emitting `block_submit` separately from `submit_answer` would create a
duplicate pair analogous to the existing `sql_run` / `submit_answer` pairs,
but without a defined deduplication policy in NB05. Do not create this
ambiguity.

### Phase 4 Duplicate-Event Contract — Must Not Be Extended to Block Interactions

The Phase 4 research pipeline deduplicates exactly two known duplicate pairs:
`sql_run` (client + server) and `submit_answer` (client + server). This is
documented in `PHASE4_RESEARCH_CONTRACT_v1.md` §8 and handled in NB05.

`block_add`, `block_move`, and `block_delete` must **not** follow this pattern.
They are client-originated only and have no server counterpart. Any server-side
duplication of these events would break sequence construction without a
corresponding update to the NB05 deduplication policy.

---

## 4. Server-Authoritative Append Endpoint

Block interaction events must not be inserted by the client directly into
`trn_event_logs`. The client calls a dedicated server endpoint:

```
POST /api/student/block-event
```

### Required Validations (in order)

1. Authenticate the caller via JWT (`requireAuthenticatedProfile`)
2. Verify the caller owns an active `trn_learning_sessions` record for
   `(session_id, profile_id, task_id)` — using the existing
   `getOwnedLearningSession` pattern from `lib/server-dataset-utils.ts`
3. Verify `task_id` resolves to a `sql_block` task with
   `task_status = 'published'` and `is_active = true`
4. Verify `block_id` (from request body) is present in `mst_blocks` for that
   `task_id`
5. Allocate `event_order` atomically (see §8)
6. Insert the event record into `trn_event_logs`
7. Accept `client_event_id` for idempotency (see §9)

The endpoint uses the caller's user-scoped auth token (not the admin key),
consistent with how `logLearningEvent` in `services/event-service.ts` uses
`supabase` (not `supabaseAdmin`).

---

## 5. event_value Definition

| Event          | `event_value` content                                    | Max length |
|----------------|----------------------------------------------------------|-----------|
| `block_add`    | `block_code` of the added block (e.g. `"B_SELECT"`)     | 100 chars (mst_blocks.block_code varchar(100)) |
| `block_move`   | `block_code` of the moved block                          | same |
| `block_delete` | `block_code` of the deleted block                        | same |

`event_value` is a `text` column used for lightweight filtering and human
inspection. All structured payload detail belongs in `metadata_json`.

---

## 6. metadata_json Schemas

### 6.1 Base Fields (all three block interaction events)

```json
{
  "event_schema_version": 1,
  "task_type": "sql_block",
  "sequence_length_after": 3,
  "current_sql_snapshot": "SELECT * FROM students",
  "client_event_id": "uuid-v4-generated-before-request"
}
```

`current_sql_snapshot` is truncated to **500 characters** before logging,
consistent with the existing `answer.substring(0, 500)` truncation pattern
in the student task page.

### 6.2 block_add

```json
{
  "event_schema_version": 1,
  "task_type": "sql_block",
  "block_id": "uuid-from-mst_blocks",
  "block_code": "B_SELECT",
  "block_instance_id": "client-generated-uuid-assigned-at-add-time",
  "position_after_add": 2,
  "sequence_length_after": 3,
  "current_sql_snapshot": "SELECT * FROM students",
  "client_event_id": "uuid-v4"
}
```

### 6.3 block_move

```json
{
  "event_schema_version": 1,
  "task_type": "sql_block",
  "block_id": "uuid-from-mst_blocks",
  "block_code": "B_SELECT",
  "block_instance_id": "same-uuid-assigned-at-add-time",
  "from_position": 2,
  "to_position": 0,
  "sequence_length_after": 3,
  "current_sql_snapshot": "SELECT * FROM students",
  "client_event_id": "uuid-v4"
}
```

`from_position` and `to_position` are **0-indexed** positions within the
selected-blocks array. `from_position` ≠ `to_position` is a validation
requirement.

### 6.4 block_delete

```json
{
  "event_schema_version": 1,
  "task_type": "sql_block",
  "block_id": "uuid-from-mst_blocks",
  "block_code": "B_SELECT",
  "block_instance_id": "same-uuid-assigned-at-add-time",
  "deleted_from_position": 1,
  "sequence_length_after": 2,
  "current_sql_snapshot": "SELECT * FROM",
  "client_event_id": "uuid-v4"
}
```

`sequence_length_after` reflects the length **after** the delete. The
`block_instance_id` identifies the specific placement that was deleted,
not just the block definition (see §7).

### 6.5 submit_answer metadata extension for sql_block

The server-side `insertServerEvent` call for `submit_answer` (in
`app/api/student/submit-answer/route.ts`) must be extended when
`task.task_type === "sql_block"` to include:

```json
{
  "answer_length": 42,
  "block_id_sequence": ["uuid-b1", "uuid-b2", "uuid-b3"],
  "block_code_sequence": ["B_SELECT", "B_STAR", "B_FROM"],
  "block_instance_id_sequence": ["inst-uuid-1", "inst-uuid-2", "inst-uuid-3"],
  "sequence_length": 3
}
```

---

## 7. block_instance_id

### Problem

`block_id` (from `mst_blocks`) identifies which block *definition* was used.
A student may add the same block definition multiple times. If two instances
of `B_SELECT` are in the sequence and the student deletes one, position-based
or occurrence-index-based tracking cannot reliably identify which instance was
removed.

### Solution

`block_instance_id` is a **UUIDv4 generated client-side when a block is added**
to the selected sequence. It is:

- created in the client at add time (analogous to the existing `selected_key`
  in `BlockSqlBuilder` but using a proper UUID instead of a counter suffix);
- passed unchanged through `onBlockEvent` metadata for `block_add`,
  `block_move`, and `block_delete`;
- present in `block_instance_id_sequence` in `answer_json` and `submit_answer`
  metadata at submit time;
- discarded at session end (it has no meaning beyond a single session).

### Distinction from mst_blocks.block_id

| Field              | Type         | Identifies                                   | Stable across sessions? |
|--------------------|--------------|----------------------------------------------|------------------------|
| `block_id`         | UUID (server) | Which block definition was used              | Yes |
| `block_instance_id`| UUID (client) | One specific placement of that definition in one student's current sequence | No — ephemeral |

---

## 8. Canonical answer_json for sql_block

The scorer in `lib/server-dataset-utils.ts` (line 183) reads
`answer_json?.block_ids`. This field name is **canonical and must not be
renamed**.

```json
{
  "mode": "sql_block",
  "block_ids": ["uuid-b1", "uuid-b2", "uuid-b3"],
  "block_codes": ["B_SELECT", "B_STAR", "B_FROM"],
  "block_instance_ids": ["inst-uuid-1", "inst-uuid-2", "inst-uuid-3"],
  "generated_sql": "SELECT * FROM students",
  "answer_schema_version": 1
}
```

- `block_ids` → read by `scoreSqlBlockAnswer` for positional correctness scoring
- `block_codes` → research traceability only; not read by scorer
- `block_instance_ids` → research traceability only; not read by scorer
- `generated_sql` → the SQL string evaluated; also stored in `answer_text`
- `answer_schema_version` → forward-compatibility field; value `1` for all
  Phase 5 M5.1B submissions

`BlockSqlBuilder.onSqlChange` (line 26) already passes
`selectedBlocks.map((b) => b.block_id)` as `selectedBlockIds`, which maps
directly to `block_ids`. No scorer change is required.

---

## 9. Run and Submit Semantics for sql_block

### Run (test current assembly)

When a student presses Run on a `sql_block` task:

1. The existing `sql_run` client event fires via `logLearningEvent`
2. The client calls `POST /api/student/run-answer` with
   `answer_text = generated_sql` and `answer_json` per §8
3. The scorer calls `scoreSqlBlockAnswer` with `answer_json.block_ids`
4. The server records a server-side `sql_run` event (existing Phase 4 duplicate
   pair — deduplication handled in NB05)

No new event type is introduced for a block Run action.

### Submit (final graded submission)

When a student presses Submit on a `sql_block` task:

1. Client fires client-side `submit_answer` via `logLearningEvent` (existing)
2. Client calls `POST /api/student/submit-answer` with `answer_text = generated_sql`
   and `answer_json` per §8
3. Server scores via `scoreSqlBlockAnswer`
4. Server records server-side `submit_answer` event — **extended with block
   sequence metadata** in `metadata_json` per §6.5 when `task_type = "sql_block"`
5. `session_end` fires as normal

`block_submit` (token 9) does **not** fire from the submit button.

---

## 10. Atomic event_order Allocation

### Current Mechanism (Phase 4, text events)

Both `services/event-service.ts` and `lib/server-dataset-utils.ts` use:

```typescript
const { count } = await client
  .from("trn_event_logs")
  .select("event_id", { count: "exact", head: true })
  .eq("session_id", sessionId);
return (count ?? 0) + 1;
```

This is a **non-atomic read-then-write**. Two concurrent calls read the same
`count`, compute the same `event_order`, and one fails with the
`UNIQUE (session_id, event_order)` constraint. For Phase 4 text events, the
collision rate is acceptably low because client and server events for a single
user action are serialised by the HTTP request lifecycle.

### Required Mechanism (Phase 5, block events)

Block interactions (`block_add`, `block_move`, `block_delete`) can fire rapidly
in sequence from a single user session. The count+1 pattern must **not** be
used for block events.

M5.1A introduces a DB function that:

1. Acquires an advisory lock keyed on the session
   (`pg_advisory_xact_lock(hashtext(session_id::text))`)
2. Reads `MAX(event_order)` for the session within the locked transaction
3. Inserts the event record with `MAX + 1`
4. Returns the assigned `event_order`

The block-event endpoint calls this function. The existing `getNextEventOrder`
in `services/event-service.ts` and `lib/server-dataset-utils.ts` is left
unchanged for Phase 4 text events.

---

## 11. Idempotency via client_event_id

The block-event append endpoint accepts a required `client_event_id` field
(UUIDv4, generated client-side before the request is sent and included in
`metadata_json`).

If a duplicate request arrives with the same `client_event_id` for the same
`session_id`, the server returns the existing event record without inserting
a duplicate. The exact deduplication mechanism (UNIQUE index on
`(session_id, metadata_json->>'client_event_id')` vs application-level check
within the advisory-lock transaction) is an M5.1A implementation decision.

---

## 12. duration_from_start — Canonical Unit

`duration_from_start` is stored in **seconds** (integer). Both
`calculateDurationFromStart` implementations confirm:

```typescript
Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))
```

All block event payloads use seconds for `duration_from_start`. This is
consistent with the existing schema and all Phase 4 events.

---

## 13. Privacy and Data Minimisation

- `metadata_json` must not contain `display_name`, `email`, `auth_user_id`,
  or any PII.
- `block_id` values are task-content identifiers from `mst_blocks`, not
  learner identifiers. Safe in research exports.
- `block_instance_id` is an ephemeral client UUID with no PII content.
  Safe in research exports.
- `current_sql_snapshot` and `generated_sql` contain user-composed SQL.
  These are research-grade data, not PII, and are subject to the existing
  `participant_code` masking in dataset views.
- `client_event_id` is a random UUID with no PII content.

---

## 14. Validation Rules

The block-event append endpoint enforces all of the following before inserting:

1. `event_type` ∈ `{'block_add', 'block_move', 'block_delete'}`
2. `metadata_json.event_schema_version` = 1
3. `metadata_json.task_type` = `'sql_block'`
4. `metadata_json.block_id` is a valid UUID present in `mst_blocks` for the
   current `task_id`
5. `metadata_json.block_code` matches `mst_blocks.block_code` for the given
   `block_id`
6. `metadata_json.block_instance_id` is a non-empty string
7. For `block_move`: `from_position` ≠ `to_position`; both ≥ 0
8. `metadata_json.current_sql_snapshot` ≤ 500 characters
9. `event_order` assigned by atomic DB function; enforced by DB UNIQUE
   constraint `(session_id, event_order)`
10. Caller owns the session: `trn_learning_sessions.profile_id` matches JWT
    `profile_id`
11. Task is `sql_block`, `task_status = 'published'`, `is_active = true`
12. `client_event_id` is present and is a non-empty string

---

## 15. Automated Test Cases (Target for M5.1A and M5.1B)

### M5.1A — Endpoint and Infrastructure

- Unauthenticated caller → 401
- Authenticated caller with no session ownership → error
- Non-sql_block task → error
- Unknown `block_id` for task → error
- Valid `block_add` → 200, event inserted with correct `event_type`,
  `block_id`, `block_instance_id` in metadata
- Duplicate request with same `client_event_id` → 200, no second row inserted
- Two concurrent block events for the same session → both succeed with distinct
  `event_order` values (no constraint violation)
- `get_blocks_for_student_task` with authenticated caller who has no
  task assignment → empty result (post-M5.1A RPC fix)

### M5.1B — Student UI and answer_json

- `sql_block` task renders `BlockSqlBuilder`, not textarea
- `sql_text` task renders textarea, not `BlockSqlBuilder`
- `block_add` fires POST to `/api/student/block-event`
- Two adds of the same block definition produce distinct `block_instance_id`
  values
- `block_delete` metadata contains the `block_instance_id` of the correct
  instance (not just the block definition)
- `answer_json.mode` = `'sql_block'` on submit
- `answer_json.block_ids` is an array of valid UUIDs matching the final sequence
- `answer_json.answer_schema_version` = 1
- Server-side `submit_answer` event metadata contains `block_id_sequence`,
  `block_code_sequence`, `block_instance_id_sequence` for sql_block tasks
- `BlockSqlBuilder` with `disabled = true` fires no `onBlockEvent` callbacks

---

## 16. Milestone Sequence

```
M5.0  This document (docs/phase5-block-event-contract → main)
  │
  ├── M5.1A  Secure Event Infrastructure and RPC Authorization
  │          Branch: feature/phase5-secure-event-infra
  │          - POST /api/student/block-event endpoint
  │          - Atomic event_order allocation DB RPC (new migration)
  │          - get_blocks_for_student_task authorization fix (same or separate migration)
  │          - Tests: __tests__/api/block-event.test.ts
  │
  └── M5.1B  sql_block Student UI and Raw Event Persistence
             Branch: feature/phase5-sql-block-ui
             (after M5.1A merged)
             - app/student/task/[taskId]/page.tsx — sql_block branch
             - app/api/student/submit-answer/route.ts — block metadata extension
             - Tests: __tests__/student/task-sql-block.test.tsx

Hotfix (parallel, independent)
  Branch: fix/set-family-batch-type-semantics
  - Remove invalid batch_type filter from researcher legacy dataset page
  - Remove dead batch_type === "exam_set"/"lab_set" conditions from teacher submissions
  - Fix test fixtures with invalid batch_type values

M5.2  Mock Block Journeys and Sequence Dataset
      (after M5.1B merged)
      - generate_mock_data.py — sql_block learner journeys
      - Mock pipeline route — sql_block simulation
      - NB05 — block event token handling
      - lib/research-artifacts/phase5/vocabulary_v1.json
```

---

## 17. Files That Must Not Change in M5.0

This PR changes exactly one file. All of the following must remain untouched:

- All source code under `app/`, `components/`, `lib/`, `services/`, `worker/`
- All database migrations under `database/migrations/`
- All Phase 4 artifacts under `lib/research-artifacts/phase4/`
- `notebooks/PHASE4_RESEARCH_CONTRACT_v1.md`
- `notebooks/PHASE4_PROXY_LABEL_LIMITATIONS.md`
- `.env`, `.env.local`, and any deployment configuration

---

*Contract approved 2026-08-18. Implementation begins after this document is merged into main.*
