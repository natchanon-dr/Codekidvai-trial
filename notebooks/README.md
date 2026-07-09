# Phase 3 AI Risk Model Notebooks

This directory contains the research notebook pipeline for **Phase 3: AI Risk Model Foundation**.

Phase 3 is intentionally separated from the Next.js application, database schema, and API layer. It uses exported CSV snapshots as research artifacts and trains baseline machine-learning models offline.

## Research Positioning

- **BS-SA/BSSA remains the main research framework.**
- **2C3L remains a scoring rubric / assessment mechanism under the Assessment Layer.**
- Phase 3 baseline models use learning activity, attempt behavior, timing, task metadata, and learner-group metadata.
- 2C3L criterion scores are post-submission assessment outputs and are excluded from the baseline feature matrix to prevent data leakage.
- 2C3L criterion scores may be used later only as an ablation/oracle experiment, not as deployed model input.

## Pipeline

Run notebooks in order:

1. `01_load_dataset.ipynb`  
   Load session-level and attempt-level CSV snapshots, validate required columns, check PII-sensitive columns, and record snapshot metadata.

2. `02_data_quality_check.ipynb`  
   Planned: null rates, class balance, learner-group distribution, row counts, and rubric coverage checks.

3. `03_feature_engineering.ipynb`  
   Planned: build leakage-safe feature matrix, labels, and learner-group train/test split.

4. `04_baseline_model_lr_rf.ipynb`  
   Planned: train and evaluate Logistic Regression and Random Forest baselines.

## Data Snapshot Convention

Raw exported CSV files must be placed under:

```text
notebooks/data/raw/
```

Recommended filenames:

```text
session_YYYYMMDD_batchXXX.csv
attempt_YYYYMMDD_batchXXX.csv
```

Generated processed data should stay under:

```text
notebooks/data/
```

The `notebooks/data/` directory is gitignored except for `.gitkeep` placeholders. Do not commit raw CSV exports or processed datasets.

## Primary Feature Schema

Session-level baseline features:

| Feature | Source | Notes |
|---|---|---|
| `total_run_count` | `trn_submissions` | behavioral effort |
| `total_attempt_count` | `trn_submissions` | persistence proxy |
| `time_to_first_correct_sec` | `trn_submissions` | speed of convergence |
| `hint_viewed` | `trn_submissions` | boolean converted to 0/1 |
| `session_duration_sec` | `trn_learning_sessions` | engagement time |
| `error_type_diversity` | `trn_attempts` aggregate | distinct error types seen |
| `first_attempt_correct` | `trn_attempts` aggregate | binary: correct on first try |
| `attempt_correct_ratio` | `trn_attempts` aggregate | correct attempts / total attempts |
| `avg_execution_time_ms` | `trn_attempts` aggregate | runtime performance hint |
| `task_difficulty_level` | `mst_tasks` | 1–5 scale when available |
| `task_type_encoded` | `mst_tasks` | `sql_block=0`, `sql_text=1` |
| `learner_group_encoded` | `mst_learner_groups` | `G1=1`, `G2=2`, `G3=3`, `G4=4` |

## Excluded Baseline Features

These columns must not be used as Phase 3 baseline model inputs:

| Excluded field | Reason |
|---|---|
| `review_score` | label source / leakage |
| `auto_score` | label source / leakage |
| `final_score` | label source / leakage |
| `effective_score` | label source / leakage |
| `is_passed` | derived from score / leakage |
| `student_id` | identity leakage / PII risk |
| `auth_user_id` | PII |
| `email` | PII |
| `display_name` | PII |
| `teacher_feedback` | unstructured and out of baseline scope |
| `c1_correctness_result` | post-submission 2C3L assessment score |
| `c2_semantic_consistency` | post-submission 2C3L assessment score |
| `l1_logical_reasoning` | post-submission 2C3L assessment score |
| `l2_learning_process` | post-submission 2C3L assessment score |
| `l3_difficulty_complexity` | post-submission 2C3L assessment score |

## Label Definition

Binary label:

```text
at_risk = 1 if effective_score < pass_threshold OR submission is missing
at_risk = 0 otherwise
```

Initial threshold:

```text
pass_threshold = max_score * 0.6
```

If rubric-specific `pass_threshold` is available in a snapshot, that threshold should override the default.

## Leakage Prevention Rules

1. Do not include score-derived fields in `X`.
2. Do not include post-submission 2C3L criterion scores in the Phase 3 baseline feature set.
3. Use only events and attempts that occurred before the final submission timestamp.
4. Use learner-level grouped train/test split so the same learner does not appear in both train and test.
5. If multiple academic terms or batches exist, prefer temporal validation: train on older completed batches and test on newer completed batches.

## Model Scope

Phase 3 baseline models:

- Logistic Regression
- Random Forest

Out of scope for Phase 3:

- LSTM
- GRU
- Transformer
- Knowledge Tracing
- FastAPI serving
- Next.js prediction API
- Database table for risk scores

## Installation

```bash
pip install -r notebooks/requirements.txt
```
