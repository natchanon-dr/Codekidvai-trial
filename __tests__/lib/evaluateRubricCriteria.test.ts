import { describe, it, expect, vi } from "vitest";

// supabase-admin throws at import without env vars; mock it so pure functions are testable
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

import { evaluateRubricCriteria } from "@/lib/server-dataset-utils";
import type { ScoringRubric } from "@/types/dataset";

const MAX_SCORE = 10;

function rubric(criteria: ScoringRubric["criteria"]): ScoringRubric {
  return { version: 1, type: "criterion_based", criteria };
}

describe("evaluateRubricCriteria — keyword matching", () => {
  it("empty keyword array → no match, score 0", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT * FROM users",
      rubric: rubric([{ key: "c1", label: "C1", keywords: [], weight: 1.0 }]),
      max_score: MAX_SCORE,
    });
    expect(result.rubric_breakdown[0].matched).toBe(false);
    expect(result.rubric_breakdown[0].criterion_score).toBe(0);
    expect(result.score).toBe(0);
    expect(result.is_correct).toBe(false);
  });

  it("blank-string-only keyword array → no match, score 0", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT * FROM users",
      rubric: rubric([{ key: "c1", label: "C1", keywords: ["", "  ", "\t"], weight: 1.0 }]),
      max_score: MAX_SCORE,
    });
    expect(result.rubric_breakdown[0].matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it("all valid keywords present → match, full criterion score awarded", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT name FROM users WHERE active = 1",
      rubric: rubric([
        { key: "c1", label: "C1", keywords: ["select", "from", "where"], weight: 1.0 },
      ]),
      max_score: MAX_SCORE,
    });
    expect(result.rubric_breakdown[0].matched).toBe(true);
    expect(result.rubric_breakdown[0].criterion_score).toBe(MAX_SCORE);
    expect(result.score).toBe(MAX_SCORE);
    expect(result.is_correct).toBe(true);
  });

  it("partial keyword match (only some keywords present) → no match, score 0", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT name FROM users",
      rubric: rubric([
        { key: "c1", label: "C1", keywords: ["select", "where"], weight: 1.0 },
      ]),
      max_score: MAX_SCORE,
    });
    expect(result.rubric_breakdown[0].matched).toBe(false);
    expect(result.rubric_breakdown[0].criterion_score).toBe(0);
    expect(result.score).toBe(0);
  });

  it("mixed criteria: empty-keyword criterion awards 0, valid criterion awards correctly", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT id FROM orders",
      rubric: rubric([
        { key: "c1", label: "C1", keywords: ["select", "from"], weight: 0.6 },
        { key: "c2", label: "C2", keywords: [], weight: 0.4 },
      ]),
      max_score: MAX_SCORE,
    });
    const c1 = result.rubric_breakdown.find((r) => r.key === "c1")!;
    const c2 = result.rubric_breakdown.find((r) => r.key === "c2")!;
    expect(c1.matched).toBe(true);
    expect(c1.criterion_score).toBe(6);
    expect(c2.matched).toBe(false);
    expect(c2.criterion_score).toBe(0);
    expect(result.score).toBe(6);
  });

  it("keyword matching is case-insensitive", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT COUNT(*) FROM ORDERS",
      rubric: rubric([
        { key: "c1", label: "C1", keywords: ["select", "COUNT", "FROM"], weight: 1.0 },
      ]),
      max_score: MAX_SCORE,
    });
    expect(result.rubric_breakdown[0].matched).toBe(true);
  });
});
