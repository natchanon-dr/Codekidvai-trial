import { supabase } from "@/lib/supabase-client";

export async function acceptResearchConsent(profileId: string): Promise<void> {
  const { error } = await supabase
    .from("mst_profiles")
    .update({ consent_accepted: true, consent_accepted_at: new Date().toISOString() })
    .eq("profile_id", profileId);
  if (error) throw error;
}
