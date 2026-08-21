import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
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
  artifact_source: "result_version" | "static_fallback" | "local_disk" | null;
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
  session_count: number;
  learner_count: number;
  usage_status: "used" | "not_used";
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
  source: "result_version" | "static_fallback" | "local_disk" | null;
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
    // Phase 5 M5.11 — non-pilot completed runs are marked "available" with source
    // "local_disk" so the UI enables the Eye/Compare buttons.  The detail endpoint
    // (handleDetailMode) does the actual disk I/O and returns 404 if no artifacts exist.
    // This is intentionally optimistic: a completed run likely has local disk artifacts
    // when the researcher has run the mock pipeline on this server.
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
    model_comparison: summary.model_comparison,
    seed_stability: summary.seed_stability,
    charts: summary.charts,
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
// Phase 5 M5.10 — local disk fallback for mock pipeline runs
// Reads NB05–NB09 artifacts from notebooks/ and reports/phase4/ on disk.
// Returns null when no comparison CSV is found (pipeline hasn't run yet).
// ---------------------------------------------------------------------------

async function buildLocalPayload(): Promise<Record<string, unknown> | null> {
  const fsAsync = await import("node:fs/promises");
  const NB_DIR  = path.join(process.cwd(), "notebooks");
  const RPT_DIR = path.join(process.cwd(), "reports", "phase4");

  // Require comparison CSV as minimum viable artifact
  const compPath = path.join(NB_DIR, "models", "sequence", "comparison", "model_comparison_v1.csv");
  let csvText: string;
  try {
    csvText = await fsAsync.readFile(compPath, "utf-8");
  } catch {
    return null;
  }

  // ── Parse comparison CSV → model_comparison.models[] ─────────────────────
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const hdrs = lines[0].split(",").map((h: string) => h.trim());
  const models = lines.slice(1).map((line: string) => {
    const vals: string[] = line.split(",");
    const r: Record<string, string> = {};
    hdrs.forEach((h: string, i: number) => { r[h] = (vals[i] ?? "").trim(); });
    return {
      name:                       r["model"]       ?? "",
      accuracy:                   r["accuracy"]     ? parseFloat(r["accuracy"])     : null,
      precision:                  r["precision"]    ? parseFloat(r["precision"])    : null,
      recall:                     r["recall"]       ? parseFloat(r["recall"])       : null,
      f1:                         r["f1"]           ? parseFloat(r["f1"])           : null,
      roc_auc:                    r["roc_auc"]      ? parseFloat(r["roc_auc"])      : null,
      pr_auc:                     r["pr_auc"]       ? parseFloat(r["pr_auc"])       : null,
      train_time_sec:             r["train_time_s"] ? parseFloat(r["train_time_s"]) : null,
      inference_time_per_seq_sec: r["inf_time_s"]   ? parseFloat(r["inf_time_s"])   : null,
      parameters: r["parameters"] !== "" && r["parameters"] != null
        ? parseFloat(r["parameters"]) : null,
      type: r["feature_set"] ?? "",
    };
  }).filter((m) => m.name !== "");

  // ── Optional: sequence_manifest + seed stability JSONs ───────────────────
  async function tryJson(p: string): Promise<Record<string, unknown> | null> {
    try { return JSON.parse(await fsAsync.readFile(p, "utf-8")); }
    catch { return null; }
  }
  const [seqManifest, lstmMetrics, gruMetrics] = await Promise.all([
    tryJson(path.join(NB_DIR, "data", "sequences", "sequence_manifest_v1.json")),
    tryJson(path.join(NB_DIR, "models", "sequence", "lstm", "lstm_metrics_v1.json")),
    tryJson(path.join(NB_DIR, "models", "sequence", "gru",  "gru_metrics_v1.json")),
  ]);

  // ── PNG charts as base64 data URLs ────────────────────────────────────────
  async function tryPng(relPath: string): Promise<string | null> {
    try {
      const buf = await fsAsync.readFile(path.join(RPT_DIR, relPath));
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch { return null; }
  }
  const [seqLenPng, tagHeatPng, tagCohortPng, lstmCurvesPng, gruCurvesPng, compRocPng, compCmPng] =
    await Promise.all([
      tryPng("seq_length_dist.png"),
      tryPng("tag_transition_heatmap.png"),
      tryPng("tag_cohort_graphs.png"),
      tryPng(path.join("lstm",       "lstm_training_curves.png")),
      tryPng(path.join("gru",        "gru_training_curves.png")),
      tryPng(path.join("comparison", "comparison_roc_curves.png")),
      tryPng(path.join("comparison", "comparison_confusion_matrices.png")),
    ]);
  const charts = [
    seqLenPng    && { key: "seq_length_dist",          title: "Sequence Length Distribution",          path: seqLenPng },
    tagHeatPng   && { key: "tag_transition_heatmap",    title: "Block Transition Heatmap (TAG)",        path: tagHeatPng },
    tagCohortPng && { key: "tag_cohort_graphs",         title: "Cohort TAG Graphs",                     path: tagCohortPng },
    lstmCurvesPng && { key: "lstm_training_curves",     title: "LSTM Training Curves",                  path: lstmCurvesPng },
    gruCurvesPng  && { key: "gru_training_curves",      title: "GRU Training Curves",                   path: gruCurvesPng },
    compRocPng   && { key: "comparison_roc_curves",     title: "Model Comparison — ROC Curves",         path: compRocPng },
    compCmPng    && { key: "comparison_confusion_matrices", title: "Model Comparison — Confusion Matrices", path: compCmPng },
  ].filter(Boolean);

  // ── dataset_summary from sequence_manifest.dataset_stats ─────────────────
  type Manifest = { dataset_stats?: Record<string, unknown>; parameters?: Record<string, unknown>; schema_version?: string; created_at_utc?: string; data_warning?: string };
  const mf = seqManifest as Manifest | null;
  const ds = mf?.dataset_stats ?? {};
  const prm = mf?.parameters ?? {};
  const trainShape = ds["train_shape"] as [number, number, number] | null;
  const testShape  = ds["test_shape"]  as [number, number, number] | null;
  const datasetSummary = mf ? {
    total_learners:          (ds["total_learners"]  ?? null) as number | null,
    train_learners:          (ds["train_learners"]  ?? null) as number | null,
    test_learners:           (ds["test_learners"]   ?? null) as number | null,
    train_sequences:         trainShape?.[0] ?? null,
    test_sequences:          testShape?.[0]  ?? null,
    total_sequences:         (trainShape?.[0] ?? 0) + (testShape?.[0] ?? 0),
    total_canonical_events:  (ds["canonical_events"] ?? null) as number | null,
    max_sequence_length:     (prm["max_seq_len"]   ?? null) as number | null,
    split_method:            "GroupShuffleSplit",
    split_random_state:      (prm["random_state"]  ?? 42) as number,
    vocab_size:              (prm["n_features"]    ?? 10) as number,
    features_per_timestep:   (prm["n_features"]    ?? 10) as number,
    thesis_minimum_learners: 30,
  } : null;

  // ── seed_stability from lstm/gru experiments ─────────────────────────────
  type MetricsJson = { experiments?: Record<string, Record<string, unknown>> };
  function extractExp(raw: Record<string, unknown> | null, expKey: string) {
    return ((raw as MetricsJson | null)?.experiments ?? {})[expKey] ?? null;
  }
  const expA_lstm = extractExp(lstmMetrics, "EXP-A");
  const expB_lstm = extractExp(lstmMetrics, "EXP-B");
  const expA_gru  = extractExp(gruMetrics,  "EXP-A");
  const expB_gru  = extractExp(gruMetrics,  "EXP-B");
  const seedStability = (lstmMetrics || gruMetrics) ? {
    lstm: lstmMetrics ? { exp_a_seq_only: expA_lstm, exp_b_seq_plus_tag: expB_lstm } : undefined,
    gru:  gruMetrics  ? { exp_a_seq_only: expA_gru,  exp_b_seq_plus_tag: expB_gru  } : undefined,
  } : null;

  // ── Assemble payload ──────────────────────────────────────────────────────
  return {
    artifact_source: "local_disk",
    research_constraints: {
      evaluation_purpose:            "technical_pipeline_validation",
      label_source:                  "proxy_behavioral",
      label_validity:                "pilot_only",
      proxy_target_circularity:      true,
      confirmatory_analysis_allowed: false,
      data_warning: "PILOT ONLY — Local disk artifacts from mock pipeline run. Not thesis results.",
    },
    dataset_summary: datasetSummary,
    sequence_construction: mf ? {
      schema_version: mf.schema_version ?? "seq_v1",
      created_at_utc: mf.created_at_utc ?? null,
      parameters:     prm,
      dataset_stats:  ds,
      data_warning:   mf.data_warning ?? "PILOT ONLY — Mock pipeline artifacts.",
    } : null,
    event_vocabulary:     null,
    feature_scaler:       null,
    tag_structure:        null,
    model_sequence_config: null,
    model_comparison: {
      primary_seed:            42,
      all_seeds:               [11, 22, 33, 42, 55],
      test_sequences:          testShape?.[0] ?? null,
      timing_note:             null,
      test_class_distribution: null,
      models,
    },
    seed_stability: seedStability,
    charts:    charts.length > 0 ? charts : null,
    validation: null,
    artifact_versions: {
      phase4_ui_summary: { schema_version: "local_disk_v1" },
      sequence_manifest: mf ? { schema_version: mf.schema_version, created_at_utc: mf.created_at_utc } : null,
    },
    limitations: [
      "Local disk artifacts — only available when the mock pipeline has been run on this server",
      "Event vocabulary and feature scaler not loaded (offline parquet artifacts)",
      "TAG structure details not loaded in this fallback path",
      "Confirmatory analysis — unsupported: confirmatory_analysis_allowed=false",
      "Statistical significance testing — unsupported: proxy labels only",
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

  const datasetRecords: SequentialDatasetRecord[] = dsRows.map((d) => {
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

  // Phase 5 M5.10 — local disk fallback for any completed run with no DB artifact.
  // Reads NB05–NB09 output files from notebooks/ and reports/phase4/ on disk.
  // Enables the researcher to view LSTM/GRU results for any mock pipeline run
  // without requiring mst_pipeline_run_results entries.
  if (status === "completed" && resultVersion === null) {
    const localPayload = await buildLocalPayload();
    if (localPayload) {
      return NextResponse.json(localPayload);
    }
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
