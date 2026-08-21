import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { convertRowsToCsv } from "@/lib/csv-utils";
import { getLearningMode } from "@/lib/research-context";

const viewMap: Record<string, string> = {
  attempt: "vw_dataset_attempt_level",
  session: "vw_dataset_session_level",
  sequence: "vw_dataset_sequence_level",
  raw_event: "vw_dataset_raw_event_log",
};

// Canonical 2C3L criterion keys and their weights (Draft-06, frozen)
const CRITERION_WEIGHTS: Record<string, number> = {
  c1_correctness_result:   0.30,
  c2_semantic_consistency: 0.20,
  l1_logical_reasoning:    0.20,
  l2_learning_process:     0.15,
  l3_difficulty_complexity: 0.15,
};
const CANONICAL_KEYS = Object.keys(CRITERION_WEIGHTS);

function deriveGrade(score: number): string {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 55) return "D";
  if (score >= 45) return "E";
  return "F";
}

type RubricScoreRow = { criterion_key: string; criterion_score: number; max_criterion_score: number };

function buildOutcomeRow(
  participantCode: string,
  batchCode: string,
  taskCode: string,
  taskType: string | null,
  setFamily: string | null,
  submissionId: string,
  submittedAt: string | null,
  rubricRows: RubricScoreRow[],
  reviewStatus?: string,
): Record<string, unknown> {
  const byKey = new Map(rubricRows.map((r) => [r.criterion_key, r]));
  const criteriaCount = CANONICAL_KEYS.filter((k) => byKey.has(k)).length;

  const scores: Record<string, unknown> = {};
  let totalRubric = 0;
  let maxRubric = 0;

  for (const key of CANONICAL_KEYS) {
    const row = byKey.get(key);
    scores[`${key}_score`] = row?.criterion_score ?? null;
    scores[`${key}_max`]   = row?.max_criterion_score ?? null;
    if (row) {
      totalRubric += row.criterion_score;
      maxRubric   += row.max_criterion_score;
    }
  }

  const hasAllCriteria = criteriaCount === CANONICAL_KEYS.length;
  const total2c3l = hasAllCriteria && maxRubric > 0
    ? Math.round((totalRubric / maxRubric) * 10000) / 100
    : null;

  const atRisk  = total2c3l !== null ? (total2c3l < 65 ? 1 : 0) : null;
  const grade   = total2c3l !== null ? deriveGrade(total2c3l) : null;

  const isTeacherReviewed = reviewStatus === "completed";
  const labelSource   = criteriaCount === 0 ? "no_rubric" : "auto_generated";
  const labelValidity = criteriaCount === 0
    ? "invalid"
    : isTeacherReviewed
    ? "teacher_reviewed"
    : "pilot_only";

  return {
    participant_code: participantCode,
    batch_code:       batchCode,
    task_code:        taskCode,
    task_type:        taskType ?? null,
    set_family:       setFamily ?? null,
    learning_mode:    taskType ? getLearningMode(taskType) : null,
    submission_id:    submissionId,
    submitted_at:     submittedAt ?? null,
    ...scores,
    total_rubric_score: hasAllCriteria ? totalRubric  : null,
    max_rubric_score:   hasAllCriteria ? maxRubric    : null,
    total_2c3l_score:   total2c3l,
    grade_letter:       grade,
    at_risk:            atRisk,
    label_source:       labelSource,
    label_validity:     labelValidity,
    is_teacher_reviewed: isTeacherReviewed,
    criteria_count:     criteriaCount,
  };
}

