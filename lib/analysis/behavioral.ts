// Behavioral analysis step — learner engagement metrics.
//
// Computes 8 of the 14 behavioral features described in the Phase 4 research
// artifacts (lib/research-artifacts/phase4/). The remaining 6 features require
// an explicit feature-engineering decision from the research team:
//
//   Implemented (8):
//     total_sessions, total_attempts, correct_attempts, attempt_success_rate,
//     avg_session_duration_seconds, total_events, error_rate, submission_rate
//
//   Deferred — research decision required (6):
//     help_seeking_rate        (requires classification of event_type='help_view')
//     self_correction_rate     (requires event-sequence pattern: error → correction)
//     persistence_score        (composite metric — formula not in DB schema)
//     engagement_depth         (composite metric — formula not specified)
//     avg_inter_attempt_gap_s  (requires ordered attempt timestamps, not in schema)
//     hint_dependency_rate     (requires 'hint' event classification)
//
// Data source: trn_learning_sessions, trn_attempts, trn_event_logs

import { supabaseAdmin } from "@/lib/supabase-admin";
import { DatasetNotFoundError, InsufficientDataError } from "./types";
import { fetchDataset, persistResult } from "./assessment";
import type { StepContext } from "./types";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface SessionRow {
  session_id: string;
  profile_id: string;
  duration_seconds: number | null;
  status: string;
}

interface AttemptRow {
  attempt_id: string;
  session_id: string;
  is_correct: boolean;
  attempt_type: string | null;
  error_type: string | null;
}

interface EventCountRow {
  session_id: string;
  event_count: number;
}

