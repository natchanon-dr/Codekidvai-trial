import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ---------------------------------------------------------------------------
// Final Result Analysis — one of the five parallel Analysis paths (see
// docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md). Input: Final Result /
// Final Submission only. Method: Traditional Auto Grading (TAG).
//
// "TAG" here means Traditional Auto Grading (Final Result Only ->
// Correct/Incorrect), the NEW thesis-facing meaning. This is DISTINCT from
// the legacy/internal "TAG" = Temporal Assessment Graph used elsewhere in
// Sequential Analysis / Model Results. See docs/TAG_TERMINOLOGY.md. There
// is no separate "TAG Analysis" nav item — TAG lives inside Final Result
// Analysis.
//
// M5.31-R1b: per explicit user instruction, this follows the SAME
// "1 Dataset -> N independent Analysis runs" pattern as Sequential
// Analysis — Dataset row -> expand -> Runs list -> View Result per run.
// Requires migration 028 (adds 'final_result' to the run_type/
// analysis_type CHECK constraints on mst_pipeline_runs /
// mst_pipeline_run_results). Unlike behavioral/sequential/semantic, a
// 'final_result' run has no model to train: creating a run computes the
// real recorded trn_submissions.is_passed/final_score outcome
// SYNCHRONOUSLY and writes it straight to 'completed' — there is no
// worker step, no pending/running window in practice.
//
// TAG must NOT use Behavioral/Sequential/Semantic/BSSI features or 2C3L
// scores — it reads final-result columns only.
// ---------------------------------------------------------------------------

export type TagSummary = {
  total_sessions: number;
  submitted_sessions: number;
  graded_sessions: number;
  passed_sessions: number;
  failed_sessions: number;
  pass_rate: number | null;
};

export type TagLearnerRow = {
  participant_code: string;
  // Display code = "{academy_code}-{academy_member_id}" (e.g. "KMITL-S69056025")
  // when the profile is linked in mst_academy_members; falls back to the raw
  // participant_code when no academy-member link exists yet (not every mock
  // profile has been seeded into mst_academy_members).
  display_code: string;
  session_id: string;
  is_passed: boolean | null;
  final_score: number | null;
  submitted_at: string | null;
};

export type FinalResultRunRecord = {
  id: string;
  dataset_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_summary: string | null;
};

export type TagDatasetRecord = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string | null;
  class_name: string | null;
  active: boolean;
  created_at: string;
  session_count: number;
  learner_count: number;
  usage_status: "used" | "not_used";
  runs: FinalResultRunRecord[];
};

function summarize(rows: Array<{ is_passed: boolean | null; submitted_at: string | null }>): TagSummary {
  const total = rows.length;
  const submitted = rows.filter((r) => r.submitted_at !== null).length;
  const graded = rows.filter((r) => r.is_passed !== null).length;
  const passed = rows.filter((r) => r.is_passed === true).length;
  const failed = rows.filter((r) => r.is_passed === false).length;
  return {
    total_sessions: total,
    submitted_sessions: submitted,
    graded_sessions: graded,
    passed_sessions: passed,
    failed_sessions: failed,
    pass_rate: graded > 0 ? Math.round((passed / graded) * 1000) / 1000 : null,
  };
}

// ---------------------------------------------------------------------------
// Shared: resolve a dataset's batch_ids -> sessions -> learner rows.
// ---------------------------------------------------------------------------

