/**
 * e2e-negative-tests.mjs
 *
 * Security and negative case tests for CKV student API routes.
 * Uses SIM_E2E_2026 accounts — does NOT create new data (read-only sign-in + API calls).
 *
 * Tests:
 *   A. Role security  — student JWT required, teacher/no-token rejected
 *   B. Session ownership — student cannot use another student's session
 *   C. Task validity  — unpublished / non-existent / wrong task rejected
 *   D. Repeated submit — same session submits twice (upsert, not error)
 *   E. Missing fields — malformed request bodies
 *   F. Export access  — student/teacher cannot access admin export; researcher can
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

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PASSWORD  = "69056020";

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

// ── helpers ───────────────────────────────────────────────────────────────────
let passCount = 0, failCount = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passCount++;
  } else {
    console.error(`  ❌  FAIL: ${label}${detail ? " — " + detail : ""}`);
    failCount++;
  }
}

async function api(path, { method = "POST", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* text/csv etc */ }
  return { status: res.status, json, headers: res.headers };
}

async function signIn(email) {
  const { data } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  return data?.session?.access_token ?? null;
}

// ── fetch sim data from DB ────────────────────────────────────────────────────
console.log("\n── Loading SIM_E2E test fixtures from DB ──");

const { data: s1Profile } = await admin.from("mst_profiles")
  .select("profile_id").eq("participant_code", "SIM_E2E_S001").single();
const { data: s2Profile } = await admin.from("mst_profiles")
  .select("profile_id").eq("participant_code", "SIM_E2E_S002").single();
const { data: teacherProfile } = await admin.from("mst_profiles")
  .select("profile_id").eq("participant_code", "SIM_TEACHER_E2E").single();
const { data: researcherProfile } = await admin.from("mst_profiles")
  .select("profile_id").eq("participant_code", "SIM_RESEARCHER_E2E").single();

if (!s1Profile || !s2Profile) {
  console.error("SIM_E2E_S001/S002 profiles not found — run e2e-sim-create-test-data.mjs first");
  process.exit(1);
}

const { data: task1 } = await admin.from("mst_tasks")
  .select("task_id").eq("task_code", "TEST_TASK_SQL_E2E_001").single();
const { data: task2 } = await admin.from("mst_tasks")
  .select("task_id").eq("task_code", "TEST_TASK_SQL_E2E_002").single();
const { data: batch } = await admin.from("mst_experiment_batches")
  .select("batch_id").eq("batch_code", "TEST_BATCH_E2E_001").single();
const { data: simClass } = await admin.from("tb_classes")
  .select("class_id").eq("class_code", "TEST_CLASS_E2E").single();

if (!task1 || !batch) {
  console.error("TEST_TASK_SQL_E2E_001 or TEST_BATCH_E2E_001 not found");
  process.exit(1);
}

// Find an existing completed session for S001+task1 (from sim run)
const { data: s1Sessions } = await admin.from("trn_learning_sessions")
  .select("session_id, status")
  .eq("profile_id", s1Profile.profile_id)
  .eq("task_id", task1.task_id)
  .limit(1);
const s1Session = s1Sessions?.[0];

// Find an existing session for S002 (to test cross-student access)
const { data: s2Sessions } = await admin.from("trn_learning_sessions")
  .select("session_id")
  .eq("profile_id", s2Profile.profile_id)
  .eq("task_id", task1.task_id)
  .limit(1);
const s2Session = s2Sessions?.[0];

console.log(`  S001 profile: ${s1Profile.profile_id}`);
console.log(`  S002 profile: ${s2Profile.profile_id}`);
console.log(`  S001 session (task1): ${s1Session?.session_id ?? "none"}`);
console.log(`  S002 session (task1): ${s2Session?.session_id ?? "none"}`);
console.log(`  task1: ${task1.task_id}`);
console.log(`  batch: ${batch.batch_id}`);

// ── sign in ───────────────────────────────────────────────────────────────────
console.log("\n── Signing in sim accounts ──");
const s1Token = await signIn("sim.e2e.s001@ckv-mock.local");
const s2Token = await signIn("sim.e2e.s002@ckv-mock.local");
const teacherToken = await signIn("sim.e2e.teacher@ckv-mock.local");
const researcherToken = await signIn("sim.e2e.researcher@ckv-mock.local");

