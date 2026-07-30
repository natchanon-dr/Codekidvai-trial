/**
 * Tests for POST /api/researcher/mock-lab — n_students validation
 * and resolveArtifact artifact availability contract.
 *
 * n_students boundary tests:
 *  1. n_students=4 → 400 (below minimum)
 *  2. n_students=5 → proceeds (at minimum)
 *  3. n_students=200 → proceeds (at maximum)
 *  4. n_students=201 → 400 (above maximum)
 *  5. n_students missing → uses default 10, no error
 *  6. n_students non-numeric (string) → passes JS validation, would fail at DB
 *
 * resolveArtifact artifact contract:
 *  7. PAQT0001 + completed + null result_version → static_fallback (Eye enabled)
 *  8. PAQT0001 + completed + result_version set → unavailable (Phase 5 deferred)
 *  9. Other dataset + completed + null result_version → unavailable
 * 10. PAQT0001 + pending → unavailable
 * 11. PAQT0001 + running → unavailable
 * 12. PAQT0001 + failed → unavailable
 * 13. PAQT0001 + cancelled → unavailable
 * 14. completed status alone does not imply artifact availability
 * 15. Eye/Compare disabled with a truthful reason when no artifact
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
  NextRequest: class {},
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { POST } from "@/app/api/researcher/mock-lab/route";
import { resolveArtifact } from "@/app/api/researcher/sequential-analysis/route";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

type MockLabBody = {
  config?: unknown;
  error?: string;
};

function makePostRequest(body: unknown) {
  return {
    headers: { get: () => "Bearer test-token" },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

function mockSupabaseForCreate(createdRow: Record<string, unknown> | null, error?: { message: string; code?: string }) {
  // POST /mock-lab needs: code lookup query + insert
  let callIdx = 0;
  mockFrom.mockImplementation(() => {
    callIdx++;
    const t = {
      select: vi.fn(() => t),
      insert: vi.fn(() => t),
      like: vi.fn(() => t),
      order: vi.fn(() => t),
      limit: vi.fn(() => t),
      eq: vi.fn(() => t),
      single: vi.fn(async () => ({
        data: createdRow,
        error: error ?? null,
      })),
      then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) => {
        // Code lookup returns empty (first call)
        resolve({ data: callIdx === 1 ? [] : [createdRow ?? {}], error: null });
      },
    };
    return t;
  });
}

const VALID_BODY = {
  set_family: "assignment",
  task_type_counts: { sql_text: 3 },
  name: "Test Mock",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

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

// ── n_students boundary tests ─────────────────────────────────────────────────

describe("POST /api/researcher/mock-lab — n_students validation", () => {

  it("1: n_students=4 → 400 (below minimum of 5)", async () => {
    const req = makePostRequest({ ...VALID_BODY, n_students: 4 });
    const res = await POST(req) as unknown as { _body: MockLabBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
    expect(res._body.error).toMatch(/n_students/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("2: n_students=5 → proceeds to DB (at minimum)", async () => {
    mockSupabaseForCreate({ id: "mc1", code: "MAQT0001", n_students: 5 });
    const req = makePostRequest({ ...VALID_BODY, n_students: 5 });
    const res = await POST(req) as unknown as { _body: MockLabBody; _status: number };
    // Proceeds past validation to DB; DB mock returns a config → 201
    expect(res._status).toBe(201);
    expect(mockFrom).toHaveBeenCalled();
  });

  it("3: n_students=200 → proceeds to DB (at maximum)", async () => {
    mockSupabaseForCreate({ id: "mc2", code: "MAQT0001", n_students: 200 });
    const req = makePostRequest({ ...VALID_BODY, n_students: 200 });
    const res = await POST(req) as unknown as { _body: MockLabBody; _status: number };
    expect(res._status).toBe(201);
    expect(mockFrom).toHaveBeenCalled();
  });

  it("4: n_students=201 → 400 (above maximum of 200)", async () => {
    const req = makePostRequest({ ...VALID_BODY, n_students: 201 });
    const res = await POST(req) as unknown as { _body: MockLabBody; _status: number };
    expect(res._status).toBe(400);
    expect(typeof res._body.error).toBe("string");
    expect(res._body.error).toMatch(/n_students/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("5: n_students missing → no validation error, proceeds with default", async () => {
    mockSupabaseForCreate({ id: "mc3", code: "MAQT0001", n_students: 10 });
    const req = makePostRequest({ ...VALID_BODY });
    const res = await POST(req) as unknown as { _body: MockLabBody; _status: number };
    // Should not return a 400 for missing n_students
    expect(res._status).not.toBe(400);
    expect(String(res._body.error ?? "")).not.toMatch(/n_students/i);
  });

  it("6: n_students non-numeric string passes JS comparison, no explicit API 400", async () => {
    // The current validation checks `n_students < 5 || n_students > 200`.
    // "abc" coerces to NaN in comparisons → both conditions false → passes API guard.
    // DB constraint provides backstop. This test documents the current boundary.
    mockSupabaseForCreate(null, { message: "invalid input syntax for type integer", code: "22P02" });
    const req = makePostRequest({ ...VALID_BODY, n_students: "abc" });
    const res = await POST(req) as unknown as { _body: MockLabBody; _status: number };
    // Does NOT return 400 from API validation; DB error returns 500
    expect(res._status).not.toBe(400);
  });

});

// ── resolveArtifact artifact contract ─────────────────────────────────────────

describe("resolveArtifact — artifact availability contract", () => {

  // 7. PAQT0001 + completed + null result_version → static_fallback
  it("7: PAQT0001 + completed + null result_version → static_fallback, isComparable=true", () => {
    const result = resolveArtifact("completed", null, "PAQT0001");
    expect(result.availability).toBe("static_fallback");
    expect(result.source).toBe("static_fallback");
    expect(result.isComparable).toBe(true);
    expect(result.reason).toBeNull();
  });

  // 8. PAQT0001 + completed + result_version set → unavailable (Phase 5 deferred)
  it("8: PAQT0001 + completed + result_version set → unavailable (Phase 5 deferred)", () => {
    const result = resolveArtifact("completed", "v1.0.0", "PAQT0001");
    expect(result.availability).toBe("unavailable");
    expect(result.source).toBeNull();
    expect(result.isComparable).toBe(false);
    expect(result.reason).toMatch(/Phase 5/i);
  });

  // 9. Other dataset + completed + null result_version → unavailable
  it("9: other dataset + completed + null result_version → unavailable", () => {
    const result = resolveArtifact("completed", null, "MAQT0001");
    expect(result.availability).toBe("unavailable");
    expect(result.source).toBeNull();
    expect(result.isComparable).toBe(false);
    expect(typeof result.reason).toBe("string");
  });

  // 10–13. PAQT0001 with non-completed statuses → all unavailable
  it.each([
    ["pending",   "Run is pending"],
    ["running",   "in progress"],
    ["failed",    "failed"],
    ["cancelled", "cancelled"],
  ])("10–13: PAQT0001 + %s → unavailable with reason containing '%s'", (status, reasonSnippet) => {
    const result = resolveArtifact(status, null, "PAQT0001");
    expect(result.availability).toBe("unavailable");
    expect(result.source).toBeNull();
    expect(result.isComparable).toBe(false);
    expect(result.reason?.toLowerCase()).toContain(reasonSnippet.toLowerCase());
  });

  // 14. Completed status alone does not imply availability
  it("14: completed status alone (non-PAQT0001, null result_version) does not grant availability", () => {
    for (const code of ["MAQT0001", "MLQB0001", "PAQT0002", "unknown"]) {
      const result = resolveArtifact("completed", null, code);
      expect(result.availability).toBe("unavailable");
    }
  });

  // 15. Eye/Compare: reason is always a non-empty string when unavailable
  it("15: unavailable result always includes a non-empty reason string (truthful UI message)", () => {
    const cases: [string, string | null, string][] = [
      ["completed", "v1", "PAQT0001"],
      ["completed", null, "MAQT0001"],
      ["pending",   null, "PAQT0001"],
      ["running",   null, "PAQT0001"],
      ["failed",    null, "PAQT0001"],
      ["cancelled", null, "PAQT0001"],
    ];
    for (const [status, rv, code] of cases) {
      const result = resolveArtifact(status, rv, code);
      if (result.availability === "unavailable") {
        expect(typeof result.reason).toBe("string");
        expect((result.reason ?? "").length).toBeGreaterThan(0);
      }
    }
  });

});
