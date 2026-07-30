// Assessment analysis step — rubric score aggregation.
//
// Queries trn_submissions and trn_submission_rubric_scores for all learners
// in the dataset's experiment batch, then computes pass rate, score distribution,
// and per-criterion rubric breakdown.
//
// Result is persisted to mst_pipeline_run_results with an idempotency key so
// that worker retries produce at most one row per (run_id, analysis_type).

import { supabaseAdmin } from "@/lib/supabase-admin";
import { DatasetNotFoundError, InsufficientDataError } from "./types";
import type { StepContext } from "./types";

// ---------------------------------------------------------------------------
// Row shapes (DB → app boundary)
// ---------------------------------------------------------------------------

interface DatasetRow {
  id: string;
  task_set_id: string | null;
  active: boolean;
}

interface SessionRow {
  session_id: string;
  profile_id: string;
}

interface SubmissionRow {
  submission_id: string;
  session_id: string;
  profile_id: string;
  final_score: number | null;
  is_passed: boolean;
}

interface RubricScoreRow {
  submission_id: string;
  criterion_key: string;
  criterion_score: number;
  max_criterion_score: number;
}

// ---------------------------------------------------------------------------
// Result shape (persisted to mst_pipeline_run_results.result)
// ---------------------------------------------------------------------------

