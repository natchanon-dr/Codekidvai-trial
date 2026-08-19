import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RubricScoreRow } from "@/types/dataset";

type BatchFamily = "assignment" | "exam";
type ReviewStatus = "unsubmitted" | "submitted" | "review" | "completed";

type ClassRow = {
  class_id: string;
  class_code: string;
  class_name: string;
  is_active: boolean;
};

type ClassStudentRow = {
  class_id: string;
  profile_id: string;
  status: string | null;
};

type ProfileRow = {
  profile_id: string;
  participant_code: string | null;
  display_name: string | null;
  academy_member_id?: string | null;
};

type AssignmentRow = {
  batch_id: string;
  profile_id: string;
  task_id: string;
  assigned_order: number | null;
  status: string | null;
};

type BatchRow = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  batch_type: string | null;
  status: string | null;
  set_type_id?: number | null;
};

type TaskRow = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  max_score: number | null;
};

type SubmissionRow = {
  submission_id: string;
  profile_id: string;
  batch_id: string | null;
  task_id: string | null;
  final_answer_text: string | null;
  auto_score?: number | null;
  review_score?: number | null;
  review_status?: TaskReviewStatus | null;
  teacher_feedback?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  final_score: number | null;
  is_passed: boolean | null;
  submitted_at: string | null;
  total_run_count?: number | null;
  total_attempt_count?: number | null;
  time_to_first_correct_sec?: number | null;
  rubric_applied_version?: number | null;
};

type TaskReviewStatus = "submitted" | "reviewed" | "completed";

type ReviewUpdateBody = {
  submission_id?: string;
  review_status?: TaskReviewStatus;
  review_score?: number | null;
  teacher_feedback?: string | null;
};

function getBatchFamily(batch: BatchRow | undefined): BatchFamily | null {
  if (!batch) return null;
  // NOTE: batch_type === "exam_set" and batch_type === "lab_set" are dead code —
  // mst_experiment_batches.batch_type CHECK is ('pilot','main','practice'); those
  // values never exist in the database. Removed to prevent confusion.
  //
  // NOTE: set_type_id === 2 is a legacy numeric signal whose schema origin is
  // unknown — it is not defined in any migration file. Left in place but treat
  // as untrusted until the column origin is confirmed.
  //
  // The canonical source for activity type is tb_class_sets.family (keyed on
  // (class_id, batch_id)). Replacing the heuristics below with a canonical
  // join requires class_id context and is tracked as a separate issue.
  if (
    batch.set_type_id === 2 ||
    batch.batch_code?.startsWith("SX") ||
    batch.batch_code?.startsWith("SE") ||
    batch.batch_code?.startsWith("X") ||
    batch.batch_code?.startsWith("E")
  ) return "exam";
  // Lab batches are intentionally excluded from the teacher review interface
  // (assignment_sets and exam_sets only). Batches matching lab-prefix heuristics
  // return null and are skipped in the response.
  if (batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return null;
  return "assignment";
}

function compareCodeName<T extends { batch_code?: string | null; batch_name?: string | null }>(a: T, b: T) {
  return String(a.batch_code ?? a.batch_name ?? "").localeCompare(String(b.batch_code ?? b.batch_name ?? ""));
}

function getReviewStatus(taskCount: number, submittedCount: number, totalScore: number, maxScore: number): ReviewStatus {
  if (taskCount === 0 || submittedCount < taskCount) return "unsubmitted";
  if (maxScore > 0 && totalScore >= maxScore * 0.8) return "completed";
  return "review";
}

function getEffectiveScore(submission: { review_score?: number | null; auto_score?: number | null; final_score?: number | null } | null) {
  return Number(submission?.review_score ?? submission?.auto_score ?? submission?.final_score ?? 0);
}

function getStudentReviewStatus(tasks: Array<{ submission: { review_status?: TaskReviewStatus | null; review_score?: number | null; auto_score?: number | null; final_score?: number | null } | null; max_score: number | null }>): ReviewStatus {
  if (tasks.length === 0 || tasks.some((task) => !task.submission)) return "unsubmitted";
  const statuses = tasks.map((task) => task.submission?.review_status ?? "submitted");
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "reviewed" || status === "completed")) return "review";
  const totalScore = tasks.reduce((sum, task) => sum + getEffectiveScore(task.submission), 0);
  const maxScore = tasks.reduce((sum, task) => sum + Number(task.max_score ?? 0), 0);
  return getReviewStatus(tasks.length, tasks.length, totalScore, maxScore);
}

