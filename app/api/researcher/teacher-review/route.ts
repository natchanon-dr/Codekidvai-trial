import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// GET /api/researcher/teacher-review
// Aggregates teacher-review label status per learner × batch.
//
// is_teacher_reviewed = at least one submission for that learner-batch
//                       has review_status = 'completed'.
// total_2c3l_score    = sum(criterion_score) / sum(max_criterion_score) × 100
//                       across ALL submissions in the learner-batch.
// at_risk             = total_2c3l_score < 65  (null when scores incomplete)
// ---------------------------------------------------------------------------

const CANONICAL_KEYS = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
] as const;

const AT_RISK_THRESHOLD = 65;

interface LearnerBatchRecord {
  participant_code: string;
  batch_code: string;
  profile_id: string;
  batch_id: string;
  submission_count: number;
  reviewed_count: number;        // submissions with review_status = 'completed'
  criteria_filled: number;       // distinct criterion_keys with scores
  total_2c3l_score: number | null;
  at_risk: 0 | 1 | null;
  is_teacher_reviewed: boolean;
  label_validity: "teacher_reviewed" | "pilot_only" | "invalid";
}

export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  // ── 1. Fetch all submissions ──────────────────────────────────────────────
  const { data: subs, error: subErr } = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, batch_id, review_status");
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  const submissions = (subs ?? []) as {
    submission_id: string;
    profile_id: string;
    batch_id: string;
    review_status: string;
  }[];
  if (submissions.length === 0) {
    return NextResponse.json({ records: [], summary: buildSummary([]) });
  }

  // ── 2. Fetch rubric scores in one batch ──────────────────────────────────
  const subIds = submissions.map((s) => s.submission_id);
  const { data: rubricRows, error: rErr } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .select("submission_id, criterion_key, criterion_score, max_criterion_score")
    .in("submission_id", subIds)
    .in("criterion_key", [...CANONICAL_KEYS]);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // Group rubric scores by submission_id
  const rubricBySubId = new Map<string, { criterion_key: string; criterion_score: number; max_criterion_score: number }[]>();
  for (const r of (rubricRows ?? []) as { submission_id: string; criterion_key: string; criterion_score: number; max_criterion_score: number }[]) {
    const list = rubricBySubId.get(r.submission_id) ?? [];
    list.push(r);
    rubricBySubId.set(r.submission_id, list);
  }

  // ── 3. Fetch profiles ────────────────────────────────────────────────────
  const profileIds = [...new Set(submissions.map((s) => s.profile_id))];
  const { data: profiles } = await supabaseAdmin
    .from("mst_profiles")
    .select("profile_id, participant_code")
    .in("profile_id", profileIds);
  const codeByProfile = new Map(
    (profiles ?? []).map((p) => [
      (p as { profile_id: string; participant_code: string }).profile_id,
      (p as { profile_id: string; participant_code: string }).participant_code,
    ]),
  );

  // ── 4. Fetch batches ─────────────────────────────────────────────────────
  const batchIds = [...new Set(submissions.map((s) => s.batch_id))];
  const { data: batches } = await supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code")
    .in("batch_id", batchIds);
  const codeByBatch = new Map(
    (batches ?? []).map((b) => [
      (b as { batch_id: string; batch_code: string }).batch_id,
      (b as { batch_id: string; batch_code: string }).batch_code,
    ]),
  );

  // ── 5. Aggregate by (profile_id, batch_id) ───────────────────────────────
  type GroupKey = string; // `${profile_id}__${batch_id}`
  const groups = new Map<GroupKey, {
    profile_id: string;
    batch_id: string;
    subs: { submission_id: string; review_status: string }[];
  }>();

  for (const s of submissions) {
    const key: GroupKey = `${s.profile_id}__${s.batch_id}`;
    const g = groups.get(key) ?? { profile_id: s.profile_id, batch_id: s.batch_id, subs: [] };
    g.subs.push({ submission_id: s.submission_id, review_status: s.review_status });
    groups.set(key, g);
  }

  const records: LearnerBatchRecord[] = [];

  for (const g of groups.values()) {
    const participant_code = codeByProfile.get(g.profile_id) ?? g.profile_id;
    const batch_code       = codeByBatch.get(g.batch_id)     ?? g.batch_id;

    // Aggregate rubric scores across all submissions in this group
    let totalScore = 0;
    let maxScore   = 0;
    const seenKeys = new Set<string>();

    for (const sub of g.subs) {
      const rows = rubricBySubId.get(sub.submission_id) ?? [];
      for (const r of rows) {
        totalScore += r.criterion_score;
        maxScore   += r.max_criterion_score;
        seenKeys.add(r.criterion_key);
      }
    }

    const reviewed_count = g.subs.filter((s) => s.review_status === "completed").length;
    const is_teacher_reviewed = reviewed_count > 0;
    const criteria_filled     = seenKeys.size;
    const hasAllCriteria      = CANONICAL_KEYS.every((k) => seenKeys.has(k));
    const total_2c3l_score    = hasAllCriteria && maxScore > 0
      ? Math.round((totalScore / maxScore) * 10000) / 100
      : null;
    const at_risk: 0 | 1 | null = total_2c3l_score !== null
      ? (total_2c3l_score < AT_RISK_THRESHOLD ? 1 : 0)
      : null;

    let label_validity: LearnerBatchRecord["label_validity"];
    if (is_teacher_reviewed && total_2c3l_score !== null) {
      label_validity = "teacher_reviewed";
    } else if (total_2c3l_score !== null) {
      label_validity = "pilot_only";
    } else {
      label_validity = "invalid";
    }

    records.push({
      participant_code,
      batch_code,
      profile_id: g.profile_id,
      batch_id:   g.batch_id,
      submission_count: g.subs.length,
      reviewed_count,
      criteria_filled,
      total_2c3l_score,
      at_risk,
      is_teacher_reviewed,
      label_validity,
    });
  }

  // Sort: teacher-reviewed first, then by 2C3L score desc
  records.sort((a, b) => {
    if (a.is_teacher_reviewed !== b.is_teacher_reviewed)
      return a.is_teacher_reviewed ? -1 : 1;
    return (b.total_2c3l_score ?? -1) - (a.total_2c3l_score ?? -1);
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    at_risk_threshold: AT_RISK_THRESHOLD,
    records,
    summary: buildSummary(records),
  });
}

function buildSummary(records: LearnerBatchRecord[]) {
  const total            = records.length;
  const teacher_reviewed = records.filter((r) => r.is_teacher_reviewed).length;
  const pilot_only       = records.filter((r) => r.label_validity === "pilot_only").length;
  const invalid          = records.filter((r) => r.label_validity === "invalid").length;

  const reviewed = records.filter((r) => r.is_teacher_reviewed && r.at_risk !== null);
  const at_risk_count  = reviewed.filter((r) => r.at_risk === 1).length;
  const not_risk_count = reviewed.filter((r) => r.at_risk === 0).length;

  const threshold_target = 60;
  const threshold_pct    = Math.min(100, Math.round((teacher_reviewed / threshold_target) * 100));

  return {
    total_learner_batches: total,
    teacher_reviewed,
    pilot_only,
    invalid,
    at_risk_count,
    not_risk_count,
    threshold_target,
    threshold_pct,
    confirmatory_ready: teacher_reviewed >= threshold_target,
  };
}
