"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ModelRow = {
  name: string; accuracy: number; precision: number; recall: number;
  f1: number; roc_auc: number; pr_auc: number | null; train_time_sec: number;
  inference_time_per_seq_sec: number; parameters: number | null; type: string;
};
type SeedRow = { seed: number; accuracy: number; f1: number; roc_auc: number };
type ExpResult = {
  accuracy_mean: number; f1_mean: number; roc_auc_mean: number;
  train_time_sec_mean: number; epochs_trained_mean: number; seeds: SeedRow[];
};
type ModelConfig = {
  cell_type: string; hidden_size: number; dropout: number; learning_rate: number;
  batch_size: number; max_epochs: number; early_stop_patience: number; optimizer: string;
  input_features_exp_a: number; input_features_exp_b: number;
  max_sequence_length: number; tag_features_exp_b: number;
  trainable_params_exp_a: number; trainable_params_exp_b: number; architecture: string;
  architecture_exp_a?: string; architecture_exp_b?: string;
};
type ClassDist = { positive: number; negative: number };
type ChartItem = { key: string; title: string; path: string };
type ApiData = {
  evaluation_purpose: string; label_source: string; label_validity: string;
  proxy_target_circularity: boolean; confirmatory_analysis_allowed: boolean;
  data_warning: string;
  model_comparison: {
    primary_seed: number; all_seeds: number[]; test_sequences: number;
    timing_note: string; models: ModelRow[];
    test_class_distribution?: ClassDist;
  };
  seed_stability: {
    lstm: { exp_a_seq_only: ExpResult; exp_b_seq_plus_tag: ExpResult };
    gru: { exp_a_seq_only: ExpResult; exp_b_seq_plus_tag: ExpResult };
  };
  validation: { checks_run: number; checks_passed: number };
  charts: ChartItem[];
  model_configs?: { lstm: ModelConfig; gru: ModelConfig };
};

// ─── Control types ────────────────────────────────────────────────────────────

type Experiment  = "exp_a" | "exp_b";
type SeedOption  = 11 | 22 | 33 | 42 | 55 | "mean";
type ModelOption = "all" | "Dummy" | "Logistic Regression" | "Random Forest" | "TAG-based LR" | "LSTM" | "GRU";
type MetricKey   = "overview" | "accuracy" | "precision" | "recall" | "f1" | "roc_auc" | "pr_auc" | "train_time" | "infer_time";
type DisplayMode = "table" | "chart";

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAT_MODELS    = ["Dummy", "Logistic Regression", "Random Forest", "TAG-based LR"] as const;
const SEQ_MODELS     = ["LSTM", "GRU"] as const;
const ALL_MODEL_NAMES: string[] = [...FLAT_MODELS, ...SEQ_MODELS];
const SEEDS: SeedOption[] = [11, 22, 33, 42, 55, "mean"];

const MODEL_COLORS: Record<string, string> = {
  "Dummy":                 "#94A3B8",
  "Logistic Regression":   "#3B82F6",
  "Random Forest":         "#22C55E",
  "TAG-based LR":          "#14B8A6",
  "LSTM":                  "#F37021",
  "GRU":                   "#F59E0B",
};

const METRIC_LABELS: Record<MetricKey, string> = {
  overview:   "Overview",
  accuracy:   "Accuracy",
  precision:  "Precision",
  recall:     "Recall",
  f1:         "F1 Score",
  roc_auc:    "ROC-AUC",
  pr_auc:     "PR-AUC",
  train_time: "Training Time",
  infer_time: "Inference Time / seq",
};

// ─── Data access ───────────────────────────────────────────────────────────────

type Resolved = {
  name: string;
  accuracy: number | null; precision: number | null; recall: number | null;
  f1: number | null; roc_auc: number | null; pr_auc: number | null;
  train_time_sec: number | null;
  inference_time_per_seq_sec: number | null; parameters: number | null;
};

function resolveModel(data: ApiData, exp: Experiment, seed: SeedOption, name: string): Resolved | null {
  const isFlat = (FLAT_MODELS as readonly string[]).includes(name);
  const isSeq  = (SEQ_MODELS  as readonly string[]).includes(name);
  if (exp === "exp_b" && isFlat) return null;
  if (seed !== 42 && seed !== "mean" && isFlat) return null;
  if (seed === "mean" && isFlat) return null;

  // Primary comparison: EXP-A, seed 42, any model
  if (exp === "exp_a" && seed === 42) {
    const m = data.model_comparison.models.find(r => r.name === name);
    if (!m) return null;
    return { name: m.name, accuracy: m.accuracy, precision: m.precision, recall: m.recall, f1: m.f1, roc_auc: m.roc_auc, pr_auc: m.pr_auc ?? null, train_time_sec: m.train_time_sec, inference_time_per_seq_sec: m.inference_time_per_seq_sec, parameters: m.parameters };
  }

  if (!isSeq) return null;
  const key     = name === "LSTM" ? "lstm" : "gru";
  const expData = exp === "exp_a" ? data.seed_stability[key].exp_a_seq_only : data.seed_stability[key].exp_b_seq_plus_tag;

  if (seed === "mean") {
    return { name, accuracy: expData.accuracy_mean, precision: null, recall: null, f1: expData.f1_mean, roc_auc: expData.roc_auc_mean, pr_auc: null, train_time_sec: expData.train_time_sec_mean, inference_time_per_seq_sec: null, parameters: null };
  }
  const row = expData.seeds.find(s => s.seed === seed);
  if (!row) return null;
  return { name, accuracy: row.accuracy, precision: null, recall: null, f1: row.f1, roc_auc: row.roc_auc, pr_auc: null, train_time_sec: null, inference_time_per_seq_sec: null, parameters: null };
}

