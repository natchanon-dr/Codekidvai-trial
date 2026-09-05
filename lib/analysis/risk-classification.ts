// Risk Classification step — AI Model Layer (LR + RF + LSTM + GRU inference).
//
// Applies pre-trained models (lib/analysis/models/*.json) to this dataset's
// features, predicting Success/At-risk per learner. This is the closest thing
// in the codebase to the thesis's "AI Model Layer" (Table 3.7):
//   E1 — Logistic Regression on Behavioral features only
//   E2 — Random Forest on Behavioral + Semantic features (requires a completed
//        Semantic Analysis run; falls back to null per learner otherwise)
//   E3 — LSTM on Sequential features (raw per-learner event-type sequence,
//        chronological across all their sessions)
//   E4 — GRU on the same Sequential sequence input as E3
//
// Assessment (2C3L) features are intentionally EXCLUDED from all four models:
// the Success/At-risk label used to train them was derived from submission
// pass-rate (a proxy for the Assessment outcome), so including an Assessment
// feature would leak the label into the input — the same proxy_target_circularity
// concern already flagged elsewhere in this codebase for the Phase 4 pilot data.
//
// Models were trained offline on a small pilot cohort (see pilot_warning in
// each artifact) — this step performs INFERENCE only, no training happens here.
// LSTM/GRU weights were exported from PyTorch (not ONNX/tfjs) and are
// interpreted by a small hand-rolled forward pass below — the model is tiny
// enough (vocab size ~6, hidden_dim 8) that this avoids adding any native
// addon / model-serving runtime dependency, mirroring the LR/RF approach.
//
// This step depends on Behavioral Analysis having already been run for this
// dataset (reads its persisted result rather than recomputing features).
// Sequential features for LSTM/GRU are read directly from the DB (raw event
// sequences aren't persisted by the Sequential Analysis step itself).

import { supabaseAdmin } from "@/lib/supabase-admin";
import { InsufficientDataError } from "./types";
import { persistResult } from "./assessment";
import type { StepContext } from "./types";
import type { BehavioralLearnerMetrics } from "./behavioral";
import type { SemanticLearnerMetrics } from "./semantic";
import lrModel from "./models/lr_e1_v1.json";
import rfModel from "./models/rf_e2_v1.json";
import lstmModel from "./models/lstm_seq_v1.json";
import gruModel from "./models/gru_seq_v1.json";

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

interface RnnGate {
  w_ih: number[][];
  w_hh: number[][];
  b_ih: number[];
  b_hh: number[];
}

interface RnnArtifact {
  schema_version: string;
  model_type: "lstm" | "gru";
  thesis_experiment: "E3" | "E4";
  vocab: string[];
  vocab_size: number;
  max_len: number;
  embed_dim: number;
  hidden_dim: number;
  embedding: number[][];
  rnn_weights: { gates: Record<string, RnnGate> };
  output_weight: number[];
  output_bias: number;
  cv_metrics: { accuracy: number; f1: number };
  training_n: number;
  pilot_only: boolean;
  pilot_warning: string;
}

const lr = lrModel as LrArtifact;
const rf = rfModel as RfArtifact;
const lstm = lstmModel as unknown as RnnArtifact;
const gru = gruModel as unknown as RnnArtifact;

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type RiskLabel = "success" | "at_risk";

