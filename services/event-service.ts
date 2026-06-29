import { supabase } from "@/lib/supabase-client";
import type { EventLogInput } from "@/types/dataset";

export function calculateDurationFromStart(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
}

export async function getNextEventOrder(sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from("trn_event_logs")
    .select("event_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw error;
  return (count ?? 0) + 1;
}

export async function logLearningEvent(input: EventLogInput): Promise<void> {
  const eventOrder = await getNextEventOrder(input.session_id);
  const now = new Date().toISOString();
  const { error } = await supabase.from("trn_event_logs").insert({
    session_id: input.session_id,
    profile_id: input.profile_id,
    task_id: input.task_id,
    event_order: eventOrder,
    event_type: input.event_type,
    event_value: input.event_value ?? null,
    duration_from_start: input.duration_from_start ?? null,
    metadata_json: input.metadata_json ?? null,
    event_time: now,
  });
  if (error) throw error;
  await supabase.from("trn_learning_sessions").update({ last_event_at: now }).eq("session_id", input.session_id);
}
