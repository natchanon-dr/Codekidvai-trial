// Analysis step executor registry.
//
// Each entry maps an analysis_type string (from mst_pipeline_runs.analysis_steps)
// to its implementation in lib/analysis/. The processor calls executeStep() with
// the step name and a StepContext; the executor is responsible for querying data,
// computing results, and persisting to mst_pipeline_run_results.
//
// Current status:
//   assessment  — complete: rubric score aggregation via trn_submission_rubric_scores
//   behavioral  — partial:  8 of 14 Phase 4 features (6 deferred, formula TBD)
//   sequential  — partial:  event frequency statistics; ML inference deferred
//   semantic    — partial:  Static Analysis (AST structural similarity) for
//                 sql_text/stored_procedure datasets only; block-based datasets
//                 (sql_block, er_diagram) throw PhaseDeferredError, which the
//                 processor catches and marks as a "deferred" step (run still
//                 reaches "completed") rather than failing the whole run.
//   risk_classification — partial: LR (E1) + RF (E2) inference using pre-trained
//                 pilot models (lib/analysis/models/*.json); requires a completed
//                 Behavioral Analysis run for the dataset (Semantic optional, for RF).

import { runAssessmentAnalysis } from "@/lib/analysis/assessment";
import { runBehavioralAnalysis } from "@/lib/analysis/behavioral";
import { runSequentialAnalysis } from "@/lib/analysis/sequential";
import { runSemanticAnalysis } from "@/lib/analysis/semantic";
import { runRiskClassification } from "@/lib/analysis/risk-classification";
import { NonRetryableAnalysisError } from "@/lib/analysis/types";

// Re-export StepContext so processor.ts and tests can import from one place.
export type { StepContext } from "@/lib/analysis/types";
export { NonRetryableAnalysisError, PhaseDeferredError } from "@/lib/analysis/types";

/**
 * Analysis steps that belong to a future research phase and must not be
 * executed by the Phase 4 worker at all, regardless of dataset. The processor
 * marks these as "deferred" up front and continues to the next step.
 *
 * Steps that are only *conditionally* deferred (e.g. "semantic" for block-based
 * datasets) are NOT listed here — they run and throw PhaseDeferredError at
 * runtime instead, which the processor catches and treats the same way.
 */
export const DEFERRED_STEPS: ReadonlySet<string> = new Set([]);

/** Stable reason codes written to AnalysisStep.deferred_reason for steps in DEFERRED_STEPS. */
export const DEFERRED_REASONS: Readonly<Record<string, string>> = {};

/** Thrown for an analysis_type not registered in STEP_EXECUTORS. */
export class UnknownStepError extends NonRetryableAnalysisError {
  constructor(analysis: string) {
    super(
      `Unknown analysis type '${analysis}'. Add an executor to STEP_EXECUTORS in worker/step-executors.ts.`,
      "unknown_step",
    );
    this.name = "UnknownStepError";
  }
}

const STEP_EXECUTORS: Record<
  string,
  (ctx: import("@/lib/analysis/types").StepContext) => Promise<void>
> = {
  assessment: runAssessmentAnalysis,
  behavioral: runBehavioralAnalysis,
  sequential: runSequentialAnalysis,
  semantic: runSemanticAnalysis,
  risk_classification: runRiskClassification,
};

export async function executeStep(
  analysis: string,
  ctx: import("@/lib/analysis/types").StepContext,
): Promise<void> {
  const executor = STEP_EXECUTORS[analysis];
  if (!executor) {
    throw new UnknownStepError(analysis);
  }
  await executor(ctx);
}
