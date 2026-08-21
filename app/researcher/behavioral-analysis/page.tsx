"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Static feature taxonomy — matches NB02 / NB03 flat_behavioral + sequence
// feature engineering (pipeline v1). Update when Phase 5 C data is collected.
// ---------------------------------------------------------------------------

const FEATURE_GROUPS = [
  {
    id: "block_events",
    label: "Block Coding Events",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    features: [
      { name: "block_add_count",      desc: "Total block addition events in session" },
      { name: "block_delete_count",   desc: "Total block deletion / undo events" },
      { name: "block_move_count",     desc: "Block drag / repositioning events" },
      { name: "block_type_entropy",   desc: "Shannon entropy over block type distribution (diversity)" },
      { name: "unique_block_types",   desc: "Count of distinct block categories used" },
      { name: "early_block_rate",     desc: "Fraction of blocks added in first quartile of session" },
    ],
  },
  {
    id: "sql_runs",
    label: "SQL Execution Patterns",
    color: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    features: [
      { name: "sql_run_count",        desc: "Total SQL execution attempts" },
      { name: "sql_success_rate",     desc: "Fraction of SQL runs returning a result set" },
      { name: "sql_error_rate",       desc: "Fraction of SQL runs producing syntax / runtime errors" },
      { name: "sql_retry_count",      desc: "Re-runs on the same task after an error" },
      { name: "first_success_latency",desc: "Time (s) from session start to first successful SQL run" },
      { name: "query_complexity_avg", desc: "Average estimated complexity (clause count) per query" },
    ],
  },
  {
    id: "error_patterns",
    label: "Error & Correction Patterns",
    color: "bg-rose-100 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    features: [
      { name: "error_burst_count",    desc: "Number of consecutive-error bursts (≥ 3 errors in a row)" },
      { name: "recovery_speed_avg",   desc: "Average time (s) from error to next successful attempt" },
      { name: "error_diversity",      desc: "Count of distinct error types encountered" },
      { name: "self_correction_rate", desc: "Fraction of errors resolved without hint" },
      { name: "hint_request_count",   desc: "Explicit hint / check-answer requests" },
    ],
  },
  {
    id: "temporal",
    label: "Temporal Engagement",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    features: [
      { name: "session_duration_s",   desc: "Total active session duration in seconds" },
      { name: "idle_gap_max_s",       desc: "Longest continuous idle gap (proxy for disengagement)" },
      { name: "active_fraction",      desc: "Fraction of session time with at least one event per minute" },
      { name: "task_switch_count",    desc: "Number of times learner switched between tasks" },
      { name: "late_session_activity",desc: "Fraction of events occurring in final quartile" },
    ],
  },
  {
    id: "sequence_features",
    label: "Sequence-Tensor Features (EXP-A / EXP-B)",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    features: [
      { name: "event_token_ids",      desc: "Canonical integer tokens per event type (vocabulary_v1.json)" },
      { name: "scaled_numerics",      desc: "Per-step numeric features normalised via scaler_v1.json" },
      { name: "padding_mask",         desc: "Boolean mask for padded positions (max_len = 95th percentile)" },
      { name: "tag_node_count",       desc: "[EXP-B] Number of nodes in Temporal Assessment Graph" },
      { name: "tag_edge_count",       desc: "[EXP-B] Number of directed edges in TAG" },
      { name: "tag_entropy",          desc: "[EXP-B] Shannon entropy over TAG node type distribution" },
    ],
  },
] as const;

const PIPELINE_STATUS = [
  { label: "Canonical event vocab",  status: "ready",   note: "vocabulary_v1.json — NB05" },
  { label: "Feature scaler",         status: "ready",   note: "scaler_v1.json — NB05" },
  { label: "Flat feature extraction",status: "ready",   note: "NB02 flat_behavioral feature set" },
  { label: "Sequence tensor build",  status: "ready",   note: "NB05 sequence_tensors" },
  { label: "TAG feature extraction", status: "ready",   note: "NB08 tag_graph_features" },
  { label: "Per-learner profiles",   status: "phase5c", note: "Requires real cohort data" },
  { label: "Feature importance plot",status: "phase5c", note: "Requires ≥ 60 learners" },
  { label: "SHAP explainability",    status: "phase5c", note: "Requires teacher-reviewed labels" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BehavioralAnalysisPage() {
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
        <ResearcherBreadcrumb current="Behavioral Analysis" />

        {/* Title */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">Behavioral Analysis</h1>
            <p className="text-sm text-[#64748B]">
              Learner behavioral feature taxonomy, BSSA extraction pipeline status, and
              sequence-level engagement indicators. Per-learner profiles available after
              Phase 5 C real-data collection.
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200">
            Phase 5 B — Pipeline Ready
          </span>
        </div>

        {/* Pipeline status */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FED7AA]">
            <h2 className="text-sm font-bold text-[#0F172A]">Pipeline Component Status</h2>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            {PIPELINE_STATUS.map(item => (
              <div key={item.label} className="flex items-center gap-4 px-6 py-3">
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${item.status === "ready" ? "bg-emerald-500" : "bg-amber-400"}`}
                />
                <span className="flex-1 text-sm text-[#0F172A]">{item.label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  item.status === "ready"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-amber-100 text-amber-700 border-amber-200"
                }`}>
                  {item.status === "ready" ? "Ready" : "Phase 5 C"}
                </span>
                <span className="text-[11px] text-[#94A3B8] font-mono text-right shrink-0 hidden sm:block">
                  {item.note}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Feature taxonomy */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
            Feature Taxonomy (pipeline v1)
          </h2>

          {FEATURE_GROUPS.map(group => (
            <section
              key={group.id}
              className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden"
            >
              {/* Group header */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-[#F1F5F9]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${group.dot}`} />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${group.color}`}>
                  {group.label}
                </span>
                <span className="text-[11px] text-[#94A3B8]">{group.features.length} features</span>
              </div>

              {/* Feature rows */}
              <div className="divide-y divide-[#F1F5F9]">
                {group.features.map(f => (
                  <div key={f.name} className="flex items-start gap-4 px-6 py-2.5">
                    <span className="font-mono text-[11px] text-[#F37021] bg-[#FFF7ED] border border-[#FED7AA] px-1.5 py-0.5 rounded shrink-0 mt-0.5 whitespace-nowrap">
                      {f.name}
                    </span>
                    <span className="text-xs text-[#475569] leading-relaxed">{f.desc}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Phase 5 C notice */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A]">Phase 5 C — Interactive Analysis</h2>
          <p className="text-xs text-[#64748B]">
            The following visualisations will be enabled once real-cohort behavioral data is
            collected and teacher-reviewed labels are available:
          </p>
          <ul className="space-y-2">
            {[
              "Per-learner feature heatmap (learner × feature matrix)",
              "Event-type frequency distribution across at-risk vs. not-at-risk groups",
              "Block-coding entropy trajectory plots (time-series per learner)",
              "Random Forest feature importance rankings with confidence intervals",
              "SHAP summary plot — top-10 features driving at-risk prediction",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-amber-200 text-[10px] font-bold text-amber-500 shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-[#475569]">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Feature taxonomy v1.0 · Phase 5 B pipeline ready · Phase 5 C pending
        </p>
      </main>
    </div>
  );
}
