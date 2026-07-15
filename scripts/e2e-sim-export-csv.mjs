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
const cliOpts = parseArgs();
const BATCH_CODE = cliOpts["batch"] ?? "SIM_E2E_2026_001";

if (!BATCH_CODE.startsWith("SIM_E2E_") && !BATCH_CODE.startsWith("MOCK_") && !BATCH_CODE.startsWith("TEST_")) {
  console.error(`ERROR: Batch code must start with SIM_E2E_, MOCK_, or TEST_. Got: ${BATCH_CODE}`);
  process.exit(1);
}

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
// Derive short batch tag for filename (strip SIM_E2E_ prefix, replace _ with -)
const BATCH_TAG = BATCH_CODE.replace(/^(SIM_E2E_|MOCK_|TEST_BATCH_E2E_)/, "").replace(/_/g, "-") || BATCH_CODE;
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

// ── 5. Write session + attempt CSVs ──────────────────────────────────────────
const sessionFile = path.join(OUT_DIR, `session_${TODAY}_${BATCH_TAG}.csv`);
const attemptFile = path.join(OUT_DIR, `attempt_${TODAY}_${BATCH_TAG}.csv`);
fs.writeFileSync(sessionFile, "﻿" + toCsv(sessionRows), "utf8");
fs.writeFileSync(attemptFile, "﻿" + toCsv(attemptRows), "utf8");

// ── 6. Fetch and write sequence CSV ──────────────────────────────────────────
console.log(`Fetching vw_dataset_sequence_level for ${BATCH_CODE}...`);
const { data: seqRaw, error: seqErr } = await admin
  .from("vw_dataset_sequence_level")
  .select("*")
  .eq("batch_code", BATCH_CODE);
if (seqErr) throw seqErr;
console.log(`  ${seqRaw.length} sequence/event rows from view`);

const sequenceRows = seqRaw.map(r => ({
  academy_member_id:    r.participant_code,
  batch_code:           r.batch_code ?? BATCH_CODE,
  task_code:            r.task_code,
  session_id:           r.session_id,
  session_status:       r.session_status,
  session_started_at:   r.session_started_at,
  event_id:             r.event_id,
  event_order:          r.event_order,
  event_type:           r.event_type,
  event_value:          r.event_value ?? "",
  duration_from_start:  r.duration_from_start ?? "",
  event_time:           r.event_time,
  metadata_json:        r.metadata_json ? JSON.stringify(r.metadata_json) : "",
}));

const sequenceFile = path.join(OUT_DIR, `sequence_${TODAY}_${BATCH_TAG}.csv`);
fs.writeFileSync(sequenceFile, "﻿" + toCsv(sequenceRows), "utf8");

// ── 7. Fetch rubric scores and build outcome CSV ──────────────────────────────
console.log(`Fetching rubric scores for ${BATCH_CODE}...`);

// Canonical 2C3L keys and weights (must match PHASE4_RESEARCH_CONTRACT_v1.md §4)
const CANONICAL_KEYS = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
];

const { data: submissionsForOutcome } = batchId
  ? await admin
      .from("trn_submissions")
      .select("submission_id, profile_id, task_id, submitted_at")
      .eq("batch_id", batchId)
  : { data: [] };

const submissionIds = (submissionsForOutcome ?? []).map(s => s.submission_id);

let rubricRowsForBatch = [];
if (submissionIds.length > 0) {
  const { data: rRows, error: rErr } = await admin
    .from("trn_submission_rubric_scores")
    .select("submission_id, criterion_key, criterion_score, max_criterion_score")
    .in("submission_id", submissionIds);
  if (rErr) throw rErr;
  rubricRowsForBatch = rRows ?? [];
}
console.log(`  ${rubricRowsForBatch.length} rubric score rows`);

// Group rubric rows by submission_id
const rubricBySubmission = new Map();
for (const r of rubricRowsForBatch) {
  if (!rubricBySubmission.has(r.submission_id)) rubricBySubmission.set(r.submission_id, []);
  rubricBySubmission.get(r.submission_id).push(r);
}

// Build a task_id → task_code map from what we already fetched
const taskIdToCode = new Map([...(tasks ?? [])].map(t => [t.task_id, t.task_code]));

function deriveGrade(score) {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 55) return "D";
  if (score >= 45) return "E";
  return "F";
}

