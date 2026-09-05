// Risk Classification step — AI Model Layer (LR + RF inference).
//
// Applies pre-trained models (lib/analysis/models/lr_e1_v1.json, rf_e2_v1.json)
// to this dataset's already-computed Behavioral and Semantic results, predicting
// Success/At-risk per learner. This is the closest thing in the codebase to the
// thesis's "AI Model Layer" (Table 3.7):
//   E1 — Logistic Regression on Behavioral features only
//   E2 — Random Forest on Behavioral + Semantic features (requires a completed
//        Semantic Analysis run; falls back to E1-only per learner otherwise)
//
// Assessment (2C3L) features are intentionally EXCLUDED from both models: the
// Success/At-risk label used to train them was derived from submission
// pass-rate (a proxy for the Assessment outcome), so including an Assessment
// feature would leak the label into the input — the same proxy_target_circularity
// concern already flagged elsewhere in this codebase for the Phase 4 pilot data.
//
// Models were trained offline on a small pilot cohort (see pilot_warning in
// each artifact) — this step performs INFERENCE only, no training happens here.
//
// This step depends on Behavioral Analysis having already been run for this
// dataset (reads its persisted result rather than recomputing features).

import { supabaseAdmin } from "@/lib/supabase-admin";
import { InsufficientDataError } from "./types";
import { persistResult } from "./assessment";
import type { StepContext } from "./types";
import type { BehavioralLearnerMetrics } from "./behavioral";
import type { SemanticLearnerMetrics } from "./semantic";
import lrModel from "./models/lr_e1_v1.json";
import rfModel from "./models/rf_e2_v1.json";

// ---------------------------------------------------------------------------
// Model artifact shapes
// ---------------------------------------------------------------------------

interface LrArtifact {
  schema_version: string;
  model_type: "logistic_regression";
  thesis_experiment: "E1";
  feature_names: string[];
  coefficients: number[];
  intercept: number;
  cv_metrics: { accuracy: number; precision: number; recall: number; f1: number };
  training_n: number;
  pilot_only: boolean;
  pilot_warning: string;
}

interface TreeNode {
  feature: number;
  threshold: number | null;
  left: number | null;
  right: number | null;
  leaf: boolean;
  proba_class1: number;
}

interface RfArtifact {
  schema_version: string;
  model_type: "random_forest";
  thesis_experiment: "E2";
  feature_names: string[];
  n_estimators: number;
  trees: TreeNode[][];
  feature_importances: Record<string, number>;
  cv_metrics: { accuracy: number; precision: number; recall: number; f1: number };
  training_n: number;
  pilot_only: boolean;
  pilot_warning: string;
}

const lr = lrModel as LrArtifact;
const rf = rfModel as RfArtifact;

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type RiskLabel = "success" | "at_risk";

export interface RiskPrediction {
  profile_id: string;
  lr_predicted_label: RiskLabel;
  lr_probability_success: number;
  rf_predicted_label: RiskLabel | null;
  rf_probability_success: number | null;
}

