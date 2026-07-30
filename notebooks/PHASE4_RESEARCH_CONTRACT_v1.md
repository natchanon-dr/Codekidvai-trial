# Phase 4 Research Contract — Sequential Learning Analytics
## Version: 1.0 | Date: 2026-07-15 | Status: APPROVED

This document is the authoritative specification for all Phase 4 notebooks,
datasets, models, and evaluation artifacts. Every milestone must comply with
this contract. Do not modify this file without creating a new versioned
contract (v2, v3, ...) and recording the rationale for the change.

---

## 1. Prediction Task

**Primary task:** Binary classification of learning risk.

Given a learner's observed behavioral sequence up to `cutoff_timestamp`,
predict whether their **final validated 2C3L outcome** is:

- `at_risk = 1` — final validated 2C3L score < 65
- `at_risk = 0` — final validated 2C3L score >= 65

---

## 2. Prediction Unit

One record per **learner × batch** pair.

A learner who appears in multiple batches contributes one record per batch.
A learner with no qualifying outcome after the cutoff is excluded.

---

## 3. Observation Window and Cutoff

| Field | Definition |
|-------|-----------|
| `observation_start` | First event timestamp for the learner in the batch |
| `cutoff_timestamp` | Timestamp of the learner's **first final submission** on the last assigned task in the batch |
| `outcome_timestamp` | Timestamp of the teacher-reviewed 2C3L score, or the auto-scored submission if no review exists |

**Cutoff rule:** No feature derived from events at or after `cutoff_timestamp`
may appear in model inputs. This includes final attempt scores, final SQL
correctness, and any rubric score component.

---

## 4. Canonical 2C3L Target

### Threshold

```
at_risk = 1  when total_2c3l_score < 65
at_risk = 0  when total_2c3l_score >= 65
```

`total_2c3l_score` is the weighted sum of per-criterion scores, expressed on
a 0–100 scale:

```
total_2c3l_score = (
    c1_score * 0.30 +
    c2_score * 0.20 +
    l1_score * 0.20 +
    l2_score * 0.15 +
    l3_score * 0.15
) / max_score * 100
```

This threshold is derived from Draft-06 (authoritative thesis version) and
**must not be silently replaced** with the Phase 3 value of `score * 0.60`.

### Phase 3 Compatibility Note

Phase 3 notebooks 02–03 use `PASS_THRESHOLD_RATIO = 0.60` on raw attempt
scores. This is a **different instrument on a different scale.** Phase 3
artifacts are preserved as historical technical validation only. The fair
model comparison in M6 retrains LR/RF under this canonical threshold.

---

## 5. Label Priority and Validity

| Priority | Source | `label_source` value | Usable for thesis conclusions? |
|----------|--------|---------------------|-------------------------------|
| 1 | Teacher-reviewed 2C3L score | `"teacher_reviewed"` | Yes |
| 2 | Expert/validated assessment | `"expert_validated"` | Yes |
| 3 | Auto-scored 2C3L with non-empty, measurable keywords for ALL five criteria | `"auto_scored_validated"` | With caveat |
| 4 | Auto-scored with empty/unmeasurable keywords on any criterion | `"auto_scored_invalid"` | No — pipeline validation only |
| 5 | No outcome available | `"unlabeled"` | Excluded from model training |

**Validation rule for Priority 3:** A label is `auto_scored_validated` only
when the rubric saved at submission time had `keywords.length > 0` for every
criterion AND the criterion was measurable via keyword matching (i.e., C1 only
in the current implementation). C2/L1/L2/L3 auto-scored labels are always
`auto_scored_invalid` until a semantic scoring layer is added (Phase 5).

Every row in every dataset artifact must carry a `label_source` column.

---

## 6. Unlabeled Record Policy

Records with `label_source IN ("auto_scored_invalid", "unlabeled")`:
- **Must not** appear in any model training or evaluation set used for thesis
  conclusions.
- **May** appear in technical pipeline validation (e.g., checking tensor
  shapes, sequence lengths) if explicitly tagged as such.
- Must be counted and reported in every dataset statistics table.

---

## 7. Event Taxonomy

### Production event types (as recorded in `trn_event_logs`)

