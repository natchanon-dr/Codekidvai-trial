"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";
import {
  TaskTypeIcon,
  TASK_TYPE_LABEL,
  TASK_TYPE_ORDER,
} from "@/lib/task-type-utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  features?: string[];
  features_per_timestep?: number;
  max_seq_len?: number;
  feature_note?: string;
  model_usage: string[];
  description: string;
  phase?: string;
  note?: string;
  circular_features?: string[];
  circular_reason?: string;
};

type BssaFeatures = {
  framework: string;
  note: string;
  groups: Record<string, BssaGroup>;
};

type ApiData = {
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

// ─── Dimension filter config ────────────────────────────────────────────────

type BatchTypeValue = "assignment_set" | "lab_set" | "exam_set";
type TaskTypeValue = string;

const BATCH_TYPE_OPTIONS: { value: BatchTypeValue; label: string }[] = [
  { value: "assignment_set", label: "Assignment" },
  { value: "lab_set", label: "Lab" },
  { value: "exam_set", label: "Exam" },
];

function BatchTypeIcon({ value, className }: { value: BatchTypeValue; className?: string }) {
  if (value === "assignment_set") return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
    </svg>
  );
  if (value === "lab_set") return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C.817 14.769 2.156 18 4.828 18h10.343c2.673 0 4.012-3.231 2.122-5.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7zm2 6.172V4h2v4.172a3 3 0 00.879 2.12l1.027 1.028a4 4 0 00-2.171.102l-.47.156a4 4 0 01-2.53 0l-.563-.187a1.993 1.993 0 00-.114-.035l1.063-1.063A3 3 0 009 8.172z" clipRule="evenodd"/>
    </svg>
  );
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
    </svg>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PilotDisclaimer({ warning }: { warning: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-xl mt-0.5">⚠</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-amber-800 text-sm">Pilot Data Notice — Technical Validation Only</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wide">PILOT ONLY</span>
          </div>
          <p className="text-amber-700 text-xs mt-2 leading-relaxed">
            This data uses <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">proxy_behavioral</code> labels
            {" "}derived from the attempt stream. Proxy-target circularity is present. Results must not be interpreted as confirmatory research findings.
          </p>
          <p className="text-amber-600 text-xs mt-1.5 italic">{warning}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono bg-white/70 border border-amber-200 rounded-lg p-3">
        <span className="text-[#64748B]">evaluation_purpose</span><span className="text-[#0F172A]">= technical_pipeline_validation</span>
        <span className="text-[#64748B]">label_source</span><span className="text-[#0F172A]">= proxy_behavioral</span>
        <span className="text-[#64748B]">label_validity</span><span className="text-[#0F172A]">= pilot_only</span>
        <span className="text-[#64748B]">proxy_target_circularity</span><span className="text-[#0F172A]">= true</span>
        <span className="text-[#64748B]">confirmatory_analysis_allowed</span><span className="text-[#0F172A]">= false</span>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-2.5 border-b border-[#F1F5F9]">
      <span className="text-xs text-[#475569]">{label}</span>
      <span className="text-sm font-semibold text-[#0F172A] ml-3 text-right">{value}</span>
    </div>
  );
}

function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      <span>{ok ? "✅" : "❌"}</span>
      <span>{label}</span>
    </div>
  );
}

