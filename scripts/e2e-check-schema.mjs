/**
 * e2e-check-schema.mjs
 * ตรวจ columns ของทุก view ที่ใช้ export และตรวจ PII
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

// Columns the notebooks expect (from notebook 01 schema validation)
const NOTEBOOK_SESSION_COLS = [
  "participant_code", "batch_code", "task_code", "task_type", "difficulty_level",
  "session_id", "started_at", "ended_at", "duration_seconds", "session_status",
  "total_runs", "total_attempts", "total_errors", "final_score", "is_passed", "submitted_at",
];

const PII_COLS = ["email", "display_name", "auth_user_id", "phone", "real_name", "full_name"];

const VIEWS = [
  "vw_dataset_session_level",
  "vw_dataset_attempt_level",
  "vw_dataset_sequence_level",
  "vw_dataset_raw_event_log",
];

for (const view of VIEWS) {
  const { data, error } = await supabase.from(view).select("*").limit(2);
  if (error) {
    console.log(`\n❌  ${view}: ${error.message}`);
    continue;
  }
  const cols = data?.[0] ? Object.keys(data[0]) : [];
  const rows = data?.length ?? 0;
  const piiFound = cols.filter(c => PII_COLS.some(p => c.toLowerCase().includes(p)));

  console.log(`\n── ${view} (${rows} sample rows) ──`);
  console.log(`   Columns (${cols.length}): ${cols.join(", ")}`);
  if (piiFound.length > 0) {
    console.log(`   ⚠️  PII columns found: ${piiFound.join(", ")}`);
  } else {
    console.log(`   ✅  No PII columns`);
  }
}

// Check session view vs notebook expectations
console.log(`\n── Session view vs notebook expected columns ──`);
const { data: sv } = await supabase.from("vw_dataset_session_level").select("*").limit(1);
const actualCols = sv?.[0] ? Object.keys(sv[0]) : [];
const missing = NOTEBOOK_SESSION_COLS.filter(c => !actualCols.includes(c));
const present = NOTEBOOK_SESSION_COLS.filter(c => actualCols.includes(c));
console.log(`   ✅  Present (${present.length}): ${present.join(", ")}`);
if (missing.length > 0) {
  console.log(`   ⚠️  Missing from view (${missing.length}): ${missing.join(", ")}`);
} else {
  console.log(`   ✅  All expected columns present`);
}

// Check at_risk proxy data
const { data: atRisk } = await supabase
  .from("vw_dataset_session_level")
  .select("final_score, is_passed, submitted_at");
const total = atRisk?.length ?? 0;
const submitted = atRisk?.filter(r => r.submitted_at != null).length ?? 0;
const passed = atRisk?.filter(r => r.is_passed === true).length ?? 0;
const missing_sub = atRisk?.filter(r => r.submitted_at == null).length ?? 0;
console.log(`\n── at_risk proxy check ──`);
console.log(`   Total session rows: ${total}`);
console.log(`   submitted_at not null: ${submitted}`);
console.log(`   submitted_at null (at_risk=1 candidates): ${missing_sub}`);
console.log(`   is_passed=true: ${passed}`);
console.log(`   Estimated at_risk rate: ${total > 0 ? ((missing_sub + (submitted - passed)) / total * 100).toFixed(1) : "N/A"}%`);

// unique learners
const uniqueLearners = new Set(atRisk?.map(r => r.participant_code) ?? []).size;
const { data: sl2 } = await supabase.from("vw_dataset_session_level").select("participant_code");
const uniq2 = new Set(sl2?.map(r => r.participant_code) ?? []).size;
console.log(`   Unique participant_codes: ${uniq2}`);
