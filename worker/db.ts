// WorkerDb — thin adapter over Supabase for the pipeline worker.
//
// Keeps all Supabase calls in one place and makes the processor testable
// without mocking Supabase's chain API.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface AnalysisStepRow {
  analysis: string;
  /** Includes "deferred" for Phase 5+ steps skipped by the Phase 4 worker. */
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  deferred_reason?: string;
}

export interface WorkerRunRow {
  id: string;
  dataset_id: string;
  run_type: string;
  status: string;
  analysis_steps: AnalysisStepRow[] | null;
  cancellation_requested: boolean;
  attempt_count: number;
  max_attempts: number;
  claimed_by: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  created_at: string;
}

export interface WorkerDb {
  /** Atomically claim the oldest eligible pending run. Returns null if none. */
  claimRun(workerId: string, leaseSeconds: number): Promise<WorkerRunRow | null>;
  /** Extend the lease for a run the worker currently owns. Returns rows updated (0 or 1). */
  extendLease(runId: string, workerId: string, leaseSeconds: number): Promise<number>;
  /** Reset stale running runs. Returns count recovered. */
  recoverStaleRuns(): Promise<number>;
  /** Re-read cancellation_requested for an active run. */
  checkCancellation(runId: string): Promise<boolean>;
  /** Persist analysis_steps JSONB while the worker still owns the run. */
  persistSteps(runId: string, workerId: string, steps: AnalysisStepRow[]): Promise<void>;
  /**
   * Atomically write status='completed'. Guards:
   *   status='running' AND claimed_by=workerId AND cancellation_requested=false
   * Returns true if the row was updated (false = cancellation won the race).
   */
  markCompleted(runId: string, workerId: string, steps: AnalysisStepRow[]): Promise<boolean>;
  /**
   * Write status='failed'. Guards: status='running' AND claimed_by=workerId.
   * When options.terminateRetries is true, sets attempt_count = options.maxAttempts
   * so the stale-run recovery loop never re-queues this run.
   */
  markFailed(
    runId: string,
    workerId: string,
    steps: AnalysisStepRow[],
    errorSummary: string,
    options?: { terminateRetries?: boolean; maxAttempts?: number },
  ): Promise<void>;
  /**
   * Write status='cancelled', cancelled_at=now(). Guards:
   *   status IN ('pending','running') AND claimed_by=workerId
   * Also marks remaining pending steps as 'cancelled'.
   */
  markCancelled(runId: string, workerId: string, steps: AnalysisStepRow[], fromStepIndex: number): Promise<void>;
}

export class SupabaseWorkerDb implements WorkerDb {
  constructor(private readonly supabase: SupabaseClient) {}

  async claimRun(workerId: string, leaseSeconds: number): Promise<WorkerRunRow | null> {
    const { data, error } = await this.supabase.rpc("fn_claim_pipeline_run", {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(`Claim RPC failed: ${error.message}`);
    const rows = data as WorkerRunRow[] | null;
    return rows?.[0] ?? null;
  }

  async extendLease(runId: string, workerId: string, leaseSeconds: number): Promise<number> {
    const { data, error } = await this.supabase.rpc("fn_extend_pipeline_run_lease", {
      p_run_id: runId,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) return 0;
    return (data as number) ?? 0;
  }

  async recoverStaleRuns(): Promise<number> {
    const { data, error } = await this.supabase.rpc("fn_recover_stale_pipeline_runs");
    if (error) throw new Error(`Recovery RPC failed: ${error.message}`);
    return (data as number) ?? 0;
  }

  async checkCancellation(runId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("mst_pipeline_runs")
      .select("cancellation_requested")
      .eq("id", runId)
      .maybeSingle();
    return Boolean((data as { cancellation_requested: boolean } | null)?.cancellation_requested);
  }

  async persistSteps(runId: string, workerId: string, steps: AnalysisStepRow[]): Promise<void> {
    await this.supabase
      .from("mst_pipeline_runs")
      .update({ analysis_steps: steps })
      .eq("id", runId)
      .eq("claimed_by", workerId)
      .eq("status", "running");
    // Zero rows updated = lease expired or status changed; the next
    // cancellation check will catch it and terminate the run.
  }

  async markCompleted(runId: string, workerId: string, steps: AnalysisStepRow[]): Promise<boolean> {
    const { data } = await this.supabase
      .from("mst_pipeline_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        analysis_steps: steps,
        claimed_by: null,
        lease_expires_at: null,
      })
      .eq("id", runId)
      .eq("claimed_by", workerId)
      .eq("status", "running")
      .eq("cancellation_requested", false)
      .select("id")
      .maybeSingle();
    return data !== null;
  }

  async markFailed(
    runId: string,
    workerId: string,
    steps: AnalysisStepRow[],
    errorSummary: string,
    options?: { terminateRetries?: boolean; maxAttempts?: number },
  ): Promise<void> {
    const update: Record<string, unknown> = {
      status: "failed",
      error_summary: errorSummary,
      analysis_steps: steps,
      claimed_by: null,
      lease_expires_at: null,
    };
    // Prevent the stale-run recovery loop from re-queuing a non-retryable failure.
    if (options?.terminateRetries && options.maxAttempts !== undefined) {
      update.attempt_count = options.maxAttempts;
    }
    await this.supabase
      .from("mst_pipeline_runs")
      .update(update)
      .eq("id", runId)
      .eq("claimed_by", workerId)
      .eq("status", "running");
  }

  async markCancelled(runId: string, workerId: string, steps: AnalysisStepRow[], fromStepIndex: number): Promise<void> {
    const finalSteps = steps.map((s, i) =>
      i >= fromStepIndex && s.status === "pending" ? { ...s, status: "cancelled" } : s,
    );
    await this.supabase
      .from("mst_pipeline_runs")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        analysis_steps: finalSteps,
        claimed_by: null,
        lease_expires_at: null,
      })
      .eq("id", runId)
      .eq("claimed_by", workerId)
      .in("status", ["pending", "running"]);
  }
}
