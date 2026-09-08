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
// Sequential Analysis / Model Results. See docs/TAG_TERMINOLOGY.md.
// There is no separate "TAG Analysis" nav item — TAG lives inside Final
// Result Analysis, per the locked architecture contract.
//
// UI concept: matches Sequential Analysis's dataset-table (list
// mst_datasets, filter by batch/activity/task, expand row) — per explicit
// user request to keep the same browsing concept across Analysis pages.
// UNLIKE Sequential Analysis, there is NO pipeline-run lifecycle here
// (no Run/pending/running/Continue/Stop, no mst_pipeline_runs). TAG has no
// model to train — it is a live read of the real recorded grading outcome
// (trn_submissions.is_passed / final_score), so every dataset row already
// carries its full TAG summary with no separate "run" or detail fetch
// required. TAG must NOT use Behavioral/Sequential/Semantic/BSSI features
// or 2C3L scores — it reads final-result columns only.
//
// Scope note: this route does NOT compute an "accuracy" for TAG against
// the Phase 4 pipeline's at-risk target label — see docs/TAG_TERMINOLOGY.md
// and Model Results, whose "Traditional Auto Grading" row correctly still
// shows "Not yet run" until that separate join is built and reviewed.
// ---------------------------------------------------------------------------

export type TagSummary = {
  total_sessions: number;
  submitted_sessions: number;
  graded_sessions: number;
  passed_sessions: number;
  failed_sessions: number;
  pass_rate: number | null;
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
  tag_summary: TagSummary;
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
      filter_options: { batch_types: [], set_families: [], task_types: [] },
    });
  }

  const classIds = [
    ...new Set(dsRows.map((d) => d.class_id as string | null).filter((id): id is string => !!id)),
  ];

  const classBatchIds: Record<string, string[]> = {};
  if (classIds.length > 0) {
    const { data: classSets } = await supabaseAdmin
      .from("tb_class_sets")
      .select("class_id, batch_id")
      .in("class_id", classIds);
    for (const cs of classSets ?? []) {
      const cid = cs.class_id as string;
      if (!classBatchIds[cid]) classBatchIds[cid] = [];
      classBatchIds[cid].push(cs.batch_id as string);
    }
  }

  const allBatchIds = [...new Set(Object.values(classBatchIds).flat())];

  // sessions per batch: session_id, profile_id, batch_id
  const sessionsByBatch: Record<string, Array<{ session_id: string; profile_id: string }>> = {};
  let allSessionIds: string[] = [];
  if (allBatchIds.length > 0) {
    const { data: sessions } = await supabaseAdmin
      .from("trn_learning_sessions")
      .select("batch_id, session_id, profile_id")
      .in("batch_id", allBatchIds);
    for (const s of sessions ?? []) {
      const bid = s.batch_id as string;
      if (!sessionsByBatch[bid]) sessionsByBatch[bid] = [];
      sessionsByBatch[bid].push({ session_id: s.session_id as string, profile_id: s.profile_id as string });
    }
    allSessionIds = (sessions ?? []).map((s) => s.session_id as string);
  }

  // real recorded outcome per session — trn_submissions.is_passed/submitted_at
  const outcomeBySession: Record<string, { is_passed: boolean | null; submitted_at: string | null }> = {};
  if (allSessionIds.length > 0) {
    const { data: submissions } = await supabaseAdmin
      .from("trn_submissions")
      .select("session_id, is_passed, submitted_at")
      .in("session_id", allSessionIds);
    for (const sub of submissions ?? []) {
      outcomeBySession[sub.session_id as string] = {
        is_passed: (sub.is_passed as boolean | null) ?? null,
        submitted_at: (sub.submitted_at as string | null) ?? null,
      };
    }
  }

  const classNameMap: Record<string, string> = {};
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin.from("tb_classes").select("class_id, class_name").in("class_id", classIds);
    for (const c of classes ?? []) classNameMap[c.class_id as string] = c.class_name as string;
  }

  const datasetRecords: TagDatasetRecord[] = dsRows.map((d) => {
    const batchIds = d.class_id ? (classBatchIds[d.class_id as string] ?? []) : [];
    const sessions = batchIds.flatMap((bid) => sessionsByBatch[bid] ?? []);
    const learnerSet = new Set(sessions.map((s) => s.profile_id));
    const outcomeRows = sessions.map((s) => outcomeBySession[s.session_id] ?? { is_passed: null, submitted_at: null });

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
      tag_summary: summarize(outcomeRows),
    };
  });

  return NextResponse.json({
    evaluation_purpose: artifact.evaluation_purpose,
    data_warning: artifact.data_warning,
    note:
      "Final Result Analysis uses Traditional Auto Grading (TAG): the real recorded " +
      "final-result outcome (trn_submissions.is_passed / final_score) — Final Result " +
      "Only -> Correct/Incorrect. This is not a proxy_behavioral inferred label and " +
      "not a trained model prediction.",
    datasets: datasetRecords,
    filter_options: {
      batch_types: [...new Set(dsRows.map((d) => d.batch_type as string).filter(Boolean))],
      set_families: [...new Set(dsRows.map((d) => d.set_family as string).filter(Boolean))],
      task_types: [...new Set(dsRows.map((d) => d.task_type as string).filter((v): v is string => !!v))],
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return handleListMode();
}
