"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotebooksReady { nb10: boolean; nb11: boolean; nb12: boolean }

interface ComplexityStats {
  total_rows: number;
  unique_learners: number;
  unique_tasks: number;
  complexity_score_mean: number;
  complexity_score_min: number;
  complexity_score_max: number;
  avg_attempt_count: number;
  has_error_pct: number;
  missing_session_rows?: number;
}

interface ClusterStats {
  total_attempt_rows: number;
  error_rows: number;
  n_clusters_actual: number;
  silhouette_score: number | null;
  top_terms_per_cluster: Record<string, string[]>;
  summary_rows: number;
}

interface EmbeddingStats {
  n_learner_task_rows: number;
  n_features_input: number;
  n_components_actual: number;
  cumulative_var_pct: number;
  top3_var_pct: number[];
  within_task_similarity: Record<string, number>;
}

interface SemanticPayload {
  status: "ready" | "partial" | "unavailable";
  notebooks_ready: NotebooksReady;
  complexity: { schema_version: string; dataset_stats: ComplexityStats; created_at_utc: string; parameters: Record<string, unknown> } | null;
  clustering: { schema_version: string; dataset_stats: ClusterStats;   created_at_utc: string; parameters: Record<string, unknown> } | null;
  embeddings: { schema_version: string; dataset_stats: EmbeddingStats; created_at_utc: string; parameters: Record<string, unknown> } | null;
  generated_at: string | null;
  label_validity_note: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt2(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toFixed(2);
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(1)} %`;
}
function fmtInt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function NbBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
        ready
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-slate-50 text-slate-400 border-slate-200"
      }`}
    >
      <span aria-hidden="true">{ready ? "✓" : "○"}</span> {label}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#FFF7ED] rounded-xl border border-[#FED7AA] px-4 py-3 space-y-0.5">
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-xl font-bold text-[#0F172A]">{value}</p>
      {sub && <p className="text-[11px] text-[#64748B]">{sub}</p>}
    </div>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    pct >= 65 ? "bg-emerald-500" :
    pct >= 45 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-[#64748B] w-12 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SemanticAnalysisPage() {
  const router          = useRouter();
  const profileRef      = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [displayName, setDisplayName]   = useState<string | null>(null);
  const [email, setEmail]               = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading]   = useState(true);
  const [data, setData]                 = useState<SemanticPayload | null>(null);
  const [dataError, setDataError]       = useState<string | null>(null);

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
      setAuthLoading(false);

      // Fetch semantic analysis data
      const res = await fetch("/api/researcher/semantic-analysis", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (res.ok) {
        const json = await res.json() as SemanticPayload;
        setData(json);
      } else {
        setDataError("Could not load semantic analysis data.");
      }
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading…
      </div>
    );
  }

  const nb = data?.notebooks_ready ?? { nb10: false, nb11: false, nb12: false };
  const isReady    = data?.status === "ready";
  const isPartial  = data?.status === "partial";
  const readyCount = [nb.nb10, nb.nb11, nb.nb12].filter(Boolean).length;

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

        {/* Title + status badges */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">Semantic Analysis</h1>
            <p className="text-sm text-[#64748B]">
              Behavioral proxy features (NB10–NB12): attempt complexity, error clustering,
              and solution embeddings derived from attempt metadata.
            </p>
          </div>
          <div className="shrink-0 flex flex-wrap gap-1.5 items-center">
            <NbBadge label="NB10 Complexity"  ready={nb.nb10} />
            <NbBadge label="NB11 Clustering"  ready={nb.nb11} />
            <NbBadge label="NB12 Embeddings"  ready={nb.nb12} />
          </div>
        </div>

        {/* Status banner */}
        {dataError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
            ⚠ {dataError}
          </div>
        ) : !isReady && !isPartial ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 space-y-2">
            <p className="text-sm font-bold text-amber-700 flex items-center gap-2">
              <span aria-hidden="true">⚠</span> Awaiting Phase 5 E notebook runs (NB10–NB12)
            </p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Run the E2E pipeline to generate semantic feature artifacts:{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">
                python run_e2e_notebooks.py
              </code>
            </p>
          </div>
        ) : isPartial ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-6 py-4 text-sm text-sky-700">
            <span className="font-bold">Partial data</span> — {readyCount}/3 notebooks have artifacts.
            Run the full E2E pipeline to complete all three.
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-700 flex items-center gap-2">
            <span aria-hidden="true">✓</span>
            <span>All 3 notebooks have artifacts.
              {data?.generated_at && (
                <> Generated {new Date(data.generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.</>
              )}
            </span>
          </div>
        )}

        {/* Research constraint */}
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 flex flex-wrap gap-3 items-center text-xs text-[#64748B]">
          <span className="font-semibold text-[#0F172A]">Research Constraints:</span>
          <span className="font-mono bg-slate-100 px-1.5 rounded">label_validity=pilot_only</span>
          <span className="font-mono bg-slate-100 px-1.5 rounded">proxy_behavioral=true</span>
          <span className="font-mono bg-slate-100 px-1.5 rounded">sklearn/scipy only</span>
          <span className="font-mono bg-slate-100 px-1.5 rounded">no_sql_text</span>
        </div>

        {/* ── NB10: Complexity Features ─────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F1F5F9]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${nb.nb10 ? "bg-emerald-500" : "bg-slate-300"}`} />
            <span className="text-sm font-bold text-[#0F172A]">NB10 — Attempt Complexity Features</span>
            {nb.nb10 && data?.complexity && (
              <span className="ml-auto text-[10px] font-mono text-slate-400">
                {data.complexity.schema_version}
              </span>
            )}
          </div>

          <div className="px-6 py-5 space-y-4">
            {nb.nb10 && data?.complexity ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Learner×Task rows"   value={fmtInt(data.complexity.dataset_stats.total_rows)} />
                  <StatCard label="Unique learners"      value={fmtInt(data.complexity.dataset_stats.unique_learners)} />
                  <StatCard label="Unique tasks"         value={fmtInt(data.complexity.dataset_stats.unique_tasks)} />
                  <StatCard label="Has-error rate"       value={fmtPct(data.complexity.dataset_stats.has_error_pct)} />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#64748B]">Complexity Score (0–100)</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Mean", v: data.complexity.dataset_stats.complexity_score_mean },
                      { label: "Min",  v: data.complexity.dataset_stats.complexity_score_min },
                      { label: "Max",  v: data.complexity.dataset_stats.complexity_score_max },
                    ].map(({ label, v }) => (
                      <div key={label} className="grid grid-cols-[5rem_1fr] items-center gap-3">
                        <span className="text-xs text-[#64748B]">{label}</span>
                        <ScoreBar value={v} max={100} />
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-[#94A3B8]">
                  Avg attempt count: <strong>{fmt2(data.complexity.dataset_stats.avg_attempt_count)}</strong>
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400 italic">
                Awaiting NB10 run — no <code>sql_complexity_v1.parquet</code> found.
              </p>
            )}
          </div>
        </section>

        {/* ── NB11: Error Clustering ────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F1F5F9]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${nb.nb11 ? "bg-rose-500" : "bg-slate-300"}`} />
            <span className="text-sm font-bold text-[#0F172A]">NB11 — Error Semantic Clustering</span>
            {nb.nb11 && data?.clustering && (
              <span className="ml-auto text-[10px] font-mono text-slate-400">
                {data.clustering.schema_version}
              </span>
            )}
          </div>

          <div className="px-6 py-5 space-y-4">
            {nb.nb11 && data?.clustering ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Total attempts"  value={fmtInt(data.clustering.dataset_stats.total_attempt_rows)} />
                  <StatCard label="Error rows"      value={fmtInt(data.clustering.dataset_stats.error_rows)} />
                  <StatCard label="Clusters (k)"    value={String(data.clustering.dataset_stats.n_clusters_actual ?? "—")} />
                  <StatCard
                    label="Silhouette score"
                    value={
                      data.clustering.dataset_stats.silhouette_score != null
                        ? fmt2(data.clustering.dataset_stats.silhouette_score as number)
                        : "—"
                    }
                  />
                </div>

                {/* Top terms per cluster */}
                {data.clustering.dataset_stats.top_terms_per_cluster &&
                  Object.keys(data.clustering.dataset_stats.top_terms_per_cluster).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#64748B]">Top terms per cluster</p>
                    <div className="divide-y divide-[#F8FAFC]">
                      {Object.entries(
                        data.clustering.dataset_stats.top_terms_per_cluster as Record<string, string[]>
                      ).map(([cid, terms]) => (
                        <div key={cid} className="flex items-start gap-3 py-1.5">
                          <span className="font-mono text-[10px] bg-rose-50 border border-rose-200 text-rose-700 px-1.5 py-0.5 rounded shrink-0">
                            C{cid}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {terms.map((t) => (
                              <span key={t} className="font-mono text-[10px] bg-[#F1F5F9] px-1.5 rounded text-[#475569]">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400 italic">
                Awaiting NB11 run — no <code>error_clusters_v1.parquet</code> found.
              </p>
            )}
          </div>
        </section>

        {/* ── NB12: Solution Embeddings ─────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F1F5F9]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${nb.nb12 ? "bg-sky-500" : "bg-slate-300"}`} />
            <span className="text-sm font-bold text-[#0F172A]">NB12 — Solution Progression Embeddings</span>
            {nb.nb12 && data?.embeddings && (
              <span className="ml-auto text-[10px] font-mono text-slate-400">
                {data.embeddings.schema_version}
              </span>
            )}
          </div>

          <div className="px-6 py-5 space-y-4">
            {nb.nb12 && data?.embeddings ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Learner×Task rows"    value={fmtInt(data.embeddings.dataset_stats.n_learner_task_rows)} />
                  <StatCard label="Input features"       value={fmtInt(data.embeddings.dataset_stats.n_features_input)} />
                  <StatCard label="SVD components"       value={String(data.embeddings.dataset_stats.n_components_actual)} />
                  <StatCard
                    label="Cumulative variance"
                    value={fmtPct(data.embeddings.dataset_stats.cumulative_var_pct)}
                    sub="TruncatedSVD(32)"
                  />
                </div>

                {/* Top-3 component variance */}
                {Array.isArray(data.embeddings.dataset_stats.top3_var_pct) && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-[#64748B]">Top-3 component variance (%)</p>
                    {(data.embeddings.dataset_stats.top3_var_pct as number[]).map((v, i) => (
                      <div key={i} className="grid grid-cols-[5rem_1fr] items-center gap-3">
                        <span className="text-xs text-[#64748B]">Component {i + 1}</span>
                        <ScoreBar value={v} max={100} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Within-task similarity */}
                {data.embeddings.dataset_stats.within_task_similarity &&
                  Object.keys(data.embeddings.dataset_stats.within_task_similarity).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#64748B]">Within-task cosine similarity</p>
                    <div className="divide-y divide-[#F8FAFC]">
                      {Object.entries(
                        data.embeddings.dataset_stats.within_task_similarity as Record<string, number>
                      ).map(([taskId, sim]) => (
                        <div key={taskId} className="grid grid-cols-[8rem_1fr] items-center gap-3 py-1">
                          <span className="text-xs font-mono text-[#64748B]">Task {taskId}</span>
                          <ScoreBar value={sim * 100} max={100} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400 italic">
                Awaiting NB12 run — no <code>solution_embeddings_v1.npz</code> found.
              </p>
            )}
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Semantic analysis v1.0 · Behavioral proxies only (no SQL text) ·{" "}
          {data?.label_validity_note ?? "label_validity=pilot_only"}
        </p>
      </main>
    </div>
  );
}
