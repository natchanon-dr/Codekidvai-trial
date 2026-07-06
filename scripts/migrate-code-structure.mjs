import fs from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const apply = process.argv.includes("--apply");
const setPrefixMap = {
  AQT: "SAQT",
  AQB: "SAQB",
  AER: "SAER",
  ASP: "SASP",
  LQT: "SLQT",
  LQB: "SLQB",
  LER: "SLER",
  LSP: "SLSP",
};
const taskPrefixes = ["QT", "QB", "ER", "SP"];
const copySkipColumns = new Set(["task_id", "created_at", "updated_at"]);

function batchFamily(batch) {
  if (!batch) return "assignment";
  if (
    batch.set_type_id === 2 ||
    batch.batch_type === "exam_set" ||
    batch.batch_code?.startsWith("SE") ||
    batch.batch_code?.startsWith("E")
  ) {
    return "exam";
  }
  if (
    batch.batch_type === "lab_set" ||
    batch.batch_code?.startsWith("SL") ||
    batch.batch_code?.startsWith("L")
  ) {
    return "lab";
  }
  return "assignment";
}

function nextBatchCode(code) {
  if (!code) return null;
  for (const [oldPrefix, newPrefix] of Object.entries(setPrefixMap)) {
    const match = code.match(new RegExp(`^${oldPrefix}(\\d+)$`));
    if (match) return `${newPrefix}${match[1].padStart(4, "0")}`;
  }
  return code;
}

function nextTaskCode(code, family) {
  if (!code) return null;
  if (/^[AL](QT|QB|ER|SP)\d+$/.test(code)) return code;
  for (const prefix of taskPrefixes) {
    const match = code.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) return `${family === "lab" ? "L" : "A"}${prefix}${match[1].padStart(6, "0")}`;
  }
  return code;
}

function buildTaskCopy(task, taskCode) {
  const copy = {};
  for (const [key, value] of Object.entries(task)) {
    if (!copySkipColumns.has(key)) copy[key] = value;
  }
  copy.task_code = taskCode;
  copy.task_title = task.task_title;
  copy.task_description = task.task_description;
  copy.task_status = task.task_status ?? "active";
  copy.is_active = task.is_active ?? true;
  copy.updated_at = new Date().toISOString();
  return copy;
}

async function readData() {
  const [batchesResult, assignmentsResult, tasksResult] = await Promise.all([
    supabase
      .from("mst_experiment_batches")
      .select("*")
      .order("batch_code", { ascending: true }),
    supabase
      .from("trn_task_assignments")
      .select("assignment_id,batch_id,task_id"),
    supabase
      .from("mst_tasks")
      .select("*")
      .order("task_code", { ascending: true }),
  ]);
  if (batchesResult.error) throw batchesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  return {
    batches: batchesResult.data ?? [],
    assignments: assignmentsResult.data ?? [],
    tasks: tasksResult.data ?? [],
  };
}

async function main() {
  const { batches, assignments, tasks } = await readData();
  const batchMap = new Map(batches.map((batch) => [batch.batch_id, batch]));
  const taskMap = new Map(tasks.map((task) => [task.task_id, task]));
  const codeToTask = new Map(tasks.map((task) => [task.task_code, task]));
  const labBatchIds = new Set(batches.filter((batch) => batchFamily(batch) === "lab").map((batch) => batch.batch_id));
  const taskFamilies = new Map();

  for (const row of assignments) {
    const family = batchFamily(batchMap.get(row.batch_id));
    const current = taskFamilies.get(row.task_id) ?? new Set();
    current.add(family);
    taskFamilies.set(row.task_id, current);
  }

  const batchUpdates = batches
    .map((batch) => ({
      batch_id: batch.batch_id,
      from: batch.batch_code,
      to: nextBatchCode(batch.batch_code),
      family: batchFamily(batch),
    }))
    .filter((item) => item.from !== item.to);

  const taskUpdates = [];
  const labTaskCopies = [];

  for (const task of tasks) {
    const families = taskFamilies.get(task.task_id) ?? new Set();
    const assignmentCode = nextTaskCode(task.task_code, "assignment");
    const labCode = nextTaskCode(task.task_code, "lab");

    if (families.has("assignment") && task.task_code !== assignmentCode) {
      taskUpdates.push({ task_id: task.task_id, from: task.task_code, to: assignmentCode, family: "assignment" });
    } else if (!families.has("assignment") && families.has("lab") && task.task_code !== labCode) {
      taskUpdates.push({ task_id: task.task_id, from: task.task_code, to: labCode, family: "lab" });
    }

    if (families.has("assignment") && families.has("lab")) {
      labTaskCopies.push({
        source_task_id: task.task_id,
        source_code: task.task_code,
        lab_code: labCode,
        existing_task_id: codeToTask.get(labCode)?.task_id ?? null,
      });
    }
  }

  const planned = { batchUpdates, taskUpdates, labTaskCopies };
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...planned }, null, 2));
    return;
  }

  const createdLabTasks = [];
  for (const item of labTaskCopies) {
    if (item.existing_task_id) {
      createdLabTasks.push({ ...item, task_id: item.existing_task_id, reused: true });
      continue;
    }
    const source = taskMap.get(item.source_task_id);
    if (!source) throw new Error(`Missing source task ${item.source_task_id}`);
    const { data, error } = await supabase
      .from("mst_tasks")
      .insert(buildTaskCopy(source, item.lab_code))
      .select("task_id,task_code")
      .single();
    if (error) throw error;
    createdLabTasks.push({ ...item, task_id: data.task_id, reused: false });
  }

  for (const item of createdLabTasks) {
    const { error } = await supabase
      .from("trn_task_assignments")
      .update({ task_id: item.task_id })
      .in("batch_id", [...labBatchIds])
      .eq("task_id", item.source_task_id);
    if (error) throw error;

    const { error: submissionError } = await supabase
      .from("trn_submissions")
      .update({ task_id: item.task_id })
      .in("batch_id", [...labBatchIds])
      .eq("task_id", item.source_task_id);
    if (submissionError && submissionError.code !== "42P01" && submissionError.code !== "42703") throw submissionError;
  }

  for (const item of taskUpdates) {
    const { error } = await supabase
      .from("mst_tasks")
      .update({ task_code: item.to, updated_at: new Date().toISOString() })
      .eq("task_id", item.task_id);
    if (error) throw error;
  }

  for (const item of batchUpdates) {
    const { error } = await supabase
      .from("mst_experiment_batches")
      .update({
        batch_code: item.to,
        batch_type: item.family === "lab" ? "practice" : item.family === "exam" ? "exam_set" : "assignment_set",
        set_type_id: item.family === "assignment" ? 1 : item.family === "exam" ? 2 : null,
        updated_at: new Date().toISOString(),
      })
      .eq("batch_id", item.batch_id);
    if (error) throw error;
  }

  console.log(JSON.stringify({ mode: "applied", ...planned, createdLabTasks }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
