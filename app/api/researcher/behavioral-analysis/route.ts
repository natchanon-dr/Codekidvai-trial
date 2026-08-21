import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// GET /api/researcher/behavioral-analysis
// Returns attempt-based behavioral complexity records per learner × task,
// aggregated from trn_submissions + trn_submission_rubric_scores.
//
// Payload:
//   overview   — totals across all data
//   learners   — per-learner records with nested task breakdowns
//   generated_at, label_validity_note
// ---------------------------------------------------------------------------

const AT_RISK_THRESHOLD = 65;           // score_pct below this = at-risk
const MAX_COMPLEXITY   = 100;

/** Attempt-count-based complexity proxy (0–100) — higher = harder */
function computeComplexity(
  attemptCount: number,
  correctRatio: number,
  scorePct: number | null,
): number {
  // Weight: 40% extra attempts, 35% low correct ratio, 25% low score
  const attemptWeight = Math.min(1, (attemptCount - 1) / 9) * 40;   // 1–10 attempts
  const ratioWeight   = (1 - correctRatio) * 35;
  const scoreWeight   = scorePct == null ? 12.5 : (1 - scorePct / 100) * 25;
  return Math.min(MAX_COMPLEXITY, Math.round(attemptWeight + ratioWeight + scoreWeight));
}

// ── Types ──────────────────────────────────────────────────────────────────

export type BehavioralTaskRecord = {
  task_id: string;
  task_code: string;
  task_type: string;
  batch_code: string;
  batch_id: string;
  attempt_count: number;
  reviewed_count: number;
  correct_ratio: number;
  avg_score_pct: number | null;
  complexity_score: number;
  at_risk: boolean;
  submission_ids: string[];
};

export type BehavioralLearnerRecord = {
  profile_id: string;
  participant_code: string;
  display_name: string;
  task_count: number;
  total_attempts: number;
  avg_complexity: number;
  at_risk: boolean;
  tasks: BehavioralTaskRecord[];
};

