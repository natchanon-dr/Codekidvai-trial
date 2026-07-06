import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type BatchRow = {
  batch_id: string;
  batch_code: string | null;
  batch_type: string | null;
  status: string | null;
  created_by: string | null;
  set_type_id?: number | null;
};

type ClassRow = { class_id: string };
type ClassStudentRow = { profile_id: string };

function isAssignmentBatch(batch: BatchRow) {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("SA") ||
    batch.batch_code?.startsWith("A")
  );
}

function isExamBatch(batch: BatchRow) {
  return (
    batch.set_type_id === 2 ||
    batch.batch_type === "exam_set" ||
    batch.batch_code?.startsWith("SE") ||
    batch.batch_code?.startsWith("E")
  );
}

async function getBatches() {
  const first = await supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code, batch_type, status, created_by, set_type_id");
  if (!first.error) return (first.data ?? []) as BatchRow[];

  const fallback = await supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code, batch_type, status, created_by");
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as BatchRow[];
}

async function getActiveClasses(profileId: string, role: string): Promise<ClassRow[]> {
  let query = supabaseAdmin
    .from("tb_classes")
    .select("class_id")
    .eq("is_active", true);

  if (role !== "admin") {
    query = query.eq("teacher_profile_id", profileId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return [];
    throw error;
  }
  return (data ?? []) as ClassRow[];
}

async function getActiveClassStudents(classIds: string[]): Promise<ClassStudentRow[]> {
  if (classIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("tb_class_students")
    .select("profile_id")
    .in("class_id", classIds)
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
    const batches = await getBatches();
    const visibleBatches = profile.role === "admin"
      ? batches
      : batches.filter((batch) => batch.created_by === profile.profile_id);
    const assignmentSets = visibleBatches.filter(isAssignmentBatch);
    const examSets = visibleBatches.filter(isExamBatch);
    const activeClasses = await getActiveClasses(profile.profile_id, profile.role);
    const classStudents = await getActiveClassStudents(activeClasses.map((row) => row.class_id));
    const uniqueStudentIds = new Set(classStudents.map((row) => row.profile_id).filter(Boolean));

    return NextResponse.json({
      profile,
      summary: {
        assignment_sets: assignmentSets.length,
        exam_sets: examSets.length,
        assigned_classes: activeClasses.length,
        assigned_students: uniqueStudentIds.size,
      },
    });
  } catch (error) {
    console.error("Teacher dashboard API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load teacher dashboard." },
      { status: 400 },
    );
  }
}
