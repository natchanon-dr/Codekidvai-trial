import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import {
  BATCH_TYPE_VALUES,
  SET_FAMILY_VALUES,
  THESIS_TASK_TYPE_ORDER,
  SET_FAMILY_LABEL,
  THESIS_TASK_TYPE_LABEL,
  PHASE4_CONSTRAINTS,
  type BatchType,
  type SetFamily,
  type TaskType,
} from "@/lib/research-context";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AVAILABLE_DATASETS = [
  { id: "phase4_pilot", label: "Phase 4 Pilot Dataset" },
] as const;

/**
 * Batch type display labels.
 * Internal value 'trial' replaces the legacy 'practice' at the UI/API layer.
 * Existing mst_experiment_batches rows still store 'practice'; a DB migration
 * to align the CHECK constraint is deferred.
 */
const BATCH_TYPE_LABEL: Record<BatchType, string> = {
  pilot: "Pilot",
  main: "Main",
  trial: "Trial",
};

/** Batch type codes (1 char each) used in dataset code generation. */
const BATCH_TYPE_CODE: Record<BatchType, string> = {
  main:  "M",
  trial: "T",
  pilot: "P",
};

/** Batch type icon identifiers — used by the UI. */
const BATCH_TYPE_ICON: Record<BatchType, string> = {
  main:  "star",
  trial: "dumbbell",
  pilot: "paper-airplane",
};

/** Batch type accessible labels (aria) used in the UI. */
const BATCH_TYPE_ARIA: Record<BatchType, string> = {
  main:  "Main (star)",
  trial: "Trial (dumbbell)",
  pilot: "Pilot (paper airplane)",
};

/** Dataset display order for Batch Type: Main → Trial → Pilot */
const BATCH_TYPE_ORDER: readonly BatchType[] = ["main", "trial", "pilot"];

/** Activity type codes (1 char each). */
const SET_FAMILY_CODE: Record<SetFamily, string> = {
  assignment: "A",
  lab:        "L",
  exam:       "E",
};

/** Task types in thesis scope for dataset creation. */
const DATASET_TASK_TYPES = ["sql_text", "stored_procedure", "sql_block", "er_diagram"] as const;
type DatasetTaskType = (typeof DATASET_TASK_TYPES)[number];

/** Dataset-specific task type display labels (separate from THESIS_TASK_TYPE_LABEL). */
const DATASET_TASK_TYPE_LABEL: Record<DatasetTaskType, string> = {
  sql_text:         "SQL Query",
  sql_block:        "Query Block",
  stored_procedure: "Stored Procedure",
  er_diagram:       "ER Diagram",
};

/** Task type codes (2 chars each) for dataset code generation. */
const DATASET_TASK_TYPE_CODE: Record<DatasetTaskType, string> = {
  sql_text:         "QT",
  sql_block:        "QB",
  stored_procedure: "SP",
  er_diagram:       "ER",
};

const ALLOWED_TASK_TYPES = new Set<string>(THESIS_TASK_TYPE_ORDER);

const ACTIVITY_TYPE_UNAVAILABLE_REASON =
  "set_family is not a column in vw_dataset_session_level. " +
  "A dedicated view join is required to filter by Activity Type. " +
  "The column exists only in tb_class_sets (joined via tb_task_assignments) " +
  "and is populated in source CSVs for 3 experiment batches only.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScopedSummary = {
  learner_count: number;
  session_count: number;
  batch_type_filter: BatchType | null;
  task_type_filter: TaskType | null;
  grain: "session_level";
};

