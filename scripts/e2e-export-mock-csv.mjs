/**
 * e2e-export-mock-csv.mjs
 *
 * Export mock E2E session + attempt CSVs จาก Supabase
 * ทำ column rename ให้ตรงกับ notebook schema
 * บันทึกใน notebooks/data/raw/ (ไม่ commit)
 */
import fs from "node:fs";
import path from "node:path";
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const BATCH_CODE = "SAQT0001";
const OUT_DIR = path.join("notebooks", "data", "raw");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────
function escapeCsv(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(","))].join("\n");
}

// ── 1. Fetch session view ─────────────────────────────────────────────────────
console.log("Fetching session data...");
const { data: sessionRaw, error: sErr } = await supabase
  .from("vw_dataset_session_level")
  .select("*")
  .eq("batch_code", BATCH_CODE);
if (sErr) throw sErr;
console.log(`  ${sessionRaw.length} session rows`);

// ── 2. Fetch submissions for extra columns ────────────────────────────────────
const profileCodes = [...new Set(sessionRaw.map(r => r.participant_code))];
const { data: profiles } = await supabase
  .from("mst_profiles")
  .select("profile_id, participant_code")
  .in("participant_code", profileCodes);
const codeToProfileId = new Map((profiles ?? []).map(p => [p.participant_code, p.profile_id]));

// Fetch submissions for time_to_first_correct_sec and review scores
const { data: batchRow } = await supabase
  .from("mst_experiment_batches")
  .select("batch_id")
  .eq("batch_code", BATCH_CODE)
  .single();
const batchId = batchRow?.batch_id;

const { data: submissions } = batchId
  ? await supabase
      .from("trn_submissions")
      .select("profile_id, task_id, time_to_first_correct_sec, total_run_count, total_attempt_count, final_score")
      .eq("batch_id", batchId)
  : { data: [] };

// Build submission lookup: profile_id + task_id → row
const subMap = new Map();
for (const s of submissions ?? []) {
  subMap.set(`${s.profile_id}|${s.task_id}`, s);
}

// Fetch task max_score
const taskCodes = [...new Set(sessionRaw.map(r => r.task_code))];
const { data: tasks } = await supabase
  .from("mst_tasks")
  .select("task_id, task_code, max_score")
  .in("task_code", taskCodes);
const taskCodeToId = new Map((tasks ?? []).map(t => [t.task_code, t.task_id]));
const taskCodeToMaxScore = new Map((tasks ?? []).map(t => [t.task_code, t.max_score]));

// ── 3. Build session CSV rows ─────────────────────────────────────────────────
const sessionRows = sessionRaw.map(r => {
  const profileId = codeToProfileId.get(r.participant_code);
  const taskId = taskCodeToId.get(r.task_code);
  const sub = subMap.get(`${profileId}|${taskId}`);

  return {
    academy_member_id: r.participant_code,
    batch_id: r.batch_code,
    task_id: r.task_code,
    task_type: r.task_type,
    learner_group: r.participant_group ?? "pilot",
    task_difficulty_level: { easy: 1, medium: 2, hard: 3 }[r.difficulty_level] ?? 1,
    max_score: taskCodeToMaxScore.get(r.task_code) ?? "",
    auto_score: sub?.final_score ?? "",
    review_score: "",                         // no rubric scores in mock
    total_run_count: sub?.total_run_count ?? r.total_runs ?? 0,
    total_attempt_count: sub?.total_attempt_count ?? r.total_attempts ?? 0,
    // null → 0 so NB03 dropna keeps at_risk rows (never-correct learners have 0, not null)
    time_to_first_correct_sec: sub?.time_to_first_correct_sec ?? 0,
    hint_viewed: r.total_hints > 0,
    session_duration_sec: r.duration_seconds ?? "",
    submitted_at: r.submitted_at ?? "",
    c1_correctness_result: "",
    c2_semantic_consistency: "",
    l1_logical_reasoning: "",
    l2_learning_process: "",
    l3_difficulty_complexity: "",
  };
});

// ── 4. Fetch attempt view ─────────────────────────────────────────────────────
console.log("Fetching attempt data...");
const { data: attemptRaw, error: aErr } = await supabase
  .from("vw_dataset_attempt_level")
  .select("*")
  .eq("batch_code", BATCH_CODE);
if (aErr) throw aErr;
console.log(`  ${attemptRaw.length} attempt rows`);

const attemptRows = attemptRaw.map(r => ({
  academy_member_id: r.participant_code,
  batch_id: r.batch_code,
  task_id: r.task_code,
  attempt_no: r.attempt_no,
  attempt_type: r.attempt_type,
  is_correct: r.is_correct,
  error_type: r.error_type ?? "",
  execution_time_ms: r.execution_time_ms ?? "",
  created_at: r.attempt_created_at ?? "",
}));

// ── 5. Write CSVs ─────────────────────────────────────────────────────────────
const sessionFile = path.join(OUT_DIR, `session_${TODAY}_E2EMOCK.csv`);
const attemptFile = path.join(OUT_DIR, `attempt_${TODAY}_E2EMOCK.csv`);

fs.writeFileSync(sessionFile, "﻿" + toCsv(sessionRows), "utf8");
fs.writeFileSync(attemptFile, "﻿" + toCsv(attemptRows), "utf8");

console.log(`
── Export complete ──
  Session CSV: ${sessionFile}  (${sessionRows.length} rows)
  Attempt CSV: ${attemptFile}  (${attemptRows.length} rows)

  Columns — Session: ${Object.keys(sessionRows[0] ?? {}).join(", ")}
  Columns — Attempt: ${Object.keys(attemptRows[0] ?? {}).join(", ")}

⚠️  These files are gitignored (raw CSV). Do not commit.
`);

// ── 6. Quick PII check ────────────────────────────────────────────────────────
const PII = ["email", "display_name", "auth_user_id", "phone"];
const sessionCols = Object.keys(sessionRows[0] ?? {});
const attemptCols = Object.keys(attemptRows[0] ?? {});
const sFound = sessionCols.filter(c => PII.some(p => c.toLowerCase().includes(p)));
const aFound = attemptCols.filter(c => PII.some(p => c.toLowerCase().includes(p)));
if (sFound.length || aFound.length) {
  console.log(`⚠️  PII detected — Session: ${sFound} | Attempt: ${aFound}`);
} else {
  console.log("✅  No PII columns in exported CSVs");
}
