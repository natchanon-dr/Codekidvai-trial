"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelRow {
  name: string;
  feature_set: string;
  accuracy: number | null;
  f1: number | null;
  roc_auc: number | null;
  pr_auc: number | null;
  train_time_s: number | null;
  parameters: number | null;
  label_validity: string;
}

interface SummaryPayload {
  generated_at: string;
  label_validity: string;
  data_warning: string;
  dataset: {
    total_learners: number | null;
    train_learners: number | null;
    test_learners: number | null;
    train_sequences: number | null;
    test_sequences: number | null;
    canonical_events: number | null;
    max_seq_len: number | null;
    seq_len_percentile: number | null;
    n_features: number | null;
    random_state: number | null;
    test_size: number | null;
    dedup_window_sec: number | null;
    split_method: string;
    test_positive: number | null;
    test_negative: number | null;
    schema_version: string | null;
    created_at_utc: string | null;
  } | null;
  model_comparison: {
    test_sequences: number | null;
    primary_seed: number;
    all_seeds: number[];
    validation_checks: number | null;
    validation_passed: number | null;
    created_at_utc: string | null;
    models: ModelRow[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number | null): string {
  if (v == null) return "—";
  return (v * 100).toFixed(1) + "%";
}

function fmt3(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(3);
}

function fmtTime(s: number | null): string {
  if (s == null) return "—";
  if (s < 0.01) return "<0.01 s";
  return s.toFixed(3) + " s";
}

function fmtParams(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

/** Pick highlight class: best gets emerald, second-best gets sky */
function rankClass(vals: (number | null)[], myVal: number | null, ascending = false): string {
  if (myVal == null) return "";
  const sorted = [...vals].filter((v): v is number => v != null).sort((a, b) => ascending ? a - b : b - a);
  if (sorted[0] === myVal) return "font-bold text-emerald-700";
  if (sorted[1] === myVal) return "font-semibold text-sky-700";
  return "";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportSummaryPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Auth + fetch
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

      // Fetch summary
      try {
        const res = await fetch("/api/researcher/research-summary");
        if (res.status === 404) {
          setFetchError("Pipeline artifacts not found. Run the mock pipeline first.");
        } else if (!res.ok) {
          setFetchError(`API error ${res.status}`);
        } else {
          setData(await res.json() as SummaryPayload);
        }
      } catch {
        setFetchError("Failed to load summary data.");
      }

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

  // Model comparison helpers — only used after data is loaded
  const models = data?.model_comparison.models ?? [];
  const aucVals    = models.map(m => m.roc_auc);
  const prAucVals  = models.map(m => m.pr_auc);
  const f1Vals     = models.map(m => m.f1);
  const accVals    = models.map(m => m.accuracy);

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

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <ResearcherBreadcrumb current="Research Summary" />

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#0F172A]">Research Summary</h1>
          <p className="text-sm text-[#64748B]">
            Pipeline validation results — dataset characteristics and 6-model comparison.
            Not thesis conclusions.
          </p>
        </div>

        {/* Validity banner */}
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 space-y-2">
          <p className="text-sm font-bold text-red-700 flex items-center gap-2">
            <span aria-hidden="true">⚠</span> Research Validity Constraints
          </p>
          <p className="text-xs text-red-600 leading-relaxed">
            All metrics below use <strong>proxy_behavioral labels (label_validity=pilot_only)</strong>.
            The label target is derived from the same behavioral data used as features
            (<code className="text-[10px] bg-red-100 px-1 rounded">proxy_target_circularity=true</code>).
            <strong> No confirmatory hypothesis testing is permitted</strong> until teacher-reviewed
            labels are available. Results are reported solely for pipeline integrity verification.
          </p>
        </div>

        {/* Error state */}
        {fetchError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center">
            <p className="text-sm text-amber-700 font-semibold mb-1">Data Unavailable</p>
            <p className="text-xs text-amber-600">{fetchError}</p>
          </div>
        )}

        {data && (
          <>
            {/* ── Table 1: Dataset ─────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#FED7AA] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0F172A]">Table 1 — Dataset Characteristics</h2>
                <span className="text-[10px] font-mono bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                  pilot_only
                </span>
              </div>

              {data.dataset ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#F1F5F9]">
                  {([
                    ["Total learners",      data.dataset.total_learners],
                    ["Train learners",      data.dataset.train_learners],
                    ["Test learners",       data.dataset.test_learners],
                    ["Train sequences",     data.dataset.train_sequences],
                    ["Test sequences",      data.dataset.test_sequences],
                    ["Canonical event types", data.dataset.canonical_events],
                    ["Max seq len",         data.dataset.max_seq_len  != null ? `${data.dataset.max_seq_len} (${data.dataset.seq_len_percentile}th pct)` : "—"],
                    ["Feature dimensions",  data.dataset.n_features],
                    ["Dedup window",        data.dataset.dedup_window_sec != null ? `${data.dataset.dedup_window_sec} s` : "—"],
                    ["Test split",          data.dataset.test_size != null ? pct(data.dataset.test_size) : "—"],
                    ["Split method",        data.dataset.split_method],
                    ["Random state",        data.dataset.random_state],
                    ["Test positives",      data.dataset.test_positive],
                    ["Test negatives",      data.dataset.test_negative],
                    ["Schema version",      data.dataset.schema_version],
                    ["Created (UTC)",       data.dataset.created_at_utc ? new Date(data.dataset.created_at_utc).toLocaleString() : "—"],
                  ] as [string, string | number | null][]).map(([label, val]) => (
                    <div key={label} className="bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">
                        {label}
                      </p>
                      <p className="text-sm font-semibold text-[#0F172A] tabular-nums">
                        {val ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-5 text-center text-xs text-[#94A3B8]">
                  sequence_manifest_v1.json not found — run mock pipeline to generate.
                </div>
              )}
            </section>

            {/* ── Table 2: Model Comparison ─────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#FED7AA] flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A]">Table 2 — Model Comparison</h2>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {models.length} models ·{" "}
                    {data.model_comparison.test_sequences != null
                      ? `${data.model_comparison.test_sequences} test sequences`
                      : "test seq count n/a"}{" "}
                    · seed {data.model_comparison.primary_seed} (all: {data.model_comparison.all_seeds?.join(", ")})
                  </p>
                </div>
                {data.model_comparison.validation_checks != null && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                    ✓ {data.model_comparison.validation_passed}/{data.model_comparison.validation_checks} checks passed
                  </span>
                )}
              </div>

              {/* Legend */}
              <div className="px-6 py-2 border-b border-[#F1F5F9] flex gap-4 text-[10px] text-[#64748B]">
                <span><strong className="text-emerald-700">Bold green</strong> = best</span>
                <span><strong className="text-sky-700">Blue</strong> = 2nd best</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC] border-b border-[#F1F5F9]">
                    <tr>
                      {["Model", "Feature Set", "Acc", "F1", "ROC-AUC", "PR-AUC", "Params", "Train Time"].map(col => (
                        <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {models.map((m, i) => {
                      const isDummy = m.name === "Dummy";
                      return (
                        <tr key={i} className={`hover:bg-[#FFF7ED] transition-colors ${isDummy ? "opacity-60" : ""}`}>
                          <td className="px-4 py-2.5 font-semibold text-[#0F172A] whitespace-nowrap">
                            {m.name}
                            {isDummy && (
                              <span className="ml-1.5 text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">
                                baseline
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[#64748B] text-[11px]">
                            {m.feature_set}
                          </td>
                          <td className={`px-4 py-2.5 tabular-nums ${rankClass(accVals, m.accuracy)}`}>
                            {pct(m.accuracy)}
                          </td>
                          <td className={`px-4 py-2.5 tabular-nums ${rankClass(f1Vals, m.f1)}`}>
                            {fmt3(m.f1)}
                          </td>
                          <td className={`px-4 py-2.5 tabular-nums ${rankClass(aucVals, m.roc_auc)}`}>
                            {fmt3(m.roc_auc)}
                          </td>
                          <td className={`px-4 py-2.5 tabular-nums ${rankClass(prAucVals, m.pr_auc)}`}>
                            {fmt3(m.pr_auc)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-[#475569]">
                            {fmtParams(m.parameters)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-[#475569]">
                            {fmtTime(m.train_time_s)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer note */}
              <div className="px-6 py-3 border-t border-[#F1F5F9]">
                <p className="text-[10px] text-[#94A3B8]">
                  All models: label_source=proxy_behavioral · label_validity=pilot_only ·
                  proxy_target_circularity=true · Not thesis conclusions.
                  {data.model_comparison.created_at_utc && (
                    <> · Generated {new Date(data.model_comparison.created_at_utc).toLocaleString()}</>
                  )}
                </p>
              </div>
            </section>

            {/* ── Pipeline metadata ─────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-3">
              <h2 className="text-sm font-bold text-[#0F172A]">Pipeline Metadata</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ["Evaluation purpose", "technical_pipeline_validation"],
                  ["Confirmatory allowed", "false"],
                  ["Label validity",      "pilot_only"],
                  ["Generated at (UTC)",  new Date(data.generated_at).toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">{k}</p>
                    <p className="text-xs text-[#0F172A] font-mono break-all">{v}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-[#94A3B8] pb-4">
          Read-only · Pipeline validation only · Research integrity enforced by platform
        </p>
      </main>
    </div>
  );
}
