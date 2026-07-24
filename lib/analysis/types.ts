// Shared types and error classes for the pipeline analysis modules.
// worker/step-executors.ts re-exports StepContext from here to avoid circular deps.

export interface StepContext {
  runId: string;
  datasetId: string;
  /** Call periodically during long sub-operations to prevent lease expiry. */
  onHeartbeat: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

/**
 * Base for errors that must NOT be retried. The worker sets attempt_count
 * to max_attempts on failure so the stale-run recovery loop never re-queues.
 *
 * Use for: missing data, invalid configuration, deferred Phase 5 steps.
 * Do NOT use for: transient DB errors or network timeouts (let those retry).
 */
export class NonRetryableAnalysisError extends Error {
  readonly nonRetryable = true as const;
  constructor(message: string, public readonly reason: string = message) {
    super(message);
    this.name = "NonRetryableAnalysisError";
  }
}

/** Thrown when the dataset row does not exist or lacks required fields. */
export class DatasetNotFoundError extends NonRetryableAnalysisError {
  constructor(datasetId: string, detail: string) {
    super(`Dataset ${datasetId}: ${detail}`, "dataset_not_found");
    this.name = "DatasetNotFoundError";
  }
}

/** Thrown when the dataset has no data to analyse (no sessions, no submissions). */
export class InsufficientDataError extends NonRetryableAnalysisError {
  constructor(message: string) {
    super(message, "insufficient_data");
    this.name = "InsufficientDataError";
  }
}

/** Thrown for analysis steps that belong to a future research phase. */
export class PhaseDeferredError extends NonRetryableAnalysisError {
  constructor(step: string, phase: number, detail: string) {
    super(
      `'${step}' analysis is deferred to Phase ${phase}. ${detail}`,
      `phase${phase}_deferred`,
    );
    this.name = "PhaseDeferredError";
  }
}
