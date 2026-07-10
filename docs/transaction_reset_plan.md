# Transaction Reset Plan

> **Execute this plan before starting the real student pilot.**
> All simulated data created under tag `SIM_E2E_2026` and `E2E_MOCK_2026` must be removed.
> Do NOT run these queries on production data — verify batch_code/participant_code filters before executing.

**Created**: 2026-07-11
**Related**: `docs/e2e_simulated_system_validation_report.md`

---

## Scope: What Must Be Reset

| Category | Tag / Identifier |
|---|---|
| Simulated transactions (sessions, attempts, events, submissions, rubric scores) | batch_id = TEST_BATCH_E2E_001 |
| Mock E2E seed transactions | batch_id = SAQT0001 + participant_code LIKE 'MOCK_E2E_%' |
| Simulated student profiles | participant_code LIKE 'SIM_E2E_%' |
| Mock E2E student profiles | participant_code LIKE 'MOCK_E2E_%' |
| Simulated teacher/researcher profiles | participant_code IN ('SIM_TEACHER_E2E', 'SIM_RESEARCHER_E2E') |
| Test class enrollment | class_code = 'TEST_CLASS_E2E' |
| Test batch | batch_code = 'TEST_BATCH_E2E_001' |
| Test tasks | task_code LIKE 'TEST_TASK_SQL_E2E_%' |
| Test class | class_code = 'TEST_CLASS_E2E' |
| Auth users | email LIKE '%@ckv-mock.local' |

---

## Reset Order (Dependency-Safe)

Execute in this exact order to avoid FK constraint errors.

### Step 1 — Rubric Scores

```sql
-- Sim E2E batch
DELETE FROM trn_submission_rubric_scores
WHERE submission_id IN (
  SELECT submission_id FROM trn_submissions
  WHERE batch_id = (
    SELECT batch_id FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001'
  )
);

-- Mock E2E (MOCK_E2E_ profiles on SAQT0001)
DELETE FROM trn_submission_rubric_scores
WHERE submission_id IN (
  SELECT s.submission_id FROM trn_submissions s
  JOIN mst_profiles p ON s.profile_id = p.profile_id
  WHERE p.participant_code LIKE 'MOCK_E2E_%'
);
```

### Step 2 — Submissions

```sql
-- Sim E2E batch
DELETE FROM trn_submissions
WHERE batch_id = (
  SELECT batch_id FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001'
);

-- Mock E2E profiles
DELETE FROM trn_submissions
WHERE profile_id IN (
  SELECT profile_id FROM mst_profiles WHERE participant_code LIKE 'MOCK_E2E_%'
);
```

### Step 3 — Attempts

```sql
-- Sim E2E sessions
DELETE FROM trn_attempts
WHERE session_id IN (
  SELECT session_id FROM trn_learning_sessions
  WHERE batch_id = (
    SELECT batch_id FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001'
  )
);

-- Mock E2E sessions
DELETE FROM trn_attempts
WHERE session_id IN (
  SELECT ls.session_id FROM trn_learning_sessions ls
  JOIN mst_profiles p ON ls.profile_id = p.profile_id
  WHERE p.participant_code LIKE 'MOCK_E2E_%'
);
```

### Step 4 — Event Logs

```sql
-- Sim E2E sessions
DELETE FROM trn_event_logs
WHERE session_id IN (
  SELECT session_id FROM trn_learning_sessions
  WHERE batch_id = (
    SELECT batch_id FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001'
  )
);

-- Mock E2E sessions
DELETE FROM trn_event_logs
WHERE session_id IN (
  SELECT ls.session_id FROM trn_learning_sessions ls
  JOIN mst_profiles p ON ls.profile_id = p.profile_id
  WHERE p.participant_code LIKE 'MOCK_E2E_%'
);
```

### Step 5 — Learning Sessions

```sql
-- Sim E2E batch
DELETE FROM trn_learning_sessions
WHERE batch_id = (
  SELECT batch_id FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001'
);

-- Mock E2E profiles
DELETE FROM trn_learning_sessions
WHERE profile_id IN (
  SELECT profile_id FROM mst_profiles WHERE participant_code LIKE 'MOCK_E2E_%'
);
```

### Step 6 — Class Enrollment

