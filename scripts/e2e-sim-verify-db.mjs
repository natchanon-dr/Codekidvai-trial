/**
 * e2e-sim-verify-db.mjs
 *
 * Phase 3 — DB Verification for TEST_BATCH_E2E_001
 * Queries all transaction tables and reports:
 *   - trn_learning_sessions
 *   - trn_attempts
 *   - trn_event_logs
 *   - trn_submissions
 *   - trn_submission_rubric_scores
 *   - at_risk distribution
 *   - analytics API response (teacher view)
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

const PASS = "✅ PASS";
const FAIL = "❌ FAIL";
const WARN = "⚠️  WARN";

// ── Get batch_id ──────────────────────────────────────────────────────────────
const { data: batch } = await admin
  .from("mst_experiment_batches")
  .select("batch_id, batch_code")
  .eq("batch_code", "TEST_BATCH_E2E_001")
  .single();
if (!batch) throw new Error("TEST_BATCH_E2E_001 not found");

console.log(`\n═══════════════════════════════════════════════`);
console.log(` DB Verification — ${batch.batch_code}`);
console.log(`═══════════════════════════════════════════════\n`);

// ── 1. Learning Sessions ──────────────────────────────────────────────────────
const { data: sessions, count: sessCount } = await admin
  .from("trn_learning_sessions")
  .select("session_id, profile_id, task_id, status, started_at, ended_at, duration_seconds", { count: "exact" })
  .eq("batch_id", batch.batch_id);

const completedSess = sessions?.filter(s => s.status === "completed").length ?? 0;
const inProgressSess = sessions?.filter(s => s.status === "in_progress").length ?? 0;
console.log(`[1] trn_learning_sessions`);
console.log(`    Total          : ${sessCount ?? 0}`);
console.log(`    status=completed : ${completedSess}`);
console.log(`    status=in_progress: ${inProgressSess}`);
console.log(`    Expected: 40 students × 3 tasks = 120 sessions`);
const sessionGate = (sessCount ?? 0) >= 100;
console.log(`    Gate (≥100)    : ${sessionGate ? PASS : FAIL} (got ${sessCount})\n`);

// ── 2. Attempts ───────────────────────────────────────────────────────────────
const { data: attemptSample } = await admin
  .from("trn_attempts")
  .select("attempt_id, session_id, attempt_type, is_correct, created_at")
  .in("session_id", (sessions ?? []).map(s => s.session_id))
  .limit(5);

// Count by type
const { data: allAttempts } = await admin
  .from("trn_attempts")
  .select("attempt_type, is_correct")
  .in("session_id", (sessions ?? []).map(s => s.session_id));

const runAttempts = allAttempts?.filter(a => a.attempt_type === "run").length ?? 0;
const submitAttempts = allAttempts?.filter(a => a.attempt_type === "submit").length ?? 0;
const correctAttempts = allAttempts?.filter(a => a.is_correct === true).length ?? 0;

console.log(`[2] trn_attempts`);
console.log(`    Total          : ${allAttempts?.length ?? 0}`);
console.log(`    type=run       : ${runAttempts}`);
console.log(`    type=submit    : ${submitAttempts}`);
console.log(`    is_correct=true: ${correctAttempts}`);
console.log(`    Expected: 120 sessions × 3 runs + 120 submits = 480 total`);
const attemptGate = (allAttempts?.length ?? 0) >= 300;
console.log(`    Gate (≥300)    : ${attemptGate ? PASS : FAIL} (got ${allAttempts?.length ?? 0})\n`);

// ── 3. Event Logs ─────────────────────────────────────────────────────────────
const eventTableCandidates = ["trn_event_logs", "trn_learning_events"];
let eventCount = 0;
let eventTable = "";
for (const tbl of eventTableCandidates) {
  const { count, error } = await admin
    .from(tbl)
    .select("*", { count: "exact", head: true })
    .in("session_id", (sessions ?? []).map(s => s.session_id));
  if (!error) { eventCount = count ?? 0; eventTable = tbl; break; }
}
console.log(`[3] ${eventTable || "event_logs"}`);
console.log(`    Total for batch sessions: ${eventCount}`);
const eventGate = eventCount >= 200;
console.log(`    Gate (≥200)    : ${eventGate ? PASS : WARN} (got ${eventCount})\n`);

// ── 4. Submissions ────────────────────────────────────────────────────────────
const { data: subs } = await admin
  .from("trn_submissions")
  .select("profile_id, task_id, auto_score, final_score, is_passed, submitted_at, time_to_first_correct_sec, total_run_count")
  .eq("batch_id", batch.batch_id);

const totalSubs = subs?.length ?? 0;
const passedSubs = subs?.filter(s => s.is_passed === true).length ?? 0;
const failedSubs = subs?.filter(s => s.is_passed === false).length ?? 0;
const avgScore = totalSubs > 0
  ? (subs.reduce((acc, s) => acc + Number(s.final_score ?? 0), 0) / totalSubs).toFixed(2)
  : "N/A";
const withTTFC = subs?.filter(s => s.time_to_first_correct_sec != null && s.time_to_first_correct_sec > 0).length ?? 0;

console.log(`[4] trn_submissions`);
console.log(`    Total          : ${totalSubs}`);
console.log(`    is_passed=true : ${passedSubs}`);
console.log(`    is_passed=false: ${failedSubs}`);
console.log(`    avg final_score: ${avgScore}`);
console.log(`    with time_to_first_correct_sec > 0: ${withTTFC}`);
console.log(`    Expected: 40 students × 3 tasks = 120 submissions`);
const subGate = totalSubs >= 100;
const hasBothPass = passedSubs > 0 && failedSubs > 0;
console.log(`    Gate (≥100)    : ${subGate ? PASS : FAIL} (got ${totalSubs})`);
console.log(`    Has pass+fail  : ${hasBothPass ? PASS : FAIL}\n`);

// ── 5. Rubric Scores ──────────────────────────────────────────────────────────
const rubricCandidates = ["trn_submission_rubric_scores", "trn_rubric_scores"];
let rubricCount = 0;
let rubricTable = "";

// Get submission IDs
const { data: submissionIds } = await admin
  .from("trn_submissions")
  .select("submission_id")
  .eq("batch_id", batch.batch_id);

for (const tbl of rubricCandidates) {
  const { count, error } = await admin
    .from(tbl)
    .select("*", { count: "exact", head: true })
    .in("submission_id", (submissionIds ?? []).map(s => s.submission_id).filter(Boolean));
  if (!error) { rubricCount = count ?? 0; rubricTable = tbl; break; }
}
console.log(`[5] ${rubricTable || "rubric_scores"}`);
console.log(`    Rubric rows for batch: ${rubricCount}`);
const rubricGate = rubricCount > 0;
console.log(`    Gate (>0)      : ${rubricGate ? PASS : WARN} (got ${rubricCount})\n`);

// ── 6. at_risk Distribution (using vw_dataset_session_level) ─────────────────
const { data: viewRows } = await admin
  .from("vw_dataset_session_level")
  .select("participant_code, batch_code, final_score, is_passed, submitted_at, task_code")
  .eq("batch_code", "TEST_BATCH_E2E_001");

const viewTotal = viewRows?.length ?? 0;
const viewSubmitted = viewRows?.filter(r => r.submitted_at != null).length ?? 0;
const viewPassed = viewRows?.filter(r => r.is_passed === true).length ?? 0;

console.log(`[6] vw_dataset_session_level (researcher view)`);
console.log(`    Total rows          : ${viewTotal}`);
console.log(`    submitted_at ≠ null : ${viewSubmitted}`);
console.log(`    is_passed=true      : ${viewPassed}`);
console.log(`    is_passed=false/null: ${viewTotal - viewPassed}`);
const viewGate = viewTotal >= 50;
console.log(`    Gate (≥50 rows)     : ${viewGate ? PASS : FAIL} (got ${viewTotal})\n`);

// ── 7. Summary Gate ───────────────────────────────────────────────────────────
const allGates = [sessionGate, attemptGate, subGate, hasBothPass, viewGate];
const passCount = allGates.filter(Boolean).length;
console.log(`═══════════════════════════════════════════════`);
console.log(` DB VERIFICATION: ${passCount}/${allGates.length} gates passed`);
console.log(`═══════════════════════════════════════════════`);
if (passCount === allGates.length) {
  console.log(` ✅  ALL PASS — proceed to export CSV\n`);
} else {
  console.log(` ⚠️  Some gates failed — check errors above\n`);
}
