"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectedRunRef = {
  datasetId: string;
  runId: string;
  runNumber: string;
  datasetCode: string;
  datasetName: string;
};

type Props = {
  selected: SelectedRunRef[];
  onClose: () => void;
  token: string;
};

type BehavioralLearnerMetrics = {
  profile_id: string;
  total_sessions: number;
  attempt_success_rate: number;
  error_rate: number;
  submission_rate: number;
  avg_session_duration_seconds: number;
};

type BehavioralResult = {
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

type RunResult =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; data: BehavioralResult };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</span>
      <span className="text-xs font-mono text-[#0F172A]">{value ?? "—"}</span>
    </div>
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

export function BehavioralCompareModal({ selected, onClose, token }: Props) {
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
          const url = `/api/researcher/behavioral-analysis?mode=detail&dataset_id=${encodeURIComponent(ref.datasetId)}&run_id=${encodeURIComponent(ref.runId)}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({ error: "Request failed" }));
            return { state: "error", message: (j as { error?: string }).error ?? "Failed" };
          }
          const j = await res.json() as { result: BehavioralResult };
          return { state: "ok", data: j.result };
        }),
      );
      setResults(fetched);
    }
    void fetchAll();
  }, [selected, token]);

  const colWidth = selected.length === 2 ? "w-1/2" : "w-1/3";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-screen bg-[#FFF7ED]">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-[#0F172A] text-sm">
              Compare Behavioral Runs ({selected.length})
            </p>
            <p className="text-xs text-[#64748B]">Side-by-side result comparison · Read-only</p>
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
          {/* Column headers */}
          <div className="flex gap-4">
            {selected.map((ref) => (
              <div key={ref.runId} className={`${colWidth} rounded-xl bg-white border border-[#FED7AA] px-4 py-3`}>
                <p className="font-mono font-semibold text-[#0F172A] text-xs">{ref.datasetCode}</p>
                <p className="text-[11px] text-[#64748B] mt-0.5 truncate">{ref.datasetName}</p>
                <p className="text-[10px] font-mono text-[#94A3B8] mt-1" title={ref.runId}>
                  #{ref.runNumber} &middot; {ref.runId.slice(0, 8)}&hellip;
                </p>
              </div>
            ))}
          </div>

          {/* Section 1: Feature coverage */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">1. Feature Coverage</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3 space-y-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "ok" && (
                    <>
                      <MetaRow label="Feature Version" value={result.data.feature_version} />
                      <MetaRow
                        label="Implemented"
                        value={`${result.data.implemented_feature_count} of ${result.data.implemented_feature_count + result.data.deferred_feature_count}`}
                      />
                      <MetaRow label="Learner Count" value={result.data.learner_count} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Aggregate stats */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">2. Aggregate</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3 space-y-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "ok" && (
                    <>
                      <MetaRow label="Avg Sessions" value={result.data.aggregate.avg_total_sessions} />
                      <MetaRow label="Success Rate" value={pct(result.data.aggregate.avg_attempt_success_rate)} />
                      <MetaRow label="Error Rate" value={pct(result.data.aggregate.avg_error_rate)} />
                      <MetaRow label="Submission Rate" value={pct(result.data.aggregate.avg_submission_rate)} />
                      <MetaRow label="Avg Duration (s)" value={result.data.aggregate.avg_session_duration_seconds} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Per-learner */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">3. Per Learner</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-3 py-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "ok" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                            <th className="text-left pl-1 py-1.5 font-bold text-[#64748B] uppercase tracking-wide">Learner</th>
                            <th className="text-right pr-1 py-1.5 font-bold text-[#64748B] uppercase tracking-wide">Sess</th>
                            <th className="text-right pr-1 py-1.5 font-bold text-[#64748B] uppercase tracking-wide">Success</th>
                            <th className="text-right pr-1 py-1.5 font-bold text-[#64748B] uppercase tracking-wide">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.data.per_learner.map((l) => (
                            <tr key={l.profile_id} className="border-b border-[#F1F5F9]">
                              <td className="pl-1 py-1.5 font-mono text-[#475569]">{l.profile_id.slice(0, 6)}…</td>
                              <td className="pr-1 py-1.5 text-right text-[#0F172A]">{l.total_sessions}</td>
                              <td className="pr-1 py-1.5 text-right text-[#0F172A]">{pct(l.attempt_success_rate)}</td>
                              <td className="pr-1 py-1.5 text-right text-[#0F172A]">{pct(l.error_rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
