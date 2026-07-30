/**
 * Pipeline worker entry point.
 *
 * Start command (development / production):
 *   npx tsx worker/index.ts
 *
 * Required environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role secret (never expose in client)
 *
 * Optional:
 *   WORKER_POLL_INTERVAL_MS      — polling interval when idle (default: 5000)
 *   WORKER_LEASE_SECONDS         — job lease duration (default: 300)
 *   WORKER_RECOVERY_INTERVAL_MS  — stale-run recovery interval (default: 60000)
 *   WORKER_SHUTDOWN_TIMEOUT_MS   — max wait for active job on SIGTERM (default: 30000)
 *
 * Deployment note:
 *   Run this process alongside the Next.js server (e.g. via PM2, systemd, or a
 *   second Procfile/Railway service). Each instance claims jobs independently;
 *   multiple instances are safe due to FOR UPDATE SKIP LOCKED.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import { SupabaseWorkerDb } from "./db.js";
import { claimRun, processRun, recoverStaleRuns } from "./processor.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  process.stderr.write(
    "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n",
  );
  process.exit(1);
}

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5_000);
const LEASE_SECONDS = Number(process.env.WORKER_LEASE_SECONDS ?? 300);
const RECOVERY_INTERVAL_MS = Number(process.env.WORKER_RECOVERY_INTERVAL_MS ?? 60_000);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 30_000);

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const db = new SupabaseWorkerDb(supabase);
const shutdown = { requested: false };
let activeRunId: string | null = null;

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function onShutdownSignal(): void {
  if (shutdown.requested) return; // SIGINT received twice — force exit
  shutdown.requested = true;
  logger.info({ event: "shutdown_requested", worker_id: WORKER_ID });

  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
  const waitAndExit = (): void => {
    if (activeRunId === null || Date.now() >= deadline) {
      logger.info({
        event: "worker_stopped",
        worker_id: WORKER_ID,
        active_run_id: activeRunId ?? null,
        forced: activeRunId !== null,
      });
      process.exit(0);
    }
    setTimeout(waitAndExit, 500);
  };
  waitAndExit();
}

process.on("SIGTERM", onShutdownSignal);
process.on("SIGINT", onShutdownSignal);

// ── Recovery loop ─────────────────────────────────────────────────────────────

setInterval(async () => {
  if (shutdown.requested) return;
  await recoverStaleRuns(db, logger);
}, RECOVERY_INTERVAL_MS);

// ── Poll loop ─────────────────────────────────────────────────────────────────

logger.info({ event: "worker_started", worker_id: WORKER_ID });

async function poll(): Promise<void> {
  if (shutdown.requested) return;

  try {
    const run = await claimRun(db, WORKER_ID, LEASE_SECONDS);

    if (!run) {
      setTimeout(poll, POLL_INTERVAL_MS);
      return;
    }

    activeRunId = run.id;
    await processRun(db, WORKER_ID, run, logger, shutdown);
    activeRunId = null;

    // Immediately try the next job rather than waiting the full poll interval.
    if (!shutdown.requested) setTimeout(poll, 0);
  } catch (err) {
    activeRunId = null;
    logger.error({
      event: "poll_error",
      worker_id: WORKER_ID,
      message: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    setTimeout(poll, POLL_INTERVAL_MS);
  }
}

poll();
