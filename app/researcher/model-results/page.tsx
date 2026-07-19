"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

type ModelRow = {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  train_time_sec: number;
  inference_time_per_seq_sec: number;
  parameters: number | null;
  type: string;
};

type SeedRow = { seed: number; accuracy: number; f1: number; roc_auc: number };
type ExpResult = {
  accuracy_mean: number;
  f1_mean: number;
  roc_auc_mean: number;
  train_time_sec_mean: number;
  epochs_trained_mean: number;
  seeds: SeedRow[];
};

type ChartItem = { key: string; title: string; path: string };

type ApiData = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
  model_comparison: {
    primary_seed: number;
    test_sequences: number;
    timing_note: string;
    models: ModelRow[];
  };
  seed_stability: {
    lstm: { exp_a_seq_only: ExpResult; exp_b_seq_plus_tag: ExpResult };
    gru: { exp_a_seq_only: ExpResult; exp_b_seq_plus_tag: ExpResult };
  };
  validation: { checks_run: number; checks_passed: number };
  charts: ChartItem[];
};

function fmt(n: number, d = 4) { return n.toFixed(d); }
function fmtMs(sec: number) {
  if (sec < 0.001) return `${(sec * 1_000_000).toFixed(1)} µs`;
  if (sec < 1) return `${(sec * 1000).toFixed(1)} ms`;
  return `${sec.toFixed(2)} s`;
}

function PilotDisclaimer({ warning }: { warning: string }) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-red-500 text-xl mt-0.5">⚠</span>
        <div>
          <p className="font-bold text-red-700 text-sm">Technical Pipeline Validation Only</p>
          <p className="text-red-600 text-xs mt-1 leading-relaxed">
            These outputs use <code className="bg-red-100 px-1 rounded">proxy_behavioral</code> labels derived from the attempt stream.
            Proxy-target circularity is present. Results are pilot-only and must not be interpreted as
            research findings, model superiority, H5 confirmation, effect size, or generalizable performance.
          </p>
          <p className="text-red-500 text-xs mt-2 italic">{warning}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono bg-red-100 rounded-lg p-3">
        <span className="text-red-700">evaluation_purpose</span><span className="text-red-900">= technical_pipeline_validation</span>
        <span className="text-red-700">label_source</span><span className="text-red-900">= proxy_behavioral</span>
        <span className="text-red-700">label_validity</span><span className="text-red-900">= pilot_only</span>
        <span className="text-red-700">proxy_target_circularity</span><span className="text-red-900">= true</span>
        <span className="text-red-700">confirmatory_analysis_allowed</span><span className="text-red-900">= false</span>
      </div>
    </div>
  );
}

