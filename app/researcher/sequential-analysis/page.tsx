"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";
import { SequentialAnalysisDetailModal } from "@/app/researcher/_components/SequentialAnalysisDetailModal";
import { SequentialCompareModal } from "@/app/researcher/_components/SequentialCompareModal";
import { TaskTypeIcon } from "@/lib/task-type-utils";
import type { SequentialDatasetRecord, SequentialRunRecord } from "@/app/api/researcher/sequential-analysis/route";

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

type SelectedRun = {
  datasetId: string;
  runId: string;
  runNumber: string;
  datasetCode: string;
  datasetName: string;
  artifactSource: "result_version" | "static_fallback" | null;
};

type ListResponse = {
  datasets: SequentialDatasetRecord[];
  filter_options: {
    batch_types: string[];
    set_families: string[];
    task_types: string[];
    run_statuses: string[];
    usage_statuses: string[];
  };
};

type DetailTarget = {
  datasetId: string;
  runId: string;
  runNumber: string;
  datasetCode: string;
  artifactSource: "result_version" | "static_fallback" | null;
};

// ---------------------------------------------------------------------------
// Icons (matching Dataset Analytics style)
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
// Main page
// ---------------------------------------------------------------------------

export default function SequentialAnalysisPage() {
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
  const [selectedRuns, setSelectedRuns] = useState<SelectedRun[]>([]);
  const [page, setPage] = useState(1);

  // Modals
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [runTarget, setRunTarget] = useState<SequentialDatasetRecord | null>(null);
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

    const res = await fetch("/api/researcher/sequential-analysis", {
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

  function toggleSelectRun(ds: SequentialDatasetRecord, run: SequentialRunRecord) {
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
          artifactSource: run.artifact_source,
        },
      ];
    });
  }

  function openDetail(ds: SequentialDatasetRecord, run: SequentialRunRecord) {
    const globalIndex = ds.runs.findIndex((r) => r.id === run.id);
    const runNumber = String(ds.runs.length - globalIndex).padStart(3, "0");
    setDetailTarget({
      datasetId: ds.id,
      runId: run.id,
      runNumber,
      datasetCode: ds.code,
      artifactSource: run.artifact_source,
    });
  }

  function openCompare() {
    setCompareOpen(true);
  }

  async function continueRun(ds: SequentialDatasetRecord, run: SequentialRunRecord) {
    if (!token || actionLoading) return;
    setActionLoading(run.id);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${ds.id}/runs/${run.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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

  async function stopRun(ds: SequentialDatasetRecord, run: SequentialRunRecord) {
    if (!token || actionLoading) return;
    setActionLoading(run.id);
    try {
      await fetch(`/api/researcher/dataset-analytics/${ds.id}/runs?run_id=${run.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      void loadData();
    } finally {
      setActionLoading(null);
    }
  }

  function runProgress(run: SequentialRunRecord): { pct: number; done: number; total: number } | null {
    const steps = run.analysis_steps;
    if (!steps || steps.length === 0) return null;
    const done = steps.filter((s) => s.status === "completed").length;
    return { pct: Math.round((done / steps.length) * 100), done, total: steps.length };
  }

  async function confirmRunPipeline() {
    if (!runTarget || !token) return;
    setRunLoading(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${runTarget.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ run_type: "sequential" }),
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
        <ResearcherBreadcrumb current="Sequential Analysis" />

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Sequential Analysis</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Dataset &#8594; Pipeline Run &#8594; Sequential Analysis records</p>
        </div>

        {/* ── Filters (Dataset Analytics icon-only style) ── */}
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

          {/* Batch Type — icon-only */}
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

          {/* Activity Type — icon-only */}
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

          {/* Task Type — icon-only */}
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

          {/* Run Status — dot style */}
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
                    <td colSpan={8} className="text-center py-10 text-[#94A3B8] text-sm">
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
                              title="Run Sequence Analysis"
                              className="p-1 rounded hover:bg-[#FED7AA] text-[#F37021] transition-colors"
                              aria-label="Run Sequence Analysis"
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
                            <td colSpan={8} className="pl-10 py-3 text-[#94A3B8] text-xs italic">
                              No pipeline runs available.
                            </td>
                          </tr>
                        ) : (
                          visibleRuns.map((run) => {
                              const globalIndex = ds.runs.findIndex((r) => r.id === run.id);
                              const runNumber = String(ds.runs.length - globalIndex).padStart(3, "0");
                              const isSelected = selectedRuns.some((s) => s.runId === run.id);
                              const selectionBlocked = selectedRuns.length >= MAX_COMPARE && !isSelected;
                              const checkboxDisabled = !run.is_comparable || selectionBlocked;
                              const checkboxTitle = !run.is_comparable
                                ? (run.not_comparable_reason ?? "Not comparable")
                                : selectionBlocked
                                  ? `Max ${MAX_COMPARE} runs selected`
                                  : undefined;
                              const canView = run.artifact_availability !== "unavailable";

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
                                  {/* Run# (3-digit) */}
                                  <td className="px-3 py-2.5 align-middle" colSpan={2}>
                                    <span className="font-mono text-xs font-semibold text-[#F37021]">#{runNumber}</span>
                                  </td>
                                  {/* DateTime */}
                                  <td className="px-3 py-2.5 align-middle text-xs text-[#64748B]" colSpan={2}>
                                    {run.created_at
                                      ? new Date(run.created_at).toLocaleString()
                                      : "—"}
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
                                  <td className="px-3 py-2.5 align-middle text-center" colSpan={1}>
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
      {detailTarget && token && (
        <SequentialAnalysisDetailModal
          datasetId={detailTarget.datasetId}
          runId={detailTarget.runId}
          runNumber={detailTarget.runNumber}
          datasetCode={detailTarget.datasetCode}
          artifactSource={detailTarget.artifactSource}
          token={token}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* Compare Modal */}
      {compareOpen && token && (
        <SequentialCompareModal
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
                <p className="text-sm font-bold text-[#0F172A]">Run Sequence Analysis</p>
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
              This will create a new <strong>sequential</strong> pipeline run for{" "}
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
