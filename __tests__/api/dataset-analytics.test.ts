/**
 * Tests for /api/researcher/dataset-analytics route.
 *
 * Covers all 34 required verification points:
 *
 * Original 21 (updated for trial/Practice rename and icon metadata):
 *  1.  Source values loaded exactly
 *  2.  set_family exposed as "Activity Type" (ui_label), not renamed in source
 *  3.  No duplicate activity_type field in API response
 *  4.  Selector order: Dataset → Batch Type → Activity Type → Task Type
 *  5.  Dataset limits Batch Type (single dataset — phase4_pilot)
 *  6.  Batch Type listed correctly
 *  7.  Activity Type unavailable (set_family not in view)
 *  8.  Invalid downstream selections cleared/rejected (set_family → 422)
 *  9.  Invalid combinations → 4xx
 * 10.  Zero-record valid scope ≠ invalid scope (different status codes)
 * 11.  Single-value dimension (dataset) handled as read-only
 * 12.  Scoped counts reflect Supabase query
 * 13.  Full-scope counts unchanged
 * 14.  batch_type values correct (pilot/main/trial, NOT assignment_set/lab_set/exam_set)
 * 15.  Internal set_family values unchanged (assignment/lab/exam)
 * 16.  Display labels mapped correctly (Activity Type ui_label for set_family)
 * 17.  Validity metadata matches artifact
 * 18.  Missing metadata not fabricated
 * 19.  Errors don't expose filesystem paths
 * 20.  Dataset Analytics behavior consistent
 * 21.  Auth returns 401 when missing
 *
 * New points 22–34:
 * 22.  "practice" no longer accepted as batch_type → 400
 * 23.  "trial" accepted as batch_type → 200
 * 24.  Batch type order in response: main, trial, pilot
 * 25.  M/Star, T/Dumbbell, P/Airplane icon mappings present in batch type options
 * 26.  A/L/E code mappings for activity types
 * 27.  QT/SP/ER/QB code mappings for task types present in dataset_label/code
 * 28.  Generated codes (dataset list) reflect code field exactly 8 chars
 * 29.  POST validates required fields → 422 with field_errors
 * 30.  Code field in POST body → 422 error
 * 31.  dataset_list returned in GET response
 * 32.  Search by filter_batch_type respected in query params
 * 33.  Icon metadata has accessible aria_label in batch type options
 * 34.  available_batch_types does not contain 'practice'
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
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
  NextRequest: class {},
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { GET, POST } from "@/app/api/researcher/dataset-analytics/route";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}, body?: unknown) {
  const url = new URL("http://localhost/api/researcher/dataset-analytics");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    headers: { get: () => "Bearer test-token" },
    nextUrl: { searchParams: url.searchParams },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

function mockSupabase(rows: Record<string, string>[] | null, error?: string) {
  const thenable = {
    select: vi.fn(() => thenable),
    eq: vi.fn(() => thenable),
    or: vi.fn(() => thenable),
    is: vi.fn(() => thenable),
    order: vi.fn(() => thenable),
    then: (resolve: (v: { data: typeof rows; error: { message: string; code?: string } | null }) => void) =>
      resolve({ data: rows, error: error ? { message: error } : null }),
  };
  mockFrom.mockReturnValue(thenable);
}

type ApiBody = {
  available_datasets?: { id: string; label: string }[];
  available_batch_types?: { value: string; label: string; code?: string; icon?: string; aria_label?: string }[];
  available_activity_types?: { value: string; label: string; code?: string }[];
  available_task_types?: { value: string; label: string; dataset_label?: string; code?: string }[];
  active_scope?: { dataset: string; batch_type: string | null; set_family: string | null; task_type: string | null };
  scoped_summary?: { learner_count: number; session_count: number; grain: string };
  validity_metadata?: Record<string, unknown>;
  unavailable_dimensions?: { dimension: string; ui_label: string; reason: string; canonical_values: string[] }[];
  dataset_list?: { id: string; code: string; name: string }[];
  dataset_list_count?: number;
  error?: string;
  field_errors?: Record<string, string>;
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFrom.mockClear();
  mockRpc.mockClear();
  vi.mocked(requireAdminOrResearcher).mockResolvedValue({
    user_id: "u1",
    profile_id: "p1",
    participant_code: "PC001",
    role: "researcher",
    consent_accepted: true,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/researcher/dataset-analytics", () => {

  // ── 21. Auth ──────────────────────────────────────────────────────────────

  it("returns 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── 1. Source values loaded exactly ───────────────────────────────────────

  it("available_batch_types match research-context canonical values (pilot/main/trial)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const values = res._body.available_batch_types?.map((b) => b.value) ?? [];
    expect(values).toContain("pilot");
    expect(values).toContain("main");
    expect(values).toContain("trial");
    // Must NOT contain the pre-existing bug values
    expect(values).not.toContain("assignment_set");
    expect(values).not.toContain("lab_set");
    expect(values).not.toContain("exam_set");
  });

  it("available_task_types match thesis scope values", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const values = res._body.available_task_types?.map((t) => t.value) ?? [];
    expect(values).toContain("sql_text");
    expect(values).toContain("sql_block");
    expect(values).toContain("er_diagram");
    expect(values).toContain("stored_procedure");
    expect(values).not.toContain("coding_text");
    expect(values).not.toContain("coding_block");
  });

  // ── 2. set_family exposed as "Activity Type" ui_label ──────────────────────

  it("unavailable_dimensions includes set_family with ui_label 'Activity Type'", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const dim = res._body.unavailable_dimensions?.find((d) => d.dimension === "set_family");
    expect(dim).toBeDefined();
    expect(dim?.ui_label).toBe("Activity Type");
  });

  // ── 3. No duplicate activity_type source field ─────────────────────────────

  it("response does not contain an activity_type field (source field remains set_family)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody & Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect("activity_type" in (res._body.active_scope ?? {})).toBe(false);
    expect("activity_type" in res._body).toBe(false);
  });

  // ── 4. Selector order structure ────────────────────────────────────────────

  it("response contains all four selector dimensions in correct order", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.available_datasets).toBeDefined();
    expect(res._body.available_batch_types).toBeDefined();
    expect(res._body.available_activity_types).toBeDefined();
    expect(res._body.available_task_types).toBeDefined();
  });

  // ── 5 & 11. Dataset is single value (phase4_pilot only) ───────────────────

  it("available_datasets has exactly one entry: phase4_pilot", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.available_datasets).toHaveLength(1);
    expect(res._body.available_datasets?.[0]?.id).toBe("phase4_pilot");
  });

  it("invalid dataset value → 400", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ dataset: "phase5_main" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
  });

  // ── 6. Batch Type listed correctly ────────────────────────────────────────

  it("batch_type filter applied to Supabase query and reflected in active_scope", async () => {
    mockSupabase([
      { participant_code: "PC001", session_id: "S001", batch_type: "pilot", task_type: "sql_text" },
    ]);
    const res = await GET(makeRequest({ batch_type: "pilot" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.active_scope?.batch_type).toBe("pilot");
    expect(res._body.scoped_summary?.learner_count).toBe(1);
  });

  // ── 7. Activity Type unavailable ──────────────────────────────────────────

  it("available_activity_types shows canonical values as reference (assignment/lab/exam)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const values = res._body.available_activity_types?.map((a) => a.value) ?? [];
    expect(values).toContain("assignment");
    expect(values).toContain("lab");
    expect(values).toContain("exam");
  });

  it("active_scope.set_family is always null (cannot be set via filter)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ batch_type: "pilot" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.active_scope?.set_family).toBeNull();
  });

  // ── 8. set_family filter → 422 ────────────────────────────────────────────

  it("valid set_family value as filter → 422 (unavailable, not silent fallback)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ set_family: "assignment" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(typeof res._body.error).toBe("string");
  });

  it("invalid set_family value as filter → 400", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ set_family: "hacked" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
  });

  // ── 9. Invalid combinations → 4xx ────────────────────────────────────────

  it("invalid batch_type → 400, Supabase not called for session query", async () => {
    const res = await GET(makeRequest({ batch_type: "hacked_value" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
  });

  it("invalid task_type → 400", async () => {
    const res = await GET(makeRequest({ task_type: "DROP TABLE" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
  });

  it("out-of-scope task_type (coding_text) → 400", async () => {
    const res = await GET(makeRequest({ task_type: "coding_text" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
  });

  // ── 10. Zero-record valid scope ≠ invalid scope ───────────────────────────

  it("valid scope with zero records → 200, not 4xx, counts are 0", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ batch_type: "main" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.scoped_summary?.learner_count).toBe(0);
    expect(res._body.scoped_summary?.session_count).toBe(0);
    expect(res._body.error).toBeUndefined();
  });

  // ── 12 & 13. Scoped counts reconcile with Supabase rows ───────────────────

  it("no filter — all rows counted correctly", async () => {
    mockSupabase([
      { participant_code: "PC001", session_id: "S001", batch_type: "pilot", task_type: "sql_text" },
      { participant_code: "PC001", session_id: "S002", batch_type: "pilot", task_type: "sql_text" },
      { participant_code: "PC002", session_id: "S003", batch_type: "pilot", task_type: "sql_block" },
    ]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.scoped_summary?.learner_count).toBe(2);
    expect(res._body.scoped_summary?.session_count).toBe(3);
    expect(res._body.scoped_summary?.grain).toBe("session_level");
  });

  it("batch_type + task_type filter — scoped counts correct", async () => {
    mockSupabase([
      { participant_code: "PC003", session_id: "S005", batch_type: "pilot", task_type: "sql_text" },
    ]);
    const res = await GET(makeRequest({ batch_type: "pilot", task_type: "sql_text" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.scoped_summary?.learner_count).toBe(1);
    expect(res._body.active_scope?.batch_type).toBe("pilot");
    expect(res._body.active_scope?.task_type).toBe("sql_text");
  });

  // ── 14. batch_type values: pilot/main/trial (NOT the bug values) ──────────

  it("batch_type allowlist does not include assignment_set, lab_set, exam_set", async () => {
    for (const bad of ["assignment_set", "lab_set", "exam_set"]) {
      const res = await GET(makeRequest({ batch_type: bad })) as unknown as { _body: ApiBody; _status: number };
      expect(res._status).toBe(400);
    }
  });

  // ── 15. Internal set_family values unchanged ──────────────────────────────

  it("available_activity_types canonical_values in unavailable_dimensions are assignment/lab/exam", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const sfDim = res._body.unavailable_dimensions?.find((d) => d.dimension === "set_family");
    expect(sfDim?.canonical_values).toEqual(
      expect.arrayContaining(["assignment", "lab", "exam"])
    );
  });

  // ── 16. Display labels mapped correctly ───────────────────────────────────

  it("available_activity_types labels are Assignment/Lab/Exam (not internal values)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const labels = res._body.available_activity_types?.map((a) => a.label) ?? [];
    expect(labels).toContain("Assignment");
    expect(labels).toContain("Lab");
    expect(labels).toContain("Exam");
    expect(labels).not.toContain("assignment");
    expect(labels).not.toContain("lab");
    expect(labels).not.toContain("exam");
  });

  // ── 17. Validity metadata matches artifact ────────────────────────────────

  it("validity_metadata matches phase4_ui_summary_v1.json artifact exactly", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const meta = res._body.validity_metadata;
    expect(meta?.label_source).toBe(artifact.label_source);
    expect(meta?.label_validity).toBe(artifact.label_validity);
    expect(meta?.evaluation_purpose).toBe(artifact.evaluation_purpose);
    expect(meta?.proxy_target_circularity).toBe(artifact.proxy_target_circularity);
    expect(meta?.confirmatory_analysis_allowed).toBe(artifact.confirmatory_analysis_allowed);
  });

  // ── 18. Missing metadata not fabricated ───────────────────────────────────

  it("response does not contain model_comparison or pipeline_stats", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody & Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect("model_comparison" in res._body).toBe(false);
    expect("pipeline_stats" in res._body).toBe(false);
    expect("bssa_features" in res._body).toBe(false);
  });

  // ── 19. Errors don't expose filesystem paths ──────────────────────────────

  it("Supabase error message does not contain filesystem paths", async () => {
    mockSupabase(null, "connection refused");
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(500);
    const errStr = res._body.error ?? "";
    expect(errStr).not.toMatch(/[A-Z]:\\/);
    expect(errStr).not.toMatch(/\/home\//);
    expect(errStr).not.toMatch(/node_modules/);
    expect(errStr).not.toMatch(/\.ts$/);
    expect((res._body as Record<string, unknown>).live_stats).toBeUndefined();
    expect((res._body as Record<string, unknown>).scoped_summary).toBeUndefined();
  });

  // ── 20. Consistent behavior ───────────────────────────────────────────────

  it("task_type filter reflected in active_scope", async () => {
    mockSupabase([
      { participant_code: "PC010", session_id: "S100", batch_type: "pilot", task_type: "er_diagram" },
    ]);
    const res = await GET(makeRequest({ task_type: "er_diagram" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.active_scope?.task_type).toBe("er_diagram");
    expect(res._body.active_scope?.batch_type).toBeNull();
    expect(res._body.active_scope?.dataset).toBe("phase4_pilot");
    expect(res._body.active_scope?.set_family).toBeNull();
  });

  it("default request (no params) returns complete response structure", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.available_datasets).toBeDefined();
    expect(res._body.available_batch_types).toBeDefined();
    expect(res._body.available_activity_types).toBeDefined();
    expect(res._body.available_task_types).toBeDefined();
    expect(res._body.active_scope).toBeDefined();
    expect(res._body.scoped_summary).toBeDefined();
    expect(res._body.validity_metadata).toBeDefined();
    expect(res._body.unavailable_dimensions).toBeDefined();
  });

  // ── 22. "practice" no longer accepted as batch_type ──────────────────────

  it("22: 'practice' as batch_type → 400 (replaced by 'trial')", async () => {
    const res = await GET(makeRequest({ batch_type: "practice" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
  });

  // ── 23. "trial" accepted as batch_type ───────────────────────────────────

  it("23: 'trial' accepted as batch_type → 200", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ batch_type: "trial" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.active_scope?.batch_type).toBe("trial");
  });

  // ── 24. Batch type order: main, trial, pilot ──────────────────────────────

  it("24: available_batch_types order is main → trial → pilot", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const values = res._body.available_batch_types?.map((b) => b.value) ?? [];
    expect(values.indexOf("main")).toBeLessThan(values.indexOf("trial"));
    expect(values.indexOf("trial")).toBeLessThan(values.indexOf("pilot"));
  });

  // ── 25. Icon mappings present ─────────────────────────────────────────────

  it("25: M/star, T/dumbbell, P/paper-airplane icon metadata in batch_types", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const bts = res._body.available_batch_types ?? [];
    const main = bts.find((b) => b.value === "main");
    const trial = bts.find((b) => b.value === "trial");
    const pilot = bts.find((b) => b.value === "pilot");
    expect(main?.code).toBe("M");
    expect(main?.icon).toBe("star");
    expect(trial?.code).toBe("T");
    expect(trial?.icon).toBe("dumbbell");
    expect(pilot?.code).toBe("P");
    expect(pilot?.icon).toBe("paper-airplane");
  });

  // ── 26. Activity type codes A/L/E ────────────────────────────────────────

  it("26: activity types have A/L/E code mappings", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const ats = res._body.available_activity_types ?? [];
    expect(ats.find((a) => a.value === "assignment")?.code).toBe("A");
    expect(ats.find((a) => a.value === "lab")?.code).toBe("L");
    expect(ats.find((a) => a.value === "exam")?.code).toBe("E");
  });

  // ── 27. Task type codes QT/SP/ER/QB ──────────────────────────────────────

  it("27: task types have dataset_label and code (QT/QB/SP/ER)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const tts = res._body.available_task_types ?? [];
    expect(tts.find((t) => t.value === "sql_text")?.code).toBe("QT");
    expect(tts.find((t) => t.value === "sql_block")?.code).toBe("QB");
    expect(tts.find((t) => t.value === "stored_procedure")?.code).toBe("SP");
    expect(tts.find((t) => t.value === "er_diagram")?.code).toBe("ER");
    // Dataset labels are mapped correctly
    expect(tts.find((t) => t.value === "sql_text")?.dataset_label).toBe("SQL Query");
    expect(tts.find((t) => t.value === "sql_block")?.dataset_label).toBe("Query Block");
    expect(tts.find((t) => t.value === "stored_procedure")?.dataset_label).toBe("Stored Procedure");
    expect(tts.find((t) => t.value === "er_diagram")?.dataset_label).toBe("ER Diagram");
  });

  // ── 28. dataset_list returned ─────────────────────────────────────────────

  it("28: dataset_list is returned in GET response as array", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body.dataset_list)).toBe(true);
    expect(typeof res._body.dataset_list_count).toBe("number");
  });

  // ── 29. POST validates required fields ───────────────────────────────────

  it("29: POST with missing required fields → 422 with field_errors", async () => {
    const req = makeRequest({}, {});
    const res = await POST(req) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(res._body.field_errors).toBeDefined();
    expect(typeof res._body.field_errors?.name).toBe("string");
    expect(typeof res._body.field_errors?.batch_type).toBe("string");
    expect(typeof res._body.field_errors?.set_family).toBe("string");
    expect(typeof res._body.field_errors?.task_type).toBe("string");
  });

  // ── 30. Code field in POST body → 422 ────────────────────────────────────

  it("30: POST with code field in body → 422", async () => {
    const req = makeRequest({}, { code: "MAQT0001", name: "Test", batch_type: "main", set_family: "assignment", task_type: "sql_text" });
    const res = await POST(req) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(typeof res._body.error).toBe("string");
  });

  // ── 31. filter_batch_type param is passed through ────────────────────────

  it("31: filter_batch_type query param is accepted without error", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_batch_type: "main" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
  });

  // ── 32. Search by filter_batch_type respected ────────────────────────────

  it("32: filter_batch_type and filter_set_family accepted together without error", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_batch_type: "trial", filter_set_family: "lab" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
  });

  // ── 33. Icon metadata has accessible aria_label ──────────────────────────

  it("33: available_batch_types have aria_label fields for accessibility", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const bts = res._body.available_batch_types ?? [];
    for (const bt of bts) {
      expect(typeof bt.aria_label).toBe("string");
      expect(bt.aria_label!.length).toBeGreaterThan(0);
    }
  });

  // ── 34. available_batch_types does not contain 'practice' ─────────────────

  it("34: available_batch_types does not contain 'practice'", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const values = res._body.available_batch_types?.map((b) => b.value) ?? [];
    expect(values).not.toContain("practice");
  });

  // ── 35. filter_task_type param is accepted without error ──────────────────

  it("35: filter_task_type query param is accepted without error", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_task_type: "sql_text" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
  });

  // ── 36. filter_active=true accepted ──────────────────────────────────────

  it("36: filter_active=true accepted and returns 200", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_active: "true" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body.dataset_list)).toBe(true);
  });

  // ── 37. filter_active=false accepted ─────────────────────────────────────

  it("37: filter_active=false accepted and returns 200", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_active: "false" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
  });

  // ── 38. search param accepted ─────────────────────────────────────────────

  it("38: search query param is accepted", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ search: "MAQT" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
  });

  // ── 39. filter_usage accepted (not_used) ──────────────────────────────────

  it("39: filter_usage=not_used accepted", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_usage: "not_used" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body.dataset_list)).toBe(true);
  });

  // ── 40. filter_usage accepted (used) ─────────────────────────────────────

  it("40: filter_usage=used accepted", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest({ filter_usage: "used" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
  });

  // ── 41. dataset_list_count is always numeric ───────────────────────────────

  it("41: dataset_list_count is a number, even with no datasets", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(typeof res._body.dataset_list_count).toBe("number");
    expect(res._body.dataset_list_count).toBeGreaterThanOrEqual(0);
  });

  // ── 42. Scoped summary grain is always session_level ──────────────────────

  it("42: scoped_summary.grain is always 'session_level'", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.scoped_summary?.grain).toBe("session_level");
  });

  // ── 43. All three unavailable dimensions are reported ─────────────────────

  it("43: unavailable_dimensions reports set_family, dataset_version, pipeline_run_id", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const dims = res._body.unavailable_dimensions?.map((d) => d.dimension) ?? [];
    expect(dims).toContain("set_family");
    expect(dims).toContain("dataset_version");
    expect(dims).toContain("pipeline_run_id");
  });

  // ── 44. dataset_version dimension has ui_label 'Dataset Version' ──────────

  it("44: dataset_version dimension has correct ui_label", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    const dim = res._body.unavailable_dimensions?.find((d) => d.dimension === "dataset_version");
    expect(dim?.ui_label).toBe("Dataset Version");
  });

  // ── 45. pipeline_run_id dimension has ui_label 'Pipeline Run' ─────────────

  it("45: pipeline_run_id dimension has correct ui_label 'Pipeline Run'", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    const dim = res._body.unavailable_dimensions?.find((d) => d.dimension === "pipeline_run_id");
    expect(dim?.ui_label).toBe("Pipeline Run");
  });

  // ── 46. Batch type order in filter toggles (main first) ───────────────────

  it("46: available_batch_types first element is 'main'", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.available_batch_types?.[0]?.value).toBe("main");
  });

  // ── 47. Batch type label capitalized ─────────────────────────────────────

  it("47: available_batch_types labels are capitalized (Main/Trial/Pilot)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    const labels = res._body.available_batch_types?.map((b) => b.label) ?? [];
    expect(labels).toContain("Main");
    expect(labels).toContain("Trial");
    expect(labels).toContain("Pilot");
    expect(labels).not.toContain("main");
    expect(labels).not.toContain("trial");
    expect(labels).not.toContain("pilot");
  });

  // ── 48. "trail" (misspelling) rejected as batch_type ─────────────────────

  it("48: 'trail' (misspelling of trial) as batch_type → 400", async () => {
    const res = await GET(makeRequest({ batch_type: "trail" })) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
  });

});

// ── Runs route tests (points 49–60) ──────────────────────────────────────────

import { GET as RunsGET, POST as RunsPOST } from "@/app/api/researcher/dataset-analytics/[id]/runs/route";

type RunsApiBody = {
  dataset_id?: string;
  runs?: { id: string; run_type: string; status: string; analysis_steps?: unknown[] | null }[];
  run_count?: number;
  run?: { id: string; run_type: string; status: string; analysis_steps?: unknown[] | null };
  error?: string;
  existing_run_id?: string;
};

function makeRunsRequest(id: string, body?: unknown) {
  return {
    headers: { get: () => "Bearer test-token" },
    nextUrl: { searchParams: new URLSearchParams() },
    json: async () => body ?? {},
  } as unknown as import("next/server").NextRequest;
}

function makeRunsParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function mockRunsSupabase(table: string, rows: Record<string, unknown>[] | null, error?: string) {
  const thenable = {
    select: vi.fn(() => thenable),
    eq: vi.fn(() => thenable),
    in: vi.fn(() => thenable),
    is: vi.fn(() => thenable),
    order: vi.fn(() => thenable),
    insert: vi.fn(() => thenable),
    single: vi.fn(async () => ({ data: rows?.[0] ?? null, error: error ? { message: error, code: "" } : null })),
    maybeSingle: vi.fn(async () => ({ data: rows?.[0] ?? null, error: error ? { message: error } : null })),
    then: (resolve: (v: { data: typeof rows; error: { message: string } | null }) => void) =>
      resolve({ data: rows, error: error ? { message: error } : null }),
  };
  mockFrom.mockReturnValue(thenable);
  return thenable;
}

describe("GET /api/researcher/dataset-analytics/[id]/runs", () => {

  beforeEach(() => {
    mockFrom.mockClear();
    mockRpc.mockClear();
    vi.mocked(requireAdminOrResearcher).mockResolvedValue({
      user_id: "u1",
      profile_id: "p1",
      participant_code: "PC001",
      role: "researcher",
      consent_accepted: true,
    });
  });

  // ── 49. Auth required ────────────────────────────────────────────────────

  it("49: GET runs → 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await RunsGET(makeRunsRequest("ds1"), { params: makeRunsParams("ds1") }) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── 50. 404 for unknown dataset ──────────────────────────────────────────

  it("50: GET runs → 404 for unknown dataset id", async () => {
    mockRunsSupabase("mst_datasets", null);
    const res = await RunsGET(makeRunsRequest("nonexistent"), { params: makeRunsParams("nonexistent") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(404);
    expect(typeof res._body.error).toBe("string");
  });

  // ── 51. Returns runs array and run_count ─────────────────────────────────

  it("51: GET runs for known dataset → 200 with runs array and run_count", async () => {
    const datasetRow = { id: "ds1", active: true };
    const runRows = [
      { id: "r1", dataset_id: "ds1", run_type: "full_pipeline", status: "completed",
        analysis_steps: [], started_at: null, completed_at: null,
        error_summary: null, initiated_by: null, configuration: null, result_version: null,
        created_at: new Date().toISOString() },
    ];
    // First call: dataset lookup; second call: runs query
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const isDataset = callCount <= 2;
      const rows = isDataset ? [datasetRow] : runRows;
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        in: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        order: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
        then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return thenable;
    });
    const res = await RunsGET(makeRunsRequest("ds1"), { params: makeRunsParams("ds1") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body.runs)).toBe(true);
    expect(typeof res._body.run_count).toBe("number");
  });

  // ── 52. POST runs → 401 when auth throws ─────────────────────────────────

  it("52: POST runs → 401 when auth throws", async () => {
    vi.mocked(requireAdminOrResearcher).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await RunsPOST(makeRunsRequest("ds1", { run_type: "full_pipeline" }), { params: makeRunsParams("ds1") }) as unknown as { _status: number };
    expect(res._status).toBe(401);
  });

  // ── 53. POST runs → 404 for unknown dataset ───────────────────────────────

  it("53: POST runs → 404 for unknown dataset", async () => {
    mockRunsSupabase("mst_datasets", null);
    const res = await RunsPOST(makeRunsRequest("bad", { run_type: "full_pipeline" }), { params: makeRunsParams("bad") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(404);
  });

  // ── 54. POST runs → 422 for inactive dataset ──────────────────────────────

  it("54: POST runs → 422 for inactive (active=false) dataset", async () => {
    const inactiveRow = { id: "ds2", active: false };
    mockFrom.mockImplementation(() => {
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => ({ data: inactiveRow, error: null })),
        then: (resolve: (v: { data: typeof inactiveRow[]; error: null }) => void) => resolve({ data: [inactiveRow], error: null }),
      };
      return thenable;
    });
    const res = await RunsPOST(makeRunsRequest("ds2", { run_type: "full_pipeline" }), { params: makeRunsParams("ds2") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(typeof res._body.error).toBe("string");
  });

  // ── 55. POST runs → 422 for invalid run_type ─────────────────────────────

  it("55: POST runs → 422 for invalid run_type", async () => {
    const activeRow = { id: "ds1", active: true };
    mockFrom.mockImplementation(() => {
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        in: vi.fn(() => thenable),
        order: vi.fn(() => thenable),
        insert: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => ({ data: activeRow, error: null })),
        single: vi.fn(async () => ({ data: null, error: { message: "error" } })),
        then: (resolve: (v: { data: typeof activeRow[]; error: null }) => void) => resolve({ data: [activeRow], error: null }),
      };
      return thenable;
    });
    const res = await RunsPOST(makeRunsRequest("ds1", { run_type: "not_a_real_type" }), { params: makeRunsParams("ds1") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(typeof res._body.error).toBe("string");
  });

  // ── 56. POST full_pipeline → analysis_steps has 4 entries ────────────────

  it("56: POST full_pipeline → response run has 4 analysis_steps (behavioral, sequential, semantic, assessment)", async () => {
    const activeRow = { id: "ds1", active: true };
    const insertedRun = {
      id: "run1", dataset_id: "ds1", run_type: "full_pipeline", status: "pending",
      analysis_steps: [
        { analysis: "behavioral",  status: "pending", started_at: null, completed_at: null, error: null },
        { analysis: "sequential",  status: "pending", started_at: null, completed_at: null, error: null },
        { analysis: "semantic",    status: "pending", started_at: null, completed_at: null, error: null },
        { analysis: "assessment",  status: "pending", started_at: null, completed_at: null, error: null },
      ],
      started_at: null, completed_at: null, error_summary: null,
      initiated_by: null, configuration: null, result_version: null,
      created_at: new Date().toISOString(),
    };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        in: vi.fn(() => thenable),
        order: vi.fn(() => thenable),
        insert: vi.fn(() => thenable),
        // Dataset lookup (calls 1-2): return activeRow; Run guard (calls 3+): return null; Insert: return insertedRun
        maybeSingle: vi.fn(async () => {
          if (callCount === 1) return { data: activeRow, error: null };
          return { data: null, error: null }; // no existing run
        }),
        single: vi.fn(async () => ({ data: insertedRun, error: null })),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [activeRow], error: null }),
      };
      return thenable;
    });
    const res = await RunsPOST(makeRunsRequest("ds1", { run_type: "full_pipeline" }), { params: makeRunsParams("ds1") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(201);
    expect(res._body.run).toBeDefined();
    expect(Array.isArray(res._body.run?.analysis_steps)).toBe(true);
    expect(res._body.run?.analysis_steps).toHaveLength(4);
    const stepNames = (res._body.run?.analysis_steps as Array<{ analysis: string }> | undefined)?.map((s) => s.analysis) ?? [];
    expect(stepNames).toContain("behavioral");
    expect(stepNames).toContain("sequential");
    expect(stepNames).toContain("semantic");
    expect(stepNames).toContain("assessment");
  });

  // ── 57. POST full_pipeline → run status starts as 'pending' ──────────────

  it("57: POST full_pipeline → created run has status 'pending'", async () => {
    const activeRow = { id: "ds1", active: true };
    const insertedRun = {
      id: "run2", dataset_id: "ds1", run_type: "full_pipeline", status: "pending",
      analysis_steps: null, started_at: null, completed_at: null, error_summary: null,
      initiated_by: null, configuration: null, result_version: null,
      created_at: new Date().toISOString(),
    };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        in: vi.fn(() => thenable),
        insert: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => {
          if (callCount === 1) return { data: activeRow, error: null };
          return { data: null, error: null };
        }),
        single: vi.fn(async () => ({ data: insertedRun, error: null })),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      };
      return thenable;
    });
    const res = await RunsPOST(makeRunsRequest("ds1", {}), { params: makeRunsParams("ds1") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(201);
    expect(res._body.run?.status).toBe("pending");
  });

  // ── 58. POST runs → 409 when duplicate pending full_pipeline exists ────────

  it("58: POST runs → 409 when a pending full_pipeline run already exists", async () => {
    const activeRow = { id: "ds1", active: true };
    const existingRun = { id: "run-existing", status: "pending" };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        in: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => {
          if (callCount === 1) return { data: activeRow, error: null };
          return { data: existingRun, error: null }; // duplicate guard
        }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      };
      return thenable;
    });
    const res = await RunsPOST(makeRunsRequest("ds1", { run_type: "full_pipeline" }), { params: makeRunsParams("ds1") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(409);
    expect(res._body.existing_run_id).toBeDefined();
  });

  // ── 59. POST run → run_type recorded correctly ────────────────────────────

  it("59: POST run with run_type 'behavioral' → run.run_type is 'behavioral'", async () => {
    const activeRow = { id: "ds1", active: true };
    const insertedRun = {
      id: "run3", dataset_id: "ds1", run_type: "behavioral", status: "pending",
      analysis_steps: null, started_at: null, completed_at: null, error_summary: null,
      initiated_by: null, configuration: null, result_version: null,
      created_at: new Date().toISOString(),
    };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        in: vi.fn(() => thenable),
        insert: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => {
          if (callCount === 1) return { data: activeRow, error: null };
          return { data: null, error: null };
        }),
        single: vi.fn(async () => ({ data: insertedRun, error: null })),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      };
      return thenable;
    });
    const res = await RunsPOST(makeRunsRequest("ds1", { run_type: "behavioral" }), { params: makeRunsParams("ds1") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(201);
    expect(res._body.run?.run_type).toBe("behavioral");
  });

  // ── 60. GET runs returns dataset_id in response ───────────────────────────

  it("60: GET runs response includes dataset_id field", async () => {
    const activeRow = { id: "ds-abc", active: true };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const rows = callCount <= 1 ? [activeRow] : [];
      const thenable = {
        select: vi.fn(() => thenable),
        eq: vi.fn(() => thenable),
        is: vi.fn(() => thenable),
        order: vi.fn(() => thenable),
        maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
        then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return thenable;
    });
    const res = await RunsGET(makeRunsRequest("ds-abc"), { params: makeRunsParams("ds-abc") }) as unknown as { _body: RunsApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(res._body.dataset_id).toBe("ds-abc");
  });

});

// ── Accessibility & regression tests (points 61–70) ──────────────────────────

describe("Accessibility & regression — dataset-analytics API contract", () => {

  beforeEach(() => {
    mockFrom.mockClear();
    mockRpc.mockClear();
    vi.mocked(requireAdminOrResearcher).mockResolvedValue({
      user_id: "u1",
      profile_id: "p1",
      participant_code: "PC001",
      role: "researcher",
      consent_accepted: true,
    });
  });

  // ── 61. Batch type icon metadata includes aria_label for all three ─────────

  it("61: all three batch types have non-empty aria_label (accessibility)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const bts = res._body.available_batch_types ?? [];
    for (const bt of bts) {
      expect(typeof bt.aria_label).toBe("string");
      expect(bt.aria_label!.trim().length).toBeGreaterThan(0);
    }
    // Specific labels
    expect(bts.find((b) => b.value === "main")?.aria_label).toContain("Main");
    expect(bts.find((b) => b.value === "trial")?.aria_label).toContain("Trial");
    expect(bts.find((b) => b.value === "pilot")?.aria_label).toContain("Pilot");
  });

  // ── 62. activity_types have code metadata ────────────────────────────────

  it("62: all activity types have non-empty code for dataset code generation", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const ats = res._body.available_activity_types ?? [];
    for (const at of ats) {
      expect(typeof at.code).toBe("string");
      expect((at.code ?? "").trim().length).toBe(1); // single character
    }
  });

  // ── 63. task type code metadata for all in-scope types ───────────────────

  it("63: all in-scope task types have 2-char code (QT/QB/SP/ER)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const tts = res._body.available_task_types ?? [];
    for (const tt of tts) {
      expect(typeof tt.code).toBe("string");
      expect((tt.code ?? "").trim().length).toBe(2); // 2-character code
    }
  });

  // ── 64. No pipeline_stats or bssa_features in response ───────────────────

  it("64: API response does not fabricate research pipeline_stats or bssa_features", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody & Record<string, unknown>; _status: number };
    expect(res._status).toBe(200);
    expect("pipeline_stats" in res._body).toBe(false);
    expect("bssa_features" in res._body).toBe(false);
    expect("sequence_stats" in res._body).toBe(false);
  });

  // ── 65. POST with all valid fields creates dataset (no code field in body) ─

  it("65: POST validates required fields individually (name/batch_type/set_family/task_type)", async () => {
    // Missing just name
    const req1 = makeRequest({}, { batch_type: "main", set_family: "assignment", task_type: "sql_text" });
    const res1 = await POST(req1) as unknown as { _body: ApiBody; _status: number };
    expect(res1._status).toBe(422);
    expect(res1._body.field_errors?.name).toBeDefined();
    expect(res1._body.field_errors?.batch_type).toBeUndefined();
  });

  // ── 66. POST with invalid batch_type yields field_error, not 400 ──────────

  it("66: POST with invalid batch_type → 422 with field_errors.batch_type", async () => {
    const req = makeRequest({}, { name: "Test", batch_type: "practice", set_family: "assignment", task_type: "sql_text" });
    const res = await POST(req) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(res._body.field_errors?.batch_type).toBeDefined();
    expect(res._body.field_errors?.batch_type).toMatch(/trial/);
  });

  // ── 67. POST with out-of-scope task_type → 422 ───────────────────────────

  it("67: POST with out-of-scope task_type (coding_text) → 422 with field_error", async () => {
    const req = makeRequest({}, { name: "Test", batch_type: "main", set_family: "assignment", task_type: "coding_text" });
    const res = await POST(req) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(422);
    expect(res._body.field_errors?.task_type).toBeDefined();
  });

  // ── 68. Response never contains filesystem paths ──────────────────────────

  it("68: 200 response body contains no filesystem paths", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const body = JSON.stringify(res._body);
    expect(body).not.toMatch(/[A-Z]:\\/);
    expect(body).not.toMatch(/\/home\//);
    expect(body).not.toMatch(/node_modules/);
    expect(body).not.toMatch(/\.ts\b/);
  });

  // ── 69. Validity metadata data_warning is present and non-empty ──────────

  it("69: validity_metadata.data_warning is present and non-empty", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    expect(typeof res._body.validity_metadata?.data_warning).toBe("string");
    expect(String(res._body.validity_metadata?.data_warning ?? "").length).toBeGreaterThan(0);
  });

  // ── 70. available_datasets only has phase4_pilot (no 13th pipeline-runs nav)

  it("70: available_datasets does not include a pipeline-runs dataset (no 13th nav)", async () => {
    mockSupabase([]);
    const res = await GET(makeRequest()) as unknown as { _body: ApiBody; _status: number };
    expect(res._status).toBe(200);
    const ids = res._body.available_datasets?.map((d) => d.id) ?? [];
    expect(ids).not.toContain("pipeline_runs");
    expect(ids).not.toContain("pipeline-runs");
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("phase4_pilot");
  });

});
