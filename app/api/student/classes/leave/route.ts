import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "student") throw new Error("Student role is required.");

    const body = await request.json();
    const classId = String(body.class_id ?? "").trim();
    if (!classId) throw new Error("class_id is required.");

    // Verify class exists and registration period is open
    const { data: cls, error: classError } = await supabaseAdmin
      .from("tb_classes")
      .select("class_id, register_from, register_to, is_active")
      .eq("class_id", classId)
      .maybeSingle();
    if (classError) throw classError;
    if (!cls) throw new Error("Class not found.");

    const now = new Date().toISOString();
    const from = cls.register_from as string | null;
    const to = cls.register_to as string | null;
    const inPeriod = (from === null || from <= now) && (to === null || to >= now);
    if (!inPeriod) throw new Error("Withdrawal is only allowed during the registration period.");

    // Find the active membership
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("tb_class_students")
      .select("class_student_id, status")
      .eq("class_id", classId)
      .eq("profile_id", profile.profile_id)
      .eq("status", "active")
      .maybeSingle();
    if (memberError) throw memberError;
    if (!membership) throw new Error("You are not an active member of this class.");

    const { error: updateError } = await supabaseAdmin
      .from("tb_class_students")
      .update({ status: "left", left_at: now })
      .eq("class_student_id", membership.class_student_id);
    if (updateError) throw updateError;

    return NextResponse.json({ left: true, class_id: classId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to leave class." },
      { status: 400 },
    );
  }
}
