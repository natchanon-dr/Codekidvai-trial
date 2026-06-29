import { supabase } from "@/lib/supabase-client";

export type DatasetExportType = "attempt" | "session" | "sequence" | "raw_event";

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("User session not found.");
  return session.access_token;
}

function getFilenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? fallback;
}

export async function exportDatasetAsCsv(type: DatasetExportType, params?: { batch_code?: string }): Promise<void> {
  const accessToken = await getAccessToken();
  const searchParams = new URLSearchParams({ type });
  if (params?.batch_code) searchParams.set("batch_code", params.batch_code);

  const response = await fetch(`/api/admin/export-dataset?${searchParams.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? "Export failed.");
  }
  const blob = await response.blob();
  const filename = getFilenameFromContentDisposition(response.headers.get("Content-Disposition"), `dataset_${type}.csv`);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
