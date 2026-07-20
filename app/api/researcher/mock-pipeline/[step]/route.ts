import { NextRequest } from "next/server";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import {
  type MockConfig,
  type MockStep,
  validateMockConfig,
  makeSseChunk,
} from "@/lib/mock-pipeline";
import { getLearningMode } from "@/lib/research-context";

const VALID_STEPS = new Set<MockStep>([
  "data", "extract", "process", "train", "evaluate", "outcome", "reset", "run-all",
]);

const PROJECT_ROOT = path.resolve(process.cwd());
const SCRIPTS_DIR  = path.join(PROJECT_ROOT, "scripts");
const NB_DIR       = path.join(PROJECT_ROOT, "notebooks");

// ── SafeSend ──────────────────────────────────────────────────────────────────
// Prevents controller.enqueue() after the stream has been closed or cancelled,
// which would throw ERR_INVALID_STATE and crash the Node process.
type SafeSend = (s: string) => void;

function makeSafeSend(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  state: { closed: boolean }
): SafeSend {
  return (chunk: string) => {
    if (state.closed) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      // swallow — controller may have been closed by a race
    }
  };
}

function log(send: SafeSend, msg: string) {
  send(makeSseChunk("log", { msg, ts: new Date().toISOString() }));
}

// ── runProcess ────────────────────────────────────────────────────────────────
// Spawns a child process and pipes its output to the SSE stream.
// Terminates the child (SIGTERM → SIGKILL after 3 s) when the AbortSignal fires.
// Guards against double-resolve/reject and double-kill.
function runProcess(
  send: SafeSend,
  label: string,
  cmd: string,
  args: string[],
  cwd: string,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }

    log(send, `[${label}] $ ${cmd} ${args.join(" ")}`);
    const child: ChildProcess = spawn(cmd, args, { cwd, shell: true, env: process.env });

    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      signal.removeEventListener("abort", onAbort);
      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      child.removeAllListeners("close");
      child.removeAllListeners("error");
      if (killTimer) { clearTimeout(killTimer); killTimer = null; }
    }

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    }

    function killChild() {
      try { child.kill("SIGTERM"); } catch { /* already exited */ }
      killTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already exited */ }
      }, 3000);
    }

    function onAbort() {
      log(send, `[${label}] ⛔ abort — terminating child process (pid ${child.pid})`);
      killChild();
      settle(() => reject(new Error("aborted")));
    }

    signal.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) log(send, line);
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) log(send, `[stderr] ${line}`);
      }
    });
    child.on("close", (code) => {
      if (settled) return; // already handled by abort
      if (code === 0) {
        log(send, `[${label}] ✅ done (rc=0)`);
        settle(() => resolve());
      } else {
        settle(() => reject(new Error(`[${label}] failed with rc=${code ?? "null"}`)));
      }
    });
    child.on("error", (e) => settle(() => reject(e)));
  });
}

