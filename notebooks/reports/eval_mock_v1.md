# Phase 3 — E2E Mock Pipeline Validation Report

> **WARNING: MOCK DATA ONLY**
> This report documents an end-to-end smoke test using synthetic data seeded via `scripts/e2e-seed-mock-learners.mjs` and exported via `scripts/e2e-export-mock-csv.mjs`.
> Metrics shown here are **NOT real research findings** and must **NOT** be cited in the thesis.
> Real-data evaluation is pending export from the production system.

---

## 1. Purpose

Verify that the Phase 3 notebook pipeline (M3.1–M3.4) executes end-to-end without errors using Supabase-backed mock data that exercises the full path:

```
Supabase DB → export script → raw CSV → NB02 → NB03 → NB04 → model artifacts
```

This run validates the **system loop**, not model quality.

---

## 2. Mock Dataset Summary

| Item | Value |
|---|---|
| Snapshot date | 2026-07-10 |
| Batch code | E2EMOCK |
| Source batch | SAQT0001 (mock sessions only) |
| Session rows (exported) | 448 |
| Attempt rows (exported) | 23 |
| Unique learners | 37 (35 mock + 2 existing) |
| Unique tasks | 8 |
| **at_risk proxy = 1** | 100 (22.3%) |
| **at_risk proxy = 0** | 348 (77.7%) |
| Sessions without submission | 38 (8.5%) |
| Seed scripts | `scripts/e2e-seed-mock-learners.mjs` |
| Export script | `scripts/e2e-export-mock-csv.mjs` |

---

## 3. Gate Check Results

### NB02 — Data Quality Check

| Check | Result |
|---|---|
| Required session columns present | PASS |
| PII-sensitive column check | PASS — no PII |
| at_risk label computed | PASS |
| Quality gate (n_students ≥ 10, n_pairs > 0) | PASS — proceed to 03 |

### NB03 — Feature Engineering

| Check | Result |
|---|---|
| All 13 baseline feature columns present | PASS |
| Leakage check (no oracle/score columns in X_baseline) | PASS — no leakage |
| GroupShuffleSplit by academy_member_id | PASS — no student overlap |
| Parquet files written (X_baseline_train, X_baseline_test) | PASS |
| Label CSV files written (y_train, y_test) | PASS |
| split_metadata.json written | PASS |

### NB04 — Baseline Models

| Check | Result |
|---|---|
| DummyClassifier (majority-class baseline) | PASS |
| Logistic Regression (class_weight="balanced") | PASS |
| Random Forest (class_weight="balanced") | PASS |
| confusion_matrices.png saved | PASS |
| roc_curves.png saved | PASS |
| rf_feature_importance.png saved | PASS |
| lr_coefficients.png saved | PASS |
| models/metadata_v1.json written | PASS |
| reports/eval_v1.md written | PASS |
| LR baseline gate (F1 + AUC > majority) | PASS |
| RF baseline gate (F1 + AUC > majority) | PASS |

---

## 4. Split Summary

| | Train | Test |
|---|---|---|
| Rows | 226 | 128 |
| Unique students | 29 | 8 |
| at_risk rate | 32.7% | 20.3% |
| Method | GroupShuffleSplit on academy_member_id | — |

No student appears in both train and test sets (verified by NB03 gate).

---

## 5. Model Metrics (MOCK DATA — NOT REAL FINDINGS)

### 5-Fold Cross-Validation (train set)

| Model | ROC AUC | F1 |
|---|---|---|
| majority_baseline | 0.5000 ± 0.0000 | 0.0000 |
| logistic_regression | 1.0000 ± 0.0000 | 1.0000 |
| random_forest | 1.0000 ± 0.0000 | 1.0000 |

### Held-out Test Set

| Model | ROC AUC | F1 | Precision | Recall |
|---|---|---|---|---|
| majority_baseline | 0.50 | 0.00 | 0.00 | 0.00 |
| logistic_regression | 1.00 | 1.00 | 1.00 | 1.00 |
| random_forest | 1.00 | 1.00 | 1.00 | 1.00 |

