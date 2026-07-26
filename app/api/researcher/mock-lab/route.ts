import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import {
  SET_FAMILY_VALUES,
  THESIS_TASK_TYPE_ORDER,
  type SetFamily,
  type TaskType,
} from "@/lib/research-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockConfigRecord = {
  id: string;
  code: string;
  name: string;
  n_students: number;
  at_risk_rate: number;
  missing_rate: number;
  seed: number;
  set_family: string;
  task_type_counts: Record<string, number>;
  task_set_id: string | null;
  task_ids: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_run_status: string | null;
  last_run_at: string | null;
  run_count: number;
  simulation_metadata?: Record<string, unknown>;
};

export type CreateMockConfigInput = {
  // code is NOT accepted — server generates it
  name?: string;
  n_students?: number;
  at_risk_rate?: number;
  missing_rate?: number;
  seed?: number;
  set_family: SetFamily;
  task_type_counts?: Record<string, number>;
  task_set_id?: string | null;
  task_ids?: string[];
};

// ---------------------------------------------------------------------------
// Code generation constants
// ---------------------------------------------------------------------------

const MOCK_ACTIVITY_CODE: Record<string, string> = {
  assignment: "A",
  lab: "L",
  exam: "E",
};

const MOCK_TASK_TYPE_CODE: Record<string, string> = {
  sql_text: "QT",
  sql_block: "QB",
  stored_procedure: "SP",
  er_diagram: "ER",
};