async function computeTagSnapshot(datasetId: string): Promise<{
  dataset: { id: string; code: string; name: string; batch_type: string; set_family: string; task_type: string | null };
  learners: TagLearnerRow[];
  summary: TagSummary;
} | { error: string }> {
  const { data: dsRow, error: dsErr } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, code, name, batch_type, set_family, task_type, class_id")
    .eq("id", datasetId)
    .single();

  if (dsErr || !dsRow) return { error: "Dataset not found." };

  const classId = dsRow.class_id as string | null;
  let batchIds: string[] = [];
  if (classId) {
    const { data: classSets } = await supabaseAdmin.from("tb_class_sets").select("batch_id").eq("class_id", classId);
    batchIds = (classSets ?? []).map((cs) => cs.batch_id as string);
  }

  const dataset = { id: dsRow.id as string, code: dsRow.code as string, name: dsRow.name as string, batch_type: dsRow.batch_type as string, set_family: dsRow.set_family as string, task_type: (dsRow.task_type as string | null) ?? null };

  if (batchIds.length === 0) {
    return { dataset, learners: [], summary: summarize([]) };
  }

  const { data: sessions } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id, batch_id")
    .in("batch_id", batchIds);

  const sessionRows = sessions ?? [];
  const profileIds = [...new Set(sessionRows.map((s) => s.profile_id as string))];
  const sessionIds = sessionRows.map((s) => s.session_id as string);

  const [{ data: profiles }, { data: submissions }] = await Promise.all([
    profileIds.length > 0
      ? supabaseAdmin.from("mst_profiles").select("profile_id, participant_code").in("profile_id", profileIds)
      : Promise.resolve({ data: [] as Array<{ profile_id: string; participant_code: string }> }),
    sessionIds.length > 0
      ? supabaseAdmin.from("trn_submissions").select("session_id, is_passed, final_score, submitted_at").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as Array<{ session_id: string; is_passed: boolean | null; final_score: number | null; submitted_at: string | null }> }),
  ]);

  const codeByProfile = new Map((profiles ?? []).map((p) => [p.profile_id as string, p.participant_code as string]));
  const submissionBySession = new Map(
    (submissions ?? []).map((s) => [
      s.session_id as string,
      { is_passed: (s.is_passed as boolean | null) ?? null, final_score: (s.final_score as number | null) ?? null, submitted_at: (s.submitted_at as string | null) ?? null },
    ]),
  );

  // Resolve display code = "{academy_code}-{academy_member_id}" via
  // mst_academy_members + tb_academy. Falls back to the raw participant_code
  // for any profile not yet linked (not every mock profile has been seeded).
  const participantCodes = [...codeByProfile.values()];
  const { data: members } = participantCodes.length > 0
    ? await supabaseAdmin.from("mst_academy_members").select("academy_id, participant_code, academy_member_id").in("participant_code", participantCodes)
    : { data: [] as Array<{ academy_id: string; participant_code: string; academy_member_id: string }> };
  const academyIds = [...new Set((members ?? []).map((m) => m.academy_id as string))];
  const { data: academies } = academyIds.length > 0
    ? await supabaseAdmin.from("tb_academy").select("academy_id, academy_code").in("academy_id", academyIds)
    : { data: [] as Array<{ academy_id: string; academy_code: string }> };
  const academyCodeById = new Map((academies ?? []).map((a) => [a.academy_id as string, a.academy_code as string]));
  const displayByParticipant = new Map(
    (members ?? []).map((m) => {
      const academyCode = academyCodeById.get(m.academy_id as string) ?? "?";
      return [m.participant_code as string, `${academyCode}-${m.academy_member_id}`];
    }),
  );

  const learners: TagLearnerRow[] = sessionRows
    .map((s) => {
      const sub = submissionBySession.get(s.session_id as string);
      const participantCode = codeByProfile.get(s.profile_id as string) ?? "(unknown)";
      return {
        participant_code: participantCode,
        display_code: displayByParticipant.get(participantCode) ?? participantCode,
        session_id: s.session_id as string,
        is_passed: sub?.is_passed ?? null,
        final_score: sub?.final_score ?? null,
        submitted_at: sub?.submitted_at ?? null,
      };
    })
    .sort((a, b) => a.display_code.localeCompare(b.display_code));

  return { dataset, learners, summary: summarize(learners) };
}

// ---------------------------------------------------------------------------
// List mode — datasets + their final_result runs (mirrors Sequential
// Analysis's dataset-table shape: Runs column, expand-to-see-runs).
// ---------------------------------------------------------------------------

async function handleListMode(): Promise<NextResponse> {
  const { data: datasets, error: dsErr } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, code, name, batch_type, set_family, task_type, class_id, active, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (dsErr) return NextResponse.json({ error: dsErr.message }, { status: 500 });

  const dsRows = datasets ?? [];
  if (dsRows.length === 0) {
    return NextResponse.json({ datasets: [], filter_options: { batch_types: [], set_families: [], task_types: [] } });
  }

  const datasetIds = dsRows.map((d) => d.id as string);
  const classIds = [...new Set(dsRows.map((d) => d.class_id as string | null).filter((id): id is string => !!id))];

  const classBatchIds: Record<string, string[]> = {};
  if (classIds.length > 0) {
    const { data: classSets } = await supabaseAdmin.from("tb_class_sets").select("class_id, batch_id").in("class_id", classIds);
    for (const cs of classSets ?? []) {
      const cid = cs.class_id as string;
      if (!classBatchIds[cid]) classBatchIds[cid] = [];
      classBatchIds[cid].push(cs.batch_id as string);
    }
  }
  const allBatchIds = [...new Set(Object.values(classBatchIds).flat())];

  const sessionsByBatch: Record<string, Array<{ session_id: string; profile_id: string }>> = {};
  if (allBatchIds.length > 0) {
    const { data: sessions } = await supabaseAdmin.from("trn_learning_sessions").select("batch_id, session_id, profile_id").in("batch_id", allBatchIds);
    for (const s of sessions ?? []) {
      const bid = s.batch_id as string;
      if (!sessionsByBatch[bid]) sessionsByBatch[bid] = [];
      sessionsByBatch[bid].push({ session_id: s.session_id as string, profile_id: s.profile_id as string });
    }
  }

  const classNameMap: Record<string, string> = {};
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin.from("tb_classes").select("class_id, class_name").in("class_id", classIds);
    for (const c of classes ?? []) classNameMap[c.class_id as string] = c.class_name as string;
  }

  const { data: runs, error: runErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id, dataset_id, status, created_at, completed_at, error_summary")
    .eq("run_type", "final_result")
    .in("dataset_id", datasetIds)
    .order("created_at", { ascending: false });

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

  const runsByDataset: Record<string, FinalResultRunRecord[]> = {};
  for (const r of runs ?? []) {
    const did = r.dataset_id as string;
    if (!runsByDataset[did]) runsByDataset[did] = [];
    runsByDataset[did].push({
      id: r.id as string,
      dataset_id: did,
      status: (r.status as string) ?? "unknown",
      created_at: r.created_at as string,
      completed_at: (r.completed_at as string | null) ?? null,
      error_summary: (r.error_summary as string | null) ?? null,
    });
  }

  const datasetRecords: TagDatasetRecord[] = dsRows.map((d) => {
    const batchIds = d.class_id ? (classBatchIds[d.class_id as string] ?? []) : [];
    const sessions = batchIds.flatMap((bid) => sessionsByBatch[bid] ?? []);
    const learnerSet = new Set(sessions.map((s) => s.profile_id));
    const dsRuns = runsByDataset[d.id as string] ?? [];

    return {
      id: d.id as string,
      code: d.code as string,
      name: d.name as string,
      batch_type: (d.batch_type as string) ?? "",
      set_family: (d.set_family as string) ?? "",
      task_type: (d.task_type as string | null) ?? null,
      class_name: d.class_id ? (classNameMap[d.class_id as string] ?? null) : null,
      active: (d.active as boolean) ?? false,
      created_at: d.created_at as string,
      session_count: sessions.length,
      learner_count: learnerSet.size,
      usage_status: dsRuns.some((r) => r.status === "completed") ? "used" : "not_used",
      runs: dsRuns,
    };
  });

  return NextResponse.json({
    evaluation_purpose: artifact.evaluation_purpose,
    data_warning: artifact.data_warning,
    note:
      "Final Result Analysis uses Traditional Auto Grading (TAG): the real recorded " +
      "final-result outcome (trn_submissions.is_passed / final_score) — Final Result " +
      "Only -> Correct/Incorrect. This is not a proxy_behavioral inferred label and " +
      "not a trained model prediction. Each Run is a frozen snapshot, computed " +
      "synchronously (no model to train, so no pending/running window in practice).",
    datasets: datasetRecords,
    filter_options: {
      batch_types: [...new Set(dsRows.map((d) => d.batch_type as string).filter(Boolean))],
      set_families: [...new Set(dsRows.map((d) => d.set_family as string).filter(Boolean))],
      task_types: [...new Set(dsRows.map((d) => d.task_type as string).filter((v): v is string => !!v))],
    },
  });
}

