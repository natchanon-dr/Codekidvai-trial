import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthenticatedProfile } from "@/lib/api-auth";

const STUDENT_BASE = 69056020;
const TEACHER_BASE = 69056020;

export async function POST(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "admin") throw new Error("Admin role is required.");

    // Get KMITL academy
    const { data: academy, error: academyError } = await supabaseAdmin
      .from("tb_academy")
      .select("academy_id")
      .eq("academy_code", "KMITL")
      .single();
    if (academyError || !academy) throw new Error("KMITL academy not found. Run migration 010 first.");

    const academyId = academy.academy_id as string;

    // Fetch all students ordered by created_at
    const { data: students, error: studentsError } = await supabaseAdmin
      .from("mst_profiles")
      .select("participant_code, created_at")
      .eq("role", "student")
      .order("created_at", { ascending: true });
    if (studentsError) throw studentsError;

    // Fetch all teachers ordered by created_at
    const { data: teachers, error: teachersError } = await supabaseAdmin
      .from("mst_profiles")
      .select("participant_code, created_at")
      .eq("role", "teacher")
      .order("created_at", { ascending: true });
    if (teachersError) throw teachersError;

    const rows: { academy_id: string; participant_code: string; academy_member_id: string }[] = [];

    (students ?? []).forEach((s, i) => {
      rows.push({
        academy_id: academyId,
        participant_code: s.participant_code as string,
        academy_member_id: `S${STUDENT_BASE + i}`,
      });
    });

    (teachers ?? []).forEach((t, i) => {
      rows.push({
        academy_id: academyId,
        participant_code: t.participant_code as string,
        academy_member_id: `T${TEACHER_BASE + i}`,
      });
    });

    if (rows.length === 0) {
      return NextResponse.json({ message: "No profiles found.", inserted: 0, skipped: 0 });
    }

    // Upsert — skip duplicates (do nothing on conflict)
    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from("mst_academy_members")
      .upsert(rows, { onConflict: "academy_id,participant_code", ignoreDuplicates: true })
      .select("academy_member_id");
    if (upsertError) throw upsertError;

    return NextResponse.json({
      message: `Seeded ${rows.length} profiles (${students?.length ?? 0} students, ${teachers?.length ?? 0} teachers).`,
      total: rows.length,
      inserted: (upserted ?? []).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to seed academy members." },
      { status: 400 },
    );
  }
}