// ---------------------------------------------------------------------------
// GET /api/researcher/mock-lab
// Query params: set_family, task_type, active
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { searchParams } = new URL(req.url);
  const setFamily  = searchParams.get("set_family") as SetFamily | null;
  const taskType   = searchParams.get("task_type") as TaskType | null;
  const activeOnly = searchParams.get("active") !== "false";

  // Validate filter values
  if (setFamily && !SET_FAMILY_VALUES.includes(setFamily)) {
    return NextResponse.json({ error: "Invalid set_family" }, { status: 400 });
  }
  if (taskType && !THESIS_TASK_TYPE_ORDER.includes(taskType)) {
    return NextResponse.json({ error: "Invalid task_type" }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("trn_mock_configs")
    .select(`
      id, code, name, n_students, at_risk_rate, missing_rate, seed,
      set_family, task_type_counts, task_set_id, task_ids, active,
      created_at, updated_at,
      trn_mock_runs!trn_mock_runs_config_id_fkey (
        status, created_at
      )
    `)
    .order("created_at", { ascending: false });

  if (activeOnly) query = query.eq("active", true);
  if (setFamily)  query = query.eq("set_family", setFamily);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const configs: MockConfigRecord[] = (data ?? []).map((row) => {
    const runs = (row.trn_mock_runs as Array<{ status: string; created_at: string }>) ?? [];
    const sorted = [...runs].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const last = sorted[0] ?? null;

    const record: MockConfigRecord = {
      id:               row.id,
      code:             row.code,
      name:             row.name,
      n_students:       row.n_students,
      at_risk_rate:     row.at_risk_rate,
      missing_rate:     row.missing_rate,
      seed:             row.seed,
      set_family:       row.set_family,
      task_type_counts: (row.task_type_counts as Record<string, number>) ?? {},
      task_set_id:      row.task_set_id ?? null,
      task_ids:         (row.task_ids as string[]) ?? [],
      active:           row.active,
      created_at:       row.created_at,
      updated_at:       row.updated_at,
      last_run_status:  last?.status ?? null,
      last_run_at:      last?.created_at ?? null,
      run_count:        runs.length,
    };

    // Filter by task_type: check task_type_counts keys
    if (taskType && !Object.keys(record.task_type_counts).includes(taskType)) {
      return null;
    }
    return record;
  }).filter((r): r is MockConfigRecord => r !== null);

  return NextResponse.json({ configs, total: configs.length });
}

// ---------------------------------------------------------------------------
// POST /api/researcher/mock-lab
// Create a new mock config — server generates the code
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  let body: CreateMockConfigInput & { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Destructure — ignore any `code` the caller may have sent
  const { name, n_students, at_risk_rate, missing_rate, seed,
          set_family, task_type_counts, task_set_id, task_ids } = body;

  // Validate set_family
  if (!set_family || !SET_FAMILY_VALUES.includes(set_family)) {
    return NextResponse.json(
      { error: "set_family is required and must be one of: assignment, lab, exam" },
      { status: 400 }
    );
  }

  const isExam = set_family === "exam";

  // Validate task_type_counts (required unless exam)
  if (!isExam) {
    const keys = Object.keys(task_type_counts ?? {});
    if (keys.length === 0) {
      return NextResponse.json(
        { error: "task_type_counts must have at least one task type for non-exam mocks" },
        { status: 400 }
      );
    }
  }

  // Validate numeric params
  if (at_risk_rate !== undefined && (at_risk_rate < 0 || at_risk_rate > 100)) {
    return NextResponse.json({ error: "at_risk_rate must be between 0 and 100" }, { status: 400 });
  }
  if (missing_rate !== undefined && (missing_rate < 0 || missing_rate > 100)) {
    return NextResponse.json({ error: "missing_rate must be between 0 and 100" }, { status: 400 });
  }
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0)) {
    return NextResponse.json({ error: "seed must be a non-negative integer" }, { status: 400 });
  }

  // Generate mock code
  const activityCode = MOCK_ACTIVITY_CODE[set_family] ?? "A";
  const firstTaskType = Object.keys(task_type_counts ?? {})[0] ?? "";
  const taskCode = isExam ? "EX" : (MOCK_TASK_TYPE_CODE[firstTaskType] ?? "QT");
  const prefix = `M${activityCode}${taskCode}`;

  // Find next running number
  const { data: existing } = await supabaseAdmin
    .from("trn_mock_configs")
    .select("code")
    .like("code", `${prefix}%`)
    .order("code", { ascending: false })
    .limit(1);

  let runNum = 1;
  if (existing && existing.length > 0) {
    const lastCode = existing[0].code as string;
    const lastNum = parseInt(lastCode.slice(prefix.length), 10);
    if (!isNaN(lastNum)) runNum = lastNum + 1;
  }
  if (runNum > 9999) {
    return NextResponse.json(
      { error: `Code space exhausted for prefix ${prefix}` },
      { status: 409 }
    );
  }
  const generatedCode = `${prefix}${String(runNum).padStart(4, "0")}`;

  // Build simulation_metadata snapshot
  const resolvedMissingRate = missing_rate ?? 7;
  const simulationMetadata: Record<string, unknown> = {
    dataset_type: "mock",
    activity_type: set_family,
    task_type: isExam ? "exam" : firstTaskType,
    simulation_seed: seed ?? 42,
    target_at_risk_rate: at_risk_rate ?? 35,
    target_missing_submission_rate: resolvedMissingRate,
    target_submission_rate: 100 - resolvedMissingRate,
  };

  const { data, error } = await supabaseAdmin
    .from("trn_mock_configs")
    .insert({
      code:                generatedCode,
      name:                name ?? "",
      n_students:          n_students ?? 10,
      at_risk_rate:        at_risk_rate ?? 35,
      missing_rate:        resolvedMissingRate,
      seed:                seed ?? 42,
      set_family,
      task_type_counts:    task_type_counts ?? {},
      task_set_id:         task_set_id ?? null,
      task_ids:            task_ids ?? [],
      simulation_metadata: simulationMetadata,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Code "${generatedCode}" already exists — please retry` },
        { status: 409 }
      );
    }
    // simulation_metadata column may not exist yet (before migration 026 runs)
    if (error.message.includes("simulation_metadata")) {
      // Retry without the metadata column
      const { data: data2, error: error2 } = await supabaseAdmin
        .from("trn_mock_configs")
        .insert({
          code:             generatedCode,
          name:             name ?? "",
          n_students:       n_students ?? 10,
          at_risk_rate:     at_risk_rate ?? 35,
          missing_rate:     resolvedMissingRate,
          seed:             seed ?? 42,
          set_family,
          task_type_counts: task_type_counts ?? {},
          task_set_id:      task_set_id ?? null,
          task_ids:         task_ids ?? [],
        })
        .select()
        .single();
      if (error2) {
        if (error2.code === "23505") {
          return NextResponse.json(
            { error: `Code "${generatedCode}" already exists — please retry` },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error2.message }, { status: 500 });
      }
      return NextResponse.json({ config: data2 }, { status: 201 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data }, { status: 201 });
}