// ---------------------------------------------------------------------------
// Detail mode — read a frozen run's snapshot.
// ---------------------------------------------------------------------------

async function handleDetailMode(runId: string): Promise<NextResponse> {
  const { data: row, error } = await supabaseAdmin
    .from("mst_pipeline_run_results")
    .select("result, created_at")
    .eq("run_id", runId)
    .eq("analysis_type", "final_result")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Result not found for this run." }, { status: 404 });
  }

  return NextResponse.json({ ...(row.result as object), snapshot_created_at: row.created_at });
}

// ---------------------------------------------------------------------------
// Create a run — synchronous snapshot (no worker, no model to train).
// ---------------------------------------------------------------------------

async function handleCreateRun(request: NextRequest, initiatedBy: string): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const datasetId = body.dataset_id as string | undefined;
  if (!datasetId) {
    return NextResponse.json({ error: "Missing required field: dataset_id." }, { status: 400 });
  }

  const snapshot = await computeTagSnapshot(datasetId);
  if ("error" in snapshot) {
    return NextResponse.json({ error: snapshot.error }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .insert({
      dataset_id: datasetId,
      run_type: "final_result",
      status: "completed",
      started_at: now,
      completed_at: now,
      initiated_by: initiatedBy,
    })
    .select("id, dataset_id, status, created_at, completed_at, error_summary")
    .single();

  if (runErr || !runRow) {
    return NextResponse.json({ error: runErr?.message ?? "Failed to create run." }, { status: 500 });
  }

  const runId = runRow.id as string;
  const { error: resultErr } = await supabaseAdmin.from("mst_pipeline_run_results").insert({
    run_id: runId,
    dataset_id: datasetId,
    analysis_type: "final_result",
    idempotency_key: `${runId}:final_result`,
    result: {
      dataset: snapshot.dataset,
      learners: snapshot.learners,
      summary: snapshot.summary,
      note:
        "Traditional Auto Grading (TAG) result — real recorded outcome per learner " +
        "(trn_submissions.is_passed / final_score), not a proxy_behavioral label.",
    },
    schema_version: "1.0.0",
  });

  if (resultErr) {
    return NextResponse.json({ error: resultErr.message }, { status: 500 });
  }

  return NextResponse.json({
    run: {
      id: runId,
      dataset_id: datasetId,
      status: runRow.status,
      created_at: runRow.created_at,
      completed_at: runRow.completed_at,
      error_summary: runRow.error_summary,
    },
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const runId = request.nextUrl.searchParams.get("run_id");
  if (runId) return handleDetailMode(runId);
  return handleListMode();
}

export async function POST(request: NextRequest) {
  let initiatedBy = "researcher";
  try {
    const profile = await requireAdminOrResearcher(request);
    initiatedBy = profile.participant_code;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return handleCreateRun(request, initiatedBy);
}
