/**
 * e2e-recon.mjs  —  E2E Mock Validation: reconnaissance query
 * Checks accounts, classes, batches, tasks, and session/submission records.
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

async function q(label, fn) {
  try {
    const result = await fn();
    console.log(`\n── ${label} ──`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    console.error(`\n── ${label} ERROR ──`, e.message);
    return null;
  }
}

// 1. Accounts by role
await q("Profiles by role", async () => {
  const { data, error } = await supabase
    .from("mst_profiles")
    .select("profile_id, display_name, role, participant_code")
    .in("role", ["admin", "teacher", "researcher", "student"])
    .order("role");
  if (error) throw error;
  const summary = {};
  for (const r of data ?? []) {
    summary[r.role] = (summary[r.role] ?? []);
    summary[r.role].push({ id: r.profile_id, name: r.display_name, code: r.participant_code });
  }
  return summary;
});

// 2. Auth users (dev accounts)
await q("Auth users (dev emails)", async () => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return (data?.users ?? [])
    .filter(u => u.email?.includes("ckv-dev") || u.email?.includes("test"))
    .map(u => ({ email: u.email, id: u.id, confirmed: u.email_confirmed_at != null }));
});

// 3. Classes
await q("Active classes", async () => {
  const { data, error } = await supabase
    .from("tb_classes")
    .select("class_id, class_code, class_name, is_active")
    .eq("is_active", true)
    .limit(10);
  if (error) throw error;
  return data;
});

// 4. Enrolled students per class
await q("Students enrolled per class", async () => {
  const { data, error } = await supabase
    .from("tb_class_students")
    .select("class_id, status, profile_id")
    .eq("status", "active");
  if (error) throw error;
  const map = {};
  for (const r of data ?? []) {
    map[r.class_id] = (map[r.class_id] ?? 0) + 1;
  }
  return map;
});

// 5. Batches
await q("Experiment batches (top 10)", async () => {
  const { data, error } = await supabase
    .from("mst_experiment_batches")
    .select("batch_id, batch_code, batch_name, batch_type, status")
    .order("batch_code")
    .limit(10);
  if (error) throw error;
  return data;
});

// 6. Tasks
await q("Tasks (top 10)", async () => {
  const { data, error } = await supabase
    .from("mst_tasks")
    .select("task_id, task_code, task_title, task_type, max_score, is_active")
    .eq("is_active", true)
    .order("task_code")
    .limit(10);
  if (error) throw error;
  return data;
});

// 7. Session records
await q("Learning sessions count + sample", async () => {
  const { count, error: ce } = await supabase
    .from("trn_learning_sessions")
    .select("*", { count: "exact", head: true });
  const { data, error: de } = await supabase
    .from("trn_learning_sessions")
    .select("session_id, profile_id, task_id, batch_id, status, started_at")
    .order("started_at", { ascending: false })
    .limit(5);
  if (ce || de) throw ce ?? de;
  return { total: count, sample: data };
});

// 8. Submissions
await q("Submissions count + sample", async () => {
  const { count, error: ce } = await supabase
    .from("trn_submissions")
    .select("*", { count: "exact", head: true });
  const { data, error: de } = await supabase
    .from("trn_submissions")
    .select("profile_id, task_id, batch_id, final_score, submitted_at, total_run_count")
    .order("submitted_at", { ascending: false })
    .limit(5);
  if (ce || de) throw ce ?? de;
  return { total: count, sample: data };
});

// 9. Attempt records
await q("Attempt records count", async () => {
  const tables = ["trn_attempt", "trn_attempts", "trn_task_attempts"];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    if (!error) return { table: t, count };
  }
  return "No attempt table found";
});

// 10. Check vw_dataset_session_level
await q("vw_dataset_session_level sample (5 rows)", async () => {
  const { data, error } = await supabase
    .from("vw_dataset_session_level")
    .select("*")
    .limit(5);
  if (error) throw error;
  return { columns: data?.[0] ? Object.keys(data[0]) : [], rows: data?.length ?? 0, sample: data?.[0] };
});

console.log("\n── Recon complete ──");