function countStatuses(students: Array<{ status: ReviewStatus }>) {
  return students.reduce(
    (counts, student) => ({ ...counts, [student.status]: counts[student.status] + 1 }),
    { unsubmitted: 0, submitted: 0, review: 0, completed: 0 },
  );
}

async function getClasses(profileId: string, role: string) {
  let query = supabaseAdmin
    .from("tb_classes")
    .select("class_id, class_code, class_name, is_active")
    .eq("is_active", true)
    .order("class_code", { ascending: true });
  if (role !== "admin") query = query.eq("teacher_profile_id", profileId);

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return [];
    throw error;
  }
  return (data ?? []) as ClassRow[];
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const classes = await getClasses(profile.profile_id, profile.role);
    const classIds = classes.map((item) => item.class_id);

    const { data: membershipRows, error: membershipError } = classIds.length
      ? await supabaseAdmin
          .from("tb_class_students")
          .select("class_id, profile_id, status")
          .in("class_id", classIds)
          .eq("status", "active")
      : { data: [], error: null };
    if (membershipError) throw membershipError;

    const memberships = (membershipRows ?? []) as ClassStudentRow[];
    const profileIds = [...new Set(memberships.map((row) => row.profile_id).filter(Boolean))];
    if (profileIds.length === 0) {
      return NextResponse.json({ classes: classes.map((item) => ({ ...item, assignment_sets: [], exam_sets: [] })) });
    }

    const [{ data: profileRows, error: profileError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
      supabaseAdmin
        .from("mst_profiles")
        .select("profile_id, participant_code, display_name")
        .in("profile_id", profileIds),
      supabaseAdmin
        .from("trn_task_assignments")
        .select("batch_id, profile_id, task_id, assigned_order, status")
        .in("profile_id", profileIds),
    ]);
    if (profileError) throw profileError;
    if (assignmentError) throw assignmentError;

    const participantCodes = ((profileRows ?? []) as { participant_code: string | null }[])
      .map((r) => r.participant_code)
      .filter(Boolean) as string[];
    const { data: memberRows } = participantCodes.length
      ? await supabaseAdmin
          .from("mst_academy_members")
          .select("participant_code, academy_member_id")
          .in("participant_code", participantCodes)
      : { data: [] };
    const memberMap = new Map(
      ((memberRows ?? []) as { participant_code: string; academy_member_id: string }[])
        .map((m) => [m.participant_code, m.academy_member_id]),
    );
    const profileMap = new Map(
      ((profileRows ?? []) as { profile_id: string; participant_code: string | null; display_name: string | null }[])
        .map((r) => [r.profile_id, { ...r, academy_member_id: memberMap.get(r.participant_code ?? "") ?? null }]),
    );

    const assignments = (assignmentRows ?? []) as AssignmentRow[];
    const batchIds = [...new Set(assignments.map((row) => row.batch_id).filter(Boolean))];
    const taskIds = [...new Set(assignments.map((row) => row.task_id).filter(Boolean))];

    const [{ data: batchRows, error: batchError }, { data: taskRows, error: taskError }, { data: submissionRows, error: submissionError }] = await Promise.all([
      batchIds.length
        ? supabaseAdmin
            .from("mst_experiment_batches")
            .select("batch_id, batch_code, batch_name, batch_type, status, set_type_id")
            .in("batch_id", batchIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabaseAdmin
            .from("mst_tasks")
            .select("task_id, task_code, task_title, max_score")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabaseAdmin
            .from("trn_submissions")
            .select("submission_id, profile_id, batch_id, task_id, final_answer_text, auto_score, review_score, review_status, teacher_feedback, reviewed_by, reviewed_at, final_score, is_passed, submitted_at, total_run_count, total_attempt_count, time_to_first_correct_sec, rubric_applied_version")
            .in("profile_id", profileIds)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (batchError) throw batchError;
    if (taskError) throw taskError;
    if (submissionError) throw submissionError;

    // B1: batch-fetch criterion-level rubric scores for all submissions
    const submissions = (submissionRows ?? []) as SubmissionRow[];
    const submissionIds = submissions.map((s) => s.submission_id).filter(Boolean);
    const { data: rubricRows } = submissionIds.length
      ? await supabaseAdmin
          .from("trn_submission_rubric_scores")
          .select("submission_id, criterion_key, criterion_label, criterion_score, max_criterion_score")
          .in("submission_id", submissionIds)
      : { data: [] };
    const rubricMap = new Map<string, RubricScoreRow[]>();
    for (const row of (rubricRows ?? []) as RubricScoreRow[]) {
      const existing = rubricMap.get(row.submission_id) ?? [];
      existing.push(row);
      rubricMap.set(row.submission_id, existing);
    }

    const batchMap = new Map(((batchRows ?? []) as BatchRow[]).map((row) => [row.batch_id, row]));
    const taskMap = new Map(((taskRows ?? []) as TaskRow[]).map((row) => [row.task_id, row]));
    const submissionMap = new Map<string, SubmissionRow>();
    for (const submission of submissions) {
      if (!submission.batch_id || !submission.task_id) continue;
      submissionMap.set(`${submission.profile_id}:${submission.batch_id}:${submission.task_id}`, submission);
    }

    const profileClasses = new Map<string, string[]>();
    for (const membership of memberships) {
      profileClasses.set(membership.profile_id, [...(profileClasses.get(membership.profile_id) ?? []), membership.class_id]);
    }

    const classSetStudentTasks = new Map<string, Map<string, Map<string, AssignmentRow[]>>>();
    for (const classItem of classes) classSetStudentTasks.set(classItem.class_id, new Map());

    for (const assignment of assignments) {
      const batch = batchMap.get(assignment.batch_id);
      const family = getBatchFamily(batch);
      if (!family) continue;
      for (const classId of profileClasses.get(assignment.profile_id) ?? []) {
        const setKey = `${family}:${assignment.batch_id}`;
        const classSets = classSetStudentTasks.get(classId);
        if (!classSets) continue;
        const studentMap = classSets.get(setKey) ?? new Map<string, AssignmentRow[]>();
        studentMap.set(assignment.profile_id, [...(studentMap.get(assignment.profile_id) ?? []), assignment]);
        classSets.set(setKey, studentMap);
      }
    }

    const responseClasses = classes.map((classItem) => {
      const classStudents = memberships
        .filter((row) => row.class_id === classItem.class_id)
        .map((row) => row.profile_id);
      const setMap = classSetStudentTasks.get(classItem.class_id) ?? new Map();
      const assignmentSets = [];
      const examSets = [];

      for (const [setKey, studentTasks] of setMap.entries()) {
        const [family, batchId] = setKey.split(":") as [BatchFamily, string];
        const batch = batchMap.get(batchId);
        if (!batch) continue;

        const students = classStudents.map((profileId) => {
          const rows = [...(studentTasks.get(profileId) ?? [])].sort((a, b) => Number(a.assigned_order ?? 0) - Number(b.assigned_order ?? 0));
          const tasks = rows.map((row) => {
            const task = taskMap.get(row.task_id);
            const submission = submissionMap.get(`${profileId}:${batchId}:${row.task_id}`) ?? null;
            return {
              task_id: row.task_id,
              task_code: task?.task_code ?? null,
              task_title: task?.task_title ?? null,
              assigned_order: row.assigned_order,
              assignment_status: row.status,
              max_score: task?.max_score ?? null,
              submission: submission
                ? {
                    submission_id: submission.submission_id,
                    final_answer_text: submission.final_answer_text,
                    auto_score: submission.auto_score ?? null,
                    review_score: submission.review_score ?? null,
                    review_status: submission.review_status ?? "submitted",
                    teacher_feedback: submission.teacher_feedback ?? null,
                    reviewed_by: submission.reviewed_by ?? null,
                    reviewed_at: submission.reviewed_at ?? null,
                    final_score: Number(submission.final_score ?? 0),
                    is_passed: submission.is_passed,
                    submitted_at: submission.submitted_at,
                    total_run_count: submission.total_run_count ?? null,
                    total_attempt_count: submission.total_attempt_count ?? null,
                    time_to_first_correct_sec: submission.time_to_first_correct_sec ?? null,
                    rubric_applied_version: submission.rubric_applied_version ?? null,
                    rubric_scores: rubricMap.get(submission.submission_id) ?? [],
                  }
                : null,
            };
          });
          const submittedCount = tasks.filter((task) => task.submission).length;
          const totalScore = tasks.reduce((sum, task) => sum + getEffectiveScore(task.submission), 0);
          const maxScore = tasks.reduce((sum, task) => sum + Number(task.max_score ?? 0), 0);
          return {
            profile_id: profileId,
            student: profileMap.get(profileId) ?? null,
            task_count: tasks.length,
            submitted_count: submittedCount,
            total_score: totalScore,
            max_score: maxScore,
            status: getStudentReviewStatus(tasks),
            tasks,
          };
        });

        const setItem = {
          batch_id: batchId,
          batch_code: batch.batch_code,
          batch_name: batch.batch_name,
          status: batch.status,
          student_count: students.length,
          task_count: Math.max(0, ...students.map((student) => student.task_count)),
          submitted_students_count: students.filter((student) => student.task_count > 0 && student.submitted_count >= student.task_count).length,
          completed_students_count: students.filter((student) => student.status === "completed").length,
          review_students_count: students.filter((student) => student.status === "review").length,
          status_counts: countStatuses(students),
          students,
        };

        if (family === "exam") examSets.push(setItem);
        else assignmentSets.push(setItem);
      }

      return {
        ...classItem,
        student_count: classStudents.length,
        assignment_sets: assignmentSets.sort(compareCodeName),
        exam_sets: examSets.sort(compareCodeName),
      };
    });

    return NextResponse.json({ classes: responseClasses });
  } catch (error) {
    console.error("Teacher submissions API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load submissions." },
      { status: 400 },
    );
  }
}

