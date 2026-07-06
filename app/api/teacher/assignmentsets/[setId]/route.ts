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

type UpdateSetBody = {
  batch_name?: string;
  batch_description?: string;
  status?: string;
  assignments?: Array<{
    task_id?: string;
    assigned_order?: number;
  }>;
};

function isAssignmentSet(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("SA") ||
    batch.batch_code?.startsWith("A")
  );
}

function isManagedSet(batch: BatchRow) {
  return (
    isAssignmentSet(batch) ||
    batch.set_type_id === 2 ||
    batch.batch_type === "exam_set" ||
    batch.batch_type === "lab_set" ||
    batch.batch_code?.startsWith("SE") ||
    batch.batch_code?.startsWith("SL") ||
    batch.batch_code?.startsWith("E") ||
    batch.batch_code?.startsWith("L")
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
    if (!set || !isManagedSet(set)) {
      return NextResponse.json({ error: "Set not found." }, { status: 404 });
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
    if (!set || !isManagedSet(set)) {
      return NextResponse.json({ error: "Set not found." }, { status: 404 });
    }
    if (profile.role !== "admin" && set.created_by !== profile.profile_id) {
      return NextResponse.json({ error: "You are not allowed to update this assignment set." }, { status: 403 });
    }

    const body = (await request.json()) as UpdateSetBody;
    const updates: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (body.status) updates.status = body.status === "active" ? "active" : "archived";
    if (typeof body.batch_name === "string") {
      const name = body.batch_name.trim();
      if (!name) throw new Error("Assignment set name is required.");
      updates.batch_name = name;
    }
    if (typeof body.batch_description === "string") {
      updates.batch_description = body.batch_description.trim() || null;
    }

    const { error } = await supabaseAdmin
      .from("mst_experiment_batches")
      .update(updates)
      .eq("batch_id", setId);
    if (error) throw error;

    if (Array.isArray(body.assignments)) {
      const taskIds = [...new Set(body.assignments.map((item) => String(item.task_id ?? "").trim()).filter(Boolean))];
      const orderByTaskId = new Map(taskIds.map((taskId, index) => [taskId, index + 1]));
      for (const item of body.assignments) {
        const taskId = String(item.task_id ?? "").trim();
        if (!taskId) continue;
        orderByTaskId.set(taskId, Math.max(1, Number(item.assigned_order ?? orderByTaskId.get(taskId) ?? 1)));
      }

      const { data: existingRows, error: existingError } = await supabaseAdmin
        .from("trn_task_assignments")
        .select("profile_id")
        .eq("batch_id", setId);
      if (existingError) throw existingError;

      const profileIds = [...new Set((existingRows ?? []).map((row) => row.profile_id).filter(Boolean))];
      if (profileIds.length === 0 && set.created_by) profileIds.push(set.created_by);

      let deleteQuery = supabaseAdmin.from("trn_task_assignments").delete().eq("batch_id", setId);
      if (taskIds.length > 0) deleteQuery = deleteQuery.not("task_id", "in", `(${taskIds.join(",")})`);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      if (taskIds.length > 0 && profileIds.length > 0) {
        const now = new Date().toISOString();
        const rows = profileIds.flatMap((profileId) => taskIds.map((taskId) => ({
          batch_id: setId,
          profile_id: profileId,
          task_id: taskId,
          assigned_order: orderByTaskId.get(taskId) ?? 1,
          assigned_group: null,
          is_required: true,
          is_unlocked: true,
          status: "assigned",
          assigned_at: now,
        })));
        const { error: upsertError } = await supabaseAdmin
          .from("trn_task_assignments")
          .upsert(rows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: false });
        if (upsertError) throw upsertError;
      }
    }

    return NextResponse.json({ ok: true, updates });
  } catch (error) {
    console.error("Teacher assignment set update API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update assignment set." },
      { status: 400 },
    );
  }
}
