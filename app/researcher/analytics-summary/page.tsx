"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

type DatasetSummary = {
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
};

type Validation = {
  checks_run: number;
  checks_passed: number;
  no_learner_overlap: boolean;
  no_pii_in_exports: boolean;
  leakage_check_passed: boolean;
  split_integrity_passed: boolean;
};

type ApiData = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
  dataset_summary: DatasetSummary;
  validation: Validation;
};

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

function StatRow({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-[#F1F5F9] last:border-0">
      <span className="text-xs text-[#475569]">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-[#0F172A]">{value}</span>
        {note && <span className="ml-2 text-xs text-[#94A3B8]">{note}</span>}
      </div>
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

export default function AnalyticsSummaryPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      const res = await fetch("/api/researcher/analytics-summary", {
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

  const ds = data.dataset_summary;
  const v = data.validation;

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">Analytics Summary</p>
          <p className="text-xs text-[#64748B]">Phase 4 Dataset Statistics</p>
        </div>
        <Link href="/researcher/dashboard" className="text-xs text-[#F37021] hover:underline">← Dashboard</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        <PilotDisclaimer warning={data.data_warning} />

        {/* Learner & sequence counts */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5">
          <h2 className="font-semibold text-[#0F172A] text-sm mb-4">Learner & Sequence Counts</h2>
          <StatRow label="Total learners" value={ds.total_learners} note={`thesis minimum: ${ds.thesis_minimum_learners}`} />
          <StatRow label="Train / test learners" value={`${ds.train_learners} / ${ds.test_learners}`} />
          <StatRow label="Total sequences" value={ds.total_sequences} note={`train ${ds.train_sequences} / test ${ds.test_sequences}`} />
          <StatRow label="Canonical events" value={ds.total_canonical_events} />
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            ⚠ Dataset is {ds.total_learners} learners — below thesis minimum of {ds.thesis_minimum_learners}. Pipeline validation scope only.
          </div>
        </section>

        {/* Sequence config */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5">
          <h2 className="font-semibold text-[#0F172A] text-sm mb-4">Sequence Configuration</h2>
          <StatRow label="Max sequence length" value={`${ds.max_sequence_length} steps`} note={`${ds.sequence_length_percentile}th percentile cutoff`} />
          <StatRow label="Features per timestep" value={ds.features_per_timestep} />
          <StatRow label="Vocabulary size" value={ds.vocab_size} note="event types" />
          <StatRow label="Deduplication window" value={`${ds.dedup_window_seconds}s`} note="sql_run / submit_answer pairs" />
        </section>

        {/* Split */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5">
          <h2 className="font-semibold text-[#0F172A] text-sm mb-4">Train / Test Split</h2>
          <StatRow label="Method" value={ds.split_method} />
          <StatRow label="Random state" value={ds.split_random_state} />
          <StatRow label="Test fraction" value="20%" note="2 learners held out" />
        </section>

        {/* Validation gate */}
        <section className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] px-6 py-5 space-y-3">
          <h2 className="font-semibold text-[#0F172A] text-sm">Pipeline Validation Gate</h2>
          <p className="text-xs text-[#64748B]">{v.checks_passed} / {v.checks_run} checks passed</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CheckBadge ok={v.checks_passed === v.checks_run} label={`All ${v.checks_run} pipeline checks passed`} />
            <CheckBadge ok={v.no_learner_overlap}    label="No learner overlap (train/test)" />
            <CheckBadge ok={v.no_pii_in_exports}     label="No PII in exports" />
            <CheckBadge ok={v.leakage_check_passed}  label="Leakage check passed" />
            <CheckBadge ok={v.split_integrity_passed} label="Split integrity passed" />
          </div>
        </section>

      </main>
    </div>
  );
}
