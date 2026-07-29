import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// POST /:id/runs/:runId — simulate pipeline execution for a pending run
// Transitions pending → completed in the dev / mock environment.
// The frontend uses this as the "Continue" action on stuck pending runs.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id, runId } = await params;

  const { data: run, error: fetchErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, dataset_id, status, run_type, analysis_steps")
    .eq("id", runId)
    .eq("dataset_id", id)
    .maybeSingle();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  if (run.status !== "pending") {
    return NextResponse.json(
      { error: `Run status is '${run.status}' — only pending runs can be executed.` },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();

  const completedSteps = Array.isArray(run.analysis_steps)
    ? (run.analysis_steps as Array<Record<string, unknown>>).map((s) => ({
        ...s,
        status: "completed",
        started_at: now,
        completed_at: now,
        error: null,
      }))
    : null;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .update({
      status: "completed",
      started_at: now,
      completed_at: now,
      ...(completedSteps !== null && { analysis_steps: completedSteps }),
    })
    .eq("id", runId)
    .eq("dataset_id", id)
    .eq("status", "pending")
    .select("id, status, started_at, completed_at")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: "Failed to execute run." }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Run is no longer pending — it may have been updated concurrently." },
      { status: 409 },
    );
  }

  return NextResponse.json({ run: updated });
}
