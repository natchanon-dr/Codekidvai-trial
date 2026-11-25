"use client";

// ---------------------------------------------------------------------------
// Feature Analytics — Phase 4 dataset statistics: learner counts, split
// summary, sequence stats, and validation checks (per the Researcher
// dashboard card description).
//
// M5.31A fix: this page previously called `/api/researcher/sequential-analysis`
// (a copy-pasted leftover from the Sequential Analysis page) and rendered a
// dataset/run browser instead of dataset statistics. It now calls its own
// dedicated route, `/api/researcher/analytics-summary`, and renders exactly
// what that route returns — live session-level stats (queried fresh from
// `vw_dataset_session_level`) plus frozen Phase 4 pipeline-artifact stats
// (dataset split summary, validation checks, and BSSA feature-group
// inventory). Nothing here is fabricated: every value is either a live query
// result or a value already present in `lib/research-artifacts/phase4/
// phase4_ui_summary_v1.json`.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Types — mirrors app/api/researcher/analytics-summary/route.ts's response
// ---------------------------------------------------------------------------

type LiveStats = {
  learner_count: number;
  session_count: number;
  batch_type_filter: string | null;
  task_type_filter: string | null;
  grain: "session_level";
};

type PipelineStats = {
  total_learners: number;
  train_learners: number;
  test_learners: number;
  train_sequences: number;
  test_sequences: number;
  total_sequences: number;
  total_canonical_events: number;
  max_sequence_length: number;
  sequence_length_percentile: number;
  split_method: string;
  split_random_state: number;
  dedup_window_seconds: number;
  vocab_size: number;
  features_per_timestep: number;
  thesis_minimum_learners: number;
  source: string;
  note: string;
};

type Validation = {
  checks_run: number;
  checks_passed: number;
  no_learner_overlap: boolean;
  no_pii_in_exports: boolean;
  leakage_check_passed: boolean;
  split_integrity_passed: boolean;
};

type BssaGroup = {
  label: string;
  status: string;
  feature_count: number;
  features: string[];
  model_usage: string[];
  description?: string;
  note?: string;
};

type BssaFeatures = {
  framework: string;
  note: string;
  groups: Record<string, BssaGroup>;
};

type Payload = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
  live_stats: LiveStats;
  pipeline_stats: PipelineStats;
  validation: Validation;
  bssa_features: BssaFeatures;
};

const BATCH_TYPE_OPTIONS = [
  { value: "", label: "All batches" },
  { value: "assignment_set", label: "Assignment" },
  { value: "lab_set", label: "Lab" },
  { value: "exam_set", label: "Exam" },
];

