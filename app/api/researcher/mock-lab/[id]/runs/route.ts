import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// GET /api/researcher/mock-lab/[id]/runs
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try { await requireAdminOrResearcher(request); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("trn_mock_runs")
    .select("id, config_id, status, outcome, config_snapshot, started_at, completed_at, created_at")
    .eq("config_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/researcher/mock-lab/[id]/runs
// Create a pending run record
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try { await requireAdminOrResearcher(request); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { id } = await params;

  const { data: config, error: configError } = await supabaseAdmin
    .from("trn_mock_configs")
    .select("*")
    .eq("id", id)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Mock config not found" }, { status: 404 });
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from("trn_mock_runs")
    .insert({
      config_id:       id,
      status:          "pending",
      config_snapshot: config,
    })
    .select()
    .single();

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  return NextResponse.json({ run }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH /api/researcher/mock-lab/[id]/runs
// Write outcome after SSE pipeline completes
// Body: { run_id, status, outcome?, started_at?, completed_at? }
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try { await requireAdminOrResearcher(request); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { id } = await params;

  let body: {
    run_id: string;
    status: string;
    outcome?: unknown;
    started_at?: string;
    completed_at?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { run_id, status, outcome, started_at, completed_at } = body;
  if (!run_id || !status) {
    return NextResponse.json({ error: "run_id and status are required" }, { status: 400 });
  }

  const allowed = ["pending", "running", "completed", "failed"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { status };
  if (outcome !== undefined) update.outcome = outcome;
  if (started_at !== undefined) update.started_at = started_at;
  if (completed_at !== undefined) update.completed_at = completed_at;

  const { data, error } = await supabaseAdmin
    .from("trn_mock_runs")
    .update(update)
    .eq("id", run_id)
    .eq("config_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ run: data });
}
