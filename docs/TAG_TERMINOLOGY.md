# TAG Terminology Collision — Read Before Touching Anything Named "TAG"

This repo uses the acronym **TAG** for two unrelated concepts. They must never
be merged, renamed into each other, or treated as interchangeable without
explicit user approval. This file is the single source of truth for the
distinction; inline comments elsewhere point back here.

## 1. Legacy / internal meaning: Temporal Assessment Graph

Graph-structural features extracted from a learner's event trajectory, used
as an additional feature block for the Sequential Analysis models.

- Feature columns: `tag_node_count`, `tag_edge_count`, `tag_entropy`, and
  other `tag_graph_features` entries.
- Model: **TAG-based LR** (`TAG-based Logistic Regression`), a graph-only
  baseline distinct from the Behavioral LR.
- Experiment tracks on LSTM/GRU:
  - **EXP-A** = "Sequence only" (no TAG features).
  - **EXP-B** = "Sequence + TAG[graph]" (sequence + Temporal Assessment Graph
    features).
- Where it lives in code (non-exhaustive):
  - `app/researcher/behavioral-analysis/page.tsx` — currently mixes this into
    the Behavioral taxonomy display (flagged for cleanup in a later
    milestone, not fixed by M5.31A).
  - `app/api/researcher/sequential-analysis/route.ts` — artifact wiring for
    TAG-based LR and EXP-A/EXP-B.
  - `app/researcher/_components/AnalysisResultView.tsx` — `TagStructure`
    type, "TAG Structure (Temporal Assessment Graph)" section.
  - `lib/research-artifacts/phase4/tag_manifest_v1.json`.
  - `app/researcher/model-results/page.tsx` — Seed Stability section, labeled
    with an explicit footnote: *"TAG here = Temporal Assessment Graph
    (graph-structural features), not Traditional Auto Grading."*
  - `app/researcher/analytics-summary/page.tsx` — BSSA Feature-Group
    Inventory group `"TAG-based (Temporal Assessment Graph)"`.

**Do not mass-rename this without explicit approval.** It is frozen Phase 4
pipeline terminology; renaming it retroactively would require re-validating
every artifact/manifest that references these column and model names.

## 2. New thesis-facing meaning: Traditional Auto Grading

The traditional automated-grading baseline: **Final Result Only →
Correct/Incorrect**. This is the target research architecture's baseline
comparison point against the BSSA-based models, per the updated thesis
methodology. It has **not been implemented yet**.

- Placeholder nav tile: `app/researcher/dashboard/page.tsx`, step 14, titled
  "TAG Analysis" — description spells out the full name and the collision,
  `available: false` ("Coming Soon"). No route/page/backend exists yet.
- Placeholder row in the model comparison table: `app/researcher/model-
  results/page.tsx`'s `TARGET_MODEL_ORDER`, entry `"Traditional Auto
  Grading"` — rendered via `NotYetRunRow` ("Not yet run — no trained model
  artifact exists.") since no model has been trained.

## Rule going forward

- In any **new** thesis-facing Researcher UI, spell out **"Traditional Auto
  Grading"** in full wherever a bare "TAG" could be ambiguous. Only use the
  bare acronym "TAG" once the full name has already been introduced in the
  same view.
- In any **existing** legacy code/artifact, "TAG" continues to mean
  **Temporal Assessment Graph** unless a specific, approved milestone
  renames it (with a full inventory + migration of dependent artifacts).
- Do not introduce a third meaning ("BSSI" or otherwise) for either concept.
- If you are unsure which meaning applies at a given call site, check this
  file first, then check the surrounding artifact/table name
  (`tag_manifest_v1.json`, `tag_node_count`, "TAG-based LR" → legacy;
  "Traditional Auto Grading", "Final Result Only" → new) before editing.
