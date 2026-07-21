# Phase 4 — Proxy Label Circularity and Pilot Limitations

**Document type:** Research integrity notice  
**Status:** REQUIRED READING before interpreting any Phase 4 M6 metrics  
**Date:** 2026-07-16  
**Branch:** `feature/phase4-sequential-analytics`  
**Related contract:** `PHASE4_RESEARCH_CONTRACT_v1.md`

---

## 1. Background

No teacher-reviewed 2C3L labels exist in the current 10-student pilot dataset (Contract §14 D1). The Phase 4 pipeline therefore falls back to a **behavioral proxy label** when all outcome rows are `no_rubric`:

```
at_risk = 1  if the learner never produced a correct attempt
at_risk = 0  if the learner produced at least one correct attempt
```

Formally: `at_risk = int(NOT any(is_correct == 1))`

This label is tagged `label_source = "proxy_behavioral"`, `label_validity = "pilot_only"` throughout all M2–M6 artifacts.

---

## 2. The Circularity Problem

### 2.1 Direct circularity in flat behavioral features (M6 LR / RF / TAG-LR)

The flat behavioral feature set built in `09_model_comparison.ipynb` includes:

| Feature | Derived from |
|---|---|
| `correctness_ratio` | `sum(is_correct) / count(submit_answer)` |
| `any_correct` | `any(is_correct == 1)` |

The proxy label is:

```
at_risk = 1  iff  any_correct == 0
at_risk = 0  iff  any_correct == 1
```

`any_correct` is therefore a **deterministic, invertible encoding of the label itself.**  
`correctness_ratio` is zero if and only if `any_correct == 0`.

**Consequence:** Any classifier that receives `any_correct` or `correctness_ratio` as features will trivially memorize the label from the feature alone, without learning any generalizable pattern. This is not model performance — it is tautology.

This explains why **all non-Dummy models score 1.0 accuracy / F1 / AUC** in the M6 primary comparison table.

### 2.2 Indirect circularity in sequence tensors (M6 LSTM / GRU)

The canonical event stream contains `sql_success` and `sql_error` event types, which are encoded as distinct token IDs in the vocabulary (`vocabulary_v1.json`). A learner who never has a `sql_success` event is, by construction, a learner who never had a correct run — the exact definition of `at_risk = 1`.

The LSTM and GRU therefore also have a direct signal to the proxy label embedded in the event-type token sequence, even without explicit correctness features.

**Consequence:** LSTM/GRU perfect scores on the pilot are also explained by this indirect circularity, not by the models learning a useful sequential risk pattern.

### 2.3 TAG features — no direct circularity, but related signals

The 18 graph features in `tag_graph_features_v1.parquet` include `error_recovery_count` and `error_recovery_rate`, which measure transitions from `sql_error` to `sql_run`. These are behaviorally related to (but not identical to) the proxy label.

The TAG-based LR also scores 1.0 on the pilot, but this may reflect separability of the two test learners on other graph features, not necessarily circularity.

---

## 3. Why This Is Not a Bug

The proxy label fallback is an **explicitly approved design decision** for pipeline validation (Contract §14 D1, D4). The purpose of running M2–M6 on this dataset is to verify that:

- Tensors are correctly shaped and padded
- Split integrity is preserved end-to-end
- No schema or dimension mismatch exists between notebooks
- Training loops run without error
- Artifact checksums are consistent
- Timing and reproducibility infrastructure is functional

**The proxy label enables this pipeline check.** It is not intended to produce interpretable model comparisons.

---

## 4. Implications for M6 Results

The M6 primary comparison table **must not be interpreted as evidence** of any of the following:

| Claim | Status |
|---|---|
| LR/RF are better than Dummy for at-risk prediction | **NOT SUPPORTED** — circularity |
| LSTM/GRU learn useful sequential patterns | **NOT SUPPORTED** — indirect circularity |
| TAG features add predictive value | **NOT SUPPORTED** — pilot only, 2 test learners |
| GRU outperforms LSTM | **NOT SUPPORTED** — both are 1.0 on trivial labels |
| Any model confirms H5 | **EXPLICITLY PROHIBITED** — Contract §12 |
| These metrics can appear in Chapter 4 as results | **NOT PERMITTED** without the pilot-limitation warning |

