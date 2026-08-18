export type UserRole = "student" | "teacher" | "admin" | "researcher";
export type SessionStatus = "started" | "in_progress" | "completed" | "abandoned";
export type AttemptType = "run" | "check" | "submit";

export interface Profile {
  profile_id: string;
  auth_user_id: string;
  participant_code: string;
  role: UserRole;
  display_name: string | null;
  grade_level: string | null;
  school_type: string | null;
  consent_accepted: boolean;
  consent_accepted_at: string | null;
  created_at: string;
}

export interface LearningSession {
  session_id: string;
  profile_id: string;
  task_id: string;
  batch_id: string | null;
  assignment_id: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_at: string | null;
  duration_seconds: number | null;
  status: SessionStatus;
  device_type: string | null;
  browser_name: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface EventLogInput {
  session_id: string;
  profile_id: string;
  task_id: string;
  event_type: string;
  event_value?: string | null;
  duration_from_start?: number | null;
  metadata_json?: Record<string, unknown> | null;
}

export interface RubricCriterion {
  key: string;
  label: string;
  keywords: string[];
  weight: number; // 0–1; all criteria weights must sum to 1
}

export interface ScoringRubric {
  version: number;
  type: "criterion_based" | "block_order";
  pass_threshold?: number; // fraction of max_score required to pass (default 1.0)
  criteria?: RubricCriterion[]; // only for criterion_based
}

export interface RubricCriterionScore {
  key: string;
  label: string;
  criterion_score: number;
  max_criterion_score: number;
  matched: boolean;
}

export interface ScoreResult {
  is_correct: boolean;
  score: number;
  error_type: string | null;
  error_message: string | null;
  rubric_breakdown?: RubricCriterionScore[];
}

export interface RubricScoreRow {
  submission_id: string;
  criterion_key: string;
  criterion_label: string;
  criterion_score: number;
  max_criterion_score: number;
}

export interface StudentBlock {
  block_id: string;
  task_id: string;
  block_code: string;
  block_label: string;
  block_value: string;
  block_type: string;
  display_order: number;
  metadata_json: Record<string, unknown> | null;
}

// ─── Block event types (Phase 5 contract v1) ──────────────────────────────────
//
// Token assignments (canonical — do not reorder):
//   block_add    = 6  emitted when a block is added to the workspace
//   block_delete = 7  emitted when a block is removed from the workspace
//   block_move   = 8  emitted when a block is repositioned within the workspace
//   block_submit = 9  RESERVED — not activated; final answer is captured by the
//                     existing submit_answer event pair (Phase 4 contract).
//
// block_instance_id: a client-generated UUID assigned at add time and carried
//   through move and delete events. It uniquely identifies one physical instance
//   of a block in the workspace even when the same block_id appears multiple times.

export type BlockEventType = "block_add" | "block_delete" | "block_move";

export interface BlockEventInput {
  session_id: string;
  task_id: string;
  event_type: BlockEventType;
  /** Client-generated UUID assigned when the block is added; stable across move/delete. */
  block_instance_id: string;
  /** mst_blocks.block_id — the template block being manipulated. */
  block_id: string;
  /** Final 0-indexed position in the workspace after the action (block_move only). */
  position?: number | null;
  /** Seconds elapsed since trn_learning_sessions.started_at. */
  duration_from_start: number;
  /** Optional structured context (e.g. previous position, source zone). */
  metadata_json?: Record<string, unknown> | null;
}

export interface BlockEventResult {
  event_id: string;
  event_order: number;
}
