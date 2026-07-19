import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/types/dataset";

export function generateParticipantCode(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `P${datePart}${randomPart}`;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("mst_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function createProfileForCurrentUser(input?: {
  display_name?: string;
  grade_level?: string;
  school_type?: string;
}): Promise<Profile> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("User not found.");

  const { data: academyData, error: academyError } = await supabase
    .from("tb_academy")
    .select("academy_id")
    .eq("academy_code", "KMITL")
    .eq("is_active", true)
    .maybeSingle();
  if (academyError) throw new Error(`Academy lookup failed: ${academyError.message}`);
  if (!academyData?.academy_id) throw new Error("Default academy (KMITL) not found. Please contact the administrator.");

  const { data, error } = await supabase
    .from("mst_profiles")
    .insert({
      auth_user_id: user.id,
      participant_code: generateParticipantCode(),
      role: "student",
      display_name: input?.display_name ?? null,
      grade_level: input?.grade_level ?? null,
      school_type: input?.school_type ?? null,
      academy_id: academyData.academy_id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function getOrCreateCurrentProfile(): Promise<Profile> {
  const existing = await getCurrentProfile();
  if (existing) return existing;
  return createProfileForCurrentUser();
}
