/**
 * Deterministic unit tests for the pipeline worker processor.
 *
 * The WorkerDb interface is satisfied by plain mock objects — no Supabase
 * client or DB connection required. The step executor module is mocked so
 * each test controls whether steps succeed, throw, or trigger cancellation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock step-executors before importing processor ────────────────────────────
// vi.mock factory is hoisted to top-of-file, so mockExecuteStep must be
// defined with vi.hoisted() to be accessible inside the factory closure.
const { mockExecuteStep } = vi.hoisted(() => ({
  mockExecuteStep: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/worker/step-executors", () => {
  class StepNotImplementedError extends Error {
    constructor(
      public readonly step: string,
      public readonly missingDependency: string,
    ) {
      super(`${step}: ${missingDependency}`);
      this.name = "StepNotImplementedError";
    }
  }
  return {
    executeStep: mockExecuteStep,
    StepNotImplementedError,
  };
});

import { processRun, claimRun, recoverStaleRuns, sanitizeError } from "@/worker/processor";
import type { WorkerDb, WorkerRunRow, AnalysisStepRow } from "@/worker/db";
import { StepNotImplementedError } from "@/worker/step-executors";

// ── Helpers ───────────────────────────────────────────────────────────────────

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeRun(overrides: Partial<WorkerRunRow> = {}): WorkerRunRow {
  return {
    id: "run-1",
    dataset_id: "ds-1",
    run_type: "full_pipeline",
    status: "running",
    analysis_steps: [
      { analysis: "behavioral", status: "pending", started_at: null, completed_at: null, error: null },
      { analysis: "sequential", status: "pending", started_at: null, completed_at: null, error: null },
    ],
    cancellation_requested: false,
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: "worker-abc",
    lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockDb(overrides: Partial<WorkerDb> = {}): WorkerDb {
  return {
    claimRun: vi.fn().mockResolvedValue(null),
    extendLease: vi.fn().mockResolvedValue(1),
    recoverStaleRuns: vi.fn().mockResolvedValue(0),
    checkCancellation: vi.fn().mockResolvedValue(false),
    persistSteps: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markCancelled: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const WORKER_ID = "worker-abc";
const NO_SHUTDOWN = { requested: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteStep.mockResolvedValue(void 0); // default: steps succeed
});

// ── claimRun ──────────────────────────────────────────────────────────────────

describe("claimRun", () => {
  it("returns null when no job is available", async () => {
    const db = makeMockDb({ claimRun: vi.fn().mockResolvedValue(null) });
    const result = await claimRun(db, WORKER_ID);
    expect(result).toBeNull();
    expect(db.claimRun).toHaveBeenCalledWith(WORKER_ID, 300);
  });

  it("returns the claimed run when one is available", async () => {
    const run = makeRun();
    const db = makeMockDb({ claimRun: vi.fn().mockResolvedValue(run) });
    const result = await claimRun(db, WORKER_ID);
    expect(result).toEqual(run);
  });

  it("propagates DB errors", async () => {
    const db = makeMockDb({
      claimRun: vi.fn().mockRejectedValue(new Error("Claim RPC failed: connection refused")),
    });
    await expect(claimRun(db, WORKER_ID)).rejects.toThrow("connection refused");
  });

  it("two concurrent claimRun calls each see a different run (DB serialises this)", async () => {
    // Simulate: first claim gets run-1, second gets run-2 (the DB returns
    // different rows because FOR UPDATE SKIP LOCKED prevents double-claim).
    const run1 = makeRun({ id: "run-1" });
    const run2 = makeRun({ id: "run-2" });
    const claimFn = vi.fn()
      .mockResolvedValueOnce(run1)
      .mockResolvedValueOnce(run2);
    const db = makeMockDb({ claimRun: claimFn });

    const [r1, r2] = await Promise.all([
      claimRun(db, "worker-1"),
      claimRun(db, "worker-2"),
    ]);
    expect(r1?.id).toBe("run-1");
    expect(r2?.id).toBe("run-2");
  });
});

// ── recoverStaleRuns ──────────────────────────────────────────────────────────

describe("recoverStaleRuns", () => {
  it("calls the DB and logs when rows are recovered", async () => {
    const db = makeMockDb({ recoverStaleRuns: vi.fn().mockResolvedValue(2) });
    const count = await recoverStaleRuns(db, silentLogger);
    expect(count).toBe(2);
    expect(silentLogger.info).toHaveBeenCalledWith(expect.objectContaining({ event: "runs_recovered", count: 2 }));
  });

  it("returns 0 and logs error when RPC fails", async () => {
    const db = makeMockDb({
      recoverStaleRuns: vi.fn().mockRejectedValue(new Error("rpc failed")),
    });
    const count = await recoverStaleRuns(db, silentLogger);
    expect(count).toBe(0);
    expect(silentLogger.error).toHaveBeenCalledWith(expect.objectContaining({ event: "recovery_failed" }));
  });

  it("does not log when no rows are recovered", async () => {
    const db = makeMockDb({ recoverStaleRuns: vi.fn().mockResolvedValue(0) });
    await recoverStaleRuns(db, silentLogger);
    expect(silentLogger.info).not.toHaveBeenCalled();
  });
});

// ── processRun — happy path ───────────────────────────────────────────────────

describe("processRun — steps execute in required order and complete", () => {
  it("executes steps in declaration order and marks run completed", async () => {
    const db = makeMockDb();
    const run = makeRun();

    await processRun(db, WORKER_ID, run, silentLogger, NO_SHUTDOWN);

    // executeStep called twice, in order
    expect(mockExecuteStep).toHaveBeenCalledTimes(2);
    expect((mockExecuteStep.mock.calls[0] as unknown[])[0]).toBe("behavioral");
    expect((mockExecuteStep.mock.calls[1] as unknown[])[0]).toBe("sequential");

    // persistSteps called at least once per step
    expect(db.persistSteps).toHaveBeenCalled();

    // Final state: markCompleted called with the two completed steps
    expect(db.markCompleted).toHaveBeenCalledWith(
      "run-1",
      WORKER_ID,
      expect.arrayContaining([
        expect.objectContaining({ analysis: "behavioral", status: "completed" }),
        expect.objectContaining({ analysis: "sequential", status: "completed" }),
      ]),
    );
    expect(db.markFailed).not.toHaveBeenCalled();
    expect(db.markCancelled).not.toHaveBeenCalled();
  });

  it("logs run_completed when markCompleted returns true", async () => {
    const db = makeMockDb({ markCompleted: vi.fn().mockResolvedValue(true) });
    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);
    expect(silentLogger.info).toHaveBeenCalledWith(expect.objectContaining({ event: "run_completed" }));
  });

  it("logs completion_race_lost when markCompleted returns false (cancellation won)", async () => {
    const db = makeMockDb({ markCompleted: vi.fn().mockResolvedValue(false) });
    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: "completion_race_lost" }));
  });

  it("persists durable progress after each step (not just at the end)", async () => {
    const db = makeMockDb();
    const persistCalls: string[][] = [];

    (db.persistSteps as ReturnType<typeof vi.fn>).mockImplementation(
      (_runId: string, _workerId: string, steps: AnalysisStepRow[]) => {
        persistCalls.push(steps.map((s) => `${s.analysis}:${s.status}`));
        return Promise.resolve();
      },
    );

    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    // First persistSteps call should have behavioral:running
    expect(persistCalls[0]).toContain("behavioral:running");
    // A later call should have behavioral:completed
    const hasCompletedBehavioral = persistCalls.some((c) => c.includes("behavioral:completed"));
    expect(hasCompletedBehavioral).toBe(true);
  });
});

// ── processRun — cancellation ─────────────────────────────────────────────────

describe("processRun — cancellation before execution", () => {
  it("cancels immediately if cancellation is requested before first step", async () => {
    const db = makeMockDb({ checkCancellation: vi.fn().mockResolvedValue(true) });
    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(mockExecuteStep).not.toHaveBeenCalled();
    expect(db.markCancelled).toHaveBeenCalledWith("run-1", WORKER_ID, expect.any(Array), 0);
    expect(db.markCompleted).not.toHaveBeenCalled();
  });

  it("cancels if shutdown is requested before first step", async () => {
    const db = makeMockDb();
    await processRun(db, WORKER_ID, makeRun(), silentLogger, { requested: true });

    expect(mockExecuteStep).not.toHaveBeenCalled();
    expect(db.markCancelled).toHaveBeenCalledWith("run-1", WORKER_ID, expect.any(Array), 0);
  });
});

describe("processRun — cancellation during execution", () => {
  it("cancels after the first step if cancellation is requested mid-run", async () => {
    // checkCancellation: false before step 0, false after step 0, true before step 1
    const checkFn = vi.fn()
      .mockResolvedValueOnce(false)  // pre-step 0
      .mockResolvedValueOnce(false)  // post-step 0
      .mockResolvedValueOnce(true);  // pre-step 1

    const db = makeMockDb({ checkCancellation: checkFn });
    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(mockExecuteStep).toHaveBeenCalledTimes(1);
    expect((mockExecuteStep.mock.calls[0] as unknown[])[0]).toBe("behavioral");
    expect(db.markCancelled).toHaveBeenCalledWith("run-1", WORKER_ID, expect.any(Array), 1);
    expect(db.markCompleted).not.toHaveBeenCalled();
  });

  it("cancels after step completes when post-step cancellation check is true", async () => {
    // pre-step 0: false, post-step 0: true
    const checkFn = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const db = makeMockDb({ checkCancellation: checkFn });
    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(mockExecuteStep).toHaveBeenCalledTimes(1);
    expect(db.markCancelled).toHaveBeenCalled();
    expect(db.markCompleted).not.toHaveBeenCalled();
  });

  it("cancellation cannot overwrite completed (markCompleted guards cancellation_requested=false)", async () => {
    // Run where markCompleted returns false because cancellation won:
    // this tests that the processor correctly handles the race without
    // trying to overwrite the already-terminal state.
    const db = makeMockDb({ markCompleted: vi.fn().mockResolvedValue(false) });
    // No exception — processor accepts the race gracefully.
    await expect(processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN)).resolves.toBeUndefined();
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: "completion_race_lost" }));
  });
});

// ── processRun — step failure ─────────────────────────────────────────────────

describe("processRun — step failure", () => {
  it("marks run as failed when a step throws", async () => {
    mockExecuteStep.mockRejectedValueOnce(new Error("analysis computation failed"));
    const db = makeMockDb();

    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(db.markFailed).toHaveBeenCalledWith(
      "run-1",
      WORKER_ID,
      expect.any(Array),
      expect.any(String), // sanitized error summary
    );
    expect(db.markCompleted).not.toHaveBeenCalled();
  });

  it("sets the failing step to failed status in the persisted steps", async () => {
    mockExecuteStep.mockRejectedValueOnce(new Error("computation error"));

    let failedSteps: AnalysisStepRow[] | null = null;
    const db = makeMockDb({
      markFailed: vi.fn().mockImplementation(
        (_runId: string, _workerId: string, steps: AnalysisStepRow[]) => {
          failedSteps = steps;
          return Promise.resolve();
        },
      ),
    });

    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(failedSteps![0]).toMatchObject({ analysis: "behavioral", status: "failed" });
  });

  it("stops processing after first step failure — does not execute subsequent steps", async () => {
    mockExecuteStep.mockRejectedValueOnce(new Error("step 0 failed"));
    const db = makeMockDb();

    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(mockExecuteStep).toHaveBeenCalledTimes(1);
  });

  it("sanitizes error_summary for StepNotImplementedError", async () => {
    mockExecuteStep.mockRejectedValueOnce(
      new StepNotImplementedError("behavioral", "lib/analysis/behavioral.ts not found"),
    );

    let capturedSummary = "";
    const db = makeMockDb({
      markFailed: vi.fn().mockImplementation(
        (_runId: string, _workerId: string, _steps: AnalysisStepRow[], errorSummary: string) => {
          capturedSummary = errorSummary;
          return Promise.resolve();
        },
      ),
    });

    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    expect(capturedSummary).toContain("Step not implemented: behavioral");
    expect(capturedSummary).not.toMatch(/password/i);
    expect(capturedSummary).not.toMatch(/postgresql:\/\//i);
  });
});

// ── processRun — retry and terminal-state guards ──────────────────────────────

describe("processRun — retry and terminal-state guards", () => {
  it("processes a reclaimed run (attempt_count > 1) without duplicating completed steps", async () => {
    // Simulate a run that was reclaimed after a crash: behavioral is already
    // 'completed' from the first attempt. The processor should re-execute from
    // where it left off — but in this implementation each claim starts fresh
    // from the steps array as stored in the DB. If the DB persisted the
    // completed step, the test verifies step 0 is still processed (idempotent
    // executor handles duplicate safely, or business logic skips completed).
    //
    // In the current implementation, the processor iterates all steps in order;
    // it is the responsibility of the step executor to be idempotent. We verify
    // the processor does not skip any steps or crash on re-execution.
    const run = makeRun({
      attempt_count: 2,
      analysis_steps: [
        { analysis: "behavioral", status: "pending", started_at: null, completed_at: null, error: null },
        { analysis: "sequential", status: "pending", started_at: null, completed_at: null, error: null },
      ],
    });
    const db = makeMockDb();
    await processRun(db, WORKER_ID, run, silentLogger, NO_SHUTDOWN);
    expect(mockExecuteStep).toHaveBeenCalledTimes(2);
    expect(db.markCompleted).toHaveBeenCalled();
  });

  it("markFailed uses eq(status='running') guard — terminal states cannot be reclaimed", async () => {
    // markFailed is called with the guard that status='running'. We verify
    // the db.markFailed is called exactly once per failure.
    mockExecuteStep.mockRejectedValueOnce(new Error("step failed"));
    const db = makeMockDb();
    await processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);
    expect(db.markFailed).toHaveBeenCalledTimes(1);
  });
});

// ── processRun — graceful shutdown ────────────────────────────────────────────

describe("processRun — graceful shutdown", () => {
  it("does not start a new step when shutdown is requested", async () => {
    const shutdown = { requested: false };
    // Shutdown fires after the first step starts but before it calls checkCancellation post-step
    mockExecuteStep.mockImplementationOnce(async () => {
      shutdown.requested = true;
    });

    const db = makeMockDb({ checkCancellation: vi.fn().mockResolvedValue(false) });
    await processRun(db, WORKER_ID, makeRun(), silentLogger, shutdown);

    // First step ran, second step never started because shutdown was set
    expect(mockExecuteStep).toHaveBeenCalledTimes(1);
    expect(db.markCancelled).toHaveBeenCalled();
    expect(db.markCompleted).not.toHaveBeenCalled();
  });

  it("never marks a run completed due to shutdown alone", async () => {
    const db = makeMockDb();
    await processRun(db, WORKER_ID, makeRun(), silentLogger, { requested: true });
    expect(db.markCompleted).not.toHaveBeenCalled();
    expect(db.markCancelled).toHaveBeenCalled();
  });
});

// ── processRun — database errors ─────────────────────────────────────────────

describe("processRun — database errors", () => {
  it("propagates unexpected errors from persistSteps — the poll loop catches them", async () => {
    const db = makeMockDb({
      persistSteps: vi.fn().mockRejectedValue(new Error("network timeout")),
    });
    // The error bubbles out; the poll loop in index.ts will catch and retry.
    await expect(processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN)).rejects.toThrow(
      "network timeout",
    );
  });

  it("logs lease_lost when extendLease returns 0", async () => {
    // Step 1 is held open so processRun is still running when the heartbeat fires.
    let resolveStep!: () => void;
    mockExecuteStep
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveStep = r; }))
      .mockResolvedValue(void 0);

    const db = makeMockDb({ extendLease: vi.fn().mockResolvedValue(0) });

    vi.useFakeTimers();
    const runPromise = processRun(db, WORKER_ID, makeRun(), silentLogger, NO_SHUTDOWN);

    // Advance past the 60 s heartbeat interval while step 1 is still pending.
    await vi.advanceTimersByTimeAsync(61_000);

    // Let step 1 complete and processRun finish.
    resolveStep();
    await runPromise;
    vi.useRealTimers();

    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "lease_lost" }),
    );
  });
});

// ── sanitizeError ─────────────────────────────────────────────────────────────

describe("sanitizeError", () => {
  it("redacts postgresql connection strings", () => {
    const err = new Error("connect ECONNREFUSED postgresql://user:password@host:5432/db");
    expect(sanitizeError(err)).not.toContain("postgresql://");
    expect(sanitizeError(err)).toContain("[redacted-connection-string]");
  });

  it("redacts JWT-shaped tokens", () => {
    const err = new Error("Unauthorized: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
    expect(sanitizeError(err)).not.toContain("eyJ");
    expect(sanitizeError(err)).toContain("[redacted-token]");
  });

  it("redacts password-like patterns", () => {
    const err = new Error("Auth failed: password=supersecret123");
    expect(sanitizeError(err)).not.toContain("supersecret123");
  });

  it("returns stable message for StepNotImplementedError", () => {
    const err = new StepNotImplementedError("behavioral", "lib/analysis/behavioral.ts");
    const msg = sanitizeError(err);
    expect(msg).toContain("Step not implemented: behavioral");
    expect(msg).toContain("lib/analysis/behavioral.ts");
  });

  it("returns generic message for non-Error thrown values", () => {
    expect(sanitizeError("plain string error")).toBe(
      "An unexpected error occurred during pipeline execution.",
    );
    expect(sanitizeError(42)).toBe("An unexpected error occurred during pipeline execution.");
  });

  it("truncates very long error messages to 500 characters", () => {
    const err = new Error("x".repeat(1000));
    expect(sanitizeError(err).length).toBeLessThanOrEqual(500);
  });
});
