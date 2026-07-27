"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  datasetId: string;
  runId: string;
  datasetCode: string;
  artifactSource: "result_version" | "static_fallback" | null;
  onClose: () => void;
  token: string;
};

type ResearchConstraints = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
};

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

type SequenceParameters = {
  at_risk_threshold: number;
  dedup_window_sec: number;
  max_seq_len_percentile: number;
  max_seq_len: number;
  n_features: number;
  feature_names: string[];
  random_state: number;
  test_size: number;
};

type SequenceDatasetStats = {
  raw_events: number;
  dropped_as_duplicate: number;
  canonical_events: number;
  pre_cutoff_events: number;
  total_learners: number;
  eligible_learners: number;
  train_learners: number;
  test_learners: number;
  thesis_eligible_labels: number;
  proxy_behavioral_labels: number;
  train_shape: [number, number, number];
  test_shape: [number, number, number];
};

type SequenceConstruction = {
  schema_version: string;
  created_at_utc: string;
  parameters: SequenceParameters;
  dataset_stats: SequenceDatasetStats;
  data_warning: string;
};

type EventVocabulary = {
  schema_version: string;
  padding_token: number;
  event_type_vocab: Record<string, number>;
  block_events_reserved: string[];
  note: string;
  active_event_count: number;
  total_vocab_entries: number;
};

type FeatureScaler = {
  schema_version: string;
  feature_names: string[];
  n_samples_seen: number;
  fit_split: string;
};

type TagDatasetStats = {
  total_sequences: number;
  total_nodes: number;
  total_edges: number;
  train_sequences: number;
  test_sequences: number;
  feature_leakage_check: string;
  nan_in_features: string;
};

type TagStructure = {
  schema_version: string;
  created_at_utc: string;
  transition_types: string[];
  transition_type_count: number;
  graph_feature_names: string[];
  graph_feature_count: number;
  dataset_stats: TagDatasetStats;
  data_warning: string;
};

type ModelConfig = {
  cell_type: string;
  hidden_size: number;
  dropout: number;
  learning_rate: number;
  batch_size: number;
  max_epochs: number;
  early_stop_patience: number;
  optimizer: string;
  input_features_exp_a: number;
  input_features_exp_b: number;
  max_sequence_length: number;
  tag_features_exp_b: number;
  trainable_params_exp_a: number;
  trainable_params_exp_b: number;
  architecture: string;
};

type Validation = {
  checks_run: number;
  checks_passed: number;
  no_learner_overlap: boolean;
  no_pii_in_exports: boolean;
  leakage_check_passed: boolean;
  split_integrity_passed: boolean;
};

type ArtifactVersions = {
  phase4_ui_summary: { schema_version: string };
  sequence_manifest: { schema_version: string; created_at_utc: string; phase3_source_sha: string };
  vocabulary: { schema_version: string };
  scaler: { schema_version: string };
  tag_manifest: {
    schema_version: string;
    created_at_utc: string;
    phase3_source_sha: string;
    m2_manifest_sha: string;
    artifact_checksums: Record<string, string>;
  };
};

type ArtifactData = {
  artifact_source: "result_version" | "static_fallback";
  research_constraints: ResearchConstraints;
  dataset_summary: DatasetSummary;
  sequence_construction: SequenceConstruction;
  event_vocabulary: EventVocabulary;
  feature_scaler: FeatureScaler;
  tag_structure: TagStructure;
  model_sequence_config: { lstm: ModelConfig; gru: ModelConfig };
  validation: Validation;
  artifact_versions: ArtifactVersions;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
      <div>
        <h2 className="font-semibold text-[#0F172A] text-sm">{title}</h2>
        {subtitle && <p className="text-[11px] text-[#64748B] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatCell({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-[#0F172A] mt-0.5">{value}</p>
      {note && <p className="text-[9px] text-[#94A3B8] mt-0.5 italic">{note}</p>}
    </div>
  );
}

