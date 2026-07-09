import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { convertRowsToCsv } from "@/lib/csv-utils";
import type { RubricScoreRow } from "@/types/dataset";

type ExportMode = "student" | "task";

function isExportMode(value: unknown): value is ExportMode {
  return value === "student" || value === "task";
}

// Stable 2C3L criterion keys — always emitted as CSV columns even when no
// rubric scores exist yet, so downstream analytics tools see a consistent schema.
const STABLE_2C3L_KEYS = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
] as const;

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

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { searchParams } = request.nextUrl;
    const classId = searchParams.get("class_id") ?? "";
    const batchId = searchParams.get("batch_id") ?? "";
    const modeParam = searchParams.get("mode") ?? "student";

    if (!classId) throw new Error("class_id is required.");
    if (!batchId) throw new Error("batch_id is required.");
    if (!isExportMode(modeParam)) throw new Error("mode must be 'student' or 'task'.");

    await requireClassAccess(classId, profile.profile_id, profile.role);

    // Verify batch_id is assigned to this class via tb_class_sets (prevents cross-class data leakage)
    const { data: classSetRow, error: classSetError } = await supabaseAdmin
      .from("tb_class_sets")
      .select("class_set_id")
      .eq("class_id", classId)
      .eq("batch_id", batchId)
      .maybeSingle();
    if (classSetError) throw classSetError;
    if (!classSetRow) throw new Error("Batch does not belong to this class.");

    // Fetch class info, memberships, and batch details in parallel
    const [
      { data: classRow, error: classError },
      { data: membershipRows, error: membershipError },
      { data: batchRow, error: batchError },
    ] = await Promise.all([
      supabaseAdmin
        .from("tb_classes")
        .select("class_id, class_code, class_name, learner_group, class_level")
        .eq("class_id", classId)
        .single(),
      supabaseAdmin
        .from("tb_class_students")
        .select("profile_id")
        .eq("class_id", classId)
        .eq("status", "active"),
      supabaseAdmin
        .from("mst_experiment_batches")
        .select("batch_id, batch_code, batch_name")
        .eq("batch_id", batchId)
        .single(),
    ]);
    if (classError) throw classError;
    if (membershipError) throw membershipError;
    if (batchError) throw batchError;

    const profileIds = (membershipRows ?? []).map((r) => r.profile_id).filter(Boolean);
    if (profileIds.length === 0) {
      const csv = convertRowsToCsv([]);
      return csvResponse(csv, classRow?.class_code ?? "export", batchId, modeParam);
    }

    // Fetch assignments for this batch + these students
    const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("profile_id, task_id, assigned_order, status")
      .eq("batch_id", batchId)
      .in("profile_id", profileIds)
      .order("assigned_order", { ascending: true });
    if (assignmentError) throw assignmentError;

    const assignments = assignmentRows ?? [];
    const taskIds = [...new Set(assignments.map((a) => a.task_id).filter(Boolean))];
    if (taskIds.length === 0) {
      const csv = convertRowsToCsv([]);
      return csvResponse(csv, classRow?.class_code ?? "export", batchId, modeParam);
    }

    // Parallel fetch: task details, student profiles, submissions
    const [
      { data: taskRows, error: taskError },
      { data: profileRows, error: profileError },
      { data: submissionRows, error: submissionError },
    ] = await Promise.all([
      supabaseAdmin
        .from("mst_tasks")
        .select("task_id, task_code, task_title, task_type, difficulty_level, max_score")
        .in("task_id", taskIds),
      supabaseAdmin
        .from("mst_profiles")
        .select("profile_id, participant_code, display_name")
        .in("profile_id", profileIds),
      supabaseAdmin
        .from("trn_submissions")
        .select(
          "submission_id, profile_id, task_id, submitted_at, auto_score, review_score, final_score, is_passed, review_status, total_run_count, total_attempt_count, time_to_first_correct_sec, rubric_applied_version",
        )
        .eq("batch_id", batchId)
        .in("profile_id", profileIds)
        .in("task_id", taskIds),
    ]);
    if (taskError) throw taskError;
    if (profileError) throw profileError;
    if (submissionError) throw submissionError;

    // Fetch academy member IDs
    const participantCodes = (profileRows ?? [])
      .map((r) => r.participant_code)
      .filter(Boolean) as string[];
    const { data: memberRows } = participantCodes.length
      ? await supabaseAdmin
          .from("mst_academy_members")
          .select("participant_code, academy_member_id")
          .in("participant_code", participantCodes)
      : { data: [] };
    const memberMap = new Map(
      ((memberRows ?? []) as { participant_code: string; academy_member_id: string }[]).map(
        (m) => [m.participant_code, m.academy_member_id],
      ),
    );

    // Build lookup maps
    const taskMap = new Map((taskRows ?? []).map((t) => [t.task_id, t]));
    const profileMap = new Map(
      (profileRows ?? []).map((p) => [
        p.profile_id,
        { ...p, academy_member_id: memberMap.get(p.participant_code ?? "") ?? null },
      ]),
    );
    // submission key: profile_id:task_id (already batch-scoped by query)
    const submissionMap = new Map(
      (submissionRows ?? []).map((s) => [`${s.profile_id}:${s.task_id}`, s]),
    );

    const contextFields = {
      classCode: classRow?.class_code ?? "",
      className: classRow?.class_name ?? "",
      learnerGroup: (classRow as { learner_group?: string | null } | null)?.learner_group ?? "",
      classLevel: (classRow as { class_level?: string | null } | null)?.class_level ?? "",
      batchCode: (batchRow as { batch_code?: string | null } | null)?.batch_code ?? "",
      batchName: (batchRow as { batch_name?: string | null } | null)?.batch_name ?? "",
    };

    if (modeParam === "task") {
      const csv = buildTaskModeCsv({
        ...contextFields,
        taskIds,
        taskMap,
        profileIds,
        submissionMap,
      });
      return csvResponse(csv, contextFields.classCode, batchId, modeParam);
    }

    // Student mode: fetch rubric scores for all submissions
    const submissionIds = (submissionRows ?? []).map((s) => s.submission_id).filter(Boolean);
    const { data: rubricRows } = submissionIds.length
      ? await supabaseAdmin
          .from("trn_submission_rubric_scores")
          .select("submission_id, criterion_key, criterion_label, criterion_score, max_criterion_score")
          .in("submission_id", submissionIds)
      : { data: [] };

    const rubricBySubmission = new Map<string, RubricScoreRow[]>();
    for (const row of (rubricRows ?? []) as RubricScoreRow[]) {
      const existing = rubricBySubmission.get(row.submission_id) ?? [];
      existing.push(row);
      rubricBySubmission.set(row.submission_id, existing);
    }

    // Criterion columns: always include the 5 stable 2C3L keys, then any
    // additional keys found in actual rubric data (for non-2C3L rubrics).
    const extraKeys = [
      ...new Set(
        (rubricRows ?? [])
          .map((r) => (r as RubricScoreRow).criterion_key)
          .filter((k) => !(STABLE_2C3L_KEYS as readonly string[]).includes(k)),
      ),
    ].sort();
    const allCriterionKeys: string[] = [...STABLE_2C3L_KEYS, ...extraKeys];

    const submissionIdMap = new Map(
      (submissionRows ?? []).map((s) => [`${s.profile_id}:${s.task_id}`, s.submission_id]),
    );

    const csv = buildStudentModeCsv({
      ...contextFields,
      profileIds,
      taskIds,
      taskMap,
      profileMap,
      assignments,
      submissionMap,
      submissionIdMap,
      rubricBySubmission,
      allCriterionKeys,
    });

    return csvResponse(csv, contextFields.classCode, batchId, modeParam);
  } catch (error) {
    console.error("Teacher export API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 400 },
    );
  }
}

