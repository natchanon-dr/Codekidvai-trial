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
  updated_at: string | null;
  set_type_id?: number | null;
};

type AssignmentRow = {
  assignment_id: string;
  batch_id: string;
  profile_id: string;
  task_id: string;
  status: string | null;
};

type ClassStudentRow = {
  class_id: string;
  profile_id: string;
};

type ClassRow = {
  class_id: string;
  class_code: string;
  class_name: string;
};

type CreateSetBody = {
  family?: "assignment" | "lab" | "exam";
  batch_code?: string;
  batch_name?: string;
  batch_description?: string;
  status?: string;
  selected_task_ids?: string[];
};

function isAssignmentSet(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("SA") ||
    batch.batch_code?.startsWith("A")
  );
}

function getBatchFamily(batch: BatchRow): "assignment" | "lab" | "exam" {
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

async function getBatches() {
  const fullSelect = "batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at, updated_at, set_type_id";
  const baseSelect = "batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at, updated_at";
  const first = await supabaseAdmin.from("mst_experiment_batches").select(fullSelect);
  if (!first.error) return (first.data ?? []) as BatchRow[];

  const fallback = await supabaseAdmin.from("mst_experiment_batches").select(baseSelect);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as BatchRow[];
}

async function getClassStudents(profileIds: string[]): Promise<ClassStudentRow[]> {
  if (profileIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("tb_class_students")
    .select("class_id, profile_id")
    .in("profile_id", profileIds)
    .eq("status", "active");

  if (error) {
    if (error.code === "42P01" || error.code === "42703") return [];
    throw error;
  }
  return (data ?? []) as ClassStudentRow[];
}

async function insertAssignmentSet(body: CreateSetBody, profileId: string) {
  const batchCode = String(body.batch_code ?? "").trim();
  const batchName = String(body.batch_name ?? "").trim();
  const batchDescription = String(body.batch_description ?? "").trim();
  const status = body.status === "draft" ? "draft" : "active";
  const family = body.family ?? "assignment";

  if (!batchCode) throw new Error("Set code is required.");
  if (!batchName) throw new Error("Set name is required.");

  const fullPayload = {
    batch_code: batchCode,
    batch_name: batchName,
    batch_description: batchDescription || null,
    batch_type: family === "assignment" ? "assignment_set" : family === "exam" ? "exam_set" : "lab_set",
    status,
    created_by: profileId,
    set_type_id: family === "assignment" ? 1 : family === "exam" ? 2 : null,
    updated_at: new Date().toISOString(),
  };

  const fullInsert = await supabaseAdmin
    .from("mst_experiment_batches")
    .insert(fullPayload)
    .select("batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at, updated_at, set_type_id")
    .single();
  if (!fullInsert.error) return fullInsert.data;

  const fallbackInsert = await supabaseAdmin
    .from("mst_experiment_batches")
    .insert({
      batch_code: batchCode,
      batch_name: batchName,
      batch_description: batchDescription || null,
      batch_type: family === "assignment" ? "assignment_set" : "practice",
      status,
      created_by: profileId,
      updated_at: new Date().toISOString(),
    })
    .select("batch_id, batch_code, batch_name, batch_description, batch_type, status, created_by, created_at, updated_at")
    .single();
  if (fallbackInsert.error) throw fallbackInsert.error;
  return fallbackInsert.data;
}

async function insertSetTemplateRows(batchId: string, profileId: string, taskIds: string[]) {
  const uniqueTaskIds = [...new Set(taskIds.map((taskId) => String(taskId ?? "").trim()).filter(Boolean))];
  if (uniqueTaskIds.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = uniqueTaskIds.map((taskId, index) => ({
    batch_id: batchId,
    profile_id: profileId,
    task_id: taskId,
    assigned_order: index + 1,
    assigned_group: null,
    is_required: true,
    is_unlocked: true,
    status: "assigned",
    assigned_at: now,
  }));

  const { error } = await supabaseAdmin
    .from("trn_task_assignments")
    .upsert(rows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: true });
  if (error) throw error;
  return uniqueTaskIds.length;
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const scope = request.nextUrl.searchParams.get("scope");
    const family = request.nextUrl.searchParams.get("family") ?? "assignment";
    const allAssignmentSets = (await getBatches()).filter((batch) => {
      if (family === "lab" || family === "exam") return getBatchFamily(batch) === family;
      return isAssignmentSet(batch);
    });
    const visibleSets = scope === "all" || profile.role === "admin"
      ? allAssignmentSets
      : allAssignmentSets.filter((set) => set.created_by === profile.profile_id);

    const setIds = visibleSets.map((set) => set.batch_id);
    const ownerIds = [...new Set(visibleSets.map((set) => set.created_by).filter(Boolean))];

    const [{ data: assignmentRows, error: assignmentError }, { data: ownerRows, error: ownerError }] = await Promise.all([
      setIds.length
        ? supabaseAdmin
            .from("trn_task_assignments")
            .select("assignment_id, batch_id, profile_id, task_id, status")
            .in("batch_id", setIds)
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length
        ? supabaseAdmin
            .from("mst_profiles")
            .select("profile_id, display_name, participant_code")
            .in("profile_id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (assignmentError) throw assignmentError;
    if (ownerError) throw ownerError;

    const assignments = (assignmentRows ?? []) as AssignmentRow[];
    const allAssignedProfileIds = [...new Set(assignments.map((row) => row.profile_id).filter(Boolean))];
    const classStudents = await getClassStudents(allAssignedProfileIds);
    const classIds = [...new Set(classStudents.map((row) => row.class_id).filter(Boolean))];
    const { data: classRows, error: classError } = classIds.length
      ? await supabaseAdmin
          .from("tb_classes")
          .select("class_id, class_code, class_name")
          .in("class_id", classIds)
      : { data: [], error: null };
    if (classError) throw classError;

    const ownerMap = new Map((ownerRows ?? []).map((owner) => [owner.profile_id, owner]));
    const classMap = new Map(((classRows ?? []) as ClassRow[]).map((row) => [row.class_id, row]));
    const items = visibleSets
      .map((set) => {
        const rows = assignments.filter((row) => row.batch_id === set.batch_id);
        const profileIds = new Set(rows.map((row) => row.profile_id));
        const assignedClasses = [
          ...new Set(
            classStudents
              .filter((row) => profileIds.has(row.profile_id))
              .map((row) => row.class_id),
          ),
        ]
          .map((classId) => classMap.get(classId))
          .filter(Boolean)
          .sort((a, b) => String(a?.class_code ?? "").localeCompare(String(b?.class_code ?? "")));
        return {
          ...set,
          owner: set.created_by ? ownerMap.get(set.created_by) ?? null : null,
          task_count: new Set(rows.map((row) => row.task_id)).size,
          assigned_classes_count: assignedClasses.length,
          assigned_classes: assignedClasses,
        };
      })
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

    return NextResponse.json({ assignment_sets: items });
  } catch (error) {
    console.error("Teacher assignment sets API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load assignment sets." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const body = (await request.json()) as CreateSetBody;
    const set = await insertAssignmentSet(body, profile.profile_id);
    const taskCount = await insertSetTemplateRows(set.batch_id, profile.profile_id, body.selected_task_ids ?? []);

    return NextResponse.json(
      { assignment_set: { ...set, owner: null, task_count: taskCount, assigned_classes_count: 0 } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Teacher assignment set create API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create assignment set." },
      { status: 400 },
    );
  }
}
