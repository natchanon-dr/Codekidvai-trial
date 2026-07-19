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

const taskCode = process.argv[2] ?? "AQT000004";
const batchId = process.argv[3] ?? "80982afc-1bdd-4d17-aefe-e1874187c63d";

async function main() {
  const { data: task, error: taskError } = await supabase
    .from("mst_tasks")
    .select("task_id, task_code, task_title")
    .eq("task_code", taskCode)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!task) throw new Error(`Task ${taskCode} not found.`);

  const { data: submissions, error: submissionReadError } = await supabase
    .from("trn_submissions")
    .select("submission_id, profile_id")
    .eq("batch_id", batchId)
    .eq("task_id", task.task_id);
  if (submissionReadError) throw submissionReadError;

  const { error: deleteError } = await supabase
    .from("trn_submissions")
    .delete()
    .eq("batch_id", batchId)
    .eq("task_id", task.task_id);
  if (deleteError) throw deleteError;

  const { data: assignments, error: assignmentReadError } = await supabase
    .from("trn_task_assignments")
    .select("assignment_id, profile_id")
    .eq("batch_id", batchId)
    .eq("task_id", task.task_id);
  if (assignmentReadError) throw assignmentReadError;

  const { error: assignmentUpdateError } = await supabase
    .from("trn_task_assignments")
    .update({ status: "assigned", completed_at: null })
    .eq("batch_id", batchId)
    .eq("task_id", task.task_id);
  if (assignmentUpdateError) throw assignmentUpdateError;

  console.log(JSON.stringify({
    task_code: task.task_code,
    task_title: task.task_title,
    batch_id: batchId,
    deleted_submissions: submissions?.length ?? 0,
    reset_assignments: assignments?.length ?? 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
