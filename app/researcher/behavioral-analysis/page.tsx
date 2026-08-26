"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";
import type {
  BehavioralLearnerRecord,
  BehavioralTaskRecord,
  BehavioralAnalysisResponse,
} from "@/app/api/researcher/behavioral-analysis/route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

// ---------------------------------------------------------------------------
// Small icons
// ---------------------------------------------------------------------------

function TaskTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "sql_text":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
        </svg>
      );
    case "sql_block":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "er_diagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="2" y="8" width="8" height="8" rx="1" />
          <rect x="14" y="8" width="8" height="8" rx="1" />
          <path d="M10 12h4" />
        </svg>
      );
    case "stored_procedure":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    default:
      return <span className="text-[10px] font-mono font-bold text-[#94A3B8]">{type.slice(0, 2).toUpperCase()}</span>;
  }
}

function ComplexityDot({ score }: { score: number }) {
  const cls = score >= 70 ? "bg-rose-500" : score >= 45 ? "bg-amber-400" : "bg-emerald-500";
  const label = score >= 70 ? "High" : score >= 45 ? "Med" : "Low";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${cls}`} />
      <span className="text-[10px] font-semibold text-[#475569]">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal — same card style as Sequential Analysis detail modal
// ---------------------------------------------------------------------------

function DetailModal({
  learner,
  task,
  onClose,
}: {
  learner: BehavioralLearnerRecord;
  task: BehavioralTaskRecord;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-[#FED7AA] shadow-xl max-w-lg w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Behavioral Detail</p>
            <p className="text-base font-bold text-[#0F172A] mt-0.5">
              {learner.participant_code}{" "}
              <span className="text-[#94A3B8]">—</span>{" "}
              <span className="font-mono text-[#F37021]">{task.task_code}</span>
            </p>
            <p className="text-xs text-[#64748B]">
              {learner.display_name} · {task.batch_code} · {task.task_type}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#94A3B8] hover:text-[#0F172A] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <hr className="border-[#FED7AA]" />

        {/* Complexity bar */}
        <div>
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
            Complexity Score
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-[#F1F5F9] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  task.complexity_score >= 70 ? "bg-rose-500" :
                  task.complexity_score >= 45 ? "bg-amber-400" : "bg-emerald-500"
                }`}
                style={{ width: `${task.complexity_score}%` }}
              />
            </div>
            <span className="text-lg font-bold text-[#0F172A] font-mono">
              {task.complexity_score}
            </span>
            <span className="text-xs text-[#94A3B8]">/ 100</span>
          </div>
          <p className="text-[10px] text-[#94A3B8] mt-1">
            {task.complexity_score >= 70
              ? "High complexity — multiple retry loops detected."
              : task.complexity_score >= 45
              ? "Medium complexity — some difficulty observed."
              : "Low complexity — learner resolved task efficiently."}
          </p>
        </div>

        {/* Feature grid */}
        <div>
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">
            Attempt Features (NB10 proxy)
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Submission Count",  value: task.attempt_count,  unit: "submissions" },
              { label: "Reviewed Count",    value: task.reviewed_count, unit: "reviewed"    },
              { label: "Correct Ratio",     value: `${Math.round(task.correct_ratio * 100)}%`, unit: "" },
              { label: "Avg Score",         value: task.avg_score_pct != null ? `${task.avg_score_pct}%` : "—", unit: "" },
              { label: "Task Type",         value: task.task_type,      unit: "" },
              { label: "Risk Status",       value: task.at_risk ? "At-Risk" : "OK", unit: "" },
            ].map(({ label, value, unit }) => (
              <div key={label} className="bg-[#FFF7ED] rounded-xl border border-[#FED7AA] px-3 py-2.5">
                <p className="text-[10px] text-[#94A3B8] mb-0.5">{label}</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  {value}
                  {unit ? (
                    <span className="text-[10px] font-normal text-[#94A3B8] ml-1">{unit}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Research note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-amber-700">
            <span className="font-bold">Research constraint:</span> Complexity is a proxy metric
            derived from attempt patterns — not expert-validated.{" "}
            <span className="font-semibold">label_validity = pilot_only.</span>
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-[#F37021] text-white text-sm font-semibold hover:bg-[#E06010] transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BehavioralAnalysisPage() {
  const router     = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);

  // ── Auth / profile state ──────────────────────────────────────────────────
  const [token,           setToken]           = useState<string | null>(null);
  const [profileOpen,     setProfileOpen]     = useState(false);
  const [displayName,     setDisplayName]     = useState<string | null>(null);
  const [email,           setEmail]           = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);

  // ── Data state ────────────────────────────────────────────────────────────
  const [data,    setData]    = useState<BehavioralAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,     setSearch]     = useState("");
  const [riskFilter, setRiskFilter] = useState<"" | "risk" | "ok">("");
  const [taskType,   setTaskType]   = useState("");
  const [page,       setPage]       = useState(1);

  // ── Table state ───────────────────────────────────────────────────────────
  const [expandedIds,  setExpandedIds]  = useState<Set<string>>(new Set());
  const [detailTarget, setDetailTarget] = useState<{
    learner: BehavioralLearnerRecord;
    task: BehavioralTaskRecord;
  } | null>(null);

  // ── Auth init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      setToken(session.access_token);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("mst_profiles")
        .select("display_name, participant_code, role")
        .eq("auth_user_id", session.user.id)
        .single();
      if (prof && prof.role !== "researcher" && prof.role !== "admin") {
        router.push("/student/dashboard"); return;
      }
      setDisplayName(prof?.display_name ?? null);
      setEmail(user?.email ?? null);
      setParticipantCode(prof?.participant_code ?? null);
    }
    void init();
  }, [router]);

  // ── Click-outside for profile dropdown ────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Data fetch ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/researcher/behavioral-analysis", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Request failed" }));
      setError((j as { error?: string }).error ?? "Failed to load data.");
      setLoading(false);
      return;
    }
    setData(await res.json() as BehavioralAnalysisResponse);
    setLoading(false);
  }, [token]);

  useEffect(() => { if (token) void loadData(); }, [token, loadData]);

  // ── Logout ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const allLearners   = data?.learners ?? [];
  const allTaskTypes  = [...new Set(allLearners.flatMap((l) => l.tasks.map((t) => t.task_type)))].sort();

  const filteredLearners = allLearners.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.participant_code.toLowerCase().includes(q) &&
        !l.display_name.toLowerCase().includes(q) &&
        !l.tasks.some((t) => t.task_code.toLowerCase().includes(q))
      ) return false;
    }
    if (riskFilter === "risk" && !l.at_risk) return false;
    if (riskFilter === "ok"   &&  l.at_risk) return false;
    if (taskType && !l.tasks.some((t) => t.task_type === taskType)) return false;
    return true;
  });

  const totalPages    = Math.max(1, Math.ceil(filteredLearners.length / PAGE_SIZE));
  const pagedLearners = filteredLearners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Loading / error screens ────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading…
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

  const ov = data?.overview;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FFF7ED]">

      {/* ── Header ── */}
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
        <ResearcherBreadcrumb current="Behavioral Analysis" />

        {/* ── Title ── */}
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Behavioral Analysis</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Learner &#8594; Task &#8594; Behavioral Complexity Features (NB10 proxy)
          </p>
        </div>

        {/* ── Filter bar — same style as Sequential Analysis ── */}
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
                placeholder="Learner or task…"
                className="pl-9 pr-3 py-2.5 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] w-44"
              />
            </div>
          </div>

          {/* Risk — dot style (matches Sequential run-status dots) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Risk</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All risk levels" onClick={() => { setRiskFilter(""); setPage(1); }}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${riskFilter === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              {(["risk", "ok"] as const).map((v, i, arr) => (
                <button key={v} type="button" title={v === "risk" ? "At-Risk" : "OK"}
                  onClick={() => { setRiskFilter(riskFilter === v ? "" : v); setPage(1); }}
                  className={`flex items-center justify-center px-3 py-2.5 ${i < arr.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${riskFilter === v ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                  <span className={`w-2 h-2 rounded-full ${riskFilter === v ? "bg-white" : v === "risk" ? "bg-rose-500" : "bg-emerald-500"}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Task Type — icon style */}
          {allTaskTypes.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">Task Type</label>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
                <button type="button" title="All task types" onClick={() => { setTaskType(""); setPage(1); }}
                  className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${taskType === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                  All
                </button>
                {allTaskTypes.map((tt, i) => (
                  <button key={tt} type="button" title={tt}
                    onClick={() => { setTaskType(taskType === tt ? "" : tt); setPage(1); }}
                    className={`flex items-center justify-center px-3 py-2.5 ${i < allTaskTypes.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${taskType === tt ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                    <TaskTypeIcon type={tt} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear All */}
          {(search || riskFilter || taskType) && (
            <button type="button"
              onClick={() => { setSearch(""); setRiskFilter(""); setTaskType(""); setPage(1); }}
              className="self-end pb-[11px] text-xs font-semibold text-[#F37021] hover:underline">
              Clear All
            </button>
          )}

          <div className="flex-1" />

          {/* Result count */}
          <div className="self-end pb-[11px]">
            <span className="text-xs text-[#94A3B8]">
              {filteredLearners.length} learner{filteredLearners.length !== 1 ? "s" : ""}
            </span>
          </div>
        </section>

        {/* ── Learner Table — same <table> structure as Sequential Analysis ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
          {loading ? (
            <p className="text-sm text-[#94A3B8] py-6 text-center">Loading…</p>
          ) : error ? (
            <div className="m-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-[#FFF7ED] border-b-2 border-[#FED7AA]">
                    {[
                      { label: "Learner",     align: "left"   },
                      { label: "Name",        align: "left"   },
                      { label: "Risk",        align: "center" },
                      { label: "Task Type",   align: "center" },
                      { label: "Tasks",       align: "center" },
                      { label: "Submissions", align: "center" },
                      { label: "Complexity",  align: "center" },
                      { label: "Runs",        align: "center" },
                      { label: "",            align: "center" },
                    ].map(({ label, align }, i) => (
                      <th key={i} className={`px-3 py-2.5 text-[10px] font-bold text-[#F37021] uppercase tracking-widest whitespace-nowrap ${align === "center" ? "text-center" : "text-left"}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedLearners.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-[#94A3B8] text-sm">
                        {allLearners.length === 0 ? "No submission data available yet." : "No learners match the current filters."}
                      </td>
                    </tr>
                  )}

                  {pagedLearners.map((learner) => {
                    const isExpanded = expandedIds.has(learner.profile_id);
                    const visibleTasks = taskType
                      ? learner.tasks.filter((t) => t.task_type === taskType)
                      : learner.tasks;
                    // Dominant task type for the row
                    const taskTypeCounts = learner.tasks.reduce<Record<string, number>>((acc, t) => {
                      acc[t.task_type] = (acc[t.task_type] ?? 0) + 1;
                      return acc;
                    }, {});
                    const dominantType = Object.entries(taskTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

                    return (
                      <Fragment key={learner.profile_id}>
                        {/* ── Learner row ── */}
                        <tr
                          className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7] transition-colors cursor-pointer"
                          onClick={() => toggleExpanded(learner.profile_id)}
                        >
                          {/* Learner code */}
                          <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                            <span className="font-mono text-[11px] font-bold text-[#F37021] bg-[#FFF7ED] border border-[#FED7AA] px-2 py-1 rounded-lg tracking-widest">
                              {learner.participant_code}
                            </span>
                          </td>
                          {/* Display name */}
                          <td className="px-3 py-3.5 align-middle min-w-[160px]">
                            <span className="text-xs text-[#0F172A] font-medium leading-snug">{learner.display_name}</span>
                          </td>
                          {/* Risk dot */}
                          <td className="px-2 py-3.5 text-center align-middle">
                            <span
                              title={learner.at_risk ? "At-Risk" : "OK"}
                              className={`inline-block w-2.5 h-2.5 rounded-full ${learner.at_risk ? "bg-rose-500" : "bg-emerald-500"}`}
                            />
                          </td>
                          {/* Dominant task type icon */}
                          <td className="px-2 py-3.5 text-center align-middle">
                            <span title={dominantType} className="inline-flex items-center justify-center text-[#64748B]">
                              <TaskTypeIcon type={dominantType} />
                            </span>
                          </td>
                          {/* Task count */}
                          <td className="px-2 py-3.5 text-center align-middle">
                            <span className="font-mono text-xs text-[#475569]">{learner.task_count}</span>
                          </td>
                          {/* Total submissions */}
                          <td className="px-2 py-3.5 text-center align-middle">
                            <span className="font-mono text-xs text-[#475569]">{learner.total_attempts}</span>
                          </td>
                          {/* Avg complexity dot */}
                          <td className="px-2 py-3.5 text-center align-middle">
                            <ComplexityDot score={learner.avg_complexity} />
                          </td>
                          {/* Runs (reviewed count) */}
                          <td className="px-2 py-3.5 text-center align-middle">
                            <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">
                              {learner.tasks.reduce((a, t) => a + t.reviewed_count, 0)}
                            </span>
                          </td>
                          {/* Expand chevron */}
                          <td className="px-3 py-3.5 text-center align-middle">
                            <svg
                              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                              strokeLinecap="round" strokeLinejoin="round"
                              className={`w-4 h-4 text-[#94A3B8] transition-transform mx-auto ${isExpanded ? "rotate-180" : ""}`}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </td>
                        </tr>

                        {/* ── Task sub-rows (same bg-[#FAFAFA] style as run rows) ── */}
                        {isExpanded && (
                          visibleTasks.length === 0 ? (
                            <tr key={`${learner.profile_id}-empty`} className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                              <td colSpan={9} className="pl-10 py-3 text-[#94A3B8] text-xs italic">
                                No tasks match the current filter.
                              </td>
                            </tr>
                          ) : (
                            visibleTasks.map((task) => (
                              <tr key={`${learner.profile_id}__${task.task_id}`} className="border-b border-[#F1F5F9] bg-[#FAFAFA]">
                                {/* Risk dot (indented) */}
                                <td className="pl-8 pr-2 py-2.5 align-middle">
                                  <span className={`inline-block w-2 h-2 rounded-full ${task.at_risk ? "bg-rose-500" : "bg-emerald-500"}`} />
                                </td>
                                {/* Task code + batch */}
                                <td className="px-3 py-2.5 align-middle" colSpan={2}>
                                  <span className="font-mono text-xs font-semibold text-[#F37021]">{task.task_code}</span>
                                  <span className="text-[10px] text-[#94A3B8] ml-2">{task.batch_code}</span>
                                </td>
                                {/* Task type icon */}
                                <td className="px-3 py-2.5 align-middle text-[#64748B]">
                                  <TaskTypeIcon type={task.task_type} />
                                </td>
                                {/* Submissions count */}
                                <td className="px-3 py-2.5 align-middle font-mono text-xs text-[#475569] text-center">
                                  {task.attempt_count}
                                </td>
                                {/* Avg score */}
                                <td className="px-3 py-2.5 align-middle font-mono text-xs text-[#0F172A] text-center">
                                  {task.avg_score_pct != null ? `${task.avg_score_pct}%` : "—"}
                                </td>
                                {/* Complexity dot */}
                                <td className="px-3 py-2.5 align-middle text-center">
                                  <ComplexityDot score={task.complexity_score} />
                                </td>
                                {/* Eye button */}
                                <td className="px-2 py-2.5 align-middle text-center" colSpan={2}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setDetailTarget({ learner, task }); }}
                                    title="View detail"
                                    className="p-1 rounded hover:bg-[#FED7AA] text-[#F37021] transition-colors"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))
                          )
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:bg-[#FFF7ED] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              ← Prev
            </button>
            <span className="text-xs text-[#64748B]">Page {page} of {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:bg-[#FFF7ED] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next →
            </button>
          </div>
        )}

        {/* ── Overview info bar ── */}
        {ov && (
          <div className="flex flex-wrap gap-4 text-xs text-[#94A3B8] justify-center">
            <span>{ov.learner_count} learners</span>
            <span>·</span>
            <span>{ov.task_count} task types</span>
            <span>·</span>
            <span>{ov.submission_count} submissions</span>
            <span>·</span>
            <span className="text-rose-400">{ov.at_risk_count} at-risk</span>
            <span>·</span>
            <span>avg complexity {ov.avg_complexity ?? "—"}</span>
          </div>
        )}

        {/* ── Research validity notice ── */}
        {data?.label_validity_note && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-[11px] text-amber-700">{data.label_validity_note}</p>
          </div>
        )}

        {/* ── Footer ── */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Behavioral complexity proxy v1 · label_validity=pilot_only
        </p>
      </main>

      {/* ── Detail modal ── */}
      {detailTarget && (
        <DetailModal
          learner={detailTarget.learner}
          task={detailTarget.task}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
