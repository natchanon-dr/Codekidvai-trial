// Semantic analysis step — BLOCKED: Phase 5 research scope.
//
// The Phase 4 research artifacts explicitly list semantic analysis as deferred:
//   lib/research-artifacts/phase4/phase4_ui_summary_v1.json:
//     "bssa_features.semantic": "deferred Phase 5"
//
// Implementation requires:
//   1. A code/text extraction layer per submission answer (currently not stored as
//      a normalised field — raw answer_text is in trn_attempts.answer_text).
//   2. A text/code embedding model (e.g. CodeBERT, text-embedding-3-small).
//   3. A similarity or divergence metric between learner answers and model solutions.
//   4. A production embedding API or self-hosted model serving endpoint.
//   5. Phase 5 research design decision on which semantic features to expose.
//
// This executor will remain blocked until Phase 5 research design is approved
// and the above infrastructure exists.

import { PhaseDeferredError } from "./types";
import type { StepContext } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runSemanticAnalysis(_ctx: StepContext): Promise<void> {
  throw new PhaseDeferredError(
    "semantic",
    5,
    "Requires: text/code embedding model, similarity metric, and Phase 5 research " +
      "design. See lib/analysis/semantic.ts for the full prerequisite list.",
  );
}
