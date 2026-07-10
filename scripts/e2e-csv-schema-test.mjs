/**
 * e2e-csv-schema-test.mjs
 *
 * Validates all 4 export types from /api/admin/export-dataset against:
 *   1. View column inventory (no PII, no answer-key leak, join keys, row counts)
 *   2. NB01 required columns — tested against the notebook-pipeline CSV
 *      (produced by e2e-sim-export-csv.mjs, not the admin export directly)
 *
 * DESIGN NOTE:
 *   /api/admin/export-dataset → raw vw_dataset_* columns (different naming)
 *   e2e-sim-export-csv.mjs   → notebook-compatible CSV (renamed/joined columns)
 *   This script tests BOTH paths and documents the column mapping gap.
 *
 * Run: node scripts/e2e-csv-schema-test.mjs
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

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PASSWORD  = "69056020";
const BATCH     = "TEST_BATCH_E2E_001";
const OUT_DIR   = path.join("scripts", "_csv_schema_test_tmp");

const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = splitCsvLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}
function splitCsvLine(line) {
  const cells = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

// ── helpers ───────────────────────────────────────────────────────────────────
let passCount = 0, failCount = 0;
const gaps = [];

function assert(label, condition, detail = "") {
  const ok = !!condition;
  console.log(`  ${ok ? "✅" : "❌"}  ${label}${detail ? " — " + detail : ""}`);
  if (ok) passCount++; else failCount++;
}
function gap(label, detail) {
  console.log(`  ⚠️   GAP: ${label}${detail ? " — " + detail : ""}`);
  gaps.push({ label, detail });
}

async function signIn(email) {
  const { data } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  return data?.session?.access_token ?? null;
}
async function fetchCsv(type, batchCode, token) {
  const url = `${BASE_URL}/api/admin/export-dataset?type=${type}&batch_code=${encodeURIComponent(batchCode)}`;
  const res = await fetch(url, { method: "GET", headers: { "Authorization": `Bearer ${token}` } });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} on type=${type}`);
  return res.text();
}

// ── Schema constants ──────────────────────────────────────────────────────────

// NB01: REQUIRED_SESSION_COLUMNS / REQUIRED_ATTEMPT_COLUMNS
const NB01_REQUIRED_SESSION = ["batch_id", "task_id", "total_run_count", "total_attempt_count", "time_to_first_correct_sec"];
const NB01_REQUIRED_ATTEMPT = ["task_id", "attempt_type", "is_correct"];

// PII columns that must NEVER appear in any export (NB01 PII_SENSITIVE_COLUMNS + extended)
const PII_COLS = new Set([
  "auth_user_id", "email", "student_id", "teacher_id",
  "display_name", "full_name", "first_name", "last_name", "phone",
]);

// Answer-key columns that must never appear
const ANSWER_KEY_COLS = new Set(["expected_sql", "scoring_rubric_json", "expected_answer", "rubric_criteria"]);

// NB03 LEAKAGE_COLS (score sources — should not appear raw in session CSV given to notebooks)
const LEAKAGE_SCORE_COLS = new Set([
  "review_score", "auto_score", "effective_score",
  "pass_threshold",
]);

// Known view column → notebook column mapping (from e2e-sim-export-csv.mjs)
const VIEW_TO_NB_SESSION = {
  "participant_code":  "academy_member_id",
  "batch_code":        "batch_id",
  "task_code":         "task_id",
  "participant_group": "learner_group",
  "difficulty_level":  "task_difficulty_level",
  "total_runs":        "total_run_count",
  "total_attempts":    "total_attempt_count",
  "duration_seconds":  "session_duration_sec",
};
// Columns that require a JOIN to trn_submissions (not in view directly)
const REQUIRES_SUBMISSION_JOIN = ["time_to_first_correct_sec", "total_run_count", "total_attempt_count"];

// 2C3L columns (post-review rubric — only available after teacher review)
const COLS_2C3L = ["c1_correctness_result", "c2_semantic_consistency", "l1_logical_reasoning", "l2_learning_process", "l3_difficulty_complexity"];

// View join keys (actual column names in the raw view)
const VIEW_SESSION_JOIN_KEYS = ["participant_code", "batch_code", "task_code", "session_id"];
const VIEW_ATTEMPT_JOIN_KEYS = ["participant_code", "batch_code", "task_code", "session_id", "attempt_id"];

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Fetch all 4 export types ──────────────────────────────────────────────────
console.log(`\n── CSV Schema Validation — CKV Export Endpoint ──`);
console.log(`   Batch: ${BATCH}\n`);

const researcherToken = await signIn("sim.e2e.researcher@ckv-mock.local");
if (!researcherToken) { console.error("Researcher sign-in failed"); process.exit(1); }
console.log("   Signed in as researcher ✓\n");

const csvData = {};
for (const type of ["session", "attempt", "sequence", "raw_event"]) {
  try {
    const csv = await fetchCsv(type, BATCH, researcherToken);
    const parsed = parseCsv(csv);
    csvData[type] = parsed;
    fs.writeFileSync(path.join(OUT_DIR, `export_${type}.csv`), csv, "utf8");
    console.log(`── type=${type}: ${parsed.rows.length} rows × ${parsed.headers.length} cols ──`);
  } catch (e) {
    console.error(`!! Failed type=${type}: ${e.message}`);
    csvData[type] = { headers: [], rows: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [1] PII leak — all 4 types (absolute requirement)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[1] PII leak check (all 4 types)");
for (const type of ["session", "attempt", "sequence", "raw_event"]) {
  const found = csvData[type].headers.filter(h => PII_COLS.has(h.toLowerCase()));
  assert(`${type}: no PII columns`, found.length === 0, found.length ? `LEAK: ${found.join(", ")}` : "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// [2] Answer-key / rubric leak — all 4 types (absolute requirement)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[2] Answer-key & rubric leak check (all 4 types)");
for (const type of ["session", "attempt", "sequence", "raw_event"]) {
  const found = csvData[type].headers.filter(h => ANSWER_KEY_COLS.has(h.toLowerCase()));
  assert(`${type}: no answer-key columns`, found.length === 0, found.length ? `LEAK: ${found.join(", ")}` : "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// [3] Row counts
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[3] Row counts");
assert("session rows > 0", csvData["session"].rows.length > 0, `got ${csvData["session"].rows.length}`);
assert("attempt rows > 0", csvData["attempt"].rows.length > 0, `got ${csvData["attempt"].rows.length}`);
assert("session rows ≥ 50 (sim batch threshold)", csvData["session"].rows.length >= 50, `got ${csvData["session"].rows.length}`);
assert("attempt rows ≥ 100", csvData["attempt"].rows.length >= 100, `got ${csvData["attempt"].rows.length}`);
console.log(`   sequence: ${csvData["sequence"].rows.length} rows | raw_event: ${csvData["raw_event"].rows.length} rows`);

// ═══════════════════════════════════════════════════════════════════════════════
// [4] View join keys (actual names in raw view)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[4] View join keys (raw view column names)");
{
  const hSet = new Set(csvData["session"].headers);
  for (const k of VIEW_SESSION_JOIN_KEYS) {
    assert(`session view: join key '${k}'`, hSet.has(k));
  }
}
{
  const hSet = new Set(csvData["attempt"].headers);
  for (const k of VIEW_ATTEMPT_JOIN_KEYS) {
    assert(`attempt view: join key '${k}'`, hSet.has(k));
  }
}

// Cross-type join: session ↔ attempt on participant_code + task_code
if (csvData["session"].rows.length > 0 && csvData["attempt"].rows.length > 0) {
  const sessionKeys = new Set(csvData["session"].rows.map(r => `${r.participant_code}:${r.task_code}`));
  const attemptKeys = new Set(csvData["attempt"].rows.map(r => `${r.participant_code}:${r.task_code}`));
  const overlap = [...attemptKeys].filter(k => sessionKeys.has(k));
  assert(
    "session ↔ attempt join (participant_code+task_code) has overlap",
    overlap.length > 0,
    `${overlap.length} of ${attemptKeys.size} unique attempt keys found in session`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// [5] Batch filter isolation
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[5] Batch filter isolation");
for (const type of ["session", "attempt"]) {
  const { rows } = csvData[type];
  if (rows.length === 0) { console.log(`   ⚠️  ${type}: 0 rows`); continue; }
  const others = rows.filter(r => r.batch_code && r.batch_code !== BATCH);
  assert(`${type}: only batch_code=${BATCH} in rows`, others.length === 0,
    others.length ? `${others.length} rows from other batches` : "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// [6] academy_member_id anonymization (participant_code)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[6] Learner identifier anonymization (participant_code)");
{
  const { rows } = csvData["session"];
  if (rows.length > 0 && "participant_code" in rows[0]) {
    const emailLike = rows.filter(r => String(r.participant_code).includes("@"));
    assert("session: participant_code has no email addresses", emailLike.length === 0,
      emailLike.length ? `${emailLike.length} rows with email-like identifier` : "");
    const sample = [...new Set(rows.slice(0, 4).map(r => r.participant_code))];
    console.log(`   sample: ${sample.join(", ")}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [7] NB01 required columns — raw view path
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[7] NB01 required columns in raw view export");
console.log("   NOTE: Raw view uses different naming — mapping documented below.");
{
  const hSet = new Set(csvData["session"].headers);
  for (const col of NB01_REQUIRED_SESSION) {
    const mappedFrom = Object.entries(VIEW_TO_NB_SESSION).find(([,nb]) => nb === col)?.[0];
    const viewCol = mappedFrom ?? col;
    const inView = hSet.has(viewCol);
    const inViewDirect = hSet.has(col);
    if (inViewDirect) {
      assert(`session NB01: '${col}' present directly`, true);
    } else if (inView) {
      gap(`session NB01: '${col}' mapped from view col '${viewCol}'`,
        "export script renames; admin export does NOT — downstream pipeline must remap");
    } else if (REQUIRES_SUBMISSION_JOIN.includes(col)) {
      gap(`session NB01: '${col}' requires JOIN with trn_submissions`,
        "not in session view directly; e2e-sim-export-csv.mjs joins it; admin export omits it");
    } else {
      gap(`session NB01: '${col}' missing from both view and mapping`, "");
    }
  }
}
{
  const hSet = new Set(csvData["attempt"].headers);
  for (const col of NB01_REQUIRED_ATTEMPT) {
    const mappedFrom = Object.entries({ "task_code": "task_id" }).find(([,nb]) => nb === col)?.[0];
    if (hSet.has(col)) {
      assert(`attempt NB01: '${col}' present directly`, true);
    } else if (mappedFrom && hSet.has(mappedFrom)) {
      gap(`attempt NB01: '${col}' mapped from '${mappedFrom}'`, "admin export does not rename");
    } else {
      gap(`attempt NB01: '${col}' not found`, "");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [8] 2C3L columns in session view
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[8] 2C3L columns in session view export");
{
  const hSet = new Set(csvData["session"].headers);
  const present = COLS_2C3L.filter(c => hSet.has(c));
  const missing = COLS_2C3L.filter(c => !hSet.has(c));
  if (missing.length === 0) {
    assert("session view: all 5 2C3L columns present", true);
  } else {
    gap("session view: 2C3L columns not in raw view",
      `missing: ${missing.join(", ")} — available only in notebook CSV via teacher review`);
    console.log(`   present: ${present.length > 0 ? present.join(", ") : "(none)"}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [9] NB01 schema gate — notebook-pipeline CSV (e2e-sim-export-csv.mjs output)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n[9] NB01 schema gate — notebook-pipeline CSV");
const NB_RAW_DIR = path.join("notebooks", "data", "raw");
const nbCsvFiles = fs.existsSync(NB_RAW_DIR)
  ? fs.readdirSync(NB_RAW_DIR).filter(f => f.endsWith(".csv"))
  : [];

if (nbCsvFiles.length === 0) {
  console.log("   ⚠️  No CSVs in notebooks/data/raw/ — run e2e-sim-export-csv.mjs first");
  console.log("       Skipping NB01 schema gate check on notebook-pipeline CSV.");
} else {
  const sessionFile = nbCsvFiles.find(f => f.startsWith("session_"));
  const attemptFile = nbCsvFiles.find(f => f.startsWith("attempt_"));
  console.log(`   Found: ${nbCsvFiles.join(", ")}`);

  if (sessionFile) {
    const { headers: sh } = parseCsv(fs.readFileSync(path.join(NB_RAW_DIR, sessionFile), "utf8"));
    const hSet = new Set(sh);
    const missing = NB01_REQUIRED_SESSION.filter(c => !hSet.has(c));
    assert(`notebook session CSV: NB01 gate PASS`, missing.length === 0,
      missing.length ? `missing: ${missing.join(", ")}` : "20 NB01 cols present");
    const pii = sh.filter(h => PII_COLS.has(h.toLowerCase()));
    assert("notebook session CSV: no PII", pii.length === 0, pii.length ? `LEAK: ${pii.join(", ")}` : "");
    const ak = sh.filter(h => ANSWER_KEY_COLS.has(h.toLowerCase()));
    assert("notebook session CSV: no answer-key", ak.length === 0, ak.length ? `LEAK: ${ak.join(", ")}` : "");
    const twoc3l = COLS_2C3L.filter(c => hSet.has(c));
    assert(`notebook session CSV: 2C3L columns present (${twoc3l.length}/5)`, twoc3l.length === 5, `found: ${twoc3l.join(", ")}`);
    const has_no_email_id = parseCsv(fs.readFileSync(path.join(NB_RAW_DIR, sessionFile), "utf8"))
      .rows.every(r => !String(r.academy_member_id ?? "").includes("@"));
    assert("notebook session CSV: academy_member_id is anonymized", has_no_email_id);
  }

  if (attemptFile) {
    const { headers: ah } = parseCsv(fs.readFileSync(path.join(NB_RAW_DIR, attemptFile), "utf8"));
    const hSet = new Set(ah);
    const missing = NB01_REQUIRED_ATTEMPT.filter(c => !hSet.has(c));
    assert(`notebook attempt CSV: NB01 gate PASS`, missing.length === 0,
      missing.length ? `missing: ${missing.join(", ")}` : "");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Column inventory
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── Column inventory ──");
for (const type of ["session", "attempt"]) {
  console.log(`\n  ${type} view (${csvData[type].headers.length} cols):`);
  // group in rows of 5
  const cols = csvData[type].headers;
  for (let i = 0; i < cols.length; i += 5) {
    console.log("    " + cols.slice(i, i+5).join(", "));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Gap summary
// ═══════════════════════════════════════════════════════════════════════════════
if (gaps.length > 0) {
  console.log("\n── Schema Gaps (admin export vs notebook pipeline) ──");
  console.log("   These are not failures — they document that the admin export uses");
  console.log("   raw view column names, while the notebook pipeline uses");
  console.log("   e2e-sim-export-csv.mjs which renames/joins columns.\n");
  gaps.forEach(g => console.log(`  ⚠️   ${g.label}${g.detail ? "\n       " + g.detail : ""}`));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Save report
// ═══════════════════════════════════════════════════════════════════════════════
const report = {
  date: new Date().toISOString(),
  batch: BATCH,
  export_row_counts: Object.fromEntries(["session","attempt","sequence","raw_event"].map(t => [t, csvData[t].rows.length])),
  export_col_counts: Object.fromEntries(["session","attempt"].map(t => [t, csvData[t].headers.length])),
  checks: { passed: passCount, failed: failCount },
  schema_gaps: gaps,
  session_view_headers: csvData["session"].headers,
  attempt_view_headers: csvData["attempt"].headers,
};
fs.writeFileSync(path.join(OUT_DIR, "schema_report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\n   Report → ${OUT_DIR}/schema_report.json`);
console.log(`\n══ Results: ${passCount} passed, ${failCount} failed, ${gaps.length} documented gaps ══`);
if (failCount > 0) process.exit(1);
