"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CriterionAvg { key: string; label: string; n: number; avg_pct: number | null }
interface BatchRow {
  batch_code: string; submission_count: number; scored_count: number; reviewed_count: number;
  avg_2c3l_score: number | null; at_risk_count: number; at_risk_pct: number | null;
  per_criterion: { key: string; avg_pct: number | null }[];
}
interface TaskRow {
  task_code: string; task_type: string | null; submission_count: number;
  avg_2c3l_score: number | null; hardest_criterion: string | null;
}
interface Payload {
  generated_at: string;
  at_risk_threshold: number;
  overview: {
    submission_count: number; scored_count: number;
    batch_count: number; task_count: number;
    overall_avg_2c3l: number | null;
    overall_at_risk: number; overall_at_risk_pct: number | null;
  };
  by_criterion: CriterionAvg[];
  by_batch: BatchRow[];
  by_task: TaskRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CRIT_SHORT: Record<string, string> = {
  c1_correctness_result:   "C1",
  c2_semantic_consistency: "C2",
  l1_logical_reasoning:    "L1",
  l2_learning_process:     "L2",
  l3_difficulty_complexity:"L3",
};

function pctFmt(v: number | null, digits = 1) {
  return v == null ? "—" : v.toFixed(digits) + "%";
}

/** Bar from 0-100 with colour based on score */
function ScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[#94A3B8] text-xs">—</span>;
  const w = Math.max(2, Math.min(100, value));
  const colour = value >= 65 ? "bg-emerald-500" : value >= 45 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-[11px] tabular-nums font-semibold text-[#0F172A] w-10 text-right">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssessmentAnalysisPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

      try {
        const res = await fetch("/api/researcher/assessment-analysis", {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (!res.ok) setFetchError(`API error ${res.status}`);
        else          setData(await res.json() as Payload);
      } catch { setFetchError("Failed to load assessment data."); }

      setLoading(false);
    }
    init();
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading…
      </div>
    );
  }

  const ov = data?.overview;

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

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <ResearcherBreadcrumb current="Assessment Analysis" />

        {/* Title */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">Assessment Analysis</h1>
            <p className="text-sm text-[#64748B]">
              2C3L rubric score analytics — per-criterion averages, batch comparison, and
              task difficulty ranking. Scores shown are proxy_behavioral unless teacher-reviewed.
            </p>
          </div>
          {ov && (
            <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200">
              {ov.submission_count} submissions · {ov.batch_count} batches
            </span>
          )}
        </div>

        {fetchError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center">
            <p className="text-sm text-amber-700 font-semibold">{fetchError}</p>
          </div>
        )}

        {data && ov && (
          <>
            {/* ── Overview stats ─────────────────────────────────────────── */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Submissions",    val: ov.submission_count,    cls: "" },
                { label: "Scored",         val: ov.scored_count,         cls: "" },
                { label: "At-risk",        val: ov.overall_at_risk,      cls: "text-rose-700 font-bold" },
                { label: "At-risk rate",   val: pctFmt(ov.overall_at_risk_pct), cls: "text-rose-700 font-bold" },
              ].map(({ label, val, cls }) => (
                <div key={label} className="bg-white rounded-2xl border border-[#FED7AA] px-5 py-4">
                  <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">{label}</p>
                  <p className={`text-2xl tabular-nums text-[#0F172A] ${cls}`}>{val}</p>
                </div>
              ))}
            </section>

            {/* ── Overall avg 2C3L ──────────────────────────────────────── */}
            {ov.overall_avg_2c3l != null && (
              <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-4 flex items-center gap-6">
                <div>
                  <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">
                    Overall average 2C3L score
                  </p>
                  <p className={`text-3xl font-bold tabular-nums ${ov.overall_avg_2c3l >= 65 ? "text-emerald-600" : "text-rose-600"}`}>
                    {ov.overall_avg_2c3l.toFixed(1)}%
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ov.overall_avg_2c3l >= 65 ? "bg-emerald-500" : "bg-rose-500"}`}
                      style={{ width: `${Math.min(100, ov.overall_avg_2c3l)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#94A3B8] mt-1">
                    <span>0%</span>
                    <span className="text-amber-600 font-semibold">65% threshold</span>
                    <span>100%</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Criterion averages ────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#FED7AA]">
                <h2 className="text-sm font-bold text-[#0F172A]">Criterion Averages</h2>
                <p className="text-[11px] text-[#64748B] mt-0.5">Sorted hardest → easiest (lower avg = harder)</p>
              </div>
              <div className="divide-y divide-[#F1F5F9]">
                {data.by_criterion.map((c) => (
                  <div key={c.key} className="px-6 py-3 flex items-center gap-4">
                    <span className="w-6 h-6 rounded-full bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-[10px] font-bold text-[#F37021] shrink-0">
                      {CRIT_SHORT[c.key] ?? c.key}
                    </span>
                    <span className="text-sm text-[#0F172A] w-48 shrink-0">{c.label}</span>
                    <div className="flex-1">
                      <ScoreBar value={c.avg_pct} />
                    </div>
                    <span className="text-[10px] text-[#94A3B8] shrink-0">n={c.n}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Batch comparison ──────────────────────────────────────── */}
            {data.by_batch.length > 0 && (
              <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#FED7AA]">
                  <h2 className="text-sm font-bold text-[#0F172A]">Batch Comparison</h2>
                  <p className="text-[11px] text-[#64748B] mt-0.5">Sorted by average 2C3L score ascending</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F8FAFC] border-b border-[#F1F5F9]">
                      <tr>
                        {["Batch", "Submissions", "Scored", "Reviewed", "Avg 2C3L", "At-risk", "C1", "C2", "L1", "L2", "L3"].map(col => (
                          <th key={col} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {data.by_batch.map((b) => (
                        <tr key={b.batch_code} className="hover:bg-[#FFF7ED] transition-colors">
                          <td className="px-3 py-2.5 font-mono font-semibold text-[#0F172A]">{b.batch_code}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[#475569]">{b.submission_count}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[#475569]">{b.scored_count}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[#475569]">{b.reviewed_count}</td>
                          <td className={`px-3 py-2.5 tabular-nums font-semibold ${(b.avg_2c3l_score ?? 0) >= 65 ? "text-emerald-700" : "text-rose-700"}`}>
                            {pctFmt(b.avg_2c3l_score)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            <span className="text-rose-700 font-semibold">{b.at_risk_count}</span>
                            <span className="text-[#94A3B8] ml-1">({pctFmt(b.at_risk_pct, 0)})</span>
                          </td>
                          {["c1_correctness_result", "c2_semantic_consistency", "l1_logical_reasoning", "l2_learning_process", "l3_difficulty_complexity"].map((k) => {
                            const c = b.per_criterion.find((p) => p.key === k);
                            return (
                              <td key={k} className="px-3 py-2.5 tabular-nums text-[#64748B]">
                                {pctFmt(c?.avg_pct ?? null, 0)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Task difficulty ───────────────────────────────────────── */}
            {data.by_task.length > 0 && (
              <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#FED7AA]">
                  <h2 className="text-sm font-bold text-[#0F172A]">Task Difficulty Ranking</h2>
                  <p className="text-[11px] text-[#64748B] mt-0.5">Sorted hardest → easiest by average 2C3L score</p>
                </div>
                <div className="divide-y divide-[#F1F5F9]">
                  {data.by_task.map((t, i) => (
                    <div key={t.task_code} className="flex items-center gap-4 px-6 py-3">
                      <span className="text-[11px] font-bold text-[#94A3B8] w-5 shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-mono text-sm text-[#0F172A] w-32 shrink-0">{t.task_code}</span>
                      {t.task_type && (
                        <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded font-mono shrink-0">
                          {t.task_type}
                        </span>
                      )}
                      <div className="flex-1">
                        <ScoreBar value={t.avg_2c3l_score} />
                      </div>
                      {t.hardest_criterion && (
                        <span className="text-[10px] text-[#94A3B8] shrink-0">
                          hardest: <span className="font-bold text-rose-600">{CRIT_SHORT[t.hardest_criterion]}</span>
                        </span>
                      )}
                      <span className="text-[10px] text-[#94A3B8] shrink-0">
                        n={t.submission_count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {ov.submission_count === 0 && (
              <div className="rounded-2xl border border-[#FED7AA] bg-white px-6 py-10 text-center">
                <p className="text-sm text-[#64748B] font-semibold">No submissions found</p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Run the mock pipeline and submit learner attempts to see rubric analytics.
                </p>
              </div>
            )}

            {/* Footer note */}
            <p className="text-[11px] text-[#94A3B8] text-center">
              Generated {new Date(data.generated_at).toLocaleString()} ·
              Rubric scores: proxy_behavioral unless review_status=completed ·
              at_risk threshold &lt; {data.at_risk_threshold}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
