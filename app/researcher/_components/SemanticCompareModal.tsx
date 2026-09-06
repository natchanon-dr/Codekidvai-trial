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

// Semantic Analysis result shape is not yet implemented server-side
// (lib/analysis/semantic.ts is Phase 5 / blocked). This modal renders
// whatever JSON the detail endpoint eventually returns; today every
// fetch resolves to an error state ("No semantic analysis artifact
// available yet.") until that work lands.
type RunResult =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; data: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CellLoading() {
  return <div className="text-xs text-[#94A3B8] italic py-4 text-center">Loading…</div>;
}

function CellError({ message }: { message: string }) {
  return <div className="text-xs text-red-600 py-2">{message}</div>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SemanticCompareModal({ selected, onClose, token }: Props) {
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
          const url = `/api/researcher/semantic-analysis?mode=detail&dataset_id=${encodeURIComponent(ref.datasetId)}&run_id=${encodeURIComponent(ref.runId)}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({ error: "Request failed" }));
            return { state: "error", message: (j as { error?: string }).error ?? "Failed" };
          }
          const j = await res.json() as { result: Record<string, unknown> };
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
              Compare Semantic Runs ({selected.length})
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

          {/* Section 1: Result (placeholder until Semantic Analysis is implemented) */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
              <p className="text-xs font-semibold text-[#0F172A]">Result</p>
            </div>
            <div className="flex divide-x divide-[#F1F5F9]">
              {results.map((result, i) => (
                <div key={selected[i].runId} className={`${colWidth} px-4 py-3`}>
                  {result.state === "loading" && <CellLoading />}
                  {result.state === "error" && <CellError message={result.message} />}
                  {result.state === "ok" && (
                    <pre className="text-[10px] font-mono text-[#475569] whitespace-pre-wrap break-all">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
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
