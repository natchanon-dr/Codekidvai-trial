import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { convertRowsToCsv } from "@/lib/csv-utils";

const viewMap: Record<string, string> = {
  attempt: "vw_dataset_attempt_level",
  session: "vw_dataset_session_level",
  sequence: "vw_dataset_sequence_level",
  raw_event: "vw_dataset_raw_event_log",
};

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAdminOrResearcher(request);
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") ?? "session";
    const batchCode = searchParams.get("batch_code");
    const viewName = viewMap[type];
    if (!viewName) throw new Error("Invalid dataset type.");
    let query = supabaseAdmin.from(viewName).select("*");
    if (batchCode) query = query.eq("batch_code", batchCode);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    await supabaseAdmin.from("trn_dataset_exports").insert({ export_name: `dataset_${type}`, export_type: type, exported_by: profile.profile_id, filter_json: { type, batch_code: batchCode, source_view: viewName }, row_count: rows.length });
    const csv = convertRowsToCsv(rows);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="dataset_${type}_${new Date().toISOString().slice(0,10)}.csv"` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 400 });
  }
}
