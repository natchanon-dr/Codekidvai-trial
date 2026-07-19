import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ScoreResult, ScoringRubric, RubricCriterionScore } from "@/types/dataset";

export function normalizeAnswer(value: string): string {
  return value.trim().replace(/;$/g, "").replace(/\s+/g, " ").toLowerCase();
}

export function scoreSqlTextAnswer(params: {
  student_answer: string;
  expected_answer: string;
  max_score: number;
}): ScoreResult {
  const isCorrect = normalizeAnswer(params.student_answer) === normalizeAnswer(params.expected_answer);
  return {
    is_correct: isCorrect,
    score: isCorrect ? params.max_score : 0,
    error_type: isCorrect ? null : "ANSWER_MISMATCH",
    error_message: isCorrect ? null : "Answer does not match expected answer.",
  };
}

export function evaluateRubricCriteria(params: {
  student_answer: string;
  rubric: ScoringRubric;
  max_score: number;
}): ScoreResult & { rubric_breakdown: RubricCriterionScore[] } {
  const { criteria = [], pass_threshold = 1.0 } = params.rubric;
  const normalized = normalizeAnswer(params.student_answer);
  const breakdown: RubricCriterionScore[] = [];
  let totalScore = 0;

  for (const criterion of criteria) {
    const maxCs = Math.round(criterion.weight * params.max_score * 100) / 100;
    const keywords = criterion.keywords
      .map((kw) => kw.trim())
      .filter(Boolean);
    const allKeywordsMatch =
      keywords.length > 0 &&
      keywords.every((kw) => normalized.includes(kw.toLowerCase()));
    const cs = allKeywordsMatch ? maxCs : 0;
    totalScore += cs;
    breakdown.push({
      key: criterion.key,
      label: criterion.label,
      criterion_score: cs,
      max_criterion_score: maxCs,
      matched: allKeywordsMatch,
    });
  }

  const score = Math.round(totalScore * 100) / 100;
  const passScore = params.max_score * pass_threshold;
  const is_correct = score >= passScore;
  return {
    is_correct,
    score,
    error_type: is_correct ? null : "RUBRIC_NOT_MET",
    error_message: is_correct ? null : "Answer does not meet all rubric criteria.",
    rubric_breakdown: breakdown,
  };
}

export function scoreSqlBlockAnswer(params: {
  submitted_block_ids: string[];
  blocks: Array<{
    block_id: string;
    correct_order: number | null;
    is_correct_part: boolean | null;
    feedback_text: string | null;
  }>;
  max_score: number;
}): ScoreResult & { rubric_breakdown: RubricCriterionScore[] } {
  const correctBlocks = params.blocks
    .filter((b) => b.is_correct_part)
    .sort((a, b) => (a.correct_order ?? 0) - (b.correct_order ?? 0));

  if (correctBlocks.length === 0) {
    return {
      is_correct: false,
      score: 0,
      error_type: "NO_CORRECT_BLOCKS",
      error_message: "No correct blocks defined for this task.",
      rubric_breakdown: [],
    };
  }

  // Filter student answer to only correct-part blocks, preserving student order
  const correctBlockIdSet = new Set(correctBlocks.map((b) => b.block_id));
  const studentCorrectSequence = params.submitted_block_ids.filter((id) =>
    correctBlockIdSet.has(id),
  );

  const perBlockScore = Math.round((params.max_score / correctBlocks.length) * 100) / 100;
  const breakdown: RubricCriterionScore[] = [];
  let totalScore = 0;

  for (let i = 0; i < correctBlocks.length; i++) {
    const expected = correctBlocks[i];
    const matched = studentCorrectSequence[i] === expected.block_id;
    const cs = matched ? perBlockScore : 0;
    totalScore += cs;
    breakdown.push({
      key: `block_pos_${i + 1}`,
      label: expected.feedback_text ?? `Block position ${i + 1}`,
      criterion_score: cs,
      max_criterion_score: perBlockScore,
      matched,
    });
  }

  const score = Math.round(totalScore * 100) / 100;
  const is_correct = score >= params.max_score;
  return {
    is_correct,
    score,
    error_type: is_correct ? null : "BLOCK_ORDER_MISMATCH",
    error_message: is_correct ? null : "Block sequence does not match the expected order.",
    rubric_breakdown: breakdown,
  };
}

// Use userClient when available (service role key may point to wrong project)
function db(client?: SupabaseClient): SupabaseClient {
  return client ?? supabaseAdmin;
}

