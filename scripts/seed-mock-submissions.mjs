import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function familyOf(batch) {
  if (
    batch.set_type_id === 2 ||
    batch.batch_type === "exam_set" ||
    batch.batch_code?.startsWith("SX") ||
    batch.batch_code?.startsWith("SE") ||
    batch.batch_code?.startsWith("X") ||
    batch.batch_code?.startsWith("E")
  ) return "exam";
  if (batch.batch_type === "lab_set" || batch.batch_code?.startsWith("SL") || batch.batch_code?.startsWith("L")) return "lab";
  return "assignment";
}

async function main() {
  const { data: classRows, error: classError } = await supabase
    .from("tb_classes")
    .select("class_id, class_code, class_name, teacher_profile_id")
    .eq("is_active", true)
    .order("class_code", { ascending: true });
  if (classError) throw classError;

  const classes = classRows ?? [];
  if (classes.length === 0) throw new Error("No active class found.");

  let selectedClass = null;
  let students = [];
  for (const classItem of classes) {
    const { data, error } = await supabase
      .from("tb_class_students")
      .select("class_id, profile_id, status")
      .eq("class_id", classItem.class_id)
      .eq("status", "active")
      .limit(3);
    if (error) throw error;
    if ((data ?? []).length >= 2) {
      selectedClass = classItem;
      students = data ?? [];
      break;
    }
  }

  if (!selectedClass) throw new Error("No active class with at least 2 students found.");
  const studentIds = students.slice(0, 2).map((item) => item.profile_id);

  const { data: existingAssignments, error: assignmentError } = await supabase
    .from("trn_task_assignments")
    .select("assignment_id, batch_id, profile_id, task_id, assigned_order")
    .in("profile_id", studentIds);
  if (assignmentError) throw assignmentError;

  const batchIds = [...new Set((existingAssignments ?? []).map((row) => row.batch_id))];
  const { data: batches, error: batchError } = batchIds.length
    ? await supabase
        .from("mst_experiment_batches")
        .select("batch_id, batch_code, batch_name, batch_type, set_type_id, status")
        .in("batch_id", batchIds)
    : { data: [], error: null };
  if (batchError) throw batchError;

  const batchMap = new Map((batches ?? []).map((batch) => [batch.batch_id, batch]));
  let assignmentSet = (batches ?? []).find((batch) => familyOf(batch) === "assignment");
  let examSet = (batches ?? []).find((batch) => familyOf(batch) === "exam");

  if (!assignmentSet) {
    const { data, error } = await supabase
      .from("mst_experiment_batches")
      .select("batch_id, batch_code, batch_name, batch_type, set_type_id, status, created_by")
      .eq("created_by", selectedClass.teacher_profile_id)
      .like("batch_code", "SA%")
      .order("batch_code", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    assignmentSet = data;
  }

  if (!examSet) {
    const { data, error } = await supabase
      .from("mst_experiment_batches")
      .select("batch_id, batch_code, batch_name, batch_type, set_type_id, status, created_by")
      .eq("created_by", selectedClass.teacher_profile_id)
      .like("batch_code", "SX%")
      .order("batch_code", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    examSet = data;
  }

  if (!assignmentSet) throw new Error("No assignment set found for selected teacher.");
  if (!examSet) throw new Error("No exam set found for selected teacher.");

  await ensureSetAssignedToStudents(assignmentSet.batch_id, studentIds);
  await ensureSetAssignedToStudents(examSet.batch_id, studentIds);

  const { data: rowsToSubmit, error: rowsError } = await supabase
    .from("trn_task_assignments")
    .select("assignment_id, batch_id, profile_id, task_id, assigned_order")
    .in("profile_id", studentIds)
    .in("batch_id", [assignmentSet.batch_id, examSet.batch_id])
    .order("assigned_order", { ascending: true });
  if (rowsError) throw rowsError;

  const { data: taskRows, error: taskError } = await supabase
    .from("mst_tasks")
    .select("task_id, task_code, task_title, expected_answer, expected_sql, max_score")
    .in("task_id", [...new Set((rowsToSubmit ?? []).map((row) => row.task_id))]);
  if (taskError) throw taskError;

  const taskMap = new Map((taskRows ?? []).map((task) => [task.task_id, task]));
  const now = new Date();
  const sessionRows = [];
  const submissionRows = [];
  const completedAssignmentIds = [];

  for (const row of rowsToSubmit ?? []) {
    const studentIndex = studentIds.indexOf(row.profile_id);
    const setIndex = row.batch_id === examSet.batch_id ? 1 : 0;
    const order = Number(row.assigned_order ?? 1);
    const shouldSubmit = studentIndex === 0 || (setIndex === 1 ? true : order <= 1);
    if (!shouldSubmit) continue;

    const task = taskMap.get(row.task_id);
    const maxScore = Number(task?.max_score ?? (row.batch_id === examSet.batch_id ? 10 : 20));
    const fullScore = studentIndex === 0;
    const score = fullScore ? maxScore : Math.max(1, Math.floor(maxScore * 0.45));
    const submittedAt = new Date(now.getTime() - (studentIndex + setIndex + order) * 60 * 60 * 1000).toISOString();
    const sessionId = crypto.randomUUID();
    const answer = fullScore
      ? (task?.expected_sql ?? task?.expected_answer ?? "SELECT * FROM mock_table;")
      : "Mock answer for teacher review";

    sessionRows.push({
      session_id: sessionId,
      profile_id: row.profile_id,
      task_id: row.task_id,
      batch_id: row.batch_id,
      assignment_id: row.assignment_id,
      started_at: submittedAt,
      ended_at: submittedAt,
      last_event_at: submittedAt,
      status: "completed",
      duration_seconds: 420 + order * 20,
      user_agent: "Mock seed",
      device_type: "desktop",
      browser_name: "Chrome",
    });

    submissionRows.push({
      profile_id: row.profile_id,
      batch_id: row.batch_id,
      task_id: row.task_id,
      session_id: sessionId,
      final_answer_text: answer,
      final_answer_json: { mode: "mock_submission" },
      final_score: score,
      is_passed: fullScore,
      submitted_at: submittedAt,
      total_run_count: fullScore ? 2 : 4,
      total_attempt_count: fullScore ? 2 : 5,
      first_correct_at: fullScore ? submittedAt : null,
      time_to_first_correct_sec: fullScore ? 180 : null,
    });

    completedAssignmentIds.push(row.assignment_id);
  }

  if (sessionRows.length > 0) {
    const { error } = await supabase
      .from("trn_learning_sessions")
      .upsert(sessionRows, { onConflict: "session_id" });
    if (error) throw error;
  }

  if (submissionRows.length > 0) {
    const { error } = await supabase
      .from("trn_submissions")
      .upsert(submissionRows, { onConflict: "profile_id,batch_id,task_id" });
    if (error) throw error;
  }

  if (completedAssignmentIds.length > 0) {
    const { error } = await supabase
      .from("trn_task_assignments")
      .update({ status: "completed", completed_at: now.toISOString() })
      .in("assignment_id", completedAssignmentIds);
    if (error) throw error;
  }

  console.log(JSON.stringify({
    class: selectedClass.class_code,
    students: studentIds.length,
    assignment_set: assignmentSet.batch_code,
    exam_set: examSet.batch_code,
    mocked_submissions: submissionRows.length,
  }, null, 2));
}

async function ensureSetAssignedToStudents(batchId, studentIds) {
  const { data: templateRows, error: templateError } = await supabase
    .from("trn_task_assignments")
    .select("batch_id, profile_id, task_id, assigned_order, assigned_group, is_required, is_unlocked, status")
    .eq("batch_id", batchId)
    .order("assigned_order", { ascending: true });
  if (templateError) throw templateError;

  const byTask = new Map();
  for (const row of templateRows ?? []) {
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, row);
  }
  const templates = [...byTask.values()];
  if (templates.length === 0) throw new Error(`Set ${batchId} has no tasks.`);

  const now = new Date().toISOString();
  const rows = studentIds.flatMap((profileId) => templates.map((template, index) => ({
    batch_id: batchId,
    profile_id: profileId,
    task_id: template.task_id,
    assigned_order: Number(template.assigned_order ?? index + 1),
    assigned_group: template.assigned_group ?? null,
    is_required: template.is_required ?? true,
    is_unlocked: template.is_unlocked ?? true,
    status: "assigned",
    assigned_at: now,
  })));

  const { error } = await supabase
    .from("trn_task_assignments")
    .upsert(rows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: true });
  if (error) throw error;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
