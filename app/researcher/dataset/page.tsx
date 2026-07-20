"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { type DatasetExportType } from "@/services/admin-dataset-export-service";
import {
  TaskTypeIcon,
  TASK_TYPE_SHORT_LABEL,
  TASK_TYPE_ORDER,
} from "@/lib/task-type-utils";

type Batch = {
  batch_code: string;
  batch_name: string;
  batch_type: string;
  batch_status: string;
  task_types: string[];
};

const EXPORT_TYPES: { type: DatasetExportType; label: string; icon: React.ReactNode }[] = [
  {
    type: "session",
    label: "Session",
    icon: (
      // clock
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    type: "attempt",
    label: "Attempt",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" /><path d="M9 14h6" /><path d="M9 18h4" />
      </svg>
    ),
  },
  {
    type: "sequence",
    label: "Sequence",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    type: "raw_event",
    label: "Raw Event",
    icon: (
      // lightning bolt
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />
      </svg>
    ),
  },
];

const BATCH_TYPE_OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "", label: "All", icon: null },
  {
    value: "lab_set",
    label: "Lab",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2" />
        <path d="M8 2h8" /><path d="M7 15h10" />
      </svg>
    ),
  },
  {
    value: "assignment_set",
    label: "Assignment",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M9 5h6" /><path d="M9 12h6" /><path d="M9 17h4" />
        <path d="M5 7.5 6.5 9 9 6" /><path d="M5 14.5 6.5 16 9 13" />
        <rect x="4" y="3" width="16" height="18" rx="2" />
      </svg>
    ),
  },
  {
    value: "exam_set",
    label: "Exam",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" /><path d="M9 14h6" /><path d="M9 18h4" />
      </svg>
    ),
  },
];

// TaskTypeIcon is imported from @/lib/task-type-utils

function StatusDot({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span className="flex items-center justify-center" title={status}>
      <span className={`w-2.5 h-2.5 rounded-full ${active ? "bg-emerald-500" : "bg-[#CBD5E1]"}`} />
    </span>
  );
}