---

## 6. Issues Found and Resolved During Validation

### Issue 1: at_risk_rate = 0.0 (resolved)

**Root cause**: `time_to_first_correct_sec` is NULL in DB for learners who never achieved a correct answer. NB03's `dropna(subset=BASELINE_FEATURE_COLS)` removed all at_risk rows, leaving a degenerate dataset with no positive labels.

**Fix**: `scripts/e2e-export-mock-csv.mjs` now fills `time_to_first_correct_sec = 0` when NULL (sentinel value for "never achieved first correct answer"). This keeps at_risk rows in the feature matrix while remaining semantically meaningful.

**Research note**: In real-data evaluation, `time_to_first_correct_sec = 0` for never-correct learners may need adjustment (e.g., fill with session_duration_sec as upper bound). This is a pre-processing decision to document in the methods section.

### Issue 2: NB04 joblib Windows crash (resolved)

**Root cause**: `n_jobs=-1` in `cross_validate` and `RandomForestClassifier` triggers a resource_tracker `KeyError` on Windows due to ProactorEventLoop / multiprocessing spawn differences.

**Fix**: `notebooks/run_e2e_notebooks.py` patches `n_jobs=-1` → `n_jobs=1` before execution. Single-threaded CV is slower but stable on Windows. On Linux/macOS CI, `n_jobs=-1` can remain unchanged.

---

## 7. Interpretation

AUC = 1.0, F1 = 1.0 for LR and RF are **expected and correct** for synthetic data. The mock generator produces perfectly separable patterns: passing learners have scores ≥ 70% of max, at_risk learners have scores < 55% or no submission. These results confirm:

1. The pipeline executes end-to-end from Supabase export to model artifact without errors.
2. Leakage prevention (score, review_score, is_passed excluded from X_baseline) is enforced.
3. Student-level group splitting prevents data leakage across train/test.
4. All artifact files are written to the correct paths under `notebooks/models/` and `notebooks/reports/`.
5. The `n_jobs=1` workaround enables full pipeline execution on Windows.

These results say **nothing** about model performance on real student data.

---

## 8. Artifacts Written by This Run

| File | Status | Notes |
|---|---|---|
| `notebooks/models/metadata_v1.json` | Committed | E2EMOCK run metadata |
| `notebooks/reports/eval_v1.md` | Committed | E2EMOCK run evaluation (from NB04) |
| `notebooks/reports/eval_mock_v1.md` | Committed | This file — E2E mock validation summary |
| `notebooks/models/lr_v1.pkl` | gitignored | Not committed |
| `notebooks/models/rf_v1.pkl` | gitignored | Not committed |
| `notebooks/data/raw/session_20260710_E2EMOCK.csv` | gitignored | Not committed |
| `notebooks/data/raw/attempt_20260710_E2EMOCK.csv` | gitignored | Not committed |
| `notebooks/data/processed/*.parquet` | gitignored | Not committed |
| `notebooks/reports/confusion_matrices.png` | gitignored | Not committed |
| `notebooks/reports/roc_curves.png` | gitignored | Not committed |
| `notebooks/reports/rf_feature_importance.png` | gitignored | Not committed |
| `notebooks/reports/lr_coefficients.png` | gitignored | Not committed |

---

## 9. Real-Data Evaluation Status

**Status: PENDING**

Steps required before real evaluation:

1. Export session and attempt CSVs from `/researcher/dataset` portal.
2. Place files in `notebooks/data/raw/` with naming `session_YYYYMMDD_BATCHCODE.csv` / `attempt_YYYYMMDD_BATCHCODE.csv`.
3. Update `SNAPSHOT_DATE` and `BATCH_CODE` config variables in notebooks 02–04.
4. Run notebooks 01 → 02 → 03 → 04 in order.
5. Commit `notebooks/models/metadata_v1.json` and `notebooks/reports/eval_v1.md`.
6. Report real metrics in thesis.

---

*Generated: 2026-07-10 | Branch: feature/phase3-ai-risk-model | Phase 3 M3.1–M3.4 | E2E Mock Validation*
