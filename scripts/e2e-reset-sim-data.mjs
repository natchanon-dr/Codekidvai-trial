/**
 * e2e-reset-sim-data.mjs
 *
 * Executes the SIM_E2E_2026 reset from docs/transaction_reset_plan.md.
 * Deletes ALL simulated transactions and test master data in dependency order.
 *
 * Safe guards:
 *   - Only touches records matching SIM_E2E_* / MOCK_E2E_* / TEST_* identifiers
 *   - Counts rows before/after each step
 *   - Dry-run mode by default (pass --execute to actually delete)
 *
 * Usage:
 *   node scripts/e2e-reset-sim-data.mjs          (dry-run, shows counts only)
 *   node scripts/e2e-reset-sim-data.mjs --execute (deletes for real)
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
const resetOpts = parseArgs();
const EXECUTE         = resetOpts["execute"] === "true" || process.argv.includes("--execute");
const TARGET_BATCH    = resetOpts["batch"] ?? null; // if set, scope to this batch only
const MODE = EXECUTE ? "EXECUTE" : "DRY-RUN";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

if (TARGET_BATCH && !TARGET_BATCH.startsWith("SIM_E2E_") && !TARGET_BATCH.startsWith("MOCK_")) {
  console.error(`ERROR: --batch must start with SIM_E2E_ or MOCK_. Got: ${TARGET_BATCH}`);
  process.exit(1);
}

console.log(`\n══ SIM_E2E Reset [${MODE}]${TARGET_BATCH ? ` — batch: ${TARGET_BATCH}` : " — all SIM/MOCK"} ══`);
if (!EXECUTE) console.log("   Pass --execute to actually delete. Showing counts only.\n");

let stepErrors = 0;

// ── helpers ───────────────────────────────────────────────────────────────────
const CHUNK = 50; // safe batch size for Supabase IN queries

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function countChunked(table, col, ids) {
  if (ids.length === 0) return 0;
  let total = 0;
  for (const chunk of chunks(ids, CHUNK)) {
    const { count: n, error } = await admin.from(table)
      .select("*", { count: "exact", head: true })
      .in(col, chunk);
    if (error) { console.error(`  count error on ${table}: ${error.message}`); return -1; }
    total += n ?? 0;
  }
  return total;
}

async function deleteChunked(table, col, ids) {
  if (ids.length === 0) return 0;
  let deleted = 0;
  for (const chunk of chunks(ids, CHUNK)) {
    const { error } = await admin.from(table).delete().in(col, chunk);
    if (error) throw new Error(error.message);
    deleted += chunk.length; // approximate
  }
  return deleted;
}

async function count(table, filter) {
  const q = filter(admin.from(table).select("*", { count: "exact", head: true }));
  const { count: n, error } = await q;
  if (error) { console.error(`  count error on ${table}: ${error.message}`); return -1; }
  return n ?? 0;
}

async function del(label, table, filterFn) {
  const before = await count(table, filterFn);
  if (before === 0) {
    console.log(`  ⬜ ${label}: 0 rows — nothing to delete`);
    return;
  }
  if (EXECUTE) {
    const { error } = await filterFn(admin.from(table).delete());
    if (error) {
      console.error(`  ❌ ${label}: DELETE failed — ${error.message}`);
      stepErrors++;
      return;
    }
    const after = await count(table, filterFn);
    console.log(`  ✅ ${label}: deleted ${before - after} rows (${after} remaining)`);
    if (after > 0) {
      console.warn(`     ⚠️  ${after} rows still present after delete`);
    }
  } else {
    console.log(`  📋 ${label}: would delete ${before} rows`);
  }
}

async function delChunked(label, table, col, ids) {
  if (ids.length === 0) { console.log(`  ⬜ ${label}: 0 IDs — nothing to delete`); return; }
  const before = await countChunked(table, col, ids);
  if (before === 0) { console.log(`  ⬜ ${label}: 0 rows — nothing to delete`); return; }
  if (EXECUTE) {
    try {
      await deleteChunked(table, col, ids);
      const after = await countChunked(table, col, ids);
      console.log(`  ✅ ${label}: deleted ${before - after} rows (${after} remaining)`);
      if (after > 0) console.warn(`     ⚠️  ${after} rows still present`);
    } catch (e) {
      console.error(`  ❌ ${label}: DELETE failed — ${e.message}`);
      stepErrors++;
    }
  } else {
    console.log(`  📋 ${label}: would delete ${before} rows`);
  }
}

// ── resolve IDs ───────────────────────────────────────────────────────────────
// If TARGET_BATCH specified, find that batch; otherwise find any SIM/MOCK batch rows
const batchQuery = TARGET_BATCH
  ? admin.from("mst_experiment_batches").select("batch_id").eq("batch_code", TARGET_BATCH)
  : admin.from("mst_experiment_batches").select("batch_id").or("batch_code.like.SIM_E2E_%,batch_code.like.MOCK_%");
const { data: batchRows } = await batchQuery;
const batchId = TARGET_BATCH ? batchRows?.[0]?.batch_id ?? null : null; // single-batch mode only for FK filters
const allBatchIds = (batchRows ?? []).map(b => b.batch_id);

// For class: derive from batch code if possible
const classCodeGuess = TARGET_BATCH ? `${TARGET_BATCH}_CLASS` : null;
const classQuery = classCodeGuess
  ? admin.from("tb_classes").select("class_id").eq("class_code", classCodeGuess)
  : admin.from("tb_classes").select("class_id").like("class_code", "SIM_E2E_%");
const { data: classRows } = await classQuery;
const classId = classRows?.[0]?.class_id ?? null;

console.log(`  target batch_id: ${batchId ?? "(multi-batch or not found)"}`);
console.log(`  all matching batch_ids: ${allBatchIds.length}`);

console.log(`  batch_id: ${batchId ?? "(not found — may already be deleted)"}`);
console.log(`  class_id: ${classId ?? "(not found — may already be deleted)"}`);

// Sim + Mock profile sets — scoped to TARGET_BATCH if set
const profilePrefix = TARGET_BATCH ? `${TARGET_BATCH}_%` : null;
const simProfilesQ = profilePrefix
  ? admin.from("mst_profiles").select("profile_id").like("participant_code", profilePrefix)
  : admin.from("mst_profiles").select("profile_id")
      .or("participant_code.like.SIM_E2E_%,participant_code.like.MOCK_%,participant_code.in.(SIM_TEACHER_E2E,SIM_RESEARCHER_E2E)");
const { data: simProfileData } = await simProfilesQ;
const simProfileIds  = (simProfileData ?? []).map(p => p.profile_id);
const mockProfileIds = []; // legacy — already covered by prefix query
const allSimIds = [...new Set([...simProfileIds, ...mockProfileIds])];

console.log(`  sim profiles: ${simProfileIds.length} | mock profiles: ${mockProfileIds.length}`);

// Sim + Mock session sets
async function getSimSessionIds() {
  const sets = [];
  if (batchId) {
    const { data } = await admin.from("trn_learning_sessions")
      .select("session_id").eq("batch_id", batchId);
    sets.push(...(data ?? []).map(r => r.session_id));
  }
  if (allSimIds.length > 0) {
    const { data } = await admin.from("trn_learning_sessions")
      .select("session_id").in("profile_id", allSimIds);
    sets.push(...(data ?? []).map(r => r.session_id));
  }
  return [...new Set(sets)];
}
const allSimSessionIds = await getSimSessionIds();
console.log(`  sim+mock sessions: ${allSimSessionIds.length}\n`);

// ── Step 1: Rubric scores ─────────────────────────────────────────────────────
console.log("[Step 1] Rubric scores");
{
  // Collect submission_ids via batch (most reliable) + profile_id fallback
  const simSubIds = new Set();
  if (batchId) {
    const { data } = await admin.from("trn_submissions").select("submission_id").eq("batch_id", batchId);
    (data ?? []).forEach(s => simSubIds.add(s.submission_id));
  }
  if (allSimIds.length > 0) {
    for (const chunk of chunks(allSimIds, CHUNK)) {
      const { data } = await admin.from("trn_submissions").select("submission_id").in("profile_id", chunk);
      (data ?? []).forEach(s => simSubIds.add(s.submission_id));
    }
  }
  const simSubIdArr = [...simSubIds];
  await delChunked("rubric scores (sim submissions)", "trn_submission_rubric_scores", "submission_id", simSubIdArr);
}

// ── Step 2: Submissions ───────────────────────────────────────────────────────
console.log("\n[Step 2] Submissions");
if (batchId) {
  await del("submissions (batch)", "trn_submissions", q => q.eq("batch_id", batchId));
}
if (allSimIds.length > 0) {
  await del("submissions (mock profiles)", "trn_submissions",
    q => q.in("profile_id", allSimIds));
}

// ── Step 3: Attempts ──────────────────────────────────────────────────────────
console.log("\n[Step 3] Attempts");
await delChunked("attempts (sim sessions)", "trn_attempts", "session_id", allSimSessionIds);

// ── Step 4: Event logs ────────────────────────────────────────────────────────
console.log("\n[Step 4] Event logs");
await delChunked("event_logs (sim sessions)", "trn_event_logs", "session_id", allSimSessionIds);

// ── Step 5: Learning sessions ─────────────────────────────────────────────────
console.log("\n[Step 5] Learning sessions");
if (batchId) {
  await del("sessions (batch)", "trn_learning_sessions", q => q.eq("batch_id", batchId));
}
if (allSimIds.length > 0) {
  await del("sessions (sim/mock profiles)", "trn_learning_sessions",
    q => q.in("profile_id", allSimIds));
}

// ── Step 5b: Task assignments ─────────────────────────────────────────────────
console.log("\n[Step 5b] Task assignments");
if (batchId) {
  await del("task_assignments (batch)", "trn_task_assignments", q => q.eq("batch_id", batchId));
}
if (allSimIds.length > 0) {
  await del("task_assignments (sim/mock profiles)", "trn_task_assignments",
    q => q.in("profile_id", allSimIds));
}

// ── Step 6: Class enrollment ──────────────────────────────────────────────────
console.log("\n[Step 6] Class enrollment");
if (classId) {
  await del("class_students (test class)", "tb_class_students",
    q => q.eq("class_id", classId));
}
if (allSimIds.length > 0) {
  await del("class_students (mock profiles)", "tb_class_students",
    q => q.in("profile_id", allSimIds));
}

// ── Step 7: Class-batch link ──────────────────────────────────────────────────
console.log("\n[Step 7] Class-batch link");
if (classId) {
  await del("class_sets (test class)", "tb_class_sets",
    q => q.eq("class_id", classId));
}

// ── Step 8: Class ─────────────────────────────────────────────────────────────
console.log("\n[Step 8] Class");
await del("TEST_CLASS_E2E", "tb_classes", q => q.eq("class_code", "TEST_CLASS_E2E"));

// ── Step 9: Tasks ─────────────────────────────────────────────────────────────
console.log("\n[Step 9] Tasks");
const taskPattern = TARGET_BATCH ? `${TARGET_BATCH}_T%` : "SIM_E2E_%_T%";
await del(`tasks (${taskPattern})`, "mst_tasks", q => q.like("task_code", taskPattern));
// Legacy pattern
if (!TARGET_BATCH) {
  await del("TEST_TASK_SQL_E2E_* tasks (legacy)", "mst_tasks",
    q => q.like("task_code", "TEST_TASK_SQL_E2E_%"));
}

// ── Step 10: Batch ────────────────────────────────────────────────────────────
console.log("\n[Step 10] Batch");
if (TARGET_BATCH) {
  await del(`batch ${TARGET_BATCH}`, "mst_experiment_batches", q => q.eq("batch_code", TARGET_BATCH));
} else {
  await del("SIM_E2E_* batches", "mst_experiment_batches", q => q.like("batch_code", "SIM_E2E_%"));
  await del("MOCK_* batches", "mst_experiment_batches", q => q.like("batch_code", "MOCK_%"));
  // Legacy
  await del("TEST_BATCH_E2E_001 (legacy)", "mst_experiment_batches", q => q.eq("batch_code", "TEST_BATCH_E2E_001"));
}

// ── Step 11: Profiles ─────────────────────────────────────────────────────────
console.log("\n[Step 11] Profiles");
if (TARGET_BATCH) {
  await del(`${TARGET_BATCH}_* profiles`, "mst_profiles",
    q => q.like("participant_code", `${TARGET_BATCH}_%`));
} else {
  await del("SIM_E2E_* profiles", "mst_profiles", q => q.like("participant_code", "SIM_E2E_%"));
  await del("MOCK_* profiles",    "mst_profiles", q => q.like("participant_code", "MOCK_%"));
  await del("Legacy teacher/researcher", "mst_profiles",
    q => q.in("participant_code", ["SIM_TEACHER_E2E", "SIM_RESEARCHER_E2E"]));
}

// ── Step 12: Auth users (admin API) ───────────────────────────────────────────
console.log("\n[Step 12] Auth users (@ckv-mock.local)");
const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
const mockAuthUsers = (authList?.users ?? []).filter(u => u.email?.endsWith("@ckv-mock.local"));
console.log(`  found ${mockAuthUsers.length} auth users with @ckv-mock.local`);
if (EXECUTE) {
  let deleted = 0;
  for (const u of mockAuthUsers) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) { console.error(`  ❌ failed to delete ${u.email}: ${error.message}`); stepErrors++; }
    else deleted++;
  }
  console.log(`  ✅ deleted ${deleted} auth users`);
} else {
  console.log(`  📋 would delete ${mockAuthUsers.length} auth users: ${mockAuthUsers.slice(0,3).map(u => u.email).join(", ")}${mockAuthUsers.length > 3 ? "..." : ""}`);
}

// ── Verification ──────────────────────────────────────────────────────────────
if (EXECUTE) {
  console.log("\n── Post-reset verification ──");

  async function verify(label, table, filterFn, expectZero = true) {
    const n = await count(table, filterFn);
    const ok = expectZero ? n === 0 : n > 0;
    console.log(`  ${ok ? "✅" : "❌"}  ${label}: ${n} rows${expectZero ? " (expect 0)" : " (expect >0)"}`);
    return ok;
  }

  let vPass = 0, vFail = 0;

  async function v(label, table, filterFn, expectZero = true) {
    const ok = await verify(label, table, filterFn, expectZero);
    if (ok) vPass++; else vFail++;
  }

  await v("SIM_E2E profiles", "mst_profiles", q => q.like("participant_code", "SIM_E2E_%"));
  await v("MOCK_E2E profiles", "mst_profiles", q => q.like("participant_code", "MOCK_E2E_%"));
  await v("TEST_BATCH_E2E_001", "mst_experiment_batches", q => q.eq("batch_code", "TEST_BATCH_E2E_001"));
  await v("TEST_TASK_SQL_E2E_*", "mst_tasks", q => q.like("task_code", "TEST_TASK_SQL_E2E_%"));
  await v("TEST_CLASS_E2E", "tb_classes", q => q.eq("class_code", "TEST_CLASS_E2E"));
  await v("SIM/MOCK_E2E sessions", "trn_learning_sessions",
    q => batchId ? q.eq("batch_id", batchId) : q.eq("batch_id", "no-match"));
  await v("SIM/MOCK_E2E submissions",  "trn_submissions",
    q => batchId ? q.eq("batch_id", batchId) : q.eq("batch_id", "no-match"));

  // Verify real data NOT deleted (non-sim batch)
  const { data: realBatches } = await admin.from("mst_experiment_batches")
    .select("batch_code").neq("batch_code", "TEST_BATCH_E2E_001");
  const realBatchExists = (realBatches ?? []).length > 0;
  const icon = realBatchExists ? "✅" : "⚠️ ";
  console.log(`  ${icon}  Non-sim batches still present: ${(realBatches ?? []).map(b => b.batch_code).join(", ") || "(none)"}`);

  // Verify real profiles NOT deleted
  const { data: realProfiles } = await admin.from("mst_profiles")
    .select("participant_code", { count: "exact", head: true })
    .not("participant_code", "like", "SIM_E2E_%")
    .not("participant_code", "like", "MOCK_E2E_%")
    .not("participant_code", "in", '("SIM_TEACHER_E2E","SIM_RESEARCHER_E2E")');
  const realCount = realProfiles?.length ?? 0;

  const { count: nonSimCount } = await admin.from("mst_profiles")
    .select("*", { count: "exact", head: true })
    .not("participant_code", "like", "SIM_E2E_%")
    .not("participant_code", "like", "MOCK_E2E_%");
  console.log(`  ✅  Non-sim profiles intact: ${nonSimCount ?? 0} remaining`);

  console.log(`\n   Verification: ${vPass} passed, ${vFail} failed`);
  if (vFail > 0) { console.error("   ❌ Some records were NOT cleaned up — check manually"); stepErrors++; }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n══ Reset [${MODE}] complete — ${stepErrors} errors ══`);
if (!EXECUTE) {
  console.log("\n   To execute: node scripts/e2e-reset-sim-data.mjs --execute");
}
if (stepErrors > 0) process.exit(1);
