import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const targetCode = "EQT0001";

const { data: targetSet, error: lookupError } = await supabase
  .from("mst_experiment_batches")
  .select("batch_id, batch_code, batch_name")
  .eq("batch_code", targetCode)
  .maybeSingle();

if (lookupError) throw lookupError;

if (!targetSet) {
  console.log(JSON.stringify({ deleted: false, reason: "not_found", batch_code: targetCode }, null, 2));
  process.exit(0);
}

const { count: assignmentCount, error: assignmentDeleteError } = await supabase
  .from("trn_task_assignments")
  .delete({ count: "exact" })
  .eq("batch_id", targetSet.batch_id);
if (assignmentDeleteError) throw assignmentDeleteError;

const { count: batchCount, error: batchDeleteError } = await supabase
  .from("mst_experiment_batches")
  .delete({ count: "exact" })
  .eq("batch_id", targetSet.batch_id);
if (batchDeleteError) throw batchDeleteError;

console.log(JSON.stringify({
  deleted: true,
  batch_code: targetSet.batch_code,
  batch_name: targetSet.batch_name,
  deleted_assignment_rows: assignmentCount ?? 0,
  deleted_batch_rows: batchCount ?? 0,
}, null, 2));
