/**
 * e2e-gate3-verify.mjs
 * Commit 3 runtime gate — verifies persisted data for assignment/lab/exam fixtures.
 * Reads-only, no mutations.
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

const FIXTURES = [
  { batch: "MOCK_GATE_ASSIGN_001", family: "assignment", runsMin: 3, runsMax: 5, sessionsMax: 2 },
  { batch: "MOCK_GATE_LAB_001",    family: "lab",        runsMin: 4, runsMax: 6, sessionsMax: 1 },
  { batch: "MOCK_GATE_EXAM_001",   family: "exam",       runsMin: 1, runsMax: 2, sessionsMax: 1 },
];

let allPass = true;
function assert(label, cond, detail = "") {
  const ok = !!cond;
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}`);
}

for (const fix of FIXTURES) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`FIXTURE: ${fix.batch}  (expected family=${fix.family})`);
  console.log("─".repeat(60));

  // 1. Batch + set_family
  const { data: batch } = await admin.from("mst_experiment_batches")
    .select("batch_id, batch_code").eq("batch_code", fix.batch).single();
  assert("batch exists", !!batch, batch?.batch_id);
  if (!batch) continue;

  const { data: classSet } = await admin.from("tb_class_sets")
    .select("family, class_id, batch_id").eq("batch_id", batch.batch_id).single();
  assert(`set_family = ${fix.family}`, classSet?.family === fix.family, `got '${classSet?.family}'`);

  // 2. Learners + tasks
  const { data: profiles } = await admin.from("mst_profiles")
    .select("profile_id, participant_code").like("participant_code", `${fix.batch}_S%`);
  const { data: tasks } = await admin.from("mst_tasks")
    .select("task_id, task_code").like("task_code", `${fix.batch}_T%`).eq("is_active", true);
  assert("5 learners", profiles?.length === 5, `got ${profiles?.length}`);
  assert("2 tasks",    tasks?.length === 2,    `got ${tasks?.length}`);

  const profileIds = profiles?.map(p => p.profile_id) ?? [];
  const taskIds    = tasks?.map(t => t.task_id) ?? [];

  // 3–6. Sessions, attempts, submits, events
  const { data: sessions } = await admin.from("trn_learning_sessions")
    .select("session_id, profile_id, task_id, started_at, ended_at, duration_seconds, status")
    .eq("batch_id", batch.batch_id);

  const { data: attempts } = await admin.from("trn_attempts")
    .select("attempt_id, session_id, profile_id, task_id, attempt_type, is_correct, created_at")
    .in("session_id", (sessions ?? []).map(s => s.session_id));

  const { data: submissions } = await admin.from("trn_submissions")
    .select("submission_id, profile_id, task_id, is_passed, total_run_count, total_attempt_count")
    .eq("batch_id", batch.batch_id);

  const { data: events } = await admin.from("trn_event_logs")
    .select("event_type, session_id, created_at")
    .in("session_id", (sessions ?? []).map(s => s.session_id));

  console.log(`\n  [Data counts]`);
  console.log(`  Sessions    : ${sessions?.length}`);
  console.log(`  Attempts    : ${attempts?.length}`);
  console.log(`  Submissions : ${submissions?.length}`);
  console.log(`  Events      : ${events?.length}`);

  // Sessions-per-learner-per-task map
  const sessionMap = {};  // profileId → taskId → session[]
  for (const s of sessions ?? []) {
    (sessionMap[s.profile_id] ??= {})[s.task_id] ??= [];
    sessionMap[s.profile_id][s.task_id].push(s);
  }

  // Attempts-per-session map
  const attemptsPerSession = {};
  for (const a of attempts ?? []) {
    (attemptsPerSession[a.session_id] ??= []).push(a);
  }

  // Runs and submits per profile × task (across all sessions)
  const runsPerPT = {};       // `${profileId}:${taskId}` → run count
  const submitsPerPT = {};    // same key → submit count
  for (const a of attempts ?? []) {
    const key = `${a.profile_id}:${a.task_id}`;
    if (a.attempt_type === "run")    runsPerPT[key]    = (runsPerPT[key]    ?? 0) + 1;
    if (a.attempt_type === "submit") submitsPerPT[key] = (submitsPerPT[key] ?? 0) + 1;
  }

  // 3. Session assertions
  console.log(`\n  [Session count per learner × task]`);
  let maxSessions = 0;
  for (const pid of profileIds) {
    for (const tid of taskIds) {
      const ptSessions = sessionMap[pid]?.[tid] ?? [];
      const n = ptSessions.length;
      if (n > maxSessions) maxSessions = n;
      const pc = profiles.find(p => p.profile_id === pid)?.participant_code?.split("_").pop();
      const tc = tasks.find(t => t.task_id === tid)?.task_code?.split("_").pop();
      console.log(`    ${pc} × ${tc}: ${n} session(s)`);
    }
  }

  if (fix.sessionsMax === 1) {
    assert(`all sessions = 1 per learner × task`, maxSessions === 1, `max observed: ${maxSessions}`);
  } else {
    assert(`at least one learner × task has 2 sessions`, maxSessions >= 2, `max observed: ${maxSessions}`);
  }

  // 4. Run count assertions
  console.log(`\n  [Run count per learner × task]`);
  let runOutOfRange = [];
  for (const pid of profileIds) {
    for (const tid of taskIds) {
      const key = `${pid}:${tid}`;
      const rCount = runsPerPT[key] ?? 0;
      const pc = profiles.find(p => p.profile_id === pid)?.participant_code?.split("_").pop();
      const tc = tasks.find(t => t.task_id === tid)?.task_code?.split("_").pop();
      const inRange = rCount >= fix.runsMin && rCount <= fix.runsMax;
      if (!inRange) runOutOfRange.push(`${pc}×${tc}=${rCount}`);
      console.log(`    ${pc} × ${tc}: ${rCount} runs  ${inRange ? "✓" : `✗ (expected ${fix.runsMin}-${fix.runsMax})`}`);
    }
  }
  assert(`all run counts within ${fix.runsMin}–${fix.runsMax}`, runOutOfRange.length === 0,
    runOutOfRange.length ? runOutOfRange.join(", ") : "");

  // 5. Submit assertions
  console.log(`\n  [Submits per learner × task]`);
  let missingProfileIds = new Set();
  // The first student (S001) is the "missing" one per the 20% rate with 5 students
  // missing flag set on first N students (missingCount = round(5*0.2) = 1)
  const sortedProfiles = [...profiles].sort((a, b) => a.participant_code.localeCompare(b.participant_code));
  const missingProfileId = sortedProfiles[0]?.profile_id;
  missingProfileIds.add(missingProfileId);

  let missingWithSubmit = false;
  let nonMissingWithoutSubmit = false;
  for (const pid of profileIds) {
    for (const tid of taskIds) {
      const key = `${pid}:${tid}`;
      const sCount = submitsPerPT[key] ?? 0;
      const pc = profiles.find(p => p.profile_id === pid)?.participant_code?.split("_").pop();
      const tc = tasks.find(t => t.task_id === tid)?.task_code?.split("_").pop();
      const isMissing = missingProfileIds.has(pid);
      console.log(`    ${pc} × ${tc}: ${sCount} submit(s)  ${isMissing ? "[missing]" : ""}`);
      if (isMissing && sCount > 0) missingWithSubmit = true;
      if (!isMissing && sCount === 0) nonMissingWithoutSubmit = true;
    }
  }
  assert("missing student has zero submits", !missingWithSubmit);
  assert("non-missing students all submitted", !nonMissingWithoutSubmit);

  // Multi-session: verify only final session submitted
  if (fix.sessionsMax > 1) {
    const finalSessionOnlySubmits = [...profileIds].every(pid =>
      [...taskIds].every(tid => {
        const ptSessions = sessionMap[pid]?.[tid] ?? [];
        if (ptSessions.length <= 1) return true;
        // Sort by started_at
        const sorted = [...ptSessions].sort((a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        );
        const firstSessionId = sorted[0].session_id;
        const firstSessAttempts = attemptsPerSession[firstSessionId] ?? [];
        return !firstSessAttempts.some(a => a.attempt_type === "submit");
      })
    );
    assert("multi-session: first session has no submit", finalSessionOnlySubmits);
  }

  // 6. Event-type counts
  const eventTypeCounts = {};
  for (const e of events ?? []) {
    eventTypeCounts[e.event_type] = (eventTypeCounts[e.event_type] ?? 0) + 1;
  }
  console.log(`\n  [Event types]`);
  for (const [et, count] of Object.entries(eventTypeCounts).sort()) {
    console.log(`    ${et}: ${count}`);
  }
  assert("zero hint_open events", (eventTypeCounts["hint_open"] ?? 0) === 0,
    `got ${eventTypeCounts["hint_open"] ?? 0}`);
  assert("has sql_run events",    (eventTypeCounts["sql_run"]   ?? 0) > 0);
  assert("has session_end events",(eventTypeCounts["session_end"] ?? 0) > 0);

  // 7. Timestamp validation
  console.log(`\n  [Timestamp validation]`);
  let negDuration = 0, eventBeforeSession = 0;
  for (const s of sessions ?? []) {
    const startMs = new Date(s.started_at).getTime();
    const endMs   = s.ended_at ? new Date(s.ended_at).getTime() : null;
    if (endMs !== null && endMs < startMs) negDuration++;
    const sessEvents = (events ?? []).filter(e => e.session_id === s.session_id);
    for (const e of sessEvents) {
      const evMs = new Date(e.created_at).getTime();
      if (evMs < startMs) eventBeforeSession++;
    }
  }
  assert("no negative session durations",    negDuration === 0,       `${negDuration} found`);
  assert("no events before session start",   eventBeforeSession === 0, `${eventBeforeSession} found`);

  // session duration_seconds should be >= 0
  const negDurSec = (sessions ?? []).filter(s => s.duration_seconds !== null && s.duration_seconds < 0).length;
  assert("all duration_seconds >= 0", negDurSec === 0, `${negDurSec} negative`);

  // 8. Missing submission count
  const totalSubmissions = submissions?.length ?? 0;
  const expectedSubmits = (profileIds.length - 1) * taskIds.length; // 1 missing student
  assert(`submit count = ${expectedSubmits} (5 learners - 1 missing) × 2 tasks`, totalSubmissions === expectedSubmits,
    `got ${totalSubmissions}`);

  // 9. Risk distribution
  const passed = (submissions ?? []).filter(s => s.is_passed === true).length;
  const failed = (submissions ?? []).filter(s => s.is_passed === false).length;
  console.log(`\n  [Risk distribution]  passed=${passed}  failed=${failed}`);
  assert("both label classes occur", passed > 0 && failed > 0, `passed=${passed} failed=${failed}`);

  // 10. Normalized behavior signature
  const sigRows = [];
  for (const pid of [...profileIds].sort()) {
    for (const tid of [...taskIds].sort()) {
      const key = `${pid}:${tid}`;
      const r = runsPerPT[key] ?? 0;
      const s = (sessionMap[pid]?.[tid] ?? []).length;
      const sub = missingProfileIds.has(pid) ? 0 : 1;
      sigRows.push(`r${r}s${s}x${sub}`);
    }
  }
  const sig = sigRows.join(",");
  console.log(`\n  [Normalized signature (r=runs,s=sessions,x=submitted)]`);
  console.log(`  ${sig}`);
  // Store for reproducibility comparison
  fix._sig = sig;
}

console.log(`\n${"═".repeat(60)}`);
console.log(`GATE RESULT: ${allPass ? "✅ ALL ASSERTIONS PASS" : "❌ SOME ASSERTIONS FAILED"}`);
console.log("═".repeat(60));
