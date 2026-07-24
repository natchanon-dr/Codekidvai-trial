import type { WorkerDb, WorkerRunRow, AnalysisStepRow } from "./db.js";
import { executeStep, NonRetryableAnalysisError } from "./step-executors.js";
import type { Logger } from "./logger.js";

export interface ShutdownSignal {
  requested: boolean;
}

const LEASE_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function claimRun(
  db: WorkerDb,
  workerId: string,
  leaseSeconds: number = LEASE_SECONDS,
): Promise<WorkerRunRow | null> {
  return db.claimRun(workerId, leaseSeconds);
}

export async function recoverStaleRuns(
  db: WorkerDb,
  log: Logger,
): Promise<number> {
  try {
    const count = await db.recoverStaleRuns();
    if (count > 0) log.info({ event: "runs_recovered", count });
    return count;
  } catch (err) {
    log.error({ event: "recovery_failed", message: safeMessage(err) });
    return 0;
  }
}

export async function processRun(
  db: WorkerDb,
  workerId: string,
  run: WorkerRunRow,
  log: Logger,
  shutdown: ShutdownSignal,
): Promise<void> {
  const { id: runId, dataset_id, analysis_steps, attempt_count } = run;

  const steps: AnalysisStepRow[] = Array.isArray(analysis_steps)
    ? analysis_steps.map((s) => ({ ...s }))
    : [];

  log.info({
    event: "run_claimed",
    run_id: runId,
    dataset_id,
    attempt: attempt_count,
    worker_id: workerId,
    step_count: steps.length,
  });

  const heartbeatTimer = setInterval(async () => {
    const updated = await db.extendLease(runId, workerId, LEASE_SECONDS);
    if (updated === 0) {
      log.warn({ event: "lease_lost", run_id: runId, worker_id: workerId });
    }
  }, HEARTBEAT_INTERVAL_MS);

  try {
    for (let i = 0; i < steps.length; i++) {
      // ── Pre-step cancellation/shutdown check ──────────────────────────────
      if (shutdown.requested || (await db.checkCancellation(runId))) {
        await db.markCancelled(runId, workerId, steps, i);
        log.info({
          event: "run_cancelled",
          run_id: runId,
          step: steps[i]?.analysis,
          worker_id: workerId,
          transition: "pending->cancelled",
        });
        return;
      }

      // ── Transition step to running ────────────────────────────────────────
      steps[i] = { ...steps[i], status: "running", started_at: new Date().toISOString() };
      await db.persistSteps(runId, workerId, steps);

      const stepName = steps[i].analysis;
      const stepStart = Date.now();

      log.info({ event: "step_started", run_id: runId, step: stepName, attempt: attempt_count, worker_id: workerId });

      try {
        await executeStep(stepName, {
          runId,
          datasetId: dataset_id,
          onHeartbeat: () => db.extendLease(runId, workerId, LEASE_SECONDS).then(() => void 0),
        });
      } catch (err) {
        const isNonRetryable = err instanceof NonRetryableAnalysisError;
        const errorSummary = sanitizeError(err);
        steps[i] = {
          ...steps[i],
          status: "failed",
          error: errorSummary,
          completed_at: new Date().toISOString(),
        };
        await db.persistSteps(runId, workerId, steps);
        if (isNonRetryable) {
          await db.markFailed(runId, workerId, steps, errorSummary, {
            terminateRetries: true,
            maxAttempts: run.max_attempts,
          });
        } else {
          await db.markFailed(runId, workerId, steps, errorSummary);
        }

        log.error({
          event: "step_failed",
          run_id: runId,
          step: stepName,
          non_retryable: isNonRetryable,
          duration_ms: Date.now() - stepStart,
          worker_id: workerId,
        });
        return;
      }

      // ── Post-step cancellation check ──────────────────────────────────────
      // Catches cancellation requested during the step execution.
      if (shutdown.requested || (await db.checkCancellation(runId))) {
        steps[i] = { ...steps[i], status: "cancelled", completed_at: new Date().toISOString() };
        await db.persistSteps(runId, workerId, steps);
        await db.markCancelled(runId, workerId, steps, i + 1);
        log.info({
          event: "run_cancelled",
          run_id: runId,
          step: stepName,
          worker_id: workerId,
          transition: "running->cancelled",
        });
        return;
      }

      steps[i] = { ...steps[i], status: "completed", completed_at: new Date().toISOString() };
      await db.persistSteps(runId, workerId, steps);

      log.info({
        event: "step_completed",
        run_id: runId,
        step: stepName,
        duration_ms: Date.now() - stepStart,
        worker_id: workerId,
      });
    }

    // ── Final atomic completion write ─────────────────────────────────────
    // Guards: status='running' AND claimed_by=workerId AND cancellation_requested=false
    // Zero rows updated = cancellation won the race; do not overwrite.
    const completed = await db.markCompleted(runId, workerId, steps);
    if (completed) {
      log.info({ event: "run_completed", run_id: runId, dataset_id, worker_id: workerId });
    } else {
      log.warn({ event: "completion_race_lost", run_id: runId, worker_id: workerId });
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

// ---------------------------------------------------------------------------
// Error sanitization
// ---------------------------------------------------------------------------

export function sanitizeError(err: unknown): string {
  let msg: string;

  if (err instanceof NonRetryableAnalysisError) {
    msg = `[${err.reason}] ${err.message}`.slice(0, 500);
  } else if (err instanceof Error) {
    msg = err.message.slice(0, 500);
  } else {
    return "An unexpected error occurred during pipeline execution.";
  }

  // Strip patterns that could expose secrets, connection strings, or tokens.
  return msg
    .replace(/postgresql:\/\/[^\s]*/gi, "[redacted-connection-string]")
    .replace(/eyJ[a-zA-Z0-9._-]{20,}/g, "[redacted-token]")
    .replace(/password[=\s:]+\S+/gi, "password=[redacted]")
    .replace(/key[=\s:]+[A-Za-z0-9+/]{20,}/gi, "key=[redacted]");
}

function safeMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
}
