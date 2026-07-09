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

type BatchMeta = { batch_id: string; batch_code: string | null; batch_type: string | null; set_type_id: number | null };

function deriveBatchFamily(batch: BatchMeta): BatchFamily {
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SX") || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("X") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || (batch.batch_code?.startsWith("L") && !batch.batch_code?.startsWith("LA"))) return "lab";
  return "assignment";
}

async function requireVisibleSet(batchId: string, profileId: string, role: string): Promise<BatchMeta> {
  let query = supabaseAdmin.from("mst_experiment_batches").select("batch_id, batch_code, batch_type, set_type_id").eq("batch_id", batchId);
  if (role !== "admin") query = query.eq("created_by", profileId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Set not found.");
  return data as BatchMeta;
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
    const batchMeta = await requireVisibleSet(batchId, profile.profile_id, profile.role);

    // Validate that submitted family matches the batch's actual type
    const actualFamily = deriveBatchFamily(batchMeta);
    if (actualFamily !== family) {
      throw new Error(`Set family mismatch: this set is "${actualFamily}", not "${family}".`);
    }

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

    // Unlink from tb_class_sets only — preserve trn_task_assignments and submission history
    const { error: unlinkError } = await supabaseAdmin.from("tb_class_sets").delete().eq("class_id", classId).eq("batch_id", batchId);
    if (unlinkError) throw unlinkError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Teacher class set remove API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove set." }, { status: 400 });
  }
}
