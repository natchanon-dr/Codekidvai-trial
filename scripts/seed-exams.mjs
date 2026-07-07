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

const { data: profile, error: profileError } = await supabase
  .from("mst_profiles")
  .select("profile_id, display_name, participant_code, role")
  .in("role", ["teacher", "admin"])
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (profileError) throw profileError;
if (!profile) throw new Error("No teacher/admin profile found.");

const mockExams = [
  {
    task_code: "XQT000001",
    task_title: "SQL Text Exam: Basic SELECT and WHERE",
    task_type: "sql_text",
    task_description: "Write SQL statements to retrieve rows with filtering conditions.",
    problem_statement: "เขียน SQL เพื่อดึงข้อมูลนักเรียนที่อยู่ในคลาสที่กำหนด และกรองเฉพาะสถานะ active",
    expected_answer: "SELECT * FROM tb_students WHERE class_code = 'CLS26-000001' AND status = 'active';",
  },
  {
    task_code: "XQB000001",
    task_title: "SQL Block Exam: Join and Aggregate",
    task_type: "sql_block",
    task_description: "Complete a multi-step SQL block with JOIN and GROUP BY.",
    problem_statement: "เติม SQL block เพื่อสรุปคะแนนรวมของนักเรียนแต่ละคนจากตาราง submission",
    expected_answer: "SELECT student_id, SUM(score) AS total_score FROM submissions GROUP BY student_id;",
  },
  {
    task_code: "XER000001",
    task_title: "ER Diagram Exam: Class Enrollment",
    task_type: "er_diagram",
    task_description: "Design an ER diagram for students enrolling in classes.",
    problem_statement: "ออกแบบ ER Diagram สำหรับ student, class, enrollment และ teacher",
    expected_answer: "Entities: students, classes, enrollments, teachers. Relationships: teacher owns classes, students enroll classes.",
  },
  {
    task_code: "XSP000001",
    task_title: "Stored Procedure Exam: Student Summary",
    task_type: "stored_procedure",
    task_description: "Create a stored procedure to summarize student performance.",
    problem_statement: "เขียน stored procedure ที่รับ student_id แล้วคืนคะแนนรวม assignment และ exam",
    expected_answer: "CREATE PROCEDURE get_student_summary(IN p_student_id uuid) ...",
  },
];

const { data: existingTasks, error: existingError } = await supabase
  .from("mst_tasks")
  .select("task_id, task_code")
  .in("task_code", mockExams.map((item) => item.task_code));
if (existingError) throw existingError;

const existingCodes = new Set((existingTasks ?? []).map((item) => item.task_code));
const taskRows = mockExams
  .filter((item) => !existingCodes.has(item.task_code))
  .map((item) => ({
    ...item,
    expected_sql: item.expected_answer,
    max_score: 10,
    task_status: "published",
    is_active: true,
  }));

if (taskRows.length > 0) {
  const { error } = await supabase.from("mst_tasks").insert(taskRows);
  if (error) throw error;
}

const { data: tasks, error: taskError } = await supabase
  .from("mst_tasks")
  .select("task_id, task_code")
  .in("task_code", mockExams.map((item) => item.task_code));
if (taskError) throw taskError;

const year = String(new Date().getFullYear()).slice(-2);
const batchCode = `SX${year}0001`;
const { data: existingSet, error: setLookupError } = await supabase
  .from("mst_experiment_batches")
  .select("batch_id")
  .eq("batch_code", batchCode)
  .maybeSingle();
if (setLookupError) throw setLookupError;

let batchId = existingSet?.batch_id;
if (!batchId) {
  const { data: insertedSet, error: setError } = await supabase
    .from("mst_experiment_batches")
    .insert({
      batch_code: batchCode,
      batch_name: "SQL Mixed Exam 2026/1",
      batch_description: "Mock exam set รวม SQL Text, SQL Block, ER Diagram และ Stored Procedure",
      batch_type: "exam_set",
      status: "active",
      created_by: profile.profile_id,
      set_type_id: 2,
      updated_at: new Date().toISOString(),
    })
    .select("batch_id")
    .single();
  if (setError) throw setError;
  batchId = insertedSet.batch_id;
}

const rows = (tasks ?? []).map((task, index) => ({
  batch_id: batchId,
  profile_id: profile.profile_id,
  task_id: task.task_id,
  assigned_order: index + 1,
  assigned_group: null,
  is_required: true,
  is_unlocked: true,
  status: "assigned",
  assigned_at: new Date().toISOString(),
}));

if (rows.length > 0) {
  const { error } = await supabase
    .from("trn_task_assignments")
    .upsert(rows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: true });
  if (error) throw error;
}

console.log(JSON.stringify({
  teacher: profile.participant_code ?? profile.display_name,
  inserted_tasks: taskRows.length,
  exam_set: batchCode,
  linked_exams: rows.length,
}, null, 2));
