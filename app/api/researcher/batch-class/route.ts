import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// GET /api/researcher/batch-class?batch_id=xxx
// Returns the class_id (and basic class info) that owns a given task-set batch.
export async function GET(req: NextRequest) {
  try { await requireAdminOrResearcher(req); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const batchId = new URL(req.url).searchParams.get("batch_id");
  if (!batchId) {
    return NextResponse.json({ error: "batch_id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tb_class_sets")
    .select("class_id, tb_classes(class_id, class_code, class_name)")
    .eq("batch_id", batchId)
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ class_id: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cls = Array.isArray(data.tb_classes) ? data.tb_classes[0] : data.tb_classes;
  return NextResponse.json({
    class_id:   data.class_id,
    class_code: cls?.class_code ?? null,
    class_name: cls?.class_name ?? null,
  });
}
