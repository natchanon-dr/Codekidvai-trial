/**
 * e2e-seed-mock-learners.mjs
 *
 * สร้าง mock learner sessions/submissions สำหรับ E2E validation
 * ใช้ SAQT0001 batch + tasks ที่มีอยู่
 * สร้าง 35 mock participant_codes พร้อม sessions ที่มี at_risk distribution ~35%
 *
 * ข้อห้าม: ไม่ใช้ข้อมูลนักเรียนจริง, ไม่ commit CSV/pkl
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MOCK_TAG = "E2E_MOCK_2026";
const N_LEARNERS = 35;
// ~35% at_risk: learners 0–22 pass most tasks, 23–34 fail/skip
const AT_RISK_START = 23;

// ── 1. Fetch batch and tasks ──────────────────────────────────────────────────
const { data: batch, error: batchErr } = await supabase
  .from("mst_experiment_batches")
  .select("batch_id, batch_code, batch_name")
  .eq("batch_code", "SAQT0001")
  .single();
if (batchErr) throw batchErr;
console.log(`Using batch: ${batch.batch_code} — ${batch.batch_name}`);

const { data: allTasks, error: taskErr } = await supabase
  .from("mst_tasks")
  .select("task_id, task_code, max_score, task_type")
  .eq("is_active", true)
  .like("task_code", "AQT%")
  .order("task_code")
  .limit(8);
if (taskErr) throw taskErr;
console.log(`Tasks: ${allTasks.map(t => t.task_code).join(", ")}`);

// ── 2. Fetch existing auth users and profiles ─────────────────────────────────
const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 200 });
const authByEmail = new Map((authList?.users ?? []).map(u => [u.email, u.id]));

const { data: existingProfiles } = await supabase
  .from("mst_profiles")
  .select("profile_id, participant_code")
  .like("participant_code", "MOCK_E2E_%");

const existingCodes = new Set((existingProfiles ?? []).map(p => p.participant_code));
const existingMap = new Map((existingProfiles ?? []).map(p => [p.participant_code, p.profile_id]));

// Create missing auth users + profiles one at a time
let created = 0;
for (let i = 0; i < N_LEARNERS; i++) {
  const code = `MOCK_E2E_${String(i + 1).padStart(3, "0")}`;
  if (existingCodes.has(code)) continue;

  const email = `mock.e2e.${String(i + 1).padStart(3, "0")}@ckv-mock.local`;
  let authUserId = authByEmail.get(email);

  if (!authUserId) {
    const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: "69056020",
      email_confirm: true,
    });
    if (authErr) { console.error(`Auth create failed for ${email}: ${authErr.message}`); continue; }
    authUserId = newUser.user.id;
  }

  const { data: newProf, error: profErr } = await supabase
    .from("mst_profiles")
    .insert({
      auth_user_id: authUserId,
      participant_code: code,
      role: "student",
      display_name: `Mock Learner ${String(i + 1).padStart(3, "0")} [${MOCK_TAG}]`,
      consent_accepted: true,
      consent_accepted_at: "2026-07-01T00:00:00Z",
    })
    .select("profile_id")
    .single();
  if (profErr) { console.error(`Profile insert failed for ${code}: ${profErr.message}`); continue; }
  existingMap.set(code, newProf.profile_id);
  created++;
  if (created % 5 === 0) process.stdout.write(`  ${created} profiles created...\n`);
}
console.log(`Created ${created} new mock profiles (${existingCodes.size} already existed)`);

// Fetch all mock profiles
const { data: allMockProfiles } = await supabase
  .from("mst_profiles")
  .select("profile_id, participant_code")
  .like("participant_code", "MOCK_E2E_%")
  .order("participant_code")
  .limit(N_LEARNERS);

// ── 3. Build sessions + submissions ──────────────────────────────────────────
const baseDate = new Date("2026-06-01T08:00:00Z");
const sessionRows = [];
const submissionRows = [];

for (let li = 0; li < allMockProfiles.length; li++) {
  const prof = allMockProfiles[li];
  const isAtRisk = li >= AT_RISK_START;

  for (let ti = 0; ti < allTasks.length; ti++) {
    const task = allTasks[ti];
    const maxScore = Number(task.max_score ?? 10);

    // at_risk learners: skip last 2–3 tasks (no submission)
    const skipTask = isAtRisk && ti >= allTasks.length - 3;
    const sessionStart = new Date(baseDate.getTime() + (li * 86400 + ti * 3600) * 1000);
    const sessionEnd = new Date(sessionStart.getTime() + (isAtRisk ? 180 : 600) * 1000);
    const sessionId = crypto.randomUUID();

    const totalRuns = isAtRisk ? 1 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 4);
    const finalScore = skipTask ? null : (isAtRisk
      ? Math.max(0, Math.floor(maxScore * (0.2 + Math.random() * 0.35)))
      : Math.floor(maxScore * (0.7 + Math.random() * 0.3)));
    const isPassed = !skipTask && finalScore !== null && finalScore >= maxScore * 0.6;
    const submittedAt = skipTask ? null : sessionEnd.toISOString();

    sessionRows.push({
      session_id: sessionId,
      profile_id: prof.profile_id,
      task_id: task.task_id,
      batch_id: batch.batch_id,
      started_at: sessionStart.toISOString(),
      ended_at: skipTask ? null : sessionEnd.toISOString(),
      last_event_at: sessionStart.toISOString(),
      status: skipTask ? "abandoned" : "completed",
      duration_seconds: skipTask ? 90 : 420 + ti * 30,
      device_type: "desktop",
      browser_name: "Chrome",
      user_agent: `MockAgent/${MOCK_TAG}`,
    });

    if (!skipTask) {
      submissionRows.push({
        profile_id: prof.profile_id,
        batch_id: batch.batch_id,
        task_id: task.task_id,
        session_id: sessionId,
        final_answer_text: isAtRisk ? "SELECT * FROM table;" : "SELECT col FROM table WHERE id > 0;",
        final_answer_json: { mode: "mock_e2e" },
        final_score: finalScore,
        is_passed: isPassed,
        submitted_at: submittedAt,
        total_run_count: totalRuns,
        total_attempt_count: totalRuns + (isAtRisk ? 1 : 0),
        first_correct_at: isPassed ? submittedAt : null,
        time_to_first_correct_sec: isPassed ? 180 + ti * 20 : null,
      });
    }
  }
}

// ── 4. Upsert sessions ────────────────────────────────────────────────────────
console.log(`\nUpserting ${sessionRows.length} sessions...`);
const SESSION_CHUNK = 50;
for (let i = 0; i < sessionRows.length; i += SESSION_CHUNK) {
  const chunk = sessionRows.slice(i, i + SESSION_CHUNK);
  const { error } = await supabase
    .from("trn_learning_sessions")
    .upsert(chunk, { onConflict: "session_id" });
  if (error) throw new Error(`Session upsert error at ${i}: ${error.message}`);
}
console.log("✅  Sessions upserted");

// ── 5. Upsert submissions ─────────────────────────────────────────────────────
console.log(`Upserting ${submissionRows.length} submissions...`);
const SUB_CHUNK = 50;
for (let i = 0; i < submissionRows.length; i += SUB_CHUNK) {
  const chunk = submissionRows.slice(i, i + SUB_CHUNK);
  const { error } = await supabase
    .from("trn_submissions")
    .upsert(chunk, { onConflict: "profile_id,batch_id,task_id" });
  if (error) throw new Error(`Submission upsert error at ${i}: ${error.message}`);
}
console.log("✅  Submissions upserted");

// ── 6. Summary ────────────────────────────────────────────────────────────────
const atRiskCount = allMockProfiles.filter((_, i) => i >= AT_RISK_START).length;
const notAtRisk = allMockProfiles.length - atRiskCount;
console.log(`
── Mock Seed Summary ──
  Learners: ${allMockProfiles.length} (${notAtRisk} passing, ${atRiskCount} at-risk)
  Tasks per learner: ${allTasks.length}
  Sessions total: ${sessionRows.length}
  Submissions total: ${submissionRows.length}
  Estimated at_risk rate: ~${(atRiskCount / allMockProfiles.length * 100).toFixed(1)}%
  Batch: ${batch.batch_code}
  Tag: ${MOCK_TAG}
`);
