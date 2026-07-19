import { supabase } from "@/lib/supabase-client";
import type { ScoreResult } from "@/types/dataset";

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("User session not found.");
  return session.access_token;
}

export async function runAnswerOnServer(params: {
  session_id: string;
  task_id: string;
  answer_text: string;
  answer_json?: Record<string, unknown> | null;
}): Promise<ScoreResult & { execution_time_ms: number }> {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/student/run-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Run answer failed.");
  return result;
}

export async function submitAnswerOnServer(params: {
  session_id: string;
  task_id: string;
  batch_id: string;
  answer_text: string;
  answer_json?: Record<string, unknown> | null;
}): Promise<ScoreResult & { execution_time_ms: number; session_status: "completed" }> {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/student/submit-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Submit answer failed.");
  return result;
}