export interface RiskClassificationResult {
  schema_version: "1.0.0";
  computed_at: string;
  dataset_id: string;
  models_used: {
    e1_logistic_regression: {
      feature_names: string[];
      cv_metrics: LrArtifact["cv_metrics"];
      pilot_warning: string;
    };
    e2_random_forest: {
      feature_names: string[];
      cv_metrics: RfArtifact["cv_metrics"];
      pilot_warning: string;
    } | null;
  };
  learner_count: number;
  rf_applied_count: number;
  predictions: RiskPrediction[];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runRiskClassification(ctx: StepContext): Promise<void> {
  const { runId, datasetId } = ctx;

  const behavioral = await fetchLatestResult<{ per_learner: BehavioralLearnerMetrics[] }>(datasetId, "behavioral");
  if (!behavioral) {
    throw new InsufficientDataError(
      `No completed Behavioral Analysis run found for dataset ${datasetId}. ` +
        "Risk Classification requires Behavioral features — run Behavioral Analysis first.",
    );
  }

  const semantic = await fetchLatestResult<{ per_learner: SemanticLearnerMetrics[] }>(datasetId, "semantic");

  const behByProfile = new Map(behavioral.per_learner.map((l) => [l.profile_id, l]));
  const semByProfile = semantic ? new Map(semantic.per_learner.map((l) => [l.profile_id, l])) : null;

  const predictions: RiskPrediction[] = [];
  let rfAppliedCount = 0;

  for (const [profileId, beh] of behByProfile.entries()) {
    const behRecord = beh as unknown as Record<string, number>;
    const lrFeatures = lr.feature_names.map((f) => behRecord[f] ?? 0);
    const lrProbSuccess = r2(predictLogisticRegression(lrFeatures));

    let rfProbSuccess: number | null = null;
    const sem = semByProfile?.get(profileId);
    if (sem) {
      const semRecord = sem as unknown as Record<string, number>;
      const rfFeatures = rf.feature_names.map((f) => behRecord[f] ?? semRecord[f] ?? 0);
      rfProbSuccess = r2(predictRandomForest(rfFeatures));
      rfAppliedCount += 1;
    }

    predictions.push({
      profile_id: profileId,
      lr_predicted_label: lrProbSuccess >= 0.5 ? "success" : "at_risk",
      lr_probability_success: lrProbSuccess,
      rf_predicted_label: rfProbSuccess !== null ? (rfProbSuccess >= 0.5 ? "success" : "at_risk") : null,
      rf_probability_success: rfProbSuccess,
    });
  }

  predictions.sort((a, b) => a.profile_id.localeCompare(b.profile_id));

  const result: RiskClassificationResult = {
    schema_version: "1.0.0",
    computed_at: new Date().toISOString(),
    dataset_id: datasetId,
    models_used: {
      e1_logistic_regression: {
        feature_names: lr.feature_names,
        cv_metrics: lr.cv_metrics,
        pilot_warning: lr.pilot_warning,
      },
      e2_random_forest: semByProfile
        ? { feature_names: rf.feature_names, cv_metrics: rf.cv_metrics, pilot_warning: rf.pilot_warning }
        : null,
    },
    learner_count: predictions.length,
    rf_applied_count: rfAppliedCount,
    predictions,
  };

  await persistResult(runId, datasetId, "risk_classification", result);
}

// ---------------------------------------------------------------------------
// Data fetch helper
// ---------------------------------------------------------------------------

async function fetchLatestResult<T>(datasetId: string, analysisType: string): Promise<T | null> {
  const { data: run } = await supabaseAdmin
    .from("mst_pipeline_runs")
    .select("id")
    .eq("dataset_id", datasetId)
    .eq("run_type", analysisType)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const { data: resultRow } = await supabaseAdmin
    .from("mst_pipeline_run_results")
    .select("result")
    .eq("run_id", run.id as string)
    .eq("analysis_type", analysisType)
    .maybeSingle();

  return (resultRow?.result as T) ?? null;
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function predictLogisticRegression(features: number[]): number {
  const z = features.reduce((sum, f, i) => sum + f * lr.coefficients[i], lr.intercept);
  return sigmoid(z);
}

function predictOneTree(nodes: TreeNode[], features: number[]): number {
  let idx = 0;
  // Bounded by tree depth; every node is either a leaf or has both children set.
  while (!nodes[idx].leaf) {
    const node = nodes[idx];
    idx = features[node.feature] <= (node.threshold as number) ? (node.left as number) : (node.right as number);
  }
  return nodes[idx].proba_class1;
}

function predictRandomForest(features: number[]): number {
  const probs = rf.trees.map((tree) => predictOneTree(tree, features));
  return probs.reduce((a, b) => a + b, 0) / probs.length;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
