"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectedRunRef = {
  datasetId: string;
  runId: string;
  datasetCode: string;
  datasetName: string;
  artifactSource: "result_version" | "static_fallback" | null;
};

type Props = {
  selected: SelectedRunRef[];
  onClose: () => void;
  token: string;
};

type ArtifactData = {
  artifact_source?: "result_version" | "static_fallback";
  dataset_summary?: {
    total_learners: number;
    total_sequences: number;
    train_sequences: number;
    test_sequences: number;
    max_sequence_length: number;
    features_per_timestep: number;
    vocab_size: number;
    split_random_state: number;
  };
  sequence_construction?: {
    parameters: {
      random_state: number;
      max_seq_len: number;
      n_features: number;
    };
    dataset_stats: {
      train_shape: [number, number, number];
      test_shape: [number, number, number];
    };
  };
  tag_structure?: {
    dataset_stats: {
      total_sequences: number;
      total_nodes: number;
      total_edges: number;
    };
    transition_type_count: number;
    graph_feature_count: number;
  };
  analysis_steps?: Array<{
    analysis: string;
    status: string;
  }>;
  validation?: {
    checks_run: number;
    checks_passed: number;
    no_learner_overlap: boolean;
    no_pii_in_exports: boolean;
    leakage_check_passed: boolean;
  };
  artifact_versions?: {
    phase4_ui_summary: { schema_version: string };
    sequence_manifest: { schema_version: string };
  };
  research_constraints?: {
    proxy_target_circularity: boolean;
    confirmatory_analysis_allowed: boolean;
    data_warning: string;
  };
  model_comparison?: {
    test_sequences: number;
    timing_note: string;
    test_class_distribution: { positive: number; negative: number };
    models: Array<{
      name: string;
      accuracy: number;
      precision: number;
      recall: number;
      f1: number;
      roc_auc: number;
      pr_auc: number;
      train_time_sec: number;
      parameters: number | null;
      type: string;
    }>;
  };
  seed_stability?: {
    lstm: {
      exp_a_seq_only: { accuracy_mean: number; f1_mean: number; roc_auc_mean: number; epochs_trained_mean: number };
      exp_b_seq_plus_tag: { accuracy_mean: number; f1_mean: number; roc_auc_mean: number; epochs_trained_mean: number };
    };
    gru: {
      exp_a_seq_only: { accuracy_mean: number; f1_mean: number; roc_auc_mean: number; epochs_trained_mean: number };
      exp_b_seq_plus_tag: { accuracy_mean: number; f1_mean: number; roc_auc_mean: number; epochs_trained_mean: number };
    };
  };
  charts?: Array<{ key: string; title: string; path: string }>;
  error?: string;
};

type RunResult =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "notimpl" }
  | { state: "ok"; data: ArtifactData };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</span>
      <span className="text-xs font-mono text-[#0F172A]">{value ?? "—"}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide py-2 border-b border-[#E2E8F0]">
      {title}
    </p>
  );
}

function CellLoading() {
  return <div className="text-xs text-[#94A3B8] italic py-4 text-center">Loading…</div>;
}

