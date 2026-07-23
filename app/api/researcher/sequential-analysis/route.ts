import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import summary from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";
import sequenceManifest from "@/lib/research-artifacts/phase4/sequence_manifest_v1.json";
import vocabulary from "@/lib/research-artifacts/phase4/vocabulary_v1.json";
import scaler from "@/lib/research-artifacts/phase4/scaler_v1.json";
import tagManifest from "@/lib/research-artifacts/phase4/tag_manifest_v1.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SequentialAnalysisPayload = {
  research_constraints: {
    evaluation_purpose: string;
    label_source: string;
    label_validity: string;
    proxy_target_circularity: boolean;
    confirmatory_analysis_allowed: boolean;
    data_warning: string;
  };
  dataset_summary: typeof summary.dataset_summary;
  sequence_construction: {
    schema_version: string;
    created_at_utc: string;
    parameters: typeof sequenceManifest.parameters;
    dataset_stats: typeof sequenceManifest.dataset_stats;
    data_warning: string;
  };
  event_vocabulary: {
    schema_version: string;
    padding_token: number;
    event_type_vocab: Record<string, number>;
    block_events_reserved: string[];
    note: string;
    active_event_count: number;
    total_vocab_entries: number;
  };
  feature_scaler: {
    schema_version: string;
    feature_names: string[];
    n_samples_seen: number;
    fit_split: string;
  };
  tag_structure: {
    schema_version: string;
    created_at_utc: string;
    transition_types: string[];
    transition_type_count: number;
    graph_feature_names: string[];
    graph_feature_count: number;
    dataset_stats: {
      total_sequences: number;
      total_nodes: number;
      total_edges: number;
      train_sequences: number;
      test_sequences: number;
      feature_leakage_check: string;
      nan_in_features: string;
    };
    data_warning: string;
  };
  model_sequence_config: {
    lstm: typeof summary.model_configs.lstm;
    gru: typeof summary.model_configs.gru;
  };
  validation: typeof summary.validation;
  artifact_versions: {
    phase4_ui_summary: { schema_version: string };
    sequence_manifest: { schema_version: string; created_at_utc: string; phase3_source_sha: string };
    vocabulary: { schema_version: string };
    scaler: { schema_version: string };
    tag_manifest: {
      schema_version: string;
      created_at_utc: string;
      phase3_source_sha: string;
      m2_manifest_sha: string;
      artifact_checksums: typeof tagManifest.artifact_checksums;
    };
  };
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const activeEventCount = Object.keys(vocabulary.event_type_vocab).filter(
    (key) => !vocabulary.block_events_reserved.includes(key),
  ).length;

  const payload: SequentialAnalysisPayload = {
    research_constraints: {
      evaluation_purpose: summary.evaluation_purpose,
      label_source: summary.label_source,
      label_validity: summary.label_validity,
      proxy_target_circularity: summary.proxy_target_circularity,
      confirmatory_analysis_allowed: summary.confirmatory_analysis_allowed,
      data_warning: summary.data_warning,
    },

    dataset_summary: summary.dataset_summary,

    sequence_construction: {
      schema_version: sequenceManifest.schema_version,
      created_at_utc: sequenceManifest.created_at_utc,
      parameters: sequenceManifest.parameters,
      dataset_stats: sequenceManifest.dataset_stats,
      data_warning: sequenceManifest.data_warning,
    },

    event_vocabulary: {
      schema_version: vocabulary.schema_version,
      padding_token: vocabulary.padding_token,
      event_type_vocab: vocabulary.event_type_vocab,
      block_events_reserved: vocabulary.block_events_reserved,
      note: vocabulary.note,
      active_event_count: activeEventCount,
      total_vocab_entries: Object.keys(vocabulary.event_type_vocab).length,
    },

    feature_scaler: {
      schema_version: scaler.schema_version,
      feature_names: scaler.feature_names,
      n_samples_seen: scaler.n_samples_seen,
      fit_split: scaler.fit_split,
    },

    tag_structure: {
      schema_version: tagManifest.schema_version,
      created_at_utc: tagManifest.created_at_utc,
      transition_types: tagManifest.transition_types,
      transition_type_count: tagManifest.transition_types.length,
      graph_feature_names: tagManifest.graph_feature_names,
      graph_feature_count: tagManifest.n_features,
      dataset_stats: {
        total_sequences: tagManifest.dataset_stats.total_sequences,
        total_nodes: tagManifest.dataset_stats.total_nodes,
        total_edges: tagManifest.dataset_stats.total_edges,
        train_sequences: tagManifest.dataset_stats.train_sequences,
        test_sequences: tagManifest.dataset_stats.test_sequences,
        feature_leakage_check: tagManifest.dataset_stats.feature_leakage_check,
        nan_in_features: tagManifest.dataset_stats.nan_in_features,
      },
      data_warning: tagManifest.data_warning,
    },

    model_sequence_config: {
      lstm: summary.model_configs.lstm,
      gru: summary.model_configs.gru,
    },

    validation: summary.validation,

    artifact_versions: {
      phase4_ui_summary: {
        schema_version: summary.schema_version,
      },
      sequence_manifest: {
        schema_version: sequenceManifest.schema_version,
        created_at_utc: sequenceManifest.created_at_utc,
        phase3_source_sha: sequenceManifest.phase3_source_sha,
      },
      vocabulary: {
        schema_version: vocabulary.schema_version,
      },
      scaler: {
        schema_version: scaler.schema_version,
      },
      tag_manifest: {
        schema_version: tagManifest.schema_version,
        created_at_utc: tagManifest.created_at_utc,
        phase3_source_sha: tagManifest.phase3_source_sha,
        m2_manifest_sha: tagManifest.m2_manifest_sha,
        artifact_checksums: tagManifest.artifact_checksums,
      },
    },

    limitations: [
      // Blocked pending offline sequence analytics artifact
      "Event frequency distribution — blocked: offline parquet artifact not loaded server-side",
      "Sequence length distribution — blocked: offline parquet artifact not loaded server-side",
      "Per-transition-type frequency counts — blocked: offline parquet artifact not loaded server-side",
      "TAG feature distributions — blocked: offline parquet artifact not loaded server-side",
      // Blocked pending research design decision
      "Frequent sequential patterns (PrefixSpan/GSP) — blocked: research design decision pending",
      "Pre-submission behavioral paths — blocked: research design decision pending",
      // Unsupported in current pilot
      "Learner-group comparison on sequences — unsupported: proxy_target_circularity=true",
      "Per-sequence prediction display — unsupported: not implemented in Phase 4 pipeline",
      "Statistical significance testing — unsupported: n=10 pilot, insufficient sample size",
      "Confirmatory analysis — unsupported: confirmatory_analysis_allowed=false",
    ],
  };

  return NextResponse.json(payload);
}
