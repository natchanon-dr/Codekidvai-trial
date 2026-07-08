import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthenticatedProfile } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuthenticatedProfile(request);

    // Query profile (no join — separate queries to avoid PostgREST FK ambiguity)
    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from("mst_profiles")
      .select("profile_id, display_name, participant_code, role, academy_id")
      .eq("profile_id", ctx.profile_id)
      .single();
    if (profileError || !profileRow) throw new Error("Profile not found.");

    const profile = profileRow as {
      profile_id: string;
      display_name: string | null;
      participant_code: string;
      role: string;
      academy_id: string | null;
    };

    // Fetch academy_member_id by participant_code (no academy_id required on profile)
    let academyMemberId: string | null = null;
    let resolvedAcademyId: string | null = profile.academy_id;
    if (profile.participant_code) {
      const { data: memberRow } = await supabaseAdmin
        .from("mst_academy_members")
        .select("academy_member_id, academy_id")
        .eq("participant_code", profile.participant_code)
        .maybeSingle();
      const mr = memberRow as { academy_member_id: string; academy_id: string } | null;
      academyMemberId = mr?.academy_member_id ?? null;
      if (mr?.academy_id) resolvedAcademyId = mr.academy_id;
    }

    // Fetch academy name
    let academyName: string | null = null;
    let academyCode: string | null = null;
    if (resolvedAcademyId) {
      const { data: academyRow } = await supabaseAdmin
        .from("tb_academy")
        .select("academy_name, academy_code")
        .eq("academy_id", resolvedAcademyId)
        .maybeSingle();
      const ar = academyRow as { academy_name: string; academy_code: string } | null;
      academyName = ar?.academy_name ?? null;
      academyCode = ar?.academy_code ?? null;
    }

    // Get email from auth
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(ctx.user_id);

    return NextResponse.json({
      display_name: profile.display_name,
      email: user?.email ?? null,
      participant_code: profile.participant_code,
      academy_member_id: academyMemberId,
      academy_id: profile.academy_id,
      academy_name: academyName,
      academy_code: academyCode,
      role: profile.role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch profile." },
      { status: 400 },
    );
  }
}
