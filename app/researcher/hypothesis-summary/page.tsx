"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Static content — derived from PHASE4_RESEARCH_CONTRACT_v1.md
// ---------------------------------------------------------------------------

const HYPOTHESES = [
  {
    id: "H1",
    label: "Behavioral Predictability",
    statement:
      "Learner behavioral sequences (block events, SQL runs, error patterns) observed before the cutoff timestamp contain learnable signal that predicts at-risk 2C3L outcome (total_2c3l_score < 65) at above-chance performance.",
    models: ["Logistic Regression (EXP-A flat)", "Random Forest (EXP-A flat)", "LSTM EXP-A", "GRU EXP-A"],
    evalCriteria:
      "ROC-AUC > 0.5 on held-out test set with teacher-reviewed labels (≥60 learners)",
    pilotNote:
      "Proxy labels only — label_validity=pilot_only. AUC=1.000 due to circularity (proxy_target_circularity=true). Not evaluable on current data.",
  },
  {
    id: "H2",
    label: "Sequence Model Advantage",
    statement:
      "LSTM and GRU models using temporal sequence structure outperform flat-feature baselines (Logistic Regression, Random Forest) on at-risk prediction when evaluated on teacher-reviewed 2C3L labels.",
    models: ["LSTM EXP-A vs LR/RF", "GRU EXP-A vs LR/RF"],
    evalCriteria:
      "Statistically significant ROC-AUC improvement (McNemar's test, α = 0.05) with ≥ 60 learners and teacher-reviewed labels",
    pilotNote:
      "Confirmatory testing blocked: confirmatory_analysis_allowed=false. Pilot (proxy labels): LSTM EXP-A AUC=0.641, GRU EXP-A AUC=0.653 — not thesis evidence.",
  },
  {
    id: "H3",
    label: "TAG Graph Feature Contribution",
    statement:
      "Adding Temporal Assessment Graph (TAG) graph-structural features (EXP-B: Sequence + TAG) improves at-risk prediction over sequence-only models (EXP-A) for the LSTM and GRU architectures.",
    models: ["LSTM EXP-B vs EXP-A", "GRU EXP-B vs EXP-A"],
    evalCriteria:
      "ROC-AUC improvement in EXP-B over EXP-A on teacher-reviewed labels; 18 TAG features (node_count, edge_count, entropy, …)",
    pilotNote:
      "Confirmatory testing blocked: confirmatory_analysis_allowed=false. EXP-B results confounded by proxy_target_circularity=true.",
  },
] as const;

const CONSTRAINTS = [
  { label: "evaluation_purpose",            value: "technical_pipeline_validation" },
  { label: "label_source",                  value: "proxy_behavioral" },
  { label: "label_validity",                value: "pilot_only" },
  { label: "proxy_target_circularity",      value: "true" },
  { label: "confirmatory_analysis_allowed", value: "false" },
] as const;

const REQUIREMENTS_FOR_CONFIRMATORY = [
  'Teacher-reviewed 2C3L labels (label_source = "teacher_reviewed")',
  "Minimum 60 learner-batch records with GroupShuffleSplit guarantee",
  "Expert sign-off on label validity before any hypothesis test",
  "All five 2C3L criteria scored (c1, c2, l1, l2, l3) — no empty/unmeasurable keywords",
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HypothesisSummaryPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        <ResearcherBreadcrumb current="Hypothesis Summary" />

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#0F172A]">Hypothesis Summary</h1>
          <p className="text-sm text-[#64748B]">
            Research hypotheses, evaluation criteria, and pilot-phase status —
            derived from{" "}
            <span className="font-mono text-xs bg-[#F1F5F9] px-1 rounded">
              PHASE4_RESEARCH_CONTRACT_v1.md
            </span>
          </p>
        </div>

        {/* Research constraints banner */}
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 space-y-3">
          <p className="text-sm font-bold text-red-700 flex items-center gap-2">
            <span aria-hidden="true">⚠</span> Active Research Constraints
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
            {CONSTRAINTS.map(({ label, value }) => (
              <div key={label} className="flex gap-2">
                <span className="text-red-400 shrink-0">{label}</span>
                <span className="text-red-700 font-bold">= {value}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-red-600 italic">
            No confirmatory hypothesis testing until teacher-reviewed labels are available and
            all constraints above are resolved.
          </p>
        </div>

        {/* Hypotheses */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
            Research Hypotheses
          </h2>

          {HYPOTHESES.map((h) => (
            <section
              key={h.id}
              className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white bg-[#F37021] px-2 py-0.5 rounded-full">
                    {h.id}
                  </span>
                  <span className="font-semibold text-[#0F172A] text-sm">{h.label}</span>
                </div>
                <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-700 border-amber-200">
                  Pipeline validation only
                </span>
              </div>

              {/* Statement */}
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3">
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">
                  Hypothesis
                </p>
                <p className="text-sm text-[#475569] leading-relaxed">{h.statement}</p>
              </div>

              {/* Models + criteria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                    Models involved
                  </p>
                  <ul className="space-y-1">
                    {h.models.map((m) => (
                      <li key={m} className="flex items-center gap-1.5 text-xs text-[#475569]">
                        <span className="w-1 h-1 rounded-full bg-[#F37021] shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                    Evaluation criterion
                  </p>
                  <p className="text-xs text-[#475569] leading-relaxed">{h.evalCriteria}</p>
                </div>
              </div>

              {/* Pilot note */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                <span className="text-amber-500 text-xs shrink-0 mt-0.5" aria-hidden="true">
                  ⚠
                </span>
                <p className="text-xs text-amber-700 leading-relaxed">{h.pilotNote}</p>
              </div>
            </section>
          ))}
        </div>

        {/* Requirements for confirmatory */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <h2 className="text-sm font-bold text-[#0F172A]">
            Requirements for Confirmatory Analysis
          </h2>
          <p className="text-xs text-[#64748B]">
            All of the following must be satisfied before any hypothesis test may be reported
            as a thesis finding:
          </p>
          <ul className="space-y-2">
            {REQUIREMENTS_FOR_CONFIRMATORY.map((req, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-[#E2E8F0] text-[10px] font-bold text-[#94A3B8] shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-[#475569]">{req}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
            <p className="text-xs text-[#64748B]">
              <span className="font-semibold text-[#0F172A]">Current status:</span>{" "}
              0 / {REQUIREMENTS_FOR_CONFIRMATORY.length} requirements met. Proceed to teacher
              review (Phase 5 C) and label collection.
            </p>
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Contract v1.0 (2026-07-15) · Research integrity enforced by platform
        </p>
      </main>
    </div>
  );
}
