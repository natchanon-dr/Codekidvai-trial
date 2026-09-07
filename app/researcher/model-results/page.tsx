"use client";

// ---------------------------------------------------------------------------
// Model Results — Phase 4 pilot model comparison: Dummy, LR, RF, TAG-LR,
// LSTM, GRU (per the Researcher dashboard card description).
//
// M5.31A fix: this page previously called `/api/researcher/sequential-analysis`
// (a copy-pasted leftover from the Sequential Analysis page) and rendered a
// dataset/run browser instead of a model-comparison table. It now calls its
// own dedicated route, `/api/researcher/model-results`, and renders exactly
// what that route returns — the frozen Phase 4 model-comparison table, seed
// stability, and validation checks. No new models (SVM/XGBoost/BSSA) are
// listed here yet since none have been trained — showing them would violate
// the "do not fabricate results for models that have not yet been trained"
// rule. This page will grow to the target 8-model architecture only as each
// model is actually built (see M5.31E/F/I/K).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

// ---------------------------------------------------------------------------
// Types — mirrors app/api/researcher/model-results/route.ts's response
// ---------------------------------------------------------------------------

type ModelEntry = {
  name: string;
  accuracy: number;
  f1: number;
  roc_auc: number;
  pr_auc: number;
  train_time_sec: number;
  parameters: number | null;
  type: string;
};

type ModelComparison = {
  primary_seed: number;
  all_seeds: number[];
  test_sequences: number;
  timing_note: string;
  test_class_distribution: { positive: number; negative: number };
  models: ModelEntry[];
};

type SeedStabilityExp = { accuracy_mean: number; f1_mean: number; roc_auc_mean: number };
type SeedStabilityModel = { exp_a_seq_only: SeedStabilityExp; exp_b_seq_plus_tag: SeedStabilityExp };

type Validation = {
  checks_run: number;
  checks_passed: number;
};

type Chart = { key: string; title: string; path: string };

type Payload = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
  model_comparison: ModelComparison;
  seed_stability: { lstm: SeedStabilityModel; gru: SeedStabilityModel };
  validation: Validation;
  charts: Chart[];
};

// ---------------------------------------------------------------------------
// Target 8-model architecture — shows every model your revised methodology
// calls for, honestly marked "not yet run" when no artifact exists for it.
// Do NOT fill these in with invented numbers — only wire a real value once
// a model has actually been trained and an artifact/route produces it.
// ---------------------------------------------------------------------------

const TARGET_MODEL_ORDER = [
  "Dummy", "Logistic Regression", "Random Forest", "TAG-based LR", "LSTM", "GRU",
  "SVM", "XGBoost", "BSSA (Integrated)", "Traditional Auto Grading",
];

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function ModelRow({ model }: { model: ModelEntry | null }) {
  if (!model) return null;
  const circular = model.type !== "baseline" && model.accuracy === 1 && model.f1 === 1;
  return (
    <tr className="border-b border-[#F1F5F9]">
      <td className="px-3 py-2 font-semibold text-[#0F172A]">{model.name}</td>
      <td className="px-3 py-2 text-[10px] text-[#94A3B8]">{model.type}</td>
      <td className={`px-3 py-2 text-right ${circular ? "text-red-600" : "text-[#0F172A]"}`}>{pct(model.accuracy)}</td>
      <td className={`px-3 py-2 text-right ${circular ? "text-red-600" : "text-[#0F172A]"}`}>{pct(model.f1)}</td>
      <td className={`px-3 py-2 text-right ${circular ? "text-red-600" : "text-[#0F172A]"}`}>{pct(model.roc_auc)}</td>
      <td className="px-3 py-2 text-right text-[#64748B]">{model.parameters ?? "—"}</td>
    </tr>
  );
}