// ─── Shared context fields ────────────────────────────────────────────────────

type ContextFields = {
  classCode: string;
  className: string;
  learnerGroup: string;
  classLevel: string;
  batchCode: string;
  batchName: string;
};

// ─── Submission map value type ────────────────────────────────────────────────

type SubmissionValue = {
  submission_id: string;
  submitted_at: string | null;
  auto_score: number | null;
  review_score: number | null;
  final_score: number | null;
  is_passed: boolean | null;
  review_status: string | null;
  total_run_count: number | null;
  total_attempt_count: number | null;
  time_to_first_correct_sec: number | null;
  rubric_applied_version: number | null;
};

type TaskValue = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  task_type: string | null;
  difficulty_level: string | null;
  max_score: number | null;
};

// ─── Student mode ─────────────────────────────────────────────────────────────

function buildStudentModeCsv(params: ContextFields & {
  profileIds: string[];
  taskIds: string[];
  taskMap: Map<string, TaskValue>;
  profileMap: Map<string, { profile_id: string; participant_code: string | null; display_name: string | null; academy_member_id: string | null }>;
  assignments: Array<{ profile_id: string; task_id: string; assigned_order: number | null; status: string | null }>;
  submissionMap: Map<string, SubmissionValue>;
  submissionIdMap: Map<string, string>;
  rubricBySubmission: Map<string, RubricScoreRow[]>;
  allCriterionKeys: string[];
}): string {
  const {
    classCode, className, learnerGroup, classLevel, batchCode, batchName,
    profileIds, taskIds, taskMap, profileMap, assignments,
    submissionMap, submissionIdMap, rubricBySubmission, allCriterionKeys,
  } = params;

  // Build per-student ordered task list from assignments
  const studentTaskOrder = new Map<string, string[]>();
  for (const a of assignments) {
    const existing = studentTaskOrder.get(a.profile_id) ?? [];
    existing.push(a.task_id);
    studentTaskOrder.set(a.profile_id, existing);
  }

  const rows: Record<string, unknown>[] = [];

  for (const profileId of profileIds) {
    const student = profileMap.get(profileId);
    const orderedTaskIds = studentTaskOrder.get(profileId) ?? taskIds;

    for (const taskId of orderedTaskIds) {
      const task = taskMap.get(taskId);
      if (!task) continue;

      const subKey = `${profileId}:${taskId}`;
      const submission = (submissionMap.get(subKey) ?? null) as SubmissionValue | null;
      const submissionId = submissionIdMap.get(subKey) ?? null;
      const rubricScores = submissionId ? (rubricBySubmission.get(submissionId) ?? []) : [];
      const rubricByKey = new Map(rubricScores.map((r) => [r.criterion_key, r]));

      const row: Record<string, unknown> = {
        class_code:     classCode,
        class_name:     className,
        learner_group:  learnerGroup,
        class_level:    classLevel,
        batch_code:     batchCode,
        batch_name:     batchName,
        academy_member_id:      student?.academy_member_id ?? "",
        participant_code:       student?.participant_code ?? "",
        display_name:           student?.display_name ?? "",
        task_code:              task.task_code ?? "",
        task_title:             task.task_title ?? "",
        task_type:              task.task_type ?? "",
        difficulty_level:       task.difficulty_level ?? "",
        max_score:              task.max_score ?? "",
        submitted:              submission ? "yes" : "no",
        submitted_at:           submission?.submitted_at ?? "",
        auto_score:             submission?.auto_score ?? "",
        review_score:           submission?.review_score ?? "",
        final_score:            submission?.final_score ?? "",
        is_passed:              submission ? (submission.is_passed ? "yes" : "no") : "",
        review_status:          submission?.review_status ?? "",
        total_run_count:        submission?.total_run_count ?? "",
        total_attempt_count:    submission?.total_attempt_count ?? "",
        time_to_first_correct_sec: submission?.time_to_first_correct_sec ?? "",
        rubric_applied_version: submission?.rubric_applied_version ?? "",
      };

      for (const key of allCriterionKeys) {
        const r = rubricByKey.get(key);
        row[`rubric_${key}_score`] = r?.criterion_score ?? "";
        row[`rubric_${key}_max`]   = r?.max_criterion_score ?? "";
      }

      rows.push(row);
    }
  }

  return convertRowsToCsv(rows);
}

