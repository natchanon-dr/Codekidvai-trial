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

describe("evaluateRubricCriteria — research-contract 2C3L weights", () => {
  const CONTRACT_CRITERIA = [
    { key: "c1", label: "C1 Correctness",      keywords: ["select", "from", "where"], weight: 0.30 },
    { key: "c2", label: "C2 Clarity",           keywords: ["group by"],               weight: 0.20 },
    { key: "l1", label: "L1 Logic",             keywords: ["having"],                  weight: 0.20 },
    { key: "l2", label: "L2 Learning Process",  keywords: ["nonexistent_kw_l2"],       weight: 0.15 },
    { key: "l3", label: "L3 Level of Mastery",  keywords: [],                          weight: 0.15 },
  ];

  it("research-contract criterion weights (0.30+0.20+0.20+0.15+0.15) sum to 1.0", () => {
    const sum = CONTRACT_CRITERIA.reduce((acc, c) => acc + c.weight, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("research-contract weights produce correct per-criterion scores (max_score=100)", () => {
    const result = evaluateRubricCriteria({
      student_answer: "SELECT id FROM users WHERE active = 1 GROUP BY id HAVING COUNT(*) > 1",
      rubric: rubric(CONTRACT_CRITERIA),
      max_score: 100,
    });
    const byKey = Object.fromEntries(result.rubric_breakdown.map(r => [r.key, r]));
    // C1: keywords matched → 0.30 × 100 = 30
    expect(byKey["c1"].matched).toBe(true);
    expect(byKey["c1"].criterion_score).toBe(30);
    // C2: "group by" present → 0.20 × 100 = 20
    expect(byKey["c2"].matched).toBe(true);
    expect(byKey["c2"].criterion_score).toBe(20);
    // L1: "having" present → 0.20 × 100 = 20
    expect(byKey["l1"].matched).toBe(true);
    expect(byKey["l1"].criterion_score).toBe(20);
    // L2: keyword not present → 0
    expect(byKey["l2"].matched).toBe(false);
    expect(byKey["l2"].criterion_score).toBe(0);
    // L3: empty keywords → 0
    expect(byKey["l3"].matched).toBe(false);
    expect(byKey["l3"].criterion_score).toBe(0);
    // Total: 70
    expect(result.score).toBe(70);
  });

  it("pass_threshold=0.65 correctly gates at_risk boundary (score 64 → not correct, score 65 → correct)", () => {
    const thresholdRubric: ScoringRubric = {
      version: 1,
      type: "criterion_based",
      pass_threshold: 0.65,
      criteria: [
        { key: "c1", label: "C1", keywords: ["select", "from"], weight: 0.65 },
        { key: "c2", label: "C2", keywords: ["nonexistent"],    weight: 0.35 },
      ],
    };
    // Only C1 matches → score = 0.65 × 100 = 65 → is_correct true at threshold 0.65
    const atThreshold = evaluateRubricCriteria({
      student_answer: "SELECT id FROM users",
      rubric: thresholdRubric,
      max_score: 100,
    });
    expect(atThreshold.score).toBe(65);
    expect(atThreshold.is_correct).toBe(true);

    // With only a 0.30-weight criterion matching → score = 30 → is_correct false
    const belowThreshold = evaluateRubricCriteria({
      student_answer: "SELECT id FROM users",
      rubric: { ...thresholdRubric, criteria: [
        { key: "c1", label: "C1", keywords: ["select", "from"], weight: 0.30 },
        { key: "c2", label: "C2", keywords: ["nonexistent"],    weight: 0.70 },
      ]},
      max_score: 100,
    });
    expect(belowThreshold.score).toBe(30);
    expect(belowThreshold.is_correct).toBe(false);
  });
});
