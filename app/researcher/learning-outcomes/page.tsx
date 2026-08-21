"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Static content — 2C3L rubric design and at-risk prediction outcome plan
// ---------------------------------------------------------------------------

const RUBRIC_CRITERIA = [
  {
    id: "c1",
    code: "C1",
    label: "Computational Thinking",
    weight: 20,
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    description:
      "Learner demonstrates decomposition, pattern recognition, abstraction, and algorithmic thinking when designing SQL queries or block programs.",
    keywords: ["decompose", "pattern", "abstract", "algorithm", "step-by-step"],
    scoreLow:  "No evidence of structured problem breakdown; trial-and-error only.",
    scoreHigh: "Systematic decomposition evident; solution generalises beyond the given task.",
  },
  {
    id: "c2",
    code: "C2",
    label: "Coding Competency",
    weight: 20,
    color: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    description:
      "Correctness, syntax accuracy, and appropriate use of SQL / block constructs for the assigned task.",
    keywords: ["correct", "syntax", "construct", "query", "valid"],
    scoreLow:  "Repeated syntax errors; solution does not return correct result set.",
    scoreHigh: "First-attempt correct solution with appropriate construct choice.",
  },
  {
    id: "l1",
    code: "L1",
    label: "Learning Engagement",
    weight: 20,
    color: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    description:
      "Active participation: exploration of multiple approaches, voluntary use of hints, task completion.",
    keywords: ["explore", "attempt", "engage", "complete", "voluntary"],
    scoreLow:  "Minimal attempts; session abandoned before task completion.",
    scoreHigh: "Multiple strategies explored; completes task and attempts extension.",
  },
  {
    id: "l2",
    code: "L2",
    label: "Learning Persistence",
    weight: 20,
    color: "bg-rose-100 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    description:
      "Continuation through errors; recovery rate and self-correction without external help.",
    keywords: ["persist", "recover", "retry", "self-correct", "resilience"],
    scoreLow:  "Quits immediately after first error; requires repeated teacher intervention.",
    scoreHigh: "Recovers independently from all errors; shows adaptive error-correction.",
  },
  {
    id: "l3",
    code: "L3",
    label: "Learning Transfer",
    weight: 20,
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    description:
      "Application of learned concepts to novel tasks; generalisation beyond practised examples.",
    keywords: ["transfer", "apply", "novel", "generalise", "new context"],
    scoreLow:  "Cannot apply learned concept to even slightly varied task.",
    scoreHigh: "Independently applies concept to unfamiliar context with minimal scaffolding.",
  },
] as const;

const AT_RISK_THRESHOLD = 65; // total_2c3l_score < 65 → at-risk

