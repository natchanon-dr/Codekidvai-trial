import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile, getBearerToken, createUserClient } from "@/lib/api-auth";
import {
  getOwnedLearningSession,
  getPublishedTaskForScoring,
  scoreTask,
  insertRubricScores,
  insertServerAttempt,
  insertServerEvent,
  calculateDurationFromStart,
} from "@/lib/server-dataset-utils";
import type { ScoringRubric } from "@/types/dataset";

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const token = getBearerToken(request);
    if (!token) throw new Error("Missing authorization token.");
    const profile = await requireAuthenticatedProfile(request);
    const userClient = createUserClient(token);

    const body = await request.json();
    const sessionId = String(body.session_id);
    const taskId = String(body.task_id);
    const batchId = String(body.batch_id);
    const answerText = String(body.answer_text ?? "");
    const answerJson = (body.answer_json ?? null) as Record<string, unknown> | null;

    const session = await getOwnedLearningSession(
      { session_id: sessionId, profile_id: profile.profile_id, task_id: taskId },
      userClient,
    );
    // Task metadata is published content — read with admin client so RLS on mst_tasks doesn't block students
    const task = await getPublishedTaskForScoring(taskId);
    const result = await scoreTask({ task, answer_text: answerText, answer_json: answerJson });
    const executionTimeMs = Date.now() - started;

    await insertServerEvent(
      {
        session_id: sessionId,
        profile_id: profile.profile_id,
        task_id: taskId,
        event_type: "submit_answer",
        event_value: "final_submit",
        duration_from_start: calculateDurationFromStart(session.started_at),
        metadata_json: { answer_length: answerText.length },
      },
      userClient,
    );
    await insertServerAttempt(
      {
        session_id: sessionId,
        profile_id: profile.profile_id,
        task_id: taskId,
        attempt_type: "submit",
        answer_text: answerText,
        answer_json: answerJson,
        is_correct: result.is_correct,
        score: result.score,
        error_type: result.error_type,
        error_message: result.error_message,
        execution_time_ms: executionTimeMs,
      },
      userClient,
    );

    // Compute session-level stats from all attempts
    const { data: attempts } = await userClient
      .from("trn_attempts")
      .select("attempt_type, is_correct, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const allAttempts = attempts ?? [];
    const totalRunCount = allAttempts.filter((a) => a.attempt_type === "run").length;
    const totalAttemptCount = allAttempts.length;
    const firstCorrect = allAttempts.find((a) => a.is_correct);
    const firstCorrectAt = firstCorrect?.created_at ?? null;
    const timeToFirstCorrectSec = firstCorrectAt
      ? Math.round(
          (new Date(firstCorrectAt).getTime() - new Date(session.started_at).getTime()) / 1000,
        )
      : null;

    const { data: existingSubmission } = await userClient
      .from("trn_submissions")
      .select("review_status, review_score, teacher_feedback, reviewed_by, reviewed_at")
      .eq("profile_id", profile.profile_id)
      .eq("batch_id", batchId)
      .eq("task_id", taskId)
      .maybeSingle();

    const reviewStatus =
      existingSubmission?.review_status === "reviewed" ||
      existingSubmission?.review_status === "completed"
        ? existingSubmission.review_status
        : "submitted";

    // Determine rubric version for traceability
    const rubric = task.scoring_rubric_json as ScoringRubric | null;
    const rubricAppliedVersion =
      rubric?.version ?? (task.task_type === "sql_block" ? 1 : null);

    const now = new Date().toISOString();
    const { data: upsertedRows, error: upsertError } = await userClient
      .from("trn_submissions")
      .upsert(
        {
          profile_id: profile.profile_id,
          batch_id: batchId,
          task_id: taskId,
          session_id: sessionId,
          final_answer_text: answerText,
          final_answer_json: answerJson,
          auto_score: result.score,
          final_score: result.score,
          is_passed: result.is_correct,
          review_status: reviewStatus,
          // Teacher review fields intentionally omitted so resubmits keep the existing review
          submitted_at: now,
          total_run_count: totalRunCount,
          total_attempt_count: totalAttemptCount,
          first_correct_at: firstCorrectAt,
          time_to_first_correct_sec: timeToFirstCorrectSec,
          rubric_applied_version: rubricAppliedVersion,
        },
        { onConflict: "profile_id,batch_id,task_id" },
      )
      .select("submission_id");

    if (upsertError) throw upsertError;

    // Persist per-criterion rubric scores when a breakdown is available
    const submissionId = upsertedRows?.[0]?.submission_id ?? null;
    if (submissionId && result.rubric_breakdown && result.rubric_breakdown.length > 0) {
      await insertRubricScores({
        submission_id: submissionId,
        breakdown: result.rubric_breakdown,
        rubric_applied_version: rubricAppliedVersion ?? 1,
      });
    }

    const endedAt = now;
    await insertServerEvent(
      {
        session_id: sessionId,
        profile_id: profile.profile_id,
        task_id: taskId,
        event_type: "session_end",
        event_value: "completed",
        duration_from_start: calculateDurationFromStart(session.started_at),
      },
      userClient,
    );
    await userClient
      .from("trn_learning_sessions")
      .update({
        status: "completed",
        ended_at: endedAt,
        duration_seconds: calculateDurationFromStart(session.started_at),
        last_event_at: endedAt,
      })
      .eq("session_id", sessionId);
    if (session.assignment_id) {
      await userClient
        .from("trn_task_assignments")
        .update({ status: "completed", completed_at: endedAt })
        .eq("assignment_id", session.assignment_id)
        .eq("profile_id", profile.profile_id);
    }

    return NextResponse.json({ ...result, execution_time_ms: executionTimeMs, session_status: "completed" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Submit failed." },
      { status: 400 },
    );
  }
}
