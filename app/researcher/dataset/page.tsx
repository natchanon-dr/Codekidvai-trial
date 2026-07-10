"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exportDatasetAsCsv, type DatasetExportType } from "@/services/admin-dataset-export-service";

type ExportEntry = {
  type: DatasetExportType;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const EXPORT_ENTRIES: ExportEntry[] = [
  {
    type: "session",
    label: "Session Level",
    description: "One row per student × task session. Includes scores, duration, attempt counts.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6M4.5 19.5l1.5-1.5M19.5 4.5l-1.5 1.5M4.5 4.5l1.5 1.5M19.5 19.5l-1.5-1.5M12 3v2m0 14v2M3 12H5m14 0h2" />
      </svg>
    ),
  },
  {
    type: "attempt",
    label: "Attempt Level",
    description: "One row per individual run/submit attempt. Includes execution time and error type.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5M3.75 6h16.5M3.75 18h16.5" />
      </svg>
    ),
  },
  {
    type: "sequence",
    label: "Sequence Level",
    description: "Attempt sequences per session. Useful for temporal pattern analysis.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    type: "raw_event",
    label: "Raw Event Log",
    description: "Low-level interaction events (clicks, typing, SQL runs). High row volume.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
];

export default function ResearcherDatasetPage() {
  const router = useRouter();
  const [batchCode, setBatchCode] = useState("");
  const [loadingType, setLoadingType] = useState<DatasetExportType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleExport(type: DatasetExportType) {
    setErrorMsg(null);
    setLoadingType(type);
    try {
      await exportDatasetAsCsv(type, { batch_code: batchCode.trim() || undefined });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed.";
      if (msg.includes("session not found") || msg.includes("authorization")) {
        router.push("/auth/login");
        return;
      }
      setErrorMsg(msg);
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      {/* Header */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#F37021]">
              <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
            </svg>
            <span className="text-sm font-semibold text-[#64748B]">Researcher</span>
          </div>
          <span className="text-xs font-semibold text-[#F37021] tracking-wide uppercase">Dataset Export</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Title */}
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">Dataset Export</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Download anonymised learning data for research and AI model training. No PII is included in any export.
          </p>
        </section>

        {/* Batch filter */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5">
          <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">
            Batch Code Filter
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              placeholder="Leave empty to export all batches"
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />
            {batchCode && (
              <button
                type="button"
                onClick={() => setBatchCode("")}
                className="text-xs text-[#F37021] hover:underline font-semibold"
              >
                Clear
              </button>
            )}
          </div>
          {batchCode && (
            <p className="text-xs text-[#F37021] mt-2 font-medium">
              Filtering by: <span className="font-bold">{batchCode}</span>
            </p>
          )}
        </section>

        {/* Error */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Export cards */}
        <section className="grid gap-4 sm:grid-cols-2">
          {EXPORT_ENTRIES.map(({ type, label, description, icon }) => {
            const isLoading = loadingType === type;
            return (
              <div
                key={type}
                className="bg-white border border-[#FED7AA] rounded-2xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <span className="text-[#F37021] mt-0.5">{icon}</span>
                  <div>
                    <p className="font-semibold text-[#0F172A] text-sm">{label}</p>
                    <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isLoading || loadingType !== null}
                  onClick={() => handleExport(type)}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors
                    ${isLoading || loadingType !== null
                      ? "bg-[#FED7AA] text-[#C2410C] cursor-not-allowed"
                      : "bg-[#F37021] hover:bg-[#C2410C] text-white"
                    }`}
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Downloading…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v7.19l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 9.53a.75.75 0 111.06-1.06L9.25 10.94V3.75A.75.75 0 0110 3zM3.75 15a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H3.75z" clipRule="evenodd" />
                      </svg>
                      Export {label}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </section>

        {/* Note */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl px-5 py-4">
          <p className="text-xs text-[#64748B] leading-relaxed">
            <span className="font-semibold text-[#0F172A]">Privacy note:</span>{" "}
            All exports use anonymised <code className="bg-[#FFF7ED] px-1 rounded text-[#F37021]">participant_code</code> identifiers.
            No email addresses, display names, or <code className="bg-[#FFF7ED] px-1 rounded text-[#F37021]">auth_user_id</code> values are included.
            Place downloaded files in <code className="bg-[#FFF7ED] px-1 rounded text-[#F37021]">notebooks/data/raw/</code> before running the Phase 3 notebook pipeline.
          </p>
        </section>
      </main>
    </div>
  );
}