const OUTCOME_PLAN = [
  {
    section: "Cohort Overview",
    items: [
      "Learner count by at-risk vs. not-at-risk (using threshold < " + AT_RISK_THRESHOLD + ")",
      "Score distribution histogram across all 5 criteria",
      "Per-criterion mean and standard deviation across cohort",
    ],
  },
  {
    section: "Prediction Alignment",
    items: [
      "Confusion matrix — model predictions vs. teacher-reviewed labels",
      "ROC curve overlay for all 6 models (Dummy, LR, RF, TAG-LR, LSTM, GRU)",
      "Precision / recall trade-off at decision threshold 0.5",
    ],
  },
  {
    section: "Criterion-Level Drill-Down",
    items: [
      "C1 / C2 / L1 / L2 / L3 score per learner (heatmap)",
      "Which criterion shows highest variance within the cohort",
      "Correlation between behavioral features and each rubric score",
    ],
  },
  {
    section: "Longitudinal View",
    items: [
      "Score progression over multiple sessions per learner",
      "Early-session at-risk prediction vs. end-of-module outcome",
      "Improvement trajectory for learners who moved from at-risk → not-at-risk",
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface ReviewSummary {
  total_learner_batches: number;
  teacher_reviewed: number;
  at_risk_count: number;
  not_risk_count: number;
  threshold_target: number;
  threshold_pct: number;
  confirmatory_ready: boolean;
}

export default function LearningOutcomesPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);

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

      // Fetch live label status
      try {
        const res = await fetch("/api/researcher/teacher-review", {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (res.ok) {
          const payload = await res.json() as { summary: ReviewSummary };
          setReviewSummary(payload.summary);
        }
      } catch { /* non-fatal — page still renders with static content */ }

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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <ResearcherBreadcrumb current="Learning Outcomes" />

        {/* Title */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">Learning Outcomes</h1>
            <p className="text-sm text-[#64748B]">
              2C3L rubric design, at-risk prediction outcome plan, and cohort-level
              learning progression. Live data available after Phase 5 C teacher review.
            </p>
          </div>
          {reviewSummary?.confirmatory_ready ? (
            <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">
              ✓ Confirmatory threshold met
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200">
              {reviewSummary
                ? `${reviewSummary.teacher_reviewed}/${reviewSummary.threshold_target} reviewed`
                : "Awaiting Phase 5 C"}
            </span>
          )}
        </div>

        {/* At-risk definition */}
        <section className="rounded-2xl border border-[#FED7AA] bg-white px-6 py-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A]">At-Risk Definition</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-5 py-4 text-center min-w-[140px]">
              <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-wide mb-1">At-Risk Threshold</p>
              <p className="text-2xl font-bold text-rose-700">
                &lt; {AT_RISK_THRESHOLD}
              </p>
              <p className="text-[11px] text-rose-500 mt-1">total_2c3l_score</p>
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <p className="text-sm text-[#475569] leading-relaxed">
                A learner is classified as <strong>at-risk</strong> when their total 2C3L score
                falls below {AT_RISK_THRESHOLD} out of 100 (sum of all five criteria, 20 pts each).
              </p>
              <p className="text-xs text-[#94A3B8]">
                Source: <span className="font-mono">PHASE4_RESEARCH_CONTRACT_v1.md</span> ·
                label_validity = pilot_only until teacher-reviewed scores collected.
              </p>
            </div>
          </div>
        </section>

        {/* Live label progress */}
        {reviewSummary && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">Label Collection Progress</h2>
              <a href="/researcher/teacher-review" className="text-xs font-semibold text-[#F37021] hover:underline">
                View details →
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total learner-batches", val: reviewSummary.total_learner_batches, cls: "" },
                { label: "Teacher-reviewed",      val: reviewSummary.teacher_reviewed,      cls: "text-emerald-700 font-bold" },
                { label: "At-risk (reviewed)",    val: reviewSummary.at_risk_count,         cls: "text-rose-700 font-bold" },
                { label: "Not at-risk (reviewed)",val: reviewSummary.not_risk_count,        cls: "text-sky-700 font-bold" },
              ].map(({ label, val, cls }) => (
                <div key={label} className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">{label}</p>
                  <p className={`text-xl tabular-nums text-[#0F172A] ${cls}`}>{val}</p>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-[#64748B] mb-1">
                <span>{reviewSummary.teacher_reviewed} / {reviewSummary.threshold_target} for confirmatory</span>
                <span className="font-semibold">{reviewSummary.threshold_pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                <div
                  className={`h-full rounded-full ${reviewSummary.confirmatory_ready ? "bg-emerald-500" : "bg-[#F37021]"}`}
                  style={{ width: `${reviewSummary.threshold_pct}%` }}
                />
              </div>
            </div>
          </section>
        )}

        {/* 2C3L rubric */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
            2C3L Rubric Criteria
          </h2>

          {RUBRIC_CRITERIA.map(c => (
            <section
              key={c.id}
              className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F1F5F9]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.color}`}>
                  {c.code} — {c.label}
                </span>
                <span className="ml-auto text-[11px] text-[#94A3B8]">{c.weight} pts</span>
              </div>

              {/* Body */}
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-[#475569] leading-relaxed">{c.description}</p>

                {/* Score anchors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
                    <p className="text-[9px] font-bold text-rose-400 uppercase tracking-wider mb-1">Low score</p>
                    <p className="text-xs text-rose-700">{c.scoreLow}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1">High score</p>
                    <p className="text-xs text-emerald-700">{c.scoreHigh}</p>
                  </div>
                </div>

                {/* Keywords */}
                <div className="flex flex-wrap gap-1.5">
                  {c.keywords.map(kw => (
                    <span
                      key={kw}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B]"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Outcome visualisation plan */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <h2 className="text-sm font-bold text-[#0F172A]">
            Phase 5 C — Outcome Visualisation Plan
          </h2>
          <p className="text-xs text-[#64748B]">
            The following analysis sections will be populated once teacher-reviewed 2C3L
            scores are collected for ≥ 60 learner-batch records:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {OUTCOME_PLAN.map(section => (
              <div key={section.section} className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 space-y-2">
                <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide">
                  {section.section}
                </p>
                <ul className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#475569]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · 2C3L rubric v1.0 · Live data pending Phase 5 C teacher review
        </p>
      </main>
    </div>
  );
}