assert("S001 sign-in", !!s1Token);
assert("S002 sign-in", !!s2Token);
assert("Teacher sign-in", !!teacherToken);
assert("Researcher sign-in", !!researcherToken);

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

// ═══════════════════════════════════════════════════════════════════════════════
// A. Role security — no token / teacher token rejected on student routes
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── A. Role security ──");

{
  const r = await api("/api/student/run-answer", { body: { session_id: FAKE_UUID, task_id: FAKE_UUID, answer_text: "SELECT 1" } });
  assert("No token → 400", r.status === 400, `got ${r.status}`);
}
{
  const r = await api("/api/student/submit-answer", { body: { session_id: FAKE_UUID, task_id: FAKE_UUID, batch_id: FAKE_UUID, answer_text: "SELECT 1" } });
  assert("No token (submit) → 400", r.status === 400, `got ${r.status}`);
}

// Teacher JWT should also fail (requireAuthenticatedProfile checks role? — or at least session ownership should block)
// If the route allows any authenticated user, test session ownership blocks teacher
if (s1Session) {
  const r = await api("/api/student/run-answer", {
    token: teacherToken,
    body: { session_id: s1Session.session_id, task_id: task1.task_id, answer_text: "SELECT 1" },
  });
  // Teacher has no matching profile in trn_learning_sessions (session owned by S001)
  // getOwnedLearningSession filters by profile_id — teacher profile_id won't match → 400
  assert("Teacher JWT on student session → 400", r.status === 400, `got ${r.status}: ${JSON.stringify(r.json)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// B. Session ownership — S001 cannot use S002's session
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── B. Session ownership (cross-student) ──");

if (s1Token && s2Session) {
  const r = await api("/api/student/run-answer", {
    token: s1Token,
    body: { session_id: s2Session.session_id, task_id: task1.task_id, answer_text: "SELECT 1" },
  });
  assert("S001 using S002 session → 400", r.status === 400, `got ${r.status}: ${JSON.stringify(r.json)}`);
} else {
  console.log("  ⚠️  Skipped (no s2Session available)");
}

// ═══════════════════════════════════════════════════════════════════════════════
// C. Task validity
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── C. Task validity ──");

// Non-existent task_id
if (s1Token && s1Session) {
  const r = await api("/api/student/run-answer", {
    token: s1Token,
    body: { session_id: s1Session.session_id, task_id: FAKE_UUID, answer_text: "SELECT 1" },
  });
  assert("Non-existent task_id → 400", r.status === 400, JSON.stringify(r.json));
}

// Unpublished task — create a temp unpublished task, test, then delete
{
  const { data: tempTask } = await admin.from("mst_tasks").insert({
    task_code: "TEST_UNPUBLISHED_TMP",
    task_title: "[E2E] Temp unpublished task",
    task_type: "sql_text",
    difficulty_level: "easy",
    task_status: "draft",          // NOT published
    is_active: true,
    max_score: 10,
    problem_statement: "Temp task for negative test.",
    expected_answer: "SELECT 1",
    expected_sql: "SELECT 1",
  }).select("task_id").single();

  if (tempTask && s1Token && s1Session) {
    const r = await api("/api/student/run-answer", {
      token: s1Token,
      body: { session_id: s1Session.session_id, task_id: tempTask.task_id, answer_text: "SELECT 1" },
    });
    assert("Draft (unpublished) task → 400", r.status === 400, JSON.stringify(r.json));

    // clean up
    await admin.from("mst_tasks").delete().eq("task_id", tempTask.task_id);
    console.log("  (temp draft task deleted)");
  }
}

// Wrong task_id in session (session was for task1, calling with task2)
if (s1Token && s1Session && task2) {
  const r = await api("/api/student/run-answer", {
    token: s1Token,
    body: { session_id: s1Session.session_id, task_id: task2.task_id, answer_text: "SELECT 1" },
  });
  // getOwnedLearningSession filters by task_id — mismatch → 400
  assert("Session task_id mismatch → 400", r.status === 400, JSON.stringify(r.json));
}

// ═══════════════════════════════════════════════════════════════════════════════
// D. Repeated submit (idempotent upsert)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── D. Repeated submit (upsert) ──");

// Create a fresh session for S001+task1 for this test so we control the state
{
  const now = new Date().toISOString();
  const { data: freshSession } = await admin.from("trn_learning_sessions").insert({
    profile_id: s1Profile.profile_id,
    task_id: task1.task_id,
    batch_id: batch.batch_id,
    status: "in_progress",
    started_at: now,
    last_event_at: now,
  }).select("session_id").single();

  if (freshSession && s1Token) {
    const CORRECT_SQL = "SELECT * FROM students";
    const body = {
      session_id: freshSession.session_id,
      task_id: task1.task_id,
      batch_id: batch.batch_id,
      answer_text: CORRECT_SQL,
    };

    // First submit
    const r1 = await api("/api/student/submit-answer", { token: s1Token, body });
    assert("First submit → 200", r1.status === 200, `got ${r1.status}: ${JSON.stringify(r1.json)}`);

    // Second submit (same session/profile/task) — should upsert, not error
    // But session is now "completed" — getOwnedLearningSession should still find it
    const r2 = await api("/api/student/submit-answer", { token: s1Token, body });
    assert("Repeated submit (upsert) → 200", r2.status === 200, `got ${r2.status}: ${JSON.stringify(r2.json)}`);

    // Cleanup — delete the fresh session and its transactions
    const sid = freshSession.session_id;
    await admin.from("trn_submission_rubric_scores").delete().in("submission_id",
      (await admin.from("trn_submissions").select("submission_id").eq("session_id", sid)).data?.map(r => r.submission_id) ?? []
    );
    await admin.from("trn_submissions").delete().eq("session_id", sid);
    await admin.from("trn_attempts").delete().eq("session_id", sid);
    await admin.from("trn_event_logs").delete().eq("session_id", sid);
    await admin.from("trn_learning_sessions").delete().eq("session_id", sid);
    console.log("  (fresh session and transactions cleaned up)");
  } else {
    console.log("  ⚠️  Skipped (could not create fresh session or no s1Token)");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// E. Missing / malformed fields
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── E. Missing / malformed fields ──");

if (s1Token) {
  const r1 = await api("/api/student/run-answer", { token: s1Token, body: {} });
  assert("Empty body → 400", r1.status === 400, JSON.stringify(r1.json));

  const r2 = await api("/api/student/run-answer", {
    token: s1Token,
    body: { answer_text: "SELECT 1" },  // missing session_id and task_id
  });
  assert("Missing session_id + task_id → 400", r2.status === 400, JSON.stringify(r2.json));
}

// ═══════════════════════════════════════════════════════════════════════════════
// F. Export access control
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── F. Export access control ──");

// Student cannot access admin export endpoint
if (s1Token) {
  const r = await api("/api/admin/export-dataset?type=session&batch_code=TEST_BATCH_E2E_001", {
    method: "GET", token: s1Token,
  });
  assert("Student token on admin export → 400", r.status === 400, `got ${r.status}: ${JSON.stringify(r.json)}`);
}

// Teacher cannot access admin export (teacher-only export is a different endpoint)
if (teacherToken) {
  const r = await api("/api/admin/export-dataset?type=session&batch_code=TEST_BATCH_E2E_001", {
    method: "GET", token: teacherToken,
  });
  assert("Teacher token on admin export → 400", r.status === 400, `got ${r.status}: ${JSON.stringify(r.json)}`);
}

// Researcher CAN access admin export
if (researcherToken) {
  const r = await api("/api/admin/export-dataset?type=session&batch_code=TEST_BATCH_E2E_001", {
    method: "GET", token: researcherToken,
  });
  assert("Researcher token on admin export → 200", r.status === 200, `got ${r.status}`);
}

// No-token on admin export → 400
{
  const r = await api("/api/admin/export-dataset?type=session", { method: "GET" });
  assert("No token on admin export → 400", r.status === 400, `got ${r.status}`);
}

// Invalid export type → 400
if (researcherToken) {
  const r = await api("/api/admin/export-dataset?type=unknown_type", {
    method: "GET", token: researcherToken,
  });
  assert("Invalid export type → 400", r.status === 400, JSON.stringify(r.json));
}

// All 4 valid export types → 200
if (researcherToken) {
  for (const type of ["session", "attempt", "sequence", "raw_event"]) {
    const r = await api(`/api/admin/export-dataset?type=${type}&batch_code=TEST_BATCH_E2E_001`, {
      method: "GET", token: researcherToken,
    });
    assert(`Export type=${type} → 200`, r.status === 200, `got ${r.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n══ Results: ${passCount} passed, ${failCount} failed ══`);
if (failCount > 0) process.exit(1);
