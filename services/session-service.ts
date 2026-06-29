import { supabase } from "@/lib/supabase-client";
import type { LearningSession } from "@/types/dataset";

export function detectDeviceType(): string {
  if (typeof navigator === "undefined") return "unknown";
  return /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

export function detectBrowserName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  return "unknown";
}

export async function startLearningSession(params: {
  profile_id: string;
  task_id: string;
  batch_id?: string | null;
  assignment_id?: string | null;
  user_agent?: string | null;
}): Promise<LearningSession> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("trn_learning_sessions").insert({
    profile_id: params.profile_id,
    task_id: params.task_id,
    batch_id: params.batch_id ?? null,
    assignment_id: params.assignment_id ?? null,
    started_at: now,
    last_event_at: now,
    status: "started",
    user_agent: params.user_agent ?? null,
    device_type: detectDeviceType(),
    browser_name: detectBrowserName(),
  }).select("*").single();
  if (error) throw error;
  return data as LearningSession;
}

export async function markAssignmentInProgress(params: { task_id: string; profile_id: string }): Promise<void> {
  const { error } = await supabase
    .from("trn_task_assignments")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("task_id", params.task_id)
    .eq("profile_id", params.profile_id)
    .eq("status", "assigned");
  if (error) throw error;
}
