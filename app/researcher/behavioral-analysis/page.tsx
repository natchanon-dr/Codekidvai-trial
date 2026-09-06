"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";
import { BehavioralCompareModal } from "@/app/researcher/_components/BehavioralCompareModal";
import { TaskTypeIcon } from "@/lib/task-type-utils";
import type { BehavioralDatasetRecord, BehavioralRunRecord } from "@/app/api/researcher/behavioral-analysis/route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_COMPARE = 3;
const PAGE_SIZE = 10;

const DATASET_TASK_TYPES_IN_SCOPE = ["sql_text", "stored_procedure", "sql_block", "er_diagram"] as const;
const DATASET_TASK_LABEL: Record<string, string> = {
  sql_text: "SQL Query",
  sql_block: "Query Block",
  stored_procedure: "Stored Procedure",
  er_diagram: "ER Diagram",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetailTarget = {
  datasetId: string;
  runId: string;
  runNumber: string;
  datasetCode: string;
  datasetName: string;
  run: BehavioralRunRecord;
};

type SelectedRun = {
  datasetId: string;
  runId: string;
  runNumber: string;
  datasetCode: string;
  datasetName: string;
};

type ListResponse = {
  datasets: BehavioralDatasetRecord[];
  filter_options: {
    batch_types: string[];
    set_families: string[];
    task_types: string[];
    run_statuses: string[];
    usage_statuses: string[];
  };
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function StarIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function DumbbellIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6.5 6.5h1v11h-1z" /><path d="M16.5 6.5h1v11h-1z" />
      <path d="M4.5 8.5h3" /><path d="M16.5 8.5h3" />
      <path d="M4.5 15.5h3" /><path d="M16.5 15.5h3" />
      <path d="M7.5 12h9" />
    </svg>
  );
}

function PaperAirplaneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    running: "bg-blue-100 text-blue-700 border-blue-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const cls = colorMap[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline detail modal
// ---------------------------------------------------------------------------

type BehavioralLearnerMetrics = {
  profile_id: string;
  total_sessions: number;
  total_attempts: number;
  correct_attempts: number;
  attempt_success_rate: number;
  avg_session_duration_seconds: number;
  total_events: number;
  submission_count: number;
  submission_rate: number;
  error_attempt_count: number;
  error_rate: number;
  avg_attempts_per_session: number;
};

type BehavioralResult = {
  schema_version: string;
  computed_at: string;
  feature_version: string;
  implemented_feature_count: number;
  deferred_feature_count: number;
  deferred_features: string[];
  learner_count: number;
  per_learner: BehavioralLearnerMetrics[];
  aggregate: {
    avg_total_sessions: number;
    avg_attempt_success_rate: number;
    avg_error_rate: number;
    avg_submission_rate: number;
    avg_session_duration_seconds: number;
  };
};

type RiskPrediction = {
  profile_id: string;
  feature_values: Record<string, number>;
  lr_predicted_label: "success" | "at_risk";
  lr_probability_success: number;
  rf_predicted_label: "success" | "at_risk" | null;
  rf_probability_success: number | null;
  lstm_predicted_label: "success" | "at_risk" | null;
  lstm_probability_success: number | null;
  gru_predicted_label: "success" | "at_risk" | null;
  gru_probability_success: number | null;
};