function CellError({ message }: { message: string }) {
  return <div className="text-xs text-red-600 py-2">{message}</div>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SequentialCompareModal({ selected, onClose, token }: Props) {
  const [results, setResults] = useState<RunResult[]>(
    selected.map(() => ({ state: "loading" })),
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    async function fetchAll() {
      const fetched = await Promise.all(
        selected.map(async (ref): Promise<RunResult> => {
          const url = `/api/researcher/sequential-analysis?mode=detail&dataset_id=${encodeURIComponent(ref.datasetId)}&run_id=${encodeURIComponent(ref.runId)}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 501) return { state: "notimpl" };
          if (!res.ok) {
            const j = await res.json().catch(() => ({ error: "Request failed" }));
            return { state: "error", message: (j as { error?: string }).error ?? "Failed" };
          }
          const data = await res.json() as ArtifactData;
          return { state: "ok", data };
        }),
      );
      setResults(fetched);
    }
    void fetchAll();
  }, [selected, token]);

  // Check compatibility
  const setFamilies = new Set(selected.map((s) => s.datasetCode.slice(0, 2)));
  const batchTypes = new Set(selected.map((s) => s.artifactSource ?? "unknown"));
  const hasDifferentSetFamily = setFamilies.size > 1;
  const hasDifferentBatchType = batchTypes.size > 1;

  const colWidth = selected.length === 2 ? "w-1/2" : "w-1/3";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-screen bg-[#FFF7ED]">
        {/* Pilot banner */}
        <div className="bg-red-600 text-white text-center py-1.5 text-xs font-bold tracking-widest">
          PILOT ONLY &#183; NOT FINAL RESEARCH RESULTS
        </div>

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-[#0F172A] text-sm">
              Compare Pipeline Runs ({selected.length})
            </p>
            <p className="text-xs text-[#64748B]">Side-by-side artifact comparison &#183; Read-only</p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-[#FFF7ED] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* Compatibility notes */}
          {(hasDifferentSetFamily || hasDifferentBatchType) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 space-y-1">
              <p className="font-semibold">Compatibility notes:</p>
              {hasDifferentSetFamily && (
                <p>&#9888; Selected runs are from different dataset families. Results may not be directly comparable.</p>
              )}
              {hasDifferentBatchType && (
                <p>&#9888; Selected runs have different artifact sources. Interpretation requires care.</p>
              )}
            </div>
          )}

          {/* Column headers */}
          <div className="flex gap-4">
            {selected.map((ref, i) => (
              <div key={ref.runId} className={`${colWidth} rounded-xl bg-white border border-[#FED7AA] px-4 py-3`}>
                <p className="font-mono font-semibold text-[#0F172A] text-xs">{ref.datasetCode}</p>
                <p className="text-[11px] text-[#64748B] mt-0.5 truncate">{ref.datasetName}</p>
                <p className="text-[10px] font-mono text-[#94A3B8] mt-1" title={ref.runId}>
                  Run {i + 1}: {ref.runId.slice(0, 8)}&hellip;
                </p>
                {ref.artifactSource === "static_fallback" && (
                  <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    Pilot &#8212; static artifact
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Section 1: Metadata */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">1. Metadata</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3 space-y-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "notimpl" && (
                    <CellError message="Result artifact loading not yet implemented." />
                  )}
                  {result.state === "ok" && (
                    <>
                      <MetaRow label="Dataset Code" value={selected[i].datasetCode} />
                      <MetaRow label="Run ID" value={`${selected[i].runId.slice(0, 8)}…`} />
                      <MetaRow label="Artifact Source" value={result.data.artifact_source ?? "—"} />
                      <MetaRow
                        label="Pipeline Version"
                        value={result.data.artifact_versions?.phase4_ui_summary.schema_version ?? "—"}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Sequence Stats */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">2. Sequence Stats</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3 space-y-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "notimpl" && <CellError message="Not implemented." />}
                  {result.state === "ok" && result.data.dataset_summary && (
                    <>
                      <MetaRow label="Total Learners" value={result.data.dataset_summary.total_learners} />
                      <MetaRow label="Total Sequences" value={result.data.dataset_summary.total_sequences} />
                      <MetaRow label="Train Sequences" value={result.data.dataset_summary.train_sequences} />
                      <MetaRow label="Test Sequences" value={result.data.dataset_summary.test_sequences} />
                      <MetaRow label="Max Seq Len" value={result.data.dataset_summary.max_sequence_length} />
                      <MetaRow label="Features/Timestep" value={result.data.dataset_summary.features_per_timestep} />
                      <MetaRow label="Vocab Size" value={result.data.dataset_summary.vocab_size} />
                      {result.data.sequence_construction && (
                        <>
                          <SectionHeader title="Shapes" />
                          <MetaRow
                            label="Train Shape"
                            value={`[${result.data.sequence_construction.dataset_stats.train_shape.join(", ")}]`}
                          />
                          <MetaRow
                            label="Test Shape"
                            value={`[${result.data.sequence_construction.dataset_stats.test_shape.join(", ")}]`}
                          />
                          <MetaRow label="Seed" value={result.data.sequence_construction.parameters.random_state} />
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: TAG Stats */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">3. TAG Stats</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3 space-y-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "notimpl" && <CellError message="Not implemented." />}
                  {result.state === "ok" && result.data.tag_structure && (
                    <>
                      <MetaRow label="Total Sequences" value={result.data.tag_structure.dataset_stats.total_sequences} />
                      <MetaRow label="Total Nodes" value={result.data.tag_structure.dataset_stats.total_nodes} />
                      <MetaRow label="Total Edges" value={result.data.tag_structure.dataset_stats.total_edges} />
                      <MetaRow label="Transition Types" value={result.data.tag_structure.transition_type_count} />
                      <MetaRow label="Graph Features" value={result.data.tag_structure.graph_feature_count} />
                    </>
                  )}
                  {result.state === "ok" && !result.data.tag_structure && (
                    <p className="text-xs text-[#94A3B8] italic">No TAG data.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Validation */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">4. Validation</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3 space-y-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "notimpl" && <CellError message="Not implemented." />}
                  {result.state === "ok" && result.data.validation && (
                    <>
                      <MetaRow
                        label="Checks"
                        value={`${result.data.validation.checks_passed}/${result.data.validation.checks_run} passed`}
                      />
                      <div className="space-y-1 text-[11px]">
                        {[
                          { key: "no_learner_overlap", label: "No learner overlap" },
                          { key: "no_pii_in_exports", label: "No PII in exports" },
                          { key: "leakage_check_passed", label: "Leakage check" },
                        ].map(({ key, label }) => {
                          const val = result.data.validation![key as keyof typeof result.data.validation] as boolean;
                          return (
                            <div key={key} className={`flex items-center gap-1 ${val ? "text-green-700" : "text-red-700"}`}>
                              <span aria-hidden="true">{val ? "✓" : "✗"}</span>
                              <span>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {result.state === "ok" && !result.data.validation && (
                    <p className="text-xs text-[#94A3B8] italic">No validation data.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Section 5: Model Comparison */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED] flex items-center justify-between">
              <p className="text-xs font-semibold text-[#0F172A]">5. Model Comparison</p>
              <span className="text-[9px] bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded font-semibold uppercase tracking-wide">
                Pilot · pipeline validation only
              </span>
            </div>
            {(() => {
              const hit = results.find((r): r is { state: "ok"; data: ArtifactData } =>
                r.state === "ok" && !!r.data.model_comparison,
              );
              if (!hit) return (
                <p className="px-4 py-3 text-xs text-[#94A3B8] italic">No model comparison data available.</p>
              );
              const mc = hit.data.model_comparison!;
              const isCircular = hit.data.research_constraints?.proxy_target_circularity ?? false;

              const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
                baseline:       { label: "BASE",  cls: "bg-slate-100 text-slate-600 border-slate-200" },
                flat_baseline:  { label: "FLAT",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
                graph_baseline: { label: "TAG",   cls: "bg-purple-50 text-purple-700 border-purple-200" },
                sequence:       { label: "SEQ",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
              };

              return (
                <div className="px-4 py-4 space-y-4">
                  {isCircular && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
                      <p className="font-semibold">⚠ proxy_target_circularity = true</p>
                      <p className="text-[11px]">Non-Dummy models score 1.0 due to label circularity. Results are pipeline integrity checks only — not research conclusions.</p>
                    </div>
                  )}
                  <div className="text-[10px] text-[#64748B] flex gap-4">
                    <span>Test sequences: <strong>{mc.test_sequences}</strong></span>
                    <span>Class distribution: <strong>{mc.test_class_distribution.positive}+</strong> / <strong>{mc.test_class_distribution.negative}−</strong></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[520px]">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                          {["Model", "Acc", "F1", "ROC-AUC", "PR-AUC", "Train (s)", "Params"].map((h) => (
                            <th key={h} className={`px-2 py-2 text-[10px] font-bold text-[#64748B] uppercase tracking-wide whitespace-nowrap ${h === "Model" ? "text-left pl-3" : "text-center"}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mc.models.map((m) => {
                          const badge = TYPE_BADGE[m.type] ?? TYPE_BADGE.baseline;
                          const circular = m.type !== "baseline" && isCircular;
                          const numCls = circular ? "text-red-600 font-mono" : "text-[#0F172A] font-mono";
                          return (
                            <tr key={m.name} className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7]">
                              <td className="pl-3 pr-2 py-2.5 align-middle">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-[#0F172A]">{m.name}</span>
                                  <span className={`text-[8px] border px-1 rounded font-bold ${badge.cls}`}>{badge.label}</span>
                                  {circular && <span className="text-red-500 text-[10px]" title="Circularity">⚠</span>}
                                </div>
                              </td>
                              <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.accuracy.toFixed(2)}</td>
                              <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.f1.toFixed(2)}</td>
                              <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.roc_auc.toFixed(2)}</td>
                              <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.pr_auc.toFixed(2)}</td>
                              <td className="px-2 py-2.5 text-center font-mono text-[#475569]">
                                {m.train_time_sec < 0.001 ? "<0.001" : m.train_time_sec.toFixed(3)}
                              </td>
                              <td className="px-2 py-2.5 text-center font-mono text-[#475569]">
                                {m.parameters != null ? m.parameters.toLocaleString() : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Seed stability */}
                  {hit.data.seed_stability && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide border-t border-[#F1F5F9] pt-3">
                        Seed Stability (seeds 11 · 22 · 33 · 42 · 55)
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {(["lstm", "gru"] as const).map((model) => {
                          const st = hit.data.seed_stability![model];
                          return (
                            <div key={model} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 space-y-2">
                              <p className="text-[10px] font-bold text-[#0F172A] uppercase">{model}</p>
                              {(["exp_a_seq_only", "exp_b_seq_plus_tag"] as const).map((exp) => {
                                const e = st[exp];
                                return (
                                  <div key={exp} className="text-[10px] space-y-0.5">
                                    <p className="text-[#64748B] font-medium">{exp === "exp_a_seq_only" ? "Exp-A (Seq only)" : "Exp-B (Seq + TAG)"}</p>
                                    <div className="flex gap-3 font-mono text-[#0F172A]">
                                      <span>Acc <strong>{e.accuracy_mean.toFixed(2)}</strong></span>
                                      <span>F1 <strong>{e.f1_mean.toFixed(2)}</strong></span>
                                      <span>AUC <strong>{e.roc_auc_mean.toFixed(2)}</strong></span>
                                      <span className="text-[#94A3B8]">{e.epochs_trained_mean.toFixed(0)} ep</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Section 6: Analysis Charts */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">6. Analysis Charts</p>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">Seed 42 · static Phase 4 artifact · pipeline validation only</p>
            </div>
            {(() => {
              const hit = results.find((r): r is { state: "ok"; data: ArtifactData } =>
                r.state === "ok" && !!r.data.charts && r.data.charts.length > 0,
              );
              if (!hit) return (
                <p className="px-4 py-3 text-xs text-[#94A3B8] italic">No chart data available.</p>
              );
              return (
                <div className="p-4 grid grid-cols-2 gap-4">
                  {hit.data.charts!.map((chart) => (
                    <div key={chart.key} className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide">{chart.title}</p>
                      <div className="border border-[#E2E8F0] rounded-lg overflow-hidden bg-[#F8FAFC]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={chart.path} alt={chart.title} className="w-full h-auto" loading="lazy" />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        </main>
      </div>
    </div>
  );
}