function isReviewStatus(value: unknown): value is TaskReviewStatus {
  return value === "submitted" || value === "reviewed" || value === "completed";
}

async function requireReviewAccess(submission: SubmissionRow, profileId: string, role: string) {
  if (role === "admin") return;

  const { data: classRows, error: classError } = await supabaseAdmin
    .from("tb_classes")
    .select("class_id")
    .eq("teacher_profile_id", profileId)
    .eq("is_active", true);
  if (classError) throw classError;

  const classIds = (classRows ?? []).map((row) => row.class_id).filter(Boolean);
  if (classIds.length === 0) throw new Error("Submission not found for this teacher.");

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("tb_class_students")
    .select("class_student_id")
    .eq("profile_id", submission.profile_id)
    .eq("status", "active")
    .in("class_id", classIds)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Submission not found for this teacher.");
}

export async function PATCH(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const body = (await request.json()) as ReviewUpdateBody;
    const submissionId = String(body.submission_id ?? "").trim();
    if (!submissionId) throw new Error("Submission is required.");

    const { data: submissionData, error: submissionError } = await supabaseAdmin
      .from("trn_submissions")
      .select("submission_id, profile_id, batch_id, task_id, final_answer_text, auto_score, review_score, review_status, teacher_feedback, reviewed_by, reviewed_at, final_score, is_passed, submitted_at, total_run_count, total_attempt_count")
      .eq("submission_id", submissionId)
      .single();
    if (submissionError || !submissionData) throw new Error("Submission not found.");

    const submission = submissionData as SubmissionRow;
    await requireReviewAccess(submission, profile.profile_id, profile.role);

    const updatePayload: Record<string, string | number | null> = {
      reviewed_by: profile.profile_id,
      reviewed_at: new Date().toISOString(),
    };

    if (body.review_status !== undefined) {
      if (!isReviewStatus(body.review_status)) throw new Error("Invalid review status.");
      updatePayload.review_status = body.review_status;
    }

    if (body.review_score !== undefined) {
      if (body.review_score === null) {
        updatePayload.review_score = null;
      } else {
        const { data: taskRow, error: taskError } = await supabaseAdmin
          .from("mst_tasks")
          .select("max_score")
          .eq("task_id", submission.task_id)
          .maybeSingle();
        if (taskError) throw taskError;
        const maxScore = Number(taskRow?.max_score ?? Number.MAX_SAFE_INTEGER);
        const score = Number(body.review_score);
        if (!Number.isFinite(score)) throw new Error("Invalid review score.");
        updatePayload.review_score = Math.min(Math.max(score, 0), maxScore);
      }
    }

    if (body.teacher_feedback !== undefined) {
      const feedback = String(body.teacher_feedback ?? "").trim();
      updatePayload.teacher_feedback = feedback || null;
    }

    const { data, error } = await supabaseAdmin
      .from("trn_submissions")
      .update(updatePayload)
      .eq("submission_id", submissionId)
      .select("submission_id, profile_id, batch_id, task_id, final_answer_text, auto_score, review_score, review_status, teacher_feedback, reviewed_by, reviewed_at, final_score, is_passed, submitted_at, total_run_count, total_attempt_count")
      .single();
    if (error) throw error;

    return NextResponse.json({ submission: data });
  } catch (error) {
    console.error("Teacher submission review API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save review." },
      { status: 400 },
    );
  }
}
