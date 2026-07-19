import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type BatchRow = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  batch_description: string | null;
  batch_type: string | null;
  status: string | null;
  created_by: string | null;
  created_at: string | null;
  set_type_id?: number | null;
};

type AssignmentRow = {
  assignment_id: string;
  batch_id: string;
  profile_id: string;
  task_id: string;
  status: string | null;
};

type TaskRow = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  task_description: string | null;
  task_type: string | null;
  difficulty_level: string | null;
  max_score: number | null;
  task_status: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type SubmissionRow = {
  submission_id: string;
  profile_id: string;
  task_id: string;
  batch_id?: string | null;
  submitted_at?: string | null;
};

type CreateAssignmentBody = {
  family?: "assignment" | "lab" | "exam";
  task_code?: string;
  task_title?: string;
  task_description?: string;
  task_type?: string;
  problem_statement?: string;
  expected_answer?: string;
  max_score?: number;
};

function isAssignmentBatch(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("SA") ||
    batch.batch_code?.startsWith("A")
  );
}

function getBatchFamily(batch: BatchRow): "assignment" | "lab" | "exam" {
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SX") || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("X") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

function getTaskPrefixes(family: string) {
  if (family === "lab") return ["LQT", "LQB", "LER", "LSP"];
  if (family === "exam") return ["XQT", "XQB", "XER", "XSP"];
  return ["AQT", "AQB", "AER", "ASP"];
}

async function getBatches() {
  const fullSelect = "batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at, set_type_id";
  const baseSelect = "batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at";
  const first = await supabaseAdmin.from("mst_experiment_batches").select(fullSelect);
  if (!first.error) return (first.data ?? []) as BatchRow[];

  const fallback = await supabaseAdmin.from("mst_experiment_batches").select(baseSelect);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as BatchRow[];
}

async function getSubmissions(taskIds: string[]): Promise<SubmissionRow[]> {
  if (taskIds.length === 0) return [];

  const withBatch = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, task_id, batch_id, submitted_at")
    .in("task_id", taskIds);
  if (!withBatch.error) return (withBatch.data ?? []) as SubmissionRow[];

  const withoutBatch = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, task_id, submitted_at")
    .in("task_id", taskIds);
  if (withoutBatch.error) throw withoutBatch.error;
  return (withoutBatch.data ?? []) as SubmissionRow[];
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const scope = request.nextUrl.searchParams.get("scope");
    const family = request.nextUrl.searchParams.get("family") ?? "assignment";
    const batches = (await getBatches()).filter((batch) => {
      if (family === "lab" || family === "exam") return getBatchFamily(batch) === family;
      return isAssignmentBatch(batch);
    });
    const visibleBatches = scope === "all" || profile.role === "admin"
      ? batches
      : batches.filter((batch) => batch.created_by === profile.profile_id);
    const batchIds = visibleBatches.map((batch) => batch.batch_id);
    const { data: assignmentRows, error: assignmentError } = batchIds.length
      ? await supabaseAdmin
          .from("trn_task_assignments")
          .select("assignment_id, batch_id, profile_id, task_id, status")
          .in("batch_id", batchIds)
      : { data: [], error: null };
    if (assignmentError) throw assignmentError;

    const assignments = (assignmentRows ?? []) as AssignmentRow[];
    const taskIds = [...new Set(assignments.map((row) => row.task_id))];
    const ownerIds = [...new Set(visibleBatches.map((batch) => batch.created_by).filter(Boolean))];

    const [{ data: taskRows, error: taskError }, submissionRows, { data: ownerRows, error: ownerError }] = await Promise.all([
      supabaseAdmin
        .from("mst_tasks")
        .select("task_id, task_code, task_title, task_description, task_type, difficulty_level, max_score, task_status, is_active, created_at")
        .order("created_at", { ascending: false }),
      getSubmissions(taskIds),
      ownerIds.length
        ? supabaseAdmin
            .from("mst_profiles")
            .select("profile_id, display_name, participant_code")
            .in("profile_id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (taskError) throw taskError;
    if (ownerError) throw ownerError;

    const batchMap = new Map(visibleBatches.map((batch) => [batch.batch_id, batch]));
    const ownerMap = new Map((ownerRows ?? []).map((owner) => [owner.profile_id, owner]));
    const submissions = submissionRows.filter((row) => !row.batch_id || batchIds.includes(row.batch_id));
    const taskPrefixes = getTaskPrefixes(family);
    const items = ((taskRows ?? []) as TaskRow[])
      .filter((task) => taskIds.includes(task.task_id) || taskPrefixes.some((prefix) => task.task_code?.startsWith(prefix)))
      .map((task) => {
        const taskAssignments = assignments.filter((row) => row.task_id === task.task_id);
        const taskBatchIds = [...new Set(taskAssignments.map((row) => row.batch_id))];
        const firstBatch = taskBatchIds.map((batchId) => batchMap.get(batchId)).find(Boolean);
        const assignedStudentIds = [...new Set(taskAssignments.map((row) => row.profile_id))];
        const taskSubmissions = submissions.filter((row) => row.task_id === task.task_id);
        return {
          assignment_id: task.task_id,
          task_id: task.task_id,
          task_code: task.task_code,
          title: task.task_title,
          description: task.task_description,
          task_type: task.task_type,
          difficulty_level: task.difficulty_level,
          max_score: task.max_score,
          status: task.task_status,
          is_active: task.is_active,
          created_at: task.created_at,
          assigned_students_count: assignedStudentIds.length,
          submissions_count: taskSubmissions.length,
          batches: taskBatchIds.map((batchId) => batchMap.get(batchId)).filter(Boolean),
          owner: firstBatch?.created_by ? ownerMap.get(firstBatch.created_by) ?? null : null,
        };
      })
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

    return NextResponse.json({ assignments: items });
  } catch (error) {
    console.error("Teacher assignments API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load teacher assignments." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTeacherOrAdmin(request);
    const body = (await request.json()) as CreateAssignmentBody;
    const family = body.family ?? "assignment";
    const taskCode = String(body.task_code ?? "").trim();
    const taskTitle = String(body.task_title ?? "").trim();
    const taskType = String(body.task_type ?? "sql_text").trim();
    const problemStatement = String(body.problem_statement ?? "").trim();
    const expectedAnswer = String(body.expected_answer ?? "").trim();

    if (!taskCode) throw new Error("Assignment code is required.");
    if (!taskTitle) throw new Error("Assignment name is required.");

    const insert = await supabaseAdmin
      .from("mst_tasks")
      .insert({
        task_code: taskCode,
        task_title: taskTitle,
        task_description: String(body.task_description ?? problemStatement).trim() || null,
        task_type: taskType,
        problem_statement: problemStatement || null,
        expected_answer: expectedAnswer || null,
        expected_sql: expectedAnswer || null,
        max_score: Number(body.max_score ?? (family === "lab" ? 0 : 10)),
        task_status: "published",
        is_active: true,
      })
      .select("task_id, task_code, task_title, task_type")
      .single();
    if (insert.error) throw insert.error;

    return NextResponse.json({ assignment: insert.data }, { status: 201 });
  } catch (error) {
    console.error("Teacher assignment create API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create assignment." },
      { status: 400 },
    );
  }
}