export async function getOwnedLearningSession(
  params: { session_id: string; profile_id: string; task_id?: string },
  client?: SupabaseClient,
) {
  let query = db(client)
    .from("trn_learning_sessions")
    .select("*")
    .eq("session_id", params.session_id)
    .eq("profile_id", params.profile_id);

  if (params.task_id) query = query.eq("task_id", params.task_id);
  const { data, error } = await query.single();
  if (error || !data) throw new Error("Learning session not found or not owned by current user.");
  return data;
}

export async function getPublishedTaskForScoring(taskId: string, client?: SupabaseClient) {
  const { data, error } = await db(client)
    .from("mst_tasks")
    .select("task_id, task_type, expected_sql, max_score, task_status, is_active, scoring_rubric_json")
    .eq("task_id", taskId)
    .eq("task_status", "published")
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error("Published task not found.");
  // Block tasks derive their answer from mst_blocks; expected_sql is not required
  if (!data.expected_sql && data.task_type !== "sql_block") {
    throw new Error("Task expected answer is missing.");
  }
  return data;
}

export async function getBlocksForScoring(taskId: string, client?: SupabaseClient) {
  const { data, error } = await db(client)
    .from("mst_blocks")
    .select("block_id, correct_order, is_correct_part, feedback_text")
    .eq("task_id", taskId)
    .order("correct_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function scoreTask(
  params: {
    task: Awaited<ReturnType<typeof getPublishedTaskForScoring>>;
    answer_text: string;
    answer_json: Record<string, unknown> | null;
  },
  client?: SupabaseClient,
): Promise<ScoreResult & { rubric_breakdown?: RubricCriterionScore[] }> {
  const { task, answer_text, answer_json } = params;
  const maxScore = Number(task.max_score);

  // sql_block: score by positional block order using mst_blocks metadata
  if (task.task_type === "sql_block") {
    const submittedIds = Array.isArray(answer_json?.block_ids)
      ? (answer_json.block_ids as string[])
      : [];
    const blocks = await getBlocksForScoring(task.task_id, client);
    return scoreSqlBlockAnswer({ submitted_block_ids: submittedIds, blocks, max_score: maxScore });
  }

  // sql_text with a criterion-based rubric defined by the teacher
  const rubric = task.scoring_rubric_json as ScoringRubric | null;
  if (rubric?.type === "criterion_based" && rubric.criteria && rubric.criteria.length > 0) {
    return evaluateRubricCriteria({ student_answer: answer_text, rubric, max_score: maxScore });
  }

  // Default: exact normalized string match (Phase 1 behavior)
  return scoreSqlTextAnswer({
    student_answer: answer_text,
    expected_answer: task.expected_sql ?? "",
    max_score: maxScore,
  });
}

export async function insertRubricScores(params: {
  submission_id: string;
  breakdown: RubricCriterionScore[];
  rubric_applied_version: number;
}): Promise<void> {
  // Remove all existing criterion rows for this submission (handles removed criteria on rescore)
  const { error: deleteError } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .delete()
    .eq("submission_id", params.submission_id);
  if (deleteError) throw new Error(deleteError.message);

  if (params.breakdown.length === 0) return;

  const rows = params.breakdown.map((c) => ({
    submission_id: params.submission_id,
    criterion_key: c.key,
    criterion_label: c.label,
    criterion_score: c.criterion_score,
    max_criterion_score: c.max_criterion_score,
  }));
  const { error: insertError } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .insert(rows);
  if (insertError) throw new Error(insertError.message);
}

export async function getNextAttemptNo(sessionId: string, client?: SupabaseClient): Promise<number> {
  const { count, error } = await db(client)
    .from("trn_attempts")
    .select("attempt_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (count ?? 0) + 1;
}

export async function getNextEventOrder(sessionId: string, client?: SupabaseClient): Promise<number> {
  const { count, error } = await db(client)
    .from("trn_event_logs")
    .select("event_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (count ?? 0) + 1;
}

export function calculateDurationFromStart(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
}

export async function insertServerEvent(
  params: {
    session_id: string;
    profile_id: string;
    task_id: string;
    event_type: string;
    event_value?: string | null;
    duration_from_start?: number | null;
    metadata_json?: Record<string, unknown> | null;
  },
  client?: SupabaseClient,
) {
  const c = db(client);
  const eventOrder = await getNextEventOrder(params.session_id, client);
  const now = new Date().toISOString();
  const { error } = await c.from("trn_event_logs").insert({
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

  await c.from("trn_learning_sessions").update({ last_event_at: now }).eq("session_id", params.session_id);
}

export async function insertServerAttempt(
  params: {
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
  },
  client?: SupabaseClient,
) {
  const c = db(client);
  const attemptNo = await getNextAttemptNo(params.session_id, client);
  const { error } = await c.from("trn_attempts").insert({
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
