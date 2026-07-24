import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeSequentialResult, runSequentialAnalysis } from "@/lib/analysis/sequential";
import { DatasetNotFoundError, InsufficientDataError, PhaseDeferredError } from "@/lib/analysis/types";
import { runSemanticAnalysis } from "@/lib/analysis/semantic";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mockFrom },
}));

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn(() => p),
    maybeSingle: vi.fn(() => p),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      p.then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => p.catch(reject),
  };
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue({ ...chain });
  chain.in = vi.fn().mockReturnValue({ ...chain });
  chain.order = vi.fn().mockReturnValue({ ...chain });
  return chain;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATASET_ID = "dataset-seq1";
const RUN_ID = "run-seq1";
const DATASET_ROW = { id: DATASET_ID, task_set_id: "batch-seq1", task_id: null, active: true };

const SESSIONS = [
  { session_id: "s1", profile_id: "p1" },
  { session_id: "s2", profile_id: "p2" },
];

const EVENTS = [
  { session_id: "s1", event_type: "sql_run", event_order: 1 },
  { session_id: "s1", event_type: "sql_error", event_order: 2 },
  { session_id: "s1", event_type: "sql_run", event_order: 3 },
  { session_id: "s1", event_type: "check_answer", event_order: 4 },
  { session_id: "s2", event_type: "sql_run", event_order: 1 },
  { session_id: "s2", event_type: "submit_answer", event_order: 2 },
];

const CTX = { runId: RUN_ID, datasetId: DATASET_ID, onHeartbeat: vi.fn().mockResolvedValue(undefined) };

// ---------------------------------------------------------------------------
// computeSequentialResult — pure unit tests
// ---------------------------------------------------------------------------

describe("computeSequentialResult", () => {
  it("counts total_events correctly", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    expect(result.total_events).toBe(6);
  });

  it("counts learners and sessions", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    expect(result.learner_count).toBe(2);
    expect(result.session_count).toBe(2);
  });

  it("computes event_type_frequencies sorted by count desc", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    const freq = result.event_type_frequencies;
    expect(freq[0].event_type).toBe("sql_run"); // appears 3 times
    expect(freq[0].count).toBe(3);
    expect(freq[0].pct).toBeCloseTo(0.5);
  });

  it("computes avg_sequence_length", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    expect(result.avg_sequence_length).toBe(3); // (4+2)/2
  });

  it("computes max_sequence_length and min_sequence_length", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    expect(result.max_sequence_length).toBe(4);
    expect(result.min_sequence_length).toBe(2);
  });

  it("computes bigrams correctly", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    const sqlRunToError = result.event_bigrams.find(
      (b) => b.from === "sql_run" && b.to === "sql_error",
    );
    expect(sqlRunToError?.count).toBe(1);
    const errorToRun = result.event_bigrams.find(
      (b) => b.from === "sql_error" && b.to === "sql_run",
    );
    expect(errorToRun?.count).toBe(1);
  });

  it("marks ml_model_inference as deferred", () => {
    const result = computeSequentialResult(DATASET_ID, SESSIONS, EVENTS);
    expect(result.ml_model_inference).toBe("deferred");
    expect(result.computation_scope).toBe("event_frequency_statistics");
    expect(result.deferred_reason).toBeTruthy();
  });

  it("handles single-event sequences (no bigrams for those)", () => {
    const events = [{ session_id: "s1", event_type: "sql_run", event_order: 1 }];
    const result = computeSequentialResult(DATASET_ID, [SESSIONS[0]], events);
    expect(result.event_bigrams).toHaveLength(0);
    expect(result.total_events).toBe(1);
  });

  it("caps bigrams at 50 entries", () => {
    // Generate 60 unique event types to create 60+ bigrams
    const manyEvents = Array.from({ length: 62 }, (_, i) => ({
      session_id: "s1",
      event_type: `evt_${i}`,
      event_order: i + 1,
    }));
    const result = computeSequentialResult(DATASET_ID, [SESSIONS[0]], manyEvents);
    expect(result.event_bigrams.length).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// runSequentialAnalysis — integration (mocked Supabase)
// ---------------------------------------------------------------------------

describe("runSequentialAnalysis", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    vi.mocked(CTX.onHeartbeat).mockClear().mockResolvedValue(undefined);
  });

  function enqueueResults(results: Array<{ data: unknown; error: unknown }>) {
    const queue = [...results];
    mockFrom.mockImplementation(() => makeChain(queue.shift() ?? { data: null, error: null }));
  }

  it("throws DatasetNotFoundError when task_set_id is null", async () => {
    enqueueResults([{ data: { ...DATASET_ROW, task_set_id: null }, error: null }]);
    await expect(runSequentialAnalysis(CTX)).rejects.toBeInstanceOf(DatasetNotFoundError);
  });

  it("throws InsufficientDataError when no sessions", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },
      { data: [], error: null },
    ]);
    await expect(runSequentialAnalysis(CTX)).rejects.toBeInstanceOf(InsufficientDataError);
  });

  it("throws InsufficientDataError when sessions exist but no events", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },
      { data: SESSIONS, error: null },
      { data: [], error: null },
    ]);
    await expect(runSequentialAnalysis(CTX)).rejects.toBeInstanceOf(InsufficientDataError);
  });

  it("succeeds with valid data", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },   // fetchDataset
      { data: SESSIONS, error: null },      // fetchSequentialSessions
      { data: EVENTS, error: null },        // fetchEvents
      { data: null, error: null },          // persistResult
    ]);
    await expect(runSequentialAnalysis(CTX)).resolves.toBeUndefined();
    expect(CTX.onHeartbeat).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// runSemanticAnalysis — always throws PhaseDeferredError (non-retryable)
// ---------------------------------------------------------------------------

describe("runSemanticAnalysis", () => {
  it("throws PhaseDeferredError immediately", async () => {
    const err = await runSemanticAnalysis(CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PhaseDeferredError);
    expect((err as PhaseDeferredError).nonRetryable).toBe(true);
    expect((err as PhaseDeferredError).reason).toBe("phase5_deferred");
  });
});
