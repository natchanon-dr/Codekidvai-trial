import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeResult,
  fetchDataset,
  fetchSessions,
  fetchSubmissions,
  fetchRubricScores,
  runAssessmentAnalysis,
  persistResult,
} from "@/lib/analysis/assessment";
import { DatasetNotFoundError, InsufficientDataError } from "@/lib/analysis/types";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mockFrom },
}));

/** Build a chainable Supabase query object that resolves to `result` when awaited
 *  or when `.maybySingle()` / `.single()` is called. */
function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    upsert: vi.fn(() => p),
    maybySingle: vi.fn(() => p),
    maybeSingle: vi.fn(() => p),
    single: vi.fn(() => p),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      p.then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => p.catch(reject),
  };
  // All filter methods return the same chain except the terminal ones above
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue({ ...chain, then: chain.then, catch: chain.catch });
  chain.in = vi.fn().mockReturnValue({ ...chain, then: chain.then, catch: chain.catch });
  return chain;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATASET_ID = "dataset-uuid-1";
const RUN_ID = "run-uuid-1";
const TASK_SET_ID = "batch-uuid-1";

const DATASET_ROW = { id: DATASET_ID, task_set_id: TASK_SET_ID, task_id: null, active: true };

const SESSIONS = [
  { session_id: "s1", profile_id: "p1" },
  { session_id: "s2", profile_id: "p2" },
];

const SUBMISSIONS = [
  { submission_id: "sub1", session_id: "s1", profile_id: "p1", final_score: 80, is_passed: true },
  { submission_id: "sub2", session_id: "s2", profile_id: "p2", final_score: 40, is_passed: false },
];

const RUBRIC_SCORES = [
  { submission_id: "sub1", criterion_key: "correctness", criterion_score: 8, max_criterion_score: 10 },
  { submission_id: "sub1", criterion_key: "style", criterion_score: 4, max_criterion_score: 5 },
  { submission_id: "sub2", criterion_key: "correctness", criterion_score: 3, max_criterion_score: 10 },
  { submission_id: "sub2", criterion_key: "style", criterion_score: 2, max_criterion_score: 5 },
];

const NO_CTX = { runId: RUN_ID, datasetId: DATASET_ID, onHeartbeat: vi.fn().mockResolvedValue(undefined) };

// ---------------------------------------------------------------------------
// computeResult — pure unit tests (no Supabase)
// ---------------------------------------------------------------------------

describe("computeResult", () => {
  it("computes learner_count from unique profile_ids", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, RUBRIC_SCORES);
    expect(result.learner_count).toBe(2);
  });

  it("computes pass_rate correctly", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, RUBRIC_SCORES);
    expect(result.pass_count).toBe(1);
    expect(result.pass_rate).toBe(0.5);
  });

  it("computes avg, min, max, median score", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, RUBRIC_SCORES);
    expect(result.avg_score).toBe(60);
    expect(result.min_score).toBe(40);
    expect(result.max_score).toBe(80);
    expect(result.median_score).toBe(60);
  });

  it("produces score_distribution with 10 bins", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, RUBRIC_SCORES);
    expect(result.score_distribution).toHaveLength(10);
    const total = result.score_distribution.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(SUBMISSIONS.length);
  });

  it("computes rubric_breakdown grouped by criterion_key", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, RUBRIC_SCORES);
    const keys = result.rubric_breakdown.map((r) => r.criterion_key).sort();
    expect(keys).toEqual(["correctness", "style"]);
    const correctness = result.rubric_breakdown.find((r) => r.criterion_key === "correctness");
    expect(correctness?.avg_score).toBe(5.5); // (8+3)/2
    expect(correctness?.max_possible).toBe(10);
    expect(correctness?.avg_pct).toBe(0.55);
    expect(correctness?.submission_count).toBe(2);
  });

  it("handles empty rubric scores gracefully", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, []);
    expect(result.rubric_breakdown).toHaveLength(0);
  });

  it("handles single submission (median = that score)", () => {
    const result = computeResult(
      DATASET_ID,
      [SESSIONS[0]],
      [SUBMISSIONS[0]],
      RUBRIC_SCORES.filter((r) => r.submission_id === "sub1"),
    );
    expect(result.median_score).toBe(80);
    expect(result.submission_count).toBe(1);
  });

  it("attaches schema_version and dataset_id", () => {
    const result = computeResult(DATASET_ID, SESSIONS, SUBMISSIONS, RUBRIC_SCORES);
    expect(result.schema_version).toBe("1.0.0");
    expect(result.dataset_id).toBe(DATASET_ID);
    expect(result.computed_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// fetchDataset
// ---------------------------------------------------------------------------

describe("fetchDataset", () => {
  beforeEach(() => mockFrom.mockReset());

  it("returns the dataset row", async () => {
    mockFrom.mockReturnValue(makeChain({ data: DATASET_ROW, error: null }));
    const result = await fetchDataset(DATASET_ID);
    expect(result.task_set_id).toBe(TASK_SET_ID);
  });

  it("throws DatasetNotFoundError when data is null", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
    await expect(fetchDataset(DATASET_ID)).rejects.toBeInstanceOf(DatasetNotFoundError);
  });

  it("throws Error on Supabase error", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "DB error" } }));
    await expect(fetchDataset(DATASET_ID)).rejects.toThrow("Dataset fetch failed");
  });
});

