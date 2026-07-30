// Sequential analysis step — event sequence statistics.
//
// Extracts event sequences from trn_event_logs and computes frequency statistics
// derivable from the database schema alone. ML model inference (LSTM/GRU, TAG
// graph) is explicitly deferred pending a production ML serving endpoint.
//
// Implemented (DB-derivable):
//   event_type_frequencies, sequence_length distribution, event bigrams,
//   per-learner summary statistics
//
// Deferred — ML runtime required:
//   LSTM/GRU sequential risk prediction (Phase 4 NB05-NB09 Python notebooks)
//   TAG graph analysis (Phase 4 bssa_features.sequential)
//   Predicted risk score per learner
//
// Data source: trn_learning_sessions, trn_event_logs

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
}

interface EventRow {
  session_id: string;
  event_type: string;
  event_order: number | null;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface SequentialResult {
  schema_version: "1.0.0";
  computed_at: string;
  dataset_id: string;
  computation_scope: "event_frequency_statistics";
  ml_model_inference: "deferred";
  deferred_reason: string;
  learner_count: number;
  session_count: number;
  total_events: number;
  event_type_frequencies: Array<{ event_type: string; count: number; pct: number }>;
  avg_sequence_length: number;
  max_sequence_length: number;
  min_sequence_length: number;
  sequence_length_distribution: Array<{ bin: number; count: number }>;
  event_bigrams: Array<{ from: string; to: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runSequentialAnalysis(ctx: StepContext): Promise<void> {
  const { runId, datasetId, onHeartbeat } = ctx;

  const dataset = await fetchDataset(datasetId);
  if (!dataset.task_set_id) {
    throw new DatasetNotFoundError(
      datasetId,
      "task_set_id is null — dataset is not linked to an experiment batch",
    );
  }

  await onHeartbeat();

  const sessions = await fetchSequentialSessions(dataset.task_set_id);
  if (sessions.length === 0) {
    throw new InsufficientDataError(
      `No learning sessions found for dataset ${datasetId} (batch: ${dataset.task_set_id}).`,
    );
  }

  const sessionIds = sessions.map((s) => s.session_id);

  await onHeartbeat();

  const events = await fetchEvents(sessionIds);
  if (events.length === 0) {
    throw new InsufficientDataError(
      `No event log entries found for dataset ${datasetId}. ` +
        "Sequential analysis requires interaction events from trn_event_logs.",
    );
  }

  await onHeartbeat();

  const result = computeSequentialResult(datasetId, sessions, events);
  await persistResult(runId, datasetId, "sequential", result);
}

// ---------------------------------------------------------------------------
// Data fetch helpers
// ---------------------------------------------------------------------------

async function fetchSequentialSessions(taskSetId: string): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id")
    .eq("batch_id", taskSetId)
    .not("profile_id", "is", null);
  if (error) throw new Error(`Session fetch failed: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

async function fetchEvents(sessionIds: string[]): Promise<EventRow[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_event_logs")
    .select("session_id, event_type, event_order")
    .in("session_id", sessionIds)
    .order("session_id", { ascending: true })
    .order("event_order", { ascending: true });
  if (error) throw new Error(`Event fetch failed: ${error.message}`);
  return (data ?? []) as EventRow[];
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeSequentialResult(
  datasetId: string,
  sessions: SessionRow[],
  events: EventRow[],
): SequentialResult {
  const learnerIds = new Set(sessions.map((s) => s.profile_id).filter(Boolean));

  // Group events by session to compute sequence lengths
  const eventsBySession = new Map<string, string[]>();
  for (const e of events) {
    const seq = eventsBySession.get(e.session_id) ?? [];
    seq.push(e.event_type);
    eventsBySession.set(e.session_id, seq);
  }

  const sessionCount = eventsBySession.size;
  const sequenceLengths = Array.from(eventsBySession.values()).map((s) => s.length);
  const totalEvents = sequenceLengths.reduce((a, b) => a + b, 0);

  const avgLen =
    sequenceLengths.length > 0
      ? sequenceLengths.reduce((a, b) => a + b, 0) / sequenceLengths.length
      : 0;
  const maxLen = sequenceLengths.length > 0 ? Math.max(...sequenceLengths) : 0;
  const minLen = sequenceLengths.length > 0 ? Math.min(...sequenceLengths) : 0;

  // Event type frequencies
  const freqMap = new Map<string, number>();
  for (const e of events) {
    freqMap.set(e.event_type, (freqMap.get(e.event_type) ?? 0) + 1);
  }
  const eventTypeFrequencies = Array.from(freqMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([event_type, count]) => ({
      event_type,
      count,
      pct: r2(totalEvents > 0 ? count / totalEvents : 0),
    }));

  // Sequence length distribution (bins of size 5)
  const BIN_SIZE = 5;
  const lengthDistMap = new Map<number, number>();
  for (const len of sequenceLengths) {
    const bin = Math.floor(len / BIN_SIZE) * BIN_SIZE;
    lengthDistMap.set(bin, (lengthDistMap.get(bin) ?? 0) + 1);
  }
  const sequenceLengthDistribution = Array.from(lengthDistMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([bin, count]) => ({ bin, count }));

  // Event bigrams (A → B transition counts)
  const bigramMap = new Map<string, number>();
  for (const seq of eventsBySession.values()) {
    for (let i = 0; i < seq.length - 1; i++) {
      const key = `${seq[i]}→${seq[i + 1]}`;
      bigramMap.set(key, (bigramMap.get(key) ?? 0) + 1);
    }
  }
  const eventBigrams = Array.from(bigramMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50) // cap at top-50 to keep JSONB size bounded
    .map((entry) => {
      const [from, to] = entry[0].split("→");
      return { from, to, count: entry[1] };
    });

  return {
    schema_version: "1.0.0",
    computed_at: new Date().toISOString(),
    dataset_id: datasetId,
    computation_scope: "event_frequency_statistics",
    ml_model_inference: "deferred",
    deferred_reason:
      "LSTM/GRU model inference and TAG graph analysis require the Phase 4 Python " +
      "research notebooks (NB05-NB09). A production ML serving endpoint is not " +
      "available in this repository. Implement Phase 4 model export + inference " +
      "API before enabling ML-based sequential risk prediction.",
    learner_count: learnerIds.size,
    session_count: sessionCount,
    total_events: totalEvents,
    event_type_frequencies: eventTypeFrequencies,
    avg_sequence_length: r2(avgLen),
    max_sequence_length: maxLen,
    min_sequence_length: minLen,
    sequence_length_distribution: sequenceLengthDistribution,
    event_bigrams: eventBigrams,
  };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