function ToggleBtn({
  active, onClick, children, title, "aria-label": ariaLabel, compact,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
  title?: string; "aria-label"?: string; compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`${compact ? "px-2" : "px-3"} py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        active
          ? "bg-[#F37021] text-white border-[#F37021]"
          : "bg-white text-[#475569] border-[#E2E8F0] hover:border-[#F37021] hover:text-[#F37021]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── BSSA Feature Group Card ─────────────────────────────────────────────────

function BssaGroupCard({ groupKey, group }: { groupKey: string; group: BssaGroup }) {
  const [expanded, setExpanded] = useState(false);
  const isImplemented = group.status === "implemented";
  const isDeferred = group.status === "deferred";

  const statusColor = isImplemented
    ? "bg-green-50 border-green-200 text-green-700"
    : isDeferred
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]";

  const statusLabel = isImplemented
    ? "Implemented"
    : isDeferred
      ? "Deferred → Phase 5"
      : "Not Implemented";

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${isImplemented ? "border-[#E2E8F0] bg-white" : "border-[#F1F5F9] bg-[#F8FAFC] opacity-80"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-[#0F172A]">{group.label}</span>
          {isImplemented && (
            <span className="text-[10px] font-mono text-[#F37021]">{group.feature_count} features</span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <p className="text-[11px] text-[#64748B] leading-relaxed">{group.description}</p>

      {group.model_usage.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-[#94A3B8]">Used by:</span>
          {group.model_usage.map(m => (
            <span key={m} className="text-[10px] font-mono bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded">{m}</span>
          ))}
        </div>
      )}

      {groupKey === "sequential" && (
        <div className="text-[10px] text-[#64748B] space-y-0.5">
          <p><span className="text-[#94A3B8]">Features per timestep:</span> {group.features_per_timestep}</p>
          <p><span className="text-[#94A3B8]">Max sequence length:</span> {group.max_seq_len} steps</p>
          {group.feature_note && <p className="italic">{group.feature_note}</p>}
        </div>
      )}

      {group.circular_features && group.circular_features.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 space-y-0.5">
          <p className="font-semibold">⚠ Proxy-target circularity: PRESENT in this group</p>
          <p className="leading-relaxed">{group.circular_reason}</p>
        </div>
      )}

      {isImplemented && group.features && group.features.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-[#F37021] hover:underline font-medium"
          >
            {expanded ? `▲ Hide features` : `▼ Show all ${group.features.length} features`}
          </button>
          {expanded && (
            <div className="mt-2 flex flex-wrap gap-1">
              {group.features.map(f => {
                const isCircular = group.circular_features?.includes(f) ?? false;
                return (
                  <span key={f} className="inline-flex items-center gap-1">
                    <code className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      isCircular
                        ? "bg-amber-50 border-amber-300 text-amber-800 font-semibold"
                        : "bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]"
                    }`}>{f}</code>
                    {isCircular && (
                      <span className="text-[8px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-1 py-0.5 rounded uppercase tracking-wide">
                        circular
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isImplemented && group.note && (
        <p className="text-[10px] text-[#94A3B8] italic">{group.note}</p>
      )}
    </div>
  );
}

// ─── 2C3L Rubric Component Card ──────────────────────────────────────────────

