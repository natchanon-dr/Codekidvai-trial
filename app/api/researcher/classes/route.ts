import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdminOrResearcher(req);

    const { data, error } = await supabaseAdmin
      .from("tb_classes")
      .select("class_id, class_code, class_name, class_level, academic_year, term, is_active")
      .eq("is_active", true)
      .order("academic_year", { ascending: false })
      .order("class_name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ classes: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch classes";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
