import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

    // For each set, fetch the distinct task IDs
    const results = await Promise.all(
      (sets ?? []).map(async (s) => {
        const batch = Array.isArray(s.mst_experiment_batches)
          ? s.mst_experiment_batches[0]
          : s.mst_experiment_batches;

        const { data: assignments } = await supabaseAdmin
          .from("trn_task_assignments")
          .select("task_id")
          .eq("batch_id", s.batch_id);

        const taskIds = [...new Set((assignments ?? []).map((a: { task_id: string }) => a.task_id))];

        return {
          batch_id:   s.batch_id,
          family:     s.family,
          batch_code: batch?.batch_code ?? null,
          batch_name: batch?.batch_name ?? null,
          batch_type: batch?.batch_type ?? null,
          task_count: taskIds.length,
          task_ids:   taskIds,
        };
      })
    );

    return NextResponse.json({ sets: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch sets";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
