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

    let query = supabaseAdmin
      .from("vw_dataset_session_level")
      .select("batch_code, batch_name, batch_type, batch_status, task_type");

    if (fromDate) query = query.gte("started_at", fromDate);
    if (toDate) query = query.lte("started_at", toDate + "T23:59:59.999Z");
    if (batchType) query = query.eq("batch_type", batchType);
    if (taskType) query = query.eq("task_type", taskType);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Deduplicate by batch_code
    const seen = new Set<string>();
    const batches: { batch_code: string; batch_name: string; batch_type: string; batch_status: string }[] = [];
    for (const row of data ?? []) {
      const key = row.batch_code as string;
      if (!seen.has(key)) {
        seen.add(key);
        batches.push({
          batch_code: key,
          batch_name: row.batch_name as string,
          batch_type: row.batch_type as string,
          batch_status: row.batch_status as string,
        });
      }
    }

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
