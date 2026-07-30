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
//   semantic    — blocked:  Phase 5 research scope; PhaseDeferredError (non-retryable)

import { runAssessmentAnalysis } from "@/lib/analysis/assessment";
import { runBehavioralAnalysis } from "@/lib/analysis/behavioral";
import { runSequentialAnalysis } from "@/lib/analysis/sequential";
import { runSemanticAnalysis } from "@/lib/analysis/semantic";
import { NonRetryableAnalysisError } from "@/lib/analysis/types";

// Re-export StepContext so processor.ts and tests can import from one place.
export type { StepContext } from "@/lib/analysis/types";
export { NonRetryableAnalysisError } from "@/lib/analysis/types";

/**
 * Analysis steps that belong to a future research phase and must not be
 * executed by the Phase 4 worker. The processor marks these as "deferred"
 * and continues to the next step — the run can still reach "completed".
 *
 * PhaseDeferredError is preserved for cases where a caller explicitly
 * requests an unavailable capability (e.g. run_type="semantic" directly).
 */
export const DEFERRED_STEPS: ReadonlySet<string> = new Set(["semantic"]);

/** Stable reason codes written to AnalysisStep.deferred_reason. */
export const DEFERRED_REASONS: Readonly<Record<string, string>> = {
  semantic: "phase_5_not_enabled",
};

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
