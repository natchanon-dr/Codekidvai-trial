import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdminOrResearcher(req);

    const { data, error } = await supabaseAdmin
      .from("tb_classes")
      .select("class_id, class_code, class_name, class_level, academic_year, term, is_active, tb_class_students(count)")
      .eq("is_active", true)
      .order("academic_year", { ascending: false })
      .order("class_name", { ascending: true });

    if (error) throw error;

    const classes = (data ?? []).map(row => ({
      class_id:       row.class_id,
      class_code:     row.class_code,
      class_name:     row.class_name,
      class_level:    row.class_level,
      academic_year:  row.academic_year,
      term:           row.term,
      is_active:      row.is_active,
      student_count:  (row.tb_class_students as unknown as { count: number }[])?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ classes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch classes";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
