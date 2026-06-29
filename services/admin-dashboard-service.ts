import { supabase } from "@/lib/supabase-client";

export interface AdminDashboardData {
  summary: Record<string, unknown>;
  task_error_summary: Record<string, unknown>[];
  task_duration_summary: Record<string, unknown>[];
  daily_activity_summary: Record<string, unknown>[];
}

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("User session not found.");
  return session.access_token;
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${accessToken}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Cannot load dashboard.");
  return result;
}
