# E2E System Loop Validation Checklist — CKV Phase 3

> **Purpose:** Verify that the complete system loop — from teacher/admin setup through student activity, data export, and notebook pipeline — works end-to-end before committing Phase 3 real-data evaluation.
>
> Complete all 14 areas in order. Mark each item `[x]` when verified. Do not run the real notebook pipeline until Areas 1–11 are fully checked.

---

## Area 1 — Admin / Teacher Account Setup

- [ ] Admin account exists and can log in
- [ ] Teacher account exists and is assigned to a class
- [ ] Teacher can access the analytics and dataset export pages
- [ ] No PII (email, display name, `auth_user_id`) is exposed in exported data

---

## Area 2 — Class and Batch Setup

- [ ] At least one class (`mst_class`) exists with a defined `batch_id` or `batch_code`
- [ ] Class is marked active and linked to the correct academy
- [ ] Learner groups (G1–G4 or equivalent) are assigned to students
- [ ] Batch has a clear start and end date

---

## Area 3 — Task Assignment

- [ ] At least 6–8 tasks are published and assigned to the class
- [ ] Each task has `max_score`, `task_difficulty_level`, and `task_type` defined
- [ ] Tasks cover at least two difficulty levels for meaningful feature variance
- [ ] All tasks are visible to enrolled students

---

## Area 4 — Student Login and Enrollment

- [ ] At least 30 students are enrolled (minimum for stable GroupShuffleSplit)
- [ ] Students can log in and see their assigned tasks
- [ ] `academy_member_id` is present and consistent in session records
- [ ] Student learner group assignment is correctly stored

---

## Area 5 — Task Attempt Flow (Student Side)

- [ ] Students can run code (run attempts recorded in attempt table)
- [ ] Students can submit code (final submission recorded in session table)
- [ ] `submitted_at` is set correctly on submission
- [ ] `attempt_type` distinguishes "run" from "submit"
- [ ] `error_type` is recorded correctly for failed attempts

---

## Area 6 — Run and Submit Recording

- [ ] `trn_attempt` rows are created for each run and submit event
- [ ] `execution_time_ms` is recorded per attempt
- [ ] `is_correct` flag is set based on test results
- [ ] `hint_viewed` is recorded correctly in the session table
- [ ] `session_duration_sec` accumulates correctly
- [ ] `total_run_count` and `total_attempt_count` are updated

---

## Area 7 — Database Records Integrity

- [ ] Each student × task pair has at most one session row (`trn_session`)
- [ ] Missing submissions (no `submitted_at`) are represented as null scores, not missing rows
- [ ] No duplicate session rows for the same student × task
- [ ] FK references (`academy_member_id`, `task_id`, `batch_id`) are consistent

---

## Area 8 — 2C3L Scoring (Teacher Review)

- [ ] Teacher can open the rubric review interface for submitted work
- [ ] `c1_correctness_result`, `c2_semantic_consistency`, `l1_logical_reasoning`, `l2_learning_process`, `l3_difficulty_complexity` are recorded on review
- [ ] `review_score` is set after teacher completes scoring
- [ ] Rows without teacher review have all 5 criteria columns as NULL (not zero)
- [ ] `auto_score` is set independently by the system (not dependent on teacher review)

---

## Area 9 — Teacher Analytics Page

- [ ] Teacher can view per-student and per-task analytics
- [ ] Score distributions and attempt summaries display correctly
- [ ] No errors in the analytics export (Phase 2 Pillar A+B)
- [ ] Research CSV download works (Phase 2 B3)

---

## Area 10 — Data Quality Pre-check (Manual)

Before exporting for notebooks, manually verify:

- [ ] At least 30 unique `academy_member_id` values in session data
- [ ] At least 4 unique `task_id` values
- [ ] At least some rows with `submitted_at` not null (submitted sessions)
- [ ] At least some rows with `submitted_at` null (missing submissions → at_risk=1)
- [ ] `auto_score` is non-null for submitted rows
- [ ] `max_score` is set for all tasks
- [ ] No student appears with zero session rows (enrollment without any activity is acceptable)

---

## Area 11 — Admin Dataset Export

- [ ] Researcher/Admin can access `/researcher/dataset` (dataset export portal)
- [ ] Export produces a session CSV with all required columns:
  - `session_id`, `academy_member_id`, `task_id`, `batch_id`, `learner_group`
  - `submitted_at`, `auto_score`, `review_score`, `max_score`
  - `time_to_first_correct_sec`, `session_duration_sec`, `total_run_count`, `total_attempt_count`, `hint_viewed`
  - `c1_correctness_result`, `c2_semantic_consistency`, `l1_logical_reasoning`, `l2_learning_process`, `l3_difficulty_complexity`
  - `task_difficulty_level`, `task_type`
