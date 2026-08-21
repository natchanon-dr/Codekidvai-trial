"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";
import type { BehavioralLearnerRecord, BehavioralTaskRecord, BehavioralAnalysisResponse } from "@/app/api/researcher/behavioral-analysis/route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ComplexityBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-rose-500" :
    score >= 45 ? "bg-amber-400" :
    "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden w-16">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-[#64748B] w-6 text-right">{score}</span>
    </div>
  );
}

function RiskBadge({ atRisk }: { atRisk: boolean }) {
  return atRisk ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-50 text-rose-600 border-rose-200">
      At-Risk
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
      OK
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-[#FED7AA] shadow-xl max-w-lg w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Behavioral Detail</p>
            <p className="text-base font-bold text-[#0F172A] mt-0.5">
              {learner.participant_code} — {task.task_code}
            </p>
            <p className="text-xs text-[#64748B]">{learner.display_name} · {task.batch_code} · {task.task_type}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#94A3B8] hover:text-[#0F172A] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <hr className="border-[#FED7AA]" />

        {/* Complexity score */}
        <div>
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">Complexity Score</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-[#F1F5F9] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${task.complexity_score >= 70 ? "bg-rose-500" : task.complexity_score >= 45 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${task.complexity_score}%` }}
              />
            </div>
            <span className="text-lg font-bold text-[#0F172A] font-mono">{task.complexity_score}</span>
            <span className="text-xs text-[#94A3B8]">/ 100</span>
          </div>
          <p className="text-[10px] text-[#94A3B8] mt-1">
            {task.complexity_score >= 70 ? "High complexity — multiple retry loops detected." :
             task.complexity_score >= 45 ? "Medium complexity — some difficulty observed." :
             "Low complexity — learner resolved task efficiently."}
          </p>
        </div>

        {/* Feature grid */}
        <div>
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Attempt Features (NB10 proxy)</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Attempt Count",     value: task.attempt_count,                    unit: "attempts" },
              { label: "Reviewed Count",    value: task.reviewed_count,                   unit: "reviewed" },
              { label: "Correct Ratio",     value: `${Math.round(task.correct_ratio * 100)}%`, unit: "" },
              { label: "Avg Score",         value: task.avg_score_pct != null ? `${task.avg_score_pct}%` : "—", unit: "" },
              { label: "Task Type",         value: task.task_type,                        unit: "" },
              { label: "Risk Status",       value: task.at_risk ? "At-Risk" : "OK",       unit: "" },
            ].map(({ label, value, unit }) => (
              <div key={label} className="bg-[#FFF7ED] rounded-xl border border-[#FED7AA] px-3 py-2.5">
                <p className="text-[10px] text-[#94A3B8] mb-0.5">{label}</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  {value}{unit ? <span className="text-[10px] font-normal text-[#94A3B8] ml-1">{unit}</span> : null}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Research note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-amber-700">
            <span className="font-bold">Research constraint:</span> Complexity is a proxy metric derived
            from attempt patterns — not expert-validated. <span className="font-semibold">label_validity = pilot_only.</span>
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
  const router  = useRouter();
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
  const [search,      setSearch]      = useState("");
  const [riskFilter,  setRiskFilter]  = useState<"" | "risk" | "ok">("");
  const [taskType,    setTaskType]    = useState("");
  const [page,        setPage]        = useState(1);

  // ── Table state ───────────────────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailTarget, setDetailTarget] = useState<{ learner: BehavioralLearnerRecord; task: BehavioralTaskRecord } | null>(null);

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
        router.push("/student/dashboard");
        return;
      }

      setDisplayName(prof?.display_name ?? null);
      setEmail(user?.email ?? null);
      setParticipantCode(prof?.participant_code ?? null);
    }
    void init();
  }, [router]);

  // ── Click-outside for profile dropdown ───────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
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

  // ── Toggle expand ─────────────────────────────────────────────────────────
  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const allLearners = data?.learners ?? [];

  // Collect unique task types for filter
  const allTaskTypes = [...new Set(
    allLearners.flatMap((l) => l.tasks.map((t) => t.task_type)),
  )].sort();

  const filteredLearners = allLearners.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      const matchLearner = l.participant_code.toLowerCase().includes(q) || l.display_name.toLowerCase().includes(q);
      const matchTask    = l.tasks.some((t) => t.task_code.toLowerCase().includes(q));
      if (!matchLearner && !matchTask) return false;
    }
    if (riskFilter === "risk" && !l.at_risk) return false;
    if (riskFilter === "ok"   &&  l.at_risk) return false;
    if (taskType) {
      if (!l.tasks.some((t) => t.task_type === taskType)) return false;
    }
    return true;
  });

  const totalPages    = Math.max(1, Math.ceil(filteredLearners.length / PAGE_SIZE));
  const pagedLearners = filteredLearners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Loading / error screens ───────────────────────────────────────────────
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

        {/* ── Overview stat cards ── */}
        {ov && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Learners",    value: ov.learner_count,    color: "text-[#F37021]" },
              { label: "Tasks",       value: ov.task_count,       color: "text-sky-600" },
              { label: "Submissions", value: ov.submission_count, color: "text-violet-600" },
              { label: "At-Risk",     value: ov.at_risk_count,    color: "text-rose-600" },
              { label: "Avg Complexity", value: ov.avg_complexity ?? "—", color: "text-amber-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-[#FED7AA] px-4 py-3 text-center">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter bar ── */}
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
                placeholder="Learner code or task…"
                aria-label="Search by learner code or task"
                className="pl-9 pr-3 py-2.5 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] w-48"
              />
            </div>
          </div>

          {/* Risk filter — icon toggle group */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Risk</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              {(["", "risk", "ok"] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setRiskFilter(val); setPage(1); }}
                  className={`px-3 py-2.5 text-xs font-semibold border-r last:border-r-0 border-[#FED7AA] transition-colors ${
                    riskFilter === val
                      ? "bg-[#F37021] text-white"
                      : "text-[#64748B] hover:bg-[#FFF7ED]"
                  }`}
                >
                  {val === "" ? "All" : val === "risk" ? "At-Risk" : "OK"}
                </button>
              ))}
            </div>
          </div>

          {/* Task type filter */}
          {allTaskTypes.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#64748B] font-medium">Task Type</label>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => { setTaskType(""); setPage(1); }}
                  className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${taskType === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
                >
                  All
                </button>
                {allTaskTypes.map((tt) => (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => { setTaskType(tt === taskType ? "" : tt); setPage(1); }}
                    className={`px-3 py-2.5 text-xs font-semibold border-r last:border-r-0 border-[#FED7AA] transition-colors ${taskType === tt ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
                  >
                    {tt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Result count */}
          <div className="ml-auto flex items-end">
            <span className="text-xs text-[#94A3B8]">
              {filteredLearners.length} learner{filteredLearners.length !== 1 ? "s" : ""}
            </span>
          </div>
        </section>

        {/* ── Learner table ── */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1.5rem_1fr_6rem_5rem_6rem_5rem_4rem] gap-3 items-center px-5 py-2.5 bg-[#FFF7ED] border-b border-[#FED7AA]">
            <span />
            <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">Learner</span>
            <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide text-center">Tasks</span>
            <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide text-center">Attempts</span>
            <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">Complexity</span>
            <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide text-center">Risk</span>
            <span />
          </div>

          {pagedLearners.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[#94A3B8]">
              {allLearners.length === 0 ? "No submission data available yet." : "No learners match the current filters."}
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {pagedLearners.map((learner) => {
                const isExpanded = expandedIds.has(learner.profile_id);

                // Filter tasks by taskType if active
                const visibleTasks = taskType
                  ? learner.tasks.filter((t) => t.task_type === taskType)
                  : learner.tasks;

                return (
                  <div key={learner.profile_id}>
                    {/* ── Learner row ── */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(learner.profile_id)}
                      className="w-full grid grid-cols-[1.5rem_1fr_6rem_5rem_6rem_5rem_4rem] gap-3 items-center px-5 py-3.5 hover:bg-[#FFF7ED] transition-colors text-left"
                    >
                      {/* Expand chevron */}
                      <svg
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        className={`w-4 h-4 text-[#94A3B8] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                      </svg>

                      {/* Learner identity */}
                      <div>
                        <p className="text-sm font-semibold text-[#0F172A]">{learner.participant_code}</p>
                        <p className="text-[11px] text-[#94A3B8] truncate max-w-[200px]">{learner.display_name}</p>
                      </div>

                      {/* Task count */}
                      <div className="text-center">
                        <span className="text-sm font-semibold text-[#0F172A]">{learner.task_count}</span>
                      </div>

                      {/* Total attempts */}
                      <div className="text-center">
                        <span className="text-sm text-[#64748B]">{learner.total_attempts}</span>
                      </div>

                      {/* Avg complexity bar */}
                      <ComplexityBar score={learner.avg_complexity} />

                      {/* Risk badge */}
                      <div className="flex justify-center">
                        <RiskBadge atRisk={learner.at_risk} />
                      </div>

                      {/* Expand icon placeholder */}
                      <span />
                    </button>

                    {/* ── Expanded: task rows ── */}
                    {isExpanded && (
                      <div className="bg-[#FFF7ED] border-t border-[#FED7AA]">
                        {/* Task sub-header */}
                        <div className="grid grid-cols-[2rem_1fr_5rem_5rem_5rem_5rem_4rem] gap-2 items-center px-8 py-2 border-b border-[#FED7AA]">
                          <span />
                          <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Task</span>
                          <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide text-center">Attempts</span>
                          <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide text-center">Reviewed</span>
                          <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide text-center">Score</span>
                          <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Complexity</span>
                          <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide text-center">Action</span>
                        </div>

                        {visibleTasks.map((task) => (
                          <div
                            key={`${learner.profile_id}__${task.task_id}`}
                            className="grid grid-cols-[2rem_1fr_5rem_5rem_5rem_5rem_4rem] gap-2 items-center px-8 py-2.5 border-b border-[#FED7AA] last:border-b-0 hover:bg-white transition-colors"
                          >
                            {/* Risk dot */}
                            <span className={`w-2 h-2 rounded-full mx-auto ${task.at_risk ? "bg-rose-500" : "bg-emerald-500"}`} />

                            {/* Task info */}
                            <div>
                              <p className="text-xs font-semibold text-[#0F172A]">{task.task_code}</p>
                              <p className="text-[10px] text-[#94A3B8]">{task.task_type} · {task.batch_code}</p>
                            </div>

                            {/* Attempts */}
                            <p className="text-xs text-center text-[#64748B] font-mono">{task.attempt_count}</p>

                            {/* Reviewed */}
                            <p className="text-xs text-center text-[#64748B] font-mono">{task.reviewed_count}</p>

                            {/* Score */}
                            <p className="text-xs text-center font-mono text-[#0F172A]">
                              {task.avg_score_pct != null ? `${task.avg_score_pct}%` : "—"}
                            </p>

                            {/* Complexity mini-bar */}
                            <ComplexityBar score={task.complexity_score} />

                            {/* Eye button */}
                            <button
                              type="button"
                              onClick={() => setDetailTarget({ learner, task })}
                              title="View detail"
                              className="flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-[#FED7AA] hover:bg-[#F37021] hover:border-[#F37021] hover:text-white text-[#F37021] transition-colors mx-auto"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </div>
                        ))}

                        {visibleTasks.length === 0 && (
                          <p className="px-8 py-4 text-xs text-[#94A3B8] italic">No tasks match the current filter.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:bg-[#FFF7ED] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-[#64748B]">Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:bg-[#FFF7ED] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
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
