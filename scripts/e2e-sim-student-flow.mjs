/**
 * e2e-sim-student-flow.mjs
 *
 * Phase 2 — Simulated Student Activity
 * For each sim student, exercises the REAL application API.
 *
 * CLI args:
 *   --batch         SIM_E2E_2026_001  (required)
 *   --students      40                (total students to process, default: all in batch)
 *   --at-risk-rate  35                (% at-risk, default 35)
 *   --missing-rate  7                 (% who skip submit, default 7)
 *   --api-base      http://localhost:3000
 *
 * Flow per student per task:
 *   run-answer (wrong × 2) → run-answer (correct or wrong) → submit-answer
 *   missing-rate students: do runs but skip submit
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

const BATCH_CODE   = opts["batch"]         ?? "SIM_E2E_2026_001";
const AT_RISK_RATE = Math.max(0, Math.min(100, parseInt(opts["at-risk-rate"] ?? "35", 10)));
const MISSING_RATE = Math.max(0, Math.min(100, parseInt(opts["missing-rate"] ?? "7",  10)));
const API_BASE     = opts["api-base"]      ?? "http://localhost:3000";
// real task IDs — when provided, load tasks by ID instead of BATCH_CODE_T% pattern
const REAL_TASK_IDS = opts["task-ids"] ? opts["task-ids"].split(",").filter(Boolean) : [];

if (!BATCH_CODE.startsWith("SIM_E2E_") && !BATCH_CODE.startsWith("MOCK_")) {
  console.error(`ERROR: Batch code must start with SIM_E2E_ or MOCK_. Got: ${BATCH_CODE}`);
  process.exit(1);
}

const PASSWORD = "69056020";

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
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── 1. Load batch + tasks + student profiles ──────────────────────────────────
console.log(`[0] Loading test data for batch ${BATCH_CODE}...`);
const { data: batch } = await admin.from("mst_experiment_batches")
  .select("batch_id, batch_code").eq("batch_code", BATCH_CODE).single();
if (!batch) throw new Error(`Batch ${BATCH_CODE} not found — run e2e-sim-create-test-data.mjs first`);

let taskQuery = admin.from("mst_tasks")
  .select("task_id, task_code, expected_sql, scoring_rubric_json, difficulty_level")
  .eq("is_active", true);
if (REAL_TASK_IDS.length > 0) {
  taskQuery = taskQuery.in("task_id", REAL_TASK_IDS);
} else {
  taskQuery = taskQuery.like("task_code", `${BATCH_CODE}_T%`).order("task_code");
}
const { data: taskRows } = await taskQuery;
if (!taskRows?.length) throw new Error(`No tasks found for batch ${BATCH_CODE}`);

// Derive correct/wrong answer per task from expected_sql
const taskAnswers = taskRows.map(t => ({
  ...t,
  correct: (t.expected_sql ?? "SELECT * FROM students").replace(/;$/, "").trim(),
  wrong:   "SELECT name FROM nonexistent_table_xyz",
}));

const { data: profileRows } = await admin.from("mst_profiles")
  .select("profile_id, participant_code")
  .like("participant_code", `${BATCH_CODE}_S%`)
  .order("participant_code");
if (!profileRows?.length) throw new Error(`No student profiles found for batch ${BATCH_CODE}`);

const N_STUDENTS  = profileRows.length;
const atRiskFrom  = N_STUDENTS - Math.round(N_STUDENTS * AT_RISK_RATE / 100) + 1;
const missingCount = Math.round(N_STUDENTS * MISSING_RATE / 100);

// Workload estimation (machine-readable for UI + human-readable)
const runAnswerTotal    = N_STUDENTS * taskAnswers.length * 3; // 2 wrong + 1 final per task
const submitAnswerTotal = (N_STUDENTS - missingCount) * taskAnswers.length;
const estimatedSeconds  = Math.round((runAnswerTotal + submitAnswerTotal) * 0.4);

const totalCallsEst = runAnswerTotal + submitAnswerTotal;

console.log(`[WORKLOAD] ${JSON.stringify({
  students: N_STUDENTS, tasks: taskAnswers.length,
  runAnswerCalls: runAnswerTotal, submitAnswerCalls: submitAnswerTotal,
  totalCalls: totalCallsEst, estimatedSeconds,
})}`);

console.log(`  batch  : ${batch.batch_code} (${batch.batch_id})`);
console.log(`  tasks  : ${taskAnswers.length} loaded → ${taskAnswers.length} simulated`);
console.log(`  students loaded: ${N_STUDENTS}`);
console.log(`  at-risk threshold: student ${atRiskFrom}+ (${Math.round(N_STUDENTS * AT_RISK_RATE / 100)} students)`);
console.log(`  missing-submit: ${missingCount} students`);
console.log(`  estimated API calls: ${totalCallsEst} (run=${runAnswerTotal} submit=${submitAnswerTotal})`);
console.log(`  estimated duration: ~${Math.ceil(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`);

// ── helpers ───────────────────────────────────────────────────────────────────
const SLOW_THRESHOLD_MS  = 5000;
const REQUEST_TIMEOUT_MS = 30000;

// Shared counters — safe in single-threaded Node.js event loop
let completedCalls  = 0;
let totalApiCalls   = runAnswerTotal + submitAnswerTotal;
let flowStartTime   = 0; // set at start of student flow
const requestDurations = [];
let slowestMs = 0;
let slowestEndpoint = "";

/**
 * Instrumented fetch with 30-second hard timeout.
 * Throws on timeout — caller should let the error propagate to stop the pipeline.
 * @param {string} ctx.student  "S3/10"
 * @param {string} ctx.task     "T2/5"
 */
