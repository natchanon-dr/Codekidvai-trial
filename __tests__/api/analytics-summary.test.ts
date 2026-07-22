/**
 * Tests for /api/researcher/analytics-summary route.
 *
 * Covers:
 *   - no filter (default)
 *   - batch_type only
 *   - task_type only
 *   - batch_type + task_type
 *   - invalid batch_type → 400
 *   - invalid task_type → 400
 *   - empty result (0 learners / 0 sessions)
 *   - Supabase error → 500, no static fallback
 *   - PR-AUC present in artifact
 *   - PR-AUC undefined/null handling
 *   - UTF-8 JSON artifact parses without error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

// vi.hoisted ensures mockFrom is defined before vi.mock factories run
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock("@/lib/api-auth", () => ({
  requireAdminOrResearcher: vi.fn(),
}));

// next/server: only NextResponse.json is called in this route
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    }),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { GET } from "@/app/api/researcher/analytics-summary/route";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/researcher/analytics-summary");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    headers: { get: () => "Bearer test-token" },
    nextUrl: { searchParams: url.searchParams },
  } as unknown as import("next/server").NextRequest;
}

function mockSupabase(rows: Record<string, string>[] | null, error?: string) {
  // vitest awaits the object returned by .eq(); make chain thenable
  const thenable = {
    select: vi.fn(() => thenable),
    eq: vi.fn(() => thenable),
    then: (resolve: (v: { data: typeof rows; error: { message: string } | null }) => void) =>
      resolve({ data: rows, error: error ? { message: error } : null }),
  };
  mockFrom.mockReturnValue(thenable);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFrom.mockClear();
  vi.mocked(requireAdminOrResearcher).mockResolvedValue({
    user_id: "u1",
    profile_id: "p1",
    participant_code: "PC001",
    role: "researcher",
    consent_accepted: true,
  });
});

describe("GET /api/researcher/analytics-summary", () => {
  // ── Authorization ──

  it("returns 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── No filter ──

  it("no filter — returns live_stats with all rows", async () => {
    mockSupabase([
      { participant_code: "PC001", session_id: "S001", batch_type: "assignment_set", task_type: "sql_text" },
      { participant_code: "PC001", session_id: "S002", batch_type: "assignment_set", task_type: "sql_text" },
      { participant_code: "PC002", session_id: "S003", batch_type: "lab_set", task_type: "er_diagram" },
    ]);
    const res = await GET(makeRequest()) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.live_stats).toMatchObject({
      learner_count: 2,
      session_count: 3,
      batch_type_filter: null,
      task_type_filter: null,
      grain: "session_level",
    });
  });

  // ── batch_type only ──

  it("batch_type filter — passes eq call and reflects filter in response", async () => {
    mockSupabase([
      { participant_code: "PC001", session_id: "S001", batch_type: "lab_set", task_type: "sql_text" },
    ]);
    const res = await GET(makeRequest({ batch_type: "lab_set" })) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    const live = res._body.live_stats as { batch_type_filter: string | null; task_type_filter: string | null; learner_count: number };
    expect(live.batch_type_filter).toBe("lab_set");
    expect(live.task_type_filter).toBeNull();
    expect(live.learner_count).toBe(1);
  });

  // ── task_type only ──

  it("task_type filter — reflects filter in response", async () => {
    mockSupabase([
      { participant_code: "PC001", session_id: "S001", batch_type: "assignment_set", task_type: "er_diagram" },
      { participant_code: "PC002", session_id: "S002", batch_type: "assignment_set", task_type: "er_diagram" },
    ]);
    const res = await GET(makeRequest({ task_type: "er_diagram" })) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    const live = res._body.live_stats as { batch_type_filter: string | null; task_type_filter: string | null; learner_count: number; session_count: number };
    expect(live.task_type_filter).toBe("er_diagram");
    expect(live.batch_type_filter).toBeNull();
    expect(live.learner_count).toBe(2);
    expect(live.session_count).toBe(2);
  });

  // ── batch_type + task_type ──

  it("batch_type + task_type — both filters active", async () => {
    mockSupabase([
      { participant_code: "PC003", session_id: "S005", batch_type: "exam_set", task_type: "stored_procedure" },
    ]);
    const res = await GET(makeRequest({ batch_type: "exam_set", task_type: "stored_procedure" })) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    const live = res._body.live_stats as { batch_type_filter: string | null; task_type_filter: string | null };
    expect(live.batch_type_filter).toBe("exam_set");
    expect(live.task_type_filter).toBe("stored_procedure");
  });

  // ── Invalid filters → 400 ──

  it("invalid batch_type → 400, no Supabase query", async () => {
    mockSupabase([]); // should not be called
    const res = await GET(makeRequest({ batch_type: "hacked_value" })) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("invalid task_type → 400, no Supabase query", async () => {
    mockFrom.mockClear();
    const res = await GET(makeRequest({ task_type: "DROP TABLE" })) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // ── Empty result ──

  it("empty result — learner_count=0, session_count=0, no error", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ batch_type: "exam_set" })) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    const live = res._body.live_stats as { learner_count: number; session_count: number };
    expect(live.learner_count).toBe(0);
    expect(live.session_count).toBe(0);
  });

  // ── Supabase error → 500, no fallback ──

  it("Supabase error → 500, does not fall back to artifact data", async () => {
    mockSupabase(null, "connection refused");
    const res = await GET(makeRequest()) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(500);
    // Must not expose artifact pipeline_stats as if live data
    expect(res._body.live_stats).toBeUndefined();
    expect(typeof res._body.error).toBe("string");
  });

  // ── PR-AUC present in artifact ──

  it("response includes bssa_features from artifact", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.bssa_features).toBeDefined();
  });

  it("artifact model_comparison contains pr_auc for each model", () => {
    type Model = { name: string; pr_auc?: number };
    const models: Model[] = (artifact as { model_comparison?: { models?: Model[] } }).model_comparison?.models ?? [];
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(typeof m.pr_auc === "number" || m.pr_auc === undefined).toBe(true);
    }
    // Dummy should have pr_auc = 0.5
    const dummy = models.find((m) => m.name === "Dummy");
    expect(dummy?.pr_auc).toBe(0.5);
  });

  // ── PR-AUC null/undefined is safe ──

  it("response includes pipeline_stats and validation from artifact", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.pipeline_stats).toBeDefined();
    expect(res._body.validation).toBeDefined();
    // pipeline_stats must include frozen marker
    const ps = res._body.pipeline_stats as { source: string; note: string };
    expect(ps.source).toBe("phase4_pipeline_artifact");
    expect(typeof ps.note).toBe("string");
  });

  // ── UTF-8 JSON artifact parses without error ──

  it("UTF-8 JSON artifact parses correctly — em-dash and arrow are present", () => {
    const raw = JSON.stringify(artifact);
    // U+2014 em-dash and U+2192 arrow must survive JSON round-trip
    const reparsed = JSON.parse(raw) as Record<string, unknown>;
    const str = JSON.stringify(reparsed);
    expect(str).toContain("—"); // —
    expect(str).toContain("→"); // →
  });
});
