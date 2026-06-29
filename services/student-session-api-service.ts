import { supabase } from "@/lib/supabase-client";

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("User session not found.");
  return session.access_token;
}

export async function leaveSessionOnServer(params: { session_id: string; task_id: string; reason?: string }): Promise<void> {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/student/leave-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ...params, reason: params.reason ?? "page_leave" }),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? "Leave session failed.");
  }
}
