import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactAvailability = "available" | "static_fallback" | "unavailable";

export type SemanticRunRecord = {
  id: string;
  dataset_id: string;
  run_type: string;
  status: string;
  result_version: string | null;
  configuration: Record<string, unknown> | null;
  analysis_steps: Array<{
    analysis: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
  }> | null;
  started_at: string | null;
  completed_at: string | null;
  error_summary: string | null;
  created_at: string;
  artifact_availability: ArtifactAvailability;
  artifact_source: "result_version" | "static_fallback" | "local_disk" | null;
  is_comparable: boolean;
  not_comparable_reason: string | null;
};

export type SemanticDatasetRecord = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_name: string | null;
  active: boolean;
  created_at: string;
  session_count: number;
  learner_count: number;
  usage_status: "used" | "not_used";
  runs: SemanticRunRecord[];
};

// ---------------------------------------------------------------------------
// resolveArtifact — simplified (no static/local disk fallback for semantic)
// ---------------------------------------------------------------------------

function resolveArtifact(
  status: string,
  result_version: string | null,
): {
  availability: ArtifactAvailability;
  source: "result_version" | "static_fallback" | "local_disk" | null;
  isComparable: boolean;
  reason: string | null;
} {
  if (result_version !== null) {
    return {
      availability: "unavailable",
      source: null,
      isComparable: false,
      reason: "Per-run artifact loading not yet implemented.",
    };
  }

  if (status === "completed") {
    return {
      availability: "available",
      source: "local_disk",
      isComparable: true,
      reason: null,
    };
  }

  const reasonMap: Record<string, string> = {
    pending: "Run is pending — no artifact yet.",
    running: "Run is in progress — no artifact yet.",
    failed: "Run failed — no artifact produced.",
    cancelled: "Run was cancelled — no artifact produced.",
  };

  return {
    availability: "unavailable",
    source: null,
    isComparable: false,
    reason: reasonMap[status] ?? `Run status "${status}" — no artifact available.`,
  };
}

// ---------------------------------------------------------------------------
// Mode A — list datasets + semantic runs from DB
// ---------------------------------------------------------------------------

