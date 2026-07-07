import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type JoinClassBody = {
  enrollment_code?: string;
  class_code?: string;
};

type ClassRow = {
  class_id: string;
  academy_id: string | null;
  class_code: string;
  class_name: string;
  class_level: string | null;
  enrollment_code: string | null;
  is_open_for_enrollment: boolean | null;
  is_active: boolean | null;
};

type MembershipRow = {
  class_student_id: string;
  status: string | null;
};

function normalizeCode(value: unknown) {
  return String(value ?? "").trim();
}

async function findClassByCode(code: string) {
  const byEnrollmentCode = await supabaseAdmin
    .from("tb_classes")
    .select("class_id, academy_id, class_code, class_name, class_level, enrollment_code, is_open_for_enrollment, is_active")
    .eq("enrollment_code", code)
    .maybeSingle();
  if (!byEnrollmentCode.error && byEnrollmentCode.data) return byEnrollmentCode.data as ClassRow;
  if (byEnrollmentCode.error && byEnrollmentCode.error.code !== "PGRST116") throw byEnrollmentCode.error;

  const byClassCode = await supabaseAdmin
    .from("tb_classes")
    .select("class_id, academy_id, class_code, class_name, class_level, enrollment_code, is_open_for_enrollment, is_active")
    .eq("class_code", code)
    .maybeSingle();
  if (byClassCode.error && byClassCode.error.code !== "PGRST116") throw byClassCode.error;
  return (byClassCode.data ?? null) as ClassRow | null;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "student") throw new Error("Student role is required.");

    const body = (await request.json()) as JoinClassBody;
    const code = normalizeCode(body.enrollment_code || body.class_code);
    if (!code) throw new Error("Class code is required.");

    const classItem = await findClassByCode(code);
    if (!classItem) throw new Error("Class not found.");
    if (!classItem.is_active) throw new Error("This class is inactive.");
    if (classItem.is_open_for_enrollment === false) throw new Error("This class is closed for enrollment.");

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("tb_class_students")
      .select("class_student_id, status")
      .eq("class_id", classItem.class_id)
      .eq("profile_id", profile.profile_id)
      .limit(1);
    if (existingError) throw existingError;

    const existing = (existingRows?.[0] ?? null) as MembershipRow | null;
    if (existing?.status === "active") {
      return NextResponse.json({ joined: false, already_member: true, class: classItem });
    }

    const now = new Date().toISOString();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("tb_class_students")
        .update({
          status: "active",
          joined_at: now,
          left_at: null,
          student_academy_code: profile.participant_code,
        })
        .eq("class_student_id", existing.class_student_id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("tb_class_students")
        .insert({
          class_id: classItem.class_id,
          profile_id: profile.profile_id,
          student_academy_code: profile.participant_code,
          status: "active",
          joined_at: now,
        });
      if (error) throw error;
    }

    return NextResponse.json({ joined: true, already_member: false, class: classItem }, { status: 201 });
  } catch (error) {
    console.error("Student join class API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to join class." },
      { status: 400 },
    );
  }
}
