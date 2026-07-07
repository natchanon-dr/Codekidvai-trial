import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ClassRow = {
  class_id: string;
  academy_id: string | null;
  teacher_profile_id: string;
  class_code: string;
  class_name: string;
  class_level: string | null;
  class_section: string | null;
  academic_year: string | null;
  term: string | null;
  enrollment_code: string | null;
  is_open_for_enrollment: boolean;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type ClassStudentRow = {
  class_id: string;
  profile_id?: string;
  status: string | null;
};

type AssignmentRow = {
  batch_id: string;
  profile_id: string;
};

type BatchRow = {
  batch_id: string;
  batch_type: string | null;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
  set_type_id?: number | null;
};

type ContentItem = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
};

type CreateClassBody = {
  class_code?: string;
  class_name?: string;
  class_level?: string;
  class_section?: string;
  academic_year?: string;
  term?: string;
  enrollment_code?: string;
  is_open_for_enrollment?: boolean;
  is_active?: boolean;
};

async function getDefaultAcademyId() {
  const existing = await supabaseAdmin
    .from("tb_academy")
    .select("academy_id")
    .eq("academy_code", "DEFAULT")
    .maybeSingle();
  if (!existing.error && existing.data?.academy_id) return existing.data.academy_id as string;

  const created = await supabaseAdmin
    .from("tb_academy")
    .insert({
      academy_code: "DEFAULT",
      academy_name: "Default Institution",
      academy_description: "Default institution for Phase 1 teacher and student flows.",
      is_active: true,
    })
    .select("academy_id")
    .single();
  if (created.error) throw created.error;
  return created.data.academy_id as string;
}

