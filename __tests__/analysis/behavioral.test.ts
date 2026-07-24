import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeBehavioralResult, runBehavioralAnalysis } from "@/lib/analysis/behavioral";
import { DatasetNotFoundError, InsufficientDataError } from "@/lib/analysis/types";

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
  return chain;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATASET_ID = "dataset-b1";
const RUN_ID = "run-b1";

const DATASET_ROW = { id: DATASET_ID, task_set_id: "batch-b1", task_id: null, active: true };

const SESSIONS = [
  { session_id: "s1", profile_id: "p1", duration_seconds: 120, status: "completed" },
  { session_id: "s2", profile_id: "p1", duration_seconds: 180, status: "completed" },
  { session_id: "s3", profile_id: "p2", duration_seconds: 60, status: "completed" },
];

const ATTEMPTS = [
  { attempt_id: "a1", session_id: "s1", is_correct: true, attempt_type: "code", error_type: null },
  { attempt_id: "a2", session_id: "s1", is_correct: false, attempt_type: "code", error_type: "syntax" },
  { attempt_id: "a3", session_id: "s2", is_correct: true, attempt_type: "code", error_type: null },
  { attempt_id: "a4", session_id: "s3", is_correct: false, attempt_type: "code", error_type: "logic" },
];

// fetchEventCounts returns raw {session_id} rows — one per event
const EVENTS = [
  { session_id: "s1" },
  { session_id: "s1" },
  { session_id: "s1" },
  { session_id: "s2" },
  { session_id: "s2" },
  { session_id: "s3" },
];

const SUBMISSION_ROWS = [
  { session_id: "s1" },
  { session_id: "s2" },
];

const CTX = { runId: RUN_ID, datasetId: DATASET_ID, onHeartbeat: vi.fn().mockResolvedValue(undefined) };

// ---------------------------------------------------------------------------
// computeBehavioralResult — pure unit tests
// ---------------------------------------------------------------------------

describe("computeBehavioralResult", () => {
  const eventCounts = [
    { session_id: "s1", event_count: 3 },
    { session_id: "s2", event_count: 2 },
    { session_id: "s3", event_count: 1 },
  ];
  const submissionCounts = [
    { session_id: "s1", submission_count: 1 },
    { session_id: "s2", submission_count: 1 },
  ];

  it("groups metrics by learner correctly", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    expect(result.learner_count).toBe(2);
    expect(result.per_learner).toHaveLength(2);
  });

  it("computes correct total_attempts for p1 (sessions s1+s2)", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    const p1 = result.per_learner.find((l) => l.profile_id === "p1")!;
    expect(p1.total_sessions).toBe(2);
    expect(p1.total_attempts).toBe(3); // a1, a2, a3
    expect(p1.correct_attempts).toBe(2);
    expect(p1.attempt_success_rate).toBe(0.67);
  });

  it("computes error_rate for p2", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    const p2 = result.per_learner.find((l) => l.profile_id === "p2")!;
    expect(p2.error_rate).toBe(1); // 1 attempt, 0 correct
    expect(p2.total_events).toBe(1);
  });

  it("computes avg_session_duration_seconds for p1", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    const p1 = result.per_learner.find((l) => l.profile_id === "p1")!;
    expect(p1.avg_session_duration_seconds).toBe(150); // (120+180)/2
  });

  it("computes submission_rate for p1 (both sessions have submission)", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    const p1 = result.per_learner.find((l) => l.profile_id === "p1")!;
    expect(p1.submission_rate).toBe(1); // 2 sessions, 2 with submission
  });

  it("computes submission_rate=0 for p2 (no submission)", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    const p2 = result.per_learner.find((l) => l.profile_id === "p2")!;
    expect(p2.submission_rate).toBe(0);
  });

  it("lists deferred features", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    expect(result.deferred_features).toHaveLength(6);
    expect(result.deferred_features).toContain("help_seeking_rate");
    expect(result.deferred_feature_count).toBe(6);
    expect(result.implemented_feature_count).toBe(8);
  });

  it("computes aggregate averages", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, ATTEMPTS, eventCounts, submissionCounts);
    expect(result.aggregate.avg_total_sessions).toBe(1.5); // (2+1)/2
    expect(result.aggregate.avg_submission_rate).toBeCloseTo(0.5); // (1+0)/2
  });

  it("handles zero attempts gracefully", () => {
    const result = computeBehavioralResult(DATASET_ID, SESSIONS, [], eventCounts, submissionCounts);
    const p1 = result.per_learner.find((l) => l.profile_id === "p1")!;
    expect(p1.attempt_success_rate).toBe(0);
    expect(p1.error_rate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runBehavioralAnalysis — integration (mocked Supabase)
// ---------------------------------------------------------------------------

describe("runBehavioralAnalysis", () => {
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
    const err = await runBehavioralAnalysis(CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatasetNotFoundError);
  });

  it("throws InsufficientDataError when sessions is empty", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },
      { data: [], error: null },
    ]);
    const err = await runBehavioralAnalysis(CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientDataError);
  });

  it("succeeds with valid data", async () => {
    enqueueResults([
      { data: DATASET_ROW, error: null },         // fetchDataset
      { data: SESSIONS, error: null },             // fetchBehavioralSessions
      { data: ATTEMPTS, error: null },             // fetchAttempts (Promise.all)
      { data: EVENTS, error: null },               // fetchEventCounts (Promise.all)
      { data: SUBMISSION_ROWS, error: null },      // fetchSubmissionCounts (Promise.all)
      { data: null, error: null },                 // persistResult
    ]);
    await expect(runBehavioralAnalysis(CTX)).resolves.toBeUndefined();
    expect(CTX.onHeartbeat).toHaveBeenCalledTimes(3);
  });
});