interface SubmissionCountRow {
  session_id: string;
  submission_count: number;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface BehavioralLearnerMetrics {
  profile_id: string;
  total_sessions: number;
  total_attempts: number;
  correct_attempts: number;
  attempt_success_rate: number;
  avg_session_duration_seconds: number;
  total_events: number;
  submission_count: number;
  submission_rate: number;
  error_attempt_count: number;
  error_rate: number;
  avg_attempts_per_session: number;
}

export interface BehavioralResult {
  schema_version: "1.0.0";
  computed_at: string;
  dataset_id: string;
  feature_version: "v1_partial";
  implemented_feature_count: 8;
  deferred_feature_count: 6;
  deferred_features: string[];
  learner_count: number;
  per_learner: BehavioralLearnerMetrics[];
  aggregate: {
    avg_total_sessions: number;
    avg_attempt_success_rate: number;
    avg_error_rate: number;
    avg_submission_rate: number;
    avg_session_duration_seconds: number;
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runBehavioralAnalysis(ctx: StepContext): Promise<void> {
  const { runId, datasetId, onHeartbeat } = ctx;

  const dataset = await fetchDataset(datasetId);
  if (!dataset.task_set_id) {
    throw new DatasetNotFoundError(
      datasetId,
      "task_set_id is null — dataset is not linked to an experiment batch",
    );
  }

  await onHeartbeat();

  const sessions = await fetchBehavioralSessions(dataset.task_set_id);
  if (sessions.length === 0) {
    throw new InsufficientDataError(
      `No learning sessions found for dataset ${datasetId} (batch: ${dataset.task_set_id}).`,
    );
  }

  const sessionIds = sessions.map((s) => s.session_id);

  await onHeartbeat();

  const [attempts, eventCounts, submissionCounts] = await Promise.all([
    fetchAttempts(sessionIds),
    fetchEventCounts(sessionIds),
    fetchSubmissionCounts(sessionIds),
  ]);

  await onHeartbeat();

  const result = computeBehavioralResult(datasetId, sessions, attempts, eventCounts, submissionCounts);
  await persistResult(runId, datasetId, "behavioral", result);
}

// ---------------------------------------------------------------------------
// Data fetch helpers
// ---------------------------------------------------------------------------

async function fetchBehavioralSessions(taskSetId: string): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id, duration_seconds, status")
    .eq("batch_id", taskSetId)
    .not("profile_id", "is", null);
  if (error) throw new Error(`Session fetch failed: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

async function fetchAttempts(sessionIds: string[]): Promise<AttemptRow[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_attempts")
    .select("attempt_id, session_id, is_correct, attempt_type, error_type")
    .in("session_id", sessionIds);
  if (error) throw new Error(`Attempt fetch failed: ${error.message}`);
  return (data ?? []) as AttemptRow[];
}

async function fetchEventCounts(sessionIds: string[]): Promise<EventCountRow[]> {
  if (sessionIds.length === 0) return [];
  // PostgREST group-by: fetch all events, aggregate in application layer
  // (PostgREST v11 count() requires a specific header; aggregate in app for reliability)
  const { data, error } = await supabaseAdmin
    .from("trn_event_logs")
    .select("session_id")
    .in("session_id", sessionIds);
  if (error) throw new Error(`Event fetch failed: ${error.message}`);
  const raw = (data ?? []) as { session_id: string }[];
  const countMap = new Map<string, number>();
  for (const row of raw) {
    countMap.set(row.session_id, (countMap.get(row.session_id) ?? 0) + 1);
  }
  return Array.from(countMap.entries()).map(([session_id, event_count]) => ({
    session_id,
    event_count,
  }));
}

async function fetchSubmissionCounts(sessionIds: string[]): Promise<SubmissionCountRow[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_submissions")
    .select("session_id")
    .in("session_id", sessionIds);
  if (error) throw new Error(`Submission count fetch failed: ${error.message}`);
  const raw = (data ?? []) as { session_id: string }[];
  const countMap = new Map<string, number>();
  for (const row of raw) {
    countMap.set(row.session_id, (countMap.get(row.session_id) ?? 0) + 1);
  }
  return Array.from(countMap.entries()).map(([session_id, submission_count]) => ({
    session_id,
    submission_count,
  }));
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeBehavioralResult(
  datasetId: string,
  sessions: SessionRow[],
  attempts: AttemptRow[],
  eventCounts: EventCountRow[],
  submissionCounts: SubmissionCountRow[],
): BehavioralResult {
  const eventCountMap = new Map(eventCounts.map((r) => [r.session_id, r.event_count]));
  const submissionCountMap = new Map(submissionCounts.map((r) => [r.session_id, r.submission_count]));

  const attemptsBySession = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const list = attemptsBySession.get(a.session_id) ?? [];
    list.push(a);
    attemptsBySession.set(a.session_id, list);
  }

  const sessionsByLearner = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (!s.profile_id) continue;
    const list = sessionsByLearner.get(s.profile_id) ?? [];
    list.push(s);
    sessionsByLearner.set(s.profile_id, list);
  }

  const perLearner: BehavioralLearnerMetrics[] = [];

  for (const [profileId, learnerSessions] of sessionsByLearner.entries()) {
    const sessionIdSet = new Set(learnerSessions.map((s) => s.session_id));

    const learnerAttempts = attempts.filter((a) => sessionIdSet.has(a.session_id));
    const totalAttempts = learnerAttempts.length;
    const correctAttempts = learnerAttempts.filter((a) => a.is_correct).length;
    const errorAttempts = learnerAttempts.filter((a) => !a.is_correct).length;

    const totalEvents = Array.from(sessionIdSet).reduce(
      (sum, sid) => sum + (eventCountMap.get(sid) ?? 0),
      0,
    );

    const sessionsWithSubmission = Array.from(sessionIdSet).filter(
      (sid) => (submissionCountMap.get(sid) ?? 0) > 0,
    ).length;

    const totalSubmissions = Array.from(sessionIdSet).reduce(
      (sum, sid) => sum + (submissionCountMap.get(sid) ?? 0),
      0,
    );

    const durationsWithValue = learnerSessions
      .map((s) => s.duration_seconds)
      .filter((d): d is number => d !== null && d !== undefined && d >= 0);

    const avgDuration =
      durationsWithValue.length > 0
        ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length
        : 0;

    const totalSessions = learnerSessions.length;

    perLearner.push({
      profile_id: profileId,
      total_sessions: totalSessions,
      total_attempts: totalAttempts,
      correct_attempts: correctAttempts,
      attempt_success_rate: r2(totalAttempts > 0 ? correctAttempts / totalAttempts : 0),
      avg_session_duration_seconds: r2(avgDuration),
      total_events: totalEvents,
      submission_count: totalSubmissions,
      submission_rate: r2(totalSessions > 0 ? sessionsWithSubmission / totalSessions : 0),
      error_attempt_count: errorAttempts,
      error_rate: r2(totalAttempts > 0 ? errorAttempts / totalAttempts : 0),
      avg_attempts_per_session: r2(totalSessions > 0 ? totalAttempts / totalSessions : 0),
    });
  }

  perLearner.sort((a, b) => a.profile_id.localeCompare(b.profile_id));

  const n = perLearner.length;
  const aggregate =
    n === 0
      ? {
          avg_total_sessions: 0,
          avg_attempt_success_rate: 0,
          avg_error_rate: 0,
          avg_submission_rate: 0,
          avg_session_duration_seconds: 0,
        }
      : {
          avg_total_sessions: r2(perLearner.reduce((s, l) => s + l.total_sessions, 0) / n),
          avg_attempt_success_rate: r2(
            perLearner.reduce((s, l) => s + l.attempt_success_rate, 0) / n,
          ),
          avg_error_rate: r2(perLearner.reduce((s, l) => s + l.error_rate, 0) / n),
          avg_submission_rate: r2(perLearner.reduce((s, l) => s + l.submission_rate, 0) / n),
          avg_session_duration_seconds: r2(
            perLearner.reduce((s, l) => s + l.avg_session_duration_seconds, 0) / n,
          ),
        };

  return {
    schema_version: "1.0.0",
    computed_at: new Date().toISOString(),
    dataset_id: datasetId,
    feature_version: "v1_partial",
    implemented_feature_count: 8,
    deferred_feature_count: 6,
    deferred_features: [
      "help_seeking_rate",
      "self_correction_rate",
      "persistence_score",
      "engagement_depth",
      "avg_inter_attempt_gap_s",
      "hint_dependency_rate",
    ],
    learner_count: n,
    per_learner: perLearner,
    aggregate,
  };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