async function handleListMode(): Promise<NextResponse> {
  const { data: datasets, error: dsErr } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, code, name, batch_type, set_family, task_type, class_id, active, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (dsErr) {
    return NextResponse.json({ error: dsErr.message }, { status: 500 });
  }

  const dsRows = datasets ?? [];

  if (dsRows.length === 0) {
    return NextResponse.json({
      datasets: [],
      filter_options: {
        batch_types: [],
        set_families: [],
        task_types: [],
        run_statuses: [],
        usage_statuses: [],
      },
    });
  }

  const datasetIds = dsRows.map((d) => d.id as string);
  const classIds = [
    ...new Set(
      dsRows
        .map((d) => d.class_id as string | null)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ];

  const { data: runs, error: runErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select(
      "id, dataset_id, run_type, status, result_version, configuration, analysis_steps, started_at, completed_at, error_summary, created_at",
    )
    .in("dataset_id", datasetIds)
    .eq("run_type", "semantic")
    .order("created_at", { ascending: false });

  if (runErr) {
    return NextResponse.json({ error: runErr.message }, { status: 500 });
  }

  const classNameMap: Record<string, string> = {};
  const classBatchIds: Record<string, string[]> = {};
  if (classIds.length > 0) {
    const [{ data: classes }, { data: classSets }] = await Promise.all([
      supabaseAdmin.from("tb_classes").select("class_id, class_name").in("class_id", classIds),
      supabaseAdmin.from("tb_class_sets").select("class_id, batch_id").in("class_id", classIds),
    ]);
    for (const c of classes ?? []) {
      classNameMap[c.class_id as string] = c.class_name as string;
    }
    for (const cs of classSets ?? []) {
      const cid = cs.class_id as string;
      if (!classBatchIds[cid]) classBatchIds[cid] = [];
      classBatchIds[cid].push(cs.batch_id as string);
    }
  }

  const sessionCountByBatch: Record<string, number> = {};
  const learnerSetByBatch: Record<string, Set<string>> = {};
  const allBatchIds = [...new Set(Object.values(classBatchIds).flat())];
  if (allBatchIds.length > 0) {
    const { data: sessions } = await supabaseAdmin
      .from("trn_learning_sessions")
      .select("batch_id, session_id, profile_id")
      .in("batch_id", allBatchIds);
    for (const s of sessions ?? []) {
      const bid = s.batch_id as string;
      sessionCountByBatch[bid] = (sessionCountByBatch[bid] ?? 0) + 1;
      if (!learnerSetByBatch[bid]) learnerSetByBatch[bid] = new Set();
      learnerSetByBatch[bid].add(s.profile_id as string);
    }
  }

  const runsByDataset: Record<string, SemanticRunRecord[]> = {};
  for (const run of runs ?? []) {
    const did = run.dataset_id as string;
    if (!runsByDataset[did]) runsByDataset[did] = [];

    const status = (run.status as string) ?? "unknown";
    const resultVersion = (run.result_version as string | null) ?? null;
    const resolved = resolveArtifact(status, resultVersion);

    const analysisStepsRaw = run.analysis_steps;
    let analysisSteps: SemanticRunRecord["analysis_steps"] = null;
    if (Array.isArray(analysisStepsRaw)) {
      analysisSteps = (analysisStepsRaw as unknown[]).map((s) => {
        const step = s as Record<string, unknown>;
        return {
          analysis: (step.analysis as string) ?? "",
          status: (step.status as string) ?? "",
          started_at: (step.started_at as string | null) ?? null,
          completed_at: (step.completed_at as string | null) ?? null,
          error: (step.error as string | null) ?? null,
        };
      });
    }

    runsByDataset[did].push({
      id: run.id as string,
      dataset_id: did,
      run_type: (run.run_type as string) ?? "",
      status,
      result_version: resultVersion,
      configuration: (run.configuration as Record<string, unknown> | null) ?? null,
      analysis_steps: analysisSteps,
      started_at: (run.started_at as string | null) ?? null,
      completed_at: (run.completed_at as string | null) ?? null,
      error_summary: (run.error_summary as string | null) ?? null,
      created_at: run.created_at as string,
      artifact_availability: resolved.availability,
      artifact_source: resolved.source,
      is_comparable: resolved.isComparable,
      not_comparable_reason: resolved.reason,
    });
  }

  const datasetRecords: SemanticDatasetRecord[] = dsRows.map((d) => {
    const batchIds = d.class_id ? (classBatchIds[d.class_id as string] ?? []) : [];
    const sessionCount = batchIds.reduce((sum, bid) => sum + (sessionCountByBatch[bid] ?? 0), 0);
    const learnerSet = batchIds.reduce((acc, bid) => {
      learnerSetByBatch[bid]?.forEach((id) => acc.add(id));
      return acc;
    }, new Set<string>());
    const dsRuns = runsByDataset[d.id as string] ?? [];
    return {
      id: d.id as string,
      code: d.code as string,
      name: d.name as string,
      batch_type: (d.batch_type as string) ?? "",
      set_family: (d.set_family as string) ?? "",
      task_type: (d.task_type as string) ?? "",
      class_name: d.class_id ? (classNameMap[d.class_id as string] ?? null) : null,
      active: (d.active as boolean) ?? false,
      created_at: d.created_at as string,
      session_count: sessionCount,
      learner_count: learnerSet.size,
      usage_status: dsRuns.some((r) => r.status === "completed") ? "used" : "not_used",
      runs: dsRuns,
    };
  });

  const batchTypes = [...new Set(dsRows.map((d) => d.batch_type as string).filter(Boolean))];
  const setFamilies = [...new Set(dsRows.map((d) => d.set_family as string).filter(Boolean))];
  const taskTypes = [...new Set(dsRows.map((d) => d.task_type as string).filter(Boolean))];
  const runStatuses = [
    ...new Set((runs ?? []).map((r) => r.status as string).filter(Boolean)),
  ];

  return NextResponse.json({
    datasets: datasetRecords,
    filter_options: {
      batch_types: batchTypes,
      set_families: setFamilies,
      task_types: taskTypes,
      run_statuses: runStatuses,
      usage_statuses: ["used", "not_used"],
    },
  });
}

// ---------------------------------------------------------------------------
// Mode B — detail: read the persisted analysis result for this run
// ---------------------------------------------------------------------------

async function handleDetailMode(
  datasetId: string,
  runId: string,
): Promise<NextResponse> {
  const { data: run, error: runErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, status")
    .eq("id", runId)
    .eq("dataset_id", datasetId)
    .maybeSingle();

  if (runErr) {
    return NextResponse.json({ error: "Failed to load run." }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const { data: resultRow, error: resultErr } = await supabaseAdmin
    .from("mst_pipeline_run_results")
    .select("result, schema_version, created_at")
    .eq("run_id", runId)
    .eq("analysis_type", "semantic")
    .maybeSingle();

  if (resultErr) {
    return NextResponse.json({ error: "Failed to load analysis result." }, { status: 500 });
  }

  if (!resultRow) {
    return NextResponse.json(
      { error: "No semantic analysis artifact available yet." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    result: resultRow.result,
    schema_version: resultRow.schema_version,
    created_at: resultRow.created_at,
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("mode");

  if (mode === "detail") {
    const datasetId = searchParams.get("dataset_id");
    const runId = searchParams.get("run_id");
    if (!datasetId || !runId) {
      return NextResponse.json(
        { error: "Missing required params: dataset_id and run_id." },
        { status: 400 },
      );
    }
    return handleDetailMode(datasetId, runId);
  }

  return handleListMode();
}
