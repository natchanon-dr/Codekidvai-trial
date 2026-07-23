/**
 * Automated tests for lib/research-artifacts/phase4/sequence_analytics_v1.json
 *
 * Artifact generation: notebooks/scripts/generate_sequence_analytics_v1.py
 * Validity constraints:
 *   label_source=proxy_behavioral
 *   label_validity=pilot_only
 *   evaluation_purpose=technical_pipeline_validation
 *   proxy_target_circularity=true
 *   confirmatory_analysis_allowed=false
 */

import { describe, it, expect } from "vitest";
import artifact from "@/lib/research-artifacts/phase4/sequence_analytics_v1.json";

// ── Types ──────────────────────────────────────────────────────────────────────

type ValidationCheck = { status: string; detail: string };
type ArtifactRoot = typeof artifact;

// ── Helpers ────────────────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && isFinite(v) && !isNaN(v);
}

function hasNanOrInfinity(obj: unknown): boolean {
  if (typeof obj === "number") return !isFiniteNumber(obj);
  if (Array.isArray(obj)) return obj.some(hasNanOrInfinity);
  if (obj !== null && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).some(hasNanOrInfinity);
  }
  return false;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("sequence_analytics_v1.json artifact", () => {
  const a = artifact as ArtifactRoot & Record<string, unknown>;

  // ── A. Top-level structure ──────────────────────────────────────────────────

  it("has artifact_version", () => {
    expect(typeof a.artifact_version).toBe("string");
    expect(a.artifact_version.length).toBeGreaterThan(0);
  });

  it("has generated_at as ISO string", () => {
    expect(typeof a.generated_at).toBe("string");
    const d = new Date(a.generated_at as string);
    expect(d.toString()).not.toBe("Invalid Date");
  });

  it("has analytical_content_hash as 64-char hex string", () => {
    const h = a.analytical_content_hash as string;
    expect(typeof h).toBe("string");
    expect(h).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(h)).toBe(true);
  });

  // ── B. Validity metadata ────────────────────────────────────────────────────

  it("validity_metadata has correct label_source", () => {
    expect(a.validity_metadata).toBeDefined();
    expect((a.validity_metadata as Record<string, unknown>).label_source).toBe("proxy_behavioral");
  });

  it("validity_metadata has correct label_validity", () => {
    expect((a.validity_metadata as Record<string, unknown>).label_validity).toBe("pilot_only");
  });

  it("validity_metadata has correct evaluation_purpose", () => {
    expect((a.validity_metadata as Record<string, unknown>).evaluation_purpose).toBe(
      "technical_pipeline_validation"
    );
  });

  it("validity_metadata has proxy_target_circularity=true", () => {
    expect((a.validity_metadata as Record<string, unknown>).proxy_target_circularity).toBe(true);
  });

  it("validity_metadata has confirmatory_analysis_allowed=false", () => {
    expect((a.validity_metadata as Record<string, unknown>).confirmatory_analysis_allowed).toBe(false);
  });

  // ── C. Validation results ───────────────────────────────────────────────────

  it("all validation_results checks are PASS or BLOCKED (none FAIL)", () => {
    const vr = a.validation_results as Record<string, ValidationCheck>;
    expect(vr).toBeDefined();
    const checks = Object.entries(vr);
    expect(checks.length).toBeGreaterThan(0);
    for (const [name, check] of checks) {
      expect(
        ["PASS", "BLOCKED"].includes(check.status),
        `Check "${name}" has unexpected status "${check.status}": ${check.detail}`
      ).toBe(true);
    }
  });

  // ── D. No NaN or Infinity ───────────────────────────────────────────────────

  it("no NaN or Infinity in any numeric field", () => {
    expect(hasNanOrInfinity(artifact)).toBe(false);
  });

  // ── E. Event frequency ─────────────────────────────────────────────────────

  it("event_frequency denominator is documented", () => {
    const ef = a.event_frequency as Record<string, unknown>;
    expect(typeof ef.denominator).toBe("number");
    expect(typeof ef.denominator_note).toBe("string");
    expect((ef.denominator_note as string).length).toBeGreaterThan(0);
  });

  it("event_frequency entries include padding entry with count 0", () => {
    const ef = a.event_frequency as Record<string, unknown>;
    const entries = ef.event_frequency as Array<Record<string, unknown>>;
    const padding = entries.find((e) => e.event_name === "__PADDING__");
    expect(padding).toBeDefined();
    expect(padding!.event_count).toBe(0);
  });

  it("event_frequency non-padding counts sum to denominator", () => {
    const ef = a.event_frequency as Record<string, unknown>;
    const entries = ef.event_frequency as Array<Record<string, unknown>>;
    const total = entries
      .filter((e) => e.event_name !== "__PADDING__")
      .reduce((s, e) => s + (e.event_count as number), 0);
    expect(total).toBe(ef.denominator as number);
  });

  // ── F. Sequence length histogram ───────────────────────────────────────────

  it("sequence length histogram bins sum to total_sequences", () => {
    const sl = a.sequence_length_distribution as Record<string, unknown>;
    const allDist = sl.all as Record<string, unknown>;
    const hist = allDist.histogram as Record<string, unknown>;
    const binCounts = hist.bin_counts as number[];
    const histSum = binCounts.reduce((s, c) => s + c, 0);
    const totalSeqs = (a.dataset_summary as Record<string, unknown>).total_sequences as number;
    expect(histSum).toBe(totalSeqs);
  });

  // ── G. Event transitions ────────────────────────────────────────────────────

  it("event_transitions denominator is a positive integer", () => {
    const et = a.event_transitions as Record<string, unknown>;
    if (et.available === false) {
      // BLOCKED is acceptable
      return;
    }
    const denom = et.denominator as number;
    expect(Number.isInteger(denom)).toBe(true);
    expect(denom).toBeGreaterThan(0);
  });

  it("event_transitions counts sum to denominator", () => {
    const et = a.event_transitions as Record<string, unknown>;
    if (et.available === false) return;
    const transitions = et.transitions as Array<Record<string, unknown>>;
    const total = transitions.reduce((s, t) => s + (t.count as number), 0);
    expect(total).toBe(et.denominator as number);
  });

  // ── H. Dataset summary ─────────────────────────────────────────────────────

  it("train + test sequences equal total_sequences", () => {
    const ds = a.dataset_summary as Record<string, unknown>;
    expect((ds.train_sequences as number) + (ds.test_sequences as number)).toBe(
      ds.total_sequences as number
    );
  });
});