type RiskClassificationResult = {
  learner_count: number;
  rf_applied_count: number;
  sequence_applied_count: number;
  models_used: {
    e1_logistic_regression: { feature_names: string[]; cv_metrics: { accuracy: number; f1: number }; pilot_warning: string };
    e2_random_forest: { feature_names: string[]; cv_metrics: { accuracy: number; f1: number }; pilot_warning: string } | null;
    e3_lstm: { cv_metrics: { accuracy: number; f1: number }; pilot_warning: string } | null;
    e4_gru: { cv_metrics: { accuracy: number; f1: number }; pilot_warning: string } | null;
  };
  predictions: RiskPrediction[];
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// Formats an ISO timestamp as "02 Sep 2026 01:21:02 PM" (day-month-year, 12h clock).
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  const hours24 = d.getHours();
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = String(hours24 % 12 === 0 ? 12 : hours24 % 12).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${day} ${month} ${year} ${hours12}:${minutes}:${seconds} ${ampm}`;
}

// Buckets a list of numeric values into evenly-sized bins for a distribution
// histogram (e.g. session counts, avg durations across the learner cohort).
function buildHistogram(values: number[], binCount = 6): { range: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ range: `${min}`, count: values.length }];

  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    start: min + i * width,
    end: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
    bins[idx].count += 1;
  }
  return bins.map((b) => ({
    range: `${b.start.toFixed(1)}–${b.end.toFixed(1)}`,
    count: b.count,
  }));
}

// Same bucketing as buildHistogram, but over a caller-supplied fixed range
// (e.g. 0–100 for percentage rates) with a fixed bin width, instead of each
// series' own min/max — lets several rate distributions share identical,
// human-readable bin edges (0-15, 16-30, 31-45, ...) so they can be plotted
// as one grouped chart.
function buildFixedWidthHistogram(
  values: number[],
  max: number,
  width: number,
): { range: string; count: number }[] {
  const bins: { start: number; end: number; count: number }[] = [];
  let start = 0;
  let boundaryMultiple = 1;
  while (start <= max) {
    const end = Math.min(max, width * boundaryMultiple);
    bins.push({ start, end, count: 0 });
    start = end + 1;
    boundaryMultiple += 1;
  }
  for (const v of values) {
    const bin = bins.find((b) => v >= b.start && v <= b.end) ?? bins[bins.length - 1];
    bin.count += 1;
  }
  return bins.map((b) => ({ range: `${b.start}-${b.end}`, count: b.count }));
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-white px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-[#94A3B8] font-semibold">{label}</p>
      <p className="text-sm font-bold text-[#0F172A] mt-0.5">{value}</p>
    </div>
  );
}

function BehavioralDetailModal({ target, onClose }: { target: DetailTarget; onClose: () => void }) {
  const [result, setResult] = useState<BehavioralResult | null>(null);
  const [risk, setRisk] = useState<RiskClassificationResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [radarLearnerId, setRadarLearnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
      setResult(null);
      setRisk(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        mode: "detail",
        dataset_id: target.datasetId,
        run_id: target.runId,
      });

      const res = await fetch(`/api/researcher/behavioral-analysis?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (cancelled) return;

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Failed to load result." }));
        setDetailError((j as { error?: string }).error ?? "Failed to load result.");
        setDetailLoading(false);
        return;
      }

      const j = await res.json() as { result: BehavioralResult; risk_classification: RiskClassificationResult | null };
      setResult(j.result);
      setRisk(j.risk_classification);
      setRadarLearnerId(j.result.per_learner[0]?.profile_id ?? null);
      setDetailLoading(false);
    }

    void loadDetail();
    return () => { cancelled = true; };
  }, [target.datasetId, target.runId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl border border-[#FED7AA] shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#0F172A]">Behavioral Analysis</p>
            <p className="text-xs text-[#64748B] mt-0.5">
              Dataset <span className="font-mono font-semibold text-[#F37021]">{target.datasetCode}</span>
              {" "}&mdash; Run <span className="font-mono font-semibold text-[#F37021]">#{target.runNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#475569] transition-colors mt-0.5"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Run info */}
        <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] min-w-[70px]">Status:</span>
            <StatusBadge status={target.run.status} />
          </div>
          {target.run.started_at && (
            <div className="flex gap-2">
              <span className="text-xs text-[#64748B] min-w-[70px]">Started:</span>
              <span className="text-xs text-[#0F172A]">{formatDateTime(target.run.started_at)}</span>
            </div>
          )}
          {target.run.completed_at && (
            <div className="flex gap-2">
              <span className="text-xs text-[#64748B] min-w-[70px]">Completed:</span>
              <span className="text-xs text-[#0F172A]">{formatDateTime(target.run.completed_at)}</span>
            </div>
          )}
          {target.run.run_type && (
            <div className="flex gap-2">
              <span className="text-xs text-[#64748B] min-w-[70px]">Run type:</span>
              <span className="text-xs font-mono text-[#475569]">{target.run.run_type}</span>
            </div>
          )}
          {target.run.error_summary && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mt-1">
              {target.run.error_summary}
            </div>
          )}
        </div>

        {/* Result */}
        {detailLoading && (
          <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-8 text-center">
            <p className="text-sm text-[#64748B]">Loading analysis result…</p>
          </div>
        )}

        {!detailLoading && detailError && (
          <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-8 text-center">
            <p className="text-sm text-[#64748B]">{detailError}</p>
          </div>
        )}

        {!detailLoading && !detailError && result && (
          <div className="space-y-4">
            {/* Feature coverage banner */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              feature_version <span className="font-mono font-semibold">{result.feature_version}</span>
              {" "}&mdash; {result.implemented_feature_count} of{" "}
              {result.implemented_feature_count + result.deferred_feature_count} behavioral features implemented.
              {result.deferred_features.length > 0 && (
                <> Deferred: <span className="font-mono">{result.deferred_features.join(", ")}</span></>
              )}
            </div>

            {/* Aggregate stats — sessions/duration as plain numbers (StatCards),
                success/error and submission as paired progress bars since they're
                each two halves of the same 100% (success+error; submitted+not). */}
            <div>
              <p className="text-xs font-bold text-[#0F172A] mb-2">
                Aggregate ({result.learner_count} learners)
              </p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <StatCard label="Avg sessions" value={String(result.aggregate.avg_total_sessions)} />
                <StatCard label="Avg duration (s)" value={String(result.aggregate.avg_session_duration_seconds)} />
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] text-[#64748B] mb-1">
                  <span className="font-semibold text-green-700">Success Rate {pct(result.aggregate.avg_attempt_success_rate)}</span>
                  <span className="font-semibold text-red-700">Error Rate {pct(result.aggregate.avg_error_rate)}</span>
                </div>
                <div className="w-full h-4 rounded-full overflow-hidden flex border border-[#FED7AA]">
                  <div className="bg-[#16A34A] h-full" style={{ width: `${Math.round(result.aggregate.avg_attempt_success_rate * 100)}%` }} />
                  <div className="bg-[#DC2626] h-full" style={{ width: `${Math.round(result.aggregate.avg_error_rate * 100)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] text-[#64748B] mb-1">
                  <span className="font-semibold text-[#C2410C]">Submission Rate {pct(result.aggregate.avg_submission_rate)}</span>
                  <span className="font-semibold text-[#94A3B8]">No Submission {pct(1 - result.aggregate.avg_submission_rate)}</span>
                </div>
                <div className="w-full h-4 rounded-full overflow-hidden flex border border-[#FED7AA]">
                  <div className="bg-[#F37021] h-full" style={{ width: `${Math.round(result.aggregate.avg_submission_rate * 100)}%` }} />
                  <div className="bg-[#CBD5E1] h-full" style={{ width: `${Math.round((1 - result.aggregate.avg_submission_rate) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Feature Values + Predicted Risk — one merged table per learner:
                Behavioral (+ Semantic, when RF applies) feature columns, followed
                by LR (E1) / RF (E2) prediction columns when a risk_classification
                run exists. LSTM (E3) / GRU (E4) live on the Sequential Analysis
                page instead, since their input is Sequential features, not
                Behavioral. RF is shown here and on Semantic Analysis since it
                consumes both feature sets jointly. */}
            <div>
              <p className="text-xs font-bold text-[#0F172A] mb-2">Feature Values &amp; Predicted Risk</p>
              <div className="overflow-x-auto rounded-xl border border-[#FED7AA]">
                <table className="w-full text-[11px]">
                  <thead className="bg-[#FFF7ED] text-[#94A3B8] uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-[#FFF7ED]">Learner</th>
                      {risk && (
                        <>
                          <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">LR (%)</th>
                          <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">RF (%)</th>
                        </>
                      )}
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Sessions</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Attempts</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Success</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Submit</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Avg Duration (s)</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Attempts/Session</th>
                      {risk?.models_used.e2_random_forest && (
                        <>
                          <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">AST Sim</th>
                          <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Structure</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FED7AA]">
                    {result.per_learner.map((l) => {
                      const p = risk?.predictions.find((pr) => pr.profile_id === l.profile_id);
                      return (
                        <tr key={l.profile_id}>
                          <td className="px-3 py-2 font-mono text-[#475569] sticky left-0 bg-white">{l.profile_id.slice(0, 8)}…</td>
                          {risk && (
                            <>
                              <td className="px-3 py-2 text-right">
                                {p ? (
                                  <span className={p.lr_predicted_label === "success" ? "text-green-700" : "text-red-700"}>
                                    {pct(p.lr_probability_success)}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {p?.rf_probability_success !== null && p?.rf_probability_success !== undefined ? (
                                  <span className={p.rf_predicted_label === "success" ? "text-green-700" : "text-red-700"}>
                                    {pct(p.rf_probability_success)}
                                  </span>
                                ) : "—"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 text-right text-[#0F172A]">{l.total_sessions}</td>
                          <td className="px-3 py-2 text-right text-[#0F172A]">{l.total_attempts}</td>
                          <td className="px-3 py-2 text-right text-[#0F172A]">{pct(l.attempt_success_rate)}</td>
                          <td className="px-3 py-2 text-right text-[#0F172A]">{pct(l.submission_rate)}</td>
                          <td className="px-3 py-2 text-right text-[#0F172A]">{l.avg_session_duration_seconds}</td>
                          <td className="px-3 py-2 text-right text-[#0F172A]">{l.avg_attempts_per_session}</td>
                          {risk?.models_used.e2_random_forest && (
                            <>
                              <td className="px-3 py-2 text-right text-[#0F172A]">
                                {p?.feature_values.avg_ast_similarity !== undefined ? p.feature_values.avg_ast_similarity : "—"}
                              </td>
                              <td className="px-3 py-2 text-right text-[#0F172A]">
                                {p?.feature_values.avg_structure_score !== undefined ? p.feature_values.avg_structure_score : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts — visual read of the same LR/RF predictions shown in the
                table above. Per-learner bar chart for a quick outlier scan,
                plus a Success/At-risk count summary per model. */}
            {risk && risk.predictions.length > 0 && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-[#0F172A] mb-2">Predicted Success Probability by Learner</p>
                  <div className="rounded-xl border border-[#FED7AA] bg-white p-2">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={risk.predictions.map((p) => ({
                          learner: p.profile_id.slice(0, 6),
                          LR: Math.round(p.lr_probability_success * 100),
                          RF: p.rf_probability_success !== null ? Math.round(p.rf_probability_success * 100) : undefined,
                        }))}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#FED7AA" />
                        <XAxis dataKey="learner" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(value) => `${value}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="LR" fill="#F37021" name="LR (%)" />
                        {risk.models_used.e2_random_forest && <Bar dataKey="RF" fill="#0EA5E9" name="RF (%)" />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-[#0F172A] mb-2">Predicted Label Summary</p>
                  <div className="rounded-xl border border-[#FED7AA] bg-white p-2">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={(() => {
                          const lrSuccess = risk.predictions.filter((p) => p.lr_predicted_label === "success").length;
                          const rows = [
                            { model: "LR", success: lrSuccess, at_risk: risk.predictions.length - lrSuccess },
                          ];
                          if (risk.models_used.e2_random_forest) {
                            const rfPreds = risk.predictions.filter((p) => p.rf_predicted_label !== null);
                            const rfSuccess = rfPreds.filter((p) => p.rf_predicted_label === "success").length;
                            rows.push({ model: "RF", success: rfSuccess, at_risk: rfPreds.length - rfSuccess });
                          }
                          return rows;
                        })()}
                        layout="vertical"
                        margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#FED7AA" />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="model" tick={{ fontSize: 11 }} width={30} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="success" stackId="a" fill="#16A34A" name="Success" />
                        <Bar dataKey="at_risk" stackId="a" fill="#DC2626" name="At-risk" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Scatter — Success Rate vs Error Rate per learner, colored by the
                LR predicted label (falls back to a neutral color when no
                risk_classification run exists yet), to spot behavioral outliers
                and how they line up with the model's risk call. Points sharing
                the exact same (rounded) rate are grouped into one bubble sized
                by how many learners overlap there — ties are common since
                Success + Error Rate always sum to 100% and small attempt counts
                only produce a handful of distinct ratios. */}
            <div>
              <p className="text-xs font-bold text-[#0F172A] mb-2">Success Rate vs Error Rate by Learner</p>
              <div className="rounded-xl border border-[#FED7AA] bg-white p-2">
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FED7AA" />
                    <XAxis type="number" dataKey="successRate" name="Success Rate" unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="number" dataKey="errorRate" name="Error Rate" unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <ZAxis type="number" dataKey="count" range={[60, 500]} name="Learners" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const d = payload[0].payload as {
                          successRate: number;
                          errorRate: number;
                          count: number;
                          learners: string[];
                        };
                        return (
                          <div className="bg-white border border-[#FED7AA] rounded-lg px-2 py-1.5 text-[11px] shadow">
                            <p>Success {d.successRate}% · Error {d.errorRate}%</p>
                            <p className="font-semibold">{d.count} learner{d.count !== 1 ? "s" : ""}</p>
                            <p className="font-mono text-[10px] text-[#94A3B8]">{d.learners.join(", ")}</p>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {(() => {
                      const grouped = new Map<
                        string,
                        { successRate: number; errorRate: number; label: string | null; count: number; learners: string[] }
                      >();
                      for (const l of result.per_learner) {
                        const p = risk?.predictions.find((pr) => pr.profile_id === l.profile_id);
                        const successRate = Math.round(l.attempt_success_rate * 100);
                        const errorRate = Math.round(l.error_rate * 100);
                        const label = p?.lr_predicted_label ?? null;
                        const key = `${successRate}_${errorRate}_${label}`;
                        const existing = grouped.get(key);
                        if (existing) {
                          existing.count += 1;
                          existing.learners.push(l.profile_id.slice(0, 6));
                        } else {
                          grouped.set(key, { successRate, errorRate, label, count: 1, learners: [l.profile_id.slice(0, 6)] });
                        }
                      }
                      const points = Array.from(grouped.values());
                      const success = points.filter((d) => d.label === "success");
                      const atRisk = points.filter((d) => d.label === "at_risk");
                      const unlabeled = points.filter((d) => d.label === null);
                      return (
                        <>
                          {success.length > 0 && <Scatter name="Success" data={success} fill="#16A34A" fillOpacity={0.7} />}
                          {atRisk.length > 0 && <Scatter name="At-risk" data={atRisk} fill="#DC2626" fillOpacity={0.7} />}
                          {unlabeled.length > 0 && <Scatter name="No prediction" data={unlabeled} fill="#94A3B8" fillOpacity={0.7} />}
                        </>
                      );
                    })()}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-1">
                Bubble size = number of learners sharing that exact rate — hover a bubble to see who.
              </p>
            </div>

            {/* Distribution histograms — one per Feature Values column, showing
                how that feature spreads across the whole cohort so outliers a
                single aggregate average would hide are visible. Success /
                Submission / AST Similarity / Structure are all 0–100% rates, so
                they're combined into one grouped chart on shared bins instead
                of 4 separate ones. */}
            <div>
              <p className="text-xs font-bold text-[#0F172A] mb-2">Feature Distributions</p>

              <div className="mb-3">
                <p className="text-xs font-bold text-[#0F172A] mb-2">
                  <span className="text-green-700">Success</span> · <span className="text-red-600">Submission</span>
                  {risk?.models_used.e2_random_forest && (
                    <>
                      {" "}· <span className="text-teal-600">AST Sim</span> · <span className="text-pink-600">Structure</span>
                    </>
                  )}{" "}
                  Rate (%) Distribution
                </p>
                <div className="rounded-xl border border-[#FED7AA] bg-white p-2">
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart
                      data={(() => {
                        const successHist = buildFixedWidthHistogram(
                          result.per_learner.map((l) => Math.round(l.attempt_success_rate * 100)),
                          100,
                          15,
                        );
                        const submitHist = buildFixedWidthHistogram(
                          result.per_learner.map((l) => Math.round(l.submission_rate * 100)),
                          100,
                          15,
                        );
                        const astHist = risk?.models_used.e2_random_forest
                          ? buildFixedWidthHistogram(
                              risk.predictions
                                .map((p) => p.feature_values.avg_ast_similarity)
                                .filter((v): v is number => v !== undefined)
                                .map((v) => Math.round(v * 100)),
                              100,
                              15,
                            )
                          : null;
                        const structureHist = risk?.models_used.e2_random_forest
                          ? buildFixedWidthHistogram(
                              risk.predictions
                                .map((p) => p.feature_values.avg_structure_score)
                                .filter((v): v is number => v !== undefined)
                                .map((v) => Math.round(v * 100)),
                              100,
                              15,
                            )
                          : null;
                        return successHist.map((h, i) => ({
                          range: h.range,
                          Success: h.count,
                          Submission: submitHist[i]?.count ?? 0,
                          ...(astHist ? { "AST Sim": astHist[i]?.count ?? 0 } : {}),
                          ...(structureHist ? { Structure: structureHist[i]?.count ?? 0 } : {}),
                        }));
                      })()}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#FED7AA" />
                      <XAxis dataKey="range" tick={{ fontSize: 9 }} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Success" fill="#16A34A" />
                      <Bar dataKey="Submission" fill="#DC2626" />
                      {risk?.models_used.e2_random_forest && <Bar dataKey="AST Sim" fill="#0D9488" />}
                      {risk?.models_used.e2_random_forest && <Bar dataKey="Structure" fill="#DB2777" />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(() => {
                  const HIST_COLORS = ["#F37021", "#0EA5E9", "#9333EA", "#CA8A04"];
                  const histograms: { label: string; values: number[] }[] = [
                    { label: "Sessions", values: result.per_learner.map((l) => l.total_sessions) },
                    { label: "Attempts", values: result.per_learner.map((l) => l.total_attempts) },
                    { label: "Avg Duration (s)", values: result.per_learner.map((l) => l.avg_session_duration_seconds) },
                    { label: "Attempts/Session", values: result.per_learner.map((l) => l.avg_attempts_per_session) },
                  ];
                  return histograms.map((h, i) => (
                    <div key={h.label}>
                      <p className="text-xs font-bold text-[#0F172A] mb-2">{h.label} Distribution</p>
                      <div className="rounded-xl border border-[#FED7AA] bg-white p-2">
                        <ResponsiveContainer width="100%" height={170}>
                          <BarChart data={buildHistogram(h.values)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#FED7AA" />
                            <XAxis dataKey="range" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={40} />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                            <Bar dataKey="count" fill={HIST_COLORS[i % HIST_COLORS.length]} name="Learners" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Radar — one learner's Behavioral features vs the cohort average,
                normalized to a shared 0–100 scale (rates are already %, counts
                are scaled to % of the cohort max) so all axes are comparable on
                one chart. Error is omitted — it's just 100 - Success (see
                behavioral.ts), so it wouldn't add a distinct axis. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-[#0F172A]">Feature Profile — Learner vs Cohort Avg</p>
                <select
                  value={radarLearnerId ?? ""}
                  onChange={(e) => setRadarLearnerId(e.target.value)}
                  className="text-[10px] border border-[#FED7AA] rounded-lg px-2 py-1 bg-white text-[#475569]"
                >
                  {result.per_learner.map((l) => (
                    <option key={l.profile_id} value={l.profile_id}>{l.profile_id.slice(0, 8)}…</option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-[#FED7AA] bg-white p-2">
                <ResponsiveContainer width="100%" height={260}>
                  {(() => {
                    const maxSessions = Math.max(1, ...result.per_learner.map((l) => l.total_sessions));
                    const maxAttempts = Math.max(1, ...result.per_learner.map((l) => l.total_attempts));
                    const maxDuration = Math.max(1, ...result.per_learner.map((l) => l.avg_session_duration_seconds));
                    const maxAttemptsPerSession = Math.max(1, ...result.per_learner.map((l) => l.avg_attempts_per_session));
                    const hasSemantic = !!risk?.models_used.e2_random_forest;

                    // Semantic (RF-only) features, keyed by profile_id — not part of
                    // BehavioralLearnerMetrics since they come from the risk_classification
                    // run's feature_values, not the behavioral engine itself.
                    const semanticByLearner = new Map(
                      (risk?.predictions ?? []).map((p) => [
                        p.profile_id,
                        { ast: p.feature_values.avg_ast_similarity, structure: p.feature_values.avg_structure_score },
                      ]),
                    );

                    const normalize = (l: BehavioralLearnerMetrics) => {
                      const base = [
                        { feature: "Sessions", value: Math.round((l.total_sessions / maxSessions) * 100) },
                        { feature: "Attempts", value: Math.round((l.total_attempts / maxAttempts) * 100) },
                        { feature: "Success", value: Math.round(l.attempt_success_rate * 100) },
                        { feature: "Submit", value: Math.round(l.submission_rate * 100) },
                        { feature: "Duration", value: Math.round((l.avg_session_duration_seconds / maxDuration) * 100) },
                        { feature: "Attempts/Sess", value: Math.round((l.avg_attempts_per_session / maxAttemptsPerSession) * 100) },
                      ];
                      if (hasSemantic) {
                        const sem = semanticByLearner.get(l.profile_id);
                        base.push({ feature: "AST Sim", value: Math.round((sem?.ast ?? 0) * 100) });
                        base.push({ feature: "Structure", value: Math.round((sem?.structure ?? 0) * 100) });
                      }
                      return base;
                    };

                    const n = result.per_learner.length;
                    const sum = (f: (l: BehavioralLearnerMetrics) => number) =>
                      result.per_learner.reduce((s, l) => s + f(l), 0) / n;
                    const cohortAvg: BehavioralLearnerMetrics = {
                      profile_id: "cohort_avg",
                      total_sessions: sum((l) => l.total_sessions),
                      total_attempts: sum((l) => l.total_attempts),
                      correct_attempts: 0,
                      attempt_success_rate: sum((l) => l.attempt_success_rate),
                      avg_session_duration_seconds: sum((l) => l.avg_session_duration_seconds),
                      total_events: 0,
                      submission_count: 0,
                      submission_rate: sum((l) => l.submission_rate),
                      error_attempt_count: 0,
                      error_rate: sum((l) => l.error_rate),
                      avg_attempts_per_session: sum((l) => l.avg_attempts_per_session),
                    };

                    if (hasSemantic) {
                      const astValues = (risk?.predictions ?? [])
                        .map((p) => p.feature_values.avg_ast_similarity)
                        .filter((v): v is number => v !== undefined);
                      const structureValues = (risk?.predictions ?? [])
                        .map((p) => p.feature_values.avg_structure_score)
                        .filter((v): v is number => v !== undefined);
                      semanticByLearner.set("cohort_avg", {
                        ast: astValues.length > 0 ? astValues.reduce((a, b) => a + b, 0) / astValues.length : 0,
                        structure:
                          structureValues.length > 0
                            ? structureValues.reduce((a, b) => a + b, 0) / structureValues.length
                            : 0,
                      });
                    }

                    const selectedLearner =
                      result.per_learner.find((l) => l.profile_id === radarLearnerId) ?? result.per_learner[0];
                    const selectedNorm = normalize(selectedLearner);
                    const cohortNorm = normalize(cohortAvg);
                    const radarData = selectedNorm.map((d, i) => ({
                      feature: d.feature,
                      Selected: d.value,
                      "Cohort Avg": cohortNorm[i].value,
                    }));

                    return (
                      <RadarChart data={radarData} outerRadius={80}>
                        <PolarGrid stroke="#FED7AA" />
                        <PolarAngleAxis dataKey="feature" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="Selected learner" dataKey="Selected" stroke="#F37021" fill="#F37021" fillOpacity={0.4} />
                        <Radar name="Cohort avg" dataKey="Cohort Avg" stroke="#0EA5E9" fill="#0EA5E9" fillOpacity={0.25} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                      </RadarChart>
                    );
                  })()}
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-1">
                Values normalized to 0–100 (rates are already %; counts are scaled to % of the cohort max) so all{" "}
                {risk?.models_used.e2_random_forest ? "8 features (6 Behavioral + 2 Semantic)" : "6 Behavioral features"} share one scale.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[#F37021] text-white text-xs font-semibold hover:bg-[#D95F10] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BehavioralAnalysisPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);

  // Auth / profile
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Data
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [batchTypeFilter, setBatchTypeFilter] = useState("");
  const [setFamilyFilter, setSetFamilyFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState<"used" | "not_used" | "">("");

  // Table state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // Compare
  const [selectedRuns, setSelectedRuns] = useState<SelectedRun[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Modals
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [runTarget, setRunTarget] = useState<BehavioralDatasetRecord | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("mst_profiles")
        .select("display_name, participant_code, role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (prof && prof.role !== "researcher" && prof.role !== "admin") {
        router.push("/student/dashboard");
        return;
      }

      setDisplayName(prof?.display_name ?? null);
      setEmail(user?.email ?? null);
      setParticipantCode(prof?.participant_code ?? null);
      setToken(session.access_token);
    }
    void init();
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/researcher/behavioral-analysis", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Request failed" }));
      setError((j as { error?: string }).error ?? "Failed to load data.");
      setLoading(false);
      return;
    }

    setData(await res.json() as ListResponse);
    setLoading(false);
  }, [router]);

  useEffect(() => { queueMicrotask(() => { void loadData(); }); }, [loadData]);

  useEffect(() => {
    const hasActive = (data?.datasets ?? []).some((ds) =>
      ds.runs.some((r) => r.status === "running" || r.status === "pending"),
    );
    if (!hasActive) return;
    const id = setInterval(() => { void loadData(); }, 10_000);
    return () => clearInterval(id);
  }, [data, loadData]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredDatasets = (data?.datasets ?? []).filter((ds) => {
    if (search) {
      const q = search.toLowerCase();
      if (!ds.code.toLowerCase().includes(q) && !ds.name.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (batchTypeFilter && ds.batch_type !== batchTypeFilter) return false;
    if (setFamilyFilter && ds.set_family !== setFamilyFilter) return false;
    if (taskTypeFilter && ds.task_type !== taskTypeFilter) return false;
    if (runStatusFilter) {
      const hasStatus = ds.runs.some((r) => r.status === runStatusFilter);
      if (!hasStatus) return false;
    }
    if (usageFilter && ds.usage_status !== usageFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredDatasets.length / PAGE_SIZE));
  const pagedDatasets = filteredDatasets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Actions ───────────────────────────────────────────────────────────────

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectRun(ds: BehavioralDatasetRecord, run: BehavioralRunRecord) {
    setSelectedRuns((prev) => {
      const exists = prev.find((s) => s.runId === run.id);
      if (exists) return prev.filter((s) => s.runId !== run.id);
      if (prev.length >= MAX_COMPARE) return prev;
      const globalIndex = ds.runs.findIndex((r) => r.id === run.id);
      const runNumber = String(ds.runs.length - globalIndex).padStart(3, "0");
      return [
        ...prev,
        {
          datasetId: ds.id,
          runId: run.id,
          runNumber,
          datasetCode: ds.code,
          datasetName: ds.name,
        },
      ];
    });
  }

  function openCompare() {
    setCompareOpen(true);
  }

  function openDetail(ds: BehavioralDatasetRecord, run: BehavioralRunRecord) {
    const globalIndex = ds.runs.findIndex((r) => r.id === run.id);
    const runNumber = String(ds.runs.length - globalIndex).padStart(3, "0");
    setDetailTarget({
      datasetId: ds.id,
      runId: run.id,
      runNumber,
      datasetCode: ds.code,
      datasetName: ds.name,
      run,
    });
  }

  async function continueRun(ds: BehavioralDatasetRecord, run: BehavioralRunRecord) {
    if (actionLoading) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }
    setActionLoading(run.id);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${ds.id}/runs/${run.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.warn("continueRun:", (j as { error?: string }).error ?? "unknown error");
      }
      void loadData();
    } finally {
      setActionLoading(null);
    }
  }

  async function stopRun(ds: BehavioralDatasetRecord, run: BehavioralRunRecord) {
    if (actionLoading) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }
    setActionLoading(run.id);
    try {
      await fetch(`/api/researcher/dataset-analytics/${ds.id}/runs?run_id=${run.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      void loadData();
    } finally {
      setActionLoading(null);
    }
  }

  function runProgress(run: BehavioralRunRecord): { pct: number; done: number; total: number } | null {
    const steps = run.analysis_steps;
    if (!steps || steps.length === 0) return null;
    const done = steps.filter((s) => s.status === "completed").length;
    return { pct: Math.round((done / steps.length) * 100), done, total: steps.length };
  }

  async function confirmRunPipeline() {
    if (!runTarget) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }
    setRunLoading(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${runTarget.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ run_type: "behavioral" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        setRunError((j as { error?: string }).error ?? "Failed to start run.");
        return;
      }
      setRunTarget(null);
      void loadData();
    } finally {
      setRunLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700 max-w-md">
          <p className="font-semibold mb-1">Error loading data</p>
          <p>{error}</p>
          <button onClick={() => void loadData()} className="mt-3 text-xs text-red-600 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      {/* Header */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">CodeKidVai Researcher</p>
          <p className="text-xs text-[#64748B]">Research data access portal</p>
        </div>
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-[#FED7AA] flex items-center justify-center hover:bg-[#F37021] hover:text-white transition-colors text-[#F37021] border border-[#FED7AA]"
            title="Profile"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-10 w-64 bg-white border border-[#FED7AA] rounded-2xl shadow-lg z-50 p-4 space-y-3">
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Name</p>
                <p className="text-sm font-semibold text-[#0F172A]">{displayName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Email</p>
                <p className="text-sm text-[#0F172A] break-all">{email ?? "—"}</p>
              </div>
              <hr className="border-[#FED7AA]" />
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Participant Code</p>
                <p className="text-sm font-mono font-semibold text-[#64748B]">{participantCode ?? "—"}</p>
              </div>
              <hr className="border-[#FED7AA]" />
              <button
                onClick={handleLogout}
                className="w-full py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <ResearcherBreadcrumb current="Behavioral Analysis" />

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Behavioral Analysis</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Dataset &#8594; Pipeline Run &#8594; Behavioral Complexity Analysis records</p>
        </div>

        {/* ── Filters ── */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 flex flex-wrap items-end gap-4">

          {/* Search */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Search</label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Code or name…"
                aria-label="Search datasets by code or name"
                className="pl-9 pr-3 py-2.5 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] w-44"
              />
            </div>
          </div>

          {/* Batch Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Batch</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All batches" onClick={() => { setBatchTypeFilter(""); setPage(1); }}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${batchTypeFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              <button type="button" title="Main" onClick={() => { setBatchTypeFilter(batchTypeFilter === "main" ? "" : "main"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${batchTypeFilter === "main" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <StarIcon className="w-4 h-4" />
              </button>
              <button type="button" title="Trial" onClick={() => { setBatchTypeFilter(batchTypeFilter === "trial" ? "" : "trial"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${batchTypeFilter === "trial" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <DumbbellIcon className="w-4 h-4" />
              </button>
              <button type="button" title="Pilot" onClick={() => { setBatchTypeFilter(batchTypeFilter === "pilot" ? "" : "pilot"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 transition-colors ${batchTypeFilter === "pilot" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Activity Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Activity</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All activities" onClick={() => { setSetFamilyFilter(""); setPage(1); }}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${setFamilyFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              <button type="button" title="Assignment" onClick={() => { setSetFamilyFilter(setFamilyFilter === "assignment" ? "" : "assignment"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${setFamilyFilter === "assignment" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M9 5h6"/><path d="M9 12h6"/><path d="M9 17h4"/>
                  <path d="M5 7.5 6.5 9 9 6"/><path d="M5 14.5 6.5 16 9 13"/>
                  <rect x="4" y="3" width="16" height="18" rx="2"/>
                </svg>
              </button>
              <button type="button" title="Lab" onClick={() => { setSetFamilyFilter(setFamilyFilter === "lab" ? "" : "lab"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${setFamilyFilter === "lab" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2"/>
                  <path d="M8 2h8"/><path d="M7 15h10"/>
                </svg>
              </button>
              <button type="button" title="Exam" onClick={() => { setSetFamilyFilter(setFamilyFilter === "exam" ? "" : "exam"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 transition-colors ${setFamilyFilter === "exam" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                  <path d="M14 2v6h6"/><path d="M9 14h6"/><path d="M9 18h4"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Task Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Task</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All task types" onClick={() => { setTaskTypeFilter(""); setPage(1); }}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${taskTypeFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              {DATASET_TASK_TYPES_IN_SCOPE.map((v, i) => (
                <button key={v} type="button" title={DATASET_TASK_LABEL[v]}
                  onClick={() => { setTaskTypeFilter(taskTypeFilter === v ? "" : v); setPage(1); }}
                  className={`flex items-center justify-center px-3 py-2.5 ${i < DATASET_TASK_TYPES_IN_SCOPE.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${taskTypeFilter === v ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                  <TaskTypeIcon type={v} />
                </button>
              ))}
            </div>
          </div>

          {/* Run Status */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Run Status</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All statuses" onClick={() => { setRunStatusFilter(""); setPage(1); }}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${runStatusFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              {[
                { value: "completed", dotCls: "bg-green-500",  label: "Completed" },
                { value: "pending",   dotCls: "bg-amber-400",  label: "Pending" },
                { value: "running",   dotCls: "bg-blue-500",   label: "Running" },
                { value: "failed",    dotCls: "bg-red-400",    label: "Failed" },
              ].map(({ value, dotCls, label }, i, arr) => (
                <button key={value} type="button" title={label}
                  onClick={() => { setRunStatusFilter(runStatusFilter === value ? "" : value); setPage(1); }}
                  className={`flex items-center justify-center px-3 py-2.5 ${i < arr.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${runStatusFilter === value ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                  <span className={`w-2 h-2 rounded-full ${runStatusFilter === value ? "bg-white" : dotCls}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Usage */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Usage</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All" onClick={() => { setUsageFilter(""); setPage(1); }}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${usageFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              <button type="button" title="Used" onClick={() => { setUsageFilter(usageFilter === "used" ? "" : "used"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${usageFilter === "used" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </button>
              <button type="button" title="Not used" onClick={() => { setUsageFilter(usageFilter === "not_used" ? "" : "not_used"); setPage(1); }}
                className={`flex items-center justify-center px-3 py-2.5 transition-colors ${usageFilter === "not_used" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </button>
            </div>
          </div>

          {/* Clear All */}
          {(search || batchTypeFilter || setFamilyFilter || taskTypeFilter || runStatusFilter || usageFilter) && (
            <button type="button" onClick={() => { setSearch(""); setBatchTypeFilter(""); setSetFamilyFilter(""); setTaskTypeFilter(""); setRunStatusFilter(""); setUsageFilter(""); setPage(1); }}
              className="self-end pb-[11px] text-xs font-semibold text-[#F37021] hover:underline">
              Clear All
            </button>
          )}

          <div className="flex-1" />

          {/* Selected count + Compare */}
          <div className="self-end flex items-center gap-2 pb-[2px]">
            {selectedRuns.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FED7AA] text-[#92400E]">
                {selectedRuns.length} selected
              </span>
            )}
            <button
              onClick={openCompare}
              disabled={selectedRuns.length < 2}
              title={selectedRuns.length < 2 ? "Select at least 2 runs to compare" : `Compare ${selectedRuns.length} runs`}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#F37021] text-white hover:bg-[#D95F10] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Compare
            </button>
          </div>
        </section>

        {/* ── Dataset Table ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
          {loading ? (
            <p className="text-sm text-[#94A3B8] py-6 text-center">Loading…</p>
          ) : error ? (
            <div className="m-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{error}</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-[#FFF7ED] border-b-2 border-[#FED7AA]">
                  {[
                    { label: "Code",      align: "left"   },
                    { label: "Name",      align: "left"   },
                    { label: "Batch",     align: "center" },
                    { label: "Activity",  align: "center" },
                    { label: "Task Type", align: "center" },
                    { label: "Sessions",  align: "center" },
                    { label: "Learners",  align: "center" },
                    { label: "Usage",     align: "center" },
                    { label: "Runs",      align: "center" },
                    { label: "",          align: "center" },
                  ].map(({ label, align }, i) => (
                    <th key={i} className={`px-3 py-2.5 text-[10px] font-bold text-[#F37021] uppercase tracking-widest whitespace-nowrap ${align === "center" ? "text-center" : "text-left"}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedDatasets.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-[#94A3B8] text-sm">
                      No datasets found.
                    </td>
                  </tr>
                )}
                {pagedDatasets.map((ds) => {
                  const isExpanded = expandedIds.has(ds.id);
                  const visibleRuns = ds.runs.filter((r) => !runStatusFilter || r.status === runStatusFilter);
                  return (
                    <Fragment key={ds.id}>
                      {/* Dataset row */}
                      <tr
                        className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7] transition-colors cursor-pointer"
                        onClick={() => toggleExpanded(ds.id)}
                      >
                        {/* Code */}
                        <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                          <span className="font-mono text-[11px] font-bold text-[#F37021] bg-[#FFF7ED] border border-[#FED7AA] px-2 py-1 rounded-lg tracking-widest">
                            {ds.code}
                          </span>
                        </td>
                        {/* Name */}
                        <td className="px-3 py-3.5 align-middle min-w-[140px]">
                          <span className="text-xs text-[#0F172A] font-medium leading-snug">{ds.name}</span>
                        </td>
                        {/* Batch */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          {ds.batch_type === "main"  && <span title="Main"  className="inline-flex items-center justify-center text-[#F37021]"><StarIcon className="w-4 h-4" /></span>}
                          {ds.batch_type === "trial" && <span title="Trial" className="inline-flex items-center justify-center text-[#F37021]"><DumbbellIcon className="w-4 h-4" /></span>}
                          {ds.batch_type === "pilot" && <span title="Pilot" className="inline-flex items-center justify-center text-[#F37021]"><PaperAirplaneIcon className="w-4 h-4" /></span>}
                          {!["main","trial","pilot"].includes(ds.batch_type) && <span className="text-[10px] text-[#94A3B8]">{ds.batch_type || "—"}</span>}
                        </td>
                        {/* Activity */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          <span title={ds.set_family} className="inline-flex items-center justify-center text-[#64748B]">
                            {ds.set_family === "assignment" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 14h6"/><path d="M9 18h4"/></svg>}
                            {ds.set_family === "lab"        && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 3h6v7l4 8H5L9 10z"/><line x1="6" y1="14" x2="18" y2="14"/></svg>}
                            {ds.set_family === "exam"       && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                            {!["assignment","lab","exam"].includes(ds.set_family) && <span className="text-[10px] text-[#94A3B8]">{ds.set_family || "—"}</span>}
                          </span>
                        </td>
                        {/* Task Type */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          {ds.task_type ? (
                            <span title={DATASET_TASK_LABEL[ds.task_type] ?? ds.task_type} className="inline-flex items-center justify-center text-[#64748B]">
                              <TaskTypeIcon type={ds.task_type} />
                            </span>
                          ) : (
                            <span title="All (Exam)" className="text-[10px] font-mono font-bold text-[#94A3B8]">EX</span>
                          )}
                        </td>
                        {/* Sessions */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          <span className="font-mono text-xs text-[#475569]">{ds.session_count}</span>
                        </td>
                        {/* Learners */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          <span className="font-mono text-xs text-[#475569]">{ds.learner_count}</span>
                        </td>
                        {/* Usage */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          {ds.usage_status === "used" ? (
                            <span title="Used" className="inline-flex items-center justify-center text-amber-500">
                              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                              </svg>
                            </span>
                          ) : (
                            <span title="Not used" className="inline-flex items-center justify-center text-[#CBD5E1]">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                              </svg>
                            </span>
                          )}
                        </td>
                        {/* Runs count */}
                        <td className="px-2 py-3.5 text-center align-middle">
                          <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">
                            {ds.runs.length}
                          </span>
                        </td>
                        {/* Actions: Run + Expand */}
                        <td className="px-3 py-3.5 text-center align-middle">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setRunError(null); setRunTarget(ds); }}
                              title="Run Behavioral Analysis"
                              className="p-1 rounded hover:bg-[#FED7AA] text-[#F37021] transition-colors"
                              aria-label="Run Behavioral Analysis"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                                <path d="M5 3l14 9-14 9V3z" />
                              </svg>
                            </button>
                            <svg
                              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                              strokeLinecap="round" strokeLinejoin="round"
                              className={`w-4 h-4 text-[#94A3B8] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded run rows */}
                      {isExpanded && (
                        visibleRuns.length === 0 ? (
                          <tr key={`${ds.id}-empty`} className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                            <td colSpan={10} className="pl-10 py-3 text-[#94A3B8] text-xs italic">
                              No behavioral pipeline runs available.
                            </td>
                          </tr>
                        ) : (
                          visibleRuns.map((run) => {
                            const globalIndex = ds.runs.findIndex((r) => r.id === run.id);
                            const runNumber = String(ds.runs.length - globalIndex).padStart(3, "0");
                            const canView = run.artifact_availability !== "unavailable";
                            const isSelected = selectedRuns.some((s) => s.runId === run.id);
                            const selectionBlocked = selectedRuns.length >= MAX_COMPARE && !isSelected;
                            const checkboxDisabled = !run.is_comparable || selectionBlocked;
                            const checkboxTitle = !run.is_comparable
                              ? (run.not_comparable_reason ?? "Not comparable")
                              : selectionBlocked
                                ? `Max ${MAX_COMPARE} runs selected`
                                : undefined;

                            return (
                              <tr key={run.id} className="border-b border-[#F1F5F9] bg-[#FAFAFA]">
                                {/* Checkbox (indented) */}
                                <td className="pl-8 pr-2 py-2.5 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={checkboxDisabled}
                                    title={checkboxTitle}
                                    onChange={() => toggleSelectRun(ds, run)}
                                    className="w-3.5 h-3.5 accent-[#F37021] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </td>
                                {/* Run# */}
                                <td className="px-3 py-2.5 align-middle" colSpan={2}>
                                  <span className="font-mono text-xs font-semibold text-[#F37021]">#{runNumber}</span>
                                </td>
                                {/* DateTime */}
                                <td className="px-3 py-2.5 align-middle text-xs text-[#64748B]" colSpan={2}>
                                  {run.created_at ? formatDateTime(run.created_at) : "—"}
                                </td>
                                {/* Run Status */}
                                <td className="px-3 py-2.5 align-middle" colSpan={1}>
                                  <StatusBadge status={run.status} />
                                </td>
                                {/* Progress / Action */}
                                <td className="px-2 py-2.5 align-middle" colSpan={1}>
                                  {run.status === "pending" && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); void continueRun(ds, run); }}
                                      disabled={actionLoading === run.id}
                                      title="Queue a new run for this dataset"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                    >
                                      {actionLoading === run.id ? (
                                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                                      ) : (
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true"><path d="M5 3l14 9-14 9V3z"/></svg>
                                      )}
                                      Continue
                                    </button>
                                  )}
                                  {run.status === "running" && (() => {
                                    const prog = runProgress(run);
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <div className="flex flex-col gap-0.5 min-w-[44px]">
                                          <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                                            {prog ? (
                                              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${prog.pct}%` }} />
                                            ) : (
                                              <div className="h-full w-1/2 bg-blue-400 rounded-full animate-pulse" />
                                            )}
                                          </div>
                                          <span className="text-[10px] font-mono text-blue-600 leading-none">
                                            {prog ? `${prog.pct}%` : "…"}
                                          </span>
                                        </div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); void stopRun(ds, run); }}
                                          disabled={actionLoading === run.id}
                                          title="Request cancellation"
                                          className="p-1 rounded hover:bg-red-100 text-[#94A3B8] hover:text-red-500 disabled:opacity-50 transition-colors"
                                          aria-label="Pause run"
                                        >
                                          {actionLoading === run.id ? (
                                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                                          ) : (
                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                                              <rect x="6" y="4" width="4" height="16" rx="1" />
                                              <rect x="14" y="4" width="4" height="16" rx="1" />
                                            </svg>
                                          )}
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </td>
                                {/* View Analysis (eye icon) */}
                                <td className="px-3 py-2.5 align-middle text-center" colSpan={3}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openDetail(ds, run); }}
                                    disabled={!canView}
                                    title={canView ? "View Analysis" : (run.not_comparable_reason ?? "No artifact available")}
                                    className="p-1 rounded hover:bg-[#FED7AA] text-[#F37021] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    aria-label="View Analysis"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M2 12s3.636-7 10-7 10 7 10 7-3.636 7-10 7-10-7-10-7z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#FED7AA] bg-[#FFF7ED]">
              <span className="text-xs text-[#64748B]">
                Page {page} of {totalPages} ({filteredDatasets.length} datasets)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-lg text-xs border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded-lg text-xs border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Detail Modal */}
      {detailTarget && (
        <BehavioralDetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      )}

      {/* Compare Modal */}
      {compareOpen && token && (
        <BehavioralCompareModal
          selected={selectedRuns}
          token={token}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* Run Confirm Modal */}
      {runTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl border border-[#FED7AA] shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Run Behavioral Analysis</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Dataset <span className="font-mono font-semibold text-[#F37021]">{runTarget.code}</span>
                </p>
              </div>
              <button
                onClick={() => { setRunTarget(null); setRunError(null); }}
                className="text-[#94A3B8] hover:text-[#475569] transition-colors mt-0.5"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#475569]">
              This will create a new <strong>behavioral</strong> pipeline run for{" "}
              <strong>{runTarget.name}</strong>. The run will start in <em>pending</em> state.
            </p>
            {runError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {runError}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setRunTarget(null); setRunError(null); }}
                disabled={runLoading}
                className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmRunPipeline()}
                disabled={runLoading}
                className="flex-1 py-2.5 rounded-xl bg-[#F37021] text-white text-xs font-semibold hover:bg-[#D95F10] disabled:opacity-50 transition-colors"
              >
                {runLoading ? "Starting…" : "Confirm Run"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
