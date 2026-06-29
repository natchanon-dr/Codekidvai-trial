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

export interface ScoreResult {
  is_correct: boolean;
  score: number;
  error_type: string | null;
  error_message: string | null;
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
