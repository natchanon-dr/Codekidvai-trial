import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import summary from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";
import sequenceManifest from "@/lib/research-artifacts/phase4/sequence_manifest_v1.json";
import vocabulary from "@/lib/research-artifacts/phase4/vocabulary_v1.json";
import scaler from "@/lib/research-artifacts/phase4/scaler_v1.json";
import tagManifest from "@/lib/research-artifacts/phase4/tag_manifest_v1.json";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PILOT_DATASET_CODE = "PAQT0001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactAvailability = "available" | "static_fallback" | "unavailable";

export type SequentialRunRecord = {
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
  artifact_source: "result_version" | "static_fallback" | null;
  is_comparable: boolean;
  not_comparable_reason: string | null;
};

export type SequentialDatasetRecord = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_name: string | null;
  active: boolean;
  created_at: string;
  runs: SequentialRunRecord[];
};

// ---------------------------------------------------------------------------
// resolveArtifact — pure function
// ---------------------------------------------------------------------------

export function resolveArtifact(
  status: string,
  result_version: string | null,
  datasetCode: string,
): {
  availability: ArtifactAvailability;
  source: "result_version" | "static_fallback" | null;
  isComparable: boolean;
  reason: string | null;
} {
  if (result_version !== null) {
    // result_version artifact loading is deferred to Phase 5 — detail endpoint returns 501.
    // Mark as unavailable so Eye and Compare controls are correctly disabled in the UI.
    return {
      availability: "unavailable",
      source: null,
      isComparable: false,
      reason: "Per-run artifact loading not yet implemented (Phase 5).",
    };
  }

  if (status === "completed") {
    if (datasetCode === PILOT_DATASET_CODE) {
      return {
        availability: "static_fallback",
        source: "static_fallback",
        isComparable: true,
        reason: null,
      };
    }
    return {
      availability: "unavailable",
      source: null,
      isComparable: false,
      reason: "No artifact available for this completed run.",
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
// Static artifact payload (used for Mode B pilot fallback)
// ---------------------------------------------------------------------------

function buildStaticPayload() {
  const activeEventCount = Object.keys(vocabulary.event_type_vocab).filter(
    (key) => !vocabulary.block_events_reserved.includes(key),
  ).length;

  return {
    artifact_source: "static_fallback" as const,
    research_constraints: {
      evaluation_purpose: summary.evaluation_purpose,
      label_source: summary.label_source,
      label_validity: summary.label_validity,
      proxy_target_circularity: summary.proxy_target_circularity,
      confirmatory_analysis_allowed: summary.confirmatory_analysis_allowed,
      data_warning: summary.data_warning,
    },
    dataset_summary: summary.dataset_summary,
    sequence_construction: {
      schema_version: sequenceManifest.schema_version,
      created_at_utc: sequenceManifest.created_at_utc,
      parameters: sequenceManifest.parameters,
      dataset_stats: sequenceManifest.dataset_stats,
      data_warning: sequenceManifest.data_warning,
    },
    event_vocabulary: {
      schema_version: vocabulary.schema_version,
      padding_token: vocabulary.padding_token,
      event_type_vocab: vocabulary.event_type_vocab,
      block_events_reserved: vocabulary.block_events_reserved,
      note: vocabulary.note,
      active_event_count: activeEventCount,
      total_vocab_entries: Object.keys(vocabulary.event_type_vocab).length,
    },
    feature_scaler: {
      schema_version: scaler.schema_version,
      feature_names: scaler.feature_names,
      n_samples_seen: scaler.n_samples_seen,
      fit_split: scaler.fit_split,
    },
    tag_structure: {
      schema_version: tagManifest.schema_version,
      created_at_utc: tagManifest.created_at_utc,
      transition_types: tagManifest.transition_types,
      transition_type_count: tagManifest.transition_types.length,
      graph_feature_names: tagManifest.graph_feature_names,
      graph_feature_count: tagManifest.n_features,
      dataset_stats: {
        total_sequences: tagManifest.dataset_stats.total_sequences,
        total_nodes: tagManifest.dataset_stats.total_nodes,
        total_edges: tagManifest.dataset_stats.total_edges,
        train_sequences: tagManifest.dataset_stats.train_sequences,
        test_sequences: tagManifest.dataset_stats.test_sequences,
        feature_leakage_check: tagManifest.dataset_stats.feature_leakage_check,
        nan_in_features: tagManifest.dataset_stats.nan_in_features,
      },
      data_warning: tagManifest.data_warning,
    },
    model_sequence_config: {
      lstm: summary.model_configs.lstm,
      gru: summary.model_configs.gru,
    },
    validation: summary.validation,
    artifact_versions: {
      phase4_ui_summary: { schema_version: summary.schema_version },
      sequence_manifest: {
        schema_version: sequenceManifest.schema_version,
        created_at_utc: sequenceManifest.created_at_utc,
        phase3_source_sha: sequenceManifest.phase3_source_sha,
      },
      vocabulary: { schema_version: vocabulary.schema_version },
      scaler: { schema_version: scaler.schema_version },
      tag_manifest: {
        schema_version: tagManifest.schema_version,
        created_at_utc: tagManifest.created_at_utc,
        phase3_source_sha: tagManifest.phase3_source_sha,
        m2_manifest_sha: tagManifest.m2_manifest_sha,
        artifact_checksums: tagManifest.artifact_checksums,
      },
    },
    limitations: [
      "Event frequency distribution — blocked: offline parquet artifact not loaded server-side",
      "Sequence length distribution — blocked: offline parquet artifact not loaded server-side",
      "Per-transition-type frequency counts — blocked: offline parquet artifact not loaded server-side",
      "TAG feature distributions — blocked: offline parquet artifact not loaded server-side",
      "Frequent sequential patterns (PrefixSpan/GSP) — blocked: research design decision pending",
      "Pre-submission behavioral paths — blocked: research design decision pending",
      "Learner-group comparison on sequences — unsupported: proxy_target_circularity=true",
      "Per-sequence prediction display — unsupported: not implemented in Phase 4 pipeline",
      "Statistical significance testing — unsupported: n=10 pilot, insufficient sample size",
      "Confirmatory analysis — unsupported: confirmatory_analysis_allowed=false",
    ],
  };
}

// ---------------------------------------------------------------------------
// Mode A — list datasets + runs from DB
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
    .order("created_at", { ascending: false });

  if (runErr) {
    return NextResponse.json({ error: runErr.message }, { status: 500 });
  }

  const classNameMap: Record<string, string> = {};
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin
      .from("tb_classes")
      .select("class_id, class_name")
      .in("class_id", classIds);
    for (const c of classes ?? []) {
      classNameMap[c.class_id as string] = c.class_name as string;
    }
  }

  const runsByDataset: Record<string, SequentialRunRecord[]> = {};
  for (const run of runs ?? []) {
    const did = run.dataset_id as string;
    if (!runsByDataset[did]) runsByDataset[did] = [];

    const status = (run.status as string) ?? "unknown";
    const resultVersion = (run.result_version as string | null) ?? null;
    const dsRow = dsRows.find((d) => d.id === did);
    const datasetCode = (dsRow?.code as string) ?? "";
    const resolved = resolveArtifact(status, resultVersion, datasetCode);

    const analysisStepsRaw = run.analysis_steps;
    let analysisSteps: SequentialRunRecord["analysis_steps"] = null;
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

  const datasetRecords: SequentialDatasetRecord[] = dsRows.map((d) => ({
    id: d.id as string,
    code: d.code as string,
    name: d.name as string,
    batch_type: (d.batch_type as string) ?? "",
    set_family: (d.set_family as string) ?? "",
    task_type: (d.task_type as string) ?? "",
    class_name: d.class_id ? (classNameMap[d.class_id as string] ?? null) : null,
    active: (d.active as boolean) ?? false,
    created_at: d.created_at as string,
    runs: runsByDataset[d.id as string] ?? [],
  }));

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
    },
  });
}

// ---------------------------------------------------------------------------
// Mode B — detail artifact for a specific run
// ---------------------------------------------------------------------------

async function handleDetailMode(
  datasetId: string,
  runId: string,
): Promise<NextResponse> {
  const { data: dsData, error: dsErr } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, code")
    .eq("id", datasetId)
    .single();

  if (dsErr || !dsData) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  const datasetCode = dsData.code as string;

  const { data: runData, error: runErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, dataset_id, status, result_version")
    .eq("id", runId)
    .eq("dataset_id", datasetId)
    .single();

  if (runErr || !runData) {
    return NextResponse.json({ error: "Pipeline run not found." }, { status: 404 });
  }

  const status = runData.status as string;
  const resultVersion = (runData.result_version as string | null) ?? null;
  const resolved = resolveArtifact(status, resultVersion, datasetCode);

  if (resolved.source === "static_fallback") {
    return NextResponse.json(buildStaticPayload());
  }

  return NextResponse.json(
    { error: resolved.reason ?? "Artifact unavailable." },
    { status: 404 },
  );
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
