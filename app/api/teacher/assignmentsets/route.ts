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

function isAssignmentSet(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("A")
  );
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

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const scope = request.nextUrl.searchParams.get("scope");
    const allAssignmentSets = (await getBatches()).filter(isAssignmentSet);
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
    const ownerMap = new Map((ownerRows ?? []).map((owner) => [owner.profile_id, owner]));
    const items = visibleSets
      .map((set) => {
        const rows = assignments.filter((row) => row.batch_id === set.batch_id);
        const profileIds = new Set(rows.map((row) => row.profile_id));
        const classCount = new Set(
          classStudents
            .filter((row) => profileIds.has(row.profile_id))
            .map((row) => row.class_id),
        ).size;
        return {
          ...set,
          owner: set.created_by ? ownerMap.get(set.created_by) ?? null : null,
          task_count: new Set(rows.map((row) => row.task_id)).size,
          assigned_classes_count: classCount,
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
