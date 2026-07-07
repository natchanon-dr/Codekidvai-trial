import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ClassRow = {
  class_id: string;
  class_code: string;
  class_name: string;
  is_active: boolean;
};

type ClassStudentRow = {
  class_id: string;
  profile_id: string;
  status: string | null;
  joined_at: string | null;
};

type ProfileRow = {
  profile_id: string;
  participant_code: string | null;
  display_name: string | null;
  grade_level: string | null;
  student_status: string | null;
};

type SessionRow = {
  session_id: string;
  profile_id: string;
  batch_id: string | null;
};

type SubmissionRow = {
  profile_id: string;
  session_id: string;
  batch_id: string | null;
  task_id: string | null;
  final_score: number | null;
};

type AssignmentRow = {
  batch_id: string;
  profile_id: string;
  task_id: string;
  assigned_order: number | null;
};

type BatchRow = {
  batch_id: string;
  batch_type: string | null;
  batch_code: string | null;
  batch_name?: string | null;
  set_type_id?: number | null;
};

type TaskRow = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  max_score: number | null;
};

type AssignmentRecord = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  assigned_order: number | null;
  score: number;
  max_score: number | null;
};

function batchFamily(batch: BatchRow | undefined) {
  if (!batch) return "assignment";
  if (batch.set_type_id === 2 || batch.batch_type === "exam_set" || batch.batch_code?.startsWith("SX") || batch.batch_code?.startsWith("SE") || batch.batch_code?.startsWith("X") || batch.batch_code?.startsWith("E")) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

function buildFeedback(assignmentScore: number, examScore: number, labDone: number) {
  if (assignmentScore === 0 && examScore === 0 && labDone === 0) return "ยังไม่มีข้อมูลการทำงาน";
  if (assignmentScore < 60) return "ควรทบทวน Assignment และฝึกทำโจทย์พื้นฐานเพิ่ม";
  if (examScore > 0 && examScore < 50) return "ควรทบทวนก่อนสอบและดูข้อผิดพลาดจาก submission";
  if (labDone > 0) return "มีความต่อเนื่องในการทำ Lab ดี ให้รักษาจังหวะการเรียน";
  return "ภาพรวมการเรียนอยู่ในเกณฑ์ดี";
}

async function getClasses(profileId: string, role: string) {
  let query = supabaseAdmin
    .from("tb_classes")
    .select("class_id, class_code, class_name, is_active")
    .eq("is_active", true)
    .order("class_code", { ascending: true });
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

async function getScoreSummary(profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, { lab_done: number; assignment_score: number; exam_score: number; submission_count: number; assignment_records: AssignmentRecord[] }>();

  const [sessionsResult, submissionsResult, batchesResult, assignmentsResult] = await Promise.all([
    supabaseAdmin
      .from("trn_learning_sessions")
      .select("session_id, profile_id, batch_id")
      .in("profile_id", profileIds),
    supabaseAdmin
      .from("trn_submissions")
      .select("profile_id, session_id, batch_id, task_id, final_score")
      .in("profile_id", profileIds),
    supabaseAdmin
      .from("mst_experiment_batches")
      .select("batch_id, batch_type, batch_code, batch_name, set_type_id"),
    supabaseAdmin
      .from("trn_task_assignments")
      .select("batch_id, profile_id, task_id, assigned_order")
      .in("profile_id", profileIds),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (submissionsResult.error) throw submissionsResult.error;
  if (batchesResult.error) throw batchesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const sessionMap = new Map(((sessionsResult.data ?? []) as SessionRow[]).map((row) => [row.session_id, row]));
  const batchMap = new Map(((batchesResult.data ?? []) as BatchRow[]).map((row) => [row.batch_id, row]));
  const assignmentRows = (assignmentsResult.data ?? []) as AssignmentRow[];
  const assignmentTaskIds = [...new Set(
    assignmentRows
      .filter((row) => batchFamily(batchMap.get(row.batch_id)) === "assignment")
      .map((row) => row.task_id)
      .filter(Boolean),
  )];
  const { data: taskRows, error: taskError } = assignmentTaskIds.length
    ? await supabaseAdmin
        .from("mst_tasks")
        .select("task_id, task_code, task_title, max_score")
        .in("task_id", assignmentTaskIds)
    : { data: [], error: null };
  if (taskError) throw taskError;

  const taskMap = new Map(((taskRows ?? []) as TaskRow[]).map((row) => [row.task_id, row]));
  const scoreByProfileTask = new Map<string, number>();
  for (const submission of (submissionsResult.data ?? []) as SubmissionRow[]) {
    const session = sessionMap.get(submission.session_id);
    const batchId = submission.batch_id ?? session?.batch_id;
    if (!batchId || !submission.task_id) continue;
    const key = `${submission.profile_id}:${batchId}:${submission.task_id}`;
    scoreByProfileTask.set(key, (scoreByProfileTask.get(key) ?? 0) + Number(submission.final_score ?? 0));
  }

  const summary = new Map<string, { lab_done: number; assignment_score: number; exam_score: number; submission_count: number; assignment_records: AssignmentRecord[] }>();
  for (const profileId of profileIds) {
    summary.set(profileId, { lab_done: 0, assignment_score: 0, exam_score: 0, submission_count: 0, assignment_records: [] });
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

  for (const row of assignmentRows) {
    const batch = batchMap.get(row.batch_id);
    if (batchFamily(batch) !== "assignment") continue;
    const current = summary.get(row.profile_id);
    if (!current) continue;
    const task = taskMap.get(row.task_id);
    current.assignment_records.push({
      batch_id: row.batch_id,
      batch_code: batch?.batch_code ?? null,
      batch_name: batch?.batch_name ?? null,
      task_id: row.task_id,
      task_code: task?.task_code ?? null,
      task_title: task?.task_title ?? null,
      assigned_order: row.assigned_order,
      score: scoreByProfileTask.get(`${row.profile_id}:${row.batch_id}:${row.task_id}`) ?? 0,
      max_score: task?.max_score ?? null,
    });
  }

  for (const current of summary.values()) {
    current.assignment_records.sort((a, b) => {
      const batchCompare = String(a.batch_code ?? a.batch_name ?? "").localeCompare(String(b.batch_code ?? b.batch_name ?? ""));
      if (batchCompare !== 0) return batchCompare;
      return Number(a.assigned_order ?? 0) - Number(b.assigned_order ?? 0);
    });
  }

  return summary;
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireTeacherOrAdmin(request);
    const classes = await getClasses(profile.profile_id, profile.role);
    const classIds = classes.map((item) => item.class_id);

    const { data: memberships, error: membershipError } = classIds.length
      ? await supabaseAdmin
          .from("tb_class_students")
          .select("class_id, profile_id, status, joined_at")
          .in("class_id", classIds)
          .eq("status", "active")
      : { data: [], error: null };
    if (membershipError) {
      if (membershipError.code === "42P01" || membershipError.code === "42703") {
        return NextResponse.json({ classes: classes.map((item) => ({ ...item, students: [] })) });
      }
      throw membershipError;
    }

    const rows = (memberships ?? []) as ClassStudentRow[];
    const profileIds = [...new Set(rows.map((row) => row.profile_id).filter(Boolean))];
    const [{ data: profileRows, error: profileError }, scoreSummary] = await Promise.all([
      profileIds.length
        ? supabaseAdmin
            .from("mst_profiles")
            .select("profile_id, participant_code, display_name, grade_level, student_status")
            .in("profile_id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      getScoreSummary(profileIds),
    ]);
    if (profileError) throw profileError;

    const profileMap = new Map(((profileRows ?? []) as ProfileRow[]).map((row) => [row.profile_id, row]));
    const groupedClasses = classes.map((classItem) => {
      const students = rows
        .filter((row) => row.class_id === classItem.class_id)
        .map((row) => {
          const score = scoreSummary.get(row.profile_id) ?? {
            lab_done: 0,
            assignment_score: 0,
            exam_score: 0,
            submission_count: 0,
            assignment_records: [],
          };
          return {
            class_id: row.class_id,
            profile_id: row.profile_id,
            joined_at: row.joined_at,
            student: profileMap.get(row.profile_id) ?? null,
            progress: {
              ...score,
              feedback: buildFeedback(score.assignment_score, score.exam_score, score.lab_done),
            },
          };
        });

      return { ...classItem, students };
    });

    return NextResponse.json({ classes: groupedClasses });
  } catch (error) {
    console.error("Teacher students API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load students." },
      { status: 400 },
    );
  }
}
