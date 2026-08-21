"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LearnerBatchRecord {
  participant_code: string;
  batch_code: string;
  submission_count: number;
  reviewed_count: number;
  criteria_filled: number;
  total_2c3l_score: number | null;
  at_risk: 0 | 1 | null;
  is_teacher_reviewed: boolean;
  label_validity: "teacher_reviewed" | "pilot_only" | "invalid";
}

interface Summary {
  total_learner_batches: number;
  teacher_reviewed: number;
  pilot_only: number;
  invalid: number;
  at_risk_count: number;
  not_risk_count: number;
  threshold_target: number;
  threshold_pct: number;
  confirmatory_ready: boolean;
}

interface Payload {
  generated_at: string;
  at_risk_threshold: number;
  records: LearnerBatchRecord[];
  summary: Summary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number | null, digits = 1) {
  return v == null ? "—" : v.toFixed(digits) + "%";
}

function labelBadge(v: LearnerBatchRecord["label_validity"]) {
  if (v === "teacher_reviewed")
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">✓ teacher_reviewed</span>;
  if (v === "pilot_only")
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">pilot_only</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">invalid</span>;
}

function atRiskBadge(v: 0 | 1 | null) {
  if (v === 1) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">At-Risk</span>;
  if (v === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">Not at-risk</span>;
  return <span className="text-[#94A3B8] text-[10px]">—</span>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeacherReviewResearcherPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "teacher_reviewed" | "pilot_only" | "invalid">("all");

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
        const res = await fetch("/api/researcher/teacher-review");
        if (!res.ok) { setFetchError(`API error ${res.status}`); }
        else          { setData(await res.json() as Payload); }
      } catch { setFetchError("Failed to load data."); }

      setLoading(false);
    }
    init();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading…
      </div>
    );
  }

  const sm = data?.summary;
  const filtered = (data?.records ?? []).filter(
    r => filter === "all" || r.label_validity === filter,
  );

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
        <ResearcherBreadcrumb current="Teacher Review Labels" />

        {/* Title */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">Teacher Review Labels</h1>
            <p className="text-sm text-[#64748B]">
              Learner × batch records grouped by label validity status.
              <code className="text-[11px] bg-[#F1F5F9] px-1 rounded ml-1">is_teacher_reviewed</code>
              = at least one submission marked <strong>completed</strong> by a teacher.
            </p>
          </div>
          {sm?.confirmatory_ready && (
            <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">
              ✓ Confirmatory threshold met
            </span>
          )}
        </div>

        {fetchError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center">
            <p className="text-sm text-amber-700 font-semibold">{fetchError}</p>
          </div>
        )}

        {sm && (
          <>
            {/* Progress card */}
            <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">
                    Teacher-reviewed progress
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-[#0F172A]">{sm.teacher_reviewed}</span>
                    <span className="text-sm text-[#94A3B8]">/ {sm.threshold_target} target</span>
                    <span className={`text-sm font-bold ml-auto ${sm.confirmatory_ready ? "text-emerald-600" : "text-amber-600"}`}>
                      {sm.threshold_pct}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${sm.confirmatory_ready ? "bg-emerald-500" : "bg-[#F37021]"}`}
                      style={{ width: `${sm.threshold_pct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total learner-batches", val: sm.total_learner_batches, cls: "text-[#0F172A]" },
                  { label: "Teacher-reviewed",       val: sm.teacher_reviewed, cls: "text-emerald-700 font-bold" },
                  { label: "At-risk (reviewed)",     val: sm.at_risk_count, cls: "text-rose-700 font-bold" },
                  { label: "Not at-risk (reviewed)", val: sm.not_risk_count, cls: "text-sky-700 font-bold" },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3">
                    <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">{label}</p>
                    <p className={`text-xl tabular-nums ${cls}`}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Confirmatory gate */}
              <div className={`rounded-xl border px-4 py-3 ${sm.confirmatory_ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <p className={`text-xs font-semibold ${sm.confirmatory_ready ? "text-emerald-700" : "text-amber-700"}`}>
                  {sm.confirmatory_ready
                    ? "✓ Confirmatory analysis gate open — teacher-reviewed records meet the 60-learner threshold."
                    : `⚠ Confirmatory analysis blocked — need ${sm.threshold_target - sm.teacher_reviewed} more teacher-reviewed records (${sm.threshold_target} required).`}
                </p>
              </div>
            </section>

            {/* Action links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Teacher review */}
              <div className="rounded-xl border border-[#FED7AA] bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Teacher Review Interface</p>
                  <p className="text-xs text-[#64748B]">Mark submissions as completed</p>
                </div>
                <a
                  href="/teacher/submissions/review"
                  className="shrink-0 px-4 py-1.5 rounded-xl bg-[#F37021] text-white text-xs font-bold hover:bg-[#d45f10] transition-colors"
                >
                  Open →
                </a>
              </div>

              {/* Label CSV export */}
              <div className="rounded-xl border border-[#FED7AA] bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Export Labels CSV</p>
                  <p className="text-xs text-[#64748B]">
                    All labels · for ML pipeline (NB02–NB09)
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href="/api/researcher/label-export?validity=teacher_reviewed"
                    download
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                    title="Only teacher-reviewed labels"
                  >
                    ✓ Reviewed
                  </a>
                  <a
                    href="/api/researcher/label-export"
                    download
                    className="px-3 py-1.5 rounded-xl border border-[#FED7AA] text-[#F37021] text-xs font-bold hover:bg-[#FFF7ED] transition-colors"
                    title="All labels (pilot + reviewed)"
                  >
                    All
                  </a>
                </div>
              </div>
            </div>

            {/* Table */}
            <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#FED7AA] flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-bold text-[#0F172A] flex-1">Learner × Batch Records</h2>

                {/* Filter tabs */}
                <div className="flex gap-1">
                  {(["all", "teacher_reviewed", "pilot_only", "invalid"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        filter === f
                          ? "bg-[#F37021] text-white border-[#F37021]"
                          : "bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#F37021]"
                      }`}
                    >
                      {f === "all" ? `All (${data.records.length})` : f}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="px-6 py-10 text-center text-xs text-[#94A3B8]">No records matching filter.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F8FAFC] border-b border-[#F1F5F9]">
                      <tr>
                        {["Participant", "Batch", "Submissions", "Criteria filled", "2C3L score", "At-Risk", "Label validity"].map(col => (
                          <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {filtered.map((r, i) => (
                        <tr key={i} className="hover:bg-[#FFF7ED] transition-colors">
                          <td className="px-4 py-2.5 font-mono font-semibold text-[#0F172A]">
                            {r.participant_code}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[#64748B]">{r.batch_code}</td>
                          <td className="px-4 py-2.5 tabular-nums text-[#475569]">
                            {r.reviewed_count}/{r.submission_count}
                            <span className="text-[#94A3B8] ml-1">reviewed</span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-[#475569]">
                            {r.criteria_filled}/5
                          </td>
                          <td className="px-4 py-2.5 tabular-nums font-semibold text-[#0F172A]">
                            {pct(r.total_2c3l_score)}
                          </td>
                          <td className="px-4 py-2.5">{atRiskBadge(r.at_risk)}</td>
                          <td className="px-4 py-2.5">{labelBadge(r.label_validity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-6 py-3 border-t border-[#F1F5F9]">
                <p className="text-[10px] text-[#94A3B8]">
                  Generated {data ? new Date(data.generated_at).toLocaleString() : "—"} ·
                  at_risk threshold &lt; {data?.at_risk_threshold ?? 65} · Read-only
                </p>
              </div>
            </section>

            {/* Constraint reminder */}
            {!sm.confirmatory_ready && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4">
                <p className="text-xs font-bold text-red-700 mb-1">⚠ Research constraint active</p>
                <p className="text-xs text-red-600">
                  <code className="bg-red-100 px-1 rounded">confirmatory_analysis_allowed = false</code>
                  {" "}until teacher_reviewed ≥ {sm.threshold_target}. Current count: {sm.teacher_reviewed}.
                  Proceed to teacher review to collect labels.
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Phase 5 C label collection · Research integrity enforced by platform
        </p>
      </main>
    </div>
  );
}