// ─── Task mode ────────────────────────────────────────────────────────────────

function buildTaskModeCsv(params: ContextFields & {
  taskIds: string[];
  taskMap: Map<string, TaskValue>;
  profileIds: string[];
  submissionMap: Map<string, SubmissionValue>;
}): string {
  const { classCode, className, learnerGroup, classLevel, batchCode, batchName,
          taskIds, taskMap, profileIds, submissionMap } = params;

  const rows: Record<string, unknown>[] = [];

  for (const taskId of taskIds) {
    const task = taskMap.get(taskId);
    if (!task) continue;

    const taskSubmissions = profileIds
      .map((profileId) => submissionMap.get(`${profileId}:${taskId}`))
      .filter(Boolean) as SubmissionValue[];

    const submittedCount = taskSubmissions.length;
    const assignedCount  = profileIds.length;
    const passedCount    = taskSubmissions.filter((s) => s.is_passed).length;
    const scores         = taskSubmissions.map((s) => Number(s.final_score ?? 0));
    const avgScore       = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const minScore       = scores.length ? Math.min(...scores) : "";
    const maxScoreAchieved = scores.length ? Math.max(...scores) : "";
    const avgRunCount    = taskSubmissions.length
      ? taskSubmissions.reduce((sum, s) => sum + Number(s.total_run_count ?? 0), 0) / taskSubmissions.length
      : "";
    const avgAttemptCount = taskSubmissions.length
      ? taskSubmissions.reduce((sum, s) => sum + Number(s.total_attempt_count ?? 0), 0) / taskSubmissions.length
      : "";

    rows.push({
      class_code:     classCode,
      class_name:     className,
      learner_group:  learnerGroup,
      class_level:    classLevel,
      batch_code:     batchCode,
      batch_name:     batchName,
      task_code:              task.task_code ?? "",
      task_title:             task.task_title ?? "",
      task_type:              task.task_type ?? "",
      difficulty_level:       task.difficulty_level ?? "",
      max_score:              task.max_score ?? "",
      assigned_count:         assignedCount,
      submitted_count:        submittedCount,
      passed_count:           passedCount,
      pass_rate_pct:          submittedCount > 0 ? Math.round((passedCount / submittedCount) * 100) : "",
      avg_score:              scores.length ? Math.round(avgScore * 100) / 100 : "",
      min_score:              minScore,
      max_score_achieved:     maxScoreAchieved,
      avg_run_count:          typeof avgRunCount === "number" ? Math.round(avgRunCount * 100) / 100 : "",
      avg_attempt_count:      typeof avgAttemptCount === "number" ? Math.round(avgAttemptCount * 100) / 100 : "",
    });
  }

  return convertRowsToCsv(rows);
}

// ─── Response helper ──────────────────────────────────────────────────────────

function csvResponse(csv: string, classCode: string, batchId: string, mode: string): NextResponse {
  const filename = `ckv_export_${classCode}_${batchId.slice(0, 8)}_${mode}_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
