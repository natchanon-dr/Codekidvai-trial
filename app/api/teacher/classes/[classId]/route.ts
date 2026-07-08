import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ classId: string }>;
};

type ClassRow = {
  class_id: string;
  academy_id: string | null;
  teacher_profile_id: string;
  class_code: string;
  class_name: string;
  class_level: string | null;
  class_section: string | null;
  learner_group: string | null;
  academic_year: string | null;
  term: string | null;
  register_from: string | null;
  register_to: string | null;
  is_open_for_enrollment: boolean;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type ClassStudentRow = {
  class_student_id: string;
  class_id: string;
  profile_id: string;
  status: string | null;
  joined_at: string | null;
};

type StudentProfileRow = {
  profile_id: string;
  participant_code: string | null;
  display_name: string | null;
  grade_level: string | null;
  student_status: string | null;
  academy_member_id?: string | null;
};

type SessionRow = {
  session_id: string;
  profile_id: string;
  batch_id: string | null;
};

type SubmissionRow = {
  profile_id: string;
  session_id: string;
  final_score: number | null;
};

type AssignmentRow = {
  batch_id: string;
  profile_id: string;
};

type BatchRow = {
  batch_id: string;
  batch_type: string | null;
  batch_code: string | null;
  set_type_id?: number | null;
};

type UpdateClassBody = {
  class_name?: string;
  class_level?: string;
  class_section?: string;
  academic_year?: string;
  term?: string;
  register_from?: string | null;
  register_to?: string | null;
  is_open_for_enrollment?: boolean;
  is_active?: boolean;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function batchFamily(batch: BatchRow | undefined) {
  if (!batch) return "assignment";
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SX") || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("X") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

async function getClassById(classId: string, profileId: string, role: string) {
  let query = supabaseAdmin
    .from("tb_classes")
    .select("class_id, academy_id, teacher_profile_id, class_code, class_name, class_level, class_section, learner_group, academic_year, term, register_from, register_to, is_open_for_enrollment, is_active, created_at, updated_at")
    .eq("class_id", classId);

  if (role !== "admin") {
    query = query.eq("teacher_profile_id", profileId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as ClassRow | null;
}

async function getStudents(classId: string) {
  const { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from("tb_class_students")
    .select("class_student_id, class_id, profile_id, status, joined_at")
    .eq("class_id", classId)
    .order("joined_at", { ascending: false });
  if (membershipError) {
    if (membershipError.code === "42P01" || membershipError.code === "42703") return [];
    throw membershipError;
  }

  const memberships = (membershipRows ?? []) as ClassStudentRow[];
  const profileIds = memberships.map((row) => row.profile_id).filter(Boolean);
  if (profileIds.length === 0) return [];

  const { data: profileRows, error: profileError } = await supabaseAdmin
    .from("mst_profiles")
    .select("profile_id, participant_code, display_name, grade_level, student_status")
    .in("profile_id", profileIds);
  if (profileError) throw profileError;

  const participantCodes = (profileRows ?? [])
    .map((r) => r.participant_code)
    .filter(Boolean) as string[];
  const { data: memberRows } = participantCodes.length
    ? await supabaseAdmin
        .from("mst_academy_members")
        .select("participant_code, academy_member_id")
        .in("participant_code", participantCodes)
    : { data: [] };
  const memberMap = new Map(
    ((memberRows ?? []) as { participant_code: string; academy_member_id: string }[])
      .map((m) => [m.participant_code, m.academy_member_id]),
  );

  const profileMap = new Map(
    (profileRows ?? []).map((row) => [
      row.profile_id,
      { ...(row as StudentProfileRow), academy_member_id: memberMap.get(row.participant_code ?? "") ?? null },
    ]),
  );
  const scoreMap = await getScoreSummary(profileIds);

  return memberships.map((membership) => {
    const profile = profileMap.get(membership.profile_id) ?? null;
    const score = scoreMap.get(membership.profile_id) ?? {
      lab_done: 0,
      assignment_score: 0,
      exam_score: 0,
      submission_count: 0,
    };
    return {
      ...membership,
      student: profile,
      progress: {
        ...score,
        feedback: buildFeedback(score.assignment_score, score.exam_score, score.lab_done),
      },
    };
  });
}

type ContentSetItem = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
};

type ClassSetRow = {
  batch_id: string;
  family: string;
  mst_experiment_batches: {
    batch_code: string | null;
    batch_name: string | null;
    status: string | null;
  } | null;
};

async function getContentSets(classId: string) {
  const { data, error } = await supabaseAdmin
    .from("tb_class_sets")
    .select("batch_id, family, mst_experiment_batches(batch_code, batch_name, status)")
    .eq("class_id", classId);

  if (error) {
    // If table doesn't exist yet, return empty (migration not yet run)
    if (error.code === "42P01" || error.code === "PGRST204") {
      return { assignment_sets: [], lab_sets: [], exam_sets: [], assignment_count: 0, lab_count: 0, exam_count: 0 };
    }
    throw error;
  }

  const sets: Record<string, ContentSetItem[]> = { assignment: [], lab: [], exam: [] };
  for (const row of (data ?? []) as unknown as ClassSetRow[]) {
    const b = row.mst_experiment_batches;
    const family = (["assignment", "lab", "exam"].includes(row.family) ? row.family : "assignment") as "assignment" | "lab" | "exam";
    sets[family].push({ batch_id: row.batch_id, batch_code: b?.batch_code ?? null, batch_name: b?.batch_name ?? null, status: b?.status ?? null });
  }

  return {
    assignment_sets: sets.assignment,
    lab_sets: sets.lab,
    exam_sets: sets.exam,
    assignment_count: sets.assignment.length,
    lab_count: sets.lab.length,
    exam_count: sets.exam.length,
  };
}

async function getScoreSummary(profileIds: string[]) {
  const [sessionsResult, submissionsResult, batchesResult] = await Promise.all([
    supabaseAdmin
      .from("trn_learning_sessions")
      .select("session_id, profile_id, batch_id")
      .in("profile_id", profileIds),
    supabaseAdmin
      .from("trn_submissions")
      .select("profile_id, session_id, final_score")
      .in("profile_id", profileIds),
    supabaseAdmin
      .from("mst_experiment_batches")
      .select("batch_id, batch_type, batch_code, set_type_id"),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (submissionsResult.error) throw submissionsResult.error;
  if (batchesResult.error) throw batchesResult.error;

  const sessionMap = new Map(((sessionsResult.data ?? []) as SessionRow[]).map((row) => [row.session_id, row]));
  const batchMap = new Map(((batchesResult.data ?? []) as BatchRow[]).map((row) => [row.batch_id, row]));
  const summary = new Map<string, { lab_done: number; assignment_score: number; exam_score: number; submission_count: number }>();

  for (const profileId of profileIds) {
    summary.set(profileId, { lab_done: 0, assignment_score: 0, exam_score: 0, submission_count: 0 });
  }

  for (const submission of (submissionsResult.data ?? []) as SubmissionRow[]) {
    const current = summary.get(submission.profile_id);
    if (!current) continue;
    const session = sessionMap.get(submission.session_id);
    const family = batchFamily(session?.batch_id ? batchMap.get(session.batch_id) : undefined);
    const score = Number(submission.final_score ?? 0);
    current.submission_count += 1;
    if (family === "lab") current.lab_done += 1;
    else if (family === "exam") current.exam_score += score;
    else current.assignment_score += score;
  }

  return summary;
}

function buildFeedback(assignmentScore: number, examScore: number, labDone: number) {
  if (assignmentScore === 0 && examScore === 0 && labDone === 0) return "ยังไม่มีข้อมูลการทำงาน";
  if (assignmentScore < 60) return "ควรทบทวน Assignment และฝึกทำโจทย์พื้นฐานเพิ่ม";
  if (examScore > 0 && examScore < 50) return "ควรทบทวนก่อนสอบและดูข้อผิดพลาดจาก submission";
  if (labDone > 0) return "มีความต่อเนื่องในการทำ Lab ดี ให้รักษาจังหวะการเรียน";
  return "ภาพรวมการเรียนอยู่ในเกณฑ์ดี";
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { classId } = await context.params;
    const classItem = await getClassById(classId, profile.profile_id, profile.role);
    if (!classItem) throw new Error("Class not found.");

    const students = await getStudents(classId);
    const activeProfileIds = students
      .filter((item) => item.status === "active")
      .map((item) => item.profile_id)
      .filter(Boolean);
    const contentSets = await getContentSets(classId);
    return NextResponse.json({
      class: {
        ...classItem,
        student_count: students.filter((item) => item.status === "active").length,
        ...contentSets,
      },
      students,
    });
  } catch (error) {
    console.error("Teacher class detail API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load class." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const { classId } = await context.params;
    const classItem = await getClassById(classId, profile.profile_id, profile.role);
    if (!classItem) throw new Error("Class not found.");

    const body = (await request.json()) as UpdateClassBody;
    const updatePayload: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    };

    if (body.class_name !== undefined) {
      const className = normalizeText(body.class_name);
      if (!className) throw new Error("Class name is required.");
      updatePayload.class_name = className;
    }
    if (body.class_level !== undefined) updatePayload.class_level = normalizeText(body.class_level) || null;
    if (body.class_section !== undefined) updatePayload.class_section = normalizeText(body.class_section) || null;
    if (body.academic_year !== undefined) updatePayload.academic_year = normalizeText(body.academic_year) || null;
    if (body.term !== undefined) updatePayload.term = normalizeText(body.term) || null;
    if (body.register_from !== undefined) updatePayload.register_from = body.register_from || null;
    if (body.register_to !== undefined) updatePayload.register_to = body.register_to || null;
    if (body.is_open_for_enrollment !== undefined) updatePayload.is_open_for_enrollment = Boolean(body.is_open_for_enrollment);
    if (body.is_active !== undefined) updatePayload.is_active = Boolean(body.is_active);

    const { data, error } = await supabaseAdmin
      .from("tb_classes")
      .update(updatePayload)
      .eq("class_id", classId)
      .select("class_id, academy_id, teacher_profile_id, class_code, class_name, class_level, class_section, learner_group, academic_year, term, register_from, register_to, is_open_for_enrollment, is_active, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ class: data });
  } catch (error) {
    console.error("Teacher class update API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update class." },
      { status: 400 },
    );
  }
}
