import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type JoinClassBody = {
  class_code?: string;
};

type ClassRow = {
  class_id: string;
  academy_id: string | null;
  class_code: string;
  class_name: string;
  class_level: string | null;
  is_open_for_enrollment: boolean | null;
  is_active: boolean | null;
  register_from: string | null;
  register_to: string | null;
};

type MembershipRow = {
  class_student_id: string;
  status: string | null;
};

async function assignClassSetsToStudent(classId: string, profileId: string, now: string) {
  const { data: classSets, error: setsError } = await supabaseAdmin
    .from("tb_class_sets")
    .select("batch_id")
    .eq("class_id", classId);
  if (setsError || !classSets || classSets.length === 0) return;

  for (const { batch_id } of classSets as { batch_id: string }[]) {
    const { data: tasks } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("task_id, assigned_order, assigned_group, is_required, is_unlocked")
      .eq("batch_id", batch_id)
      .order("assigned_order", { ascending: true });

    if (!tasks || tasks.length === 0) continue;
    const seen = new Map<string, typeof tasks[0]>();
    for (const t of tasks) { if (!seen.has(t.task_id)) seen.set(t.task_id, t); }
    const rows = [...seen.values()].map(t => ({
      batch_id,
      profile_id: profileId,
      task_id: t.task_id,
      assigned_order: Number(t.assigned_order),
      assigned_group: t.assigned_group,
      is_required: t.is_required ?? true,
      is_unlocked: t.is_unlocked ?? true,
      status: "assigned",
      assigned_at: now,
    }));
    await supabaseAdmin.from("trn_task_assignments").upsert(rows, { onConflict: "batch_id,profile_id,task_id", ignoreDuplicates: true });
  }
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim();
}

const CLASS_FIELDS =
  "class_id, academy_id, class_code, class_name, class_level, is_open_for_enrollment, is_active, register_from, register_to";

async function findClassByCode(code: string) {
  const { data, error } = await supabaseAdmin
    .from("tb_classes")
    .select(CLASS_FIELDS)
    .eq("class_code", code)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return (data ?? null) as ClassRow | null;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "student") throw new Error("Student role is required.");

    const body = (await request.json()) as JoinClassBody;
    const code = normalizeCode(body.class_code);
    if (!code) throw new Error("Class code is required.");

    const classItem = await findClassByCode(code);
    if (!classItem) throw new Error("Class not found.");
    if (!classItem.is_active) throw new Error("This class is inactive.");
    if (classItem.is_open_for_enrollment === false) throw new Error("This class is closed for enrollment.");

    const now = new Date().toISOString();
    const regFrom = classItem.register_from as string | null;
    const regTo = classItem.register_to as string | null;
    const inPeriod = (regFrom === null || regFrom <= now) && (regTo === null || regTo >= now);
    if (!inPeriod) throw new Error("Enrollment is only allowed during the registration period.");

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

    // Auto-assign sets that the teacher linked to this class
    await assignClassSetsToStudent(classItem.class_id, profile.profile_id, now);

    return NextResponse.json({ joined: true, already_member: false, class: classItem }, { status: 201 });
  } catch (error) {
    console.error("Student join class API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to join class." },
      { status: 400 },
    );
  }
}
