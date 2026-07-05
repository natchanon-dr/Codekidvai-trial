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
  assigned_order: number | null;
};

function isAssignmentSet(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("A")
  );
}

async function getBatch(setId: string) {
  const fullSelect = "batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at, set_type_id";
  const baseSelect = "batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at";
  const first = await supabaseAdmin.from("mst_experiment_batches").select(fullSelect).eq("batch_id", setId).maybeSingle();
  if (!first.error) return first.data as BatchRow | null;

  const fallback = await supabaseAdmin.from("mst_experiment_batches").select(baseSelect).eq("batch_id", setId).maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data as BatchRow | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> },
) {
  try {
    const { setId } = await params;
    const profile = await requireTeacherOrAdmin(request);
    const set = await getBatch(setId);
    if (!set || !isAssignmentSet(set)) {
      return NextResponse.json({ error: "Assignment set not found." }, { status: 404 });
    }
    if (profile.role !== "admin" && set.created_by !== profile.profile_id) {
      return NextResponse.json({ error: "You are not allowed to view this assignment set." }, { status: 403 });
    }

    const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("assignment_id, batch_id, profile_id, task_id, status, assigned_order")
      .eq("batch_id", setId)
      .order("assigned_order", { ascending: true });
    if (assignmentError) throw assignmentError;

    const assignments = (assignmentRows ?? []) as AssignmentRow[];
    const taskIds = [...new Set(assignments.map((row) => row.task_id))];
    const profileIds = [...new Set(assignments.map((row) => row.profile_id))];
    const ownerIds = set.created_by ? [set.created_by] : [];

    const [{ data: taskRows, error: taskError }, { data: studentRows, error: studentError }, { data: ownerRows, error: ownerError }] = await Promise.all([
      taskIds.length
        ? supabaseAdmin
            .from("mst_tasks")
            .select("task_id, task_code, task_title, task_description, task_status, is_active, difficulty_level, max_score")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? supabaseAdmin
            .from("mst_profiles")
            .select("profile_id, display_name, participant_code")
            .in("profile_id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length
        ? supabaseAdmin
            .from("mst_profiles")
            .select("profile_id, display_name, participant_code")
            .in("profile_id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (taskError) throw taskError;
    if (studentError) throw studentError;
    if (ownerError) throw ownerError;

    const taskMap = new Map((taskRows ?? []).map((task) => [task.task_id, task]));
    const studentMap = new Map((studentRows ?? []).map((student) => [student.profile_id, student]));

    return NextResponse.json({
      assignment_set: {
        ...set,
        owner: ownerRows?.[0] ?? null,
        task_count: taskIds.length,
        assigned_students_count: profileIds.length,
      },
      assignments: assignments.map((row) => ({
        ...row,
        task: taskMap.get(row.task_id) ?? null,
        student: studentMap.get(row.profile_id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Teacher assignment set detail API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load assignment set." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> },
) {
  try {
    const { setId } = await params;
    const profile = await requireTeacherOrAdmin(request);
    const set = await getBatch(setId);
    if (!set || !isAssignmentSet(set)) {
      return NextResponse.json({ error: "Assignment set not found." }, { status: 404 });
    }
    if (profile.role !== "admin" && set.created_by !== profile.profile_id) {
      return NextResponse.json({ error: "You are not allowed to update this assignment set." }, { status: 403 });
    }

    const body = await request.json();
    const status = body.status === "active" ? "active" : "archived";
    const { error } = await supabaseAdmin
      .from("mst_experiment_batches")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("batch_id", setId);
    if (error) throw error;

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("Teacher assignment set update API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update assignment set." },
      { status: 400 },
    );
  }
}