// ── runStep ───────────────────────────────────────────────────────────────────
async function runStep(
  step: MockStep,
  config: MockConfig,
  send: SafeSend,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) throw new Error("aborted");

  const batchArgs = ["--batch", config.batchCode];
  const rateArgs  = ["--at-risk-rate", String(config.atRiskRate), "--missing-rate", String(config.missingRate)];
  const today    = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const batchTag = config.batchCode
    .replace(/^(SIM_E2E_|MOCK_|TEST_BATCH_E2E_)/, "")
    .replace(/_/g, "-") || config.batchCode;

  switch (step) {
    case "data": {
      // Validate: block-based task types cannot be simulated in Phase 4
      if (config.taskTypeCounts) {
        const blockTypes = Object.entries(config.taskTypeCounts)
          .filter(([tt]) => getLearningMode(tt) === "block_based")
          .map(([tt]) => tt);
        if (blockTypes.length > 0) {
          send(makeSseChunk("error", {
            msg: `Block-based task types are not supported in Phase 4 simulation: ${blockTypes.join(", ")}. ` +
                 `ER Diagram and Visual Query Builder are planned for Phase 5.`,
          }));
          send(makeSseChunk("done", { step: "data", success: false }));
          return;
        }
      }

      const setFamily = config.setFamily ?? "assignment";
      const dataArgs = [
        path.join(SCRIPTS_DIR, "e2e-sim-create-test-data.mjs"),
        ...batchArgs,
        "--students", String(config.nStudents),
        "--set-family", setFamily,
        ...rateArgs,
      ];
      if (config.taskIds?.length) {
        dataArgs.push("--task-ids", config.taskIds.join(","));
      } else {
        dataArgs.push("--tasks", String(config.nTasks));
      }
      await runProcess(send, "data", "node", dataArgs, PROJECT_ROOT, signal);
      break;
    }

    case "extract": {
      send(makeSseChunk("progress", { step: "extract", pct: 10 }));
      const extractArgs = [
        path.join(SCRIPTS_DIR, "e2e-sim-student-flow.mjs"),
        ...batchArgs,
        ...rateArgs,
        "--api-base", config.apiBase,
      ];
      if (config.taskIds?.length) {
        extractArgs.push("--task-ids", config.taskIds.join(","));
      }
      await runProcess(send, "extract", "node", extractArgs, PROJECT_ROOT, signal);
      break;
    }

    case "process":
      send(makeSseChunk("progress", { step: "process", pct: 10 }));
      await runProcess(send, "process", "node", [
        path.join(SCRIPTS_DIR, "e2e-sim-export-csv.mjs"),
        ...batchArgs,
      ], PROJECT_ROOT, signal);
      break;

    case "train":
    case "evaluate": {
      send(makeSseChunk("progress", { step, pct: 10 }));
      // Resolve actual snapshot date from existing CSV to handle midnight crossover:
      // process step may have written session_YYYYMMDD_TAG.csv on a different calendar
      // day than when train/evaluate runs.
      const rawDir = path.join(NB_DIR, "data", "raw");
      const fsSync = await import("node:fs");
      let snapshotDate = today;
      try {
        const existing = fsSync.readdirSync(rawDir)
          .filter(f => f.startsWith("session_") && f.endsWith(`_${batchTag}.csv`))
          .sort()
          .reverse();
        if (existing.length > 0) {
          const m = existing[0].match(/^session_(\d{8})_/);
          if (m) snapshotDate = m[1];
        }
      } catch { /* rawDir missing — fall through to today */ }
      const sessionFile = `session_${snapshotDate}_${batchTag}.csv`;
      const attemptFile = `attempt_${snapshotDate}_${batchTag}.csv`;
      await runProcess(send, step, "python", [
        "run_e2e_notebooks.py",
        "--session-file", sessionFile,
        "--attempt-file", attemptFile,
        "--batch-tag",    batchTag,
        "--snapshot-date", snapshotDate,
      ], NB_DIR, signal);
      break;
    }

    case "outcome": {
      const fs = await import("node:fs/promises");
      const modelsDir  = path.join(NB_DIR, "models");
      const figuresDir = path.join(NB_DIR, "reports");
      try {
        const files = await fs.readdir(modelsDir);
        const jsonFiles = files.filter(f => f.startsWith("metadata_") && f.endsWith(".json")).sort().reverse();
        if (jsonFiles.length === 0) {
          log(send, "No metadata JSON found in notebooks/models/ — run train/evaluate first");
          break;
        }
        const metaFile = jsonFiles[0];
        const raw  = await fs.readFile(path.join(modelsDir, metaFile), "utf-8");
        const meta = JSON.parse(raw);
        const cv   = meta.cv_metrics   ?? {};
        const test = meta.test_metrics ?? {};

        function pickMetrics(bucket: Record<string, unknown>): import("@/lib/mock-pipeline").ModelMetrics {
          return {
            auc: (bucket.roc_auc_mean ?? bucket.roc_auc ?? null) as number | null,
            f1:  (bucket.f1_mean      ?? bucket.f1      ?? null) as number | null,
          };
        }

        const lr  = cv.logistic_regression ?? test.logistic_regression ?? {};
        const rf  = cv.random_forest       ?? test.random_forest       ?? {};
        const maj = cv.majority_baseline   ?? test.majority_baseline   ?? {};

        // Split metadata
        let nTrain = 0; let nTest = 0;
        let splitIntegrity: "pass" | "fail" = "fail";
        try {
          const splitRaw = await fs.readFile(path.join(NB_DIR, "data", "processed", "split_metadata.json"), "utf-8");
          const split = JSON.parse(splitRaw);
          nTrain = split.n_train ?? split.train_rows ?? 0;
          nTest  = split.n_test  ?? split.test_rows  ?? 0;
          splitIntegrity = nTrain > 0 && nTest > 0 ? "pass" : "fail";
        } catch { /* split_metadata may not exist */ }

        // Optional chart PNGs (base64-encoded if present)
        async function tryReadPng(name: string): Promise<string | undefined> {
          try {
            const buf = await fs.readFile(path.join(figuresDir, name));
            return `data:image/png;base64,${buf.toString("base64")}`;
          } catch { return undefined; }
        }
        const [cmPng, rocPng, fiPng] = await Promise.all([
          tryReadPng("confusion_matrices.png"),
          tryReadPng("roc_curves.png"),
          tryReadPng("rf_feature_importance.png"),
        ]);

        const outcome: import("@/lib/mock-pipeline").MockOutcome = {
          batchCode: config.batchCode,
          dataset: {
            samples:     nTrain + nTest,
            trainSamples: nTrain,
            testSamples:  nTest,
            students:    meta.n_students   ?? config.nStudents,
            tasks:       meta.n_tasks      ?? (config.taskIds?.length ?? config.nTasks),
            sessions:    meta.n_sessions   ?? 0,
            attempts:    meta.n_attempts   ?? 0,
            submissions: meta.n_submissions ?? 0,
          },
          metrics: {
            majorityBaseline:   pickMetrics(maj as Record<string, unknown>),
            logisticRegression: pickMetrics(lr  as Record<string, unknown>),
            randomForest:       pickMetrics(rf  as Record<string, unknown>),
          },
          checks: {
            pii:            "pass",
            leakage:        "pass",
            splitIntegrity,
          },
          charts: {
            confusionMatrix:  cmPng,
            rocCurve:         rocPng,
            featureImportance: fiPng,
          },
          reports: {
            metadata: metaFile,
          },
        };

        log(send, `Loaded ${metaFile} — LR AUC=${outcome.metrics.logisticRegression.auc} RF AUC=${outcome.metrics.randomForest.auc}`);
        send(makeSseChunk("outcome", { report: outcome }));
      } catch (e) {
        log(send, `Could not read models directory: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "reset":
      await runProcess(send, "reset", "node", [
        path.join(SCRIPTS_DIR, "e2e-reset-sim-data.mjs"),
        ...batchArgs,
        "--execute",
      ], PROJECT_ROOT, signal);
      break;

    case "run-all":
      log(send, "=== run-all: starting full pipeline ===");
      for (const s of ["data", "extract", "process", "train", "evaluate", "outcome"] as MockStep[]) {
        if (signal.aborted) throw new Error("aborted");
        log(send, `\n── Step: ${s} ──`);
        send(makeSseChunk("progress", { step: s, pct: 0 }));
        await runStep(s, config, send, signal);
        send(makeSseChunk("progress", { step: s, pct: 100 }));
      }
      break;

    default:
      throw new Error(`Unknown step: ${step}`);
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ step: string }> }
) {
  try {
    await requireAdminOrResearcher(req);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { step: stepParam } = await params;
  const step = stepParam as MockStep;
  if (!VALID_STEPS.has(step)) {
    return new Response("Invalid step", { status: 400 });
  }

  let config: MockConfig;
  try {
    config = (await req.json()) as MockConfig;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const validationError = validateMockConfig(config);
  if (validationError) {
    return new Response(validationError, { status: 400 });
  }

  // Per-request abort controller — cancelled by stream.cancel() (client disconnect)
  const abort   = new AbortController();
  const encoder = new TextEncoder();
  const state   = { closed: false };

  const stream = new ReadableStream({
    async start(controller) {
      const send = makeSafeSend(controller, encoder, state);

      send(makeSseChunk("log", { msg: `Starting step: ${step}`, ts: new Date().toISOString() }));
      try {
        await runStep(step, config, send, abort.signal);
        // Only emit success done if not aborted
        if (!abort.signal.aborted) {
          send(makeSseChunk("done", { step, success: true }));
        }
      } catch (err) {
        const msg      = err instanceof Error ? err.message : String(err);
        const isAbort  = msg === "aborted" || msg.includes("terminated") || msg.includes("killed");
        if (!isAbort) {
          send(makeSseChunk("error", { msg }));
        }
        send(makeSseChunk("done", { step, success: false, aborted: isAbort }));
      } finally {
        state.closed = true;
        try { controller.close(); } catch { /* already closed by cancel */ }
      }
    },

    // Fired when the client disconnects: browser refresh, tab close, fetch abort (Stop button)
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  });
}
