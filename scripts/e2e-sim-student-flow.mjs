/**
 * e2e-sim-student-flow.mjs
 *
 * Phase 2 — Simulated Student Activity
 * For each sim student, exercises the REAL application API.
 *
 * CLI args:
 *   --batch         SIM_E2E_2026_001  (required)
 *   --at-risk-rate  35                (% at-risk, default 35)
 *   --missing-rate  7                 (% who skip submit, default 7)
 *   --api-base      http://localhost:3000
 *   --task-ids      uuid,uuid,...     (real task UUIDs; omit for batch dummy tasks)
 *   --concurrency   2                 (student concurrency 1-4; also env MOCK_STUDENT_CONCURRENCY)
 *
 * Flow per student per task (sequential):
 *   run-answer (wrong × 2) → run-answer (correct or wrong) → submit-answer
 *   missing-rate students: do runs but skip submit
 *
 * Concurrency model:
 *   - All students sign in sequentially (250 ms gap) before flow begins.
 *   - During flow, a bounded pool of STUDENT_CONCURRENCY workers run simultaneously.
 *   - Each worker pulls the next student from a shared queue when it finishes.
 *   - Tasks within each student execute strictly sequentially.
 *   - Hard per-request timeout via Promise.race — not reliant on undici abort polling.
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

const BATCH_CODE    = opts["batch"]         ?? "SIM_E2E_2026_001";
const AT_RISK_RATE  = Math.max(0, Math.min(100, parseInt(opts["at-risk-rate"] ?? "35", 10)));
const MISSING_RATE  = Math.max(0, Math.min(100, parseInt(opts["missing-rate"] ?? "7",  10)));
const API_BASE      = opts["api-base"]      ?? "http://localhost:3000";
const REAL_TASK_IDS = opts["task-ids"] ? opts["task-ids"].split(",").filter(Boolean) : [];
const SET_FAMILY    = opts["set-family"]    ?? "assignment";
const SIMULATION_SEED = parseInt(opts["seed"] ?? "42", 10);

// Bounded student concurrency — env overrides CLI, CLI overrides default 2; max 4
const RAW_CONCURRENCY    = parseInt(process.env.MOCK_STUDENT_CONCURRENCY ?? opts["concurrency"] ?? "2", 10);
const STUDENT_CONCURRENCY = Math.max(1, Math.min(4, isNaN(RAW_CONCURRENCY) ? 2 : RAW_CONCURRENCY));

if (!BATCH_CODE.startsWith("SIM_E2E_") && !BATCH_CODE.startsWith("MOCK_")) {
  console.error(`ERROR: Batch code must start with SIM_E2E_ or MOCK_. Got: ${BATCH_CODE}`);
  process.exit(1);
}
const ALLOWED_SET_FAMILIES = ["assignment", "lab", "exam"];
if (!ALLOWED_SET_FAMILIES.includes(SET_FAMILY)) {
  console.error(`ERROR: --set-family must be one of: ${ALLOWED_SET_FAMILIES.join(", ")}. Got: ${SET_FAMILY}`);
  process.exit(1);
}
if (isNaN(SIMULATION_SEED) || SIMULATION_SEED < 0 || SIMULATION_SEED > 2147483647) {
  console.error(`ERROR: --seed must be a non-negative integer (0–2147483647). Got: ${opts["seed"]}`);
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

// ── Seeded PRNG (Mulberry32 — no npm dependency) ──────────────────────────────
// Returns a PRNG function from a 32-bit seed. Same seed always produces the same sequence.
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix base seed with index values to produce a stable per-student+task seed.
function deriveSeed(base, ...parts) {
  let s = base >>> 0;
  for (const p of parts) {
    s = Math.imul(s ^ (p >>> 0), 0x9E3779B9) >>> 0;
    s = (s ^ (s >>> 16)) >>> 0;
  }
  return s;
}

// ── Behavior profiles ─────────────────────────────────────────────────────────
// Each set family drives distinct simulation behavior — measurable in run count,
// session count, and session start time spread in the exported dataset.
//
// EXAM LIMITATION: The run-answer API (/api/student/run-answer) always returns
// is_correct, score, and error_type in its response body. A real exam would not
// reveal correctness during the attempt. This Exam profile simulation cannot
// suppress that API feedback — it approximates exam conditions via run-count caps
// and single-session enforcement only, not via feedback suppression.
//
// HINT LIMITATION: No /api/student/hint route exists. hint_viewed/hint_open events
// are not generated. The hint probability fields below are documented for future use.
const BEHAVIOR_PROFILES = {
  assignment: {
    name: "assignment",
    runsMin: 3,          // total run-answer calls per student per task
    runsMax: 5,
    sessionsMin: 1,
    sessionsMax: 2,      // 40% chance of a second session (see simulateOneStudent)
    sessionGapHours: 4,  // synthetic session-start offset for multi-session (hours)
    runDelayMs: 50,      // API rate-limiting pause between run calls
    submitDelayMs: 80,
    hintProbability: 0.30, // documented only — hint API not yet implemented
  },
  lab: {
    name: "lab",
    runsMin: 4,
    runsMax: 6,
    sessionsMin: 1,
    sessionsMax: 1,      // always single session
    sessionGapHours: 0,
    runDelayMs: 30,
    submitDelayMs: 50,
    hintProbability: 0.20,
  },
  exam: {
    name: "exam",
    runsMin: 1,
    runsMax: 2,          // capped — exam limits attempts
    sessionsMin: 1,
    sessionsMax: 1,      // enforced single session
    sessionGapHours: 0,
    runDelayMs: 40,
    submitDelayMs: 60,
    hintProbability: 0.0, // enforced zero — no hints in exam conditions
  },
};

const CURRENT_PROFILE = BEHAVIOR_PROFILES[SET_FAMILY] ?? BEHAVIOR_PROFILES.assignment;

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

const N_STUDENTS   = profileRows.length;
const atRiskFrom   = N_STUDENTS - Math.round(N_STUDENTS * AT_RISK_RATE / 100) + 1;
const missingCount = Math.round(N_STUDENTS * MISSING_RATE / 100);

// Workload estimation — uses profile average run count
const avgRunsPerTask    = Math.round((CURRENT_PROFILE.runsMin + CURRENT_PROFILE.runsMax) / 2);
const runAnswerTotal    = N_STUDENTS * taskAnswers.length * avgRunsPerTask;
const submitAnswerTotal = (N_STUDENTS - missingCount) * taskAnswers.length;
const estimatedSeconds  = Math.round((runAnswerTotal + submitAnswerTotal) * 0.4);
const totalCallsEst     = runAnswerTotal + submitAnswerTotal;

console.log(`[WORKLOAD] ${JSON.stringify({
  students: N_STUDENTS, tasks: taskAnswers.length,
  runAnswerCalls: runAnswerTotal, submitAnswerCalls: submitAnswerTotal,
  totalCalls: totalCallsEst, estimatedSeconds,
  studentConcurrency: STUDENT_CONCURRENCY,
})}`);
console.log(`  batch       : ${batch.batch_code} (${batch.batch_id})`);
console.log(`  tasks       : ${taskAnswers.length}`);
console.log(`  students    : ${N_STUDENTS}  concurrency: ${STUDENT_CONCURRENCY}`);
console.log(`  at-risk     : student ${atRiskFrom}+ (${Math.round(N_STUDENTS * AT_RISK_RATE / 100)} students)`);
console.log(`  missing     : ${missingCount} students`);
console.log(`  est. calls  : ${totalCallsEst} (run=${runAnswerTotal} submit=${submitAnswerTotal})`);
console.log(`  est. time   : ~${Math.ceil(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`);
console.log(`  set_family  : ${SET_FAMILY}`);
console.log(`  sim_seed    : ${SIMULATION_SEED}`);
console.log(`  profile     : ${CURRENT_PROFILE.name}  runs=${CURRENT_PROFILE.runsMin}-${CURRENT_PROFILE.runsMax}  sessions=${CURRENT_PROFILE.sessionsMin}-${CURRENT_PROFILE.sessionsMax}`);
console.log(`[MANIFEST] ${JSON.stringify({
  simulation_seed: SIMULATION_SEED,
  behavior_profile: CURRENT_PROFILE.name,
  behavior_profile_version: "1.0",
  set_family: SET_FAMILY,
})}`);

// ── helpers ───────────────────────────────────────────────────────────────────
const SLOW_THRESHOLD_MS  = 5000;
const REQUEST_TIMEOUT_MS = 30000;

// Shared counters (single-threaded event loop — no locking needed)
let completedCalls    = 0;
let totalApiCalls     = totalCallsEst;
let flowStartTime     = 0;
let activeStudents    = 0;
let completedStudents = 0;
let timeoutCount      = 0;
const requestDurations = [];
let slowestMs = 0;
let slowestEndpoint = "";
const endpointCounts   = { login: 0, "run-answer": 0, "submit-answer": 0 };
const endpointTimeouts = { login: 0, "run-answer": 0, "submit-answer": 0 };

function endpointKey(path) {
  if (path.includes("run-answer"))   return "run-answer";
  if (path.includes("submit-answer")) return "submit-answer";
  return "login";
}

/**
 * Instrumented fetch with a hard 30-second wall-clock timeout via Promise.race.
 * Unlike an AbortController alone, the race rejects immediately when the timer
 * fires — it does not depend on undici checking the abort signal.
 *
 * On timeout: throws an error flagged { isTimeout: true }.
 * Callers should let the error propagate to stop the pipeline.
 */