export interface RiskPrediction {
  profile_id: string;
  // Raw feature values fed into LR/RF, keyed by feature name (union of both
  // models' feature_names — see models_used.*.feature_names for which subset
  // each model actually uses). Lets the UI show input values next to the
  // predictions they produced.
  feature_values: Record<string, number>;
  lr_predicted_label: RiskLabel;
  lr_probability_success: number;
  rf_predicted_label: RiskLabel | null;
  rf_probability_success: number | null;
  lstm_predicted_label: RiskLabel | null;
  lstm_probability_success: number | null;
  gru_predicted_label: RiskLabel | null;
  gru_probability_success: number | null;
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
    e3_lstm: { cv_metrics: RnnArtifact["cv_metrics"]; pilot_warning: string } | null;
    e4_gru: { cv_metrics: RnnArtifact["cv_metrics"]; pilot_warning: string } | null;
  };
  learner_count: number;
  rf_applied_count: number;
  sequence_applied_count: number;
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
  const sequencesByProfile = await fetchLearnerSequences(datasetId);

  const behByProfile = new Map(behavioral.per_learner.map((l) => [l.profile_id, l]));
  const semByProfile = semantic ? new Map(semantic.per_learner.map((l) => [l.profile_id, l])) : null;

  const predictions: RiskPrediction[] = [];
  let rfAppliedCount = 0;
  let sequenceAppliedCount = 0;

  for (const [profileId, beh] of behByProfile.entries()) {
    const behRecord = beh as unknown as Record<string, number>;
    const lrFeatures = lr.feature_names.map((f) => behRecord[f] ?? 0);
    const lrProbSuccess = r2(predictLogisticRegression(lrFeatures));

    const featureValues: Record<string, number> = {};
    for (const f of lr.feature_names) featureValues[f] = r2(behRecord[f] ?? 0);

    let rfProbSuccess: number | null = null;
    const sem = semByProfile?.get(profileId);
    if (sem) {
      const semRecord = sem as unknown as Record<string, number>;
      const rfFeatures = rf.feature_names.map((f) => behRecord[f] ?? semRecord[f] ?? 0);
      rfProbSuccess = r2(predictRandomForest(rfFeatures));
      rfAppliedCount += 1;
      for (const f of rf.feature_names) featureValues[f] = r2(behRecord[f] ?? semRecord[f] ?? 0);
    }

    let lstmProbSuccess: number | null = null;
    let gruProbSuccess: number | null = null;
    const sequence = sequencesByProfile.get(profileId);
    if (sequence && sequence.length > 0) {
      const lstmTokens = tokenizeSequence(lstm, sequence);
      const gruTokens = tokenizeSequence(gru, sequence);
      lstmProbSuccess = r2(predictSequence(lstm, lstmTokens));
      gruProbSuccess = r2(predictSequence(gru, gruTokens));
      sequenceAppliedCount += 1;
    }

    predictions.push({
      profile_id: profileId,
      feature_values: featureValues,
      lr_predicted_label: lrProbSuccess >= 0.5 ? "success" : "at_risk",
      lr_probability_success: lrProbSuccess,
      rf_predicted_label: rfProbSuccess !== null ? (rfProbSuccess >= 0.5 ? "success" : "at_risk") : null,
      rf_probability_success: rfProbSuccess,
      lstm_predicted_label: lstmProbSuccess !== null ? (lstmProbSuccess >= 0.5 ? "success" : "at_risk") : null,
      lstm_probability_success: lstmProbSuccess,
      gru_predicted_label: gruProbSuccess !== null ? (gruProbSuccess >= 0.5 ? "success" : "at_risk") : null,
      gru_probability_success: gruProbSuccess,
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
      e3_lstm: sequenceAppliedCount > 0 ? { cv_metrics: lstm.cv_metrics, pilot_warning: lstm.pilot_warning } : null,
      e4_gru: sequenceAppliedCount > 0 ? { cv_metrics: gru.cv_metrics, pilot_warning: gru.pilot_warning } : null,
    },
    learner_count: predictions.length,
    rf_applied_count: rfAppliedCount,
    sequence_applied_count: sequenceAppliedCount,
    predictions,
  };

  await persistResult(runId, datasetId, "risk_classification", result);
}

// ---------------------------------------------------------------------------
// Data fetch helper
// ---------------------------------------------------------------------------

// Raw per-learner event-type sequence, chronological across all their
// sessions (concatenated in session started_at order, event_order within a
// session). This mirrors exactly how the LSTM/GRU training data was built —
// see scratchpad/train_sequence_models.py — so token encoding matches.
async function fetchLearnerSequences(datasetId: string): Promise<Map<string, string[]>> {
  const { data: dataset } = await supabaseAdmin
    .from("mst_datasets")
    .select("task_set_id")
    .eq("id", datasetId)
    .maybeSingle();

  const taskSetId = dataset?.task_set_id as string | undefined;
  if (!taskSetId) return new Map();

  const { data: sessions } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id, started_at")
    .eq("batch_id", taskSetId)
    .not("profile_id", "is", null)
    .order("started_at", { ascending: true });

  if (!sessions || sessions.length === 0) return new Map();
  const sessionIds = sessions.map((s) => s.session_id as string);

  const { data: events } = await supabaseAdmin
    .from("trn_event_logs")
    .select("session_id, event_type")
    .in("session_id", sessionIds)
    .order("session_id", { ascending: true })
    .order("event_order", { ascending: true });

  const eventsBySession = new Map<string, string[]>();
  for (const e of events ?? []) {
    const sid = e.session_id as string;
    const list = eventsBySession.get(sid) ?? [];
    list.push(e.event_type as string);
    eventsBySession.set(sid, list);
  }

  const sequenceByProfile = new Map<string, string[]>();
  for (const s of sessions) {
    const profileId = s.profile_id as string;
    const seq = eventsBySession.get(s.session_id as string) ?? [];
    const list = sequenceByProfile.get(profileId) ?? [];
    list.push(...seq);
    sequenceByProfile.set(profileId, list);
  }
  return sequenceByProfile;
}

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