async function generateClassCode() {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `CLS${year}-`;
  const { data, error } = await supabaseAdmin
    .from("tb_classes")
    .select("class_code")
    .like("class_code", `${prefix}%`)
    .order("class_code", { ascending: false })
    .limit(1);
  if (error) throw error;

  const lastCode = data?.[0]?.class_code as string | undefined;
  const lastNumber = lastCode ? Number(lastCode.replace(prefix, "")) : 0;
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(6, "0")}`;
}

async function getClasses(profileId: string, role: string): Promise<ClassRow[]> {
  let query = supabaseAdmin
    .from("tb_classes")
    .select("class_id, academy_id, teacher_profile_id, class_code, class_name, class_level, class_section, academic_year, term, enrollment_code, is_open_for_enrollment, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

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

async function getStudentCounts(classIds: string[]) {
  if (classIds.length === 0) return new Map<string, number>();

  const { data, error } = await supabaseAdmin
    .from("tb_class_students")
    .select("class_id, status")
    .in("class_id", classIds);
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return new Map<string, number>();
    throw error;
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as ClassStudentRow[]) {
    if (row.status !== "active") continue;
    counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
  }
  return counts;
}

async function getClassContent(classIds: string[]) {
  const empty = new Map<string, {
    assignment_sets: ContentItem[];
    lab_sets: ContentItem[];
    exam_sets: ContentItem[];
  }>();
  if (classIds.length === 0) return empty;

  const { data: studentRows, error: studentError } = await supabaseAdmin
    .from("tb_class_students")
    .select("class_id, profile_id, status")
    .in("class_id", classIds)
    .eq("status", "active");
  if (studentError) {
    if (studentError.code === "42P01" || studentError.code === "42703") return empty;
    throw studentError;
  }

  const classStudents = (studentRows ?? []) as ClassStudentRow[];
  const profileIds = [...new Set(classStudents.map((row) => row.profile_id).filter(Boolean))] as string[];
  if (profileIds.length === 0) return empty;

  const [{ data: assignmentRows, error: assignmentError }, { data: batchRows, error: batchError }] = await Promise.all([
    supabaseAdmin
      .from("trn_task_assignments")
      .select("batch_id, profile_id")
      .in("profile_id", profileIds),
    supabaseAdmin
      .from("mst_experiment_batches")
      .select("batch_id, batch_code, batch_name, batch_type, status, set_type_id"),
  ]);
  if (assignmentError) throw assignmentError;
  if (batchError) throw batchError;

  const profileClassMap = new Map<string, string[]>();
  for (const row of classStudents) {
    if (!row.profile_id) continue;
    profileClassMap.set(row.profile_id, [...(profileClassMap.get(row.profile_id) ?? []), row.class_id]);
  }

  const batchMap = new Map(((batchRows ?? []) as BatchRow[]).map((row) => [row.batch_id, row]));
  const grouped = new Map<string, { assignment: Map<string, ContentItem>; lab: Map<string, ContentItem>; exam: Map<string, ContentItem> }>();
  for (const classId of classIds) {
    grouped.set(classId, { assignment: new Map(), lab: new Map(), exam: new Map() });
  }

  for (const assignment of (assignmentRows ?? []) as AssignmentRow[]) {
    const classIdsForProfile = profileClassMap.get(assignment.profile_id) ?? [];
    const batch = batchMap.get(assignment.batch_id);
    if (!batch) continue;
    const family = getBatchFamily(batch);
    const item = {
      batch_id: batch.batch_id,
      batch_code: batch.batch_code,
      batch_name: batch.batch_name,
      status: batch.status,
    };
    for (const classId of classIdsForProfile) {
      grouped.get(classId)?.[family].set(assignment.batch_id, item);
    }
  }

  return new Map([...grouped.entries()].map(([classId, counts]) => [
    classId,
    {
      assignment_sets: [...counts.assignment.values()].sort(compareContentItem),
      lab_sets: [...counts.lab.values()].sort(compareContentItem),
      exam_sets: [...counts.exam.values()].sort(compareContentItem),
    },
  ]));
}

function compareContentItem(a: ContentItem, b: ContentItem) {
  return String(a.batch_code ?? a.batch_name ?? "").localeCompare(String(b.batch_code ?? b.batch_name ?? ""));
}

function getBatchFamily(batch: BatchRow | undefined): "assignment" | "lab" | "exam" {
  if (!batch) return "assignment";
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SX") || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("X") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const classes = await getClasses(profile.profile_id, profile.role);
    const classIds = classes.map((item) => item.class_id);
    const [studentCounts, classContent] = await Promise.all([
      getStudentCounts(classIds),
      getClassContent(classIds),
    ]);

    return NextResponse.json({
      classes: classes.map((item) => {
        const content = classContent.get(item.class_id);
        const assignmentSets = content?.assignment_sets ?? [];
        const labSets = content?.lab_sets ?? [];
        const examSets = content?.exam_sets ?? [];
        return {
          ...item,
          student_count: studentCounts.get(item.class_id) ?? 0,
          assignment_count: assignmentSets.length,
          lab_count: labSets.length,
          exam_count: examSets.length,
          assignment_sets: assignmentSets,
          lab_sets: labSets,
          exam_sets: examSets,
        };
      }),
    });
  } catch (error) {
    console.error("Teacher classes API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load classes." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const body = (await request.json()) as CreateClassBody;
    const classCode = normalizeText(body.class_code) || await generateClassCode();
    const className = normalizeText(body.class_name);

    if (!className) throw new Error("Class name is required.");

    const academyId = await getDefaultAcademyId();
    const { data, error } = await supabaseAdmin
      .from("tb_classes")
      .insert({
        academy_id: academyId,
        teacher_profile_id: profile.profile_id,
        class_code: classCode,
        class_name: className,
        class_level: normalizeText(body.class_level) || null,
        class_section: normalizeText(body.class_section) || null,
        academic_year: normalizeText(body.academic_year) || null,
        term: normalizeText(body.term) || null,
        enrollment_code: normalizeText(body.enrollment_code) || classCode,
        is_open_for_enrollment: body.is_open_for_enrollment ?? true,
        is_active: body.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .select("class_id, academy_id, teacher_profile_id, class_code, class_name, class_level, class_section, academic_year, term, enrollment_code, is_open_for_enrollment, is_active, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json(
      {
        class: {
          ...(data as ClassRow),
          student_count: 0,
          assignment_count: 0,
          lab_count: 0,
          exam_count: 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Teacher class create API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create class." },
      { status: 400 },
    );
  }
}
