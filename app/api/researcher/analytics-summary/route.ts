import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ---------------------------------------------------------------------------
// Allowlists — must match mst_tasks.task_type CHECK constraint and
// mst_experiment_batches.batch_type CHECK constraint in DB migrations.
// ---------------------------------------------------------------------------

const ALLOWED_BATCH_TYPES = new Set([
  "assignment_set",
  "lab_set",
  "exam_set",
]);

const ALLOWED_TASK_TYPES = new Set([
  "sql_text",
  "sql_block",
  "er_diagram",
  "stored_procedure",
  "coding_text",
  "coding_block",
]);

// ---------------------------------------------------------------------------
// Live statistics from vw_dataset_session_level
//
// Grain: 1 row per session (one learner × one task attempt session).
// - learner_count  = COUNT(DISTINCT participant_code)
// - session_count  = COUNT(DISTINCT session_id)
//
// NOTE: "sequence_count" is NOT available from this view — sequences are
// computed offline by NB05 and stored in the Phase 4 pipeline artifact.
// Do NOT rename session_count as sequence_count.
// ---------------------------------------------------------------------------

type LiveStats = {
  learner_count: number;
  session_count: number;
  batch_type_filter: string | null;
  task_type_filter: string | null;
  grain: "session_level";
};

async function queryLiveStats(
  batchType: string | null,
  taskType: string | null,
): Promise<LiveStats> {
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

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const rawBatchType = params.get("batch_type") ?? null;
  const rawTaskType = params.get("task_type") ?? null;

  // Validate allowlists
  if (rawBatchType && !ALLOWED_BATCH_TYPES.has(rawBatchType)) {
    return NextResponse.json(
      { error: `Invalid batch_type. Allowed: ${[...ALLOWED_BATCH_TYPES].join(", ")}` },
      { status: 400 },
    );
  }
  if (rawTaskType && !ALLOWED_TASK_TYPES.has(rawTaskType)) {
    return NextResponse.json(
      { error: `Invalid task_type. Allowed: ${[...ALLOWED_TASK_TYPES].join(", ")}` },
      { status: 400 },
    );
  }

  let liveStats: LiveStats;
  try {
    liveStats = await queryLiveStats(rawBatchType, rawTaskType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query live statistics." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    // Research constraint metadata
    evaluation_purpose: artifact.evaluation_purpose,
    label_source: artifact.label_source,
    label_validity: artifact.label_validity,
    proxy_target_circularity: artifact.proxy_target_circularity,
    confirmatory_analysis_allowed: artifact.confirmatory_analysis_allowed,
    data_warning: artifact.data_warning,

    // Live filtered statistics (grain = session_level)
    live_stats: liveStats,

    // Pipeline artifact statistics — frozen at NB05 execution, not affected by filters
    pipeline_stats: {
      ...artifact.dataset_summary,
      source: "phase4_pipeline_artifact",
      note: "Frozen at NB05 execution. Not affected by dimension filters above.",
    },

    // Validation gate from pipeline artifact
    validation: artifact.validation,

    // BSSA feature analysis from pipeline artifact
    bssa_features: artifact.bssa_features,
  });
}
