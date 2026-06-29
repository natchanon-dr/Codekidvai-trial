import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
    const { data: summary } = await supabaseAdmin.from("vw_admin_dashboard_summary").select("*").single();
    const { data: task_error_summary } = await supabaseAdmin.from("vw_admin_task_error_summary").select("*").limit(10);
    const { data: task_duration_summary } = await supabaseAdmin.from("vw_admin_task_duration_summary").select("*").limit(10);
    const { data: daily_activity_summary } = await supabaseAdmin.from("vw_admin_daily_activity_summary").select("*").limit(14);
    return NextResponse.json({ summary, task_error_summary: task_error_summary ?? [], task_duration_summary: task_duration_summary ?? [], daily_activity_summary: daily_activity_summary ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dashboard failed." }, { status: 401 });
  }
}
