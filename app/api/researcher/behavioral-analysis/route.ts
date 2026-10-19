import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { computeBehavioralResult, type BehavioralResult } from "@/lib/analysis/behavioral";

// ---------------------------------------------------------------------------
// Behavioral Analysis — one of the five parallel Analysis paths (see
// docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md, M5.31-R4). Input:
// Behavioral Features. Predictive Models: LR / RF (not wired here — no
// model has been trained against these features yet; this route only
// serves the real, live-computed feature values).
//
// This route did not exist before M5.31-R4 (confirmed absent by the
// architecture audit). It reuses computeBehavioralResult() from
// lib/analysis/behavioral.ts — the SAME pure function the pipeline worker
// calls for a 'behavioral' pipeline run — so results here are computed by
// the exact same formula, just invoked live instead of via a worker run.
// Only 8 of 14 Phase 4 behavioral features are implemented; the other 6
// are deferred pending a research-team feature-engineering decision (see
// that file's header comment) — this route does not invent them.
//
// UI concept: matches the dataset-table pattern used by Final Result /
// Sequential Analysis (list mst_datasets, filter by batch/activity/task).
// ---------------------------------------------------------------------------

type SessionRow = { session_id: string; profile_id: string; duration_seconds: number | null; status: string };
type AttemptRow = { attempt_id: string; session_id: string; is_correct: boolean; attempt_type: string | null; error_type: string | null };

async function fetchSessions(batchId: string): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id, duration_seconds, status")
    .eq("batch_id", batchId)
    .not("profile_id", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionRow[];
}

async function fetchAttempts(sessionIds: string[]): Promise<AttemptRow[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_attempts")
    .select("attempt_id, session_id, is_correct, attempt_type, error_type")
    .in("session_id", sessionIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as AttemptRow[];
}

async function fetchEventCounts(sessionIds: string[]): Promise<Array<{ session_id: string; event_count: number }>> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin.from("trn_event_logs").select("session_id").in("session_id", sessionIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { session_id: string }[]) map.set(row.session_id, (map.get(row.session_id) ?? 0) + 1);
  return Array.from(map.entries()).map(([session_id, event_count]) => ({ session_id, event_count }));
}

async function fetchSubmissionCounts(sessionIds: string[]): Promise<Array<{ session_id: string; submission_count: number }>> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin.from("trn_submissions").select("session_id").in("session_id", sessionIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { session_id: string }[]) map.set(row.session_id, (map.get(row.session_id) ?? 0) + 1);
  return Array.from(map.entries()).map(([session_id, submission_count]) => ({ session_id, submission_count }));
}

export type BehavioralDatasetRecord = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string | null;
  active: boolean;
  created_at: string;
  behavioral: BehavioralResult | { error: string } | null;
};

async function handleListMode(): Promise<NextResponse> {
  const { data: datasets, error: dsErr } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, code, name, batch_type, set_family, task_type, task_set_id, active, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (dsErr) return NextResponse.json({ error: dsErr.message }, { status: 500 });

  const dsRows = datasets ?? [];

  const datasetRecords: BehavioralDatasetRecord[] = await Promise.all(
    dsRows.map(async (d): Promise<BehavioralDatasetRecord> => {
      const base = {
        id: d.id as string,
        code: d.code as string,
        name: d.name as string,
        batch_type: (d.batch_type as string) ?? "",
        set_family: (d.set_family as string) ?? "",
        task_type: (d.task_type as string | null) ?? null,
        active: (d.active as boolean) ?? false,
        created_at: d.created_at as string,
      };

      const taskSetId = d.task_set_id as string | null;
      if (!taskSetId) {
        return { ...base, behavioral: { error: "Dataset is not linked to an experiment batch (task_set_id is null)." } };
      }

      try {
        const sessions = await fetchSessions(taskSetId);
        if (sessions.length === 0) {
          return { ...base, behavioral: { error: "No learning sessions found for this dataset's batch." } };
        }
        const sessionIds = sessions.map((s) => s.session_id);
        const [attempts, eventCounts, submissionCounts] = await Promise.all([
          fetchAttempts(sessionIds),
          fetchEventCounts(sessionIds),
          fetchSubmissionCounts(sessionIds),
        ]);
        const result = computeBehavioralResult(base.id, sessions, attempts, eventCounts, submissionCounts);
        return { ...base, behavioral: result };
      } catch (err) {
        return { ...base, behavioral: { error: err instanceof Error ? err.message : "Failed to compute behavioral features." } };
      }
    }),
  );

  return NextResponse.json({
    note:
      "Behavioral features are computed live via the same computeBehavioralResult() formula the " +
      "pipeline worker uses for a 'behavioral' run. Only 8 of 14 Phase 4 behavioral features are " +
      "implemented (total_sessions, total_attempts, correct_attempts, attempt_success_rate, " +
      "avg_session_duration_seconds, total_events, error_rate, submission_rate) — the other 6 " +
      "are deferred pending a research-team feature-engineering decision.",
    datasets: datasetRecords,
    filter_options: {
      batch_types: [...new Set(dsRows.map((d) => d.batch_type as string).filter(Boolean))],
      set_families: [...new Set(dsRows.map((d) => d.set_family as string).filter(Boolean))],
      task_types: [...new Set(dsRows.map((d) => d.task_type as string).filter((v): v is string => !!v))],
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return handleListMode();
}
