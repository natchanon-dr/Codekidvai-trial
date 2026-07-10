/**
 * e2e-sim-student-flow.mjs
 *
 * Phase 2 — Simulated Student Activity
 * For each of 40 sim students, exercises the REAL application API:
 *   1. supabase.auth.signInWithPassword → get JWT
 *   2. admin client inserts trn_learning_sessions (mimics browser startLearningSession)
 *   3. fetch POST /api/student/run-answer (wrong × 2, then correct/wrong × 1)
 *   4. fetch POST /api/student/submit-answer
 *
 * Distribution:
 *   Students 001–030 (passing):  3 runs per task (wrong×2, correct×1), submit correct
 *   Students 031–040 (at_risk):  3 runs per task (wrong×3),            submit wrong
 *
 * Rules: no direct submission/attempt/rubric inserts — all go through real API.
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
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const API_BASE = "http://localhost:3000";
const PASSWORD = "69056020";
const N_STUDENTS = 40;
const AT_RISK_FROM = 31; // students 031-040 are at_risk

// ── 1. Load batch + tasks + student profiles ──────────────────────────────────
console.log("[0] Loading test data from DB...");
const { data: batch } = await admin
  .from("mst_experiment_batches")
  .select("batch_id, batch_code")
  .eq("batch_code", "TEST_BATCH_E2E_001")
  .single();
if (!batch) throw new Error("TEST_BATCH_E2E_001 not found — run e2e-sim-create-test-data.mjs first");

const { data: taskRows } = await admin
  .from("mst_tasks")
  .select("task_id, task_code, expected_answer, scoring_rubric_json, difficulty_level")
  .like("task_code", "TEST_TASK_SQL_E2E_%")
  .eq("is_active", true)
  .order("task_code");
if (!taskRows?.length) throw new Error("No TEST_TASK_SQL_E2E tasks found");

// Determine correct/wrong SQL per task from rubric keywords or expected_answer
const taskAnswers = taskRows.map(t => {
  const rubric = t.scoring_rubric_json;
  // Correct: use expected_answer
  const correct = (t.expected_answer ?? "SELECT * FROM students;").replace(/;$/, "").trim();
  // Wrong: generic SQL that won't match rubric keywords enough
  const wrong = "SELECT * FROM students";
  return { ...t, correct, wrong };
});
console.log(`  batch: ${batch.batch_code} (${batch.batch_id})`);
console.log(`  tasks: ${taskAnswers.map(t => t.task_code).join(", ")}`);

const { data: profileRows } = await admin
  .from("mst_profiles")
  .select("profile_id, participant_code")
  .like("participant_code", "SIM_E2E_S%")
  .order("participant_code")
  .limit(N_STUDENTS);
console.log(`  students loaded: ${profileRows.length}`);

// ── helpers ───────────────────────────────────────────────────────────────────
async function apiPost(path, body, jwt) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function createSession(profileId, taskId, batchId) {
  const { data, error } = await admin
    .from("trn_learning_sessions")
    .insert({
      profile_id: profileId,
      task_id: taskId,
      batch_id: batchId,
      started_at: new Date().toISOString(),
      status: "in_progress",
      device_type: "desktop",
      browser_name: "SimulatedE2E",
      user_agent: "SIM_E2E_2026/1.0",
      last_event_at: new Date().toISOString(),
    })
    .select("session_id")
    .single();
  if (error) throw new Error(`Session insert: ${error.message}`);
  return data.session_id;
}

// ── 2. Sign in all students first ────────────────────────────────────────────
console.log(`\n[1] Signing in ${N_STUDENTS} students (this may take ~20s)...`);
const studentTokens = new Map(); // participantCode → access_token

for (const prof of profileRows) {
  const num = parseInt(prof.participant_code.replace("SIM_E2E_S", ""), 10);
  const email = `sim.e2e.s${String(num).padStart(3, "0")}@ckv-mock.local`;

  const { data: authData, error } = await anonClient.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !authData?.session?.access_token) {
    console.warn(`  ⚠️  Sign-in failed for ${email}: ${error?.message ?? "no session"}`);
    continue;
  }
  studentTokens.set(prof.participant_code, {
    jwt: authData.session.access_token,
    profileId: prof.profile_id,
  });
  if (num % 10 === 0) process.stdout.write(`  ${num}/${N_STUDENTS} signed in\n`);
}
console.log(`  ✅  ${studentTokens.size} tokens acquired`);

// ── 3. Simulate student flow ──────────────────────────────────────────────────
console.log(`\n[2] Simulating student flow (${profileRows.length} students × ${taskAnswers.length} tasks)...`);

const results = { sessions: 0, runs: 0, submits: 0, errors: [] };
const CONCURRENCY = 5;

async function simulateOneStudent(prof, jwt, profileId, isAtRisk) {
  for (const task of taskAnswers) {
    let sessionId;
    try {
      sessionId = await createSession(profileId, task.task_id, batch.batch_id);
      results.sessions++;
    } catch (e) {
      results.errors.push(`session ${prof} task ${task.task_code}: ${e.message}`);
      continue;
    }

    // Run wrong × 2
    for (let r = 0; r < 2; r++) {
      const run = await apiPost("/api/student/run-answer", {
        session_id: sessionId,
        task_id: task.task_id,
        answer_text: task.wrong,
      }, jwt);
      if (!run.ok) results.errors.push(`run-wrong ${prof} ${task.task_code}: ${run.status}`);
      else results.runs++;
      await new Promise(res => setTimeout(res, 50)); // small delay
    }

    // Run 3rd: correct for passing, wrong for at_risk
    const thirdAnswer = isAtRisk ? task.wrong : task.correct;
    const run3 = await apiPost("/api/student/run-answer", {
      session_id: sessionId,
      task_id: task.task_id,
      answer_text: thirdAnswer,
    }, jwt);
    if (!run3.ok) results.errors.push(`run-3rd ${prof} ${task.task_code}: ${run3.status}`);
    else results.runs++;
    await new Promise(res => setTimeout(res, 50));

    // Submit
    const submitAnswer = isAtRisk ? task.wrong : task.correct;
    const sub = await apiPost("/api/student/submit-answer", {
      session_id: sessionId,
      task_id: task.task_id,
      batch_id: batch.batch_id,
      answer_text: submitAnswer,
    }, jwt);
    if (!sub.ok) results.errors.push(`submit ${prof} ${task.task_code}: ${sub.status} ${JSON.stringify(sub.data).slice(0,120)}`);
    else results.submits++;
    await new Promise(res => setTimeout(res, 80));
  }
}

// Process in batches of CONCURRENCY
const studentList = [...studentTokens.entries()];
let processed = 0;
for (let i = 0; i < studentList.length; i += CONCURRENCY) {
  const chunk = studentList.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map(([code, { jwt, profileId }]) => {
    const num = parseInt(code.replace("SIM_E2E_S", ""), 10);
    const isAtRisk = num >= AT_RISK_FROM;
    return simulateOneStudent(code, jwt, profileId, isAtRisk);
  }));
  processed += chunk.length;
  process.stdout.write(`  ${processed}/${studentList.length} students done\n`);
}

// ── 4. Report ─────────────────────────────────────────────────────────────────
const passing = [...studentTokens.keys()].filter(c => parseInt(c.replace("SIM_E2E_S",""),10) < AT_RISK_FROM).length;
const atRisk = studentTokens.size - passing;

console.log(`
── Student Flow Complete ──
  Sessions created : ${results.sessions}
  Run-answer calls : ${results.runs}
  Submit calls     : ${results.submits}
  Passing students : ${passing} (SIM_E2E_S001–S030, submitted correct SQL)
  At-risk students : ${atRisk}  (SIM_E2E_S031–S040, submitted wrong SQL)
  Errors           : ${results.errors.length}
`);

if (results.errors.length > 0) {
  console.log("Errors (first 10):");
  results.errors.slice(0, 10).forEach(e => console.log("  ⚠️ ", e));
}

console.log("✅  Flow complete — run e2e-sim-verify-db.mjs next");
