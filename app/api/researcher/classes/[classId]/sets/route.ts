import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLearningMode } from "@/lib/research-context";

type RouteContext = { params: Promise<{ classId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdminOrResearcher(req);
    const { classId } = await params;

    // Fetch task sets linked to this class
    const { data: sets, error: setsErr } = await supabaseAdmin
      .from("tb_class_sets")
      .select("batch_id, family, mst_experiment_batches(batch_id, batch_code, batch_name, batch_type)")
      .eq("class_id", classId);

    if (setsErr) throw setsErr;

    // For each set, fetch task IDs and their task_type
    const results = await Promise.all(
      (sets ?? []).map(async (s) => {
        const batch = Array.isArray(s.mst_experiment_batches)
          ? s.mst_experiment_batches[0]
          : s.mst_experiment_batches;

        const { data: assignments } = await supabaseAdmin
          .from("trn_task_assignments")
          .select("task_id, mst_tasks(task_type)")
          .eq("batch_id", s.batch_id);

        // Deduplicate by task_id, preserving task_type
        const seen = new Map<string, string>();
        for (const a of assignments ?? []) {
          if (!seen.has(a.task_id)) {
            const taskType = (
              Array.isArray(a.mst_tasks)
                ? (a.mst_tasks[0] as { task_type?: string } | undefined)?.task_type
                : (a.mst_tasks as { task_type?: string } | null)?.task_type
            ) ?? "sql_text";
            seen.set(a.task_id, taskType);
          }
        }

        const taskIds   = Array.from(seen.keys());
        const taskTypes = Array.from(seen.values());

        // Count occurrences per task_type
        const taskTypeCounts: Record<string, number> = {};
        for (const tt of taskTypes) {
          taskTypeCounts[tt] = (taskTypeCounts[tt] ?? 0) + 1;
        }

        // Derive learning mode: text_based unless any block-based type present
        const uniqueTypes = Object.keys(taskTypeCounts);
        const modes = uniqueTypes.map(getLearningMode);
        const learningMode =
          modes.length === 0            ? "text_based" :
          modes.every(m => m === "text_based")  ? "text_based" :
          modes.every(m => m === "block_based") ? "block_based" :
          "mixed";

        return {
          batch_id:        s.batch_id,
          family:          s.family,
          batch_code:      batch?.batch_code ?? null,
          batch_name:      batch?.batch_name ?? null,
          batch_type:      batch?.batch_type ?? null,
          task_count:      taskIds.length,
          task_ids:        taskIds,
          task_type_counts: taskTypeCounts,
          learning_mode:   learningMode,
        };
      })
    );

    return NextResponse.json({ sets: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch sets";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
