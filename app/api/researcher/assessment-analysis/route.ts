import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// GET /api/researcher/assessment-analysis
// Returns rubric score analytics aggregated by batch and by task.
//
// Payload:
//   overview            — totals across all data
//   by_criterion        — per-criterion average across all submissions
//   by_batch            — per-batch rubric summary
//   by_task             — per-task rubric difficulty ranking
//   generated_at, label_validity_note
// ---------------------------------------------------------------------------

const CANONICAL_KEYS = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
] as const;
type CriterionKey = (typeof CANONICAL_KEYS)[number];

const CRITERION_LABELS: Record<CriterionKey, string> = {
  c1_correctness_result:   "C1 Correctness",
  c2_semantic_consistency: "C2 Semantic Consistency",
  l1_logical_reasoning:    "L1 Logical Reasoning",
  l2_learning_process:     "L2 Learning Process",
  l3_difficulty_complexity:"L3 Difficulty / Complexity",
};

const AT_RISK_THRESHOLD = 65;

function avg(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}
function pct(v: number | null, digits = 1) {
  return v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;
}

export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  // ── 1. Submissions ────────────────────────────────────────────────────────
  const { data: subs, error: subErr } = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, batch_id, task_id, review_status");
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  const submissions = (subs ?? []) as {
    submission_id: string; profile_id: string;
    batch_id: string; task_id: string; review_status: string;
  }[];
  if (submissions.length === 0) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      overview: { submission_count: 0, scored_count: 0, batch_count: 0, task_count: 0 },
      by_criterion: [], by_batch: [], by_task: [],
    });
  }

  // ── 2. Rubric scores ──────────────────────────────────────────────────────
  const subIds = submissions.map((s) => s.submission_id);
  const { data: rubricRows, error: rErr } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .select("submission_id, criterion_key, criterion_score, max_criterion_score")
    .in("submission_id", subIds)
    .in("criterion_key", [...CANONICAL_KEYS]);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  type RRow = { submission_id: string; criterion_key: string; criterion_score: number; max_criterion_score: number };
  const allRubric = (rubricRows ?? []) as RRow[];

  // Index rubric by submission_id
  const rubricBySubId = new Map<string, RRow[]>();
  for (const r of allRubric) {
    const list = rubricBySubId.get(r.submission_id) ?? [];
    list.push(r);
    rubricBySubId.set(r.submission_id, list);
  }

  // ── 3. Batches ────────────────────────────────────────────────────────────
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

  // ── 4. Tasks ──────────────────────────────────────────────────────────────
  const taskIds = [...new Set(submissions.map((s) => s.task_id))];
  const { data: tasks } = await supabaseAdmin
    .from("mst_tasks")
    .select("task_id, task_code, task_type")
    .in("task_id", taskIds);
  const taskMeta = new Map(
    (tasks ?? []).map((t) => [
      (t as { task_id: string; task_code: string; task_type: string | null }).task_id,
      t as { task_id: string; task_code: string; task_type: string | null },
    ]),
  );

  // ── 5. Helper: compute 2C3L score for a set of rubric rows ───────────────
  function compute2c3l(rows: RRow[]): number | null {
    const byKey = new Map(rows.map((r) => [r.criterion_key, r]));
    if (!CANONICAL_KEYS.every((k) => byKey.has(k))) return null;
    let total = 0, maxTotal = 0;
    for (const k of CANONICAL_KEYS) {
      const r = byKey.get(k)!;
      total    += r.criterion_score;
      maxTotal += r.max_criterion_score;
    }
    return maxTotal > 0 ? Math.round((total / maxTotal) * 10000) / 100 : null;
  }

  // ── 6. Global criterion averages ──────────────────────────────────────────
  const criterionScores = new Map<CriterionKey, number[]>();
  for (const k of CANONICAL_KEYS) criterionScores.set(k, []);
  for (const r of allRubric) {
    if (CANONICAL_KEYS.includes(r.criterion_key as CriterionKey)) {
      const maxPct = r.max_criterion_score > 0
        ? (r.criterion_score / r.max_criterion_score) * 100 : 0;
      criterionScores.get(r.criterion_key as CriterionKey)!.push(maxPct);
    }
  }
  const by_criterion = CANONICAL_KEYS.map((k) => {
    const vals = criterionScores.get(k)!;
    return {
      key:    k,
      label:  CRITERION_LABELS[k],
      n:      vals.length,
      avg_pct: pct(avg(vals)),
    };
  }).sort((a, b) => (a.avg_pct ?? 0) - (b.avg_pct ?? 0));

  // ── 7. Per-batch aggregation ──────────────────────────────────────────────
  type BatchAgg = {
    batch_code: string; batch_id: string;
    submissions: number; scored: number;
    total_2c3l_vals: number[];
    criterion_vals: Map<CriterionKey, number[]>;
    reviewed: number;
  };
  const batchAgg = new Map<string, BatchAgg>();
  for (const batch_id of batchIds) {
    batchAgg.set(batch_id, {
      batch_code: codeByBatch.get(batch_id) ?? batch_id, batch_id,
      submissions: 0, scored: 0,
      total_2c3l_vals: [],
      criterion_vals:  new Map(CANONICAL_KEYS.map((k) => [k, []])),
      reviewed: 0,
    });
  }
  for (const sub of submissions) {
    const agg = batchAgg.get(sub.batch_id);
    if (!agg) continue;
    agg.submissions++;
    if (sub.review_status === "completed") agg.reviewed++;
    const rows = rubricBySubId.get(sub.submission_id) ?? [];
    const score = compute2c3l(rows);
    if (score !== null) {
      agg.scored++;
      agg.total_2c3l_vals.push(score);
    }
    for (const r of rows) {
      if (CANONICAL_KEYS.includes(r.criterion_key as CriterionKey)) {
        const pctVal = r.max_criterion_score > 0
          ? (r.criterion_score / r.max_criterion_score) * 100 : 0;
        agg.criterion_vals.get(r.criterion_key as CriterionKey)!.push(pctVal);
      }
    }
  }
  const by_batch = [...batchAgg.values()].map((agg) => {
    const avg2c3l = pct(avg(agg.total_2c3l_vals));
    const at_risk_count = agg.total_2c3l_vals.filter((v) => v < AT_RISK_THRESHOLD).length;
    return {
      batch_code:    agg.batch_code,
      submission_count: agg.submissions,
      scored_count:  agg.scored,
      reviewed_count: agg.reviewed,
      avg_2c3l_score: avg2c3l,
      at_risk_count,
      at_risk_pct:   agg.total_2c3l_vals.length > 0
        ? pct((at_risk_count / agg.total_2c3l_vals.length) * 100)
        : null,
      per_criterion:  CANONICAL_KEYS.map((k) => ({
        key: k,
        avg_pct: pct(avg(agg.criterion_vals.get(k) ?? [])),
      })),
    };
  }).sort((a, b) => (a.avg_2c3l_score ?? 0) - (b.avg_2c3l_score ?? 0));

  // ── 8. Per-task aggregation ───────────────────────────────────────────────
  type TaskAgg = {
    task_id: string; task_code: string; task_type: string | null;
    submissions: number; total_2c3l_vals: number[];
    criterion_vals: Map<CriterionKey, number[]>;
  };
  const taskAgg = new Map<string, TaskAgg>();
  for (const task_id of taskIds) {
    const meta = taskMeta.get(task_id);
    taskAgg.set(task_id, {
      task_id, task_code: meta?.task_code ?? task_id, task_type: meta?.task_type ?? null,
      submissions: 0, total_2c3l_vals: [],
      criterion_vals: new Map(CANONICAL_KEYS.map((k) => [k, []])),
    });
  }
  for (const sub of submissions) {
    const agg = taskAgg.get(sub.task_id);
    if (!agg) continue;
    agg.submissions++;
    const rows = rubricBySubId.get(sub.submission_id) ?? [];
    const score = compute2c3l(rows);
    if (score !== null) agg.total_2c3l_vals.push(score);
    for (const r of rows) {
      if (CANONICAL_KEYS.includes(r.criterion_key as CriterionKey)) {
        const pctVal = r.max_criterion_score > 0
          ? (r.criterion_score / r.max_criterion_score) * 100 : 0;
        agg.criterion_vals.get(r.criterion_key as CriterionKey)!.push(pctVal);
      }
    }
  }
  const by_task = [...taskAgg.values()]
    .map((agg) => ({
      task_code:      agg.task_code,
      task_type:      agg.task_type,
      submission_count: agg.submissions,
      avg_2c3l_score: pct(avg(agg.total_2c3l_vals)),
      hardest_criterion: (() => {
        const sorted = CANONICAL_KEYS
          .map((k) => ({ key: k, avg: avg(agg.criterion_vals.get(k) ?? []) }))
          .filter((x) => x.avg !== null)
          .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0));
        return sorted[0]?.key ?? null;
      })(),
    }))
    .sort((a, b) => (a.avg_2c3l_score ?? 0) - (b.avg_2c3l_score ?? 0));

  // ── 9. Overview ───────────────────────────────────────────────────────────
  const allScored = submissions.filter((s) => rubricBySubId.has(s.submission_id));
  const allScores = allScored
    .map((s) => compute2c3l(rubricBySubId.get(s.submission_id) ?? []))
    .filter((v): v is number => v !== null);

  return NextResponse.json({
    generated_at:  new Date().toISOString(),
    label_validity_note: "Rubric scores are proxy_behavioral (auto_generated) unless review_status=completed.",
    at_risk_threshold: AT_RISK_THRESHOLD,
    overview: {
      submission_count: submissions.length,
      scored_count:     allScores.length,
      batch_count:      batchIds.length,
      task_count:       taskIds.length,
      overall_avg_2c3l: pct(avg(allScores)),
      overall_at_risk:  allScores.filter((v) => v < AT_RISK_THRESHOLD).length,
      overall_at_risk_pct: allScores.length > 0
        ? pct((allScores.filter((v) => v < AT_RISK_THRESHOLD).length / allScores.length) * 100)
        : null,
    },
    by_criterion,
    by_batch,
    by_task,
  });
}