export type BehavioralAnalysisResponse = {
  overview: {
    learner_count: number;
    task_count: number;
    submission_count: number;
    at_risk_count: number;
    avg_complexity: number | null;
  };
  learners: BehavioralLearnerRecord[];
  generated_at: string;
  label_validity_note: string;
};

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  // ── 1. Submissions ────────────────────────────────────────────────────────
  const { data: subs, error: subErr } = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, batch_id, task_id, review_status");

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  const submissions = (subs ?? []) as {
    submission_id: string;
    profile_id: string;
    batch_id: string;
    task_id: string;
    review_status: string;
  }[];

  if (submissions.length === 0) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      overview: { learner_count: 0, task_count: 0, submission_count: 0, at_risk_count: 0, avg_complexity: null },
      learners: [],
      label_validity_note: "No submission data found.",
    } satisfies BehavioralAnalysisResponse);
  }

  // ── 2. Rubric scores ──────────────────────────────────────────────────────
  const subIds = submissions.map((s) => s.submission_id);
  const SCORE_KEYS = ["c1_correctness_result", "c2_semantic_consistency", "l1_logical_reasoning", "l2_learning_process", "l3_difficulty_complexity"];

  const { data: rubricRows } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .select("submission_id, criterion_score, max_criterion_score")
    .in("submission_id", subIds)
    .in("criterion_key", SCORE_KEYS);

  type RRow = { submission_id: string; criterion_score: number; max_criterion_score: number };
  const rubric = (rubricRows ?? []) as RRow[];

  // Sum rubric by submission_id → total_score / max_score
  const rubricTotals = new Map<string, { earned: number; max: number }>();
  for (const r of rubric) {
    const cur = rubricTotals.get(r.submission_id) ?? { earned: 0, max: 0 };
    cur.earned += r.criterion_score;
    cur.max    += r.max_criterion_score;
    rubricTotals.set(r.submission_id, cur);
  }

  // ── 3. Profiles ───────────────────────────────────────────────────────────
  const profileIds = [...new Set(submissions.map((s) => s.profile_id))];
  const { data: profiles } = await supabaseAdmin
    .from("mst_profiles")
    .select("profile_id, participant_code, display_name")
    .in("profile_id", profileIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      (p as { profile_id: string; participant_code: string; display_name: string }).profile_id,
      p as { profile_id: string; participant_code: string; display_name: string },
    ]),
  );

  // ── 4. Tasks ──────────────────────────────────────────────────────────────
  const taskIds = [...new Set(submissions.map((s) => s.task_id))];
  const { data: tasks } = await supabaseAdmin
    .from("mst_tasks")
    .select("task_id, task_code, task_type")
    .in("task_id", taskIds);

  type TaskRow = { task_id: string; task_code: string; task_type: string };
  const taskMap = new Map(
    (tasks ?? []).map((t) => [(t as TaskRow).task_id, t as TaskRow]),
  );

  // ── 5. Batches ────────────────────────────────────────────────────────────
  const batchIds = [...new Set(submissions.map((s) => s.batch_id))];
  const { data: batches } = await supabaseAdmin
    .from("mst_experiment_batches")
    .select("batch_id, batch_code")
    .in("batch_id", batchIds);

  type BatchRow = { batch_id: string; batch_code: string };
  const batchMap = new Map(
    (batches ?? []).map((b) => [(b as BatchRow).batch_id, b as BatchRow]),
  );

  // ── 6. Aggregate per (profile_id, task_id, batch_id) ─────────────────────
  type GroupKey = string;
  type GroupAgg = {
    profile_id: string; task_id: string; batch_id: string;
    submission_count: number; reviewed: number;
    submission_ids: string[];
    score_pcts: number[];
  };

  const groups = new Map<GroupKey, GroupAgg>();

  for (const s of submissions) {
    const key: GroupKey = `${s.profile_id}__${s.task_id}__${s.batch_id}`;
    const grp = groups.get(key) ?? {
      profile_id: s.profile_id, task_id: s.task_id, batch_id: s.batch_id,
      submission_count: 0, reviewed: 0, submission_ids: [], score_pcts: [],
    };
    grp.submission_count++;
    grp.submission_ids.push(s.submission_id);
    if (["completed", "reviewed"].includes(s.review_status ?? "")) grp.reviewed++;

    // Score for this submission
    const rt = rubricTotals.get(s.submission_id);
    if (rt && rt.max > 0) grp.score_pcts.push((rt.earned / rt.max) * 100);

    groups.set(key, grp);
  }

  // ── 7. Build task records ─────────────────────────────────────────────────
  const taskRecordsByProfile = new Map<string, BehavioralTaskRecord[]>();

  for (const [, grp] of groups) {
    const attemptCount  = grp.submission_count;
    const reviewedCount = grp.reviewed;
    const correctRatio  = grp.score_pcts.length > 0
      ? grp.score_pcts.filter((s) => s >= 65).length / grp.score_pcts.length
      : reviewedCount / Math.max(attemptCount, 1);
    const avgScorePct   = grp.score_pcts.length > 0
      ? grp.score_pcts.reduce((a, b) => a + b, 0) / grp.score_pcts.length
      : null;
    const complexity    = computeComplexity(attemptCount, correctRatio, avgScorePct);
    const atRisk        = avgScorePct != null ? avgScorePct < AT_RISK_THRESHOLD : complexity > 60;

    const task = taskMap.get(grp.task_id);
    const batch = batchMap.get(grp.batch_id);

    const rec: BehavioralTaskRecord = {
      task_id:        grp.task_id,
      task_code:      task?.task_code ?? grp.task_id,
      task_type:      task?.task_type ?? "unknown",
      batch_code:     batch?.batch_code ?? grp.batch_id,
      batch_id:       grp.batch_id,
      attempt_count:  attemptCount,
      reviewed_count: reviewedCount,
      correct_ratio:  Math.round(correctRatio * 100) / 100,
      avg_score_pct:  avgScorePct != null ? Math.round(avgScorePct * 10) / 10 : null,
      complexity_score: complexity,
      at_risk:        atRisk,
      submission_ids: grp.submission_ids,
    };

    const list = taskRecordsByProfile.get(grp.profile_id) ?? [];
    list.push(rec);
    taskRecordsByProfile.set(grp.profile_id, list);
  }

  // ── 8. Build learner records ──────────────────────────────────────────────
  const learners: BehavioralLearnerRecord[] = [];
  for (const [profileId, taskList] of taskRecordsByProfile) {
    const prof = profileMap.get(profileId);
    const totalAttempts = taskList.reduce((a, t) => a + t.attempt_count, 0);
    const avgComplexity = Math.round(
      taskList.reduce((a, t) => a + t.complexity_score, 0) / taskList.length,
    );
    const atRisk = taskList.some((t) => t.at_risk);

    learners.push({
      profile_id:       profileId,
      participant_code: prof?.participant_code ?? profileId.slice(0, 8),
      display_name:     prof?.display_name ?? "Unknown",
      task_count:       taskList.length,
      total_attempts:   totalAttempts,
      avg_complexity:   avgComplexity,
      at_risk:          atRisk,
      tasks:            taskList.sort((a, b) => a.task_code.localeCompare(b.task_code)),
    });
  }

  // Sort: at-risk first, then by complexity desc
  learners.sort((a, b) => {
    if (a.at_risk !== b.at_risk) return a.at_risk ? -1 : 1;
    return b.avg_complexity - a.avg_complexity;
  });

  // ── 9. Overview ───────────────────────────────────────────────────────────
  const atRiskCount = learners.filter((l) => l.at_risk).length;
  const complexities = learners.map((l) => l.avg_complexity);
  const avgComplexity = complexities.length > 0
    ? Math.round(complexities.reduce((a, b) => a + b, 0) / complexities.length)
    : null;

  return NextResponse.json({
    overview: {
      learner_count:    learners.length,
      task_count:       [...new Set(submissions.map((s) => s.task_id))].length,
      submission_count: submissions.length,
      at_risk_count:    atRiskCount,
      avg_complexity:   avgComplexity,
    },
    learners,
    generated_at: new Date().toISOString(),
    label_validity_note:
      "PILOT ONLY — proxy_behavioral labels. Complexity is computed from attempt patterns, " +
      "not expert-validated. evaluation_purpose=technical_pipeline_validation.",
  } satisfies BehavioralAnalysisResponse);
}
