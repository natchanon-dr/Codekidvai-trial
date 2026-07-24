import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import type { PipelineRun, PipelineRunType, PipelineRunStatus, AnalysisStep } from "@/lib/types/dataset-analytics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FULL_PIPELINE_ANALYSES: string[] = [
  "behavioral",
  "sequential",
  "semantic",
  "assessment",
];

const VALID_RUN_TYPES = new Set<PipelineRunType>([
  "full_pipeline",
  "behavioral",
  "sequential",
  "semantic",
  "assessment",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToRun(row: Record<string, unknown>): PipelineRun {
  return {
    id: String(row.id),
    dataset_id: String(row.dataset_id),
    run_type: String(row.run_type) as PipelineRunType,
    status: String(row.status) as PipelineRunStatus,
    analysis_steps: (row.analysis_steps ?? null) as AnalysisStep[] | null,
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    cancelled_at: row.cancelled_at ? String(row.cancelled_at) : null,
    cancellation_requested: Boolean(row.cancellation_requested ?? false),
    error_summary: row.error_summary ? String(row.error_summary) : null,
    initiated_by: row.initiated_by ? String(row.initiated_by) : null,
    configuration: (row.configuration ?? null) as Record<string, unknown> | null,
    result_version: row.result_version ? String(row.result_version) : null,
    created_at: String(row.created_at),
  };
}

async function fetchDatasetActive(id: string): Promise<{ active: boolean } | null> {
  const { data, error } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, active")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return { active: Boolean(data.active) };
}

// ---------------------------------------------------------------------------
// GET /:id/runs — list run history for a dataset
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const dataset = await fetchDatasetActive(id);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  const { data: runs, error } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select(
      "id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at",
    )
    .eq("dataset_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load run history." }, { status: 500 });
  }

  const history: PipelineRun[] = (runs ?? []).map((r) =>
    rowToRun(r as unknown as Record<string, unknown>),
  );

  return NextResponse.json({
    dataset_id: id,
    runs: history,
    run_count: history.length,
  });
}

// ---------------------------------------------------------------------------
// POST /:id/runs — start a Full Pipeline Run
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const dataset = await fetchDatasetActive(id);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  // Only active datasets may be run
  if (!dataset.active) {
    return NextResponse.json(
      { error: "Only active datasets can be run. Activate this dataset first." },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await request.json() as unknown;
  } catch {
    body = {};
  }

  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  // Validate run_type (only full_pipeline via UI; individual types allowed via API)
  const rawRunType = (raw.run_type as string | undefined) ?? "full_pipeline";
  if (!VALID_RUN_TYPES.has(rawRunType as PipelineRunType)) {
    return NextResponse.json(
      {
        error: `Invalid run_type. Allowed: ${[...VALID_RUN_TYPES].join(", ")}`,
      },
      { status: 422 },
    );
  }
  const runType = rawRunType as PipelineRunType;

  // Guard: reject if there is already a pending or running full_pipeline for this dataset
  if (runType === "full_pipeline") {
    const { data: existing } = await supabaseAdmin
      .from("mst_pipeline_runs")
      .select("id, status")
      .eq("dataset_id", id)
      .eq("run_type", "full_pipeline")
      .in("status", ["pending", "running"])
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error:
            "A full pipeline run is already pending or running for this dataset. Wait for it to finish before starting a new one.",
          existing_run_id: String(existing.id),
        },
        { status: 409 },
      );
    }
  }

  // Build initial analysis_steps for full_pipeline
  const analysisSteps: AnalysisStep[] =
    runType === "full_pipeline"
      ? FULL_PIPELINE_ANALYSES.map((a) => ({
          analysis: a,
          status: "pending",
          started_at: null,
          completed_at: null,
          error: null,
        }))
      : null!; // individual run types do not pre-populate steps

  const configuration = (raw.configuration as Record<string, unknown> | undefined) ?? null;
  const initiatedBy = (raw.initiated_by as string | undefined) ?? null;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .insert({
      dataset_id: id,
      run_type: runType,
      status: "pending",
      analysis_steps: runType === "full_pipeline" ? analysisSteps : null,
      configuration: configuration ?? null,
      initiated_by: initiatedBy ?? null,
    })
    .select(
      "id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at",
    )
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to create pipeline run." }, { status: 500 });
  }

  return NextResponse.json(
    { run: rowToRun(inserted as unknown as Record<string, unknown>) },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// PATCH /:id/runs?run_id=<uuid> — cancel a pending run
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const runId = request.nextUrl.searchParams.get("run_id");
  if (!runId) {
    return NextResponse.json({ error: "run_id query param is required." }, { status: 400 });
  }

  // Verify the run belongs to this dataset and is cancellable
  const { data: run, error: fetchErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, dataset_id, status")
    .eq("id", runId)
    .eq("dataset_id", id)
    .maybeSingle();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  if (!["pending", "running"].includes(String(run.status))) {
    return NextResponse.json(
      { error: `Cannot cancel a run with status '${String(run.status)}'.` },
      { status: 422 },
    );
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .update({ status: "cancelled" })
    .eq("id", runId)
    .select("id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: "Failed to cancel run." }, { status: 500 });
  }

  return NextResponse.json({ run: rowToRun(updated as unknown as Record<string, unknown>) });
}