function getRows(data: ApiData, exp: Experiment, seed: SeedOption, modelOpt: ModelOption): Resolved[] {
  const names = modelOpt === "all" ? ALL_MODEL_NAMES : [modelOpt as string];
  return names.map(n => resolveModel(data, exp, seed, n)).filter((r): r is Resolved => r !== null);
}

function checkAvail(exp: Experiment, seed: SeedOption, modelOpt: ModelOption): { ok: boolean; reason?: string } {
  const f = FLAT_MODELS as readonly string[];
  if (exp === "exp_b" && modelOpt !== "all" && f.includes(modelOpt)) {
    return { ok: false, reason: `EXP-B (Sequence + TAG features) was run for LSTM and GRU only. "${modelOpt}" has no EXP-B result in this artifact.` };
  }
  if (seed !== 42 && seed !== "mean" && modelOpt !== "all" && f.includes(modelOpt)) {
    return { ok: false, reason: `Per-seed results beyond seed 42 are only recorded for LSTM and GRU. "${modelOpt}" was run at a single seed (42) only.` };
  }
  if (seed === "mean" && modelOpt !== "all" && f.includes(modelOpt)) {
    return { ok: false, reason: `Mean across seeds is only recorded for LSTM and GRU. "${modelOpt}" was run at a single seed (42) only.` };
  }
  return { ok: true };
}

// ─── Formatting ────────────────────────────────────────────────────────────────

function fmt(n: number | null, d = 4): string {
  if (n === null) return "—";
  return n.toFixed(d);
}
function fmtMs(n: number | null): string {
  if (n === null) return "—";
  if (n < 0.001) return `${(n * 1_000_000).toFixed(1)} µs`;
  if (n < 1)     return `${(n * 1_000).toFixed(1)} ms`;
  return `${n.toFixed(2)} s`;
}
function metricVal(r: Resolved, k: MetricKey): number | null {
  if (k === "accuracy")  return r.accuracy;
  if (k === "precision") return r.precision;
  if (k === "recall")    return r.recall;
  if (k === "f1")        return r.f1;
  if (k === "roc_auc")   return r.roc_auc;
  if (k === "pr_auc")    return r.pr_auc;
  if (k === "train_time") return r.train_time_sec;
  if (k === "infer_time") return r.inference_time_per_seq_sec;
  return null;
}
function expLabel(e: Experiment) { return e === "exp_a" ? "EXP-A (Sequence only)" : "EXP-B (Sequence + TAG)"; }
function seedLabel(s: SeedOption) { return s === "mean" ? "Mean (seeds 11–55)" : `Seed ${s}`; }

// ─── Confusion matrix derivation ───────────────────────────────────────────────

type CM = { tp: number; tn: number; fp: number; fn: number };
function deriveConfusion(r: Resolved, testDist: ClassDist): CM | null {
  if (r.precision === null || r.recall === null || r.accuracy === null) return null;
  const pos = testDist.positive;
  const neg = testDist.negative;
  const tp = Math.round(r.recall * pos);
  const fn = pos - tp;
  const fp = r.precision > 0 ? Math.round(tp / r.precision - tp) : 0;
  const tn = neg - fp;
  return { tp, tn: Math.max(0, tn), fp: Math.max(0, fp), fn };
}

// ─── Components ────────────────────────────────────────────────────────────────

function PilotDisclaimer({ warning }: { warning: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-xl mt-0.5">⚠</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-amber-800 text-sm">Pilot Data Notice — Technical Validation Only</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wide">PILOT ONLY</span>
          </div>
          <p className="text-amber-700 text-xs mt-2 leading-relaxed">
            These outputs use <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">proxy_behavioral</code> labels
            derived from the attempt stream. Proxy-target circularity is present.
            Results are pilot-only and must <strong>not</strong> be interpreted as:
            research findings, model superiority, H5 confirmation, effect size, or generalizable performance.
          </p>
          <p className="text-amber-600 text-xs mt-1.5 italic">{warning}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono bg-white/70 border border-amber-200 rounded-lg p-3">
        <span className="text-[#64748B]">evaluation_purpose</span><span className="text-[#0F172A]">= technical_pipeline_validation</span>
        <span className="text-[#64748B]">label_source</span><span className="text-[#0F172A]">= proxy_behavioral</span>
        <span className="text-[#64748B]">label_validity</span><span className="text-[#0F172A]">= pilot_only</span>
        <span className="text-[#64748B]">proxy_target_circularity</span><span className="text-[#0F172A]">= true</span>
        <span className="text-[#64748B]">confirmatory_analysis_allowed</span><span className="text-[#0F172A]">= false</span>
      </div>
    </div>
  );
}