// Token 0 is reserved for padding (matches nn.Embedding(padding_idx=0) at
// training time); vocab tokens are 1-indexed. Sequences are truncated to
// max_len from the start and right-padded with 0 — matching
// scratchpad/train_sequence_models.py exactly, since the model was trained
// on that padding scheme (no masking) and the classifier reads the FINAL
// timestep's hidden state, padding included.
function tokenizeSequence(artifact: RnnArtifact, sequence: string[]): number[] {
  const tokenId = new Map(artifact.vocab.map((tok, i) => [tok, i + 1]));
  const ids = sequence.slice(0, artifact.max_len).map((tok) => tokenId.get(tok) ?? 0);
  while (ids.length < artifact.max_len) ids.push(0);
  return ids;
}

function dot(w: number[], x: number[]): number {
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i] * x[i];
  return sum;
}

function gatePreActivation(gate: RnnGate, x: number[], h: number[], unit: number): number {
  return dot(gate.w_ih[unit], x) + gate.b_ih[unit] + dot(gate.w_hh[unit], h) + gate.b_hh[unit];
}

// Standard PyTorch nn.LSTM cell equations (gates packed as [i, f, g, o]).
function lstmForward(artifact: RnnArtifact, tokenIds: number[]): number[] {
  const { hidden_dim, embedding, rnn_weights } = artifact;
  const gates = rnn_weights.gates;
  let h = new Array(hidden_dim).fill(0);
  let c = new Array(hidden_dim).fill(0);

  for (const tokenId of tokenIds) {
    const x = embedding[tokenId];
    const newC = new Array(hidden_dim);
    const newH = new Array(hidden_dim);
    for (let u = 0; u < hidden_dim; u++) {
      const i = sigmoid(gatePreActivation(gates.i, x, h, u));
      const f = sigmoid(gatePreActivation(gates.f, x, h, u));
      const g = Math.tanh(gatePreActivation(gates.g, x, h, u));
      const o = sigmoid(gatePreActivation(gates.o, x, h, u));
      newC[u] = f * c[u] + i * g;
      newH[u] = o * Math.tanh(newC[u]);
    }
    c = newC;
    h = newH;
  }
  return h;
}

// Standard PyTorch nn.GRU cell equations (gates packed as [r, z, n]).
function gruForward(artifact: RnnArtifact, tokenIds: number[]): number[] {
  const { hidden_dim, embedding, rnn_weights } = artifact;
  const gates = rnn_weights.gates;
  let h = new Array(hidden_dim).fill(0);

  for (const tokenId of tokenIds) {
    const x = embedding[tokenId];
    const r = new Array(hidden_dim);
    const z = new Array(hidden_dim);
    for (let u = 0; u < hidden_dim; u++) {
      r[u] = sigmoid(gatePreActivation(gates.r, x, h, u));
      z[u] = sigmoid(gatePreActivation(gates.z, x, h, u));
    }
    const newH = new Array(hidden_dim);
    for (let u = 0; u < hidden_dim; u++) {
      const inputPart = dot(gates.n.w_ih[u], x) + gates.n.b_ih[u];
      const hiddenPart = dot(gates.n.w_hh[u], h) + gates.n.b_hh[u];
      const n = Math.tanh(inputPart + r[u] * hiddenPart);
      newH[u] = (1 - z[u]) * n + z[u] * h[u];
    }
    h = newH;
  }
  return h;
}

function predictSequence(artifact: RnnArtifact, tokenIds: number[]): number {
  const finalHidden = artifact.model_type === "lstm" ? lstmForward(artifact, tokenIds) : gruForward(artifact, tokenIds);
  const z = dot(artifact.output_weight, finalHidden) + artifact.output_bias;
  return sigmoid(z);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
