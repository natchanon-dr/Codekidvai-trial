/**
 * Tests for /api/researcher/sequential-analysis route.
 *
 * Covers:
 *   - 401 when auth throws
 *   - Response shape has all required top-level keys
 *   - research_constraints has proxy_target_circularity and confirmatory_analysis_allowed
 *   - event_vocabulary has correct number of active types (5) and total entries (9)
 *   - tag_structure has transition_types with correct count (8)
 *   - model_sequence_config has lstm and gru entries
 *   - validation checks_passed count matches checks_run
 *   - artifact_versions has version strings and hashes
 *   - No fabricated values (no event frequency counts in response)
 *   - limitations is a non-empty array of strings
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  requireAdminOrResearcher: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    }),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { GET } from "@/app/api/researcher/sequential-analysis/route";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import vocabulary from "@/lib/research-artifacts/phase4/vocabulary_v1.json";
import tagManifest from "@/lib/research-artifacts/phase4/tag_manifest_v1.json";
import summary from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest() {
  return {
    headers: { get: () => "Bearer test-token" },
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as import("next/server").NextRequest;
}

type ResponseBody = {
  research_constraints?: {
    evaluation_purpose?: string;
    label_source?: string;
    label_validity?: string;
    proxy_target_circularity?: boolean;
    confirmatory_analysis_allowed?: boolean;
    data_warning?: string;
  };
  dataset_summary?: object;
  sequence_construction?: object;
  event_vocabulary?: {
    schema_version?: string;
    padding_token?: number;
    event_type_vocab?: Record<string, number>;
    block_events_reserved?: string[];
    active_event_count?: number;
    total_vocab_entries?: number;
  };
  feature_scaler?: {
    feature_names?: string[];
    fit_split?: string;
  };
  tag_structure?: {
    transition_types?: string[];
    transition_type_count?: number;
    graph_feature_names?: string[];
    graph_feature_count?: number;
    dataset_stats?: object;
  };
  model_sequence_config?: {
    lstm?: object;
    gru?: object;
  };
  validation?: {
    checks_run?: number;
    checks_passed?: number;
    no_learner_overlap?: boolean;
    no_pii_in_exports?: boolean;
    leakage_check_passed?: boolean;
    split_integrity_passed?: boolean;
  };
  artifact_versions?: {
    phase4_ui_summary?: { schema_version?: string };
    sequence_manifest?: { schema_version?: string; phase3_source_sha?: string };
    vocabulary?: { schema_version?: string };
    scaler?: { schema_version?: string };
    tag_manifest?: {
      schema_version?: string;
      m2_manifest_sha?: string;
      artifact_checksums?: Record<string, string>;
    };
  };
  limitations?: string[];
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(requireAdminOrResearcher).mockResolvedValue({
    user_id: "u1",
    profile_id: "p1",
    participant_code: "PC001",
    role: "researcher",
    consent_accepted: true,
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/researcher/sequential-analysis", () => {

  // ── Authorization ──

  it("returns 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(makeRequest()) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── Top-level shape ──

  it("returns 200 with all required top-level keys", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.research_constraints).toBeDefined();
    expect(res._body.dataset_summary).toBeDefined();
    expect(res._body.sequence_construction).toBeDefined();
    expect(res._body.event_vocabulary).toBeDefined();
    expect(res._body.feature_scaler).toBeDefined();
    expect(res._body.tag_structure).toBeDefined();
    expect(res._body.model_sequence_config).toBeDefined();
    expect(res._body.validation).toBeDefined();
    expect(res._body.artifact_versions).toBeDefined();
    expect(res._body.limitations).toBeDefined();
  });

  // ── research_constraints ──

  it("research_constraints has proxy_target_circularity = true", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.research_constraints?.proxy_target_circularity).toBe(true);
  });

  it("research_constraints has confirmatory_analysis_allowed = false", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.research_constraints?.confirmatory_analysis_allowed).toBe(false);
  });

  it("research_constraints has all label validity fields", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.research_constraints?.evaluation_purpose).toBe("technical_pipeline_validation");
    expect(res._body.research_constraints?.label_source).toBe("proxy_behavioral");
    expect(res._body.research_constraints?.label_validity).toBe("pilot_only");
    expect(typeof res._body.research_constraints?.data_warning).toBe("string");
  });

  // ── event_vocabulary ──

  it("event_vocabulary total_vocab_entries = 9 (all vocab entries)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.event_vocabulary?.total_vocab_entries).toBe(
      Object.keys(vocabulary.event_type_vocab).length,
    );
  });

  it("event_vocabulary active_event_count = 5 (non-block events)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const activeCount = Object.keys(vocabulary.event_type_vocab).filter(
      (k) => !vocabulary.block_events_reserved.includes(k),
    ).length;
    expect(res._body.event_vocabulary?.active_event_count).toBe(activeCount);
  });

  it("event_vocabulary has padding_token = 0", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.event_vocabulary?.padding_token).toBe(0);
  });

  it("event_vocabulary has 4 block_events_reserved entries", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.event_vocabulary?.block_events_reserved).toHaveLength(
      vocabulary.block_events_reserved.length,
    );
  });

  // ── tag_structure ──

  it("tag_structure transition_type_count = 8", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.tag_structure?.transition_type_count).toBe(
      tagManifest.transition_types.length,
    );
  });

  it("tag_structure graph_feature_count = 18", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.tag_structure?.graph_feature_count).toBe(tagManifest.n_features);
  });

  it("tag_structure has transition_types array", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(Array.isArray(res._body.tag_structure?.transition_types)).toBe(true);
    expect(res._body.tag_structure?.transition_types).toHaveLength(tagManifest.transition_types.length);
  });

  // ── model_sequence_config ──

  it("model_sequence_config has lstm and gru entries", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_sequence_config?.lstm).toBeDefined();
    expect(res._body.model_sequence_config?.gru).toBeDefined();
  });

  // ── validation ──

  it("validation checks_passed equals checks_run (all pass)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.validation?.checks_passed).toBe(res._body.validation?.checks_run);
    expect(res._body.validation?.checks_run).toBe(summary.validation.checks_run);
  });

  it("validation structural checks all true", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.validation?.no_learner_overlap).toBe(true);
    expect(res._body.validation?.no_pii_in_exports).toBe(true);
    expect(res._body.validation?.leakage_check_passed).toBe(true);
    expect(res._body.validation?.split_integrity_passed).toBe(true);
  });

  // ── artifact_versions ──

  it("artifact_versions has schema_version strings for all artifacts", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(typeof res._body.artifact_versions?.phase4_ui_summary?.schema_version).toBe("string");
    expect(typeof res._body.artifact_versions?.sequence_manifest?.schema_version).toBe("string");
    expect(typeof res._body.artifact_versions?.vocabulary?.schema_version).toBe("string");
    expect(typeof res._body.artifact_versions?.scaler?.schema_version).toBe("string");
    expect(typeof res._body.artifact_versions?.tag_manifest?.schema_version).toBe("string");
  });

  it("artifact_versions tag_manifest has m2_manifest_sha hash", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(typeof res._body.artifact_versions?.tag_manifest?.m2_manifest_sha).toBe("string");
    expect(res._body.artifact_versions?.tag_manifest?.m2_manifest_sha).toBe(tagManifest.m2_manifest_sha);
  });

  it("artifact_versions tag_manifest artifact_checksums has 5 entries", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const checksums = res._body.artifact_versions?.tag_manifest?.artifact_checksums;
    expect(checksums).toBeDefined();
    expect(Object.keys(checksums ?? {}).length).toBe(5);
  });

  // ── No fabricated values ──

  it("response does not include event frequency counts", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: Record<string, unknown>; _status: number };
    // These keys must not appear at top-level or nested in event_vocabulary
    const bodyStr = JSON.stringify(res._body);
    expect(bodyStr).not.toContain("event_frequencies");
    expect(bodyStr).not.toContain("transition_matrix");
    expect(bodyStr).not.toContain("event_counts");
  });

  // ── limitations ──

  it("limitations is a non-empty array of strings", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(Array.isArray(res._body.limitations)).toBe(true);
    expect((res._body.limitations ?? []).length).toBeGreaterThan(0);
    for (const lim of res._body.limitations ?? []) {
      expect(typeof lim).toBe("string");
    }
  });

  it("limitations mentions confirmatory_analysis_allowed=false", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const hasConfirmatory = (res._body.limitations ?? []).some((l) =>
      l.includes("confirmatory"),
    );
    expect(hasConfirmatory).toBe(true);
  });

});
