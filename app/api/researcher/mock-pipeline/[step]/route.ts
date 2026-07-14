import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import {
  type MockConfig,
  type MockStep,
  validateMockConfig,
  makeSseChunk,
} from "@/lib/mock-pipeline";

const VALID_STEPS = new Set<MockStep>([
  "data", "extract", "process", "train", "evaluate", "outcome", "reset", "run-all",
]);

const PROJECT_ROOT = path.resolve(process.cwd());
const SCRIPTS_DIR  = path.join(PROJECT_ROOT, "scripts");
const NB_DIR       = path.join(PROJECT_ROOT, "notebooks");

function log(send: (s: string) => void, msg: string) {
  send(makeSseChunk("log", { msg, ts: new Date().toISOString() }));
}

function runProcess(
  send: (s: string) => void,
  label: string,
  cmd: string,
  args: string[],
  cwd: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    log(send, `[${label}] $ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { cwd, shell: true, env: process.env });

    child.stdout.on("data", (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) log(send, line);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) log(send, `[stderr] ${line}`);
      }
    });
    child.on("close", (code) => {
      if (code === 0) {
        log(send, `[${label}] ✅ done (rc=0)`);
        resolve();
      } else {
        reject(new Error(`[${label}] failed with rc=${code}`));
      }
    });
    child.on("error", (e) => reject(e));
  });
}

async function runStep(
  step: MockStep,
  config: MockConfig,
  send: (s: string) => void
) {
  const batchArgs = ["--batch", config.batchCode];
  const rateArgs  = ["--at-risk-rate", String(config.atRiskRate), "--missing-rate", String(config.missingRate)];
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const batchTag = config.batchCode
    .replace(/^(SIM_E2E_|MOCK_|TEST_BATCH_E2E_)/, "")
    .replace(/_/g, "-") || config.batchCode;

  switch (step) {
    case "data": {
      const dataArgs: string[] = [
        path.join(SCRIPTS_DIR, "e2e-sim-create-test-data.mjs"),
        ...batchArgs,
        "--students", String(config.nStudents),
        ...rateArgs,
      ];
      if (config.taskIds?.length) {
        dataArgs.push("--task-ids", config.taskIds.join(","));
      } else {
        dataArgs.push("--tasks", String(config.nTasks));
      }
      await runProcess(send, "data", "node", dataArgs, PROJECT_ROOT);
      break;
    }

    case "extract": {
      send(makeSseChunk("progress", { step: "extract", pct: 10 }));
      const extractArgs: string[] = [
        path.join(SCRIPTS_DIR, "e2e-sim-student-flow.mjs"),
        ...batchArgs,
        ...rateArgs,
        "--api-base", config.apiBase,
      ];
      if (config.taskIds?.length) {
        extractArgs.push("--task-ids", config.taskIds.join(","));
      }
      await runProcess(send, "extract", "node", extractArgs, PROJECT_ROOT);
      break;
    }

    case "process":
      send(makeSseChunk("progress", { step: "process", pct: 10 }));
      await runProcess(send, "process", "node", [
        path.join(SCRIPTS_DIR, "e2e-sim-export-csv.mjs"),
        ...batchArgs,
      ], PROJECT_ROOT);
      break;

    case "train":
    case "evaluate": {
      send(makeSseChunk("progress", { step, pct: 10 }));
      const sessionFile = `session_${today}_${batchTag}.csv`;
      const attemptFile = `attempt_${today}_${batchTag}.csv`;
      await runProcess(send, step, "python", [
        "run_e2e_notebooks.py",
        "--session-file", sessionFile,
        "--attempt-file", attemptFile,
        "--batch-tag",    batchTag,
        "--snapshot-date", today,
      ], NB_DIR);
      break;
    }

    case "outcome": {
      const fs = await import("node:fs/promises");
      const modelsDir = path.join(NB_DIR, "models");
      try {
        const files = await fs.readdir(modelsDir);
        const jsonFiles = files.filter(f => f.startsWith("metadata_") && f.endsWith(".json")).sort().reverse();
        if (jsonFiles.length === 0) {
          log(send, "No metadata JSON found in notebooks/models/ — run train/evaluate first");
          break;
        }
        const raw = await fs.readFile(path.join(modelsDir, jsonFiles[0]), "utf-8");
        const meta = JSON.parse(raw);
        const cv   = meta.cv_metrics   ?? {};
        const test = meta.test_metrics ?? {};
        const lr   = cv.logistic_regression  ?? test.logistic_regression  ?? {};
        const rf   = cv.random_forest        ?? test.random_forest        ?? {};
        const maj  = cv.majority_baseline    ?? test.majority_baseline    ?? {};
        // Read split info from data/processed/split_metadata.json if present
        let splitInfo: string | null = null;
        let nSamples: number | null = null;
        let nAtRisk: number | null = null;
        try {
          const splitRaw = await fs.readFile(path.join(NB_DIR, "data", "processed", "split_metadata.json"), "utf-8");
          const split = JSON.parse(splitRaw);
          splitInfo  = `${meta.split_method ?? "GroupShuffleSplit"} by ${meta.group_key ?? "academy_member_id"} | train=${split.n_train ?? "?"} test=${split.n_test ?? "?"}`;
          nSamples   = (split.n_train ?? 0) + (split.n_test ?? 0);
          nAtRisk    = split.n_at_risk ?? null;
        } catch { /* split_metadata may not exist */ }

        const report = {
          lrAuc:          lr.roc_auc_mean  ?? lr.roc_auc  ?? null,
          lrF1:           lr.f1_mean       ?? lr.f1       ?? null,
          rfAuc:          rf.roc_auc_mean  ?? rf.roc_auc  ?? null,
          rfF1:           rf.f1_mean       ?? rf.f1       ?? null,
          majorityAuc:    maj.roc_auc_mean ?? maj.roc_auc ?? null,
          majorityF1:     maj.f1_mean      ?? maj.f1      ?? null,
          confusionMatrix: meta.confusion_matrix ?? null,
          splitInfo,
          sampleCount: nSamples,
          atRiskCount: nAtRisk,
        };
        log(send, `Loaded ${jsonFiles[0]} — LR AUC=${report.lrAuc} RF AUC=${report.rfAuc}`);
        send(makeSseChunk("outcome", { report }));
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
      ], PROJECT_ROOT);
      break;

    case "run-all":
      log(send, "=== run-all: starting full pipeline ===");
      for (const s of ["data", "extract", "process", "train", "evaluate", "outcome"] as MockStep[]) {
        log(send, `\n── Step: ${s} ──`);
        send(makeSseChunk("progress", { step: s, pct: 0 }));
        await runStep(s, config, send);
        send(makeSseChunk("progress", { step: s, pct: 100 }));
      }
      break;

    default:
      throw new Error(`Unknown step: ${step}`);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ step: string }> }
) {
  // Auth check
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));

      send(makeSseChunk("log", { msg: `Starting step: ${step}`, ts: new Date().toISOString() }));
      try {
        await runStep(step, config, send);
        send(makeSseChunk("done", { step, success: true }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send(makeSseChunk("error", { msg }));
        send(makeSseChunk("done",  { step, success: false }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
