import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);

    const params = request.nextUrl.searchParams;
    const fromDate = params.get("from_date");
    const toDate = params.get("to_date");
    const batchType = params.get("batch_type");
    const taskType = params.get("task_type");
    const classId = params.get("class_id");

    // Resolve batch_codes that belong to any class (always filter to class-linked batches only)
    let setsQuery = supabaseAdmin
      .from("tb_class_sets")
      .select("batch_id, mst_experiment_batches(batch_code)");
    if (classId) setsQuery = setsQuery.eq("class_id", classId);
    const { data: sets } = await setsQuery;
    const allowedBatchCodes = (sets ?? []).map((s) => {
      const b = Array.isArray(s.mst_experiment_batches)
        ? s.mst_experiment_batches[0]
        : s.mst_experiment_batches;
      return (b as { batch_code: string } | null)?.batch_code ?? "";
    }).filter(Boolean);

    let query = supabaseAdmin
      .from("vw_dataset_session_level")
      .select("batch_code, batch_name, batch_type, batch_status, task_type");

    if (fromDate) query = query.gte("started_at", fromDate);
    if (toDate) query = query.lte("started_at", toDate + "T23:59:59.999Z");
    if (batchType) query = query.eq("batch_type", batchType);
    if (taskType) query = query.eq("task_type", taskType);
    query = query.in("batch_code", allowedBatchCodes.length ? allowedBatchCodes : ["__none__"]);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Deduplicate by batch_code, collecting all task_types per batch
    const batchMap = new Map<string, { batch_code: string; batch_name: string; batch_type: string; batch_status: string; task_types: Set<string> }>();
    for (const row of data ?? []) {
      const key = row.batch_code as string;
      if (!batchMap.has(key)) {
        batchMap.set(key, {
          batch_code: key,
          batch_name: row.batch_name as string,
          batch_type: row.batch_type as string,
          batch_status: row.batch_status as string,
          task_types: new Set(),
        });
      }
      const taskType = row.task_type as string | null;
      if (taskType) batchMap.get(key)!.task_types.add(taskType);
    }
    const batches = [...batchMap.values()].map((b) => ({ ...b, task_types: [...b.task_types].sort() }));

    // Collect distinct filter options from raw data
    const batchTypes = [...new Set((data ?? []).map((r) => r.batch_type as string))].filter(Boolean).sort();
    const taskTypes = [...new Set((data ?? []).map((r) => r.task_type as string))].filter(Boolean).sort();

    return NextResponse.json({ batches, batchTypes, taskTypes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load batches." },
      { status: 400 },
    );
  }
}
