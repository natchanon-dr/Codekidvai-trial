import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(p) {
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(".env.local");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Set expected_sql (column read by scoring engine) on E2E sim tasks
const fixes = [
  { code: "TEST_TASK_SQL_E2E_001", sql: "SELECT * FROM students" },
  { code: "TEST_TASK_SQL_E2E_002", sql: "SELECT name, grade_level FROM students WHERE grade_level = 'M1' ORDER BY name" },
  { code: "TEST_TASK_SQL_E2E_003", sql: "SELECT name FROM students WHERE grade_level = 'M2' ORDER BY name DESC" },
];

for (const f of fixes) {
  const { error } = await admin
    .from("mst_tasks")
    .update({ expected_sql: f.sql })
    .eq("task_code", f.code);
  console.log(f.code, error ? "ERR: " + error.message : "OK");
}
console.log("Done — expected_sql set on all 3 E2E tasks");
