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
