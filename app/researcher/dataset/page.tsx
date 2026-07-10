"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { type DatasetExportType } from "@/services/admin-dataset-export-service";

type Batch = {
  batch_code: string;
  batch_name: string;
  batch_type: string;
  batch_status: string;
};

const EXPORT_TYPES: { type: DatasetExportType; label: string }[] = [
  { type: "session",   label: "Session" },
  { type: "attempt",   label: "Attempt" },
  { type: "sequence",  label: "Sequence" },
  { type: "raw_event", label: "Raw Event" },
];

function getFilenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? fallback;
}

export default function ResearcherDatasetPage() {
  const router = useRouter();

  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [batchTypeFilter, setBatchTypeFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");

  // Options
  const [batchTypeOptions, setBatchTypeOptions] = useState<string[]>([]);
  const [taskTypeOptions, setTaskTypeOptions] = useState<string[]>([]);

  // Batch list
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingBatches, setLoadingBatches] = useState(true);

  // Export
  const [loadingExport, setLoadingExport] = useState<DatasetExportType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    setErrorMsg(null);
    const token = await getToken();
    if (!token) { router.push("/auth/login"); return; }

    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (batchTypeFilter) params.set("batch_type", batchTypeFilter);
    if (taskTypeFilter) params.set("task_type", taskTypeFilter);

    const res = await fetch(`/api/researcher/batches?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setErrorMsg(json.error ?? "Failed to load batches."); setLoadingBatches(false); return; }

    setBatches(json.batches ?? []);
    if (json.batchTypes?.length) setBatchTypeOptions(json.batchTypes);
    if (json.taskTypes?.length) setTaskTypeOptions(json.taskTypes);
    // Clear selections that are no longer in list
    setSelected((prev) => {
      const codes = new Set((json.batches ?? []).map((b: Batch) => b.batch_code));
      return new Set([...prev].filter((c) => codes.has(c)));
    });
    setLoadingBatches(false);
  }, [fromDate, toDate, batchTypeFilter, taskTypeFilter, getToken, router]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  function toggleAll() {
    if (selected.size === batches.length && batches.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(batches.map((b) => b.batch_code)));
    }
  }

  function toggleOne(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function handleExport(type: DatasetExportType) {
    setErrorMsg(null);
    const token = await getToken();
    if (!token) { router.push("/auth/login"); return; }

    setLoadingExport(type);
    try {
      const params = new URLSearchParams({ type });
      if (selected.size > 0) params.set("batch_codes", [...selected].join(","));

      const response = await fetch(`/api/admin/export-dataset?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Export failed.");
      }
      const blob = await response.blob();
      const filename = getFilenameFromContentDisposition(
        response.headers.get("Content-Disposition"),
        `dataset_${type}_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setLoadingExport(null);
    }
  }

  const allSelected = batches.length > 0 && selected.size === batches.length;
  const someSelected = selected.size > 0 && !allSelected;
  const exporting = loadingExport !== null;

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/researcher/dashboard" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Researcher Dashboard
          </a>
          <span className="text-xs font-semibold text-[#F37021] tracking-wide uppercase">Dataset Export</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">Dataset Export</h1>
          <p className="text-sm text-[#64748B] mt-1">กรอง batch ที่ต้องการ แล้วเลือก batch และกด Export</p>
        </section>

        {/* Filters */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Filters</p>

          {/* Date range */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => { setFromDate(""); setToDate(""); }}
                className="pb-0.5 text-xs font-semibold text-[#F37021] hover:underline self-end"
              >
                Clear dates
              </button>
            )}
          </div>

          {/* Batch Type + Task Type */}
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">Batch Type</label>
              <select
                value={batchTypeFilter}
                onChange={(e) => setBatchTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] min-w-[160px]"
              >
                <option value="">All types</option>
                {batchTypeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">Task Type</label>
              <select
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] min-w-[160px]"
              >
                <option value="">All task types</option>
                {taskTypeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Error */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Batch table */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2.5rem_1fr_2fr_1fr_1fr] gap-x-4 px-5 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="w-4 h-4 accent-[#F37021] cursor-pointer"
              />
            </div>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Batch Code</p>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Batch Name</p>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Type</p>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Status</p>
          </div>

          {loadingBatches ? (
            <div className="flex items-center justify-center py-12 text-sm text-[#64748B]">
              Loading batches…
            </div>
          ) : batches.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[#94A3B8]">
              No batches found for the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-[#FED7AA]">
              {batches.map((batch) => (
                <label
                  key={batch.batch_code}
                  className="grid grid-cols-[2.5rem_1fr_2fr_1fr_1fr] gap-x-4 px-5 py-3.5 items-center hover:bg-[#FFF7ED] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(batch.batch_code)}
                    onChange={() => toggleOne(batch.batch_code)}
                    className="w-4 h-4 accent-[#F37021] cursor-pointer"
                  />
                  <span className="text-sm font-mono font-semibold text-[#F37021] truncate">{batch.batch_code}</span>
                  <span className="text-sm text-[#0F172A] truncate">{batch.batch_name}</span>
                  <span className="text-xs text-[#64748B] truncate">{batch.batch_type}</span>
                  <span className={`text-xs font-semibold truncate ${batch.batch_status === "active" ? "text-emerald-600" : "text-[#94A3B8]"}`}>
                    {batch.batch_status}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Selection summary */}
          <div className="px-5 py-3 border-t border-[#FED7AA] bg-[#FFF7ED] flex items-center justify-between">
            <p className="text-xs text-[#64748B]">
              {selected.size === 0
                ? "ไม่ได้เลือก batch — จะ export ทั้งหมด"
                : `เลือก ${selected.size} / ${batches.length} batch`}
            </p>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-[#F37021] hover:underline font-semibold"
              >
                Clear selection
              </button>
            )}
          </div>
        </section>

        {/* Export buttons */}
        <section className="grid grid-cols-4 gap-3">
          {EXPORT_TYPES.map(({ type, label }) => {
            const isLoading = loadingExport === type;
            return (
              <button
                key={type}
                type="button"
                disabled={exporting}
                onClick={() => handleExport(type)}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-colors
                  ${isLoading || exporting
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
            );
          })}
        </section>

        {/* Privacy note */}
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          ข้อมูลทุก export ใช้ <code className="bg-white px-1 rounded text-[#F37021]">participant_code</code> แทน identity จริง — ไม่มี email, display name, หรือ auth_user_id
        </p>
      </main>
    </div>
  );
}
