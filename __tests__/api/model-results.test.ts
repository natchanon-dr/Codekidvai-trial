/**
 * Tests for /api/researcher/model-results route.
 *
 * Covers:
 *   - authorization (401 when auth throws)
 *   - label validity fields present
 *   - model list shape (6 models, canonical names)
 *   - Dummy: strategy = most_frequent, pr_auc = 0.5
 *   - non-Dummy: pr_auc = 1.0
 *   - seed_stability block (lstm + gru)
 *   - validation block
 *   - model_configs (lstm + gru) with corrected param counts
 *   - LSTM EXP-A params = 5,665; EXP-B params = 5,683 (A1)
 *   - LSTM architecture_exp_a and architecture_exp_b exist and differ (A1)
 *   - test_class_distribution present with positive + negative (A3)
 *   - confirmatory_analysis_allowed = false
 *   - GRU param counts (EXP-A = 4,257; EXP-B = 4,275)
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

import { GET } from "@/app/api/researcher/model-results/route";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest() {
  return {
    headers: { get: () => "Bearer test-token" },
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as import("next/server").NextRequest;
}

type ArtifactModel = {
  name: string;
  pr_auc?: number | null;
  strategy?: string;
  type?: string;
};

type ArtifactModelConfig = {
  trainable_params_exp_a: number;
  trainable_params_exp_b: number;
  architecture: string;
  architecture_exp_a?: string;
  architecture_exp_b?: string;
};

type ResponseBody = {
  evaluation_purpose?: string;
  label_source?: string;
  label_validity?: string;
  proxy_target_circularity?: boolean;
  confirmatory_analysis_allowed?: boolean;
  data_warning?: string;
  model_comparison?: {
    models?: ArtifactModel[];
    test_class_distribution?: { positive: number; negative: number };
  };
  seed_stability?: {
    lstm?: object;
    gru?: object;
  };
  validation?: {
    checks_run?: number;
    checks_passed?: number;
  };
  model_configs?: {
    lstm?: ArtifactModelConfig;
    gru?: ArtifactModelConfig;
  };
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

describe("GET /api/researcher/model-results", () => {

  // ── Authorization ──

  it("returns 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(makeRequest()) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── Label validity fields ──

  it("returns 200 with all label validity fields", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.evaluation_purpose).toBe("technical_pipeline_validation");
    expect(res._body.label_source).toBe("proxy_behavioral");
    expect(res._body.label_validity).toBe("pilot_only");
    expect(res._body.proxy_target_circularity).toBe(true);
    expect(res._body.confirmatory_analysis_allowed).toBe(false);
    expect(typeof res._body.data_warning).toBe("string");
  });

  // ── confirmatory_analysis_allowed ──

  it("confirmatory_analysis_allowed is false", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.confirmatory_analysis_allowed).toBe(false);
  });

  // ── Model list ──

  it("model_comparison.models contains exactly 6 entries", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_comparison?.models).toHaveLength(6);
  });

  it("model names match the canonical list", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const names = (res._body.model_comparison?.models ?? []).map((m: ArtifactModel) => m.name);
    expect(names).toEqual([
      "Dummy",
      "Logistic Regression",
      "Random Forest",
      "TAG-based LR",
      "LSTM",
      "GRU",
    ]);
  });

  // ── Dummy model ──

  it("Dummy model has pr_auc = 0.5 and strategy = 'most_frequent'", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const dummy = (res._body.model_comparison?.models ?? []).find((m: ArtifactModel) => m.name === "Dummy");
    expect(dummy).toBeDefined();
    expect(dummy?.pr_auc).toBe(0.5);
    expect(dummy?.strategy).toBe("most_frequent");
  });

  // ── Non-Dummy models ──

  it("all non-Dummy models have pr_auc = 1.0", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const nonDummy = (res._body.model_comparison?.models ?? []).filter((m: ArtifactModel) => m.name !== "Dummy");
    for (const m of nonDummy) {
      expect(m.pr_auc).toBe(1.0);
    }
  });

  // ── Seed stability ──

  it("response includes seed_stability with lstm and gru blocks", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.seed_stability?.lstm).toBeDefined();
    expect(res._body.seed_stability?.gru).toBeDefined();
  });

  // ── Validation block ──

  it("response includes validation with checks_run and checks_passed", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(typeof res._body.validation?.checks_run).toBe("number");
    expect(typeof res._body.validation?.checks_passed).toBe("number");
  });

  // ── model_configs — LSTM ──

  it("model_configs includes lstm and gru entries", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_configs?.lstm).toBeDefined();
    expect(res._body.model_configs?.gru).toBeDefined();
  });

  it("LSTM trainable_params_exp_a = 5,665", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_configs?.lstm?.trainable_params_exp_a).toBe(5665);
  });

  it("LSTM trainable_params_exp_b = 5,683 (corrected from 5,665 recording error)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_configs?.lstm?.trainable_params_exp_b).toBe(5683);
  });

  it("LSTM trainable_params_exp_b differs from exp_a by exactly n_tag=18", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const lstm = res._body.model_configs?.lstm;
    expect(lstm).toBeDefined();
    expect(lstm!.trainable_params_exp_b - lstm!.trainable_params_exp_a).toBe(18);
  });

  it("LSTM architecture_exp_a and architecture_exp_b exist and are distinct", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const lstm = res._body.model_configs?.lstm;
    expect(typeof lstm?.architecture_exp_a).toBe("string");
    expect(typeof lstm?.architecture_exp_b).toBe("string");
    expect(lstm?.architecture_exp_a).not.toBe(lstm?.architecture_exp_b);
  });

  it("LSTM architecture_exp_b mentions Linear(50→1) and n_tag(18)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const archB = res._body.model_configs?.lstm?.architecture_exp_b ?? "";
    expect(archB).toContain("50");
    expect(archB).toContain("18");
  });

  // ── model_configs — GRU ──

  it("GRU trainable_params_exp_a = 4,257", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_configs?.gru?.trainable_params_exp_a).toBe(4257);
  });

  it("GRU trainable_params_exp_b = 4,275", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    expect(res._body.model_configs?.gru?.trainable_params_exp_b).toBe(4275);
  });

  // ── test_class_distribution ──

  it("model_comparison has test_class_distribution with positive and negative counts", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const dist = res._body.model_comparison?.test_class_distribution;
    expect(dist).toBeDefined();
    expect(typeof dist?.positive).toBe("number");
    expect(typeof dist?.negative).toBe("number");
  });

  it("test_class_distribution positive + negative = test_sequences (18)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const dist = res._body.model_comparison?.test_class_distribution;
    expect(dist).toBeDefined();
    expect(dist!.positive + dist!.negative).toBe(18);
  });

  it("test_class_distribution positive = 9, negative = 9 (balanced pilot split)", async () => {
    const res = await GET(makeRequest()) as unknown as { _body: ResponseBody; _status: number };
    const dist = res._body.model_comparison?.test_class_distribution;
    expect(dist?.positive).toBe(9);
    expect(dist?.negative).toBe(9);
  });

  // ── Artifact direct assertions (no network) ──

  it("artifact LSTM trainable_params_exp_b = 5,683 (direct artifact read)", () => {
    type Cfg = { trainable_params_exp_a: number; trainable_params_exp_b: number };
    const lstm = (artifact as { model_configs?: { lstm?: Cfg } }).model_configs?.lstm;
    expect(lstm?.trainable_params_exp_b).toBe(5683);
  });

  it("artifact Dummy strategy = 'most_frequent' (direct artifact read)", () => {
    type Model = { name: string; strategy?: string };
    const dummy = (artifact as { model_comparison?: { models?: Model[] } })
      .model_comparison?.models?.find(m => m.name === "Dummy");
    expect(dummy?.strategy).toBe("most_frequent");
  });

});
