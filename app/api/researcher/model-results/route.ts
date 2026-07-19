import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import summary from "@/lib/research-artifacts/phase4/phase4_ui_summary_v1.json";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    evaluation_purpose: summary.evaluation_purpose,
    label_source: summary.label_source,
    label_validity: summary.label_validity,
    proxy_target_circularity: summary.proxy_target_circularity,
    confirmatory_analysis_allowed: summary.confirmatory_analysis_allowed,
    data_warning: summary.data_warning,
    model_comparison: summary.model_comparison,
    seed_stability: summary.seed_stability,
    validation: summary.validation,
    charts: summary.charts,
  });
}