function NotYetRunRow({ name }: { name: string }) {
  return (
    <tr className="border-b border-[#F1F5F9] bg-[#FAFAFA]">
      <td className="px-3 py-2 font-semibold text-[#94A3B8]">{name}</td>
      <td colSpan={5} className="px-3 py-2 text-[11px] text-[#94A3B8] italic">Not yet run — no trained model artifact exists.</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ModelResultsPage() {
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
        const res = await fetch("/api/researcher/model-results", {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "Request failed" }));
          setFetchError((j as { error?: string }).error ?? "Failed to load model results.");
        } else {
          setData(await res.json() as Payload);
        }
      } catch {
        setFetchError("Failed to load model results.");
      }
      setLoading(false);
    }
    void init();
  }, [router]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading...
      </div>
    );
  }

  const modelsByName = new Map((data?.model_comparison.models ?? []).map((m) => [m.name, m]));

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
        <ResearcherBreadcrumb current="Model Results" />

        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Model Results</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Phase 4 pilot model comparison — pipeline validation only, not thesis conclusions.
          </p>
        </div>

        {data && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {data.data_warning}
          </div>
        )}

        {fetchError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center">
            <p className="text-sm text-red-700 font-semibold">{fetchError}</p>
          </div>
        )}

        {data && (
          <>
            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3 overflow-x-auto">
              <p className="text-sm font-bold text-[#0F172A]">
                Model Comparison (seed {data.model_comparison.primary_seed}, {data.model_comparison.test_sequences} test sequences)
              </p>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                Non-baseline models scoring 100% below reflect label circularity (proxy_target_circularity=true) on this
                pilot-scale dataset — a pipeline integrity check only, not a research finding.
              </div>
              <table className="w-full text-[11px]">
                <thead className="bg-[#FFF7ED] text-[#94A3B8] uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Model</th>
                    <th className="text-left px-3 py-2 font-semibold">Type</th>
                    <th className="text-right px-3 py-2 font-semibold">Accuracy</th>
                    <th className="text-right px-3 py-2 font-semibold">F1</th>
                    <th className="text-right px-3 py-2 font-semibold">ROC-AUC</th>
                    <th className="text-right px-3 py-2 font-semibold">Params</th>
                  </tr>
                </thead>
                <tbody>
                  {TARGET_MODEL_ORDER.map((name) => {
                    const model = modelsByName.get(name) ?? null;
                    return model
                      ? <ModelRow key={name} model={model} />
                      : <NotYetRunRow key={name} name={name} />;
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-[#94A3B8]">{data.model_comparison.timing_note}</p>
            </section>

            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3">
              <p className="text-sm font-bold text-[#0F172A]">
                Seed Stability (LSTM / GRU, seeds {data.model_comparison.all_seeds.join(", ")})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {(["lstm", "gru"] as const).map((key) => {
                  const s = data.seed_stability[key];
                  return (
                    <div key={key} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                      <p className="font-bold text-[#0F172A] uppercase">{key}</p>
                      <p>EXP-A (Sequence only): acc={pct(s.exp_a_seq_only.accuracy_mean)}, f1={pct(s.exp_a_seq_only.f1_mean)}, ROC-AUC={pct(s.exp_a_seq_only.roc_auc_mean)}</p>
                      <p>EXP-B (Sequence + TAG*): acc={pct(s.exp_b_seq_plus_tag.accuracy_mean)}, f1={pct(s.exp_b_seq_plus_tag.f1_mean)}, ROC-AUC={pct(s.exp_b_seq_plus_tag.roc_auc_mean)}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#94A3B8]">*TAG here = Temporal Assessment Graph (graph-structural features), not Traditional Auto Grading.</p>
            </section>

            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3">
              <p className="text-sm font-bold text-[#0F172A]">
                Validation — {data.validation.checks_passed} / {data.validation.checks_run} checks passed
              </p>
            </section>

            {data.charts.length > 0 && (
              <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
                <p className="text-sm font-bold text-[#0F172A]">Charts</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.charts.map((c) => (
                    <div key={c.key} className="space-y-1">
                      <p className="text-xs font-semibold text-[#64748B]">{c.title}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.path} alt={c.title} className="w-full rounded-lg border border-[#E2E8F0]" />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
