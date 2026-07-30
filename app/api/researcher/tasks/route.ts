import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdminOrResearcher(req);

    const { searchParams } = new URL(req.url);
    const classId   = searchParams.get("class_id")   ?? null;
    const setFamily = searchParams.get("set_family")  ?? null;
    const taskType  = searchParams.get("task_type")   ?? null;

    if (!classId) {
      return NextResponse.json({ tasks: [] });
    }

    // class → sets → task_assignments → tasks
    let setsQuery = supabaseAdmin
      .from("tb_class_sets")
      .select("batch_id")
      .eq("class_id", classId);

    if (setFamily) setsQuery = setsQuery.eq("family", setFamily);

    const { data: sets, error: setsErr } = await setsQuery;
    if (setsErr) throw setsErr;

    const batchIds = (sets ?? []).map((s) => s.batch_id as string);
    if (batchIds.length === 0) return NextResponse.json({ tasks: [] });

    let tasksQuery = supabaseAdmin
      .from("trn_task_assignments")
      .select("task_id, mst_tasks!inner(task_id, task_code, task_title, task_type, is_active)")
      .in("batch_id", batchIds);

    if (taskType) {
      tasksQuery = tasksQuery.eq("mst_tasks.task_type", taskType);
    }

    const { data: assignments, error: assignErr } = await tasksQuery;
    if (assignErr) throw assignErr;

    // Deduplicate by task_id, keep only active tasks
    const seen = new Map<string, { task_id: string; task_code: string; task_title: string; task_type: string }>();
    for (const a of assignments ?? []) {
      const t = Array.isArray(a.mst_tasks) ? a.mst_tasks[0] : a.mst_tasks;
      if (!t || !t.is_active) continue;
      if (!seen.has(t.task_id)) {
        seen.set(t.task_id, {
          task_id:    t.task_id,
          task_code:  t.task_code,
          task_title: t.task_title,
          task_type:  t.task_type,
        });
      }
    }

    return NextResponse.json({ tasks: Array.from(seen.values()) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch tasks";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
