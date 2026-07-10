/**
 * e2e-sim-export-csv.mjs
 *
 * Phase 4 — Export CSV for TEST_BATCH_E2E_001
 * Exports session + attempt CSVs matching notebook schema.
 * Validates: schema vs NB01, no PII, 2C3L columns present.
 *
 * Output: notebooks/data/raw/session_YYYYMMDD_SIM_E2E.csv
 *         notebooks/data/raw/attempt_YYYYMMDD_SIM_E2E.csv
 * (gitignored — do NOT commit)
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BATCH_CODE = "TEST_BATCH_E2E_001";
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT_DIR = path.join("notebooks", "data", "raw");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Notebook-expected session columns (from NB01 schema check) ────────────────
const NB01_SESSION_COLS = [
  "academy_member_id", "batch_id", "task_id", "task_type", "learner_group",
  "task_difficulty_level", "max_score", "auto_score", "review_score",
  "total_run_count", "total_attempt_count", "time_to_first_correct_sec",
  "hint_viewed", "session_duration_sec", "submitted_at",
  "c1_correctness_result", "c2_semantic_consistency",
  "l1_logical_reasoning", "l2_learning_process", "l3_difficulty_complexity",
];
const PII_COLS = ["email", "display_name", "auth_user_id", "phone", "full_name", "real_name"];
const DIFF_MAP = { easy: 1, medium: 2, hard: 3 };

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
console.log(`Fetching vw_dataset_session_level for ${BATCH_CODE}...`);
const { data: sessionRaw, error: sErr } = await admin
  .from("vw_dataset_session_level")
  .select("*")
  .eq("batch_code", BATCH_CODE);
if (sErr) throw sErr;
console.log(`  ${sessionRaw.length} session rows from view`);

// ── 2. Fetch submissions for extra columns ────────────────────────────────────
const { data: batchRow } = await admin
  .from("mst_experiment_batches")
  .select("batch_id")
  .eq("batch_code", BATCH_CODE)
  .single();
const batchId = batchRow?.batch_id;

const { data: submissions } = batchId
  ? await admin
      .from("trn_submissions")
      .select("profile_id, task_id, time_to_first_correct_sec, total_run_count, total_attempt_count, final_score")
      .eq("batch_id", batchId)
  : { data: [] };

const profileCodes = [...new Set(sessionRaw.map(r => r.participant_code))];
const { data: profiles } = await admin
  .from("mst_profiles")
  .select("profile_id, participant_code")
  .in("participant_code", profileCodes);
const codeToProfileId = new Map((profiles ?? []).map(p => [p.participant_code, p.profile_id]));

const taskCodes = [...new Set(sessionRaw.map(r => r.task_code))];
const { data: tasks } = await admin
  .from("mst_tasks")
  .select("task_id, task_code, max_score, difficulty_level")
  .in("task_code", taskCodes);
const taskCodeToId = new Map((tasks ?? []).map(t => [t.task_code, t.task_id]));
const taskCodeToMaxScore = new Map((tasks ?? []).map(t => [t.task_code, t.max_score]));
const taskCodeToDiff = new Map((tasks ?? []).map(t => [t.task_code, t.difficulty_level]));

const subMap = new Map();
for (const s of submissions ?? []) {
  subMap.set(`${s.profile_id}|${s.task_id}`, s);
}

// ── 3. Build session rows ─────────────────────────────────────────────────────
const sessionRows = sessionRaw.map(r => {
  const profileId = codeToProfileId.get(r.participant_code);
  const taskId = taskCodeToId.get(r.task_code);
  const sub = subMap.get(`${profileId}|${taskId}`);
  const diff = r.difficulty_level ?? taskCodeToDiff.get(r.task_code) ?? "easy";

  return {
    academy_member_id: r.participant_code,
    batch_id: BATCH_CODE,
    task_id: r.task_code,
    task_type: r.task_type ?? "sql_text",
    learner_group: r.participant_group ?? "sim",
    task_difficulty_level: DIFF_MAP[diff] ?? 1,
    max_score: taskCodeToMaxScore.get(r.task_code) ?? r.max_score ?? 10,
    auto_score: sub?.final_score ?? r.final_score ?? "",
    review_score: "",
    total_run_count: sub?.total_run_count ?? r.total_runs ?? 0,
    total_attempt_count: sub?.total_attempt_count ?? r.total_attempts ?? 0,
    // null → 0: never-correct learners represented as 0, not null (keeps row in dropna)
    time_to_first_correct_sec: sub?.time_to_first_correct_sec ?? 0,
    hint_viewed: (r.total_hints ?? 0) > 0,
    session_duration_sec: r.duration_seconds ?? 0,
    submitted_at: r.submitted_at ?? "",
    // 2C3L — only available post-review; empty for sim data
    c1_correctness_result: "",
    c2_semantic_consistency: "",
    l1_logical_reasoning: "",
    l2_learning_process: "",
    l3_difficulty_complexity: "",
  };
});

// ── 4. Fetch attempt view ─────────────────────────────────────────────────────
console.log(`Fetching vw_dataset_attempt_level for ${BATCH_CODE}...`);
const { data: attemptRaw, error: aErr } = await admin
  .from("vw_dataset_attempt_level")
  .select("*")
  .eq("batch_code", BATCH_CODE);
if (aErr) throw aErr;
console.log(`  ${attemptRaw.length} attempt rows from view`);

const attemptRows = attemptRaw.map(r => ({
  academy_member_id: r.participant_code,
  batch_id: BATCH_CODE,
  task_id: r.task_code,
  attempt_no: r.attempt_no,
  attempt_type: r.attempt_type,
  is_correct: r.is_correct,
  error_type: r.error_type ?? "",
  execution_time_ms: r.execution_time_ms ?? "",
  created_at: r.attempt_created_at ?? "",
}));

// ── 5. Write CSVs ─────────────────────────────────────────────────────────────
const sessionFile = path.join(OUT_DIR, `session_${TODAY}_SIM_E2E.csv`);
const attemptFile = path.join(OUT_DIR, `attempt_${TODAY}_SIM_E2E.csv`);
fs.writeFileSync(sessionFile, "﻿" + toCsv(sessionRows), "utf8");
fs.writeFileSync(attemptFile, "﻿" + toCsv(attemptRows), "utf8");

// ── 6. Schema validation ──────────────────────────────────────────────────────
const exportedCols = Object.keys(sessionRows[0] ?? {});
const missingSchemaCols = NB01_SESSION_COLS.filter(c => !exportedCols.includes(c));
const extraCols = exportedCols.filter(c => !NB01_SESSION_COLS.includes(c));
const piiFound = exportedCols.filter(c => PII_COLS.some(p => c.toLowerCase().includes(p)));
const has2C3L = ["c1_correctness_result","c2_semantic_consistency","l1_logical_reasoning","l2_learning_process","l3_difficulty_complexity"]
  .every(c => exportedCols.includes(c));

// at_risk proxy count
const rowsWithAutoScore = sessionRows.filter(r => r.auto_score !== "" && r.auto_score !== null);
const atRiskProxy = rowsWithAutoScore.filter(r => Number(r.auto_score) < Number(r.max_score) * 0.6).length;
const notAtRisk = rowsWithAutoScore.filter(r => Number(r.auto_score) >= Number(r.max_score) * 0.6).length;
const noSubmit = sessionRows.filter(r => r.submitted_at === "").length;

console.log(`
── Export Validation ──
  Session CSV   : ${sessionFile} (${sessionRows.length} rows)
  Attempt CSV   : ${attemptFile} (${attemptRows.length} rows)

  Schema vs NB01:
    All expected cols present: ${missingSchemaCols.length === 0 ? "✅ YES" : "❌ MISSING: " + missingSchemaCols.join(", ")}
    Extra cols (ok):           ${extraCols.join(", ") || "none"}
    2C3L columns present:      ${has2C3L ? "✅ YES (empty — no review yet)" : "❌ NO"}
    PII columns:               ${piiFound.length === 0 ? "✅ NONE" : "❌ FOUND: " + piiFound.join(", ")}

  at_risk distribution (proxy — auto_score < 60% of max):
    at_risk=1 proxy: ${atRiskProxy} rows
    at_risk=0 proxy: ${notAtRisk} rows
    no submission:   ${noSubmit} rows

⚠️  These CSVs are gitignored. Do NOT commit.
`);