async function timedFetch(path, body, jwt, label, ctx = {}) {
  const url    = `${API_BASE}${path}`;
  const t0     = Date.now();
  const ctxTag = ctx.student ? ` [${ctx.student}][${ctx.task}]` : "";
  const epKey  = endpointKey(path);
  console.log(`    [HTTP] START${ctxTag} ${label} → POST ${path}`);

  // AbortController — best-effort, may be slow in undici on keep-alive connections
  const controller = new AbortController();
  let killTimer;

  // Hard-timeout promise — resolves the race at exactly REQUEST_TIMEOUT_MS
  const timeoutPromise = new Promise((_, reject) => {
    killTimer = setTimeout(() => {
      controller.abort(); // best-effort close of the underlying TCP stream
      const ms = Date.now() - t0;
      reject(Object.assign(
        new Error(`TIMEOUT: ${label} on ${path}${ctxTag} after ${ms}ms`),
        { isTimeout: true, endpoint: epKey, student: ctx.student, task: ctx.task, op: label, ms }
      ));
    }, REQUEST_TIMEOUT_MS);
  });

  let res, text;
  try {
    ({ res, text } = await Promise.race([
      (async () => {
        const r = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body:    JSON.stringify(body),
          signal:  controller.signal,
        });
        const t = await r.text();
        return { res: r, text: t };
      })(),
      timeoutPromise,
    ]));
    clearTimeout(killTimer);
  } catch (err) {
    clearTimeout(killTimer);
    controller.abort();
    const ms = Date.now() - t0;

    if (err.isTimeout || err.name === "AbortError") {
      timeoutCount++;
      endpointTimeouts[epKey] = (endpointTimeouts[epKey] ?? 0) + 1;
      console.log([
        `    [HTTP] TIMEOUT${ctxTag} ${label}`,
        `endpoint=${path} student=${ctx.student ?? "—"} task=${ctx.task ?? "—"}`,
        `op=${label} elapsed=${ms}ms`,
        `— stopping pipeline`,
      ].join("  "));
      // Re-throw with consistent flag so simulateOneStudent propagates it
      throw Object.assign(
        new Error(`TIMEOUT: ${label} on ${path}${ctxTag} after ${ms}ms`),
        { isTimeout: true }
      );
    }

    console.log(`    [HTTP] ERROR${ctxTag} ${label} → ${err.message} (${ms}ms)`);
    return { ok: false, status: 0, data: null };
  }

  const ms = Date.now() - t0;
  requestDurations.push(ms);
  endpointCounts[epKey] = (endpointCounts[epKey] ?? 0) + 1;
  if (ms > slowestMs) { slowestMs = ms; slowestEndpoint = `${label}:${path}`; }

  console.log(`    [HTTP] ${res.ok ? "DONE " : "FAIL "} ${ctxTag} ${label} → ${res.status} (${ms}ms)`);
  if (ms >= SLOW_THRESHOLD_MS) {
    console.log(`    [HTTP] WARNING${ctxTag} ${label} took ${ms}ms — exceeded ${SLOW_THRESHOLD_MS}ms threshold`);
  }

  completedCalls++;
  const elapsedMs = Date.now() - flowStartTime;
  const avgMs     = completedCalls > 0 ? elapsedMs / completedCalls : 0;
  const etaSec    = totalApiCalls > 0
    ? Math.round(avgMs * Math.max(0, totalApiCalls - completedCalls) / 1000)
    : 0;
  console.log(`[PROGRESS] ${JSON.stringify({
    ...ctx,
    activeStudents,
    completedStudents,
    totalStudents: N_STUDENTS,
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

async function createSession(profileId, taskId, batchId, startedAt) {
  const ts = startedAt ?? new Date().toISOString();
  const { data, error } = await admin.from("trn_learning_sessions").insert({
    profile_id: profileId, task_id: taskId, batch_id: batchId,
    started_at: ts, status: "in_progress",
    device_type: "desktop", browser_name: "SimulatedE2E",
    user_agent: `${BATCH_CODE}/1.0`, last_event_at: ts,
  }).select("session_id").single();
  if (error) throw new Error(`Session insert: ${error.message}`);
  return data.session_id;
}

// ── 2. Sign in all students (sequential with 250 ms gap) ──────────────────────
console.log(`\n[1] Signing in ${N_STUDENTS} students...`);
const studentTokens = new Map();

for (const prof of profileRows) {
  const email   = `${prof.participant_code.toLowerCase().replace(/_/g, ".")}@ckv-mock.local`;
  const loginT0 = Date.now();
  const { data: authData, error } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  const loginMs = Date.now() - loginT0;

  if (error || !authData?.session?.access_token) {
    console.warn(`  ⚠️  Login ✗ ${prof.participant_code} (${loginMs}ms): ${error?.message ?? "no session"}`);
    await new Promise(r => setTimeout(r, 500));
    continue;
  }
  studentTokens.set(prof.participant_code, { jwt: authData.session.access_token, profileId: prof.profile_id });
  endpointCounts["login"]++;
  const num     = parseInt(prof.participant_code.split("_S").pop() ?? "0", 10);
  const slowTag = loginMs >= SLOW_THRESHOLD_MS ? ` ⚠️ SLOW` : "";
  if (num % 5 === 0 || loginMs >= SLOW_THRESHOLD_MS) {
    console.log(`  Login ✓ ${prof.participant_code} (${loginMs}ms)${slowTag}`);
  }
  await new Promise(r => setTimeout(r, 250)); // rate-limit protection
}
console.log(`  ✅ ${studentTokens.size} tokens acquired`);

// ── 3. Simulate student flow — bounded concurrency pool ───────────────────────
flowStartTime = Date.now();
const studentList  = [...studentTokens.entries()];
const missingSet   = new Set(studentList.slice(0, missingCount).map(([c]) => c));
const totalStudents = studentList.length;

console.log(`\n[2] Simulating student flow`);
console.log(`    ${totalStudents} students × ${taskAnswers.length} tasks`);
console.log(`    concurrency=${STUDENT_CONCURRENCY}  est. calls=${totalApiCalls}`);

const results = { sessions: 0, runs: 0, submits: 0, skipped: 0, errors: [] };

/**
 * Simulate one student: tasks are strictly sequential.
 * Behavior is driven by CURRENT_PROFILE (assignment/lab/exam) and a per-student+task
 * seeded PRNG so that the same seed+family+studentIdx+taskIdx always produces the
 * same run count, session count, and answer sequence.
 */
async function simulateOneStudent(code, jwt, profileId, isAtRisk, isMissing, studentIdx) {
  const taskCount = taskAnswers.length;
  for (let ti = 0; ti < taskCount; ti++) {
    const task      = taskAnswers[ti];
    const taskLabel = task.task_code ?? task.task_id;
    const ctx       = { student: `S${studentIdx}/${totalStudents}`, task: `T${ti + 1}/${taskCount}` };
    const prefix    = `  [S${studentIdx}/${totalStudents}][T${ti + 1}/${taskCount}] ${code}/${taskLabel}`;

    // Per-student+task seeded PRNG — deterministic given seed+studentIdx+ti
    const rng = mulberry32(deriveSeed(SIMULATION_SEED, studentIdx, ti));

    // Total runs and session count from profile + seeded RNG
    const runRange    = CURRENT_PROFILE.runsMax - CURRENT_PROFILE.runsMin + 1;
    const totalRuns   = CURRENT_PROFILE.runsMin + Math.floor(rng() * runRange);
    const numSessions = CURRENT_PROFILE.sessionsMax > CURRENT_PROFILE.sessionsMin && rng() < 0.4
      ? CURRENT_PROFILE.sessionsMax : CURRENT_PROFILE.sessionsMin;

    // Multi-session (assignment only): session 1 gets ceil(total/2) runs without submit;
    // final session gets the remainder + submit.
    const runsPerSession = numSessions > 1
      ? [Math.ceil(totalRuns / 2), totalRuns - Math.ceil(totalRuns / 2)]
      : [totalRuns];

    // Synthetic session start times spread by sessionGapHours — written to started_at
    // so the exported dataset reflects distinct session windows for assignment vs lab/exam.
    const sessionBaseMs = Date.now() - (numSessions > 1 ? CURRENT_PROFILE.sessionGapHours * 3_600_000 : 0);

    for (let si = 0; si < numSessions; si++) {
      const isLastSession = si === numSessions - 1;
      const sessionRuns   = runsPerSession[si] ?? 1;
      const startedAt     = new Date(sessionBaseMs + si * CURRENT_PROFILE.sessionGapHours * 3_600_000).toISOString();

      let sessionId;
      try {
        sessionId = await createSession(profileId, task.task_id, batch.batch_id, startedAt);
        results.sessions++;
      } catch (e) {
        results.errors.push(`session ${code} ${taskLabel}: ${e.message}`);
        continue;
      }
      console.log(`${prefix} — session ${si + 1}/${numSessions} (profile=${CURRENT_PROFILE.name} runs=${sessionRuns})`);

      for (let r = 0; r < sessionRuns; r++) {
        const isFinalRun = isLastSession && r === sessionRuns - 1;
        const answer     = (isFinalRun && !isAtRisk) ? task.correct : task.wrong;
        const run = await apiPost("/api/student/run-answer", {
          session_id: sessionId, task_id: task.task_id, answer_text: answer,
        }, jwt, `run-s${si + 1}-r${r + 1}`, ctx);
        if (run.ok) results.runs++;
        else results.errors.push(`run ${code} ${taskLabel}: ${run.status}`);
        console.log(`${prefix} Run (s${si + 1} r${r + 1}/${sessionRuns}) ${run.ok ? "✓" : "✗"}${isFinalRun ? (isAtRisk ? " [wrong-final]" : " [correct]") : ""}`);
        await new Promise(res => setTimeout(res, CURRENT_PROFILE.runDelayMs));
      }

      if (isLastSession && !isMissing) {
        const sub = await apiPost("/api/student/submit-answer", {
          session_id: sessionId, task_id: task.task_id, batch_id: batch.batch_id,
          answer_text: isAtRisk ? task.wrong : task.correct,
        }, jwt, "submit", ctx);
        if (sub.ok) results.submits++;
        else results.errors.push(`submit ${code} ${taskLabel}: ${sub.status}`);
        console.log(`${prefix} Submit ${sub.ok ? "✓" : "✗"}`);
        await new Promise(res => setTimeout(res, CURRENT_PROFILE.submitDelayMs));
      } else if (isLastSession && isMissing) {
        results.skipped++;
      } else {
        // Minimal gap before next session
        await new Promise(res => setTimeout(res, 50));
      }
    }
  }
}

/**
 * Bounded concurrency pool — iterator-based.
 * Keeps exactly `concurrency` workers alive until the queue is empty.
 * If any worker throws, Promise.all propagates the first rejection immediately.
 */
async function runPool(items, concurrency, fn) {
  const iter = items[Symbol.iterator]();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (let next = iter.next(); !next.done; next = iter.next()) {
      await fn(next.value);
    }
  });
  await Promise.all(workers);
}

// Build the work items list
const workItems = studentList.map(([code, { jwt, profileId }], i) => {
  const num      = parseInt(code.split("_S").pop() ?? "0", 10);
  const isAtRisk = num >= atRiskFrom;
  const isMissing = missingSet.has(code);
  return { code, jwt, profileId, isAtRisk, isMissing, studentIdx: i + 1 };
});

await runPool(workItems, STUDENT_CONCURRENCY, async ({ code, jwt, profileId, isAtRisk, isMissing, studentIdx }) => {
  activeStudents++;
  console.log(`\n── [S${studentIdx}/${totalStudents}] START ${code} (${isAtRisk ? "at-risk" : "passing"}${isMissing ? ", missing" : ""})  active=${activeStudents}`);
  try {
    await simulateOneStudent(code, jwt, profileId, isAtRisk, isMissing, studentIdx);
  } finally {
    activeStudents--;
    completedStudents++;
    console.log(`── [S${studentIdx}/${totalStudents}] DONE  ${code}  completed=${completedStudents}/${totalStudents}  active=${activeStudents}`);
  }
});

// ── 4. Summary ────────────────────────────────────────────────────────────────
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
  Timeouts   : ${timeoutCount}
`);
if (results.errors.length > 0) {
  results.errors.slice(0, 10).forEach(e => console.log(`  ⚠️  ${e}`));
}

// ── 5. Stats ──────────────────────────────────────────────────────────────────
const sorted   = [...requestDurations].sort((a, b) => a - b);
const p50      = sorted.length ? sorted[Math.floor(sorted.length * 0.50)] : 0;
const p95      = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
const totalDurationSec = Math.round((Date.now() - flowStartTime) / 1000);

console.log(`[STATS] ${JSON.stringify({
  totalRequests: sorted.length,
  totalDurationSec,
  slowestMs,
  slowestEndpoint,
  p50Ms: p50,
  p95Ms: p95,
  timeoutCount,
  endpointCounts,
  endpointTimeouts,
  studentConcurrency: STUDENT_CONCURRENCY,
})}`);
console.log(`  p50=${p50}ms  p95=${p95}ms  slowest=${slowestMs}ms (${slowestEndpoint})`);
console.log(`  total=${totalDurationSec}s  timeouts=${timeoutCount}`);
console.log(`  endpoint counts: run-answer=${endpointCounts["run-answer"]}  submit-answer=${endpointCounts["submit-answer"]}  login=${endpointCounts["login"]}`);
console.log("✅ Flow complete.");
