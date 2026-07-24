/**
 * Shared types for the Dataset Analytics feature.
 * Used by both the page components and API route handlers.
 */

// ---------------------------------------------------------------------------
// Dataset Registry
// ---------------------------------------------------------------------------

/** Branded 8-character dataset code (e.g. "MAQT0001"). */
export type DatasetCode = string & { readonly __brand: "DatasetCode" };

export type DatasetRecord = {
  id: string;
  code: DatasetCode;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_id: string | null;
  task_id: string | null;
  active: boolean;
  usage_status: "used" | "not_used";
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type CreateDatasetInput = {
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_id: string | null;
  task_id: string | null;
};

export type UpdateDatasetInput = {
  name?: string;
  class_id?: string | null;
  task_id?: string | null;
};

// ---------------------------------------------------------------------------
// Filter / selector option types
// ---------------------------------------------------------------------------

export type BatchTypeOption = {
  value: string;
  label: string;
  code: string;
  icon: string;
  aria_label: string;
};

export type ActivityTypeOption = {
  value: string;
  label: string;
  code: string;
};

export type TaskTypeOption = {
  value: string;
  label: string;
  dataset_label: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Pipeline Runs
// ---------------------------------------------------------------------------

export type PipelineRunType =
  | "full_pipeline"
  | "behavioral"
  | "sequential"
  | "semantic"
  | "assessment";

export type PipelineRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AnalysisStep = {
  analysis: string;
  status: PipelineRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

export type PipelineRun = {
  id: string;
  dataset_id: string;
  run_type: PipelineRunType;
  status: PipelineRunStatus;
  analysis_steps: AnalysisStep[] | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_requested: boolean;
  error_summary: string | null;
  initiated_by: string | null;
  configuration: Record<string, unknown> | null;
  result_version: string | null;
  created_at: string;
  /** Incremented on each claim attempt; exposed for retry-status display. */
  attempt_count: number;
  /** Maximum claim attempts before permanent failure. */
  max_attempts: number;
  /** Client-controlled deduplication key; null when not provided. */
  idempotency_key: string | null;
};

// ---------------------------------------------------------------------------
// Page API response
// ---------------------------------------------------------------------------

export type DatasetAnalyticsPageData = {
  available_datasets: ReadonlyArray<{ id: string; label: string }>;
  available_batch_types: BatchTypeOption[];
  available_activity_types: ActivityTypeOption[];
  available_task_types: TaskTypeOption[];
  active_scope: {
    dataset: string;
    batch_type: string | null;
    set_family: string | null;
    task_type: string | null;
  };
  scoped_summary: {
    learner_count: number;
    session_count: number;
    batch_type_filter: string | null;
    task_type_filter: string | null;
    grain: "session_level";
  };
  validity_metadata: {
    label_source: string;
    label_validity: string;
    evaluation_purpose: string;
    proxy_target_circularity: boolean;
    confirmatory_analysis_allowed: boolean;
    data_warning: string;
  };
  unavailable_dimensions: Array<{
    dimension: string;
    ui_label: string;
    reason: string;
    canonical_values: string[];
  }>;
  dataset_list: DatasetRecord[];
  dataset_list_count: number;
};