| event_type | Source | Notes |
|------------|--------|-------|
| `session_start` | Client | |
| `question_view` | Client | |
| `sql_edit` | Client | |
| `sql_run` | Client AND Server | **DUPLICATE** — see §8 |
| `sql_success` | Server | Paired with server-side `sql_run` |
| `sql_error` | Server | Paired with server-side `sql_run` |
| `submit_answer` | Client AND Server | **DUPLICATE** — see §8 |
| `page_leave` | Server | |
| `session_end` | Server | |
| `block_add` | BlockSqlBuilder | **NOT COLLECTED** in Phase 4 |
| `block_move` | BlockSqlBuilder | **NOT COLLECTED** in Phase 4 |
| `block_delete` | BlockSqlBuilder | **NOT COLLECTED** in Phase 4 |
| `block_submit` | BlockSqlBuilder | **NOT COLLECTED** in Phase 4 |

### Phase 4 scope

Phase 4 uses **text-mode SQL sequences only.** Block-based events are not
collected in the current student task route. The vocabulary and sequence
schema reserve slots for block event types so the pipeline is extensible
when block collection is implemented in a later phase.

---

## 8. Event Deduplication Policy

### Confirmed duplicate pairs

**Pair A — `sql_run`**
A single "Run SQL" user action fires `sql_run` from both the client page
(optimistic, before the API call) and the server route handler.
Result: two consecutive `sql_run` events with the same session, consecutive
`event_order`, within ~2 seconds.

**Pair B — `submit_answer`**
Same pattern: client fires before API call, server fires inside the handler.

### Canonicalization rule (applied in Phase 4 pipeline only)

1. For each `(session_id, event_type)` pair where `event_type IN ("sql_run", "submit_answer")`:
   - If two consecutive events of the same type share the same `session_id`
     and their `event_order` values differ by exactly 1 and their timestamps
     differ by ≤ 5 seconds, treat them as a duplicate pair.
   - **Retain:** the event with the **higher `event_order`** (server-side).
   - **Drop:** the event with the lower `event_order` (client-side).
2. Raw `trn_event_logs` records are never modified.
3. The canonical event stream is written to `canonical_events.parquet` as a
   separate Phase 4 artifact with a `dropped_as_duplicate: bool` column.

The deduplication window (5 seconds) is a parameter in `seq_metadata.json`
and must be reported in every dataset statistics table.

---

## 9. Student-Level Split

| Parameter | Value |
|-----------|-------|
| Split key | `academy_member_id` (learner identity, not session) |
| Method | `GroupShuffleSplit` (outer train/test) |
| Cross-validation | `StratifiedGroupKFold` (Phase 4, replaces `StratifiedKFold` used in Phase 3 CV) |
| Test fraction | 0.20 |
| Random state | 42 |
| Constraint | No learner may appear in both train and test |

### Per-row split ledger (required, Phase 4)

`split_assignments.parquet` must be generated in M2 and carried through all
downstream notebooks. Schema:

| Column | Type | Description |
|--------|------|-------------|
| `academy_member_id` | str | learner identity key |
| `split` | str | `"train"` or `"test"` |
| `label_source` | str | see §5 |
| `at_risk` | int | 0 or 1 |

This file is the authoritative record for which learner belongs to which
partition. All downstream notebooks load this file and join on
`academy_member_id` rather than re-running the split.

---

## 10. Anti-Leakage Rules

The following columns **must not** appear as model inputs in any form
(directly or as a source for derived features):

- Any 2C3L criterion score (`c1_score`, `c2_score`, `l1_score`, `l2_score`, `l3_score`)
- `total_2c3l_score`
- `at_risk` (the target variable)
- `is_correct` on the final submission
- `score` on the final submission
- Any event with `event_time >= cutoff_timestamp`
- `rubric_applied_version`

Leakage check must be run as a notebook cell in M2 (sequence dataset) and
again in M7 (validation). The check must assert that the feature matrix
contains none of the above column names or their known aliases.

---

## 11. Artifact Naming Convention

| Artifact | Path | Version key |
|----------|------|-------------|
| Canonical events | `notebooks/data/sequences/canonical_events.parquet` | `seq_v1` |
| Sequence index | `notebooks/data/sequences/sequence_index.parquet` | `seq_v1` |
| Split assignments | `notebooks/data/sequences/split_assignments.parquet` | `seq_v1` |
| Sequence tensors | `notebooks/data/sequences/sequence_tensors_v1.npz` | `v1` |
| Vocabulary | `notebooks/data/sequences/vocabulary_v1.json` | `v1` |
| Scaler params | `notebooks/data/sequences/scaler_v1.json` | `v1` |
| Sequence manifest | `notebooks/data/sequences/sequence_manifest_v1.json` | `v1` |
| TAG nodes | `notebooks/data/tag/tag_nodes_v1.parquet` | `v1` |
| TAG edges | `notebooks/data/tag/tag_edges_v1.parquet` | `v1` |
| LSTM model | `notebooks/models/sequence/lstm/lstm_model_v1.pt` | `v1` |
| GRU model | `notebooks/models/sequence/gru/gru_model_v1.pt` | `v1` |
| Comparison table | `notebooks/models/sequence/comparison/model_comparison_v1.md` | `v1` |

