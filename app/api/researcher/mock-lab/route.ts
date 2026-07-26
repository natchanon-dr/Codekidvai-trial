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
};

export type CreateMockConfigInput = {
  code: string;
  name?: string;
  n_students?: number;
  at_risk_rate?: number;
  missing_rate?: number;
  seed?: number;
  set_family?: SetFamily;
  task_type_counts?: Record<string, number>;
  task_set_id?: string | null;
  task_ids?: string[];
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

    let record: MockConfigRecord = {
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
// Create a new mock config
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  let body: CreateMockConfigInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, name, n_students, at_risk_rate, missing_rate, seed,
          set_family, task_type_counts, task_set_id, task_ids } = body;

  if (!code || typeof code !== "string" || !/^(MOCK_|SIM_E2E_)[A-Z0-9_]+$/.test(code)) {
    return NextResponse.json(
      { error: 'code must start with MOCK_ or SIM_E2E_ and contain only uppercase letters, digits, and underscores' },
      { status: 400 }
    );
  }
  if (set_family && !SET_FAMILY_VALUES.includes(set_family)) {
    return NextResponse.json({ error: "Invalid set_family" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("trn_mock_configs")
    .insert({
      code,
      name:             name ?? "",
      n_students:       n_students ?? 10,
      at_risk_rate:     at_risk_rate ?? 35,
      missing_rate:     missing_rate ?? 7,
      seed:             seed ?? 42,
      set_family:       set_family ?? "assignment",
      task_type_counts: task_type_counts ?? {},
      task_set_id:      task_set_id ?? null,
      task_ids:         task_ids ?? [],
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `Code "${code}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data }, { status: 201 });
}
