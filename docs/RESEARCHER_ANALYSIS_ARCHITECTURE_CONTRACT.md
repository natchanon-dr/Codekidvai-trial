# Researcher Analysis Architecture Contract (M5.31-R1)

Status: LOCKED (terminology + nav shape). Implementation beyond the pages
listed as "done" below requires separate, approved milestones — see
`M5.31-R2` onward.

This document is the single source of truth for the "One Canonical Dataset
→ Five Analysis Paths" architecture. It supersedes the earlier BSSA-only
framing. If any other doc/comment conflicts with this file, this file wins;
update the other doc.

## 1. Five parallel Analysis paths

```
                         ONE CANONICAL DATASET
                                  |
       +--------------+-----------+-----------+--------------+
       |              |           |           |              |
       v              v           v           v              v
 Final Result     Behavioral  Sequential   Semantic        BSSI
  Analysis        Analysis    Analysis     Analysis       Analysis
       |              |           |           |              |
       v              v           v           v              v
 Final Inputs     B Features  Seq Features Sem Features   BSSI Features
       |              |           |           |              |
       v              v           v           v              v
      TAG           LR / RF    LSTM / GRU  SVM/XGBoost     BSSM
       |              |           |           |              |
       v              v           v           v              v
  TAG Result     Behavioral   Sequential   Semantic       BSSI Result
                   Result       Result       Result
```

These are **five independent analytical views**, not a pipeline
(Behavioral → Sequential → Semantic → BSSI is WRONG; LR/RF → LSTM/GRU →
SVM/XGBoost → BSSI is WRONG). Each must be independently runnable from the
same dataset without requiring the other four to run first.

**Nav mapping (Researcher dashboard):**

| Slot | Title | Route | Status as of this milestone |
|---|---|---|---|
| 4 | Final Result Analysis | `/researcher/final-result-analysis` | Live (dataset table + TAG summary, no pipeline-run lifecycle yet) |
| 5 | Behavioral Analysis | `/researcher/behavioral-analysis` | Static page, no dedicated API yet — needs R4 |
| 6 | Sequential Analysis | `/researcher/sequential-analysis` | Live, full pipeline-run lifecycle (reference implementation) |
| 7 | Semantic Analysis | `/researcher/semantic-analysis` | Live (NB10-12 descriptive methods only — no predictive models yet) |
| 9 | BSSI Analysis | `/researcher/bssi-analysis` | Live (domain availability + matrix, no BSSM yet) |

There is **no separate "TAG Analysis" nav item.** TAG lives inside Final
Result Analysis.

## 2. Terminology — locked

- **Final Result Analysis** — Input: Final Result / Final Submission only.
  Method: **TAG = Traditional Auto Grading** (NEW thesis-facing meaning).
  Output: TAG Result (Correct/Incorrect, correct rate, per learner/task).
  TAG must NOT use Behavioral/Sequential/Semantic/BSSI features or 2C3L
  scores.
- **Legacy TAG** = Temporal Assessment Graph — a completely different,
  older concept (graph-structural features feeding TAG-based LR / EXP-B).
  See `docs/TAG_TERMINOLOGY.md` for the full collision inventory. Do not
  rename or merge the two.
- **BSSI** = Behavioral–Sequential–Semantic **Integration**. Responsible
  for integrated feature/evidence construction (BSSI Features). BSSI is
  NOT itself a predictive model.
- **BSSM** = Behavioral–Sequential–Semantic **Model**. The predictive
  model operating on BSSI Features. BSSM is NOT an integration layer.
  BSSM does not exist yet — no algorithm has been approved (see §4).
- **Semantic Predictive Models** = SVM / XGBoost (do not exist yet — zero
  occurrences on `main` as of this audit). Distinct from **Semantic
  Analysis Methods** = TF-IDF / K-Means / Truncated SVD / Cosine
  Similarity (NB10-12, already implemented, descriptive only).
- **2C3L** (C1 Correctness, C2 Consistency of Semantics, L1 Logical
  Reasoning, L2 Learning Process, L3 Level of Difficulty) is a separate
  **Assessment Framework**, not a sixth BSSI domain and not an input to
  BSSM by default.

## 3. "One Canonical Dataset" — decision

Per the architecture audit (2026-09-08), two different things are both
informally called "the dataset" in this repo:

1. **`mst_datasets` / `mst_pipeline_runs`** (live Supabase DB) — what
   Sequential Analysis, Final Result Analysis, and BSSI Analysis use
   today. One-to-many with runs; no cross-dependency between run types.
2. **`split_assignments.parquet`** (frozen, offline, notebook pipeline) —
   the Phase 4 research contract's `GroupShuffleSplit(random_state=42,
   test_size=0.2)` ledger, joined by `academy_member_id`.

**Decision: `mst_datasets` is the canonical, addressable "Canonical
Dataset" for the Researcher UI.** The link from an `mst_datasets` row to
its corresponding `split_assignments.parquet` cohort is **not yet built**
— today the only bridge is a hardcoded dataset-code string
(`PILOT_DATASET_CODE = "PAQT0001"` in `sequential-analysis/route.ts`).
Building a real link is out of scope for this milestone; any future
confirmatory-analysis work must resolve this before proceeding.

## 4. BSSI dependency rule

BSSI Features MUST NOT depend on outputs (predictions) from LR, RF, LSTM,
GRU, SVM, or XGBoost. BSSI Features are derived directly from the
Canonical Dataset (reusing Behavioral/Sequential/Semantic feature
*extraction*, not model *predictions*). Implementation may reuse shared
feature builders/artifacts to avoid duplication — that is an
implementation optimization, not an analysis dependency.

Confirmed compliant today: `app/api/researcher/bssi-analysis/route.ts`
only reads `bssa_features.groups` (feature-domain inventory) and
`model_comparison.models` (trained/untrained status strings) — never any
model's predictions.

## 5. BSSM — not yet defined

No BSSM algorithm has been chosen or approved. See the architecture
audit's BSSM Methodology Gap section for option analysis (classical
classifier over a flattened integrated vector vs. a neural multi-branch
model) and the leakage/circularity risks that apply to either. **Do not
implement BSSM without a separate, explicit approval.**

## 6. Known deferred renames (do not do without separate approval)

- The frozen JSON field `bssa_features` in
  `lib/research-artifacts/phase4/phase4_ui_summary_v1.json` still uses the
  old "BSSA" name. It is structurally relied on by
  `app/api/researcher/analytics-summary/route.ts` and asserted by name in
  two test files. `bssi-analysis/route.ts` reads this same field and
  relabels only at the display layer (`BSSA` → `BSSI` in copy strings) —
  the JSON key itself is unchanged. A coordinated field-rename migration
  (updating the artifact, the route, and both tests together) is future
  work, not part of this milestone.
- Legacy TAG (Temporal Assessment Graph) terminology — `tag_node_count`,
  `tag_edge_count`, `tag_entropy`, `tag_graph_features`, `"TAG-based LR"`,
  `EXP-A`/`EXP-B` — must NOT be renamed. These are real parquet column
  names, a real trained model name in a frozen artifact, and literal
  dictionary keys read at runtime. See `docs/TAG_TERMINOLOGY.md`.

## 7. Related milestones

See the audit report (`BSSI_ARCHITECTURE_AUDIT.md`, delivered 2026-09-08)
for the full R1–R18 milestone plan. This document will be updated as each
milestone locks in new decisions.
