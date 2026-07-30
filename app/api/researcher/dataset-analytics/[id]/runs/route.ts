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
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    idempotency_key: row.idempotency_key ? String(row.idempotency_key) : null,
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
      "id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at, attempt_count, max_attempts, idempotency_key",
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

  // Idempotency key: client may send via body or X-Idempotency-Key header.
  // When present, the DB UNIQUE constraint prevents duplicate runs on retries.
  const rawIdempotencyKey =
    (raw.idempotency_key as string | undefined) ??
    (request.headers.get("x-idempotency-key") || undefined);
  const idempotencyKey = rawIdempotencyKey?.slice(0, 255) ?? null;

  const FULL_SELECT =
    "id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at, attempt_count, max_attempts, idempotency_key";

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .insert({
      dataset_id: id,
      run_type: runType,
      status: "pending",
      analysis_steps: runType === "full_pipeline" ? analysisSteps : null,
      configuration: configuration ?? null,
      initiated_by: initiatedBy ?? null,
      idempotency_key: idempotencyKey,
    })
    .select(FULL_SELECT)
    .single();

  if (insertError) {
    // Postgres unique violation on idempotency_key (error code 23505):
    // a run with this key already exists — return it idempotently.
    if (insertError.code === "23505" && idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("mst_pipeline_runs")
        .select(FULL_SELECT)
        .eq("idempotency_key", idempotencyKey)
        .eq("dataset_id", id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { run: rowToRun(existing as unknown as Record<string, unknown>) },
          { status: 200 },
        );
      }
    }

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

  // Step 1: ownership + terminal-status check.
  // Also fetch cancellation_requested for the idempotent early-return.
  const { data: run, error: fetchErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, dataset_id, status, cancellation_requested")
    .eq("id", runId)
    .eq("dataset_id", id)
    .maybeSingle();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const currentStatus = String(run.status);

  if (!["pending", "running"].includes(currentStatus)) {
    return NextResponse.json(
      { error: `Cannot request cancellation for a run with status '${currentStatus}'.` },
      { status: 422 },
    );
  }

  // Step 2: Conditional UPDATE — race-safe.
  // WHERE status IN ('pending','running') AND cancellation_requested = false ensures:
  //   - The run has not transitioned to a terminal state between Step 1 and now.
  //   - A duplicate request does not re-write an already-requested row.
  // maybeSingle() returns null (no error) when zero rows matched instead of
  // throwing, so the caller can distinguish a no-match from a DB failure.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .update({ cancellation_requested: true })
    .eq("id", runId)
    .eq("dataset_id", id)
    .in("status", ["pending", "running"])
    .eq("cancellation_requested", false)
    .select("id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at, attempt_count, max_attempts, idempotency_key")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: "Failed to request cancellation." }, { status: 500 });
  }

  // Conditional UPDATE matched and returned the updated row — success.
  if (updated) {
    return NextResponse.json({ run: rowToRun(updated as unknown as Record<string, unknown>) });
  }

  // UPDATE matched nothing: the run transitioned between Step 1 and Step 2,
  // or cancellation_requested was already true (idempotent duplicate request).
  // Re-read the authoritative state to determine the correct response.
  const { data: reread, error: rereadErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, dataset_id, run_type, status, analysis_steps, started_at, completed_at, cancelled_at, cancellation_requested, error_summary, initiated_by, configuration, result_version, created_at")
    .eq("id", runId)
    .eq("dataset_id", id)
    .maybeSingle();

  if (rereadErr || !reread) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const rereadStatus = String(reread.status);

  // Idempotent: cancellation already requested and run is still active.
  if (Boolean(reread.cancellation_requested) && ["pending", "running"].includes(rereadStatus)) {
    return NextResponse.json({ run: rowToRun(reread as unknown as Record<string, unknown>) });
  }

  // Run transitioned to a terminal state — return the same rejection used for Step 1.
  return NextResponse.json(
    { error: `Cannot request cancellation for a run with status '${rereadStatus}'.` },
    { status: 422 },
  );
}
