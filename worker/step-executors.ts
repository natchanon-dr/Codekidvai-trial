// Analysis step executors for the pipeline worker.
//
// The four analysis types (behavioral, sequential, semantic, assessment) defined
// in mst_pipeline_runs.analysis_steps do not yet have real implementations in
// this repository. Each executor below throws StepNotImplementedError naming
// the exact module and inputs required. Runs will fail with a sanitized
// error_summary rather than silently simulate completion.
//
// To implement a step, replace the throw with real logic that:
//   1. Queries the required data from Supabase using ctx.datasetId.
//   2. Computes the analysis result.
//   3. Persists the result durably before returning.
//   4. Calls ctx.onHeartbeat() during any sub-operation that may take > 60 s.

export interface StepContext {
  runId: string;
  datasetId: string;
  /** Call periodically during long sub-operations to prevent lease expiry. */
  onHeartbeat: () => Promise<void>;
}

export class StepNotImplementedError extends Error {
  constructor(
    public readonly step: string,
    public readonly missingDependency: string,
  ) {
    super(`Step '${step}' is not yet implemented: ${missingDependency}`);
    this.name = "StepNotImplementedError";
  }
}

const STEP_EXECUTORS: Record<string, (ctx: StepContext) => Promise<void>> = {
  behavioral: async (_ctx) => {
    throw new StepNotImplementedError(
      "behavioral",
      "lib/analysis/behavioral.ts — requires: learner session data query by " +
        "dataset_id, behavioral feature computation (time-on-task, attempt " +
        "patterns, help-seeking), and durable result persistence to the " +
        "appropriate result table.",
    );
  },

  sequential: async (_ctx) => {
    throw new StepNotImplementedError(
      "sequential",
      "lib/analysis/sequential.ts — requires: event-sequence extraction per " +
        "learner per dataset, sequential pattern computation (order, gaps, " +
        "repetitions), and durable result persistence.",
    );
  },

  semantic: async (_ctx) => {
    throw new StepNotImplementedError(
      "semantic",
      "lib/analysis/semantic.ts — requires: code or text extraction per " +
        "submission, semantic similarity or embedding computation, and durable " +
        "result persistence.",
    );
  },

  assessment: async (_ctx) => {
    throw new StepNotImplementedError(
      "assessment",
      "lib/analysis/assessment.ts — requires: rubric score aggregation by " +
        "dataset_id, assessment metric computation (pass rate, score " +
        "distribution, mastery thresholds), and durable result persistence.",
    );
  },
};

export async function executeStep(
  analysis: string,
  ctx: StepContext,
): Promise<void> {
  const executor = STEP_EXECUTORS[analysis];
  if (!executor) {
    throw new StepNotImplementedError(
      analysis,
      `Unknown analysis type '${analysis}'. Add an executor to STEP_EXECUTORS in worker/step-executors.ts.`,
    );
  }
  await executor(ctx);
}
