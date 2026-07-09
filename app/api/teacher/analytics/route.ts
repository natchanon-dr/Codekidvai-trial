import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const STABLE_2C3L_KEYS = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
] as const;

type CriterionAvg = {
  avg_score: number | null;
  avg_max_score: number | null;
  avg_pct: number | null;
};

async function requireClassAccess(classId: string, profileId: string, role: string) {
  if (role === "admin") return;
  const { data, error } = await supabaseAdmin
    .from("tb_classes")
    .select("class_id")
    .eq("class_id", classId)
    .eq("teacher_profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Class not found or access denied.");
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
}

function pct(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.round((num / den) * 100);
}

function getEffectiveScore(sub: {
  review_score?: number | null;
  auto_score?: number | null;
  final_score?: number | null;
}): number {
  return Number(sub.review_score ?? sub.auto_score ?? sub.final_score ?? 0);
}

function buildCriterionAvgs(
  keyScores: Map<string, number[]>,
  keyMax: Map<string, number>,
): Record<string, CriterionAvg> {
  const result: Record<string, CriterionAvg> = {};
  for (const key of STABLE_2C3L_KEYS) {
    const scores = keyScores.get(key) ?? [];
    const avgScore = avg(scores);
    const maxScore = keyMax.get(key) ?? null;
    result[key] = {
      avg_score: avgScore,
      avg_max_score: maxScore,
      avg_pct:
        avgScore != null && maxScore != null && maxScore > 0
          ? Math.round((avgScore / maxScore) * 100)
          : null,
    };
  }
  return result;
}