function NotFinalBadge() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white tracking-wide">
        ⚠ NOT FINAL RESEARCH RESULTS
      </span>
      <span className="text-xs text-[#94A3B8]">pilot metrics only — 10 learners, proxy labels, confirmatory analysis not permitted</span>
    </div>
  );
}

function CtrlBtn({ active, onClick, children, disabled, title }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${active ? "bg-[#F37021] text-white" : disabled ? "bg-[#F1F5F9] text-[#CBD5E1] cursor-not-allowed" : "bg-white border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}
    >
      {children}
    </button>
  );
}

function ControlBar({
  exp, seed, modelOpt, metric, display,
  setExp, setSeed, setModelOpt, setMetric, setDisplay,
}: {
  exp: Experiment; seed: SeedOption; modelOpt: ModelOption; metric: MetricKey; display: DisplayMode;
  setExp: (v: Experiment) => void; setSeed: (v: SeedOption) => void;
  setModelOpt: (v: ModelOption) => void; setMetric: (v: MetricKey) => void;
  setDisplay: (v: DisplayMode) => void;
}) {
  const f = FLAT_MODELS as readonly string[];
  return (
    <div className="bg-white rounded-2xl border border-[#FED7AA] px-5 py-4 space-y-3">
      <p className="text-xs font-semibold text-[#0F172A]">Result View Controls</p>
      <div className="flex flex-wrap gap-4">
        {/* Experiment */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Experiment</p>
          <div className="flex gap-1">
            <CtrlBtn active={exp === "exp_a"} onClick={() => setExp("exp_a")}>EXP-A — Sequence only</CtrlBtn>
            <CtrlBtn active={exp === "exp_b"} onClick={() => setExp("exp_b")}>EXP-B — Sequence + TAG</CtrlBtn>
          </div>
        </div>
        {/* Seed */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Seed</p>
          <div className="flex gap-1 flex-wrap">
            {SEEDS.map(s => {
              const disabled = s !== 42 && s !== "mean" && modelOpt !== "all" && f.includes(modelOpt as string);
              const title = disabled ? `Seed ${s} only available for LSTM / GRU` : undefined;
              return <CtrlBtn key={String(s)} active={seed === s} onClick={() => setSeed(s)} disabled={disabled} title={title}>{s === "mean" ? "Mean" : s}</CtrlBtn>;
            })}
          </div>
        </div>
        {/* Model */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Model</p>
          <div className="flex gap-1 flex-wrap">
            {(["all", ...ALL_MODEL_NAMES] as ModelOption[]).map(m => {
              const wouldDisable = (exp === "exp_b" && m !== "all" && f.includes(m as string)) ||
                                   (seed !== 42 && seed !== "mean" && m !== "all" && f.includes(m as string)) ||
                                   (seed === "mean" && m !== "all" && f.includes(m as string));
              return (
                <CtrlBtn key={m} active={modelOpt === m} onClick={() => setModelOpt(m)} disabled={wouldDisable}
                  title={wouldDisable ? "Not available for this experiment/seed combination" : undefined}>
                  {m === "all" ? "All" : m}
                </CtrlBtn>
              );
            })}
          </div>
        </div>
        {/* Metric */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Metric</p>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(METRIC_LABELS) as MetricKey[]).map(k => (
              <CtrlBtn key={k} active={metric === k} onClick={() => setMetric(k)}>{METRIC_LABELS[k]}</CtrlBtn>
            ))}
          </div>
        </div>
        {/* Display */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Display</p>
          <div className="flex gap-1">
            <CtrlBtn active={display === "table"} onClick={() => setDisplay("table")}>Table</CtrlBtn>
            <CtrlBtn active={display === "chart"} onClick={() => setDisplay("chart")}>Chart</CtrlBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function DisabledState({ reason }: { reason: string }) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 flex items-start gap-3">
      <span className="text-amber-500 text-lg mt-0.5">⊘</span>
      <div>
        <p className="text-sm font-semibold text-amber-800">Combination not available in this artifact</p>
        <p className="text-xs text-amber-700 mt-1">{reason}</p>
        <p className="text-xs text-amber-600 mt-2">Adjust the Experiment, Seed, or Model selectors above to view available data.</p>
      </div>
    </div>
  );
}

// Simple SVG bar chart
function BarChart({ rows, metricKey, title }: { rows: Resolved[]; metricKey: MetricKey; title: string }) {
  const isTime = metricKey === "train_time" || metricKey === "infer_time";
  const vals = rows.map(r => metricVal(r, metricKey));
  const max = vals.reduce<number>((m, v) => (v !== null && v > m ? v : m), isTime ? 0.001 : 1);
  const W = 560; const H = 180;
  const PAD = { t: 30, r: 20, b: 56, l: isTime ? 68 : 44 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const n = rows.length;
  const gap = 8;
  const bW = Math.max(18, Math.min(56, (cW - gap * (n + 1)) / n));
  const totalBarsW = (bW + gap) * n;
  const startX = PAD.l + (cW - totalBarsW) / 2;

  const yTicks = isTime ? [] : [0, 0.25, 0.5, 0.75, 1.0];

  function barX(i: number) { return startX + i * (bW + gap); }
  function barH(v: number | null) { return v === null ? 0 : Math.max(2, (v / max) * cH); }
  function barY(v: number | null) { return PAD.t + cH - barH(v); }
  function fmtVal(v: number | null) { return v === null ? "—" : isTime ? fmtMs(v) : v.toFixed(2); }

  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold text-[#475569] mb-2">{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" aria-label={title}>
        {/* Y-axis ticks */}
        {yTicks.map(t => {
          const y = PAD.t + cH - t * cH;
          return (
            <g key={t}>
              <line x1={PAD.l - 4} y1={y} x2={PAD.l + cW} y2={y} stroke="#E2E8F0" strokeWidth={1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94A3B8">{t.toFixed(2)}</text>
            </g>
          );
        })}
        {/* X/Y axes */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH} stroke="#CBD5E1" strokeWidth={1} />
        <line x1={PAD.l} y1={PAD.t + cH} x2={PAD.l + cW} y2={PAD.t + cH} stroke="#CBD5E1" strokeWidth={1} />
        {/* Bars */}
        {rows.map((r, i) => {
          const v = metricVal(r, metricKey);
          const h = barH(v);
          const x = barX(i);
          const y = barY(v);
          const color = MODEL_COLORS[r.name] ?? "#94A3B8";
          return (
            <g key={r.name}>
              <rect x={x} y={y} width={bW} height={h} fill={color} rx={3} opacity={0.85} />
              <text x={x + bW / 2} y={y - 4} textAnchor="middle" fontSize={8} fill="#475569" fontWeight="500">{fmtVal(v)}</text>
              <text x={x + bW / 2} y={PAD.t + cH + 10} textAnchor="middle" fontSize={7.5} fill="#64748B">
                {r.name.length > 10 ? r.name.split(" ").map((w, wi) => (
                  <tspan key={wi} x={x + bW / 2} dy={wi === 0 ? 0 : 9}>{w}</tspan>
                )) : r.name}
              </text>
            </g>
          );
        })}
        {/* Y-axis label */}
        <text transform={`rotate(-90)`} x={-(PAD.t + cH / 2)} y={12} textAnchor="middle" fontSize={9} fill="#94A3B8">{METRIC_LABELS[metricKey]}</text>
      </svg>
    </div>
  );
}

function ResultsTable({ rows, metric }: { rows: Resolved[]; metric: MetricKey }) {
  const overview = metric === "overview";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#F8FAFC] text-[#475569] border-b border-[#E2E8F0]">
            <th className="text-left px-4 py-2.5">Model</th>
            {(overview || metric === "accuracy")   && <th className="text-right px-3 py-2.5">Accuracy</th>}
            {(overview || metric === "precision")  && <th className="text-right px-3 py-2.5">Precision</th>}
            {(overview || metric === "recall")     && <th className="text-right px-3 py-2.5">Recall</th>}
            {(overview || metric === "f1")         && <th className="text-right px-3 py-2.5">F1</th>}
            {(overview || metric === "roc_auc")    && <th className="text-right px-3 py-2.5">ROC-AUC</th>}
            {(overview || metric === "pr_auc")     && <th className="text-right px-3 py-2.5">PR-AUC</th>}
            {(overview || metric === "train_time") && <th className="text-right px-3 py-2.5">Train</th>}
            {(overview || metric === "infer_time") && <th className="text-right px-3 py-2.5">Infer/seq</th>}
            {overview && <th className="text-right px-3 py-2.5">Params</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-[#F1F5F9] hover:bg-[#FAFAFA]">
              <td className="px-4 py-2.5">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: MODEL_COLORS[r.name] ?? "#94A3B8" }} />
                <span className="font-medium text-[#0F172A]">{r.name}</span>
              </td>
              {(overview || metric === "accuracy")   && <td className="px-3 py-2.5 text-right font-mono">{fmt(r.accuracy)}</td>}
              {(overview || metric === "precision")  && <td className="px-3 py-2.5 text-right font-mono">{fmt(r.precision)}</td>}
              {(overview || metric === "recall")     && <td className="px-3 py-2.5 text-right font-mono">{fmt(r.recall)}</td>}
              {(overview || metric === "f1")         && <td className="px-3 py-2.5 text-right font-mono">{fmt(r.f1)}</td>}
              {(overview || metric === "roc_auc")    && <td className="px-3 py-2.5 text-right font-mono">{fmt(r.roc_auc)}</td>}
              {(overview || metric === "pr_auc")     && <td className="px-3 py-2.5 text-right font-mono">{r.pr_auc !== null ? fmt(r.pr_auc) : <span className="text-[#CBD5E1]" title="PR-AUC ไม่ถูก record ใน combination นี้">N/A</span>}</td>}
              {(overview || metric === "train_time") && <td className="px-3 py-2.5 text-right font-mono">{fmtMs(r.train_time_sec)}</td>}
              {(overview || metric === "infer_time") && <td className="px-3 py-2.5 text-right font-mono">{fmtMs(r.inference_time_per_seq_sec)}</td>}
              {overview && <td className="px-3 py-2.5 text-right font-mono">{r.parameters ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some(r => r.precision === null && metric !== "train_time" && metric !== "infer_time") && (
        <p className="text-[10px] text-[#94A3B8] mt-2 px-1">
          — indicates metric not recorded for this experiment/seed combination.
          Precision, Recall, PR-AUC, Timing are only available at EXP-A / Seed 42 (primary comparison).
          N/A = metric undefined for this combination — not zero.
        </p>
      )}
    </div>
  );
}

function ConfusionMatrix({ cm, modelName, testDist }: { cm: CM; modelName: string; testDist: ClassDist }) {
  const total = cm.tp + cm.tn + cm.fp + cm.fn;
  function cell(v: number, label: string, bg: string) {
    return (
      <div className={`${bg} rounded-lg flex flex-col items-center justify-center py-3 px-2 min-w-[72px]`}>
        <span className="text-xl font-bold text-[#0F172A]">{v}</span>
        <span className="text-[10px] text-[#64748B] mt-0.5">{label}</span>
        <span className="text-[10px] text-[#94A3B8]">{total > 0 ? ((v / total) * 100).toFixed(0) : 0}%</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#475569]">Confusion Matrix — {modelName} (derived from stored metrics at seed 42)</p>
      <div className="flex gap-1 text-[10px] text-[#94A3B8] mb-0.5">
        <div className="min-w-[72px]" />
        <div className="flex-1 text-center">Predicted Negative</div>
        <div className="flex-1 text-center">Predicted Positive</div>
      </div>
      <div className="flex gap-1 items-center">
        <div className="text-[10px] text-[#94A3B8] writing-vertical mr-1">Actual Pos</div>
        {cell(cm.tp, "True Pos", "bg-green-50")}
        {cell(cm.fn, "False Neg", "bg-red-50")}
      </div>
      <div className="flex gap-1 items-center">
        <div className="text-[10px] text-[#94A3B8] writing-vertical mr-1">Actual Neg</div>
        {cell(cm.fp, "False Pos", "bg-red-50")}
        {cell(cm.tn, "True Neg", "bg-green-50")}
      </div>
      <p className="text-[10px] text-amber-600">Note: Derived mathematically from precision/recall/accuracy. {testDist.positive + testDist.negative} test sequences, {testDist.positive} positive, {testDist.negative} negative.</p>
    </div>
  );
}

function MetricCards({ r, exp, seed }: { r: Resolved; exp: Experiment; seed: SeedOption }) {
  const cards: { label: string; value: string; note?: string }[] = [
    { label: "Accuracy",  value: fmt(r.accuracy),  note: r.accuracy === null ? "not in this combination" : undefined },
    { label: "F1 Score",  value: fmt(r.f1),         note: r.f1 === null       ? "not in this combination" : undefined },
    { label: "ROC-AUC",   value: fmt(r.roc_auc),    note: r.roc_auc === null  ? "not in this combination" : undefined },
    { label: "PR-AUC",    value: r.pr_auc !== null ? fmt(r.pr_auc) : "N/A", note: r.pr_auc === null ? "available at EXP-A Seed 42 only" : undefined },
    ...(r.precision !== null ? [{ label: "Precision", value: fmt(r.precision) }] : []),
    ...(r.recall    !== null ? [{ label: "Recall",    value: fmt(r.recall) }]    : []),
    ...(r.train_time_sec !== null            ? [{ label: "Train Time",  value: fmtMs(r.train_time_sec) }]            : []),
    ...(r.inference_time_per_seq_sec !== null ? [{ label: "Infer/seq",  value: fmtMs(r.inference_time_per_seq_sec) }] : []),
    ...(r.parameters !== null ? [{ label: "Parameters", value: String(r.parameters) }] : []),
  ];
  const label = `${expLabel(exp)} — ${seedLabel(seed)}`;
  return (
    <div className="space-y-2">
      <p className="text-xs text-[#64748B]">{label}</p>
      <div className="flex flex-wrap gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 min-w-[110px]">
            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{c.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${c.note ? "text-[#CBD5E1]" : "text-[#0F172A]"}`}>{c.value}</p>
            {c.note && <p className="text-[10px] text-[#94A3B8]">{c.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingConfig({ name, cfg, exp }: { name: string; cfg: ModelConfig; exp: Experiment }) {
  const isExpB = exp === "exp_b";
  const params = isExpB ? cfg.trainable_params_exp_b : cfg.trainable_params_exp_a;
  const inFeats = isExpB ? cfg.input_features_exp_b : cfg.input_features_exp_a;
  const arch = isExpB
    ? (cfg.architecture_exp_b ?? cfg.architecture)
    : (cfg.architecture_exp_a ?? cfg.architecture);
  const rows: [string, string][] = [
    ["Recurrent cell",        cfg.cell_type],
    ["Hidden size",           String(cfg.hidden_size)],
    ["Dropout",               String(cfg.dropout)],
    ["Learning rate",         String(cfg.learning_rate)],
    ["Optimizer",             cfg.optimizer],
    ["Batch size",            String(cfg.batch_size)],
    ["Max epochs",            String(cfg.max_epochs)],
    ["Early-stop patience",   `${cfg.early_stop_patience} epochs`],
    ["Input features",        String(inFeats)],
    ["TAG features (EXP-B)",  String(cfg.tag_features_exp_b)],
    ["Max sequence length",   `${cfg.max_sequence_length} steps`],
    ["Trainable parameters",  String(params)],
    ["Architecture",          arch],
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-[#0F172A]">Recorded Training Configuration — {name}</p>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]">Read only</span>
      </div>
      <p className="text-[10px] text-[#94A3B8]">Configuration used to produce this recorded artifact. No hyperparameter editing or retraining available in this view.</p>
      {name === "GRU" && (
        <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          หมายเหตุ GRU parameters: EXP-A (Sequence only) = 4,257 params (input=10 features).
          EXP-B (Sequence + TAG) = 4,275 params (input=28 features = 10 seq + 18 TAG).
          ค่า 4,257 ในตาราง comparison คือ EXP-A primary comparison (seed 42).
        </p>
      )}
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-[#F8FAFC]">
              <td className="py-1.5 pr-4 text-[#64748B] w-[200px]">{k}</td>
              <td className="py-1.5 font-mono text-[#0F172A]">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelDetail({ r, data, exp, seed }: { r: Resolved; data: ApiData; exp: Experiment; seed: SeedOption }) {
  const isSeq = (SEQ_MODELS as readonly string[]).includes(r.name);
  const cfgKey = r.name === "LSTM" ? "lstm" : r.name === "GRU" ? "gru" : null;
  const cfg = cfgKey && data.model_configs ? data.model_configs[cfgKey] : null;
  const testDist: ClassDist = data.model_comparison.test_class_distribution ?? { positive: 9, negative: 9 };
  const cm = deriveConfusion(r, testDist);
  const interp = r.accuracy === 1.0 && r.f1 === 1.0
    ? `All metrics at 1.0 for ${r.name} in this pilot. This is a pipeline validation artifact caused by proxy-target circularity — behavioral features directly encode the proxy label. This does not indicate real model performance.`
    : r.accuracy !== null && r.accuracy < 1.0
    ? `${r.name} shows accuracy ${fmt(r.accuracy, 2)} in this seed/experiment combination. Variation reflects the instability expected on a 10-learner pilot dataset, not a meaningful performance difference.`
    : "Metrics partially unavailable for this combination — see Overview table or select Seed 42 EXP-A for full results.";

  return (
    <div className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-6">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full inline-block" style={{ background: MODEL_COLORS[r.name] ?? "#94A3B8" }} />
        <h2 className="font-semibold text-[#0F172A] text-sm">Model Detail — {r.name}</h2>
        {isSeq && <span className="text-[10px] text-[#F37021] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Sequence model</span>}
      </div>

      <MetricCards r={r} exp={exp} seed={seed} />

      {cm && <ConfusionMatrix cm={cm} modelName={r.name} testDist={testDist} />}

      {cfg && <TrainingConfig name={r.name} cfg={cfg} exp={exp} />}

      <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">Technical Interpretation (pipeline validation only)</p>
        <p className="text-xs text-[#475569] leading-relaxed">{interp}</p>
        <p className="text-[10px] text-amber-600 mt-2">⚠ Do not interpret as research finding, H5 confirmation, or model superiority claim.</p>
      </div>

      <p className="text-xs text-[#94A3B8]">For ROC curves and combined confusion matrices across all models, see Pilot Charts below.</p>
    </div>
  );
}

const METRIC_HELP: { term: string; def: string }[] = [
  { term: "Accuracy", def: "Proportion of all predictions (positive and negative) that the model got correct. At 1.0 on this 10-learner pilot, all 18 test sequences were correctly classified — a circularity artifact, not a real performance claim." },
  { term: "Precision", def: "Among all sequences the model predicted as at-risk, what fraction truly were at-risk. Undefined (reported as 0) when the model makes no positive predictions (Dummy)." },
  { term: "Recall", def: "Among all truly at-risk sequences, what fraction did the model correctly identify. Also called Sensitivity or True Positive Rate." },
  { term: "F1 Score", def: "Harmonic mean of Precision and Recall. Balances both concerns. More informative than accuracy on imbalanced classes. On this pilot the classes are balanced (9 positive, 9 negative)." },
  { term: "ROC-AUC", def: "Area under the Receiver Operating Characteristic curve. Measures the model's ability to rank at-risk sequences above safe ones across all thresholds. 0.5 = random; 1.0 = perfect separation. Values of 1.0 here reflect circularity in the proxy label." },
  { term: "Training Time", def: "Wall-clock time to train the model on the 72 training sequences (one run). sklearn models (LR, RF) train in milliseconds; PyTorch models (LSTM, GRU) take seconds due to per-epoch gradient descent. Framework differences make direct comparison misleading." },
  { term: "Inference Time / seq", def: "Average time to produce one prediction at inference. Measured on 18 test sequences with Python time.perf_counter(). Microsecond-range for sklearn; tens of microseconds for PyTorch (after JIT warm-up)." },
  { term: "PR-AUC", def: "พื้นที่ใต้ Precision–Recall Curve (Area under the Precision-Recall Curve). วัดความสามารถของโมเดลในการจัดลำดับผู้เรียนที่มีความเสี่ยงสูงเมื่อ class distribution ไม่สมดุล (เน้น positive class). 0.5 = random; 1.0 = perfect. ค่า PR-AUC 1.0 ในนี้เป็น artifact ของ proxy-target circularity เช่นเดียวกับ ROC-AUC. PR-AUC = N/A หมายความว่าไม่ถูก record ใน combination นี้ — ไม่ใช่ค่า 0." },
  { term: "Trainable Parameters", def: "Number of learnable weights in the model. Dummy has none; LR has 18 (one per flat feature); LSTM EXP-A has 5,665 (LSTM: 5,632 + fc Linear(32→1): 33); LSTM EXP-B has 5,683 (LSTM: 5,632 + fc Linear(50→1): 51 — TAG(18) concat adds 18 fc input weights); GRU EXP-A has 4,257; GRU EXP-B has 4,275. Larger parameter count does not imply better performance on this pilot." },
];

function HelpSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#FAFAFA] transition-colors">
        <span className="text-sm font-semibold text-[#0F172A]">What do these metrics mean?</span>
        <span className="text-[#94A3B8] text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-6 pb-5 space-y-3 border-t border-[#F1F5F9]">
          {METRIC_HELP.map(({ term, def }) => (
            <div key={term} className="pt-3">
              <p className="text-xs font-semibold text-[#0F172A]">{term}</p>
              <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{def}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ModelResultsPage() {
  const router = useRouter();
  const [data,    setData]     = useState<ApiData | null>(null);
  const [error,   setError]    = useState<string | null>(null);

  // Controls
  const [exp,      setExp]      = useState<Experiment>("exp_a");
  const [seed,     setSeed]     = useState<SeedOption>(42);
  const [modelOpt, setModelOpt] = useState<ModelOption>("all");
  const [metric,   setMetric]   = useState<MetricKey>("overview");
  const [display,  setDisplay]  = useState<DisplayMode>("table");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      const res = await fetch("/api/researcher/model-results", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setError("Unauthorized or unavailable."); return; }
      setData(await res.json());
    }
    load();
  }, [router]);

  // Auto-deselect flat models when they become unavailable for the chosen exp/seed
  useEffect(() => {
    const f = FLAT_MODELS as readonly string[];
    const flatSelected = f.includes(modelOpt as string);
    if (!flatSelected) return;
    const needsReset =
      exp === "exp_b" ||
      (seed !== 42 && seed !== "mean");
    if (needsReset) queueMicrotask(() => { setModelOpt("all"); });
  }, [exp, seed, modelOpt]);

  if (error) return (
    <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );
  if (!data) return (
    <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading...</div>
  );

  const avail = checkAvail(exp, seed, modelOpt);
  const rows  = avail.ok ? getRows(data, exp, seed, modelOpt) : [];
  const isSingle = modelOpt !== "all";
  const singleRow = isSingle && rows.length === 1 ? rows[0] : null;

  const chartMetric: MetricKey = metric === "overview" ? "f1" : metric;
  const resultTitle = `${METRIC_LABELS[metric === "overview" ? "overview" : metric]} — ${expLabel(exp)}, ${seedLabel(seed)}${modelOpt !== "all" ? `, ${modelOpt}` : ""}`;
  const chartTitle  = `${METRIC_LABELS[chartMetric]} — ${expLabel(exp)}, ${seedLabel(seed)}`;

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">Model Results</p>
          <p className="text-xs text-[#64748B]">Phase 4 Pilot — Sequential Learning Analytics</p>
        </div>
        <Link href="/researcher/dashboard" className="text-xs text-[#F37021] hover:underline">← Dashboard</Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        <PilotDisclaimer warning={data.data_warning} />

        {/* Note: dimension filters do not apply to model comparison */}
        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 flex items-start gap-3">
          <span className="text-[#94A3B8] text-base mt-0.5">ℹ</span>
          <div>
            <p className="text-xs font-semibold text-[#475569]">ผลการเปรียบเทียบโมเดลไม่เปลี่ยนตามมิติการวิเคราะห์</p>
            <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">
              โมเดลใน Phase 4 ถูก train และ evaluate บน dataset รวมทั้งหมด (10 learners) ยังไม่มีผลการ train/evaluate แยกตาม
              ชุดกิจกรรม (batch_type) หรือ ประเภทโจทย์ (task_type) — ตัวกรองมิติมีผลเฉพาะ Dataset Statistics ใน Analytics Summary
            </p>
          </div>
        </div>

        <ControlBar exp={exp} seed={seed} modelOpt={modelOpt} metric={metric} display={display}
          setExp={setExp} setSeed={setSeed} setModelOpt={setModelOpt} setMetric={setMetric} setDisplay={setDisplay} />

        {/* Results */}
        {!avail.ok ? (
          <DisabledState reason={avail.reason ?? "Combination not available."} />
        ) : (
          <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#FED7AA] space-y-2">
              <NotFinalBadge />
              <h2 className="font-semibold text-[#0F172A] text-sm">{resultTitle}</h2>
              {metric === "overview" && display === "chart" && (
                <p className="text-xs text-[#94A3B8]">Chart shows F1 Score — select a specific metric above for other comparisons.</p>
              )}
            </div>
            <div className="px-6 py-5">
              {display === "table"
                ? <ResultsTable rows={rows} metric={metric} />
                : rows.length > 0
                  ? <BarChart rows={rows} metricKey={chartMetric} title={chartTitle} />
                  : <p className="text-xs text-[#94A3B8]">No data available for this combination.</p>
              }
            </div>
          </section>
        )}

        {/* Model Detail */}
        {singleRow && avail.ok && (
          <ModelDetail r={singleRow} data={data} exp={exp} seed={seed} />
        )}

        {/* Seed stability table (always shown when EXP-A or B is selected and All or seq model) */}
        {(modelOpt === "all" || (SEQ_MODELS as readonly string[]).includes(modelOpt as string)) && (
          <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5 space-y-4">
            <h2 className="font-semibold text-[#0F172A] text-sm">Seed Stability — {exp === "exp_a" ? "EXP-A (Sequence only)" : "EXP-B (Sequence + TAG)"}</h2>
            <p className="text-xs text-[#64748B]">LSTM and GRU across all 5 seeds. Only accuracy, F1, and ROC-AUC are recorded per individual seed.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(["LSTM", "GRU"] as const).map(mName => {
                const key     = mName === "LSTM" ? "lstm" : "gru";
                const expData = exp === "exp_a" ? data.seed_stability[key].exp_a_seq_only : data.seed_stability[key].exp_b_seq_plus_tag;
                return (
                  <div key={mName}>
                    <p className="text-xs font-bold mb-1" style={{ color: MODEL_COLORS[mName] }}>{mName}</p>
                    <p className="text-xs text-[#64748B] mb-2">
                      Mean — Acc: <strong>{expData.accuracy_mean.toFixed(2)}</strong> &nbsp;
                      F1: <strong>{expData.f1_mean.toFixed(2)}</strong> &nbsp;
                      AUC: <strong>{expData.roc_auc_mean.toFixed(2)}</strong> &nbsp;
                      Train: <strong>{fmtMs(expData.train_time_sec_mean)}</strong>
                    </p>
                    <table className="w-full text-xs">
                      <thead><tr className="bg-[#F1F5F9] text-[#475569]">
                        <th className="text-left px-3 py-1.5">Seed</th>
                        <th className="text-right px-3 py-1.5">Acc</th>
                        <th className="text-right px-3 py-1.5">F1</th>
                        <th className="text-right px-3 py-1.5">AUC</th>
                      </tr></thead>
                      <tbody>
                        {expData.seeds.map(s => (
                          <tr key={s.seed} className={`border-b border-[#F1F5F9] ${s.accuracy < 1 ? "bg-amber-50" : ""}`}>
                            <td className="px-3 py-1.5 font-mono">{s.seed}{s.seed === seed ? " ★" : ""}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{s.accuracy.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{s.f1.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{s.roc_auc.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              ⚠ Seed 11 degrades in EXP-B. Expected instability on 10-learner synthetic data — not an interpretable performance difference.
            </p>
          </section>
        )}

        <HelpSection />

        {/* Pilot charts */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5 space-y-5">
          <div className="space-y-1">
            <h2 className="font-semibold text-[#0F172A] text-sm">Pilot Charts — All Models, Seed 42</h2>
            <p className="text-xs text-[#64748B]">All charts are watermarked as pilot-only pipeline validation. Not suitable for thesis conclusions.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.charts.map(c => (
              <div key={c.key} className="space-y-1.5">
                <p className="text-xs font-medium text-[#475569]">{c.title}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.path} alt={c.title} className="w-full rounded-lg border border-[#E2E8F0]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            ))}
          </div>
        </section>

        {/* Validation gate */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5">
          <h2 className="font-semibold text-[#0F172A] text-sm mb-2">Pipeline Validation Gate</h2>
          <p className="text-sm text-green-700 font-medium">
            ✅ {data.validation.checks_passed} / {data.validation.checks_run} checks passed
          </p>
        </section>

      </main>
    </div>
  );
}
