"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Static content — Semantic Analysis research design
// Actual NLP/embedding notebooks are Phase 5 E scope.
// ---------------------------------------------------------------------------

const ANALYSIS_LAYERS = [
  {
    id: "code_quality",
    label: "SQL / Block Code Quality",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    description:
      "Automated static analysis of learner-submitted SQL queries and block programs for correctness, efficiency, and idiom adherence.",
    signals: [
      { name: "query_complexity_score",   desc: "Estimated number of clauses, joins, and sub-queries" },
      { name: "select_star_usage",        desc: "Whether SELECT * is used instead of explicit columns" },
      { name: "alias_consistency",        desc: "Consistent table alias usage across query" },
      { name: "where_clause_present",     desc: "Boolean — does query filter results appropriately" },
      { name: "block_nesting_depth",      desc: "Max nesting depth of block program structure" },
    ],
    status: "phase5e",
  },
  {
    id: "error_semantics",
    label: "Error Message Semantics",
    color: "bg-rose-100 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    description:
      "Semantic clustering of error messages encountered by learners to identify systematic misconceptions.",
    signals: [
      { name: "error_cluster_id",         desc: "DBSCAN cluster label for this error type" },
      { name: "error_semantic_similarity", desc: "Cosine similarity to canonical error prototype" },
      { name: "misconception_tag",        desc: "Human-interpretable label: syntax / logic / schema / join" },
      { name: "error_novelty_score",      desc: "How far this error is from previously seen errors (IQR)" },
    ],
    status: "phase5e",
  },
  {
    id: "solution_embedding",
    label: "Solution Embedding Space",
    color: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    description:
      "Dense vector representations of learner solutions using a code-aware encoder, enabling similarity search and progression tracking.",
    signals: [
      { name: "solution_embedding_384d",  desc: "384-dim vector (code-optimised Sentence-BERT)" },
      { name: "cosine_sim_to_reference",  desc: "Similarity to teacher reference solution" },
      { name: "solution_cluster",         desc: "K-means cluster label (k=5 per task)" },
      { name: "drift_from_prev_attempt",  desc: "Cosine distance between consecutive attempts" },
    ],
    status: "phase5e",
  },
  {
    id: "progression",
    label: "Semantic Progression",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    description:
      "Tracking how learner solution semantics evolve over a session — moving toward or away from correct answers.",
    signals: [
      { name: "trajectory_slope",         desc: "Linear regression slope of similarity over attempts" },
      { name: "plateau_detected",         desc: "Boolean — learner stuck in local minimum ≥ 3 attempts" },
      { name: "breakthrough_attempt",     desc: "Attempt index at which similarity crossed 0.8 threshold" },
      { name: "final_semantic_quality",   desc: "Cosine similarity of last attempt to reference" },
    ],
    status: "phase5e",
  },
] as const;

const NLP_STACK = [
  { tool: "sentence-transformers",   role: "Code-aware embeddings (microsoft/codebert-base)" },
  { tool: "scikit-learn DBSCAN",     role: "Error message semantic clustering" },
  { tool: "sqlparse",                role: "SQL AST parsing for complexity features" },
  { tool: "numpy cosine_similarity", role: "Pairwise solution similarity computation" },
  { tool: "umap-learn",              role: "2-D projection for visualisation (research only)" },
] as const;

const PHASE_PLAN = [
  { phase: "Phase 5 E-1", task: "Select and freeze embedding model (CodeBERT vs MiniLM)" },
  { phase: "Phase 5 E-2", task: "NB10: SQL/block complexity features notebook" },
  { phase: "Phase 5 E-3", task: "NB11: Error semantic clustering notebook" },
  { phase: "Phase 5 E-4", task: "NB12: Solution embedding + progression notebook" },
  { phase: "Phase 5 E-5", task: "API endpoint + researcher visualisation page (live data)" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SemanticAnalysisPage() {
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
        <ResearcherBreadcrumb current="Semantic Analysis" />

        {/* Title */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">Semantic Analysis</h1>
            <p className="text-sm text-[#64748B]">
              NLP-based analysis of learner solutions, error messages, and code semantics.
              Analysis layers and NLP stack defined for Phase 5 E implementation.
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-slate-100 text-slate-500 border-slate-200">
            Phase 5 E — Not yet implemented
          </span>
        </div>

        {/* Phase 5 E notice */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-700 flex items-center gap-2">
            <span aria-hidden="true">⚠</span> Pending Phase 5 E — Semantic Notebooks (NB10–NB12)
          </p>
          <p className="text-xs text-amber-600 leading-relaxed">
            Semantic analysis requires NLP embedding notebooks that are not yet built.
            This page documents the planned analysis layers, signal taxonomy, and NLP stack
            to be implemented in Phase 5 E. Live data will appear here once NB10–NB12 are complete.
          </p>
        </div>

        {/* Analysis layers */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
            Planned Analysis Layers
          </h2>

          {ANALYSIS_LAYERS.map((layer) => (
            <section
              key={layer.id}
              className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden opacity-80"
            >
              <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F1F5F9]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${layer.dot}`} />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${layer.color}`}>
                  {layer.label}
                </span>
                <span className="ml-auto text-[10px] font-bold text-slate-400 border border-slate-200 bg-slate-50 px-2 py-0.5 rounded-full">
                  Phase 5 E
                </span>
              </div>

              <div className="px-6 py-4 space-y-3">
                <p className="text-sm text-[#475569]">{layer.description}</p>
                <div className="divide-y divide-[#F8FAFC]">
                  {layer.signals.map((s) => (
                    <div key={s.name} className="flex items-start gap-3 py-1.5">
                      <span className="font-mono text-[11px] text-[#F37021] bg-[#FFF7ED] border border-[#FED7AA] px-1.5 py-0.5 rounded shrink-0 mt-0.5 whitespace-nowrap">
                        {s.name}
                      </span>
                      <span className="text-xs text-[#64748B]">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* NLP stack */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A]">Planned NLP Stack</h2>
          <div className="divide-y divide-[#F1F5F9]">
            {NLP_STACK.map((item) => (
              <div key={item.tool} className="flex items-start gap-4 py-2.5">
                <span className="font-mono text-[11px] text-[#0F172A] bg-[#F1F5F9] px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
                  {item.tool}
                </span>
                <span className="text-xs text-[#475569]">{item.role}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Implementation plan */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A]">Phase 5 E Implementation Plan</h2>
          <div className="space-y-2">
            {PHASE_PLAN.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-slate-200 text-[10px] font-bold text-slate-400 shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">
                    {item.phase}
                  </span>
                  <span className="text-sm text-[#475569]">{item.task}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Semantic analysis design v1.0 · Live data pending Phase 5 E (NB10–NB12)
        </p>
      </main>
    </div>
  );
}
