import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { getOwnedLearningSession, getPublishedTaskForScoring, scoreSqlTextAnswer, insertServerAttempt, insertServerEvent, calculateDurationFromStart } from "@/lib/server-dataset-utils";

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const profile = await requireAuthenticatedProfile(request);
    const body = await request.json();
    const sessionId = String(body.session_id);
    const taskId = String(body.task_id);
    const answerText = String(body.answer_text ?? "");
    const answerJson = body.answer_json ?? null;

    const session = await getOwnedLearningSession({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId });
    const task = await getPublishedTaskForScoring(taskId);
    const result = scoreSqlTextAnswer({ student_answer: answerText, expected_answer: task.expected_sql, max_score: Number(task.max_score) });
    const executionTimeMs = Date.now() - started;

    await insertServerEvent({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, event_type: "sql_run", event_value: "run_button_click", duration_from_start: calculateDurationFromStart(session.started_at), metadata_json: { answer_length: answerText.length } });
    await insertServerAttempt({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, attempt_type: "run", answer_text: answerText, answer_json: answerJson, is_correct: result.is_correct, score: result.score, error_type: result.error_type, error_message: result.error_message, execution_time_ms: executionTimeMs });
    await insertServerEvent({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, event_type: result.is_correct ? "sql_success" : "sql_error", event_value: result.is_correct ? "answer_matched_expected" : "answer_mismatch", duration_from_start: calculateDurationFromStart(session.started_at) });

    return NextResponse.json({ ...result, execution_time_ms: executionTimeMs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Run failed." }, { status: 400 });
  }
}