function SeedTable({ exp, label }: { exp: ExpResult; label: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#64748B] mb-1">{label}</p>
      <div className="text-xs text-[#64748B] mb-2">
        Mean — Acc: <strong>{fmt(exp.accuracy_mean, 2)}</strong> &nbsp;
        F1: <strong>{fmt(exp.f1_mean, 2)}</strong> &nbsp;
        AUC: <strong>{fmt(exp.roc_auc_mean, 2)}</strong> &nbsp;
        Train: <strong>{fmtMs(exp.train_time_sec_mean)}</strong>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#F1F5F9] text-[#475569]">
            <th className="text-left px-3 py-1.5 rounded-tl">Seed</th>
            <th className="text-right px-3 py-1.5">Accuracy</th>
            <th className="text-right px-3 py-1.5">F1</th>
            <th className="text-right px-3 py-1.5 rounded-tr">ROC-AUC</th>
          </tr>
        </thead>
        <tbody>
          {exp.seeds.map((s) => (
            <tr key={s.seed} className={`border-b border-[#F1F5F9] ${s.accuracy < 1 ? "bg-amber-50" : ""}`}>
              <td className="px-3 py-1.5 font-mono">{s.seed}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(s.accuracy, 2)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(s.f1, 2)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(s.roc_auc, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModelResultsPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      const res = await fetch("/api/researcher/model-results", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setError("Unauthorized or unavailable."); return; }
      setData(await res.json());
    }
    load();
  }, [router]);

  if (error) return (
    <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading...</div>
  );

  const { model_comparison: mc, seed_stability: ss } = data;

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">Model Results</p>
          <p className="text-xs text-[#64748B]">Phase 4 Pilot — Sequential Learning Analytics</p>
        </div>
        <Link href="/researcher/dashboard" className="text-xs text-[#F37021] hover:underline">← Dashboard</Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        <PilotDisclaimer warning={data.data_warning} />

        {/* Primary comparison table */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FED7AA]">
            <h2 className="font-semibold text-[#0F172A] text-sm">Primary Comparison — Seed {mc.primary_seed} ({mc.test_sequences} test sequences)</h2>
            <p className="text-xs text-[#64748B] mt-0.5">{mc.timing_note}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#475569] border-b border-[#E2E8F0]">
                  <th className="text-left px-4 py-2.5">Model</th>
                  <th className="text-right px-4 py-2.5">Accuracy</th>
                  <th className="text-right px-4 py-2.5">Precision</th>
                  <th className="text-right px-4 py-2.5">Recall</th>
                  <th className="text-right px-4 py-2.5">F1</th>
                  <th className="text-right px-4 py-2.5">ROC-AUC</th>
                  <th className="text-right px-4 py-2.5">Train</th>
                  <th className="text-right px-4 py-2.5">Infer/seq</th>
                  <th className="text-right px-4 py-2.5">Params</th>
                </tr>
              </thead>
              <tbody>
                {mc.models.map((m) => (
                  <tr key={m.name} className="border-b border-[#F1F5F9] hover:bg-[#FAFAFA]">
                    <td className="px-4 py-2.5 font-medium text-[#0F172A]">
                      {m.name}
                      {m.type === "baseline" && <span className="ml-1.5 text-[10px] text-[#94A3B8] font-normal">(baseline)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmt(m.accuracy)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmt(m.precision)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmt(m.recall)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmt(m.f1)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmt(m.roc_auc)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtMs(m.train_time_sec)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtMs(m.inference_time_per_seq_sec)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{m.parameters ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Seed stability */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5 space-y-6">
          <h2 className="font-semibold text-[#0F172A] text-sm">Seed Stability (Seeds 11 / 22 / 33 / 42 / 55)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
              <p className="text-xs font-bold text-[#F37021]">LSTM</p>
              <SeedTable exp={ss.lstm.exp_a_seq_only}    label="EXP-A — Sequence only" />
              <SeedTable exp={ss.lstm.exp_b_seq_plus_tag} label="EXP-B — Sequence + TAG features" />
            </div>
            <div className="space-y-5">
              <p className="text-xs font-bold text-[#F37021]">GRU</p>
              <SeedTable exp={ss.gru.exp_a_seq_only}    label="EXP-A — Sequence only" />
              <SeedTable exp={ss.gru.exp_b_seq_plus_tag} label="EXP-B — Sequence + TAG features" />
            </div>
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            ⚠ Seed 11 degrades in EXP-B for both LSTM and GRU. This is expected instability on 10-learner synthetic data and is not interpretable as a real finding.
          </p>
        </section>

        {/* Charts */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5 space-y-5">
          <h2 className="font-semibold text-[#0F172A] text-sm">Pilot Charts — All watermarked as pipeline validation only</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.charts.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <p className="text-xs font-medium text-[#475569]">{c.title}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.path}
                  alt={c.title}
                  className="w-full rounded-lg border border-[#E2E8F0]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Validation gate */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5">
          <h2 className="font-semibold text-[#0F172A] text-sm mb-3">Pipeline Validation Gate</h2>
          <p className="text-sm text-green-700 font-medium">
            ✅ {data.validation.checks_passed} / {data.validation.checks_run} checks passed
          </p>
        </section>

      </main>
    </div>
  );
}