async function exportOutcome(
  batchCode: string | null,
  batchCodes: string | null,
): Promise<Record<string, unknown>[]> {
  const codes = batchCodes
    ? batchCodes.split(",").map((s) => s.trim()).filter(Boolean)
    : batchCode
    ? [batchCode]
    : [];

  // 1. Resolve batch_ids
  const batchIds: string[] = [];
  const batchCodeById = new Map<string, string>();
  if (codes.length > 0) {
    const { data: batches, error: bErr } = await supabaseAdmin
      .from("mst_experiment_batches")
      .select("batch_id, batch_code");
    if (bErr) throw new Error(bErr.message);
    for (const b of (batches ?? []) as { batch_id: string; batch_code: string }[]) {
      if (codes.includes(b.batch_code)) {
        batchIds.push(b.batch_id);
        batchCodeById.set(b.batch_id, b.batch_code);
      }
    }
  }

  // 2. Fetch submissions
  let subQ = supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, task_id, batch_id, submitted_at, review_status");
  if (batchIds.length > 0) subQ = subQ.in("batch_id", batchIds);
  const { data: subs, error: subErr } = await subQ;
  if (subErr) throw new Error(subErr.message);
  const submissions = (subs ?? []) as {
    submission_id: string;
    profile_id: string;
    task_id: string;
    batch_id: string;
    submitted_at: string | null;
    review_status: string | null;
  }[];
  if (submissions.length === 0) return [];

  // 3. Resolve profile_id → participant_code
  const profileIds = [...new Set(submissions.map((s) => s.profile_id))];
  const { data: profiles, error: pErr } = await supabaseAdmin
    .from("mst_profiles")
    .select("profile_id, participant_code")
    .in("profile_id", profileIds);
  if (pErr) throw new Error(pErr.message);
  const codeByProfileId = new Map(
    (profiles ?? []).map((p) => [
      (p as { profile_id: string; participant_code: string }).profile_id,
      (p as { profile_id: string; participant_code: string }).participant_code,
    ]),
  );

  // 4. Resolve task_id → task_code and task_type
  const taskIds = [...new Set(submissions.map((s) => s.task_id))];
  const { data: tasks, error: tErr } = await supabaseAdmin
    .from("mst_tasks")
    .select("task_id, task_code, task_type")
    .in("task_id", taskIds);
  if (tErr) throw new Error(tErr.message);
  const codeByTaskId = new Map(
    (tasks ?? []).map((t) => [
      (t as { task_id: string; task_code: string; task_type: string }).task_id,
      (t as { task_id: string; task_code: string; task_type: string }).task_code,
    ]),
  );
  const typeByTaskId = new Map(
    (tasks ?? []).map((t) => [
      (t as { task_id: string; task_code: string; task_type: string }).task_id,
      (t as { task_id: string; task_code: string; task_type: string }).task_type,
    ]),
  );

  // 4b. Resolve set_family per batch_id (NULL if ambiguous across class_ids)
  const setFamilyByBatchId = new Map<string, string | null>();
  if (batchIds.length > 0) {
    const { data: csRows } = await supabaseAdmin
      .from("tb_class_sets")
      .select("batch_id, family")
      .in("batch_id", batchIds);
    const familiesByBatch = new Map<string, Set<string>>();
    for (const r of (csRows ?? []) as { batch_id: string; family: string }[]) {
      if (!familiesByBatch.has(r.batch_id)) familiesByBatch.set(r.batch_id, new Set());
      familiesByBatch.get(r.batch_id)!.add(r.family);
    }
    for (const [bid, fams] of familiesByBatch) {
      setFamilyByBatchId.set(bid, fams.size === 1 ? [...fams][0] : null);
    }
  }

  // 5. Fetch rubric scores for all submissions in one query
  const submissionIds = submissions.map((s) => s.submission_id);
  const { data: rubricData, error: rErr } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .select("submission_id, criterion_key, criterion_score, max_criterion_score")
    .in("submission_id", submissionIds);
  if (rErr) throw new Error(rErr.message);

  const rubricBySubmission = new Map<string, RubricScoreRow[]>();
  for (const r of (rubricData ?? []) as {
    submission_id: string;
    criterion_key: string;
    criterion_score: number;
    max_criterion_score: number;
  }[]) {
    if (!rubricBySubmission.has(r.submission_id)) rubricBySubmission.set(r.submission_id, []);
    rubricBySubmission.get(r.submission_id)!.push({
      criterion_key:       r.criterion_key,
      criterion_score:     Number(r.criterion_score),
      max_criterion_score: Number(r.max_criterion_score),
    });
  }

  return submissions.map((s) =>
    buildOutcomeRow(
      codeByProfileId.get(s.profile_id)      ?? s.profile_id,
      batchCodeById.get(s.batch_id)          ?? s.batch_id,
      codeByTaskId.get(s.task_id)            ?? s.task_id,
      typeByTaskId.get(s.task_id)            ?? null,
      setFamilyByBatchId.get(s.batch_id)     ?? null,
      s.submission_id,
      s.submitted_at,
      rubricBySubmission.get(s.submission_id) ?? [],
      s.review_status ?? undefined,
    ),
  );
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAdminOrResearcher(request);
    const searchParams = request.nextUrl.searchParams;
    const type       = searchParams.get("type") ?? "session";
    const batchCode  = searchParams.get("batch_code");
    const batchCodes = searchParams.get("batch_codes");

    let rows: Record<string, unknown>[];
    let sourceLabel: string;

    if (type === "outcome") {
      rows        = await exportOutcome(batchCode, batchCodes);
      sourceLabel = "trn_submissions+trn_submission_rubric_scores";
    } else {
      const viewName = viewMap[type];
      if (!viewName) throw new Error("Invalid dataset type.");
      let query = supabaseAdmin.from(viewName).select("*");
      if (batchCodes) {
        query = query.in("batch_code", batchCodes.split(",").map((s) => s.trim()).filter(Boolean));
      } else if (batchCode) {
        query = query.eq("batch_code", batchCode);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      rows        = (data ?? []) as Record<string, unknown>[];
      sourceLabel = viewName;
    }

    await supabaseAdmin.from("trn_dataset_exports").insert({
      export_name:  `dataset_${type}`,
      export_type:  type,
      exported_by:  profile.profile_id,
      filter_json:  { type, batch_code: batchCode, source_view: sourceLabel },
      row_count:    rows.length,
    });

    const csv = convertRowsToCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dataset_${type}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 400 },
    );
  }
}
