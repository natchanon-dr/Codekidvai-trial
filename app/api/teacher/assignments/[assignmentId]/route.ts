import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type BatchRow = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  batch_type: string | null;
  created_by: string | null;
  set_type_id?: number | null;
};

type AssignmentRow = {
  assignment_id: string;
  batch_id: string;
  profile_id: string;
  task_id: string;
  status: string | null;
  assigned_order: number | null;
  assigned_at: string | null;
  completed_at: string | null;
};

type SubmissionRow = {
  submission_id: string;
  profile_id: string;
  task_id: string;
  batch_id?: string | null;
  final_answer_text: string | null;
  final_score: number | null;
  is_passed: boolean | null;
  submitted_at: string | null;
  created_at: string | null;
};

function isAssignmentBatch(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("A")
  );
}

async function getBatches() {
  const first = await supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code, batch_name, batch_type, created_by, set_type_id");
  if (!first.error) return (first.data ?? []) as BatchRow[];

  const fallback = await supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code, batch_name, batch_type, created_by");
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as BatchRow[];
}

async function getSubmissions(assignmentId: string, profileIds: string[]): Promise<SubmissionRow[]> {
  if (profileIds.length === 0) return [];

  const withBatch = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, task_id, batch_id, final_answer_text, final_score, is_passed, submitted_at, created_at")
    .eq("task_id", assignmentId)
    .in("profile_id", profileIds);
  if (!withBatch.error) return (withBatch.data ?? []) as SubmissionRow[];

  const withoutBatch = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, task_id, final_answer_text, final_score, is_passed, submitted_at, created_at")
    .eq("task_id", assignmentId)
    .in("profile_id", profileIds);
  if (withoutBatch.error) throw withoutBatch.error;
  return (withoutBatch.data ?? []) as SubmissionRow[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const { assignmentId } = await params;
    const profile = await requireTeacherOrAdmin(request);
    const batches = (await getBatches()).filter(isAssignmentBatch);
    const visibleBatches = profile.role === "admin"
      ? batches
      : batches.filter((batch) => batch.created_by === profile.profile_id);
    const batchIds = visibleBatches.map((batch) => batch.batch_id);

    if (batchIds.length === 0) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("mst_tasks")
      .select("task_id, task_code, task_title, task_description, task_type, difficulty_level, learning_objective, problem_statement, expected_answer, expected_output_json, expected_concept, max_score, estimated_time_seconds, task_status, is_active, created_at")
      .eq("task_id", assignmentId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("assignment_id, batch_id, profile_id, task_id, status, assigned_order, assigned_at, completed_at")
      .eq("task_id", assignmentId)
      .in("batch_id", batchIds)
      .order("assigned_order", { ascending: true });
    if (assignmentError) throw assignmentError;

    const assignments = (assignmentRows ?? []) as AssignmentRow[];
    if (assignments.length === 0) {
      return NextResponse.json({ error: "You are not allowed to view this assignment." }, { status: 403 });
    }

    const profileIds = [...new Set(assignments.map((row) => row.profile_id))];
    const ownerIds = [...new Set(visibleBatches.map((batch) => batch.created_by).filter(Boolean))];
    const [{ data: studentRows, error: studentError }, submissionRows, { data: ownerRows, error: ownerError }] = await Promise.all([
      supabaseAdmin
        .from("mst_profiles")
        .select("profile_id, display_name, participant_code")
        .in("profile_id", profileIds),
      getSubmissions(assignmentId, profileIds),
      ownerIds.length
        ? supabaseAdmin
            .from("mst_profiles")
            .select("profile_id, display_name, participant_code")
            .in("profile_id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (studentError) throw studentError;
    if (ownerError) throw ownerError;

    const batchMap = new Map(visibleBatches.map((batch) => [batch.batch_id, batch]));
    const studentMap = new Map((studentRows ?? []).map((student) => [student.profile_id, student]));
    const ownerMap = new Map((ownerRows ?? []).map((owner) => [owner.profile_id, owner]));
    const firstBatch = visibleBatches.find((batch) => assignments.some((row) => row.batch_id === batch.batch_id));
    const submissions = submissionRows.filter((row) => !row.batch_id || batchIds.includes(row.batch_id));
    const submissionKeys = new Set(
      submissions.map((row) => row.batch_id
        ? `${row.batch_id}:${row.profile_id}:${row.task_id}`
        : `${row.profile_id}:${row.task_id}`),
    );

    return NextResponse.json({
      assignment: {
        ...task,
        owner: firstBatch?.created_by ? ownerMap.get(firstBatch.created_by) ?? null : null,
        assigned_students_count: profileIds.length,
        submissions_count: submissions.length,
        pending_count: assignments.filter((row) => {
          const batchKey = `${row.batch_id}:${row.profile_id}:${row.task_id}`;
          const taskKey = `${row.profile_id}:${row.task_id}`;
          return !submissionKeys.has(batchKey) && !submissionKeys.has(taskKey);
        }).length,
      },
      assigned_students: assignments.map((row) => ({
        ...row,
        batch: batchMap.get(row.batch_id) ?? null,
        student: studentMap.get(row.profile_id) ?? null,
      })),
      submissions: submissions.map((row) => ({
        ...row,
        student: studentMap.get(row.profile_id) ?? null,
        batch: batchMap.get(row.batch_id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Teacher assignment detail API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load assignment detail." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const { assignmentId } = await params;
    const profile = await requireTeacherOrAdmin(request);
    const batches = (await getBatches()).filter(isAssignmentBatch);
    const visibleBatches = profile.role === "admin"
      ? batches
      : batches.filter((batch) => batch.created_by === profile.profile_id);
    const batchIds = visibleBatches.map((batch) => batch.batch_id);

    if (batchIds.length === 0) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("assignment_id")
      .eq("task_id", assignmentId)
      .in("batch_id", batchIds)
      .limit(1);
    if (assignmentError) throw assignmentError;
    if (!assignmentRows?.length) {
      return NextResponse.json({ error: "You are not allowed to update this assignment." }, { status: 403 });
    }

    const body = await request.json();
    const makeActive = body.status === "active";
    const { error } = await supabaseAdmin
      .from("mst_tasks")
      .update({
        task_status: makeActive ? "published" : "archived",
        is_active: makeActive,
        updated_at: new Date().toISOString(),
      })
      .eq("task_id", assignmentId);
    if (error) throw error;

    return NextResponse.json({ ok: true, status: makeActive ? "published" : "archived" });
  } catch (error) {
    console.error("Teacher assignment update API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update assignment." },
      { status: 400 },
    );
  }
}
