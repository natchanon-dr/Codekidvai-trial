/**
 * e2e-sim-create-test-data.mjs
 *
 * Phase 1 — Simulated E2E Setup
 * Creates all master/test records for a configurable mock batch.
 * Safe to re-run (idempotent via upsert / existence checks).
 *
 * CLI args:
 *   --batch  SIM_E2E_2026_001   (required, must start with SIM_E2E_ or MOCK_)
 *   --class  SIM_E2E_CLASS_001  (default: derived from batch)
 *   --students 40               (default 40, min 5, max 200)
 *   --tasks    3                (default 3, min 1, max 10)
 *   --at-risk-rate 35           (% of students who are at-risk, default 35)
 *   --missing-rate  7           (% of students with no submission, default 7)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── CLI args ──────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}
const opts = parseArgs();

const BATCH_CODE   = opts["batch"]          ?? "SIM_E2E_2026_001";
const CLASS_CODE   = opts["class"]          ?? `${BATCH_CODE}_CLASS`;
const N_STUDENTS   = Math.max(5, Math.min(200, parseInt(opts["students"]      ?? "40", 10)));
const N_TASKS      = Math.max(1, Math.min(10,  parseInt(opts["tasks"]         ?? "3",  10)));
const AT_RISK_RATE = Math.max(0, Math.min(100, parseInt(opts["at-risk-rate"]  ?? "35", 10)));
const MISSING_RATE = Math.max(0, Math.min(100, parseInt(opts["missing-rate"]  ?? "7",  10)));
// real task IDs from a selected task set — if provided, skip dummy task creation
const REAL_TASK_IDS = opts["task-ids"] ? opts["task-ids"].split(",").filter(Boolean) : [];

if (!BATCH_CODE.startsWith("SIM_E2E_") && !BATCH_CODE.startsWith("MOCK_")) {
  console.error(`ERROR: Batch code must start with SIM_E2E_ or MOCK_. Got: ${BATCH_CODE}`);
  process.exit(1);
}

const PASSWORD = "69056020";
const SIM_TAG  = BATCH_CODE;

console.log(`\n── Sim Setup Config ──
  Batch      : ${BATCH_CODE}
  Class      : ${CLASS_CODE}
  Students   : ${N_STUDENTS}
  Tasks      : ${REAL_TASK_IDS.length ? `(real) ${REAL_TASK_IDS.join(", ")}` : N_TASKS}
  At-Risk %  : ${AT_RISK_RATE}%
  Missing %  : ${MISSING_RATE}%
`);

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(".env.local");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── naming helpers ────────────────────────────────────────────────────────────
function studentCode(i) { return `${BATCH_CODE}_S${String(i).padStart(3, "0")}`; }
function studentEmail(i) { return `${studentCode(i).toLowerCase().replace(/_/g, ".")}@ckv-mock.local`; }
function taskCode(i)    { return `${BATCH_CODE}_T${String(i).padStart(3, "0")}`; }
function teacherCode()  { return `${BATCH_CODE}_TEACHER`; }
function teacherEmail() { return `${BATCH_CODE.toLowerCase().replace(/_/g, ".")}.teacher@ckv-mock.local`; }

// ── SQL task templates ────────────────────────────────────────────────────────
const TASK_TEMPLATES = [
  {
    difficulty: "easy",
    problem: "Write a SQL query to retrieve all records from the students table.",
    correct: "SELECT * FROM students",
    wrong:   "SELECT name FROM wrong_table",
    rubric: { version: 1, type: "criterion_based", pass_threshold: 0.7, criteria: [
      { key: "has_select_star",   label: "SELECT *",      keywords: ["select", "*"],         weight: 0.5 },
      { key: "has_from_students", label: "FROM students", keywords: ["from", "students"],    weight: 0.5 },
    ]},
  },
  {
    difficulty: "medium",
    problem: "Retrieve name and grade_level of students in grade M1, ordered by name.",
    correct: "SELECT name, grade_level FROM students WHERE grade_level = 'M1' ORDER BY name",
    wrong:   "SELECT * FROM students",
    rubric: { version: 1, type: "criterion_based", pass_threshold: 0.6, criteria: [
      { key: "has_select_cols", label: "SELECT columns", keywords: ["select", "name", "grade_level"], weight: 0.3 },
      { key: "has_from",        label: "FROM students",  keywords: ["from", "students"],             weight: 0.2 },
      { key: "has_where_m1",    label: "WHERE grade M1", keywords: ["where", "grade_level", "m1"],  weight: 0.3 },
      { key: "has_order",       label: "ORDER BY name",  keywords: ["order", "by", "name"],         weight: 0.2 },
    ]},
  },
  {
    difficulty: "hard",
    problem: "Retrieve names of students in grade M2, sorted by name descending.",
    correct: "SELECT name FROM students WHERE grade_level = 'M2' ORDER BY name DESC",
    wrong:   "SELECT * FROM students",
    rubric: { version: 1, type: "criterion_based", pass_threshold: 0.6, criteria: [
      { key: "has_select_name", label: "SELECT name",         keywords: ["select", "name"],             weight: 0.3 },
      { key: "has_from_where",  label: "FROM students WHERE", keywords: ["from", "students", "where"],  weight: 0.3 },
      { key: "has_grade_m2",    label: "Filter grade M2",     keywords: ["grade_level", "m2"],          weight: 0.2 },
      { key: "has_order_desc",  label: "ORDER BY DESC",       keywords: ["order", "desc"],              weight: 0.2 },
    ]},
  },
  {
    difficulty: "medium",
    problem: "Count the number of students in each grade level.",
    correct: "SELECT grade_level, COUNT(*) as count FROM students GROUP BY grade_level",
    wrong:   "SELECT * FROM students",
    rubric: { version: 1, type: "criterion_based", pass_threshold: 0.6, criteria: [
      { key: "has_count",    label: "COUNT(*)",           keywords: ["count"],                       weight: 0.4 },
      { key: "has_group_by", label: "GROUP BY grade",     keywords: ["group", "by", "grade_level"], weight: 0.4 },
      { key: "has_select",   label: "SELECT grade_level", keywords: ["select", "grade_level"],      weight: 0.2 },
    ]},
  },
  {
    difficulty: "easy",
    problem: "Retrieve the names of all students sorted alphabetically.",
    correct: "SELECT name FROM students ORDER BY name",
    wrong:   "SELECT * FROM students WHERE 1=0",
    rubric: { version: 1, type: "criterion_based", pass_threshold: 0.7, criteria: [
      { key: "has_select_name", label: "SELECT name",   keywords: ["select", "name"],      weight: 0.5 },
      { key: "has_order",       label: "ORDER BY name", keywords: ["order", "by", "name"], weight: 0.5 },
    ]},
  },
];

const DB_SCHEMA = { tables: [{ table_name: "students", columns: [
  { name: "student_id", type: "int" }, { name: "name", type: "varchar" }, { name: "grade_level", type: "varchar" },
]}]};
const SAMPLE_DATA = { students: [
  { student_id: 1, name: "Alice", grade_level: "M1" },
  { student_id: 2, name: "Bob",   grade_level: "M2" },
  { student_id: 3, name: "Charlie", grade_level: "M1" },
]};

// ── helpers ───────────────────────────────────────────────────────────────────
async function ensureAuthUser(email) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = (list?.users ?? []).find(u => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`Auth create ${email}: ${error.message}`);
  return data.user.id;
}

async function ensureProfile(authUserId, code, role, displayName) {
  const { data: existing } = await admin.from("mst_profiles").select("profile_id")
    .eq("participant_code", code).maybeSingle();
  if (existing) return existing.profile_id;
  const { data, error } = await admin.from("mst_profiles").insert({
    auth_user_id: authUserId, participant_code: code, role, display_name: displayName,
    consent_accepted: true, consent_accepted_at: new Date().toISOString(),
  }).select("profile_id").single();
  if (error) throw new Error(`Profile insert ${code}: ${error.message}`);
  return data.profile_id;
}

// ── 1. Teacher ────────────────────────────────────────────────────────────────
console.log("[1/7] Teacher account...");
const teacherAuthId   = await ensureAuthUser(teacherEmail());
const teacherProfileId = await ensureProfile(teacherAuthId, teacherCode(), "teacher", `Sim Teacher [${SIM_TAG}]`);
console.log(`  teacher_profile_id: ${teacherProfileId}`);

// ── 2. Students ───────────────────────────────────────────────────────────────
console.log(`[2/7] Creating ${N_STUDENTS} sim students...`);
const students = [];
for (let i = 1; i <= N_STUDENTS; i++) {
  const authId = await ensureAuthUser(studentEmail(i));
  const profId = await ensureProfile(authId, studentCode(i), "student",
    `Sim Student ${String(i).padStart(3,"0")} [${SIM_TAG}]`);
  students.push({ i, code: studentCode(i), email: studentEmail(i), authId, profId });
  if (i % 10 === 0) console.log(`  ${i}/${N_STUDENTS} done`);
}
console.log(`  ✅ ${students.length} student profiles ready`);

// ── 3. Batch ──────────────────────────────────────────────────────────────────
console.log(`[3/7] Batch ${BATCH_CODE}...`);
let { data: batch } = await admin.from("mst_experiment_batches").select("batch_id")
  .eq("batch_code", BATCH_CODE).maybeSingle();
if (!batch) {
  const { data, error } = await admin.from("mst_experiment_batches").insert({
    batch_code: BATCH_CODE, batch_name: `Sim Batch [${SIM_TAG}]`,
    batch_description: `Simulated batch for E2E validation. Reset before real pilot.`,
    batch_type: "practice", status: "active", created_by: teacherProfileId,
  }).select("batch_id").single();
  if (error) throw new Error(`Batch insert: ${error.message}`);
  batch = data;
}
console.log(`  batch_id: ${batch.batch_id}`);

// ── 4. Tasks ──────────────────────────────────────────────────────────────────
const tasks = [];
if (REAL_TASK_IDS.length > 0) {
  console.log(`[4/7] Using ${REAL_TASK_IDS.length} real task IDs (skipping dummy task creation)...`);
  const { data: realTasks, error: rtErr } = await admin.from("mst_tasks")
    .select("task_id, task_code, expected_sql, scoring_rubric_json, difficulty_level")
    .in("task_id", REAL_TASK_IDS)
    .eq("is_active", true);
  if (rtErr) throw new Error(`Real task fetch: ${rtErr.message}`);
  if (!realTasks?.length) throw new Error(`None of the provided task IDs found in mst_tasks`);
  tasks.push(...realTasks.map(t => ({
    ...t,
    correct: (t.expected_sql ?? "SELECT * FROM students").replace(/;$/, "").trim(),
    wrong:   "SELECT name FROM nonexistent_table_xyz",
  })));
  console.log(`  ✅ Loaded: ${tasks.map(t => t.task_code).join(", ")}`);
} else {
  console.log(`[4/7] ${N_TASKS} SQL tasks (dummy)...`);
  for (let i = 1; i <= N_TASKS; i++) {
    const tpl = TASK_TEMPLATES[(i - 1) % TASK_TEMPLATES.length];
    const code = taskCode(i);
    let { data: existing } = await admin.from("mst_tasks").select("task_id, task_code")
      .eq("task_code", code).maybeSingle();
    if (!existing) {
      const { data, error } = await admin.from("mst_tasks").insert({
        task_code: code, task_title: `[${SIM_TAG}] SQL Task ${i} (${tpl.difficulty})`,
        task_type: "sql_text", difficulty_level: tpl.difficulty,
        task_status: "published", is_active: true, max_score: 10,
        problem_statement: tpl.problem, expected_answer: tpl.correct, expected_sql: tpl.correct,
        database_schema_json: DB_SCHEMA, sample_data_json: SAMPLE_DATA,
        scoring_rubric_json: tpl.rubric, research_tags: { sim_e2e: true, tag: SIM_TAG },
      }).select("task_id").single();
      if (error) throw new Error(`Task insert ${code}: ${error.message}`);
      existing = { task_id: data.task_id, task_code: code };
    }
    tasks.push({ ...existing, ...tpl });
    console.log(`  ✅ ${code} → ${existing.task_id}`);
  }
}

// ── 5. Class ──────────────────────────────────────────────────────────────────
console.log(`[5/7] Class ${CLASS_CODE}...`);
let { data: cls } = await admin.from("tb_classes").select("class_id")
  .eq("class_code", CLASS_CODE).maybeSingle();
if (!cls) {
  const { data, error } = await admin.from("tb_classes").insert({
    class_code: CLASS_CODE, class_name: `Sim Class [${SIM_TAG}]`,
    academic_year: String(new Date().getFullYear()), term: "1",
    class_level: "sim", is_active: true, teacher_profile_id: teacherProfileId,
  }).select("class_id").single();
  if (error) throw new Error(`Class insert: ${error.message}`);
  cls = data;
}
console.log(`  class_id: ${cls.class_id}`);

const { error: csErr } = await admin.from("tb_class_sets").upsert(
  { class_id: cls.class_id, batch_id: batch.batch_id, family: "assignment" },
  { onConflict: "class_id,batch_id", ignoreDuplicates: true }
);
if (csErr) console.warn(`  class_set warn: ${csErr.message}`);
else console.log("  ✅ class ↔ batch linked");

// ── 6. Enroll ─────────────────────────────────────────────────────────────────
console.log(`[6/7] Enrolling ${students.length} students...`);
const CHUNK = 50;
const enrollRows = students.map(s => ({
  class_id: cls.class_id, profile_id: s.profId,
  status: "active", joined_at: new Date().toISOString(),
}));
for (let i = 0; i < enrollRows.length; i += CHUNK) {
  const { error } = await admin.from("tb_class_students").upsert(
    enrollRows.slice(i, i + CHUNK), { onConflict: "class_id,profile_id", ignoreDuplicates: true }
  );
  if (error) console.warn(`  enroll warn: ${error.message}`);
}
console.log(`  ✅ ${students.length} students enrolled`);

// ── 7. Summary ────────────────────────────────────────────────────────────────
const atRiskCount  = Math.round(N_STUDENTS * AT_RISK_RATE / 100);
const missingCount = Math.round(N_STUDENTS * MISSING_RATE / 100);
console.log(`[7/7] ✅ Setup complete.
  Batch    : ${BATCH_CODE}
  Class    : ${CLASS_CODE}
  Tasks    : ${tasks.map(t => t.task_code ?? t.task_id).join(", ")}
  Students : ${students.length} (at-risk target: ${atRiskCount}, missing-submit target: ${missingCount})
`);
