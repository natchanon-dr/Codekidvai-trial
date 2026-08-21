import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import path from "node:path";

// ---------------------------------------------------------------------------
// GET /api/researcher/research-summary
// Returns a lightweight payload for the Research Summary page drawn entirely
// from local disk artifacts (notebooks/ directory).
// Returns 404 when the comparison CSV is missing (pipeline not yet run).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const fsAsync = await import("node:fs/promises");
  const NB_DIR  = path.join(process.cwd(), "notebooks");

  // ── helper ────────────────────────────────────────────────────────────────
  async function tryJson(p: string): Promise<Record<string, unknown> | null> {
    try { return JSON.parse(await fsAsync.readFile(p, "utf-8")); }
    catch { return null; }
  }

  // ── Require comparison CSV ────────────────────────────────────────────────
  const compCsvPath = path.join(NB_DIR, "models", "sequence", "comparison", "model_comparison_v1.csv");
  let csvText: string;
  try { csvText = await fsAsync.readFile(compCsvPath, "utf-8"); }
  catch {
    return NextResponse.json(
      { error: "Model comparison CSV not found — run the mock pipeline first." },
      { status: 404 },
    );
  }

  // ── Parse CSV ─────────────────────────────────────────────────────────────
  const [header, ...rows] = csvText.trim().split("\n");
  const cols = header.split(",");
  const models = rows.map(row => {
    const vals = row.split(",");
    const get  = (col: string) => vals[cols.indexOf(col)] ?? "";
    const num  = (col: string) => { const v = parseFloat(get(col)); return isNaN(v) ? null : v; };
    return {
      name:          get("model"),
      feature_set:   get("feature_set"),
      accuracy:      num("accuracy"),
      f1:            num("f1"),
      roc_auc:       num("roc_auc"),
      pr_auc:        num("pr_auc"),
      train_time_s:  num("train_time_s"),
      parameters:    num("parameters"),
      label_validity: get("label_validity"),
    };
  }).filter(m => m.name !== "");

  // ── Optional manifests ────────────────────────────────────────────────────
  const [seqMf, compMf, lstmMf] = await Promise.all([
    tryJson(path.join(NB_DIR, "data", "sequences", "sequence_manifest_v1.json")),
    tryJson(path.join(NB_DIR, "models", "sequence", "comparison", "comparison_manifest_v1.json")),
    tryJson(path.join(NB_DIR, "models", "sequence", "lstm", "lstm_manifest_v1.json")),
  ]);

  // ── Dataset summary ───────────────────────────────────────────────────────
  type SeqDs = { train_shape?: number[]; test_shape?: number[]; total_learners?: number; train_learners?: number; test_learners?: number; canonical_events?: number };
  type SeqPrm = { max_seq_len?: number; max_seq_len_percentile?: number; n_features?: number; random_state?: number; test_size?: number; dedup_window_sec?: number };
  const ds  = (seqMf?.["dataset_stats"] ?? {}) as SeqDs;
  const prm = (seqMf?.["parameters"]    ?? {}) as SeqPrm;

  type LstmDs = { train_class_dist?: Record<string, number>; test_class_dist?: Record<string, number>; label_validity?: string };
  const lstmDs = (lstmMf?.["dataset_stats"] ?? {}) as LstmDs;
  const testClassDist = lstmDs.test_class_dist;

  // ── Assemble ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    generated_at: new Date().toISOString(),
    label_validity: "pilot_only",
    data_warning:
      "PILOT ONLY — proxy_behavioral labels, label_validity=pilot_only, proxy_target_circularity=true. " +
      "Model metrics shown for pipeline validation only. Not thesis conclusions.",
    dataset: seqMf ? {
      total_learners:        ds.total_learners ?? null,
      train_learners:        ds.train_learners ?? null,
      test_learners:         ds.test_learners  ?? null,
      train_sequences:       ds.train_shape?.[0] ?? null,
      test_sequences:        ds.test_shape?.[0]  ?? null,
      canonical_events:      ds.canonical_events ?? null,
      max_seq_len:           prm.max_seq_len ?? null,
      seq_len_percentile:    prm.max_seq_len_percentile ?? null,
      n_features:            prm.n_features ?? null,
      random_state:          prm.random_state ?? null,
      test_size:             prm.test_size ?? null,
      dedup_window_sec:      prm.dedup_window_sec ?? null,
      split_method:          "GroupShuffleSplit",
      test_positive:         testClassDist?.["1"] ?? null,
      test_negative:         testClassDist?.["0"] ?? null,
      schema_version:        seqMf["schema_version"] as string ?? null,
      created_at_utc:        seqMf["created_at_utc"] as string ?? null,
    } : null,
    model_comparison: {
      test_sequences:  ds.test_shape?.[0] ?? (compMf?.["test_seq_count"] as number) ?? null,
      primary_seed:    (compMf?.["primary_seed"] as number) ?? 42,
      all_seeds:       (compMf?.["all_seeds"] as number[]) ?? [11, 22, 33, 42, 55],
      validation_checks:  (compMf?.["validation_checks"] as number) ?? null,
      validation_passed:  (compMf?.["validation_passed"]  as number) ?? null,
      created_at_utc:  (compMf?.["created_at_utc"] as string) ?? null,
      models,
    },
  });
}
