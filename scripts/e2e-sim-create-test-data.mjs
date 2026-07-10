/**
 * e2e-sim-create-test-data.mjs
 *
 * Phase 1 — Simulated E2E Setup
 * Creates all master/test records for TEST_BATCH_E2E_001 validation.
 * Safe to re-run (idempotent via upsert / existence checks).
 *
 * Creates:
 *   - sim.e2e.teacher@ckv-mock.local  (teacher)
 *   - sim.e2e.researcher@ckv-mock.local (researcher)
 *   - sim.e2e.s001-s040@ckv-mock.local (40 students)
 *   - TEST_CLASS_E2E
 *   - TEST_BATCH_E2E_001
 *   - TEST_TASK_SQL_E2E_001/002/003 (3 sql_text tasks)
 *   - tb_class_sets link (class ↔ batch)
 *   - tb_class_students enrollment (40 students → class)
 *
 * Rules: no real student data, no schema change, tag SIM_E2E_2026
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const SIM_TAG = "SIM_E2E_2026";
const N_STUDENTS = 40;
const PASSWORD = "69056020";

// ── helpers ───────────────────────────────────────────────────────────────────
async function ensureAuthUser(email) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = (list?.users ?? []).find(u => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`Auth create ${email}: ${error.message}`);
  return data.user.id;
}

async function ensureProfile(authUserId, code, role, displayName) {
  const { data: existing } = await admin
    .from("mst_profiles")
    .select("profile_id")
    .eq("participant_code", code)
    .maybeSingle();
  if (existing) return existing.profile_id;
  const { data, error } = await admin
    .from("mst_profiles")
    .insert({
      auth_user_id: authUserId,
      participant_code: code,
      role,
      display_name: displayName,
      consent_accepted: true,
      consent_accepted_at: "2026-07-01T00:00:00Z",
    })
    .select("profile_id")
    .single();
  if (error) throw new Error(`Profile insert ${code}: ${error.message}`);
  return data.profile_id;
}

// ── 1. Teacher + Researcher accounts ─────────────────────────────────────────
console.log("\n[1/7] Teacher + Researcher accounts...");
const teacherAuthId = await ensureAuthUser("sim.e2e.teacher@ckv-mock.local");
const teacherProfileId = await ensureProfile(
  teacherAuthId, "SIM_TEACHER_E2E", "teacher",
  `Sim Teacher [${SIM_TAG}]`
);
console.log("  teacher profile_id:", teacherProfileId);

const researcherAuthId = await ensureAuthUser("sim.e2e.researcher@ckv-mock.local");
const researcherProfileId = await ensureProfile(
  researcherAuthId, "SIM_RESEARCHER_E2E", "researcher",
  `Sim Researcher [${SIM_TAG}]`
);
console.log("  researcher profile_id:", researcherProfileId);

// ── 2. Student accounts ───────────────────────────────────────────────────────
console.log(`\n[2/7] Creating ${N_STUDENTS} sim students...`);
const students = [];
for (let i = 1; i <= N_STUDENTS; i++) {
  const code = `SIM_E2E_S${String(i).padStart(3, "0")}`;
  const email = `sim.e2e.s${String(i).padStart(3, "0")}@ckv-mock.local`;
  const authId = await ensureAuthUser(email);
  const profId = await ensureProfile(
    authId, code, "student",
    `Sim Student ${String(i).padStart(3, "0")} [${SIM_TAG}]`
  );
  students.push({ i, code, email, authId, profId });
  if (i % 10 === 0) process.stdout.write(`  ${i}/${N_STUDENTS} done\n`);
}
console.log(`  ✅  ${students.length} student profiles ready`);

// ── 3. TEST_BATCH_E2E_001 ─────────────────────────────────────────────────────
console.log("\n[3/7] TEST_BATCH_E2E_001...");
let { data: batch } = await admin
  .from("mst_experiment_batches")
  .select("batch_id")
  .eq("batch_code", "TEST_BATCH_E2E_001")
  .maybeSingle();

if (!batch) {
  const { data, error } = await admin
    .from("mst_experiment_batches")
    .insert({
      batch_code: "TEST_BATCH_E2E_001",
      batch_name: `Simulated E2E Batch [${SIM_TAG}]`,
      batch_description: "Test-only batch for E2E system loop validation. Reset before real pilot.",
      batch_type: "practice",
      status: "active",
      created_by: researcherProfileId,
    })
    .select("batch_id")
    .single();
  if (error) throw new Error(`Batch insert: ${error.message}`);
  batch = data;
}
console.log("  batch_id:", batch.batch_id);

// ── 4. SQL Tasks ──────────────────────────────────────────────────────────────
console.log("\n[4/7] SQL tasks...");

const TASK_DEFS = [
  {
    task_code: "TEST_TASK_SQL_E2E_001",
    task_title: "[E2E] SQL Task 1 — Basic SELECT",
    difficulty_level: "easy",
    problem_statement: "Write a SQL query to retrieve all records from the students table.",
    expected_answer: "SELECT * FROM students;",
    correct_sql: "SELECT * FROM students",
    wrong_sql: "SELECT name FROM wrong_table",
    partial_sql: "SELECT name FROM students",  // gets some keywords but below threshold
    scoring_rubric_json: {
      version: 1, type: "criterion_based", pass_threshold: 0.7,
      criteria: [
        { key: "has_select_star", label: "Uses SELECT *", keywords: ["select", "*"], weight: 0.5 },
        { key: "has_from_students", label: "FROM students table", keywords: ["from", "students"], weight: 0.5 },
      ],
    },
  },
  {
    task_code: "TEST_TASK_SQL_E2E_002",
    task_title: "[E2E] SQL Task 2 — SELECT with WHERE",
    difficulty_level: "medium",
    problem_statement: "Write a SQL query to retrieve name and grade_level of students where grade_level is 'M1', ordered by name.",
    expected_answer: "SELECT name, grade_level FROM students WHERE grade_level = 'M1' ORDER BY name;",
    correct_sql: "SELECT name, grade_level FROM students WHERE grade_level = 'M1' ORDER BY name",
    wrong_sql: "SELECT * FROM students",
    partial_sql: "SELECT name FROM students",
    scoring_rubric_json: {
      version: 1, type: "criterion_based", pass_threshold: 0.6,
      criteria: [
        { key: "has_select_cols", label: "SELECT correct columns", keywords: ["select", "name", "grade_level"], weight: 0.3 },
        { key: "has_from_students", label: "FROM students", keywords: ["from", "students"], weight: 0.2 },
        { key: "has_where_m1", label: "WHERE grade_level = M1", keywords: ["where", "grade_level", "m1"], weight: 0.3 },
        { key: "has_order", label: "ORDER BY name", keywords: ["order", "by", "name"], weight: 0.2 },
      ],
    },
  },
  {
    task_code: "TEST_TASK_SQL_E2E_003",
    task_title: "[E2E] SQL Task 3 — SELECT with ORDER DESC",
    difficulty_level: "hard",
    problem_statement: "Write a SQL query to retrieve names of students in grade M2, sorted by name in descending order.",
    expected_answer: "SELECT name FROM students WHERE grade_level = 'M2' ORDER BY name DESC;",
    correct_sql: "SELECT name FROM students WHERE grade_level = 'M2' ORDER BY name DESC",
    wrong_sql: "SELECT * FROM students",
    partial_sql: "SELECT name FROM students WHERE grade_level = 'm2'",
    scoring_rubric_json: {
      version: 1, type: "criterion_based", pass_threshold: 0.6,
      criteria: [
        { key: "has_select_name", label: "SELECT name", keywords: ["select", "name"], weight: 0.3 },
        { key: "has_from_where", label: "FROM students WHERE", keywords: ["from", "students", "where"], weight: 0.3 },
        { key: "has_grade_m2", label: "Filter grade M2", keywords: ["grade_level", "m2"], weight: 0.2 },
        { key: "has_order_desc", label: "ORDER BY DESC", keywords: ["order", "desc"], weight: 0.2 },
      ],
    },
  },
];

const DB_SCHEMA = {
  tables: [{
    table_name: "students",
    columns: [
      { name: "student_id", type: "int" },
      { name: "name", type: "varchar" },
      { name: "grade_level", type: "varchar" },
    ],
  }],
};
const SAMPLE_DATA = {
  students: [
    { student_id: 1, name: "Alice", grade_level: "M1" },
    { student_id: 2, name: "Bob", grade_level: "M2" },
    { student_id: 3, name: "Charlie", grade_level: "M1" },
  ],
};

const tasks = [];
for (const def of TASK_DEFS) {
  let { data: existing } = await admin
    .from("mst_tasks")
    .select("task_id, task_code")
    .eq("task_code", def.task_code)
    .maybeSingle();

  if (!existing) {
    const { data, error } = await admin
      .from("mst_tasks")
      .insert({
        task_code: def.task_code,
        task_title: def.task_title,
        task_type: "sql_text",
        difficulty_level: def.difficulty_level,
        task_status: "published",
        is_active: true,
        max_score: 10,
        problem_statement: def.problem_statement,
        expected_answer: def.expected_answer,   // legacy column
        expected_sql: def.expected_answer,       // column read by scoring engine
        database_schema_json: DB_SCHEMA,
        sample_data_json: SAMPLE_DATA,
        scoring_rubric_json: def.scoring_rubric_json,
        research_tags: { sim_e2e: true, tag: SIM_TAG },
      })
      .select("task_id")
      .single();
    if (error) throw new Error(`Task insert ${def.task_code}: ${error.message}`);
    existing = { task_id: data.task_id, task_code: def.task_code };
  }
  tasks.push({ ...existing, ...def });
  console.log(`  ✅  ${def.task_code} → ${existing.task_id}`);
}

// ── 5. TEST_CLASS_E2E ─────────────────────────────────────────────────────────
console.log("\n[5/7] TEST_CLASS_E2E...");
let { data: cls } = await admin
  .from("tb_classes")
  .select("class_id")
  .eq("class_code", "TEST_CLASS_E2E")
  .maybeSingle();

if (!cls) {
  const { data, error } = await admin
    .from("tb_classes")
    .insert({
      class_code: "TEST_CLASS_E2E",
      class_name: `Simulated E2E Class [${SIM_TAG}]`,
      academic_year: "2026",
      term: "1",
      class_level: "sim",
      is_active: true,
      teacher_profile_id: teacherProfileId,
    })
    .select("class_id")
    .single();
  if (error) throw new Error(`Class insert: ${error.message}`);
  cls = data;
}
console.log("  class_id:", cls.class_id);

// Link class ↔ batch via tb_class_sets
const { error: csErr } = await admin
  .from("tb_class_sets")
  .upsert(
    { class_id: cls.class_id, batch_id: batch.batch_id, family: "assignment" },
    { onConflict: "class_id,batch_id", ignoreDuplicates: true }
  );
if (csErr) console.warn("  class_set upsert warning:", csErr.message);
else console.log("  ✅  class ↔ batch linked");

// ── 6. Enroll students in class ───────────────────────────────────────────────
console.log("\n[6/7] Enrolling students...");
const enrollRows = students.map(s => ({
  class_id: cls.class_id,
  profile_id: s.profId,
  status: "active",
  joined_at: "2026-07-01T00:00:00Z",
}));

const ENROLL_CHUNK = 50;
for (let i = 0; i < enrollRows.length; i += ENROLL_CHUNK) {
  const { error } = await admin
    .from("tb_class_students")
    .upsert(enrollRows.slice(i, i + ENROLL_CHUNK), {
      onConflict: "class_id,profile_id",
      ignoreDuplicates: true,
    });
  if (error) console.warn("  enroll upsert warning:", error.message);
}
console.log(`  ✅  ${students.length} students enrolled`);

// ── 7. Summary ────────────────────────────────────────────────────────────────
console.log("\n[7/7] Summary");
console.log(`
── Test Data Ready ──
  Batch:      TEST_BATCH_E2E_001 (${batch.batch_id})
  Class:      TEST_CLASS_E2E    (${cls.class_id})
  Tasks:      ${tasks.map(t => t.task_code).join(", ")}
  Students:   ${students.length} (SIM_E2E_S001 – SIM_E2E_S040)
  Teacher:    SIM_TEACHER_E2E
  Researcher: SIM_RESEARCHER_E2E
  Tag:        ${SIM_TAG}

⚠️  All records tagged SIM_E2E_2026 must be reset before real student pilot.
    See docs/transaction_reset_plan.md for DELETE queries.
`);
