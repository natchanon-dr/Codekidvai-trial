import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ classId: string }>;
};

type ClassStudentRow = {
  profile_id: string;
};

type AssignmentRow = {
  batch_id: string;
  profile_id: string;
  task_id: string;
  assigned_order: number;
  assigned_group: string | null;
  is_required: boolean | null;
  is_unlocked: boolean | null;
  status: string | null;
};

type SetBody = {
  batch_id?: string;
  family?: "assignment" | "lab" | "exam";
};

type BatchFamily = "assignment" | "lab" | "exam";

async function requireOwnedClass(classId: string, profileId: string, role: string) {
  let query = supabaseAdmin
    .from("tb_classes")
    .select("class_id, teacher_profile_id")
    .eq("class_id", classId);
  if (role !== "admin") {
    query = query.eq("teacher_profile_id", profileId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Class not found.");
}

async function requireVisibleSet(batchId: string, profileId: string, role: string, expectedFamily?: BatchFamily) {
  let query = supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code, batch_name, batch_type, set_type_id, created_by")
    .eq("batch_id", batchId);
  if (role !== "admin") {
    query = query.eq("created_by", profileId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Set not found.");

  const family = getBatchFamily(data);
  if (expectedFamily && family !== expectedFamily) throw new Error(`Only ${expectedFamily} sets can be added here.`);
  return family;
}

function getBatchFamily(batch: { batch_type: string | null; batch_code: string | null; set_type_id?: number | null }): BatchFamily {
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SX") || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("X") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

async function getActiveClassStudents(classId: string) {
  const { data, error } = await supabaseAdmin
    .from("tb_class_students")
    .select("profile_id")
    .eq("class_id", classId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as ClassStudentRow[];
}

async function getAssignmentTemplate(batchId: string) {
  const { data, error } = await supabaseAdmin
    .from("trn_task_assignments")
    .select("batch_id, profile_id, task_id, assigned_order, assigned_group, is_required, is_unlocked, status")
    .eq("batch_id", batchId)
    .order("assigned_order", { ascending: true });
  if (error) throw error;

  const byTask = new Map<string, AssignmentRow>();
  for (const row of (data ?? []) as AssignmentRow[]) {
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, row);
  }
  return [...byTask.values()].sort((a, b) => Number(a.assigned_order) - Number(b.assigned_order));
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { classId } = await context.params;
    const body = (await request.json()) as SetBody;
    const batchId = String(body.batch_id ?? "").trim();
    const family = body.family;
    if (!batchId) throw new Error("Set is required.");

    await requireOwnedClass(classId, profile.profile_id, profile.role);
    await requireVisibleSet(batchId, profile.profile_id, profile.role, family);

    const [students, templateRows] = await Promise.all([
      getActiveClassStudents(classId),
      getAssignmentTemplate(batchId),
    ]);
    if (students.length === 0) throw new Error("This class has no active students.");
    if (templateRows.length === 0) throw new Error("This set has no assignments.");

    const now = new Date().toISOString();
    const insertRows = students.flatMap((student) => templateRows.map((template) => ({
      batch_id: batchId,
      profile_id: student.profile_id,
      task_id: template.task_id,
      assigned_order: Number(template.assigned_order),
      assigned_group: template.assigned_group,
      is_required: template.is_required ?? true,
      is_unlocked: template.is_unlocked ?? true,
      status: "assigned",
      assigned_at: now,
    })));

    const { error } = await supabaseAdmin
      .from("trn_task_assignments")
      .upsert(insertRows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: true });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      added_students: students.length,
      added_assignments: templateRows.length,
    });
  } catch (error) {
    console.error("Teacher class set add API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add assignment set to class." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { classId } = await context.params;
    const batchId = String(request.nextUrl.searchParams.get("batch_id") ?? "").trim();
    const family = request.nextUrl.searchParams.get("family") as BatchFamily | null;
    if (!batchId) throw new Error("Set is required.");

    await requireOwnedClass(classId, profile.profile_id, profile.role);
    await requireVisibleSet(batchId, profile.profile_id, profile.role, family ?? undefined);
    const students = await getActiveClassStudents(classId);
    const profileIds = students.map((student) => student.profile_id).filter(Boolean);
    if (profileIds.length === 0) return NextResponse.json({ ok: true, removed_students: 0 });

    const { error } = await supabaseAdmin
      .from("trn_task_assignments")
      .delete()
      .eq("batch_id", batchId)
      .in("profile_id", profileIds);
    if (error) throw error;

    return NextResponse.json({ ok: true, removed_students: profileIds.length });
  } catch (error) {
    console.error("Teacher class set remove API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove assignment set from class." },
      { status: 400 },
    );
  }
}