export interface AssessmentResult {
  schema_version: "1.0.0";
  computed_at: string;
  dataset_id: string;
  learner_count: number;
  submission_count: number;
  pass_count: number;
  pass_rate: number;
  avg_score: number;
  min_score: number;
  max_score: number;
  median_score: number;
  score_distribution: Array<{ bin_min: number; bin_max: number; count: number }>;
  rubric_breakdown: Array<{
    criterion_key: string;
    avg_score: number;
    max_possible: number;
    avg_pct: number;
    submission_count: number;
  }>;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runAssessmentAnalysis(ctx: StepContext): Promise<void> {
  const { runId, datasetId, onHeartbeat } = ctx;

  const dataset = await fetchDataset(datasetId);
  if (!dataset.task_set_id) {
    throw new DatasetNotFoundError(
      datasetId,
      "task_set_id is null — dataset is not linked to an experiment batch",
    );
  }

  await onHeartbeat();

  const sessions = await fetchSessions(dataset.task_set_id);
  if (sessions.length === 0) {
    throw new InsufficientDataError(
      `No learning sessions found for dataset ${datasetId} (batch: ${dataset.task_set_id}). ` +
        "Run a teaching session with this dataset before running assessment analysis.",
    );
  }

  await onHeartbeat();

  const sessionIds = sessions.map((s) => s.session_id);
  const submissions = await fetchSubmissions(sessionIds);
  if (submissions.length === 0) {
    throw new InsufficientDataError(
      `No submissions found for dataset ${datasetId}. ` +
        "Learners must submit answers before assessment metrics can be computed.",
    );
  }

  await onHeartbeat();

  const submissionIds = submissions.map((s) => s.submission_id);
  const rubricScores = await fetchRubricScores(submissionIds);

  await onHeartbeat();

  const result = computeResult(datasetId, sessions, submissions, rubricScores);
  await persistResult(runId, datasetId, "assessment", result);
}

// ---------------------------------------------------------------------------
// Data fetch helpers
// ---------------------------------------------------------------------------

export async function fetchDataset(datasetId: string): Promise<DatasetRow> {
  const { data, error } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, task_set_id, active")
    .eq("id", datasetId)
    .maybeSingle();
  if (error) throw new Error(`Dataset fetch failed: ${error.message}`);
  if (!data) throw new DatasetNotFoundError(datasetId, "not found in mst_datasets");
  return data as DatasetRow;
}

export async function fetchSessions(taskSetId: string): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id")
    .eq("batch_id", taskSetId)
    .not("profile_id", "is", null);
  if (error) throw new Error(`Session fetch failed: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

export async function fetchSubmissions(sessionIds: string[]): Promise<SubmissionRow[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, session_id, profile_id, final_score, is_passed")
    .in("session_id", sessionIds);
  if (error) throw new Error(`Submission fetch failed: ${error.message}`);
  return (data ?? []) as SubmissionRow[];
}

export async function fetchRubricScores(submissionIds: string[]): Promise<RubricScoreRow[]> {
  if (submissionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_submission_rubric_scores")
    .select("submission_id, criterion_key, criterion_score, max_criterion_score")
    .in("submission_id", submissionIds);
  if (error) throw new Error(`Rubric score fetch failed: ${error.message}`);
  return (data ?? []) as RubricScoreRow[];
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeResult(
  datasetId: string,
  sessions: SessionRow[],
  submissions: SubmissionRow[],
  rubricScores: RubricScoreRow[],
): AssessmentResult {
  const learnerIds = new Set(sessions.map((s) => s.profile_id).filter(Boolean));

  const scores = submissions
    .map((s) => s.final_score)
    .filter((s): s is number => s !== null && s !== undefined);

  const passCount = submissions.filter((s) => s.is_passed).length;
  const passRate = submissions.length > 0 ? passCount / submissions.length : 0;

  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const min = scores.length > 0 ? Math.min(...scores) : 0;
  const max = scores.length > 0 ? Math.max(...scores) : 0;

  const sorted = [...scores].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

  const upperBound = max > 0 ? max : 100;
  const scoreDistribution = computeDistribution(scores, upperBound, 10);

  const rubricMap = new Map<string, { scores: number[]; maxPossible: number }>();
  for (const rs of rubricScores) {
    const existing = rubricMap.get(rs.criterion_key);
    if (existing) {
      existing.scores.push(rs.criterion_score);
      existing.maxPossible = Math.max(existing.maxPossible, rs.max_criterion_score);
    } else {
      rubricMap.set(rs.criterion_key, {
        scores: [rs.criterion_score],
        maxPossible: rs.max_criterion_score,
      });
    }
  }

  const rubricBreakdown = Array.from(rubricMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([criterion_key, { scores: cScores, maxPossible }]) => {
      const avgScore = cScores.reduce((a, b) => a + b, 0) / cScores.length;
      return {
        criterion_key,
        avg_score: r2(avgScore),
        max_possible: maxPossible,
        avg_pct: r2(maxPossible > 0 ? avgScore / maxPossible : 0),
        submission_count: cScores.length,
      };
    });

  return {
    schema_version: "1.0.0",
    computed_at: new Date().toISOString(),
    dataset_id: datasetId,
    learner_count: learnerIds.size,
    submission_count: submissions.length,
    pass_count: passCount,
    pass_rate: r2(passRate),
    avg_score: r2(avg),
    min_score: r2(min),
    max_score: r2(max),
    median_score: r2(median),
    score_distribution: scoreDistribution,
    rubric_breakdown: rubricBreakdown,
  };
}

function computeDistribution(
  scores: number[],
  upperBound: number,
  binCount: number,
): Array<{ bin_min: number; bin_max: number; count: number }> {
  const bins = Array.from({ length: binCount }, (_, i) => ({
    bin_min: r2((i / binCount) * upperBound),
    bin_max: r2(((i + 1) / binCount) * upperBound),
    count: 0,
  }));

  for (const score of scores) {
    const pct = upperBound > 0 ? score / upperBound : 0;
    const idx = Math.min(Math.floor(pct * binCount), binCount - 1);
    bins[idx].count++;
  }

  return bins;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function persistResult(
  runId: string,
  datasetId: string,
  analysisType: string,
  result: unknown,
): Promise<void> {
  const { error } = await supabaseAdmin.from("mst_pipeline_run_results").upsert(
    {
      run_id: runId,
      dataset_id: datasetId,
      analysis_type: analysisType,
      idempotency_key: `${runId}:${analysisType}`,
      result,
      schema_version: "1.0.0",
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Result persistence failed for ${analysisType}: ${error.message}`);
}
