"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";
import { SequentialAnalysisDetailModal } from "@/app/researcher/_components/SequentialAnalysisDetailModal";
import { SequentialCompareModal } from "@/app/researcher/_components/SequentialCompareModal";
import type { SequentialDatasetRecord, SequentialRunRecord } from "@/app/api/researcher/sequential-analysis/route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_COMPARE = 3;
const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectedRun = {
  datasetId: string;
  runId: string;
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
  };
};

type DetailTarget = {
  datasetId: string;
  runId: string;
  datasetCode: string;
  artifactSource: "result_version" | "static_fallback" | null;
};

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

function ArtifactBadge({ availability }: { availability: SequentialRunRecord["artifact_availability"] }) {
  if (availability === "available") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
        available
      </span>
    );
  }
  if (availability === "static_fallback") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        Pilot &#8212; static artifact
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      unavailable
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

  // Table state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedRuns, setSelectedRuns] = useState<SelectedRun[]>([]);
  const [page, setPage] = useState(1);

  // Modals
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

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
      return [
        ...prev,
        {
          datasetId: ds.id,
          runId: run.id,
          datasetCode: ds.code,
          datasetName: ds.name,
          artifactSource: run.artifact_source,
        },
      ];
    });
  }

  function openDetail(ds: SequentialDatasetRecord, run: SequentialRunRecord) {
    setDetailTarget({
      datasetId: ds.id,
      runId: run.id,
      datasetCode: ds.code,
      artifactSource: run.artifact_source,
    });
  }

  function openCompare() {
    setCompareOpen(true);
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

  const filterOptions = data?.filter_options;

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

        {/* Toolbar */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search dataset code or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#F37021] w-48"
          />

          {/* Batch Type */}
          <select
            value={batchTypeFilter}
            onChange={(e) => { setBatchTypeFilter(e.target.value); setPage(1); }}
            className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#F37021]"
          >
            <option value="">All Batch Types</option>
            {(filterOptions?.batch_types ?? []).map((bt) => (
              <option key={bt} value={bt}>{bt}</option>
            ))}
          </select>

          {/* Activity / Set Family */}
          <select
            value={setFamilyFilter}
            onChange={(e) => { setSetFamilyFilter(e.target.value); setPage(1); }}
            className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#F37021]"
          >
            <option value="">All Activity Types</option>
            {(filterOptions?.set_families ?? []).map((sf) => (
              <option key={sf} value={sf}>{sf}</option>
            ))}
          </select>

          {/* Task Type */}
          <select
            value={taskTypeFilter}
            onChange={(e) => { setTaskTypeFilter(e.target.value); setPage(1); }}
            className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#F37021]"
          >
            <option value="">All Task Types</option>
            {(filterOptions?.task_types ?? []).map((tt) => (
              <option key={tt} value={tt}>{tt}</option>
            ))}
          </select>

          {/* Run Status */}
          <select
            value={runStatusFilter}
            onChange={(e) => { setRunStatusFilter(e.target.value); setPage(1); }}
            className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#F37021]"
          >
            <option value="">All Run Statuses</option>
            {(filterOptions?.run_statuses ?? []).map((rs) => (
              <option key={rs} value={rs}>{rs}</option>
            ))}
          </select>

          <div className="flex-1" />

          {/* Selected count badge */}
          {selectedRuns.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FED7AA] text-[#92400E]">
              {selectedRuns.length} selected
            </span>
          )}

          {/* Compare button */}
          <button
            onClick={openCompare}
            disabled={selectedRuns.length < 2}
            title={selectedRuns.length < 2 ? "Select at least 2 runs to compare" : `Compare ${selectedRuns.length} runs`}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#F37021] text-white hover:bg-[#D95F10] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compare
          </button>
        </section>

        {/* Table */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#FFF7ED] border-b border-[#FED7AA]">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Dataset</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Batch</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Activity</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Task Type</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Class</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Runs</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pagedDatasets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-[#94A3B8] text-sm">
                      No datasets found.
                    </td>
                  </tr>
                )}
                {pagedDatasets.map((ds) => {
                  const isExpanded = expandedIds.has(ds.id);
                  return (
                    <>
                      {/* Dataset row */}
                      <tr
                        key={ds.id}
                        className="border-b border-[#F1F5F9] hover:bg-[#FFF7ED] cursor-pointer"
                        onClick={() => toggleExpanded(ds.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-[#0F172A]">{ds.code}</div>
                          <div className="text-[#64748B] text-[11px] mt-0.5 max-w-[200px] truncate">{ds.name}</div>
                        </td>
                        <td className="px-3 py-3 text-[#475569]">{ds.batch_type || "—"}</td>
                        <td className="px-3 py-3 text-[#475569]">{ds.set_family || "—"}</td>
                        <td className="px-3 py-3 text-[#475569]">{ds.task_type || "—"}</td>
                        <td className="px-3 py-3 text-[#475569]">{ds.class_name ?? "—"}</td>
                        <td className="px-3 py-3 text-[#475569]">{ds.runs.length}</td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-[#94A3B8]" aria-hidden="true">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded run rows */}
                      {isExpanded && (
                        ds.runs.length === 0 ? (
                          <tr key={`${ds.id}-empty`} className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                            <td colSpan={7} className="pl-10 py-3 text-[#94A3B8] text-xs italic">
                              No pipeline runs available.
                            </td>
                          </tr>
                        ) : (
                          ds.runs
                            .filter((run) => !runStatusFilter || run.status === runStatusFilter)
                            .map((run) => {
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
                                  {/* Indent + checkbox */}
                                  <td className="pl-10 pr-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={checkboxDisabled}
                                        title={checkboxTitle}
                                        onChange={() => toggleSelectRun(ds, run)}
                                        className="w-3.5 h-3.5 accent-[#F37021] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                      />
                                      <span
                                        className="font-mono text-[#0F172A] text-[11px]"
                                        title={run.id}
                                      >
                                        {run.id.slice(0, 8)}&hellip;
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-[#64748B]">
                                    {run.created_at
                                      ? new Date(run.created_at).toLocaleDateString()
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <StatusBadge status={run.status} />
                                  </td>
                                  <td className="px-3 py-2.5 font-mono text-[#475569] text-[11px]">
                                    {run.result_version ?? "—"}
                                  </td>
                                  <td className="px-3 py-2.5 font-mono text-[#475569] text-[11px]">
                                    {(run.configuration?.pipeline_version as string | undefined) ?? "—"}
                                  </td>
                                  <td className="px-3 py-2.5 font-mono text-[#475569] text-[11px]">
                                    {(run.configuration?.seed as number | undefined) ?? "—"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <ArtifactBadge availability={run.artifact_availability} />
                                      {/* Eye icon */}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openDetail(ds, run); }}
                                        disabled={run.artifact_availability === "unavailable"}
                                        title={run.artifact_availability === "unavailable" ? "No artifact available" : "View Analysis"}
                                        className="p-1 rounded hover:bg-[#FED7AA] text-[#F37021] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        aria-label="View Analysis"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M2 12s3.636-7 10-7 10 7 10 7-3.636 7-10 7-10-7-10-7z" />
                                          <circle cx="12" cy="12" r="3" />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                        )
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

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
    </div>
  );
}