function emptyBatchSummary() {
  const emptyCriteria = Object.fromEntries(
    STABLE_2C3L_KEYS.map((k) => [k, { avg_score: null, avg_max_score: null, avg_pct: null }]),
  );
  return {
    total_tasks: 0,
    total_assigned: 0,
    total_submitted: 0,
    overall_completion_rate_pct: null,
    overall_pass_rate_pct: null,
    overall_avg_score: null,
    overall_avg_run_count: null,
    overall_avg_attempt_count: null,
    overall_avg_time_to_first_correct_sec: null,
    overall_criterion_avgs: emptyCriteria,
  };
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { searchParams } = request.nextUrl;
    const classId = searchParams.get("class_id") ?? "";
    const batchId = searchParams.get("batch_id") ?? "";

    if (!classId) throw new Error("class_id is required.");
    if (!batchId) throw new Error("batch_id is required.");

    await requireClassAccess(classId, profile.profile_id, profile.role);

    const { data: classSetRow, error: classSetError } = await supabaseAdmin
      .from("tb_class_sets")
      .select("class_set_id")
      .eq("class_id", classId)
      .eq("batch_id", batchId)
      .maybeSingle();
    if (classSetError) throw classSetError;
    if (!classSetRow) throw new Error("Batch does not belong to this class.");

    const { data: membershipRows, error: membershipError } = await supabaseAdmin
      .from("tb_class_students")
      .select("profile_id")
      .eq("class_id", classId)
      .eq("status", "active");
    if (membershipError) throw membershipError;

    const profileIds = (membershipRows ?? []).map((r) => r.profile_id).filter(Boolean);
    if (profileIds.length === 0) {
      return NextResponse.json({ tasks: [], batch_summary: emptyBatchSummary() });
    }

    const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("profile_id, task_id, assigned_order")
      .eq("batch_id", batchId)
      .in("profile_id", profileIds)
      .order("assigned_order", { ascending: true });
    if (assignmentError) throw assignmentError;

    const assignments = assignmentRows ?? [];
    const taskIds = [...new Set(assignments.map((a) => a.task_id).filter(Boolean))];

    if (taskIds.length === 0) {
      return NextResponse.json({ tasks: [], batch_summary: emptyBatchSummary() });
    }

    const [
      { data: taskRows, error: taskError },
      { data: submissionRows, error: submissionError },
    ] = await Promise.all([
      supabaseAdmin
        .from("mst_tasks")
        .select("task_id, task_code, task_title, task_type, difficulty_level, max_score")
        .in("task_id", taskIds),
      supabaseAdmin
        .from("trn_submissions")
        .select(
          "submission_id, profile_id, task_id, auto_score, review_score, final_score, is_passed, total_run_count, total_attempt_count, time_to_first_correct_sec",
        )
        .eq("batch_id", batchId)
        .in("profile_id", profileIds)
        .in("task_id", taskIds),
    ]);
    if (taskError) throw taskError;
    if (submissionError) throw submissionError;

    const submissions = submissionRows ?? [];
    const submissionIds = submissions.map((s) => s.submission_id).filter(Boolean);

    const { data: rubricRows } = submissionIds.length
      ? await supabaseAdmin
          .from("trn_submission_rubric_scores")
          .select("submission_id, criterion_key, criterion_score, max_criterion_score")
          .in("submission_id", submissionIds)
      : { data: [] };

    const rubricScores = (rubricRows ?? []) as {
      submission_id: string;
      criterion_key: string;
      criterion_score: number;
      max_criterion_score: number;
    }[];

    const taskMap = new Map((taskRows ?? []).map((t) => [t.task_id, t]));
    const submissionTaskMap = new Map(submissions.map((s) => [s.submission_id, s.task_id]));

    const submissionsByTask = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      if (!sub.task_id) continue;
      const existing = submissionsByTask.get(sub.task_id) ?? [];
      existing.push(sub);
      submissionsByTask.set(sub.task_id, existing);
    }

    const assignedByTask = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!a.task_id) continue;
      const set = assignedByTask.get(a.task_id) ?? new Set<string>();
      set.add(a.profile_id);
      assignedByTask.set(a.task_id, set);
    }

    // Per-task rubric grouping: task_id → criterion_key → scores[]
    const rubricScoresByTask = new Map<string, Map<string, number[]>>();
    const rubricMaxByTask = new Map<string, Map<string, number>>();
    for (const row of rubricScores) {
      const taskId = submissionTaskMap.get(row.submission_id);
      if (!taskId) continue;

      let scoreMap = rubricScoresByTask.get(taskId);
      if (!scoreMap) { scoreMap = new Map(); rubricScoresByTask.set(taskId, scoreMap); }
      const arr = scoreMap.get(row.criterion_key) ?? [];
      arr.push(row.criterion_score);
      scoreMap.set(row.criterion_key, arr);

      let maxMap = rubricMaxByTask.get(taskId);
      if (!maxMap) { maxMap = new Map(); rubricMaxByTask.set(taskId, maxMap); }
      if (!maxMap.has(row.criterion_key)) maxMap.set(row.criterion_key, row.max_criterion_score);
    }

    // Overall rubric grouping (across all tasks)
    const allRubricScoresByKey = new Map<string, number[]>();
    const allRubricMaxByKey = new Map<string, number>();
    for (const row of rubricScores) {
      const arr = allRubricScoresByKey.get(row.criterion_key) ?? [];
      arr.push(row.criterion_score);
      allRubricScoresByKey.set(row.criterion_key, arr);
      if (!allRubricMaxByKey.has(row.criterion_key)) {
        allRubricMaxByKey.set(row.criterion_key, row.max_criterion_score);
      }
    }

    const taskAnalytics = taskIds.map((taskId) => {
      const task = taskMap.get(taskId);
      const taskSubs = submissionsByTask.get(taskId) ?? [];
      const assignedCount = (assignedByTask.get(taskId) ?? new Set()).size;
      const submittedCount = taskSubs.length;
      const passedCount = taskSubs.filter((s) => s.is_passed).length;
      const scores = taskSubs.map(getEffectiveScore);
      const runCounts = taskSubs.map((s) => Number(s.total_run_count ?? 0));
      const attemptCounts = taskSubs.map((s) => Number(s.total_attempt_count ?? 0));
      const timeCounts = taskSubs
        .filter((s) => s.time_to_first_correct_sec != null)
        .map((s) => Number(s.time_to_first_correct_sec));

      return {
        task_id: taskId,
        task_code: task?.task_code ?? null,
        task_title: task?.task_title ?? null,
        task_type: task?.task_type ?? null,
        difficulty_level: task?.difficulty_level ?? null,
        assigned_count: assignedCount,
        submitted_count: submittedCount,
        completion_rate_pct: pct(submittedCount, assignedCount),
        passed_count: passedCount,
        pass_rate_pct: pct(passedCount, submittedCount),
        avg_score: avg(scores),
        min_score: scores.length ? Math.min(...scores) : null,
        max_score: scores.length ? Math.max(...scores) : null,
        avg_run_count: avg(runCounts),
        avg_attempt_count: avg(attemptCounts),
        avg_time_to_first_correct_sec: avg(timeCounts),
        criterion_avgs: buildCriterionAvgs(
          rubricScoresByTask.get(taskId) ?? new Map(),
          rubricMaxByTask.get(taskId) ?? new Map(),
        ),
      };
    });

    const allScores = submissions.map(getEffectiveScore);
    const allRunCounts = submissions.map((s) => Number(s.total_run_count ?? 0));
    const allAttemptCounts = submissions.map((s) => Number(s.total_attempt_count ?? 0));
    const allTimeCounts = submissions
      .filter((s) => s.time_to_first_correct_sec != null)
      .map((s) => Number(s.time_to_first_correct_sec));

    const totalAssigned = taskAnalytics.reduce((s, t) => s + t.assigned_count, 0);
    const totalSubmitted = taskAnalytics.reduce((s, t) => s + t.submitted_count, 0);
    const totalPassed = taskAnalytics.reduce((s, t) => s + t.passed_count, 0);

    const batchSummary = {
      total_tasks: taskIds.length,
      total_assigned: totalAssigned,
      total_submitted: totalSubmitted,
      overall_completion_rate_pct: pct(totalSubmitted, totalAssigned),
      overall_pass_rate_pct: pct(totalPassed, totalSubmitted),
      overall_avg_score: avg(allScores),
      overall_avg_run_count: avg(allRunCounts),
      overall_avg_attempt_count: avg(allAttemptCounts),
      overall_avg_time_to_first_correct_sec: avg(allTimeCounts),
      overall_criterion_avgs: buildCriterionAvgs(allRubricScoresByKey, allRubricMaxByKey),
    };

    return NextResponse.json({ tasks: taskAnalytics, batch_summary: batchSummary });
  } catch (error) {
    console.error("Teacher analytics API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics failed." },
      { status: 400 },
    );
  }
}
