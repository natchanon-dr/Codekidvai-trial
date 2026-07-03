import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
    if (session.status === "completed") throw new Error("Session already completed.");
    const task = await getPublishedTaskForScoring(taskId);
    const result = scoreSqlTextAnswer({ student_answer: answerText, expected_answer: task.expected_sql, max_score: Number(task.max_score) });
    const executionTimeMs = Date.now() - started;

    await insertServerEvent({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, event_type: "submit_answer", event_value: "final_submit", duration_from_start: calculateDurationFromStart(session.started_at), metadata_json: { answer_length: answerText.length } });
    await insertServerAttempt({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, attempt_type: "submit", answer_text: answerText, answer_json: answerJson, is_correct: result.is_correct, score: result.score, error_type: result.error_type, error_message: result.error_message, execution_time_ms: executionTimeMs });

    await supabaseAdmin.from("trn_submissions").upsert({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, final_answer_text: answerText, final_answer_json: answerJson, final_score: result.score, is_passed: result.is_correct, submitted_at: new Date().toISOString() }, { onConflict: "session_id" });
    const endedAt = new Date().toISOString();
    await insertServerEvent({ session_id: sessionId, profile_id: profile.profile_id, task_id: taskId, event_type: "session_end", event_value: "completed", duration_from_start: calculateDurationFromStart(session.started_at) });
    await supabaseAdmin.from("trn_learning_sessions").update({ status: "completed", ended_at: endedAt, duration_seconds: calculateDurationFromStart(session.started_at), last_event_at: endedAt }).eq("session_id", sessionId);
    if (session.assignment_id) await supabaseAdmin.from("trn_task_assignments").update({ status: "completed", completed_at: endedAt }).eq("assignment_id", session.assignment_id).eq("profile_id", profile.profile_id);

    return NextResponse.json({ ...result, execution_time_ms: executionTimeMs, session_status: "completed" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Submit failed." }, { status: 400 });
  }
}