The comparison table is valid only as a **pipeline integration check**: it confirms that all 6 model types run on the same inputs, produce probabilities in [0,1], and pass the 18-point validation gate.

---

## 5. What Changes With Teacher-Reviewed Labels

When the final validated dataset is available (≥ 60 learners, teacher-reviewed 2C3L scores), the following changes are required before re-running M6:

### 5.1 Remove circular features

`any_correct` and `correctness_ratio` are **legitimate predictive features** under a teacher-reviewed 2C3L label (because a learner with high correctness ratio can still receive a low 2C3L score on semantic or logical dimensions). However, given the historical confusion this pilot has demonstrated, it is recommended to:

1. Keep `correctness_ratio` as a feature — it is genuinely informative and pre-cutoff.
2. **Remove `any_correct`** from the final flat feature set, because it collapses too cleanly to a binary signal.
3. Document the retained feature set explicitly in the M6 re-run.

### 5.2 Re-evaluate LSTM/GRU vocabulary

Consider whether `sql_success` should be a distinct vocabulary token or whether only `sql_error` / `sql_run` / `submit_answer` are informationally useful. Including `sql_success` in the vocabulary may leak post-run server confirmation into the feature stream in unexpected ways.

### 5.3 TAG features remain safe

The 18 TAG graph features are derived from pre-cutoff event structure only. They contain no direct `is_correct` encoding. They are approved for use with teacher-reviewed labels without modification.

### 5.4 Pilot framing must be removed from thesis-facing tables

All `label_validity = "pilot_only"` rows must be excluded from Chapter 4 tables. The M6 notebook must be re-run with the final validated dataset to produce thesis-eligible results.

---

## 6. Threshold Selection Note

The pilot used `DECISION_THRESHOLD = 0.5` (fixed). Under the final validated dataset, threshold selection must be performed on the validation fold only — never on the test fold — per Contract §13. Under proxy labels, threshold selection is meaningless because all models saturate at 1.0.

---

## 7. Statistical Interpretation Rules (Pilot)

The following statistical operations are **prohibited** on pilot data:

| Operation | Reason |
|---|---|
| McNemar's test / paired significance test | Requires real labels and sufficient N |
| Confidence intervals on AUC/F1 | N=2 test learners produces degenerate intervals |
| Effect size (Cohen's d, etc.) | Undefined on trivial outputs |
| Claim that H5 is confirmed or rejected | Reserved for final validated dataset |
| Comparison of LSTM vs GRU training time as architectural insight | Framework difference confounds comparison (sklearn vs PyTorch) |

---

## 8. Checklist for Re-Running M6 on Final Dataset

Before re-running `09_model_comparison.ipynb` on the final validated dataset:

- [ ] Replace `canonical_events.parquet` and `split_assignments.parquet` with final-dataset artifacts
- [ ] Verify `label_source IN ("teacher_reviewed", "expert_validated")` for all training rows
- [ ] Remove `any_correct` from `FLAT_FEATURE_NAMES` in `features-01`
- [ ] Confirm `correctness_ratio` is still appropriate given final label instrument
- [ ] Re-run M2 → M3 → M4 → M5 → M6 in sequence (do not reuse pilot tensors)
- [ ] Verify `N_TEST_CLASSES == 2` in both train and test splits
- [ ] Re-run threshold selection on validation fold
- [ ] Confirm 18/18 validation checks pass on final dataset
- [ ] Update `label_validity` to `"thesis_eligible"` in manifest
- [ ] Remove all `proxy_behavioral / pilot_only` warnings from thesis-facing outputs
- [ ] Add BSSA integration (Phase 5) as an additional experiment row

---

## 9. Document History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-07-16 | CodeKidVai | Initial document; created after M6 completion to record circularity analysis |