```sql
-- Sim students from class
DELETE FROM tb_class_students
WHERE class_id = (
  SELECT class_id FROM tb_classes WHERE class_code = 'TEST_CLASS_E2E'
);

-- Mock E2E student enrollments (if any)
DELETE FROM tb_class_students
WHERE profile_id IN (
  SELECT profile_id FROM mst_profiles WHERE participant_code LIKE 'MOCK_E2E_%'
);
```

### Step 7 — Class-Batch Link

```sql
DELETE FROM tb_class_sets
WHERE class_id = (
  SELECT class_id FROM tb_classes WHERE class_code = 'TEST_CLASS_E2E'
);
```

### Step 8 — Class

```sql
DELETE FROM tb_classes WHERE class_code = 'TEST_CLASS_E2E';
```

### Step 9 — Tasks

```sql
DELETE FROM mst_tasks WHERE task_code LIKE 'TEST_TASK_SQL_E2E_%';
```

### Step 10 — Batch

```sql
DELETE FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001';
```

### Step 11 — Profiles

```sql
-- Sim students, teacher, researcher
DELETE FROM mst_profiles
WHERE participant_code LIKE 'SIM_E2E_%'
   OR participant_code IN ('SIM_TEACHER_E2E', 'SIM_RESEARCHER_E2E');

-- Mock E2E students
DELETE FROM mst_profiles WHERE participant_code LIKE 'MOCK_E2E_%';
```

### Step 12 — Auth Users (via Supabase Dashboard or Admin API)

Delete auth users with email pattern `*@ckv-mock.local` via:
- **Supabase Dashboard** → Authentication → Users → filter by `ckv-mock.local` → delete
- **OR** via admin API script:

```javascript
// scripts/e2e-reset-auth-users.mjs
const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
const mockUsers = list.users.filter(u => u.email?.endsWith('@ckv-mock.local'));
for (const u of mockUsers) {
  await supabase.auth.admin.deleteUser(u.id);
  console.log('Deleted:', u.email);
}
```

---

## Verification After Reset

Run these queries to confirm everything is clean:

```sql
-- Should all return 0
SELECT COUNT(*) FROM mst_profiles WHERE participant_code LIKE 'SIM_E2E_%';
SELECT COUNT(*) FROM mst_profiles WHERE participant_code LIKE 'MOCK_E2E_%';
SELECT COUNT(*) FROM mst_experiment_batches WHERE batch_code = 'TEST_BATCH_E2E_001';
SELECT COUNT(*) FROM mst_tasks WHERE task_code LIKE 'TEST_TASK_SQL_E2E_%';
SELECT COUNT(*) FROM tb_classes WHERE class_code = 'TEST_CLASS_E2E';

-- Verify no orphaned transactions from mock profiles
SELECT COUNT(*) FROM trn_submissions s
WHERE NOT EXISTS (SELECT 1 FROM mst_profiles p WHERE p.profile_id = s.profile_id);
```

---

## What Must NOT Be Deleted

- Real student profiles (`participant_code NOT LIKE 'SIM_E2E_%' AND NOT LIKE 'MOCK_E2E_%'`)
- Real class records (`class_code != 'TEST_CLASS_E2E'`)
- Production batches (SAQT0001, SAQT0002, etc.)
- Real task records (AQT000001, etc.)
- Any other non-sim transaction data

---

## Notebook Artifacts to Reset

Before real-data evaluation, also delete or archive:

| File | Action |
|---|---|
| `notebooks/models/metadata_v1.json` | Archive or delete — will be overwritten by real run |
| `notebooks/models/metadata_mock_v1.json` | Archive as simulation record |
| `notebooks/reports/eval_v1.md` | Archive or delete — will be overwritten by real run |
| `notebooks/reports/eval_mock_v1.md` | Keep as simulation evidence |
| `notebooks/models/lr_v1.pkl`, `rf_v1.pkl` | Delete (gitignored) |
| `notebooks/data/raw/*.csv` | Delete (gitignored) |
| `notebooks/data/processed/*.parquet` | Delete (gitignored) |

---

*Last updated: 2026-07-11 | Run this plan in a Supabase SQL editor (project Dashboard > SQL Editor) or via migration script.*
