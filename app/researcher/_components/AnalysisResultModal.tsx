"use client";

import { useEffect, useState } from "react";
import { AnalysisResultView } from "./AnalysisResultView";
import type { ArtifactPayload } from "./AnalysisResultView";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  datasetId: string;
  runId: string;
  runNumber?: string;
  datasetCode: string;
  artifactSource: "result_version" | "static_fallback" | "local_disk" | null;
  onClose: () => void;
  token: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalysisResultModal({
  datasetId,
  runId,
  runNumber,
  datasetCode,
  artifactSource,
  onClose,
  token,
}: Props) {
  const [data, setData] = useState<ArtifactPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const url = `/api/researcher/sequential-analysis?mode=detail&dataset_id=${encodeURIComponent(datasetId)}&run_id=${encodeURIComponent(runId)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        setError((j as { error?: string }).error ?? "Failed to load artifact.");
        setLoading(false);
        return;
      }
      setData((await res.json()) as ArtifactPayload);
      setLoading(false);
    }
    void load();
  }, [datasetId, runId, token]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-screen bg-[#FFF7ED]">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-[#0F172A] text-sm">
              Sequential Analysis &#8212; {datasetCode}
            </p>
            <p className="text-xs text-[#64748B]">
              Run: {runNumber ? `#${runNumber}` : `${runId.slice(0, 8)}…`} &#183; Read-only
              {artifactSource === "static_fallback" && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  Pilot &#8212; static artifact
                </span>
              )}
              {artifactSource === "local_disk" && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
                  Local disk artifact
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-[#FFF7ED] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          {loading && (
            <div className="text-center py-16 text-sm text-[#64748B]">Loading artifact…</div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
              <p className="font-semibold mb-1">Error loading artifact</p>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <AnalysisResultView artifact={data} />
          )}
        </main>
      </div>
    </div>
  );
}