function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <span>{label}</span>
    </div>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</p>
      <code
        className="block text-[10px] font-mono text-[#475569] break-all leading-relaxed"
        style={{ wordBreak: "break-all" }}
      >
        {value}
      </code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function SequentialAnalysisDetailModal({
  datasetId,
  runId,
  datasetCode,
  artifactSource,
  onClose,
  token,
}: Props) {
  const [data, setData] = useState<ArtifactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is501, setIs501] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setIs501(false);
      const url = `/api/researcher/sequential-analysis?mode=detail&dataset_id=${encodeURIComponent(datasetId)}&run_id=${encodeURIComponent(runId)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 501) {
        setIs501(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        setError((j as { error?: string }).error ?? "Failed to load artifact.");
        setLoading(false);
        return;
      }
      setData(await res.json() as ArtifactData);
      setLoading(false);
    }
    void load();
  }, [datasetId, runId, token]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-screen bg-[#FFF7ED]">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-[#0F172A] text-sm">Sequential Analysis &#8212; {datasetCode}</p>
            <p className="text-xs text-[#64748B]">
              Run: {runId.slice(0, 8)}&hellip; &#183; Read-only
              {artifactSource === "static_fallback" && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  Pilot &#8212; static artifact
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-[#FFF7ED] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          {loading && (
            <div className="text-center py-16 text-sm text-[#64748B]">Loading artifact…</div>
          )}

          {!loading && is501 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-700">
              Result artifact loading not yet implemented for this run version.
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
              <p className="font-semibold mb-1">Error loading artifact</p>
              <p>{error}</p>
            </div>
          )}

          {!loading && !is501 && !error && data && (() => {
            const rc = data.research_constraints;
            const ds = data.dataset_summary;
            const ev = data.event_vocabulary;
            const tag = data.tag_structure;
            const sc = data.sequence_construction;
            const av = data.artifact_versions;
            const val = data.validation;
            const lstm = data.model_sequence_config.lstm;
            const gru = data.model_sequence_config.gru;

            const blockedParquet = data.limitations.filter((l) => l.includes("parquet artifact"));
            const blockedDesign = data.limitations.filter((l) => l.includes("design decision"));
            const unsupported = data.limitations.filter(
              (l) => !l.includes("parquet artifact") && !l.includes("design decision"),
            );

            return (
              <>
                {/* ── Section 1: Validity Notices ── */}
                <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-amber-500 text-xl mt-0.5" aria-hidden="true">&#9888;</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-amber-800 text-sm">Pilot Data Notice &#8212; Technical Validation Only</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wide">
                          PILOT ONLY
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-700 text-white tracking-wide">
                          NOT FINAL RESEARCH RESULTS
                        </span>
                      </div>
                      <ul className="text-amber-700 text-xs space-y-1 mt-2 leading-relaxed">
                        <li>Proxy labels only &#8212; labels derived from attempt stream, not expert-validated</li>
                        <li>10 learners (pilot) &#8212; below thesis minimum of {ds.thesis_minimum_learners} learners</li>
                        <li>Pipeline validation only &#8212; not confirmatory, not causal</li>
                        <li>Proxy-target circularity is PRESENT &#8212; results must not be interpreted as confirmatory research findings</li>
                        <li>Confirmatory hypothesis testing is PROHIBITED in this phase</li>
                      </ul>
                    </div>
                  </div>

                  <pre className="overflow-x-auto text-xs font-mono bg-white/70 border border-amber-200 rounded-lg p-3 leading-relaxed">
                    <span className="text-[#64748B]">{"evaluation_purpose             "}</span><span className="text-[#0F172A]">{"= "}{rc.evaluation_purpose}{"\n"}</span>
                    <span className="text-[#64748B]">{"label_source                   "}</span><span className="text-[#0F172A]">{"= "}{rc.label_source}{"\n"}</span>
                    <span className="text-[#64748B]">{"label_validity                 "}</span><span className="text-[#0F172A]">{"= "}{rc.label_validity}{"\n"}</span>
                    <span className="text-[#64748B]">{"proxy_target_circularity       "}</span><span className="text-[#0F172A]">{"= "}{String(rc.proxy_target_circularity)}{"\n"}</span>
                    <span className="text-[#64748B]">{"confirmatory_analysis_allowed  "}</span><span className="text-[#0F172A]">{"= "}{String(rc.confirmatory_analysis_allowed)}</span>
                  </pre>

                  <p className="text-amber-600 text-xs italic leading-relaxed">{rc.data_warning}</p>
                </section>

                {/* ── Section 2: Analysis Scope ── */}
                <SectionCard title="Analysis Scope" subtitle="Frozen pilot scope &#8212; read-only artifact view">
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-xs text-[#475569] space-y-2 leading-relaxed">
                    <p className="font-semibold text-[#0F172A]">This page shows artifact metadata only. The following operations are explicitly prohibited:</p>
                    <ul className="space-y-1 ml-2">
                      <li>&#8212; No browser-side metric recomputation</li>
                      <li>&#8212; No dataset-subset evaluation</li>
                      <li>&#8212; No learner-group inference</li>
                      <li>&#8212; No confirmatory analysis</li>
                    </ul>
                    <p className="pt-2 border-t border-[#E2E8F0] text-[#64748B]">
                      Note: batch_type and task_type filters do not apply to sequence data. Sequence tensors are
                      computed from the offline pipeline (NB05) and are not filterable by activity set or task type.
                    </p>
                  </div>
                </SectionCard>

                {/* ── Section 3: Sequence Dataset Overview ── */}
                <SectionCard
                  title="Sequence Dataset Overview"
                  subtitle="Frozen at NB05 execution &#8212; not affected by any runtime filters"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCell label="Total canonical events" value={ds.total_canonical_events} />
                    <StatCell label="Total sequences" value={ds.total_sequences} />
                    <StatCell label="Train sequences" value={ds.train_sequences} />
                    <StatCell label="Test sequences" value={ds.test_sequences} />
                    <StatCell label="Total learners (pilot)" value={ds.total_learners} />
                    <StatCell label="Train learners" value={ds.train_learners} />
                    <StatCell label="Test learners" value={ds.test_learners} />
                    <StatCell label="Max sequence length" value={`${ds.max_sequence_length} steps`} note={`${ds.sequence_length_percentile}th percentile`} />
                    <StatCell label="Features per timestep" value={ds.features_per_timestep} />
                    <StatCell label="Vocabulary size" value={ds.vocab_size} />
                    <StatCell label="Split random_state" value={ds.split_random_state} />
                    <StatCell
                      label="Sequences per learner"
                      value={`${ds.total_sequences / ds.total_learners}`}
                      note="UI-derived: total_sequences / total_learners"
                    />
                  </div>

                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    &#9888; {ds.total_learners} learners &#8212; below thesis minimum ({ds.thesis_minimum_learners} learners).
                    Pipeline validation scope only.
                  </div>

                  <div className="text-xs text-[#64748B] space-y-0.5">
                    <p><span className="text-[#94A3B8]">split_method:</span> {ds.split_method}</p>
                    <p><span className="text-[#94A3B8]">dedup_window:</span> {ds.dedup_window_seconds}s</p>
                  </div>
                </SectionCard>

                {/* ── Section 4: Sequence Construction ── */}
                <SectionCard
                  title="Sequence Construction"
                  subtitle={`Schema: ${sc.schema_version} &#8212; built at ${sc.created_at_utc}`}
                >
                  <div className="text-xs text-[#475569] space-y-2 leading-relaxed">
                    <p>
                      Raw events are ordered chronologically per learner-session. The sequence terminates at the
                      first <code className="bg-[#F1F5F9] px-1 rounded">submit_answer</code> event (pre-cutoff strategy).
                      Duplicate events within a {sc.parameters.dedup_window_sec}s window are collapsed to a single event.
                    </p>
                    <p>
                      Sequences are padded with token <code className="bg-[#F1F5F9] px-1 rounded">0</code> to
                      max length <code className="bg-[#F1F5F9] px-1 rounded">{sc.parameters.max_seq_len}</code> steps
                      (the {sc.parameters.max_seq_len_percentile}th percentile of sequence lengths).
                    </p>
                    <p>
                      Learner-level <code className="bg-[#F1F5F9] px-1 rounded">GroupShuffleSplit</code> (random_state={sc.parameters.random_state},
                      test_size={sc.parameters.test_size}) ensures no train/test learner overlap.
                      The feature scaler is fit on the training split only.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                      10 per-timestep features (n_features = {sc.parameters.n_features})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sc.parameters.feature_names.map((f, i) => (
                        <code key={f} className="text-[9px] bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded">
                          [{i}] {f}
                        </code>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                    <span className="text-[#94A3B8]">raw_events</span><span className="font-mono text-[#0F172A]">{sc.dataset_stats.raw_events}</span>
                    <span className="text-[#94A3B8]">dropped_as_duplicate</span><span className="font-mono text-[#0F172A]">{sc.dataset_stats.dropped_as_duplicate}</span>
                    <span className="text-[#94A3B8]">canonical_events</span><span className="font-mono text-[#0F172A]">{sc.dataset_stats.canonical_events}</span>
                    <span className="text-[#94A3B8]">pre_cutoff_events</span><span className="font-mono text-[#0F172A]">{sc.dataset_stats.pre_cutoff_events}</span>
                    <span className="text-[#94A3B8]">train_shape</span>
                    <span className="font-mono text-[#0F172A]">[{sc.dataset_stats.train_shape.join(", ")}]</span>
                    <span className="text-[#94A3B8]">test_shape</span>
                    <span className="font-mono text-[#0F172A]">[{sc.dataset_stats.test_shape.join(", ")}]</span>
                  </div>
                </SectionCard>

                {/* ── Section 5: Event Vocabulary ── */}
                <SectionCard
                  title="Event Vocabulary"
                  subtitle={`Schema: ${ev.schema_version} &#8212; ${ev.total_vocab_entries} total entries, ${ev.active_event_count} active`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[420px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0]">
                          <th className="text-left py-2 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Code</th>
                          <th className="text-left py-2 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Event Name</th>
                          <th className="text-left py-2 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Status</th>
                          <th className="text-left py-2 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                          <td className="py-2 pr-4 font-mono text-[#475569]">0</td>
                          <td className="py-2 pr-4 font-mono text-[#475569]">padding</td>
                          <td className="py-2 pr-4">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]">
                              padding
                            </span>
                          </td>
                          <td className="py-2 text-[#94A3B8]">Sequence padding token &#8212; not a real event</td>
                        </tr>
                        {Object.entries(ev.event_type_vocab).map(([name, code]) => {
                          const isReserved = ev.block_events_reserved.includes(name);
                          return (
                            <tr key={name} className="border-b border-[#F1F5F9]">
                              <td className="py-2 pr-4 font-mono text-[#475569]">{code}</td>
                              <td className="py-2 pr-4 font-mono text-[#0F172A]">{name}</td>
                              <td className="py-2 pr-4">
                                {isReserved ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    reserved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-50 text-green-700 border border-green-200">
                                    active
                                  </span>
                                )}
                              </td>
                              <td className="py-2 text-[#94A3B8]">
                                {isReserved ? "Reserved &#8212; not collected in Phase 4" : "Collected in Phase 4"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-[#94A3B8] italic">{ev.note}</p>
                </SectionCard>

                {/* ── Section 6: TAG Structure ── */}
                <SectionCard
                  title="TAG Structure (Temporal Assessment Graph)"
                  subtitle="Graph-structural metadata &#8212; no transition frequencies, matrix, or network graph shown"
                >
                  <p className="text-xs text-[#475569] leading-relaxed">
                    The Temporal Assessment Graph (TAG) represents a learner&apos;s attempt trajectory as a directed graph.
                    Nodes are event types; edges carry typed transition labels. TAG features are used in TAG-LR and
                    EXP-B (Sequence + TAG) models.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCell label="Total sequences" value={tag.dataset_stats.total_sequences} />
                    <StatCell label="Total nodes" value={tag.dataset_stats.total_nodes} />
                    <StatCell label="Total edges" value={tag.dataset_stats.total_edges} />
                    <StatCell label="Transition types" value={tag.transition_type_count} />
                    <StatCell label="Graph features" value={tag.graph_feature_count} />
                    <StatCell label="Leakage check" value={tag.dataset_stats.feature_leakage_check} />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                      Transition Types ({tag.transition_type_count})
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse min-w-[300px]">
                        <thead>
                          <tr className="border-b border-[#E2E8F0]">
                            <th className="text-left py-1.5 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">#</th>
                            <th className="text-left py-1.5 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Transition Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tag.transition_types.map((tt, i) => (
                            <tr key={tt} className="border-b border-[#F1F5F9]">
                              <td className="py-1.5 pr-4 text-[#94A3B8]">{i + 1}</td>
                              <td className="py-1.5 font-mono text-[#0F172A]">{tt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                      Graph Feature Names ({tag.graph_feature_count})
                    </p>
                    <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-[#475569] list-decimal list-inside">
                      {tag.graph_feature_names.map((f) => (
                        <li key={f} className="font-mono">{f}</li>
                      ))}
                    </ol>
                  </div>
                </SectionCard>

                {/* ── Section 7: LSTM & GRU Sequence Config ── */}
                <SectionCard
                  title="LSTM & GRU Sequence Config"
                  subtitle="Architecture metadata only &#8212; model performance results are on the Model Results page"
                >
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 mb-2">
                    &#9888; Performance metrics (accuracy, ROC-AUC, F1, precision, recall) are not shown here.
                    See{" "}
                    <Link href="/researcher/model-results" className="underline font-semibold">
                      Model Results
                    </Link>{" "}
                    for pilot model comparison.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* LSTM */}
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#0F172A]">LSTM</span>
                        <span className="text-[10px] font-mono bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded">
                          {lstm.cell_type}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">EXP-A (Sequence only)</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                          <span className="text-[#94A3B8]">input shape</span>
                          <span className="font-mono text-[#0F172A]">[batch, {lstm.max_sequence_length}, {lstm.input_features_exp_a}]</span>
                          <span className="text-[#94A3B8]">trainable params</span>
                          <span className="font-mono text-[#0F172A]">{lstm.trainable_params_exp_a.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">EXP-B (Sequence + TAG)</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                          <span className="text-[#94A3B8]">input shape</span>
                          <span className="font-mono text-[#0F172A]">[batch, {lstm.max_sequence_length}, {lstm.input_features_exp_a}]</span>
                          <span className="text-[#94A3B8]">tag_features</span>
                          <span className="font-mono text-[#0F172A]">{lstm.tag_features_exp_b} (concat)</span>
                          <span className="text-[#94A3B8]">combined input</span>
                          <span className="font-mono text-[#0F172A]">{lstm.input_features_exp_b}</span>
                          <span className="text-[#94A3B8]">trainable params</span>
                          <span className="font-mono text-[#0F172A]">{lstm.trainable_params_exp_b.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-[#E2E8F0]">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">Shared config</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                          <span className="text-[#94A3B8]">hidden_size</span><span className="font-mono text-[#0F172A]">{lstm.hidden_size}</span>
                          <span className="text-[#94A3B8]">dropout</span><span className="font-mono text-[#0F172A]">{lstm.dropout}</span>
                          <span className="text-[#94A3B8]">optimizer</span><span className="font-mono text-[#0F172A]">{lstm.optimizer}</span>
                          <span className="text-[#94A3B8]">lr</span><span className="font-mono text-[#0F172A]">{lstm.learning_rate}</span>
                          <span className="text-[#94A3B8]">batch_size</span><span className="font-mono text-[#0F172A]">{lstm.batch_size}</span>
                          <span className="text-[#94A3B8]">max_epochs</span><span className="font-mono text-[#0F172A]">{lstm.max_epochs}</span>
                          <span className="text-[#94A3B8]">early_stop</span><span className="font-mono text-[#0F172A]">{lstm.early_stop_patience}</span>
                        </div>
                      </div>
                    </div>

                    {/* GRU */}
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#0F172A]">GRU</span>
                        <span className="text-[10px] font-mono bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded">
                          {gru.cell_type}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">EXP-A (Sequence only)</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                          <span className="text-[#94A3B8]">input shape</span>
                          <span className="font-mono text-[#0F172A]">[batch, {gru.max_sequence_length}, {gru.input_features_exp_a}]</span>
                          <span className="text-[#94A3B8]">trainable params</span>
                          <span className="font-mono text-[#0F172A]">{gru.trainable_params_exp_a.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">EXP-B (Sequence + TAG)</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                          <span className="text-[#94A3B8]">input shape</span>
                          <span className="font-mono text-[#0F172A]">[batch, {gru.max_sequence_length}, {gru.input_features_exp_a}]</span>
                          <span className="text-[#94A3B8]">tag_features</span>
                          <span className="font-mono text-[#0F172A]">{gru.tag_features_exp_b} (concat)</span>
                          <span className="text-[#94A3B8]">combined input</span>
                          <span className="font-mono text-[#0F172A]">{gru.input_features_exp_b}</span>
                          <span className="text-[#94A3B8]">trainable params</span>
                          <span className="font-mono text-[#0F172A]">{gru.trainable_params_exp_b.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-[#E2E8F0]">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">Shared config</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                          <span className="text-[#94A3B8]">hidden_size</span><span className="font-mono text-[#0F172A]">{gru.hidden_size}</span>
                          <span className="text-[#94A3B8]">dropout</span><span className="font-mono text-[#0F172A]">{gru.dropout}</span>
                          <span className="text-[#94A3B8]">optimizer</span><span className="font-mono text-[#0F172A]">{gru.optimizer}</span>
                          <span className="text-[#94A3B8]">lr</span><span className="font-mono text-[#0F172A]">{gru.learning_rate}</span>
                          <span className="text-[#94A3B8]">batch_size</span><span className="font-mono text-[#0F172A]">{gru.batch_size}</span>
                          <span className="text-[#94A3B8]">max_epochs</span><span className="font-mono text-[#0F172A]">{gru.max_epochs}</span>
                          <span className="text-[#94A3B8]">early_stop</span><span className="font-mono text-[#0F172A]">{gru.early_stop_patience}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* ── Section 8: Reproducibility & Validation ── */}
                <SectionCard
                  title="Reproducibility & Validation"
                  subtitle="Artifact versions, checksums, and pipeline validation checks"
                >
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                      Structural Checks &#8212; {val.checks_passed}/{val.checks_run} passed
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <CheckBadge ok={val.checks_passed === val.checks_run} label={`All ${val.checks_run} structural checks passed`} />
                      <CheckBadge ok={val.no_learner_overlap} label="No learner overlap (train/test)" />
                      <CheckBadge ok={val.no_pii_in_exports} label="No PII in pipeline exports" />
                      <CheckBadge ok={val.split_integrity_passed} label="Split integrity passed" />
                      <CheckBadge ok={val.leakage_check_passed} label="Feature leakage check passed" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                    <span className="text-[#94A3B8]">random_state</span>
                    <span className="font-mono text-[#0F172A]">{ds.split_random_state}</span>
                    <span className="text-[#94A3B8]">dedup_window</span>
                    <span className="font-mono text-[#0F172A]">{ds.dedup_window_seconds}s</span>
                    <span className="text-[#94A3B8]">scaler fit_split</span>
                    <span className="font-mono text-[#0F172A]">{data.feature_scaler.fit_split}</span>
                    <span className="text-[#94A3B8]">scaler n_samples_seen</span>
                    <span className="font-mono text-[#0F172A]">{data.feature_scaler.n_samples_seen}</span>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">Artifact Versions</p>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 space-y-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        <span className="text-[#94A3B8]">phase4_ui_summary</span>
                        <span className="font-mono text-[#0F172A]">{av.phase4_ui_summary.schema_version}</span>
                        <span className="text-[#94A3B8]">sequence_manifest</span>
                        <span className="font-mono text-[#0F172A]">{av.sequence_manifest.schema_version}</span>
                        <span className="text-[#94A3B8]">vocabulary</span>
                        <span className="font-mono text-[#0F172A]">{av.vocabulary.schema_version}</span>
                        <span className="text-[#94A3B8]">scaler</span>
                        <span className="font-mono text-[#0F172A]">{av.scaler.schema_version}</span>
                        <span className="text-[#94A3B8]">tag_manifest</span>
                        <span className="font-mono text-[#0F172A]">{av.tag_manifest.schema_version}</span>
                      </div>

                      <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">Source Hashes</p>
                        <HashRow label="sequence_manifest phase3_source_sha" value={av.sequence_manifest.phase3_source_sha} />
                        <HashRow label="tag_manifest phase3_source_sha" value={av.tag_manifest.phase3_source_sha} />
                        <HashRow label="tag_manifest m2_manifest_sha" value={av.tag_manifest.m2_manifest_sha} />
                      </div>

                      <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                        <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">TAG Artifact Checksums</p>
                        {Object.entries(av.tag_manifest.artifact_checksums).map(([key, hash]) => (
                          <HashRow key={key} label={key} value={hash} />
                        ))}
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* ── Section 9: Limitations ── */}
                <SectionCard
                  title="Limitations"
                  subtitle="Blocked and unsupported analyses for this pilot phase"
                >
                  {blockedParquet.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide flex items-center gap-1">
                        <span aria-hidden="true">&#9888;</span> Blocked pending offline sequence analytics artifact
                      </p>
                      <ul className="space-y-1">
                        {blockedParquet.map((lim) => (
                          <li key={lim} className="flex items-start gap-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-xs text-[#475569]">
                            <span className="text-[#94A3B8] mt-0.5 shrink-0" aria-hidden="true">&#8212;</span>
                            <span>{lim}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {blockedDesign.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide flex items-center gap-1">
                        <span aria-hidden="true">&#9888;</span> Blocked pending research design decision
                      </p>
                      <ul className="space-y-1">
                        {blockedDesign.map((lim) => (
                          <li key={lim} className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                            <span className="mt-0.5 shrink-0" aria-hidden="true">&#8212;</span>
                            <span>{lim}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {unsupported.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide flex items-center gap-1">
                        <span aria-hidden="true">&#10007;</span> Unsupported in current pilot
                      </p>
                      <ul className="space-y-1">
                        {unsupported.map((lim) => (
                          <li key={lim} className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                            <span className="mt-0.5 shrink-0" aria-hidden="true">&#8212;</span>
                            <span>{lim}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </SectionCard>
              </>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
