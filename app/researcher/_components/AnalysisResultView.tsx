"use client";

import Link from "next/link";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type ResearchConstraints = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
};

export type DatasetSummary = {
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

export type SequenceParameters = {
  at_risk_threshold: number;
  dedup_window_sec: number;
  max_seq_len_percentile: number;
  max_seq_len: number;
  n_features: number;
  feature_names: string[];
  random_state: number;
  test_size: number;
};

export type SequenceDatasetStats = {
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

export type SequenceConstruction = {
  schema_version: string;
  created_at_utc: string;
  parameters: SequenceParameters;
  dataset_stats: SequenceDatasetStats;
  data_warning: string;
};

export type EventVocabulary = {
  schema_version: string;
  padding_token: number;
  event_type_vocab: Record<string, number>;
  block_events_reserved: string[];
  note: string;
  active_event_count: number;
  total_vocab_entries: number;
};

export type FeatureScaler = {
  schema_version: string;
  feature_names: string[];
  n_samples_seen: number;
  fit_split: string;
};

export type TagDatasetStats = {
  total_sequences: number;
  total_nodes: number;
  total_edges: number;
  train_sequences: number;
  test_sequences: number;
  feature_leakage_check: string;
  nan_in_features: string;
};

export type TagStructure = {
  schema_version: string;
  created_at_utc: string;
  transition_types: string[];
  transition_type_count: number;
  graph_feature_names: string[];
  graph_feature_count: number;
  dataset_stats: TagDatasetStats;
  data_warning: string;
};

export type ModelConfig = {
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

export type Validation = {
  checks_run: number;
  checks_passed: number;
  no_learner_overlap: boolean;
  no_pii_in_exports: boolean;
  leakage_check_passed: boolean;
  split_integrity_passed: boolean;
};

export type ArtifactVersions = {
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

type ModelComparisonEntry = {
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
  test_sequences: number;
  test_class_distribution: { positive: number; negative: number };
  models: ModelComparisonEntry[];
};

type SeedStabilityExp = { accuracy_mean: number; f1_mean: number; roc_auc_mean: number; epochs_trained_mean: number };
type SeedStabilityModel = { exp_a_seq_only: SeedStabilityExp; exp_b_seq_plus_tag: SeedStabilityExp };
type SeedStability = { lstm: SeedStabilityModel; gru: SeedStabilityModel };

export type ArtifactPayload = {
  artifact_source: "result_version" | "static_fallback" | "local_disk";
  research_constraints?: ResearchConstraints | null;
  dataset_summary?: DatasetSummary | null;
  sequence_construction?: SequenceConstruction | null;
  event_vocabulary?: EventVocabulary | null;
  feature_scaler?: FeatureScaler | null;
  tag_structure?: TagStructure | null;
  model_sequence_config?: { lstm: ModelConfig; gru: ModelConfig } | null;
  model_comparison?: ModelComparison | null;
  seed_stability?: SeedStability | null;
  charts?: Array<{ key: string; title: string; path: string }> | null;
  validation?: Validation | null;
  artifact_versions?: ArtifactVersions | null;
  limitations?: string[] | null;
};

// ---------------------------------------------------------------------------
// Private sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  children,
}: {
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

function StatCell({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
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
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
        ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
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

function UnavailableSection({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <p className="text-xs text-[#94A3B8] italic">Not available for this run.</p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

type Props = {
  artifact: ArtifactPayload;
};

export function AnalysisResultView({ artifact }: Props) {
  const {
    dataset_summary: ds,
    sequence_construction: sc,
    event_vocabulary: ev,
    tag_structure: tag,
    model_sequence_config: mc,
    model_comparison: mcmp,
    seed_stability: ss,
    charts,
    validation: val,
    artifact_versions: av,
    limitations,
    feature_scaler: fs,
    research_constraints: rc,
  } = artifact;

  const lims = limitations ?? [];
  const blockedParquet = lims.filter((l) => l.includes("parquet artifact"));
  const blockedDesign = lims.filter((l) => l.includes("design decision"));
  const unsupported = lims.filter(
    (l) => !l.includes("parquet artifact") && !l.includes("design decision"),
  );

  return (
    <>
      {/* ── Section 1: Sequence Dataset Overview ── */}
      {!ds ? (
        <UnavailableSection title="Sequence Dataset Overview" />
      ) : (
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
            <StatCell
              label="Max sequence length"
              value={`${ds.max_sequence_length} steps`}
              note={`${ds.sequence_length_percentile}th percentile`}
            />
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
            &#9888; {ds.total_learners} learners &#8212; below thesis minimum ({ds.thesis_minimum_learners}{" "}
            learners). Pipeline validation scope only.
          </div>

          <div className="text-xs text-[#64748B] space-y-0.5">
            <p>
              <span className="text-[#94A3B8]">split_method:</span> {ds.split_method}
            </p>
            <p>
              <span className="text-[#94A3B8]">dedup_window:</span> {ds.dedup_window_seconds}s
            </p>
          </div>
        </SectionCard>
      )}

      {/* ── Section 2: Sequence Construction ── */}
      {!sc ? (
        <UnavailableSection title="Sequence Construction" />
      ) : (
        <SectionCard
          title="Sequence Construction"
          subtitle={`Schema: ${sc.schema_version} — built at ${sc.created_at_utc}`}
        >
          <div className="text-xs text-[#475569] space-y-2 leading-relaxed">
            <p>
              Raw events are ordered chronologically per learner-session. The sequence terminates at the
              first{" "}
              <code className="bg-[#F1F5F9] px-1 rounded">submit_answer</code> event (pre-cutoff
              strategy). Duplicate events within a {sc.parameters.dedup_window_sec}s window are collapsed
              to a single event.
            </p>
            <p>
              Sequences are padded with token <code className="bg-[#F1F5F9] px-1 rounded">0</code> to
              max length{" "}
              <code className="bg-[#F1F5F9] px-1 rounded">{sc.parameters.max_seq_len}</code> steps (the{" "}
              {sc.parameters.max_seq_len_percentile}th percentile of sequence lengths).
            </p>
            <p>
              Learner-level{" "}
              <code className="bg-[#F1F5F9] px-1 rounded">GroupShuffleSplit</code>{" "}
              (random_state={sc.parameters.random_state}, test_size={sc.parameters.test_size}) ensures no
              train/test learner overlap. The feature scaler is fit on the training split only.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
              10 per-timestep features (n_features = {sc.parameters.n_features})
            </p>
            <div className="flex flex-wrap gap-1">
              {sc.parameters.feature_names.map((f, i) => (
                <code
                  key={f}
                  className="text-[9px] bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded"
                >
                  [{i}] {f}
                </code>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
            <span className="text-[#94A3B8]">raw_events</span>
            <span className="font-mono text-[#0F172A]">{sc.dataset_stats.raw_events}</span>
            <span className="text-[#94A3B8]">dropped_as_duplicate</span>
            <span className="font-mono text-[#0F172A]">{sc.dataset_stats.dropped_as_duplicate}</span>
            <span className="text-[#94A3B8]">canonical_events</span>
            <span className="font-mono text-[#0F172A]">{sc.dataset_stats.canonical_events}</span>
            <span className="text-[#94A3B8]">pre_cutoff_events</span>
            <span className="font-mono text-[#0F172A]">{sc.dataset_stats.pre_cutoff_events}</span>
            <span className="text-[#94A3B8]">train_shape</span>
            <span className="font-mono text-[#0F172A]">
              [{sc.dataset_stats.train_shape.join(", ")}]
            </span>
            <span className="text-[#94A3B8]">test_shape</span>
            <span className="font-mono text-[#0F172A]">
              [{sc.dataset_stats.test_shape.join(", ")}]
            </span>
          </div>
        </SectionCard>
      )}

      {/* ── Section 3: Event Vocabulary ── */}
      {!ev ? (
        <UnavailableSection title="Event Vocabulary" />
      ) : (
        <SectionCard
          title="Event Vocabulary"
          subtitle={`Schema: ${ev.schema_version} — ${ev.total_vocab_entries} total entries, ${ev.active_event_count} active`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[420px]">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="text-left py-2 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                    Code
                  </th>
                  <th className="text-left py-2 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                    Event Name
                  </th>
                  <th className="text-left py-2 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left py-2 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                    Notes
                  </th>
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
                  <td className="py-2 text-[#94A3B8]">
                    Sequence padding token &#8212; not a real event
                  </td>
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
                        {isReserved
                          ? "Reserved — not collected in Phase 4"
                          : "Collected in Phase 4"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[#94A3B8] italic">{ev.note}</p>
        </SectionCard>
      )}

      {/* ── Section 4: TAG Structure ── */}
      {!tag ? (
        <UnavailableSection title="TAG Structure (Temporal Assessment Graph)" />
      ) : (
        <SectionCard
          title="TAG Structure (Temporal Assessment Graph)"
          subtitle="Graph-structural metadata &#8212; no transition frequencies, matrix, or network graph shown"
        >
          <p className="text-xs text-[#475569] leading-relaxed">
            The Temporal Assessment Graph (TAG) represents a learner&apos;s attempt trajectory as a
            directed graph. Nodes are event types; edges carry typed transition labels. TAG features are
            used in TAG-LR and EXP-B (Sequence + TAG) models.
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
                    <th className="text-left py-1.5 pr-4 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                      #
                    </th>
                    <th className="text-left py-1.5 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                      Transition Type
                    </th>
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
                <li key={f} className="font-mono">
                  {f}
                </li>
              ))}
            </ol>
          </div>
        </SectionCard>
      )}

      {/* ── Section 5: LSTM & GRU Sequence Config ── */}
      {!mc ? (
        <UnavailableSection title="LSTM & GRU Sequence Config" />
      ) : (
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
                  {mc.lstm.cell_type}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  EXP-A (Sequence only)
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-[#94A3B8]">input shape</span>
                  <span className="font-mono text-[#0F172A]">
                    [batch, {mc.lstm.max_sequence_length}, {mc.lstm.input_features_exp_a}]
                  </span>
                  <span className="text-[#94A3B8]">trainable params</span>
                  <span className="font-mono text-[#0F172A]">
                    {mc.lstm.trainable_params_exp_a.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  EXP-B (Sequence + TAG)
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-[#94A3B8]">input shape</span>
                  <span className="font-mono text-[#0F172A]">
                    [batch, {mc.lstm.max_sequence_length}, {mc.lstm.input_features_exp_a}]
                  </span>
                  <span className="text-[#94A3B8]">tag_features</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.tag_features_exp_b} (concat)</span>
                  <span className="text-[#94A3B8]">combined input</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.input_features_exp_b}</span>
                  <span className="text-[#94A3B8]">trainable params</span>
                  <span className="font-mono text-[#0F172A]">
                    {mc.lstm.trainable_params_exp_b.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="space-y-1 pt-1 border-t border-[#E2E8F0]">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  Shared config
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-[#94A3B8]">hidden_size</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.hidden_size}</span>
                  <span className="text-[#94A3B8]">dropout</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.dropout}</span>
                  <span className="text-[#94A3B8]">optimizer</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.optimizer}</span>
                  <span className="text-[#94A3B8]">lr</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.learning_rate}</span>
                  <span className="text-[#94A3B8]">batch_size</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.batch_size}</span>
                  <span className="text-[#94A3B8]">max_epochs</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.max_epochs}</span>
                  <span className="text-[#94A3B8]">early_stop</span>
                  <span className="font-mono text-[#0F172A]">{mc.lstm.early_stop_patience}</span>
                </div>
              </div>
            </div>

            {/* GRU */}
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[#0F172A]">GRU</span>
                <span className="text-[10px] font-mono bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded">
                  {mc.gru.cell_type}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  EXP-A (Sequence only)
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-[#94A3B8]">input shape</span>
                  <span className="font-mono text-[#0F172A]">
                    [batch, {mc.gru.max_sequence_length}, {mc.gru.input_features_exp_a}]
                  </span>
                  <span className="text-[#94A3B8]">trainable params</span>
                  <span className="font-mono text-[#0F172A]">
                    {mc.gru.trainable_params_exp_a.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  EXP-B (Sequence + TAG)
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-[#94A3B8]">input shape</span>
                  <span className="font-mono text-[#0F172A]">
                    [batch, {mc.gru.max_sequence_length}, {mc.gru.input_features_exp_a}]
                  </span>
                  <span className="text-[#94A3B8]">tag_features</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.tag_features_exp_b} (concat)</span>
                  <span className="text-[#94A3B8]">combined input</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.input_features_exp_b}</span>
                  <span className="text-[#94A3B8]">trainable params</span>
                  <span className="font-mono text-[#0F172A]">
                    {mc.gru.trainable_params_exp_b.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="space-y-1 pt-1 border-t border-[#E2E8F0]">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  Shared config
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-[#94A3B8]">hidden_size</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.hidden_size}</span>
                  <span className="text-[#94A3B8]">dropout</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.dropout}</span>
                  <span className="text-[#94A3B8]">optimizer</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.optimizer}</span>
                  <span className="text-[#94A3B8]">lr</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.learning_rate}</span>
                  <span className="text-[#94A3B8]">batch_size</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.batch_size}</span>
                  <span className="text-[#94A3B8]">max_epochs</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.max_epochs}</span>
                  <span className="text-[#94A3B8]">early_stop</span>
                  <span className="font-mono text-[#0F172A]">{mc.gru.early_stop_patience}</span>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Section 6: Reproducibility & Validation ── */}
      {!val || !av ? (
        <UnavailableSection title="Reproducibility & Validation" />
      ) : (
        <SectionCard
          title="Reproducibility & Validation"
          subtitle="Artifact versions, checksums, and pipeline validation checks"
        >
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
              Structural Checks &#8212; {val.checks_passed}/{val.checks_run} passed
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CheckBadge
                ok={val.checks_passed === val.checks_run}
                label={`All ${val.checks_run} structural checks passed`}
              />
              <CheckBadge ok={val.no_learner_overlap} label="No learner overlap (train/test)" />
              <CheckBadge ok={val.no_pii_in_exports} label="No PII in pipeline exports" />
              <CheckBadge ok={val.split_integrity_passed} label="Split integrity passed" />
              <CheckBadge ok={val.leakage_check_passed} label="Feature leakage check passed" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
            {ds && (
              <>
                <span className="text-[#94A3B8]">random_state</span>
                <span className="font-mono text-[#0F172A]">{ds.split_random_state}</span>
                <span className="text-[#94A3B8]">dedup_window</span>
                <span className="font-mono text-[#0F172A]">{ds.dedup_window_seconds}s</span>
              </>
            )}
            {fs ? (
              <>
                <span className="text-[#94A3B8]">scaler fit_split</span>
                <span className="font-mono text-[#0F172A]">{fs.fit_split}</span>
                <span className="text-[#94A3B8]">scaler n_samples_seen</span>
                <span className="font-mono text-[#0F172A]">{fs.n_samples_seen}</span>
              </>
            ) : (
              <>
                <span className="text-[#94A3B8]">scaler fit_split</span>
                <span className="font-mono text-[#94A3B8] italic">n/a</span>
                <span className="text-[#94A3B8]">scaler n_samples_seen</span>
                <span className="font-mono text-[#94A3B8] italic">n/a</span>
              </>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
              Artifact Versions
            </p>
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
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  Source Hashes
                </p>
                <HashRow
                  label="sequence_manifest phase3_source_sha"
                  value={av.sequence_manifest.phase3_source_sha}
                />
                <HashRow
                  label="tag_manifest phase3_source_sha"
                  value={av.tag_manifest.phase3_source_sha}
                />
                <HashRow
                  label="tag_manifest m2_manifest_sha"
                  value={av.tag_manifest.m2_manifest_sha}
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide">
                  TAG Artifact Checksums
                </p>
                {Object.entries(av.tag_manifest.artifact_checksums).map(([key, hash]) => (
                  <HashRow key={key} label={key} value={hash} />
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Section 7: Limitations ── */}
      {lims.length > 0 && (
        <SectionCard
          title="Limitations"
          subtitle="Blocked and unsupported analyses for this pilot phase"
        >
          {blockedParquet.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide flex items-center gap-1">
                <span aria-hidden="true">&#9888;</span> Blocked pending offline sequence analytics
                artifact
              </p>
              <ul className="space-y-1">
                {blockedParquet.map((lim) => (
                  <li
                    key={lim}
                    className="flex items-start gap-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-xs text-[#475569]"
                  >
                    <span className="text-[#94A3B8] mt-0.5 shrink-0" aria-hidden="true">
                      &#8212;
                    </span>
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
                  <li
                    key={lim}
                    className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      &#8212;
                    </span>
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
                  <li
                    key={lim}
                    className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      &#8212;
                    </span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Section 8: Label Validity & Pilot Disclosures ── */}
      {!rc ? (
        <UnavailableSection title="Label Validity & Pilot Disclosures" />
      ) : (
        <SectionCard
          title="Label Validity & Pilot Disclosures"
          subtitle="Research constraint metadata — read-only"
        >
          <pre className="text-[11px] font-mono text-[#475569] leading-relaxed whitespace-pre-wrap break-all">
            {`evaluation_purpose         = ${rc.evaluation_purpose}
label_source               = ${rc.label_source}
label_validity             = ${rc.label_validity}
proxy_target_circularity   = ${String(rc.proxy_target_circularity)}
confirmatory_analysis_allowed = ${String(rc.confirmatory_analysis_allowed)}`}
          </pre>
          <p className="text-[11px] text-[#64748B] italic">{rc.data_warning}</p>
        </SectionCard>
      )}

      {/* ── Section 9: Model Comparison ── */}
      {!mcmp ? (
        <UnavailableSection title="Model Comparison" />
      ) : (
        <SectionCard title="Model Comparison">
          {rc?.proxy_target_circularity && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5 mb-3">
              <p className="font-semibold">⚠ proxy_target_circularity = true</p>
              <p className="text-[11px]">Non-Dummy models score 1.0 due to label circularity. Pipeline integrity check only — not research conclusions.</p>
            </div>
          )}
          <div className="text-[10px] text-[#64748B] mb-2 flex gap-4">
            <span>Test sequences: <strong>{mcmp.test_sequences}</strong></span>
            <span>Class: <strong>{mcmp.test_class_distribution.positive}+</strong> / <strong>{mcmp.test_class_distribution.negative}−</strong></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[480px]">
              <thead>
                <tr className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                  {["Model", "Acc", "F1", "ROC-AUC", "PR-AUC", "Train (s)", "Params"].map((h) => (
                    <th key={h} className={`px-2 py-2 text-[10px] font-bold text-[#64748B] uppercase tracking-wide whitespace-nowrap ${h === "Model" ? "text-left pl-3" : "text-center"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mcmp.models.map((m) => {
                  const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
                    baseline:       { label: "BASE", cls: "bg-slate-100 text-slate-600 border-slate-200" },
                    flat_baseline:  { label: "FLAT", cls: "bg-blue-50 text-blue-700 border-blue-200" },
                    graph_baseline: { label: "TAG",  cls: "bg-purple-50 text-purple-700 border-purple-200" },
                    sequence:       { label: "SEQ",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
                  };
                  const badge = TYPE_BADGE[m.type] ?? TYPE_BADGE.baseline;
                  const circular = m.type !== "baseline" && !!rc?.proxy_target_circularity;
                  const numCls = circular ? "text-red-600 font-mono" : "text-[#0F172A] font-mono";
                  return (
                    <tr key={m.name} className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7]">
                      <td className="pl-3 pr-2 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[#0F172A]">{m.name}</span>
                          <span className={`text-[8px] border px-1 rounded font-bold ${badge.cls}`}>{badge.label}</span>
                          {circular && <span className="text-red-500 text-[10px]" title="Circularity">⚠</span>}
                        </div>
                      </td>
                      <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.accuracy.toFixed(2)}</td>
                      <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.f1.toFixed(2)}</td>
                      <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.roc_auc.toFixed(2)}</td>
                      <td className={`px-2 py-2.5 text-center ${numCls}`}>{m.pr_auc.toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-center font-mono text-[#475569]">
                        {m.train_time_sec < 0.001 ? "<0.001" : m.train_time_sec.toFixed(3)}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-[#475569]">
                        {m.parameters != null ? m.parameters.toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ss && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide border-t border-[#F1F5F9] pt-3">
                Seed Stability (seeds 11 · 22 · 33 · 42 · 55)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["lstm", "gru"] as const).map((model) => {
                  const st = ss[model];
                  return (
                    <div key={model} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 space-y-2">
                      <p className="text-[10px] font-bold text-[#0F172A] uppercase">{model}</p>
                      {(["exp_a_seq_only", "exp_b_seq_plus_tag"] as const).map((exp) => {
                        const e = st[exp];
                        return (
                          <div key={exp} className="text-[10px] space-y-0.5">
                            <p className="text-[#64748B] font-medium">{exp === "exp_a_seq_only" ? "Exp-A (Seq only)" : "Exp-B (Seq + TAG)"}</p>
                            <div className="flex gap-3 font-mono text-[#0F172A]">
                              <span>Acc <strong>{e.accuracy_mean.toFixed(2)}</strong></span>
                              <span>F1 <strong>{e.f1_mean.toFixed(2)}</strong></span>
                              <span>AUC <strong>{e.roc_auc_mean.toFixed(2)}</strong></span>
                              <span className="text-[#94A3B8]">{e.epochs_trained_mean.toFixed(0)} ep</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Section 10: Analysis Charts ── */}
      {!charts || charts.length === 0 ? (
        <UnavailableSection title="Analysis Charts" />
      ) : (
        <SectionCard title="Analysis Charts" subtitle="Seed 42 · static Phase 4 artifact · pipeline validation only">
          <div className="grid grid-cols-2 gap-4">
            {charts.map((chart) => (
              <div key={chart.key} className="space-y-1.5">
                <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide">{chart.title}</p>
                <div className="border border-[#E2E8F0] rounded-lg overflow-hidden bg-[#F8FAFC]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={chart.path} alt={chart.title} className="w-full h-auto" loading="lazy" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  );
}
