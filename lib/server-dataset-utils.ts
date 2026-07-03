import { supabaseAdmin } from "@/lib/supabase-admin";

export function normalizeAnswer(value: string): string {
  return value.trim().replace(/;$/g, "").replace(/\s+/g, " ").toLowerCase();
}

export function scoreSqlTextAnswer(params: {
  student_answer: string;
  expected_answer: string;
  max_score: number;
}) {
  const isCorrect = normalizeAnswer(params.student_answer) === normalizeAnswer(params.expected_answer);
  return {
    is_correct: isCorrect,
    score: isCorrect ? params.max_score : 0,
    error_type: isCorrect ? null : "ANSWER_MISMATCH",
    error_message: isCorrect ? null : "Answer does not match expected answer.",
  };
}

export async function getOwnedLearningSession(params: {
  session_id: string;
  profile_id: string;
  task_id?: string;
}) {
  let query = supabaseAdmin
    .from("trn_learning_sessions")
    .select("*")
    .eq("session_id", params.session_id)
    .eq("profile_id", params.profile_id);

  if (params.task_id) query = query.eq("task_id", params.task_id);
  const { data, error } = await query.single();
  if (error || !data) throw new Error("Learning session not found or not owned by current user.");
  return data;
}

export async function getPublishedTaskForScoring(taskId: string) {
  const { data, error } = await supabaseAdmin
    .from("mst_tasks")
    .select("task_id, expected_sql, max_score, task_status, is_active")
    .eq("task_id", taskId)
    .eq("task_status", "published")
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error("Published task not found.");
  if (!data.expected_sql) throw new Error("Task expected answer is missing.");
  return data;
}

export async function getNextAttemptNo(sessionId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("trn_attempts")
    .select("attempt_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (count ?? 0) + 1;
}

export async function getNextEventOrder(sessionId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("trn_event_logs")
    .select("event_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (count ?? 0) + 1;
}

export function calculateDurationFromStart(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
}

export async function insertServerEvent(params: {
  session_id: string;
  profile_id: string;
  task_id: string;
  event_type: string;
  event_value?: string | null;
  duration_from_start?: number | null;
  metadata_json?: Record<string, unknown> | null;
}) {
  const eventOrder = await getNextEventOrder(params.session_id);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("trn_event_logs").insert({
    session_id: params.session_id,
    profile_id: params.profile_id,
    task_id: params.task_id,
    event_order: eventOrder,
    event_type: params.event_type,
    event_value: params.event_value ?? null,
    duration_from_start: params.duration_from_start ?? null,
    metadata_json: params.metadata_json ?? null,
    event_time: now,
  });
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("trn_learning_sessions").update({ last_event_at: now }).eq("session_id", params.session_id);
}

export async function insertServerAttempt(params: {
  session_id: string;
  profile_id: string;
  task_id: string;
  attempt_type: "run" | "check" | "submit";
  answer_text: string;
  answer_json?: Record<string, unknown> | null;
  is_correct: boolean;
  score: number;
  error_type?: string | null;
  error_message?: string | null;
  execution_time_ms?: number | null;
}) {
  const attemptNo = await getNextAttemptNo(params.session_id);
  const { error } = await supabaseAdmin.from("trn_attempts").insert({
    session_id: params.session_id,
    profile_id: params.profile_id,
    task_id: params.task_id,
    attempt_no: attemptNo,
    attempt_type: params.attempt_type,
    answer_text: params.answer_text,
    answer_json: params.answer_json ?? null,
    is_correct: params.is_correct,
    score: params.score,
    error_type: params.error_type ?? null,
    error_message: params.error_message ?? null,
    execution_time_ms: params.execution_time_ms ?? null,
  });
  if (error) throw new Error(error.message);
}
