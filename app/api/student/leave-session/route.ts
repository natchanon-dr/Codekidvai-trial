import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { getOwnedLearningSession, insertServerEvent, calculateDurationFromStart } from "@/lib/server-dataset-utils";

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    const body = await request.json();
    const session = await getOwnedLearningSession({ session_id: body.session_id, profile_id: profile.profile_id, task_id: body.task_id });
    if (session.status === "completed" || session.status === "abandoned") return NextResponse.json({ ok: true });
    const endedAt = new Date().toISOString();
    await insertServerEvent({ session_id: session.session_id, profile_id: profile.profile_id, task_id: session.task_id, event_type: "page_leave", event_value: body.reason ?? "page_leave", duration_from_start: calculateDurationFromStart(session.started_at) });
    await insertServerEvent({ session_id: session.session_id, profile_id: profile.profile_id, task_id: session.task_id, event_type: "session_end", event_value: "abandoned", duration_from_start: calculateDurationFromStart(session.started_at) });
    await supabaseAdmin.from("trn_learning_sessions").update({ status: "abandoned", ended_at: endedAt, duration_seconds: calculateDurationFromStart(session.started_at), last_event_at: endedAt }).eq("session_id", session.session_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Leave failed." }, { status: 400 });
  }
}
