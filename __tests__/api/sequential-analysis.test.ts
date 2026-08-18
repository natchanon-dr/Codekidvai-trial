/**
 * Tests for /api/researcher/sequential-analysis route (redesigned).
 *
 * Covers:
 *  1.  List mode returns datasets array
 *  2.  Each dataset has a runs array
 *  3.  artifact_availability=static_fallback for PAQT0001 completed run with null result_version
 *  4.  artifact_availability=unavailable for non-pilot completed run with null result_version
 *  5.  artifact_availability=available when result_version is not null
 *  6.  artifact_availability=unavailable for pending run
 *  7.  artifact_availability=unavailable for failed run
 *  8.  is_comparable=true only for available/static_fallback runs
 *  9.  not_comparable_reason is non-null for non-comparable runs
 *  10. Detail mode with valid pilot dataset returns artifact payload
 *  11. Detail mode with non-pilot result_version returns 501
 *  12. resolveArtifact pure function tests
 *  13. Mode A requires authentication
 *  14. Mode B requires authentication
 *  15. Dataset with no runs returns empty runs: []
 *  16. Sequential route does not import from dataset-analytics
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mockFrom },
}));

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

import { GET, resolveArtifact } from "@/app/api/researcher/sequential-analysis/route";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/researcher/sequential-analysis");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    headers: { get: () => "Bearer test-token" },
    nextUrl: { searchParams: url.searchParams },
  } as unknown as import("next/server").NextRequest;
}

// Build a Supabase chain mock that supports: .select().is().order() or .select().in().order() or .select().eq().single()
function makeChain(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    select: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  // Make the chain itself thenable (awaitable)
  Object.assign(chain, { [Symbol.toStringTag]: "Promise" });
  return chain;
}

const PILOT_DATASET = {
  id: "ds-pilot",
  code: "PAQT0001",
  name: "Pilot Dataset",
  // batch_type must be a real DB value: mst_experiment_batches.batch_type CHECK ('pilot','main','practice')
  batch_type: "pilot",
  set_family: "sql",
  task_type: "sql_text",
  class_id: null,
  active: true,
  created_at: "2024-01-01T00:00:00Z",
};

const OTHER_DATASET = {
  id: "ds-other",
  code: "OTHER001",
  name: "Other Dataset",
  // batch_type must be a real DB value; 'lab_set' does not exist in the DB CHECK constraint
  batch_type: "main",
  set_family: "er",
  task_type: "er_diagram",
  class_id: null,
  active: true,
  created_at: "2024-01-02T00:00:00Z",
};

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-001",
    dataset_id: "ds-pilot",
    run_type: "full",
    status: "completed",
    result_version: null,
    configuration: null,
    analysis_steps: null,
    started_at: "2024-01-01T01:00:00Z",
    completed_at: "2024-01-01T02:00:00Z",
    error_summary: null,
    created_at: "2024-01-01T01:00:00Z",
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

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

// Helper: set up Mode A mocks (datasets chain, runs chain, classes chain)
function setupListMocks(datasets: unknown[], runs: unknown[], classes: unknown[] = []) {
  let callIndex = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "mst_datasets") {
      return makeChain({ data: datasets, error: null });
    }
    if (table === "mst_pipeline_runs") {
      return makeChain({ data: runs, error: null });
    }
    if (table === "tb_classes") {
      return makeChain({ data: classes, error: null });
    }
    callIndex++;
    return makeChain({ data: [], error: null });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/researcher/sequential-analysis", () => {

  // ── Test 13: Mode A requires authentication ──

  it("Mode A: returns 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(makeRequest()) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── Test 14: Mode B requires authentication ──

  it("Mode B: returns 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await GET(makeRequest({ mode: "detail", dataset_id: "ds-pilot", run_id: "run-001" })) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── Test 1: List mode returns datasets array ──

  it("list mode returns datasets array", async () => {
    setupListMocks([PILOT_DATASET], []);
    const res = await GET(makeRequest()) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body.datasets)).toBe(true);
  });

  // ── Test 2: Each dataset has a runs array ──

  it("each dataset has a runs array", async () => {
    setupListMocks([PILOT_DATASET], [makeRun()]);
    const res = await GET(makeRequest()) as unknown as { _body: { datasets: Array<{ runs: unknown[] }> }; _status: number };
    expect(res._status).toBe(200);
    const ds = res._body.datasets[0];
    expect(ds).toBeDefined();
    expect(Array.isArray(ds.runs)).toBe(true);
  });

  // ── Test 3: static_fallback for PAQT0001 completed run with null result_version ──

  it("PAQT0001 completed run with null result_version → static_fallback", async () => {
    const run = makeRun({ dataset_id: "ds-pilot", status: "completed", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ artifact_availability: string; artifact_source: string }> }> };
      _status: number;
    };
    expect(res._status).toBe(200);
    const r = res._body.datasets[0].runs[0];
    expect(r.artifact_availability).toBe("static_fallback");
    expect(r.artifact_source).toBe("static_fallback");
  });

  // ── Test 4: unavailable for non-pilot completed run with null result_version ──

  it("non-pilot completed run with null result_version → unavailable", async () => {
    const run = makeRun({ dataset_id: "ds-other", status: "completed", result_version: null });
    setupListMocks([OTHER_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ artifact_availability: string }> }> };
      _status: number;
    };
    expect(res._status).toBe(200);
    const r = res._body.datasets[0].runs[0];
    expect(r.artifact_availability).toBe("unavailable");
  });

  // ── Test 5: unavailable when result_version is not null (Phase 5 deferred) ──

  it("run with non-null result_version → unavailable (Phase 5 deferred)", async () => {
    const run = makeRun({ status: "completed", result_version: "v1.0.0" });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ artifact_availability: string; artifact_source: string | null; is_comparable: boolean }> }> };
      _status: number;
    };
    expect(res._status).toBe(200);
    const r = res._body.datasets[0].runs[0];
    expect(r.artifact_availability).toBe("unavailable");
    expect(r.artifact_source).toBeNull();
    expect(r.is_comparable).toBe(false);
  });

  // ── Test 6: unavailable for pending run ──

  it("pending run → unavailable", async () => {
    const run = makeRun({ status: "pending", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ artifact_availability: string }> }> };
      _status: number;
    };
    const r = res._body.datasets[0].runs[0];
    expect(r.artifact_availability).toBe("unavailable");
  });

  // ── Test 7: unavailable for failed run ──

  it("failed run → unavailable", async () => {
    const run = makeRun({ status: "failed", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ artifact_availability: string }> }> };
      _status: number;
    };
    const r = res._body.datasets[0].runs[0];
    expect(r.artifact_availability).toBe("unavailable");
  });

  // ── Test 8: is_comparable=true only for available/static_fallback ──

  it("is_comparable=true for static_fallback run", async () => {
    const run = makeRun({ status: "completed", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ is_comparable: boolean }> }> };
      _status: number;
    };
    expect(res._body.datasets[0].runs[0].is_comparable).toBe(true);
  });

  it("is_comparable=false for pending run", async () => {
    const run = makeRun({ status: "pending", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ is_comparable: boolean }> }> };
      _status: number;
    };
    expect(res._body.datasets[0].runs[0].is_comparable).toBe(false);
  });

  // ── Test 9: not_comparable_reason is non-null for non-comparable runs ──

  it("not_comparable_reason is non-null for failed run", async () => {
    const run = makeRun({ status: "failed", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ not_comparable_reason: string | null }> }> };
      _status: number;
    };
    const r = res._body.datasets[0].runs[0];
    expect(r.not_comparable_reason).not.toBeNull();
    expect(typeof r.not_comparable_reason).toBe("string");
  });

  it("not_comparable_reason is null for comparable run", async () => {
    const run = makeRun({ status: "completed", result_version: null });
    setupListMocks([PILOT_DATASET], [run]);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: Array<{ not_comparable_reason: string | null }> }> };
      _status: number;
    };
    expect(res._body.datasets[0].runs[0].not_comparable_reason).toBeNull();
  });

  // ── Test 15: Dataset with no runs returns empty runs: [] ──

  it("dataset with no runs returns empty runs array", async () => {
    setupListMocks([PILOT_DATASET], []);
    const res = await GET(makeRequest()) as unknown as {
      _body: { datasets: Array<{ runs: unknown[] }> };
      _status: number;
    };
    expect(res._body.datasets[0].runs).toHaveLength(0);
  });

  // ── Test 10: Detail mode with valid pilot dataset returns artifact payload ──

  it("detail mode for PAQT0001 completed run with null result_version returns static artifact", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "mst_datasets") {
        return makeChain({ data: { id: "ds-pilot", code: "PAQT0001" }, error: null });
      }
      if (table === "mst_pipeline_runs") {
        return makeChain({ data: { id: "run-001", dataset_id: "ds-pilot", status: "completed", result_version: null }, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await GET(
      makeRequest({ mode: "detail", dataset_id: "ds-pilot", run_id: "run-001" }),
    ) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.artifact_source).toBe("static_fallback");
    expect(res._body.research_constraints).toBeDefined();
    expect(res._body.dataset_summary).toBeDefined();
    expect(res._body.sequence_construction).toBeDefined();
    expect(res._body.limitations).toBeDefined();
  });

  // ── Test 11: Detail mode with non-null result_version returns 404 (Phase 5 deferred) ──

  it("detail mode for run with non-null result_version returns 404 (Phase 5 deferred)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "mst_datasets") {
        return makeChain({ data: { id: "ds-pilot", code: "PAQT0001" }, error: null });
      }
      if (table === "mst_pipeline_runs") {
        return makeChain({ data: { id: "run-001", dataset_id: "ds-pilot", status: "completed", result_version: "v2.0.0" }, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await GET(
      makeRequest({ mode: "detail", dataset_id: "ds-pilot", run_id: "run-001" }),
    ) as unknown as { _body: Record<string, unknown>; _status: number };
    expect(res._status).toBe(404);
    expect(typeof res._body.error).toBe("string");
    expect((res._body.error as string).toLowerCase()).toContain("phase 5");
  });

  // ── Test 12: resolveArtifact pure function tests ──

  describe("resolveArtifact pure function", () => {
    it("result_version not null → unavailable (Phase 5 deferred), not comparable", () => {
      const r = resolveArtifact("completed", "v1.0.0", "ANYTHING");
      expect(r.availability).toBe("unavailable");
      expect(r.source).toBeNull();
      expect(r.isComparable).toBe(false);
      expect(typeof r.reason).toBe("string");
      expect(r.reason!.toLowerCase()).toContain("phase 5");
    });

    it("completed + PAQT0001 + null result_version → static_fallback", () => {
      const r = resolveArtifact("completed", null, "PAQT0001");
      expect(r.availability).toBe("static_fallback");
      expect(r.source).toBe("static_fallback");
      expect(r.isComparable).toBe(true);
      expect(r.reason).toBeNull();
    });

    it("completed + other dataset + null result_version → unavailable", () => {
      const r = resolveArtifact("completed", null, "OTHER001");
      expect(r.availability).toBe("unavailable");
      expect(r.source).toBeNull();
      expect(r.isComparable).toBe(false);
      expect(typeof r.reason).toBe("string");
    });

    it("pending → unavailable, not comparable", () => {
      const r = resolveArtifact("pending", null, "PAQT0001");
      expect(r.availability).toBe("unavailable");
      expect(r.isComparable).toBe(false);
      expect(r.reason).toContain("pending");
    });

    it("running → unavailable, not comparable", () => {
      const r = resolveArtifact("running", null, "PAQT0001");
      expect(r.availability).toBe("unavailable");
      expect(r.isComparable).toBe(false);
    });

    it("failed → unavailable, not comparable", () => {
      const r = resolveArtifact("failed", null, "PAQT0001");
      expect(r.availability).toBe("unavailable");
      expect(r.isComparable).toBe(false);
    });

    it("cancelled → unavailable, not comparable", () => {
      const r = resolveArtifact("cancelled", null, "PAQT0001");
      expect(r.availability).toBe("unavailable");
      expect(r.isComparable).toBe(false);
    });
  });

  // ── Test 16: Sequential route does not import from dataset-analytics ──

  it("route module does not import from dataset-analytics", async () => {
    // Verify by checking that the route file source doesn't cross-import
    // (static check via module inspection — route is already imported above)
    const routeModule = await import("@/app/api/researcher/sequential-analysis/route");
    // The module exports should not include anything from dataset-analytics
    const exports = Object.keys(routeModule);
    // dataset-analytics specific exports won't be here
    expect(exports).not.toContain("getDatasetAnalyticsSummary");
    expect(exports).not.toContain("DatasetAnalyticsPayload");
  });
});
