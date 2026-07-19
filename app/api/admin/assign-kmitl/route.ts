import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthenticatedProfile } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedProfile(request);

    // Get or create KMITL academy
    const { data: existing } = await supabaseAdmin
      .from("tb_academy")
      .select("academy_id")
      .eq("academy_code", "KMITL")
      .maybeSingle();

    let academyId: string;
    if (existing?.academy_id) {
      academyId = existing.academy_id;
    } else {
      const { data: created, error: createError } = await supabaseAdmin
        .from("tb_academy")
        .insert({
          academy_code: "KMITL",
          academy_name: "KMITL",
          academy_description: "King Mongkut's Institute of Technology Ladkrabang",
          is_active: true,
        })
        .select("academy_id")
        .single();
      if (createError) throw createError;
      academyId = created.academy_id;
    }

    // Update all student profiles that don't have this academy_id yet
    const { data, error } = await supabaseAdmin
      .from("mst_profiles")
      .update({ academy_id: academyId })
      .eq("role", "student")
      .neq("academy_id", academyId)
      .select("profile_id");

    if (error) throw error;

    return NextResponse.json({
      academy_id: academyId,
      updated_count: (data ?? []).length,
      message: `Updated ${(data ?? []).length} student profiles to KMITL.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign academy." },
      { status: 400 },
    );
  }
}
