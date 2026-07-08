import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ classId: string }>;
};

type ClassStudentRow = { profile_id: string };
type AssignmentRow = {
  task_id: string;
  assigned_order: number;
  assigned_group: string | null;
  is_required: boolean | null;
  is_unlocked: boolean | null;
};
type BatchFamily = "assignment" | "lab" | "exam";
type SetBody = { batch_id?: string; family?: BatchFamily };

async function requireOwnedClass(classId: string, profileId: string, role: string) {
  let query = supabaseAdmin.from("tb_classes").select("class_id").eq("class_id", classId);
  if (role !== "admin") query = query.eq("teacher_profile_id", profileId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Class not found.");
}

async function requireVisibleSet(batchId: string, profileId: string, role: string) {
  let query = supabaseAdmin.from("mst_experiment_batches").select("batch_id, batch_code, batch_type, set_type_id").eq("batch_id", batchId);
  if (role !== "admin") query = query.eq("created_by", profileId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Set not found.");
}

async function getActiveClassStudents(classId: string): Promise<ClassStudentRow[]> {
  const { data, error } = await supabaseAdmin.from("tb_class_students").select("profile_id").eq("class_id", classId).eq("status", "active");
  if (error) throw error;
  return (data ?? []) as ClassStudentRow[];
}

async function getAssignmentTemplate(batchId: string): Promise<AssignmentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trn_task_assignments")
    .select("task_id, assigned_order, assigned_group, is_required, is_unlocked")
    .eq("batch_id", batchId)
    .order("assigned_order", { ascending: true });
  if (error) throw error;
  const byTask = new Map<string, AssignmentRow>();
  for (const row of (data ?? []) as AssignmentRow[]) {
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, row);
  }
  return [...byTask.values()].sort((a, b) => Number(a.assigned_order) - Number(b.assigned_order));
}

async function assignSetToStudents(classId: string, batchId: string, students: ClassStudentRow[], templateRows: AssignmentRow[]) {
  if (students.length === 0 || templateRows.length === 0) return;
  const now = new Date().toISOString();
  const insertRows = students.flatMap(student => templateRows.map(t => ({
    batch_id: batchId,
    profile_id: student.profile_id,
    task_id: t.task_id,
    assigned_order: Number(t.assigned_order),
    assigned_group: t.assigned_group,
    is_required: t.is_required ?? true,
    is_unlocked: t.is_unlocked ?? true,
    status: "assigned",
    assigned_at: now,
  })));
  const { error } = await supabaseAdmin.from("trn_task_assignments").upsert(insertRows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: true });
  if (error) throw error;
}

// ── POST: link a set to a class (+ assign to existing students) ───────────────
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { classId } = await context.params;
    const body = (await request.json()) as SetBody;
    const batchId = String(body.batch_id ?? "").trim();
    const family = body.family ?? "assignment";
    if (!batchId) throw new Error("Set is required.");

    await requireOwnedClass(classId, profile.profile_id, profile.role);
    await requireVisibleSet(batchId, profile.profile_id, profile.role);

    // 1. Link set to class in tb_class_sets
    const { error: linkError } = await supabaseAdmin
      .from("tb_class_sets")
      .upsert({ class_id: classId, batch_id: batchId, family }, { onConflict: "class_id,batch_id", ignoreDuplicates: true });
    if (linkError) throw linkError;

    // 2. Assign to any students already in the class
    const [students, templateRows] = await Promise.all([
      getActiveClassStudents(classId),
      getAssignmentTemplate(batchId),
    ]);
    await assignSetToStudents(classId, batchId, students, templateRows);

    return NextResponse.json({ ok: true, assigned_students: students.length });
  } catch (error) {
    console.error("Teacher class set add API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add set." }, { status: 400 });
  }
}

// ── DELETE: unlink a set from a class (+ remove assignments) ─────────────────
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { classId } = await context.params;
    const batchId = String(request.nextUrl.searchParams.get("batch_id") ?? "").trim();
    if (!batchId) throw new Error("Set is required.");

    await requireOwnedClass(classId, profile.profile_id, profile.role);

    // 1. Remove from tb_class_sets
    const { error: unlinkError } = await supabaseAdmin.from("tb_class_sets").delete().eq("class_id", classId).eq("batch_id", batchId);
    if (unlinkError) throw unlinkError;

    // 2. Remove task assignments for all students in this class
    const students = await getActiveClassStudents(classId);
    const profileIds = students.map(s => s.profile_id).filter(Boolean);
    if (profileIds.length > 0) {
      const { error: delError } = await supabaseAdmin.from("trn_task_assignments").delete().eq("batch_id", batchId).in("profile_id", profileIds);
      if (delError) throw delError;
    }

    return NextResponse.json({ ok: true, removed_students: profileIds.length });
  } catch (error) {
    console.error("Teacher class set remove API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove set." }, { status: 400 });
  }
}
