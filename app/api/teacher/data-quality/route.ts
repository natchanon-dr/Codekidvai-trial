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

type CheckStatus = "ok" | "warning" | "error";

type DataQualityCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  count: number | null;
  total: number | null;
  detail: string;
  critical: boolean;
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

function check(
  key: string,
  label: string,
  badCount: number,
  total: number | null,
  critical: boolean,
): DataQualityCheck {
  const status: CheckStatus = badCount === 0 ? "ok" : critical ? "error" : "warning";
  const detail =
    badCount === 0
      ? "All records pass this check."
      : total != null
        ? `${badCount} of ${total} records have an issue.`
        : `${badCount} record(s) have an issue.`;
  return { key, label, status, count: badCount, total, detail, critical };
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

    // ── Parallel data fetching ────────────────────────────────────────────────

    const [
      { data: classRow, error: classError },
      { data: membershipRows, error: membershipError },
    ] = await Promise.all([
      supabaseAdmin
        .from("tb_classes")
        .select("class_id, learner_group, class_level")
        .eq("class_id", classId)
        .single(),
      supabaseAdmin
        .from("tb_class_students")
        .select("profile_id")
        .eq("class_id", classId)
        .eq("status", "active"),
    ]);
    if (classError) throw classError;
    if (membershipError) throw membershipError;

    const profileIds = (membershipRows ?? []).map((r) => r.profile_id).filter(Boolean);
    const classData = classRow as {
      class_id: string;
      learner_group: string | null;
      class_level: string | null;
    } | null;

    const checks: DataQualityCheck[] = [];

    // ── Check 1 & 2: class-level metadata ─────────────────────────────────────

    checks.push(
      check(
        "class_missing_learner_group",
        "Class has learner_group set",
        classData?.learner_group ? 0 : 1,
        1,
        true,
      ),
    );

    checks.push(
      check(
        "class_missing_class_level",
        "Class has class_level set",
        classData?.class_level ? 0 : 1,
        1,
        true,
      ),
    );

    // ── Remaining checks require students/tasks ────────────────────────────────

    if (profileIds.length === 0) {
      checks.push({
        key: "no_students",
        label: "Students enrolled",
        status: "warning",
        count: 0,
        total: 0,
        detail: "No active students in this class.",
        critical: false,
      });
      return buildResponse(checks, []);
    }

    // Get assignments + task IDs for this batch
    const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("profile_id, task_id")
      .eq("batch_id", batchId)
      .in("profile_id", profileIds);
    if (assignmentError) throw assignmentError;

    const assignments = assignmentRows ?? [];
    const taskIds = [...new Set(assignments.map((a) => a.task_id).filter(Boolean))];
    const totalAssignments = assignments.length;

    // Parallel: tasks, submissions, academy members
    const [
      { data: taskRows, error: taskError },
      { data: submissionRows, error: submissionError },
      { data: profileRows, error: profileError },
    ] = await Promise.all([
      taskIds.length
        ? supabaseAdmin
            .from("mst_tasks")
            .select("task_id, scoring_rubric_json")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabaseAdmin
            .from("trn_submissions")
            .select("submission_id, task_id, rubric_applied_version")
            .eq("batch_id", batchId)
            .in("profile_id", profileIds)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("mst_profiles")
        .select("profile_id, participant_code")
        .in("profile_id", profileIds),
    ]);
    if (taskError) throw taskError;
    if (submissionError) throw submissionError;
    if (profileError) throw profileError;

    const submissions = submissionRows ?? [];
    const totalSubmissions = submissions.length;
    const submissionIds = submissions.map((s) => s.submission_id).filter(Boolean);

    // ── Check 3: submissions missing rubric_applied_version ───────────────────

    const missRubricVersion = submissions.filter((s) => s.rubric_applied_version == null).length;
    checks.push(
      check(
        "submissions_missing_rubric_applied_version",
        "Submissions have rubric_applied_version",
        missRubricVersion,
        totalSubmissions,
        false,
      ),
    );

    // ── Check 4: submissions with version but missing rubric score rows ────────

    const submissionsWithVersion = submissions.filter((s) => s.rubric_applied_version != null);
    let missRubricScores = 0;
    if (submissionsWithVersion.length > 0) {
      const versionedIds = submissionsWithVersion.map((s) => s.submission_id).filter(Boolean);
      const { data: rubricRows } = await supabaseAdmin
        .from("trn_submission_rubric_scores")
        .select("submission_id")
        .in("submission_id", versionedIds);
      const coveredIds = new Set((rubricRows ?? []).map((r) => r.submission_id));
      missRubricScores = versionedIds.filter((id) => !coveredIds.has(id)).length;
    }
    checks.push(
      check(
        "submissions_with_version_missing_rubric_scores",
        "Versioned submissions have rubric score rows",
        missRubricScores,
        submissionsWithVersion.length,
        false,
      ),
    );

    // ── Check 5: tasks without scoring_rubric_json ────────────────────────────

    const tasks = (taskRows ?? []) as { task_id: string; scoring_rubric_json: unknown }[];
    const tasksNoRubric = tasks.filter(
      (t) => t.scoring_rubric_json == null,
    ).length;
    checks.push(
      check(
        "tasks_without_scoring_rubric_json",
        "Tasks have scoring_rubric_json configured",
        tasksNoRubric,
        tasks.length,
        true,
      ),
    );

    // ── Check 6: tasks without all 5 2C3L criterion keys ─────────────────────

    const tasksWithRubric = tasks.filter((t) => t.scoring_rubric_json != null);
    const tasksMissing2C3L = tasksWithRubric.filter((t) => {
      const rubric = t.scoring_rubric_json as {
        type?: string;
        criteria?: { key: string }[];
      } | null;
      if (rubric?.type !== "criterion_based") return false;
      const keys = (rubric.criteria ?? []).map((c) => c.key);
      return !STABLE_2C3L_KEYS.every((k) => keys.includes(k));
    }).length;
    checks.push(
      check(
        "tasks_without_2c3l_keys",
        "Criterion-based tasks have all 5 2C3L keys",
        tasksMissing2C3L,
        tasksWithRubric.length,
        false,
      ),
    );

    // ── Check 7: students without academy_member_id ───────────────────────────

    const participantCodes = ((profileRows ?? []) as { profile_id: string; participant_code: string | null }[])
      .map((r) => r.participant_code)
      .filter(Boolean) as string[];

    let studentsWithoutMemberId = profileIds.length;
    if (participantCodes.length > 0) {
      const { data: memberRows } = await supabaseAdmin
        .from("mst_academy_members")
        .select("participant_code")
        .in("participant_code", participantCodes);
      const coveredCodes = new Set((memberRows ?? []).map((m) => m.participant_code));
      studentsWithoutMemberId = ((profileRows ?? []) as { profile_id: string; participant_code: string | null }[]).filter(
        (r) => !r.participant_code || !coveredCodes.has(r.participant_code),
      ).length;
    }
    checks.push(
      check(
        "students_without_academy_member_id",
        "Students have academy_member_id",
        studentsWithoutMemberId,
        profileIds.length,
        false,
      ),
    );

    // ── Check 8: export row count consistency ─────────────────────────────────

    const rowCountGap = Math.abs(totalAssignments - totalSubmissions);
    checks.push({
      key: "export_row_count_consistency",
      label: "Submission count matches assignment count",
      status: rowCountGap === 0 ? "ok" : "warning",
      count: totalSubmissions,
      total: totalAssignments,
      detail:
        rowCountGap === 0
          ? `${totalSubmissions} submissions match ${totalAssignments} assignments.`
          : `${totalSubmissions} submissions vs ${totalAssignments} assignments — ${rowCountGap} gap (expected if some students have not submitted yet).`,
      critical: false,
    });

    // ── Check 9: orphan rubric score rows ─────────────────────────────────────

    let orphanCount = 0;
    if (submissionIds.length > 0) {
      const { data: allRubricRows } = await supabaseAdmin
        .from("trn_submission_rubric_scores")
        .select("submission_id")
        .in("submission_id", submissionIds);
      const submissionIdSet = new Set(submissionIds);
      orphanCount = (allRubricRows ?? []).filter(
        (r) => !submissionIdSet.has(r.submission_id),
      ).length;
    }
    checks.push(
      check(
        "rubric_score_orphan_check",
        "No orphan rubric score rows",
        orphanCount,
        null,
        false,
      ),
    );

    return buildResponse(checks, []);
  } catch (error) {
    console.error("Teacher data quality API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Data quality check failed." },
      { status: 400 },
    );
  }
}

function buildResponse(checks: DataQualityCheck[], notes: string[]) {
  const criticalErrors = checks.filter((c) => c.critical && c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const total = checks.length;
  const passed = checks.filter((c) => c.status === "ok").length;
  const readinessScore = total > 0 ? Math.round((passed / total) * 100) : 100;

  const readinessStatus: "ready" | "warning" | "not_ready" =
    criticalErrors > 0 ? "not_ready" : warnings > 0 ? "warning" : "ready";

  return NextResponse.json({
    checks,
    readiness_score: readinessScore,
    readiness_status: readinessStatus,
    notes,
  });
}
