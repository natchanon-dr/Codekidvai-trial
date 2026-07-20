/**
 * Shared types and helpers for the Researcher Mock Evaluation Lab.
 * Server-side only — do not import into client components.
 */

export type MockStep =
  | "data"
  | "extract"
  | "process"
  | "train"
  | "evaluate"
  | "outcome"
  | "reset"
  | "run-all";

export interface MockConfig {
  batchCode: string;
  nStudents: number;
  nTasks: number;
  atRiskRate: number;
  missingRate: number;
  apiBase: string;
  // optional: use real task IDs from a real class instead of generating dummy tasks
  taskIds?: string[];
  taskSetId?: string;
  // research context — preserved from the selected class set
  // setFamily defaults to 'assignment' when omitted (backward-compatible)
  setFamily?: string;
  // task_type → count map; derived from the selected task set or dummy config
  taskTypeCounts?: Record<string, number>;
  // deterministic simulation seed — same seed+family+learner+task → same event signature
  seed?: number;
}

export type ModelMetrics = {
  auc: number | null;
  f1: number | null;
};

export type MockOutcome = {
  batchCode: string;
  dataset: {
    samples: number;
    trainSamples: number;
    testSamples: number;
    students: number;
    tasks: number;
    sessions: number;
    attempts: number;
    submissions: number;
  };
  metrics: {
    majorityBaseline: ModelMetrics;
    logisticRegression: ModelMetrics;
    randomForest: ModelMetrics;
  };
  checks: {
    pii: "pass" | "fail";
    leakage: "pass" | "fail";
    splitIntegrity: "pass" | "fail";
  };
  charts: {
    confusionMatrix?: string;
    rocCurve?: string;
    featureImportance?: string;
  };
  reports: {
    evaluation?: string;
    metadata?: string;
    log?: string;
  };
};

export function validateMockConfig(config: MockConfig): string | null {
  if (!config.batchCode.startsWith("SIM_E2E_") && !config.batchCode.startsWith("MOCK_")) {
    return "Batch code must start with SIM_E2E_ or MOCK_";
  }
  if (config.nStudents < 5 || config.nStudents > 200) {
    return "Students must be between 5 and 200";
  }
  // skip nTasks range check when real task IDs are provided
  if (!config.taskIds?.length && (config.nTasks < 1 || config.nTasks > 10)) {
    return "Tasks must be between 1 and 10";
  }
  if (config.atRiskRate < 0 || config.atRiskRate > 100) {
    return "At-risk rate must be 0–100";
  }
  if (config.missingRate < 0 || config.missingRate > 100) {
    return "Missing rate must be 0–100";
  }
  return null;
}

export function makeSseChunk(
  type: "log" | "progress" | "outcome" | "error" | "done",
  payload: Record<string, unknown>
): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}