All artifacts carry a `schema_version` field in their metadata.
`seq_v1` is the canonical schema version for Phase 4.

---

## 12. Dataset Size and Research Framing

**Current dataset:** ~10 students (mock/auto-generated data for pipeline
validation only).

**Final thesis dataset:** ≥ 60 participants (30 experimental, 30 control)
per Draft-06.

| Use | Dataset | Framing |
|-----|---------|---------|
| Pipeline validation (tensor shapes, ordering, deduplication) | 10-student mock | Technical validation only |
| Preliminary model execution check | 10-student mock | Pilot / feasibility |
| Chapter 4 research conclusions | ≥ 60 validated participants | Generalizable findings |

All outputs generated from the 10-student dataset must be clearly labeled:

```
⚠ TECHNICAL VALIDATION ONLY — generated from 10-student mock dataset.
  Not suitable for research conclusions. Final results require ≥ 60 participants.
```

Do not:
- Claim LSTM/GRU superiority from pilot metrics
- Perform confirmatory hypothesis testing on pilot data
- Present pilot metrics in Chapter 4 tables without the above warning

---

## 13. Model Comparison Contract

All models in the Phase 4 comparison table (M6) must use:

| Parameter | Value |
|-----------|-------|
| Target threshold | 65-point canonical 2C3L |
| Cohort | Same eligible students (those with valid labels) |
| Observation cutoff | Same `cutoff_timestamp` per learner |
| Held-out test set | Same `split_assignments.parquet` test partition |
| CV method | `StratifiedGroupKFold` |
| Threshold selection | From validation fold only, never from test fold |

Models included:
- Dummy baseline (stratified)
- Logistic Regression (retrained under canonical threshold)
- Random Forest (retrained under canonical threshold)
- TAG-based classifier (if formally implemented as a graph-derived feature classifier)
- LSTM
- GRU

Phase 3 LR/RF artifacts (`lr_v1.pkl`, `rf_v1.pkl`) are preserved unchanged.
Retrained versions are saved as `lr_canonical_v1.pkl`, `rf_canonical_v1.pkl`.

---

## 14. Approved Decisions (from M0 review, 2026-07-15)

| # | Decision |
|---|---------|
| D1 | No Priority-1 (teacher-reviewed) labels exist in current dataset. All current labels are `auto_scored_invalid` for thesis purposes. |
| D2 | Empty-keyword fix applied to `evaluateRubricCriteria` — commit `4c262c7`. |
| D3 | `BlockSqlBuilder` remains disconnected. Phase 4 is text-mode SQL sequences only. Block-based collection deferred to a later phase. |
| D4 | Current 10-student dataset is pipeline-validation scope only. Final thesis requires ≥ 60 participants. |
| D5 | Phase 3 `StratifiedKFold` CV is a known limitation, documented here. Phase 4 uses `StratifiedGroupKFold`. |
| D6 | Phase 3 artifacts are frozen as historical technical validation. Fair comparison uses canonical-threshold retrained models. |

---

## 15. Proxy Label Circularity Notice (added 2026-07-16)

When the behavioral proxy fallback is active (`label_source = "proxy_behavioral"`), the
flat behavioral feature set used in M6 includes `any_correct` and `correctness_ratio`,
which are **deterministic encodings of the proxy label itself.** This causes all
non-Dummy models to score 1.0 on the pilot. The LSTM/GRU sequence tensors carry an
indirect circularity via `sql_success` token encoding.

These results are pipeline validation artifacts only. They must not be interpreted as
model performance.

Full analysis: [`PHASE4_PROXY_LABEL_LIMITATIONS.md`](PHASE4_PROXY_LABEL_LIMITATIONS.md)

---

## 16. Next Milestone

**M2 — Sequence Dataset (`05_sequence_dataset.ipynb`)**

Inputs:
- `vw_dataset_sequence_level` (raw event export)
- `vw_dataset_attempt_level` (attempt features)
- `trn_submission_rubric_scores` (label derivation query)
- `split_assignments.parquet` (generated fresh in M2)

Outputs: see §11 artifact table.

Do not begin M3 (TAG) or M4 (LSTM) until M2 artifacts pass the
leakage check and split-integrity check defined in §9–10.