function C2L3ComponentCard({ code, description }: { code: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm text-[#0F172A] font-mono">{code}</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
          Pilot Only · Not Yet Validated
        </span>
      </div>
      <p className="text-[11px] text-[#64748B] leading-relaxed">{description}</p>
      <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-[10px] text-[#94A3B8]">
        No teacher-reviewed or expert-validated assessment — results cannot be displayed yet
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsSummaryPage() {
  const router = useRouter();

  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);

  // Dimension filters
  const [batchType, setBatchType] = useState<BatchTypeValue | null>(null);
  const [taskType, setTaskType] = useState<TaskTypeValue | null>(null);

  // API data
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Task type options from batch list
  const [availableTaskTypes, setAvailableTaskTypes] = useState<string[]>([]);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("mst_profiles")
        .select("display_name, participant_code")
        .eq("auth_user_id", session.user.id)
        .single();
      setDisplayName(prof?.display_name ?? null);
      setEmail(user?.email ?? null);
      setParticipantCode(prof?.participant_code ?? null);
    }
    void init();
  }, []);

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

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  // Load available task types once from batch list
  useEffect(() => {
    async function loadTaskTypes() {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch("/api/researcher/batches", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json();
        if (j.taskTypes?.length) setAvailableTaskTypes(j.taskTypes as string[]);
      } catch {
        // non-critical — fallback to TASK_TYPE_ORDER
      }
    }
    void loadTaskTypes();
  }, [getToken]);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) { router.push("/auth/login"); return; }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (batchType) params.set("batch_type", batchType);
    if (taskType) params.set("task_type", taskType);
    const res = await fetch(`/api/researcher/analytics-summary?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Request failed" }));
      setError((j as { error?: string }).error ?? "Failed to load data.");
      setLoading(false);
      return;
    }
    setData(await res.json() as ApiData);
    setLoading(false);
  }, [getToken, router, batchType, taskType]);

  useEffect(() => { queueMicrotask(() => { void loadData(); }); }, [loadData]);

  const bssaGroupOrder = ["tag_based", "behavioral", "sequential", "semantic", "combined"];

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
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

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <ResearcherBreadcrumb current="Feature Analytics" />

        {/* Pilot Disclaimer */}
        {data && <PilotDisclaimer warning={data.data_warning} />}

        {/* ── Section 1: Dimension Filters ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          {/* Header row: icon-only filter button + title + clear */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                title="Filters"
                aria-label="Filters"
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F37021] hover:bg-orange-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L13 9.414V15a1 1 0 01-.553.894l-4 2A1 1 0 017 17v-7.586L3.293 5.707A1 1 0 013 5V3z" clipRule="evenodd" />
                </svg>
              </button>
              <div>
                <h2 className="font-semibold text-[#0F172A] text-sm">Dimension Filters</h2>
                <p className="text-[11px] text-[#64748B]">
                  Filter live activity statistics below — model comparison results are not affected.
                </p>
              </div>
            </div>
            {(batchType ?? taskType) && (
              <button
                onClick={() => { setBatchType(null); setTaskType(null); }}
                className="text-[10px] font-semibold text-[#F37021] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Single toolbar: Activity Set + Task Type side-by-side on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-y-3 gap-x-0 items-start">
            {/* Activity Set group */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide whitespace-nowrap">
                Activity Set
              </span>
              <ToggleBtn active={batchType === null} onClick={() => setBatchType(null)}>All</ToggleBtn>
              {BATCH_TYPE_OPTIONS.map(o => (
                <ToggleBtn
                  key={o.value}
                  active={batchType === o.value}
                  onClick={() => setBatchType(o.value)}
                  title={o.label}
                  aria-label={o.label}
                  compact
                >
                  <BatchTypeIcon value={o.value} className="w-3.5 h-3.5" />
                </ToggleBtn>
              ))}
            </div>

            {/* Vertical divider — desktop only */}
            <div className="hidden sm:block w-px bg-[#E2E8F0] self-stretch mx-4" />

            {/* Task Type group */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide whitespace-nowrap">
                Task Type
              </span>
              <ToggleBtn active={taskType === null} onClick={() => setTaskType(null)}>All</ToggleBtn>
              {(availableTaskTypes.length > 0
                ? [...availableTaskTypes].sort((a, b) => {
                    const ai = TASK_TYPE_ORDER.indexOf(a);
                    const bi = TASK_TYPE_ORDER.indexOf(b);
                    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                  })
                : [...TASK_TYPE_ORDER]
              ).map(t => (
                <ToggleBtn
                  key={t}
                  active={taskType === t}
                  onClick={() => setTaskType(t)}
                  title={TASK_TYPE_LABEL[t] ?? t}
                  aria-label={TASK_TYPE_LABEL[t] ?? t}
                  compact
                >
                  <TaskTypeIcon type={t} className="w-3.5 h-3.5" />
                </ToggleBtn>
              ))}
            </div>
          </div>

          {/* Active filter summary */}
          {(batchType ?? taskType) && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-[11px] text-orange-700 flex items-center justify-between flex-wrap gap-2">
              <span>
                Filtered by:{" "}
                {batchType && <strong>{BATCH_TYPE_OPTIONS.find(o => o.value === batchType)?.label ?? batchType}</strong>}
                {batchType && taskType && " × "}
                {taskType && <strong>{TASK_TYPE_LABEL[taskType] ?? taskType}</strong>}
              </span>
              <button
                onClick={() => { setBatchType(null); setTaskType(null); }}
                className="text-[10px] font-semibold text-[#F37021] hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        {/* ── Section 2: Activity Statistics (Live from Supabase) ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-[#0F172A] text-sm">Activity Statistics</h2>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">
                Live query from <code>vw_dataset_session_level</code> — grain: 1 row per session
                {(batchType ?? taskType) ? " (filtered)" : " (all)"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-[#94A3B8]">Loading...</p>
          ) : error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{error}</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Learner Count</p>
                  <p className="text-3xl font-bold text-[#0F172A] mt-1">{data.live_stats.learner_count}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-1">COUNT(DISTINCT participant_code)</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Session Count</p>
                  <p className="text-3xl font-bold text-[#0F172A] mt-1">{data.live_stats.session_count}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-1">COUNT(DISTINCT session_id)</p>
                </div>
              </div>

              {data.live_stats.learner_count === 0 && (
                <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 text-xs text-[#64748B] text-center">
                  No data found for the selected filters — try changing the filter.
                </div>
              )}

              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Live statistics may include learners outside the frozen Phase 4 pilot cohort (10 learners). Live count reflects all participants in <code>vw_dataset_session_level</code>.
              </p>

              <p className="text-[10px] text-[#94A3B8]">
                Sequence Count (90 sequences from Phase 4 pipeline) is from an offline artifact — see Pipeline Statistics below
              </p>
            </>
          ) : null}
        </section>

        {/* ── Section 3: Pipeline Statistics (Frozen artifact) ── */}
        {data && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[#0F172A] text-sm">Pipeline Statistics</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-0.5 rounded-full">
                  Frozen at NB05
                </span>
                <span className="text-[10px] text-[#94A3B8]">— not affected by dimension filters above</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <StatRow label="Total learners" value={data.pipeline_stats.total_learners} />
              <StatRow label="Thesis minimum learners" value={data.pipeline_stats.thesis_minimum_learners} />
              <StatRow label="Training learners" value={data.pipeline_stats.train_learners} />
              <StatRow label="Test learners" value={data.pipeline_stats.test_learners} />
              <StatRow label="Total sequences" value={data.pipeline_stats.total_sequences} />
              <StatRow label="Training sequences" value={data.pipeline_stats.train_sequences} />
              <StatRow label="Test sequences" value={data.pipeline_stats.test_sequences} />
              <StatRow label="Canonical events" value={data.pipeline_stats.total_canonical_events} />
              <StatRow label="Max sequence length" value={`${data.pipeline_stats.max_sequence_length} steps`} />
              <StatRow label="Sequence length percentile" value={`${data.pipeline_stats.sequence_length_percentile}th`} />
              <StatRow label="Features per timestep" value={data.pipeline_stats.features_per_timestep} />
              <StatRow label="Vocabulary size" value={data.pipeline_stats.vocab_size} />
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              ⚠ {data.pipeline_stats.total_learners} learners — below thesis minimum ({data.pipeline_stats.thesis_minimum_learners} learners). Pipeline validation scope only.
            </div>
          </section>
        )}

        {/* ── Section 4: BSSA Feature Analysis ── */}
        {data?.bssa_features && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[#0F172A] text-sm">Feature Analysis</h2>
              <p className="text-[11px] text-[#64748B] mt-1">
                BSSA is a Feature Framework (grouping of feature sets), not an analysis dimension.
                Source: <code className="text-[10px]">comparison_manifest_v1.json</code>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {bssaGroupOrder.map(key => {
                const group = data.bssa_features.groups[key];
                if (!group) return null;
                return <BssaGroupCard key={key} groupKey={key} group={group} />;
              })}
            </div>
          </section>
        )}

        {/* ── Section 5: 2C3L Assessment ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <div>
            <h2 className="font-semibold text-[#0F172A] text-sm">Assessment Rubric</h2>
            <p className="text-[11px] text-[#64748B] mt-1">
              Assessment Rubric is an evaluation criterion (learner evaluation criteria), not an analysis dimension, not a BSSA feature, and not an analytical model
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Current Status: Pilot Only — Not Yet Validated</p>
            <p>Insufficient teacher-reviewed or expert-validated assessment results for reporting</p>
            <p className="pt-1 border-t border-amber-200 text-[11px] font-mono">
              Current pilot labels: <code className="bg-amber-100 border border-amber-200 px-1 rounded">at_risk = NOT any_correct</code> (behavioral proxy).
              The 2C3L threshold of 65/100 requires teacher-reviewed scores and is not applied in Phase 4.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <C2L3ComponentCard
              code="C1"
              description="Correctness — accuracy of task output (e.g. whether a SQL query returns the correct result)"
            />
            <C2L3ComponentCard
              code="C2"
              description="Clarity — clarity and appropriateness of the solution approach"
            />
            <C2L3ComponentCard
              code="L1"
              description="Logic — soundness of reasoning and step-by-step problem-solving process"
            />
            <C2L3ComponentCard
              code="L2"
              description="Learning Process — learning behaviors such as revision, retry, and hint usage"
            />
            <C2L3ComponentCard
              code="L3"
              description="Level of Mastery — overall mastery level assessed from the full rubric"
            />
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide">Prerequisites for Displaying Assessment Rubric Results</p>
            <ul className="text-[11px] text-[#64748B] space-y-1">
              <li>• teacher-reviewed or expert-validated labels are available</li>
              <li>• at least 60 learners (thesis minimum)</li>
              <li>• passed the validation protocol defined in the research contract</li>
            </ul>
          </div>
        </section>

        {/* ── Pipeline Validation Gate ── */}
        {data && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
            <h2 className="font-semibold text-[#0F172A] text-sm">Pipeline Validation Gate</h2>

            {/* Structural checks — green when all pass */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                Structural Checks — {data.validation.checks_passed}/{data.validation.checks_run} passed
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <CheckBadge ok={data.validation.checks_passed === data.validation.checks_run}
                  label={`All ${data.validation.checks_run} structural checks passed`} />
                <CheckBadge ok={data.validation.no_learner_overlap} label="No learner overlap (train/test)" />
                <CheckBadge ok={data.validation.no_pii_in_exports} label="No PII in pipeline exports" />
                <CheckBadge ok={data.validation.split_integrity_passed} label="Split integrity passed" />
              </div>
            </div>

            {/* Feature-level circularity — always amber when proxy_target_circularity is true */}
            {data.proxy_target_circularity && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 text-base mt-0.5">⚠</span>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-800">
                      Feature-Level Circularity: PRESENT (by design)
                    </p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Behavioral features <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">any_correct</code> and{" "}
                      <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">correctness_ratio</code> were used as predictors
                      AND to construct the proxy label <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">at_risk = NOT any_correct</code>.
                      Sequential feature <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">attempt_is_correct</code> creates an equivalent
                      circularity for LSTM and GRU.
                    </p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      All non-Dummy 1.0 metric results are artifacts of this circularity.
                      This is a documented property of the Phase 4 pilot dataset, not a pipeline failure.
                      Confirmatory analysis is prohibited.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
