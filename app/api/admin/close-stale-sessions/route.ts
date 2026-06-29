import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
    const body = await request.json().catch(() => ({}));
    const timeoutMinutes = Number(body.timeout_minutes ?? 30);
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
    const { data: sessions, error } = await supabaseAdmin
      .from("trn_learning_sessions")
      .select("session_id, started_at")
      .in("status", ["started", "in_progress"])
      .lt("last_event_at", cutoff);
    if (error) throw new Error(error.message);
    const ids = (sessions ?? []).map((s) => s.session_id);
    if (ids.length > 0) await supabaseAdmin.from("trn_learning_sessions").update({ status: "abandoned", ended_at: new Date().toISOString() }).in("session_id", ids);
    return NextResponse.json({ closed_count: ids.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Close stale sessions failed." }, { status: 400 });
  }
}