// TASK_TYPE_LABEL and TASK_TYPE_ORDER are imported from @/lib/task-type-utils
// Use TASK_TYPE_SHORT_LABEL for compact display in this page's table cells.

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
  const [statusFilter, setStatusFilter] = useState("");

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
    const token = await getToken();
    if (!token) { router.push("/auth/login"); return; }
    setLoadingBatches(true);
    setErrorMsg(null);

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

  useEffect(() => { queueMicrotask(() => { void loadBatches(); }); }, [loadBatches]);

  function toggleAll() {
    if (selected.size === filteredBatches.length && filteredBatches.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredBatches.map((b) => b.batch_code)));
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

  const filteredBatches = statusFilter ? batches.filter((b) => b.batch_status === statusFilter) : batches;

  const allSelected = filteredBatches.length > 0 && selected.size === filteredBatches.length;
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
        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 flex flex-wrap items-end gap-4">
          {/* Date range */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </div>
            <span className="text-sm text-[#94A3B8] pb-2.5">—</span>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => { setFromDate(""); setToDate(""); }}
                className="pb-2.5 text-xs font-semibold text-[#F37021] hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Batch Type toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Type</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              {BATCH_TYPE_OPTIONS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => setBatchTypeFilter(value)}
                  className={`flex items-center justify-center px-3 py-2.5 font-semibold border-r border-[#FED7AA] last:border-r-0 transition-colors
                    ${batchTypeFilter === value ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
                >
                  {icon ?? <span className="text-sm">All</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Task Type toggle */}
          {taskTypeOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">Task</label>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
                <button
                  type="button"
                  title="All"
                  onClick={() => setTaskTypeFilter("")}
                  className={`px-3 py-2.5 text-sm font-semibold border-r border-[#FED7AA] transition-colors
                    ${taskTypeFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
                >
                  All
                </button>
                {[...taskTypeOptions].sort((a, b) => {
                  const ai = TASK_TYPE_ORDER.indexOf(a);
                  const bi = TASK_TYPE_ORDER.indexOf(b);
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                }).map((t) => (
                  <button
                    key={t}
                    type="button"
                    title={TASK_TYPE_SHORT_LABEL[t] ?? t}
                    onClick={() => setTaskTypeFilter(t)}
                    className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] last:border-r-0 transition-colors
                      ${taskTypeFilter === t ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
                  >
                    <TaskTypeIcon type={t} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Status toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Status</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              {[
                { value: "", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] last:border-r-0 transition-colors
                    ${statusFilter === value ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
                >
                  {value !== "" && (
                    <span className={`w-2 h-2 rounded-full ${
                      statusFilter === value ? "bg-white" : value === "active" ? "bg-emerald-500" : "bg-[#CBD5E1]"
                    }`} />
                  )}
                  {label}
                </button>
              ))}
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
          <div className="grid grid-cols-[2rem_7rem_1fr_3.5rem_6rem_4.5rem] gap-x-3 px-5 py-3 border-b border-[#FED7AA] bg-[#FFF7ED]">
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
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider text-center">Type</p>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider text-center">Tasks</p>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider text-center">Status</p>
          </div>

          {loadingBatches ? (
            <div className="flex items-center justify-center py-12 text-sm text-[#64748B]">
              Loading batches…
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[#94A3B8]">
              No batches found for the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-[#FED7AA]">
              {filteredBatches.map((batch) => (
                <label
                  key={batch.batch_code}
                  className="grid grid-cols-[2rem_7rem_1fr_3.5rem_6rem_4.5rem] gap-x-3 px-5 py-3.5 items-center hover:bg-[#FFF7ED] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(batch.batch_code)}
                    onChange={() => toggleOne(batch.batch_code)}
                    className="w-4 h-4 accent-[#F37021] cursor-pointer"
                  />
                  <span className="text-sm font-mono font-semibold text-[#F37021] truncate">{batch.batch_code}</span>
                  <span className="text-sm text-[#0F172A] truncate">{batch.batch_name}</span>
                  <span className="flex items-center justify-center text-[#64748B]">
                    {BATCH_TYPE_OPTIONS.find((o) => o.value === batch.batch_type)?.icon ?? (
                      <span className="text-xs">{batch.batch_type}</span>
                    )}
                  </span>
                  <span className="flex items-center justify-center gap-1 text-[#64748B]">
                    {(batch.task_types ?? []).length >= 4 ? (
                      <span title={batch.task_types.join(", ")}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <rect x="3" y="3" width="8" height="8" rx="1" />
                          <rect x="13" y="3" width="8" height="8" rx="1" />
                          <rect x="3" y="13" width="8" height="8" rx="1" />
                          <rect x="13" y="13" width="8" height="8" rx="1" />
                        </svg>
                      </span>
                    ) : (batch.task_types ?? []).map((t) => (
                      <span key={t} title={TASK_TYPE_SHORT_LABEL[t] ?? t}>
                        <TaskTypeIcon type={t} />
                      </span>
                    ))}
                  </span>
                  <StatusDot status={batch.batch_status} />
                </label>
              ))}
            </div>
          )}

          {/* Selection summary */}
          <div className="px-5 py-3 border-t border-[#FED7AA] bg-[#FFF7ED] flex items-center justify-between">
            <p className="text-xs text-[#64748B]">
              {selected.size === 0
                ? "ไม่ได้เลือก batch — จะ export ทั้งหมด"
                : `เลือก ${selected.size} / ${filteredBatches.length} batch`}
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
          {EXPORT_TYPES.map(({ type, label, icon }) => {
            const isLoading = loadingExport === type;
            return (
              <button
                key={type}
                type="button"
                disabled={exporting}
                onClick={() => handleExport(type)}
                className={`flex flex-col items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors
                  ${isLoading || exporting
                    ? "bg-[#FED7AA] text-[#C2410C] cursor-not-allowed"
                    : "bg-[#F37021] hover:bg-[#C2410C] text-white"
                  }`}
              >
                {isLoading ? (
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  icon
                )}
                <span>{label}</span>
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
