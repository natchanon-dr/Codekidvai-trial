import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ classId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdminOrResearcher(req);
    const { classId } = await params;

    // Batch IDs linked to this class
    const { data: sets, error: setsErr } = await supabaseAdmin
      .from("tb_class_sets")
      .select("batch_id")
      .eq("class_id", classId);

    if (setsErr) throw setsErr;

    const batchIds = (sets ?? []).map((s) => s.batch_id as string);

    if (batchIds.length === 0) {
      return NextResponse.json({ session_count: 0, learner_count: 0 });
    }

    // Count sessions and learners from trn_learning_sessions
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from("trn_learning_sessions")
      .select("session_id, profile_id")
      .in("batch_id", batchIds);

    if (sessErr) throw sessErr;

    // Resolve participant_code for each unique profile_id
    const profileIds = [...new Set((sessions ?? []).map((s) => s.profile_id as string))];

    let learnerCount = 0;
    if (profileIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("mst_profiles")
        .select("profile_id, participant_code")
        .in("profile_id", profileIds);

      const codes = new Set((profiles ?? []).map((p) => p.participant_code as string));
      learnerCount = codes.size;
    }

    const sessionCount = new Set((sessions ?? []).map((s) => s.session_id as string)).size;

    return NextResponse.json({ session_count: sessionCount, learner_count: learnerCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch class summary";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
