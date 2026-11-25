import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import artifact from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

// ---------------------------------------------------------------------------
// BSSI Analysis — availability/status view only (see
// docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md).
//
// BSSI = Behavioral–Sequential–Semantic Integration (feature/evidence
// construction). BSSM = Behavioral–Sequential–Semantic Model (the
// predictive model operating on BSSI Features). BSSI is NOT itself a
// predictive model, and BSSM is NOT an integration layer — do not conflate
// the two. This route does NOT compute or invent a combined "BSSI/BSSM
// score" — none exists in the Phase 4 pipeline (see
// artifact.bssa_features.groups.combined.status == "not_implemented"). It
// only reorganizes already-published frozen artifact fields
// (bssa_features, model_comparison.models) into a domain x model usage
// matrix for the dashboard, per the requirement to "show
// availability/status, do NOT invent a score."
//
// NOTE on the underlying JSON field name: the frozen Phase 4 artifact
// (lib/research-artifacts/phase4/phase4_ui_summary_v1.json) still uses the
// key `bssa_features` (old "BSSA" terminology). That field name is
// structurally relied on by app/api/researcher/analytics-summary/route.ts
// and asserted by name in __tests__/api/analytics-summary.test.ts and
// __tests__/api/dataset-analytics.test.ts. Per the architecture audit,
// renaming that JSON key is a separate, riskier, approval-gated migration
// — NOT done here. This route deliberately renames only the DISPLAY layer
// (BSSA -> BSSI) while reading the same unrenamed `bssa_features` field.
//
// BSSI must NOT depend on outputs from LR/RF/LSTM/GRU/SVM/XGBoost — this
// route only reads bssa_features.groups (feature-domain inventory) and
// model_comparison.models (trained/untrained status), never any model's
// predictions.
//
// 2C3L is intentionally NOT included as a fourth BSSI domain here — 2C3L
// is a separate assessment framework (see Assessment Analysis), not a BSSI
// feature-group dimension. Do not merge the two.
// ---------------------------------------------------------------------------

const TARGET_MODEL_ORDER = [
  "Dummy", "Logistic Regression", "Random Forest", "TAG-based LR", "LSTM", "GRU",
  "SVM", "XGBoost", "BSSM", "Traditional Auto Grading",
];

const MATRIX_DOMAIN_KEYS = ["behavioral", "sequential", "tag_based", "semantic"] as const;

// Strips an "(EXP-A)"/"(EXP-B)" suffix so "LSTM (EXP-B)" matches target "LSTM".
function normalizeModelUsageName(name: string): string {
  return name.replace(/\s*\(EXP-[AB]\)\s*$/i, "").trim();
}

type BssaGroups = typeof artifact.bssa_features.groups;

// Display-only BSSA -> BSSI relabel. The underlying JSON strings (frozen
// artifact prose) still say "BSSA" — see the file header note on why the
// JSON field/values are not renamed yet. This only touches display copy.
function relabel(text: string): string {
  return text.replace(/BSSA/g, "BSSI");
}

function buildMatrix(groups: BssaGroups) {
  return TARGET_MODEL_ORDER.map((modelName) => {
    const usesDomain: Record<string, boolean> = {};
    for (const key of MATRIX_DOMAIN_KEYS) {
      const group = groups[key as keyof BssaGroups] as { model_usage: string[] } | undefined;
      const usage = group?.model_usage ?? [];
      usesDomain[key] = usage.some((u) => normalizeModelUsageName(u) === modelName);
    }
    const trained = artifact.model_comparison.models.some((m) => m.name === modelName);
    return { model: modelName, uses_domain: usesDomain, trained };
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const groups = artifact.bssa_features.groups;

  return NextResponse.json({
    evaluation_purpose: artifact.evaluation_purpose,
    label_validity: artifact.label_validity,
    confirmatory_analysis_allowed: artifact.confirmatory_analysis_allowed,
    data_warning: artifact.data_warning,

    framework: "BSSI",
    framework_note: relabel(artifact.bssa_features.note),
    conceptual_flow: "Canonical Dataset -> BSSI Analysis -> BSSI Features (Behavioral + Sequential + Semantic) -> BSSM -> BSSI Result",
    conceptual_flow_note: "2C3L is a separate assessment framework, not a fourth BSSI feature-group dimension. See Assessment Analysis for 2C3L.",

    domains: {
      behavioral: groups.behavioral,
      sequential: groups.sequential,
      tag_based: groups.tag_based,
      semantic: groups.semantic,
    },
    combined: { ...groups.combined, label: relabel(groups.combined.label), description: relabel(groups.combined.description), note: relabel(groups.combined.note) },

    model_domain_matrix: buildMatrix(groups),
  });
}