type DatasetRecord = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_id: string | null;
  class_name: string | null;
  task_id: string | null;
  task_set_name: string | null;
  active: boolean;
  usage_status: "used" | "not_used";
  session_count: number;
  learner_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type CreateDatasetInput = {
  name: string;
  batch_type: BatchType;
  set_family: SetFamily;
  task_type: DatasetTaskType;
  class_id?: string | null;
  task_id?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function queryScopedSummary(
  batchType: BatchType | null,
  taskType: TaskType | null,
): Promise<ScopedSummary> {
  let query = supabaseAdmin
    .from("vw_dataset_session_level")
    .select("participant_code, session_id, batch_type, task_type");

  if (batchType) query = query.eq("batch_type", batchType);
  if (taskType) query = query.eq("task_type", taskType);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const learners = new Set(rows.map((r) => r.participant_code as string));
  const sessions = new Set(rows.map((r) => r.session_id as string));

  return {
    learner_count: learners.size,
    session_count: sessions.size,
    batch_type_filter: batchType,
    task_type_filter: taskType,
    grain: "session_level",
  };
}

/**
 * Determine usage status for a dataset.
 * Currently always "not_used" because no FK links sessions to mst_datasets.
 * Future: query a trn_runs or similar table once it exists.
 */
function resolveUsageStatus(_datasetId: string): "used" | "not_used" {
  return "not_used";
}

function buildAvailableBatchTypes() {
  return BATCH_TYPE_ORDER.map((v) => ({
    value: v,
    label: BATCH_TYPE_LABEL[v],
    code: BATCH_TYPE_CODE[v],
    icon: BATCH_TYPE_ICON[v],
    aria_label: BATCH_TYPE_ARIA[v],
  }));
}

function buildAvailableActivityTypes() {
  return SET_FAMILY_VALUES.map((v) => ({
    value: v,
    label: SET_FAMILY_LABEL[v],
    code: SET_FAMILY_CODE[v],
  }));
}

function buildAvailableTaskTypes() {
  return THESIS_TASK_TYPE_ORDER.map((v) => ({
    value: v,
    label: THESIS_TASK_TYPE_LABEL[v] ?? v,
    dataset_label: (DATASET_TASK_TYPE_LABEL as Record<string, string>)[v] ?? v,
    code: (DATASET_TASK_TYPE_CODE as Record<string, string>)[v] ?? "??",
  }));
}

// ---------------------------------------------------------------------------
// GET — analytics + dataset list
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  // ── Dataset selector ──────────────────────────────────────────────────────
  const rawDataset = params.get("dataset") ?? "phase4_pilot";
  if (rawDataset !== "phase4_pilot") {
    return NextResponse.json(
      { error: `Invalid dataset. Allowed: ${AVAILABLE_DATASETS.map((d) => d.id).join(", ")}` },
      { status: 400 },
    );
  }

  // ── Batch Type selector ───────────────────────────────────────────────────
  const rawBatchType = params.get("batch_type") ?? null;
  if (rawBatchType !== null && !(BATCH_TYPE_VALUES as readonly string[]).includes(rawBatchType)) {
    return NextResponse.json(
      { error: `Invalid batch_type. Allowed: ${[...BATCH_TYPE_VALUES].join(", ")}` },
      { status: 400 },
    );
  }
  const batchType = rawBatchType as BatchType | null;

  // ── Activity Type (set_family) — unavailable as live filter ───────────────
  const rawSetFamily = params.get("set_family") ?? null;
  if (rawSetFamily !== null) {
    if (!(SET_FAMILY_VALUES as readonly string[]).includes(rawSetFamily)) {
      return NextResponse.json(
        { error: `Invalid set_family. Allowed: ${[...SET_FAMILY_VALUES].join(", ")}` },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Filtering by set_family (Activity Type) is not supported. " +
          ACTIVITY_TYPE_UNAVAILABLE_REASON,
      },
      { status: 422 },
    );
  }

  // ── Task Type selector ────────────────────────────────────────────────────
  const rawTaskType = params.get("task_type") ?? null;
  if (rawTaskType !== null && !ALLOWED_TASK_TYPES.has(rawTaskType)) {
    return NextResponse.json(
      { error: `Invalid task_type. Allowed (thesis scope): ${[...ALLOWED_TASK_TYPES].join(", ")}` },
      { status: 400 },
    );
  }
  const taskType = rawTaskType as TaskType | null;

  // ── Dataset list parameters ───────────────────────────────────────────────
  const search = params.get("search") ?? null;
  const filterBatchType = params.get("filter_batch_type") ?? null;
  const filterSetFamily = params.get("filter_set_family") ?? null;
  const filterTaskType = params.get("filter_task_type") ?? null;
  const filterActive = params.get("filter_active") ?? null;
  const filterUsage = params.get("filter_usage") ?? null; // "used" | "not_used"

  // ── Scoped summary ────────────────────────────────────────────────────────
  let scopedSummary: ScopedSummary;
  try {
    scopedSummary = await queryScopedSummary(batchType, taskType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query session-level statistics." },
      { status: 500 },
    );
  }

  // ── Dataset list query ────────────────────────────────────────────────────
  let datasetQuery = supabaseAdmin
    .from("mst_datasets")
    .select("id, code, name, batch_type, set_family, task_type, class_id, task_set_id, active, created_at, updated_at, archived_at")
    .is("archived_at", null); // exclude soft-deleted

  if (search) {
    datasetQuery = datasetQuery.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
  }
  if (filterBatchType && (BATCH_TYPE_VALUES as readonly string[]).includes(filterBatchType)) {
    datasetQuery = datasetQuery.eq("batch_type", filterBatchType);
  }
  if (filterSetFamily && (SET_FAMILY_VALUES as readonly string[]).includes(filterSetFamily)) {
    datasetQuery = datasetQuery.eq("set_family", filterSetFamily);
  }
  if (filterTaskType && ALLOWED_TASK_TYPES.has(filterTaskType)) {
    datasetQuery = datasetQuery.eq("task_type", filterTaskType);
  }
  if (filterActive === "true") {
    datasetQuery = datasetQuery.eq("active", true);
  } else if (filterActive === "false") {
    datasetQuery = datasetQuery.eq("active", false);
  }

  datasetQuery = datasetQuery.order("created_at", { ascending: false });

  let datasetList: DatasetRecord[] = [];
  const { data: rawDatasets, error: datasetError } = await datasetQuery;
  if (!datasetError && rawDatasets) {
    // Bulk-fetch session/learner counts per unique class_id
    const classIds = [...new Set(rawDatasets.map((r) => r.class_id as string | null).filter(Boolean))] as string[];
    const classStats = new Map<string, { session_count: number; learner_count: number }>();

    if (classIds.length > 0) {
      const { data: sets } = await supabaseAdmin
        .from("tb_class_sets")
        .select("class_id, batch_id")
        .in("class_id", classIds);

      if (sets && sets.length > 0) {
        // Group batch_ids per class
        const classBatches = new Map<string, string[]>();
        for (const s of sets) {
          const cid = s.class_id as string;
          if (!classBatches.has(cid)) classBatches.set(cid, []);
          classBatches.get(cid)!.push(s.batch_id as string);
        }

        const allBatchIds = sets.map((s) => s.batch_id as string);
        const { data: sessions } = await supabaseAdmin
          .from("trn_learning_sessions")
          .select("batch_id, session_id, profile_id")
          .in("batch_id", allBatchIds);

        if (sessions) {
          // Per-class counts
          for (const [cid, bids] of classBatches) {
            const bidSet = new Set(bids);
            const rows = sessions.filter((s) => bidSet.has(s.batch_id as string));
            const sessionSet = new Set(rows.map((r) => r.session_id as string));
            const profileSet = new Set(rows.map((r) => r.profile_id as string));
            classStats.set(cid, { session_count: sessionSet.size, learner_count: profileSet.size });
          }
        }
      }
    }

    // Bulk-fetch class names
    const classNameMap = new Map<string, string>();
    if (classIds.length > 0) {
      const { data: classes } = await supabaseAdmin
        .from("tb_classes")
        .select("class_id, class_name")
        .in("class_id", classIds);
      for (const c of classes ?? []) classNameMap.set(String(c.class_id), String(c.class_name));
    }

    // Bulk-fetch task set names (mst_experiment_batches)
    const taskSetIds = [...new Set(rawDatasets.map((r) => r.task_set_id as string | null).filter(Boolean))] as string[];
    const taskSetNameMap = new Map<string, string>();
    if (taskSetIds.length > 0) {
      const { data: batches } = await supabaseAdmin
        .from("mst_experiment_batches")
        .select("batch_id, batch_name")
        .in("batch_id", taskSetIds);
      for (const b of batches ?? []) taskSetNameMap.set(String(b.batch_id), String(b.batch_name));
    }

    // Bulk-fetch usage status: a dataset is "used" if it has any completed pipeline run
    const allDatasetIds = rawDatasets.map((r) => String(r.id));
    const usedSet = new Set<string>();
    if (allDatasetIds.length > 0) {
      const { data: completedRuns } = await supabaseAdmin
        .from("mst_pipeline_runs")
        .select("dataset_id")
        .in("dataset_id", allDatasetIds)
        .eq("status", "completed");
      for (const r of completedRuns ?? []) usedSet.add(String(r.dataset_id));
    }

    datasetList = rawDatasets
      .map((row) => {
        const cid = row.class_id ? String(row.class_id) : null;
        const tid = row.task_set_id ? String(row.task_set_id) : null;
        const stats = cid ? (classStats.get(cid) ?? { session_count: 0, learner_count: 0 }) : { session_count: 0, learner_count: 0 };
        return {
          id: String(row.id),
          code: String(row.code),
          name: String(row.name),
          batch_type: String(row.batch_type),
          set_family: String(row.set_family),
          task_type: String(row.task_type),
          class_id: cid,
          class_name: cid ? (classNameMap.get(cid) ?? null) : null,
          task_id: tid,
          task_set_name: tid ? (taskSetNameMap.get(tid) ?? null) : null,
          active: Boolean(row.active),
          usage_status: usedSet.has(String(row.id)) ? "used" : "not_used" as "used" | "not_used",
          session_count: stats.session_count,
          learner_count: stats.learner_count,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
          archived_at: row.archived_at ? String(row.archived_at) : null,
        };
      })
      .filter((d) => !filterUsage || d.usage_status === filterUsage);
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    available_datasets: AVAILABLE_DATASETS,
    available_batch_types: buildAvailableBatchTypes(),
    available_activity_types: buildAvailableActivityTypes(),
    available_task_types: buildAvailableTaskTypes(),

    active_scope: {
      dataset: rawDataset,
      batch_type: batchType,
      set_family: null,
      task_type: taskType,
    },

    scoped_summary: scopedSummary,

    validity_metadata: {
      label_source: artifact.label_source,
      label_validity: artifact.label_validity,
      evaluation_purpose: artifact.evaluation_purpose,
      proxy_target_circularity: artifact.proxy_target_circularity,
      confirmatory_analysis_allowed: artifact.confirmatory_analysis_allowed,
      data_warning: artifact.data_warning,
    },

    phase4_constraints: PHASE4_CONSTRAINTS,

    unavailable_dimensions: [
      {
        dimension: "set_family",
        ui_label: "Activity Type",
        reason: ACTIVITY_TYPE_UNAVAILABLE_REASON,
        canonical_values: [...SET_FAMILY_VALUES],
      },
      {
        dimension: "dataset_version",
        ui_label: "Dataset Version",
        reason: "No dataset_version identifier exists in source data or pipeline artifact.",
        canonical_values: [],
      },
      {
        dimension: "pipeline_run_id",
        ui_label: "Pipeline Run",
        reason:
          "No pipeline_run_id column is present in source data. Pipeline is identified by artifact schema_version.",
        canonical_values: [],
      },
    ],

    dataset_list: datasetList,
    dataset_list_count: datasetList.length,
  });
}

