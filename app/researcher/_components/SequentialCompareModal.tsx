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
        </main>
      </div>
    </div>
  );
}
