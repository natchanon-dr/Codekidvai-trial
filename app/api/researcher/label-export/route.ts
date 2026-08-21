import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// GET /api/researcher/label-export
// Exports per-learner-batch at-risk labels as CSV, suitable for use by the
// ML pipeline notebooks (NB02–NB09) once teacher-reviewed labels exist.
//
// Query params:
//   batch_code  — filter to a single batch (optional)
//   validity    — "all" | "teacher_reviewed" | "pilot_only"  (default: all)
//
// Output columns:
//   participant_code, batch_code, submission_count, reviewed_count,
//   criteria_filled, total_2c3l_score, at_risk, is_teacher_reviewed,
//   label_source, label_validity, exported_at
// ---------------------------------------------------------------------------

const CANONICAL_KEYS = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
] as const;

const AT_RISK_THRESHOLD = 65;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape  = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const params      = req.nextUrl.searchParams;
  const batchFilter = params.get("batch_code");
  const validity    = params.get("validity") ?? "all";

  // ── 1. Submissions ────────────────────────────────────────────────────────
  let subQ = supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, profile_id, batch_id, review_status");
  const { data: subs, error: subErr } = await subQ;
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  const submissions = (subs ?? []) as {
    submission_id: string; profile_id: string; batch_id: string; review_status: string;
  }[];
  if (submissions.length === 0) {
    return new NextResponse("participant_code,batch_code,at_risk,label_validity\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="labels_v1.csv"` },
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

  const rubricBySubId = new Map<string, { criterion_key: string; criterion_score: number; max_criterion_score: number }[]>();
  for (const r of (rubricRows ?? []) as { submission_id: string; criterion_key: string; criterion_score: number; max_criterion_score: number }[]) {
    const list = rubricBySubId.get(r.submission_id) ?? [];
    list.push(r);
    rubricBySubId.set(r.submission_id, list);
  }

  // ── 3. Profiles ───────────────────────────────────────────────────────────
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

  // ── 4. Batches ────────────────────────────────────────────────────────────
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

  // ── 5. Aggregate ──────────────────────────────────────────────────────────
  const groups = new Map<string, {
    profile_id: string; batch_id: string;
    subs: { submission_id: string; review_status: string }[];
  }>();

  for (const s of submissions) {
    const key = `${s.profile_id}__${s.batch_id}`;
    const g = groups.get(key) ?? { profile_id: s.profile_id, batch_id: s.batch_id, subs: [] };
    g.subs.push({ submission_id: s.submission_id, review_status: s.review_status });
    groups.set(key, g);
  }

  const exported_at = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const g of groups.values()) {
    const batch_code       = codeByBatch.get(g.batch_id)     ?? g.batch_id;
    const participant_code = codeByProfile.get(g.profile_id) ?? g.profile_id;

    // Apply batch filter
    if (batchFilter && batch_code !== batchFilter) continue;

    let totalScore = 0, maxScore = 0;
    const seenKeys = new Set<string>();
    for (const sub of g.subs) {
      for (const r of rubricBySubId.get(sub.submission_id) ?? []) {
        totalScore += r.criterion_score;
        maxScore   += r.max_criterion_score;
        seenKeys.add(r.criterion_key);
      }
    }

    const reviewed_count    = g.subs.filter((s) => s.review_status === "completed").length;
    const is_teacher_reviewed = reviewed_count > 0;
    const hasAll            = CANONICAL_KEYS.every((k) => seenKeys.has(k));
    const total_2c3l_score  = hasAll && maxScore > 0
      ? Math.round((totalScore / maxScore) * 10000) / 100 : null;
    const at_risk           = total_2c3l_score !== null
      ? (total_2c3l_score < AT_RISK_THRESHOLD ? 1 : 0) : null;

    const label_validity = is_teacher_reviewed && total_2c3l_score !== null
      ? "teacher_reviewed"
      : total_2c3l_score !== null
      ? "pilot_only"
      : "invalid";

    // Apply validity filter
    if (validity !== "all" && label_validity !== validity) continue;

    rows.push({
      participant_code,
      batch_code,
      submission_count: g.subs.length,
      reviewed_count,
      criteria_filled: seenKeys.size,
      total_2c3l_score: total_2c3l_score ?? "",
      at_risk:          at_risk ?? "",
      is_teacher_reviewed,
      label_source:  is_teacher_reviewed ? "teacher_reviewed" : seenKeys.size > 0 ? "proxy_behavioral" : "no_rubric",
      label_validity,
      exported_at,
    });
  }

  // Sort: teacher-reviewed first
  rows.sort((a, b) => {
    if (a.label_validity !== b.label_validity) {
      const order = { teacher_reviewed: 0, pilot_only: 1, invalid: 2 };
      return (order[a.label_validity as keyof typeof order] ?? 3) -
             (order[b.label_validity as keyof typeof order] ?? 3);
    }
    return (Number(b.total_2c3l_score) || 0) - (Number(a.total_2c3l_score) || 0);
  });

  const date   = new Date().toISOString().slice(0, 10);
  const suffix = batchFilter ? `_${batchFilter}` : "";
  const filename = `labels_v1${suffix}_${date}.csv`;

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