// ---------------------------------------------------------------------------
// POST — create dataset
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // Reject manually submitted code
  if ("code" in raw) {
    return NextResponse.json(
      { error: "Dataset code is generated server-side. Do not submit a code value." },
      { status: 422 },
    );
  }

  // Validate required fields
  const fieldErrors: Record<string, string> = {};

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) fieldErrors.name = "name is required.";

  const batchType = raw.batch_type as string | undefined;
  if (!batchType) {
    fieldErrors.batch_type = "batch_type is required.";
  } else if (!(BATCH_TYPE_VALUES as readonly string[]).includes(batchType)) {
    fieldErrors.batch_type = `batch_type must be one of: ${[...BATCH_TYPE_VALUES].join(", ")}`;
  }

  const setFamily = raw.set_family as string | undefined;
  if (!setFamily) {
    fieldErrors.set_family = "set_family is required.";
  } else if (!(SET_FAMILY_VALUES as readonly string[]).includes(setFamily)) {
    fieldErrors.set_family = `set_family must be one of: ${[...SET_FAMILY_VALUES].join(", ")}`;
  }

  // task_type is optional for Exam datasets
  const isExam = setFamily === "exam";
  const taskType = typeof raw.task_type === "string" && raw.task_type !== "" ? raw.task_type : undefined;
  if (!isExam) {
    if (!taskType) {
      fieldErrors.task_type = "task_type is required for non-exam datasets.";
    } else if (!DATASET_TASK_TYPES.includes(taskType as DatasetTaskType)) {
      fieldErrors.task_type = `task_type must be one of: ${[...DATASET_TASK_TYPES].join(", ")}`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ error: "Validation failed.", field_errors: fieldErrors }, { status: 422 });
  }

  const input: CreateDatasetInput = {
    name,
    batch_type: batchType as BatchType,
    set_family: setFamily as SetFamily,
    task_type: (taskType ?? null) as unknown as DatasetTaskType,
    class_id: typeof raw.class_id === "string" && raw.class_id ? raw.class_id : null,
    task_id: typeof raw.task_id === "string" && raw.task_id ? raw.task_id : null,
  };

  // Derive code component parts — Exam uses 'EX' as task code segment
  const bBatchCode    = BATCH_TYPE_CODE[input.batch_type];
  const bActivityCode = SET_FAMILY_CODE[input.set_family];
  const bTaskCode     = isExam ? "EX" : DATASET_TASK_TYPE_CODE[taskType as DatasetTaskType];

  // Allocate dataset code via RPC (safe serial allocation)
  const { data: codeData, error: codeError } = await supabaseAdmin.rpc("allocate_dataset_code", {
    p_batch_code:    bBatchCode,
    p_activity_code: bActivityCode,
    p_task_code:     bTaskCode,
  });

  if (codeError) {
    if (typeof codeError.message === "string" && codeError.message.includes("Code space exhausted")) {
      return NextResponse.json(
        { error: `Code space exhausted for prefix ${bBatchCode}${bActivityCode}${bTaskCode}. No more codes available.` },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Failed to allocate dataset code. DB: ${codeError.message}` },
      { status: 500 },
    );
  }

  const code = codeData as string;

  // Insert dataset — task_set_id stores batch_id from mst_experiment_batches
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("mst_datasets")
    .insert({
      code,
      name:        input.name,
      batch_type:  input.batch_type,
      set_family:  input.set_family,
      task_type:   input.task_type ?? null,
      class_id:    input.class_id ?? null,
      task_set_id: input.task_id ?? null,
    })
    .select("id, code, name, batch_type, set_family, task_type, class_id, task_set_id, active, created_at, updated_at, archived_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "A dataset with this code already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: `Failed to create dataset. DB: ${insertError.message}` }, { status: 500 });
  }

  const record: DatasetRecord = {
    id:            String(inserted.id),
    code:          String(inserted.code),
    name:          String(inserted.name),
    batch_type:    String(inserted.batch_type),
    set_family:    String(inserted.set_family),
    task_type:     inserted.task_type ? String(inserted.task_type) : "",
    class_id:      inserted.class_id ? String(inserted.class_id) : null,
    class_name:    null,
    task_id:       inserted.task_set_id ? String(inserted.task_set_id) : null,
    task_set_name: null,
    active:        Boolean(inserted.active),
    usage_status:  "not_used",
    session_count: 0,
    learner_count: 0,
    created_at:    String(inserted.created_at),
    updated_at:    String(inserted.updated_at),
    archived_at:   null,
  };

  return NextResponse.json({ dataset: record }, { status: 201 });
}