// ---------------------------------------------------------------------------
// runAssessmentAnalysis — integration (mocked Supabase)
// ---------------------------------------------------------------------------

describe("runAssessmentAnalysis", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    vi.mocked(NO_CTX.onHeartbeat).mockResolvedValue(undefined);
  });

  function enqueueResults(results: Array<{ data: unknown; error: unknown }>) {
    const queue = [...results];
    mockFrom.mockImplementation(() => makeChain(queue.shift() ?? { data: null, error: null }));
  }

  it("succeeds with valid data and persists result", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },         // fetchDataset
      { data: SESSIONS, error: null },             // fetchSessions
      { data: SUBMISSIONS, error: null },          // fetchSubmissions
      { data: RUBRIC_SCORES, error: null },        // fetchRubricScores
      { data: null, error: null },                 // persistResult (upsert)
    ]);

    await expect(runAssessmentAnalysis(NO_CTX)).resolves.toBeUndefined();
    expect(NO_CTX.onHeartbeat).toHaveBeenCalledTimes(4);
  });

  it("throws DatasetNotFoundError when task_set_id is null (non-retryable)", async () => {
    enqueueResults([{ data: { ...DATASET_ROW, task_set_id: null }, error: null }]);
    const err = await runAssessmentAnalysis(NO_CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatasetNotFoundError);
    expect((err as DatasetNotFoundError).nonRetryable).toBe(true);
  });

  it("throws InsufficientDataError when no sessions exist (non-retryable)", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },
      { data: [], error: null },
    ]);
    const err = await runAssessmentAnalysis(NO_CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientDataError);
    expect((err as InsufficientDataError).nonRetryable).toBe(true);
  });

  it("throws InsufficientDataError when no submissions exist (non-retryable)", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },
      { data: SESSIONS, error: null },
      { data: [], error: null },
    ]);
    const err = await runAssessmentAnalysis(NO_CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientDataError);
  });

  it("throws retryable Error when Supabase fails on sessions fetch", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },
      { data: null, error: { message: "connection timeout" } },
    ]);
    const err = await runAssessmentAnalysis(NO_CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // NOT NonRetryableAnalysisError — connection timeouts should retry
    expect((err as { nonRetryable?: boolean }).nonRetryable).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// persistResult — idempotency
// ---------------------------------------------------------------------------

describe("persistResult", () => {
  beforeEach(() => mockFrom.mockReset());

  it("calls upsert with correct idempotency_key", async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ upsert: upsertSpy });

    await persistResult(RUN_ID, DATASET_ID, "assessment", { dummy: true });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotency_key: `${RUN_ID}:assessment`,
        analysis_type: "assessment",
        run_id: RUN_ID,
        dataset_id: DATASET_ID,
      }),
      expect.objectContaining({ onConflict: "idempotency_key", ignoreDuplicates: true }),
    );
  });

  it("throws on Supabase error", async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ data: null, error: { message: "disk full" } }),
    });
    await expect(persistResult(RUN_ID, DATASET_ID, "assessment", {})).rejects.toThrow(
      "Result persistence failed",
    );
  });
});
