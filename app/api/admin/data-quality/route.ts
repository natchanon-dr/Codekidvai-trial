import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
    const mode = request.nextUrl.searchParams.get("mode") ?? "summary";
    const viewName = mode === "detail" ? "vw_data_quality_checks" : "vw_data_quality_summary";
    const { data, error } = await supabaseAdmin.from(viewName).select("*");
    if (error) throw new Error(error.message);
    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Data quality failed." }, { status: 400 });
  }
}