const TASK_TYPE_OPTIONS = [
  { value: "", label: "All tasks" },
  { value: "sql_text", label: "SQL Query" },
  { value: "sql_block", label: "Query Block" },
  { value: "stored_procedure", label: "Stored Procedure" },
  { value: "er_diagram", label: "ER Diagram" },
  { value: "coding_text", label: "Coding (text)" },
  { value: "coding_block", label: "Coding (block)" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-white px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-[#94A3B8] font-semibold">{label}</p>
      <p className="text-xl font-bold text-[#0F172A] mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-[#94A3B8] mt-0.5">{sub}</p>}
    </div>
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <span>{label}</span>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  implemented: "bg-green-100 text-green-700 border-green-200",
  deferred: "bg-amber-100 text-amber-700 border-amber-200",
  not_implemented: "bg-gray-100 text-gray-600 border-gray-200",
};

function GroupCard({ group }: { group: BssaGroup }) {
  const style = STATUS_STYLE[group.status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#0F172A]">{group.label}</p>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style}`}>
          {group.status}
        </span>
      </div>
      <p className="text-xs text-[#64748B]">
        {group.feature_count} feature{group.feature_count !== 1 ? "s" : ""}
        {group.model_usage.length > 0 && <> · used by {group.model_usage.join(", ")}</>}
      </p>
      {group.description && <p className="text-[11px] text-[#94A3B8]">{group.description}</p>}
      {group.note && <p className="text-[11px] text-amber-700 italic">{group.note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeatureAnalyticsPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [batchType, setBatchType] = useState("");
  const [taskType, setTaskType] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
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
      setToken(session.access_token);
    }
    void init();
  }, [router]);

  useEffect(() => {
    if (!token) return;
    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const params = new URLSearchParams();
        if (batchType) params.set("batch_type", batchType);
        if (taskType) params.set("task_type", taskType);
        const res = await fetch(`/api/researcher/analytics-summary?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "Request failed" }));
          setFetchError((j as { error?: string }).error ?? "Failed to load feature analytics.");
          setLoading(false);
          return;
        }
        setData(await res.json() as Payload);
      } catch {
        setFetchError("Failed to load feature analytics.");
      }
      setLoading(false);
    }
    void load();
  }, [token, batchType, taskType]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading...
      </div>
    );
  }

  const ps = data?.pipeline_stats;
  const ls = data?.live_stats;
  const v = data?.validation;
  const groups = data?.bssa_features?.groups;

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
        <ResearcherBreadcrumb current="Feature Analytics" />

        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Feature Analytics</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Phase 4 dataset statistics: learner counts, split summary, sequence stats, and validation checks.
          </p>
        </div>

        {data && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {data.data_warning}
          </div>
        )}

        {loading && <p className="text-sm text-[#94A3B8] text-center py-10">Loading…</p>}
        {fetchError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center">
            <p className="text-sm text-red-700 font-semibold">{fetchError}</p>
          </div>
        )}

        {!loading && !fetchError && data && (
          <>
            {/* Live stats + filters */}
            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#64748B] font-medium">Batch type</label>
                  <select
                    value={batchType}
                    onChange={(e) => setBatchType(e.target.value)}
                    className="px-3 py-2 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  >
                    {BATCH_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#64748B] font-medium">Task type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="px-3 py-2 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  >
                    {TASK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <span className="text-[10px] text-[#94A3B8] pb-2">
                  Live query — grain: {ls?.grain}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Learners (live, filtered)" value={ls?.learner_count ?? "—"} />
                <StatCard label="Sessions (live, filtered)" value={ls?.session_count ?? "—"} />
              </div>
            </section>

            {/* Pipeline / split summary */}
            {ps && (
              <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3">
                <p className="text-sm font-bold text-[#0F172A]">Dataset Split Summary (frozen Phase 4 pipeline artifact)</p>
                <p className="text-[11px] text-[#94A3B8]">{ps.note}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Total learners" value={ps.total_learners} sub={`thesis min: ${ps.thesis_minimum_learners}`} />
                  <StatCard label="Train / Test learners" value={`${ps.train_learners} / ${ps.test_learners}`} />
                  <StatCard label="Train / Test sequences" value={`${ps.train_sequences} / ${ps.test_sequences}`} />
                  <StatCard label="Total sequences" value={ps.total_sequences} />
                  <StatCard label="Canonical events" value={ps.total_canonical_events} />
                  <StatCard label="Max sequence length" value={ps.max_sequence_length} sub={`p${ps.sequence_length_percentile}`} />
                  <StatCard label="Vocab size" value={ps.vocab_size} />
                  <StatCard label="Features / timestep" value={ps.features_per_timestep} />
                </div>
                <p className="text-xs text-[#64748B]">
                  Split method: <span className="font-mono">{ps.split_method}</span> (random_state={ps.split_random_state}) ·
                  {" "}Dedup window: {ps.dedup_window_seconds}s
                </p>
              </section>
            )}

            {/* Validation checks */}
            {v && (
              <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3">
                <p className="text-sm font-bold text-[#0F172A]">
                  Validation Checks — {v.checks_passed} / {v.checks_run} passed
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <CheckRow label="No learner overlap (train/test)" ok={v.no_learner_overlap} />
                  <CheckRow label="No PII in exports" ok={v.no_pii_in_exports} />
                  <CheckRow label="Leakage check passed" ok={v.leakage_check_passed} />
                  <CheckRow label="Split integrity passed" ok={v.split_integrity_passed} />
                </div>
              </section>
            )}

            {/* BSSA feature-group inventory */}
            {groups && (
              <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3">
                <p className="text-sm font-bold text-[#0F172A]">BSSA Feature-Group Inventory</p>
                <p className="text-[11px] text-[#94A3B8]">{data.bssa_features.note}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(groups).map(([key, group]) => <GroupCard key={key} group={group} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