- [ ] Export produces an attempt CSV with all required columns:
  - `attempt_id`, `session_id`, `academy_member_id`, `task_id`
  - `attempt_type`, `is_correct`, `error_type`, `execution_time_ms`, `created_at`
- [ ] No secrets, `auth_user_id`, or raw email fields in the export
- [ ] File naming matches convention: `session_YYYYMMDD_BATCHCODE.csv` / `attempt_YYYYMMDD_BATCHCODE.csv`

---

## Area 12 — Notebook Pipeline (Real Data Run)

After placing CSVs in `notebooks/data/raw/`:

- [ ] **NB01** — `01_load_dataset.ipynb` completes without FileNotFoundError
  - [ ] Schema validation passes (all required columns present)
  - [ ] `snapshot_metadata.json` written to `notebooks/data/`
- [ ] **NB02** — `02_data_quality_check.ipynb` completes with gate `[OK]`
  - [ ] at_risk rate is in a reasonable range (not 0% or 100%)
  - [ ] Imbalance ratio is reported
  - [ ] Chart images generated in `notebooks/reports/`
- [ ] **NB03** — `03_feature_engineering.ipynb` completes with no leakage or overlap
  - [ ] `[LEAKAGE CHECK] PASS` printed
  - [ ] `[SPLIT CHECK] PASS — no student overlap` printed
  - [ ] Parquet and CSV files written to `notebooks/data/processed/`
- [ ] **NB04** — `04_baseline_model_lr_rf.ipynb` completes with baseline gate PASS
  - [ ] `[PASS] logistic_regression` printed
  - [ ] `[PASS] random_forest` printed
  - [ ] `metadata_v1.json` and `eval_v1.md` written with real metrics

---

## Area 13 — Mock Verification Cross-check

Compare real-run results against mock pipeline expectations:

- [ ] Pipeline structure matches: same gates, same outputs, same artifact paths
- [ ] Real AUC and F1 are lower than 1.0 (confirming real data is not perfectly separable)
- [ ] LR and RF still outperform `majority_baseline` on real data
- [ ] at_risk distribution in real data is documented and differs from mock (36.1%)
- [ ] No `metadata_v1.json` confusion with `metadata_mock_v1.json`
- [ ] No `eval_v1.md` confusion with `eval_mock_v1.md`

---

## Area 14 — Readiness Decision

Before committing real evaluation artifacts to the branch:

- [ ] All Areas 1–13 checked and passed
- [ ] Real `notebooks/models/metadata_v1.json` contains actual model metrics
- [ ] Real `notebooks/reports/eval_v1.md` contains actual evaluation narrative
- [ ] `.pkl` model files are confirmed gitignored (not staged)
- [ ] Raw CSV files are confirmed gitignored (not staged)
- [ ] Chart images (`.png`) are confirmed gitignored (not staged)
- [ ] Commit includes only: `metadata_v1.json`, `eval_v1.md`, and any notebook changes
- [ ] Phase 3 M3.1–M3.4 marked complete in thesis tracking

**Readiness decision:**
- [ ] READY — proceed to commit real evaluation artifacts and close Phase 3
- [ ] NOT READY — document blockers and resolve before committing

---

## Appendix — Feature Leakage Reference

The following features must **never** appear in `X_baseline`. They are oracle/ablation features only.

| Feature | Reason for exclusion |
|---|---|
| `c1_correctness_result` | Post-submission 2C3L score — available only after teacher review |
| `c2_semantic_consistency` | Post-submission 2C3L score |
| `l1_logical_reasoning` | Post-submission 2C3L score |
| `l2_learning_process` | Post-submission 2C3L score |
| `l3_difficulty_complexity` | Post-submission 2C3L score |
| `auto_score` | Target-derived — directly determines at_risk label |
| `review_score` | Target-derived — directly determines at_risk label |
| `effective_score` | Target-derived — COALESCE(review_score, auto_score) |
| `at_risk` | The label itself |

---

*Document version: 1.0 | Created: 2026-07-10 | Branch: feature/phase3-ai-risk-model*
*Scope: Phase 3 M3.1–M3.4 (research artifact layer only — no DB/API/UI changes)*
*Phase 4 scope: M3.5 teacher-facing risk API (deferred)*