async function timedFetch(path, body, jwt, label, ctx = {}) {
  const url = `${API_BASE}${path}`;
  const t0 = Date.now();
  const ctxTag = ctx.student ? ` [${ctx.student}][${ctx.task}]` : "";
  console.log(`    [HTTP] START ${ctxTag} ${label} → POST ${path}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res, text;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await res.text();
    clearTimeout(timeout);
  } catch (err) {
    clearTimeout(timeout);
    const ms = Date.now() - t0;
    if (err.name === "AbortError") {
      console.log(`    [HTTP] TIMEOUT${ctxTag} ${label} → no response after ${ms}ms — stopping pipeline`);
      throw new Error(`TIMEOUT: ${label} on ${path}${ctxTag} after ${ms}ms`);
    }
    console.log(`    [HTTP] ERROR ${ctxTag} ${label} → ${err.message} (${ms}ms)`);
    return { ok: false, status: 0, data: null };
  }

  const ms = Date.now() - t0;
  requestDurations.push(ms);
  if (ms > slowestMs) { slowestMs = ms; slowestEndpoint = `${label}:${path}`; }

  console.log(`    [HTTP] ${res.ok ? "DONE " : "FAIL "} ${ctxTag} ${label} → ${res.status} (${ms}ms)`);
  if (ms >= SLOW_THRESHOLD_MS) {
    console.log(`    [HTTP] WARNING${ctxTag} ${label} took ${ms}ms — exceeded ${SLOW_THRESHOLD_MS}ms threshold`);
  }

  // Emit machine-readable progress for the UI
  completedCalls++;
  const elapsedMs = Date.now() - flowStartTime;
  const avgMs     = elapsedMs / completedCalls;
  const etaSec    = totalApiCalls > 0
    ? Math.round(avgMs * Math.max(0, totalApiCalls - completedCalls) / 1000)
    : 0;
  console.log(`[PROGRESS] ${JSON.stringify({
    ...ctx,
    op: label,
    completedCalls,
    totalCalls: totalApiCalls,
    elapsedMs,
    etaSec,
  })}`);

  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function apiPost(path, body, jwt, label, ctx) {
  return timedFetch(path, body, jwt, label ?? path, ctx);
}

async function createSession(profileId, taskId, batchId) {
  const { data, error } = await admin.from("trn_learning_sessions").insert({
    profile_id: profileId, task_id: taskId, batch_id: batchId,
    started_at: new Date().toISOString(), status: "in_progress",
    device_type: "desktop", browser_name: "SimulatedE2E",
    user_agent: `${BATCH_CODE}/1.0`, last_event_at: new Date().toISOString(),
  }).select("session_id").single();
  if (error) throw new Error(`Session insert: ${error.message}`);
  return data.session_id;
}

// ── 2. Sign in all students ───────────────────────────────────────────────────
console.log(`\n[1] Signing in ${N_STUDENTS} students...`);
const studentTokens = new Map();

for (const prof of profileRows) {
  // Email derived from participant_code
  const email = `${prof.participant_code.toLowerCase().replace(/_/g, ".")}@ckv-mock.local`;
  const loginT0 = Date.now();
  const { data: authData, error } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  const loginMs = Date.now() - loginT0;
  if (error || !authData?.session?.access_token) {
    console.warn(`  ⚠️  Login ✗ ${prof.participant_code} (${loginMs}ms): ${error?.message ?? "no session"}`);
    await new Promise(r => setTimeout(r, 500));
    continue;
  }
  studentTokens.set(prof.participant_code, { jwt: authData.session.access_token, profileId: prof.profile_id });
  const num = parseInt(prof.participant_code.split("_S").pop() ?? "0", 10);
  const slowTag = loginMs >= SLOW_THRESHOLD_MS ? ` ⚠️ SLOW (${loginMs}ms)` : ``;
  if (num % 5 === 0 || loginMs >= SLOW_THRESHOLD_MS) console.log(`  Login ✓ ${prof.participant_code} (${loginMs}ms)${slowTag}`);
  await new Promise(r => setTimeout(r, 250));
}
console.log(`  ✅ ${studentTokens.size} tokens acquired`);

// ── 3. Simulate student flow ──────────────────────────────────────────────────
flowStartTime = Date.now();
console.log(`\n[2] Simulating student flow (${studentTokens.size} students × ${taskAnswers.length} tasks, ${totalApiCalls} est. API calls)...`);

const results = { sessions: 0, runs: 0, submits: 0, skipped: 0, errors: [] };
const CONCURRENCY = 5;

async function simulateOneStudent(code, jwt, profileId, isAtRisk, isMissing, studentIdx, totalStudents) {
  const taskCount = taskAnswers.length;
  for (let ti = 0; ti < taskCount; ti++) {
    const task = taskAnswers[ti];
    const taskLabel = task.task_code ?? task.task_id;
    let sessionId;
    try {
      sessionId = await createSession(profileId, task.task_id, batch.batch_id);
      results.sessions++;
    } catch (e) {
      results.errors.push(`session ${code} ${taskLabel}: ${e.message}`);
      continue;
    }

    const prefix = `  [S${studentIdx}/${totalStudents}][T${ti+1}/${taskCount}] ${code}/${taskLabel}`;
    const ctx = { student: `S${studentIdx}/${totalStudents}`, task: `T${ti+1}/${taskCount}` };
    console.log(`${prefix} — starting`);

    // Run wrong × 2
    for (let r = 0; r < 2; r++) {
      const run = await apiPost("/api/student/run-answer", {
        session_id: sessionId, task_id: task.task_id, answer_text: task.wrong,
      }, jwt, `run-wrong-${r+1}`, ctx);
      if (run.ok) results.runs++;
      else results.errors.push(`run-wrong ${code} ${taskLabel}: ${run.status}`);
      console.log(`${prefix} Run SQL (wrong ${r+1}/2) ${run.ok ? "✓" : "✗"}`);
      await new Promise(r => setTimeout(r, 50));
    }

    // 3rd run: correct for passing, wrong for at_risk
    const run3 = await apiPost("/api/student/run-answer", {
      session_id: sessionId, task_id: task.task_id,
      answer_text: isAtRisk ? task.wrong : task.correct,
    }, jwt, `run-final`, ctx);
    if (run3.ok) results.runs++;
    else results.errors.push(`run-3rd ${code} ${taskLabel}: ${run3.status}`);
    console.log(`${prefix} Run SQL (final) ${run3.ok ? "✓" : "✗"}`);
    await new Promise(r => setTimeout(r, 50));

    // Submit (skip if missing)
    if (isMissing) { results.skipped++; continue; }
    const sub = await apiPost("/api/student/submit-answer", {
      session_id: sessionId, task_id: task.task_id, batch_id: batch.batch_id,
      answer_text: isAtRisk ? task.wrong : task.correct,
    }, jwt, `submit`, ctx);
    if (sub.ok) results.submits++;
    else results.errors.push(`submit ${code} ${taskLabel}: ${sub.status}`);
    console.log(`${prefix} Submit ${sub.ok ? "✓" : "✗"}`);
    await new Promise(r => setTimeout(r, 80));
  }
}

const studentList = [...studentTokens.entries()];
const missingSet = new Set(studentList.slice(0, missingCount).map(([c]) => c));
let processed = 0;

const totalStudents = studentList.length;
for (let i = 0; i < studentList.length; i += CONCURRENCY) {
  const chunk = studentList.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map(([code, { jwt, profileId }], ci) => {
    const globalIdx = i + ci + 1;
    const num = parseInt(code.split("_S").pop() ?? "0", 10);
    const isAtRisk = num >= atRiskFrom;
    const isMissing = missingSet.has(code);
    console.log(`\nStudent ${globalIdx}/${totalStudents} — ${code} (${isAtRisk ? "at-risk" : "passing"}${isMissing ? ", missing" : ""})`);
    return simulateOneStudent(code, jwt, profileId, isAtRisk, isMissing, globalIdx, totalStudents);
  }));
  processed += chunk.length;
  console.log(`── chunk done: ${processed}/${totalStudents} students ──`);
}

// ── 4. Report ─────────────────────────────────────────────────────────────────
const passing = studentList.filter(([c]) => parseInt(c.split("_S").pop() ?? "0", 10) < atRiskFrom).length;
const atRisk  = studentTokens.size - passing;

console.log(`
── Student Flow Complete ──
  Sessions   : ${results.sessions}
  Run calls  : ${results.runs}
  Submits    : ${results.submits}
  Skipped    : ${results.skipped} (missing-rate)
  Passing    : ${passing}
  At-risk    : ${atRisk}
  Errors     : ${results.errors.length}
`);
if (results.errors.length > 0) {
  results.errors.slice(0, 10).forEach(e => console.log(`  ⚠️  ${e}`));
}
// ── 5. Stats report ───────────────────────────────────────────────────────────
const sorted = [...requestDurations].sort((a, b) => a - b);
const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
const totalDurationSec = Math.round((Date.now() - flowStartTime) / 1000);
console.log(`[STATS] ${JSON.stringify({
  totalRequests: sorted.length,
  totalDurationSec,
  slowestMs,
  slowestEndpoint,
  p50Ms: p50,
  p95Ms: p95,
})}`);
console.log(`  p50=${p50}ms  p95=${p95}ms  slowest=${slowestMs}ms (${slowestEndpoint})  total=${totalDurationSec}s`);
console.log("✅ Flow complete.");
