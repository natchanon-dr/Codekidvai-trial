import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "student") throw new Error("Student role is required.");

    const { data, error } = await supabaseAdmin
      .from("tb_class_students")
      .select(
        "class_student_id, status, joined_at, left_at, class_id, tb_classes(class_id, class_code, class_name, class_level, class_section, academic_year, term, is_active, is_open_for_enrollment, register_from, register_to, academy_id)",
      )
      .eq("profile_id", profile.profile_id)
      .eq("status", "active");

    if (error) throw error;

    const now = new Date().toISOString();
    const result = (data ?? []).map((row) => {
      const cls = row.tb_classes as unknown as Record<string, unknown> | null;
      const registerFrom = (cls?.register_from ?? null) as string | null;
      const registerTo = (cls?.register_to ?? null) as string | null;
      const canWithdraw =
        (registerFrom === null || registerFrom <= now) &&
        (registerTo === null || registerTo >= now);
      return { ...row, can_withdraw: canWithdraw };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch classes." },
      { status: 400 },
    );
  }
}