const outcomeRows = (submissionsForOutcome ?? []).map(sub => {
  const profileCode = [...codeToProfileId.entries()].find(([, id]) => id === sub.profile_id)?.[0] ?? sub.profile_id;
  const taskCode = taskIdToCode.get(sub.task_id) ?? sub.task_id;
  const rubric = rubricBySubmission.get(sub.submission_id) ?? [];
  const byKey = new Map(rubric.map(r => [r.criterion_key, r]));

  const scores = {};
  let totalRubric = 0;
  let maxRubric = 0;
  let criteriaCount = 0;
  for (const key of CANONICAL_KEYS) {
    const r = byKey.get(key);
    scores[`${key}_score`] = r?.criterion_score ?? "";
    scores[`${key}_max`]   = r?.max_criterion_score ?? "";
    if (r) {
      totalRubric  += Number(r.criterion_score);
      maxRubric    += Number(r.max_criterion_score);
      criteriaCount++;
    }
  }

  const hasAll = criteriaCount === CANONICAL_KEYS.length;
  const total2c3l = hasAll && maxRubric > 0
    ? Math.round((totalRubric / maxRubric) * 10000) / 100
    : "";
  const atRisk     = total2c3l !== "" ? (total2c3l < 65 ? 1 : 0) : "";
  const grade      = total2c3l !== "" ? deriveGrade(total2c3l) : "";
  const labelSource   = criteriaCount === 0 ? "no_rubric"   : "auto_generated";
  const labelValidity = criteriaCount === 0 ? "invalid"     : "pilot_only";

  return {
    participant_code:    profileCode,
    batch_code:          BATCH_CODE,
    task_code:           taskCode,
    submission_id:       sub.submission_id,
    submitted_at:        sub.submitted_at ?? "",
    ...scores,
    total_rubric_score:  hasAll ? totalRubric  : "",
    max_rubric_score:    hasAll ? maxRubric    : "",
    total_2c3l_score:    total2c3l,
    grade_letter:        grade,
    at_risk:             atRisk,
    label_source:        labelSource,
    label_validity:      labelValidity,
    is_teacher_reviewed: false,
    criteria_count:      criteriaCount,
  };
});

const outcomeFile = path.join(OUT_DIR, `outcome_${TODAY}_${BATCH_TAG}.csv`);
fs.writeFileSync(outcomeFile, "﻿" + toCsv(outcomeRows), "utf8");

// ── 8. Schema validation ──────────────────────────────────────────────────────
const exportedCols = Object.keys(sessionRows[0] ?? {});
const missingSchemaCols = NB01_SESSION_COLS.filter(c => !exportedCols.includes(c));
const extraCols = exportedCols.filter(c => !NB01_SESSION_COLS.includes(c));
const piiFound = exportedCols.filter(c => PII_COLS.some(p => c.toLowerCase().includes(p)));
const has2C3L = ["c1_correctness_result","c2_semantic_consistency","l1_logical_reasoning","l2_learning_process","l3_difficulty_complexity"]
  .every(c => exportedCols.includes(c));

const seqColsOk = sequenceRows.length === 0 || (
  ["academy_member_id","batch_code","task_code","session_id","event_order","event_type","event_time"]
    .every(c => Object.keys(sequenceRows[0]).includes(c))
);

const outcomeColsOk = outcomeRows.length === 0 || (
  ["participant_code","batch_code","task_code","submission_id","total_2c3l_score","at_risk","label_source","label_validity"]
    .every(c => Object.keys(outcomeRows[0]).includes(c))
);

// at_risk distribution from outcome CSV
const outcomeWithScore = outcomeRows.filter(r => r.at_risk !== "");
const atRisk1 = outcomeWithScore.filter(r => r.at_risk === 1).length;
const atRisk0 = outcomeWithScore.filter(r => r.at_risk === 0).length;
const noRubric = outcomeRows.filter(r => r.label_source === "no_rubric").length;

console.log(`
── Export Validation ──
  Session CSV   : ${sessionFile} (${sessionRows.length} rows)
  Attempt CSV   : ${attemptFile} (${attemptRows.length} rows)
  Sequence CSV  : ${sequenceFile} (${sequenceRows.length} rows)
  Outcome CSV   : ${outcomeFile} (${outcomeRows.length} rows)

  Session schema vs NB01:
    All expected cols present : ${missingSchemaCols.length === 0 ? "✅ YES" : "❌ MISSING: " + missingSchemaCols.join(", ")}
    Extra cols (ok)           : ${extraCols.join(", ") || "none"}
    2C3L columns present      : ${has2C3L ? "✅ YES (empty — no review yet)" : "❌ NO"}
    PII columns               : ${piiFound.length === 0 ? "✅ NONE" : "❌ FOUND: " + piiFound.join(", ")}

  Sequence schema : ${seqColsOk ? "✅ required columns present" : "❌ MISSING required columns"}
  Outcome schema  : ${outcomeColsOk ? "✅ required columns present" : "❌ MISSING required columns"}

  at_risk distribution (canonical 2C3L ≥ 65 threshold):
    at_risk=1 : ${atRisk1} rows
    at_risk=0 : ${atRisk0} rows
    no_rubric : ${noRubric} rows

  ⚠️  label_source=auto_generated / label_validity=pilot_only
  ⚠️  These CSVs are gitignored. Do NOT commit.
`);
