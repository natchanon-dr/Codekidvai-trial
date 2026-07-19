import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "student") throw new Error("Student role is required.");

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search")?.trim() ?? "";
    const level = searchParams.get("level")?.trim() ?? "";
    const learnerGroup = searchParams.get("learner_group")?.trim() ?? "";

    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from("mst_profiles")
      .select("academy_id")
      .eq("profile_id", profile.profile_id)
      .single();
    if (profileError) throw profileError;

    const now = new Date().toISOString();

    let query = supabaseAdmin
      .from("tb_classes")
      .select("class_id, class_code, class_name, class_level, learner_group, class_section, academic_year, term, is_open_for_enrollment, register_from, register_to")
      .eq("is_active", true)
      .eq("is_open_for_enrollment", true);

    if (profileRow?.academy_id) {
      query = query.eq("academy_id", profileRow.academy_id);
    }

    if (search) {
      query = query.or(`class_name.ilike.%${search}%,class_code.ilike.%${search}%`);
    }
    if (level) {
      query = query.eq("class_level", level);
    }
    if (learnerGroup) {
      query = query.eq("learner_group", learnerGroup);
    }

    const { data: classes, error: classError } = await query.order("class_name");
    if (classError) throw classError;

    const openClasses = (classes ?? []).filter((cls) => {
      const from = cls.register_from as string | null;
      const to = cls.register_to as string | null;
      return (from === null || from <= now) && (to === null || to >= now);
    });

    if (openClasses.length === 0) return NextResponse.json([]);

    const classIds = openClasses.map((c) => c.class_id);
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from("tb_class_students")
      .select("class_id, status")
      .eq("profile_id", profile.profile_id)
      .in("class_id", classIds)
      .eq("status", "active");
    if (memberError) throw memberError;

    const activeClassIds = new Set((memberships ?? []).map((m) => m.class_id));
    const available = openClasses.filter((c) => !activeClassIds.has(c.class_id));

    return NextResponse.json(available);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch available classes." },
      { status: 400 },
    );
  }
}
