import { NextRequest } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface ApiUserContext {
  user_id: string;
  profile_id: string;
  participant_code: string;
  role: string;
  consent_accepted: boolean;
}

export function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim();
}

export async function requireAuthenticatedProfile(request: NextRequest): Promise<ApiUserContext> {
  const token = getBearerToken(request);
  if (!token) throw new Error("Missing authorization token.");

  // Verify token with admin client
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) throw new Error("Invalid or expired authorization token.");

  // Query profile using user's own token (bypasses any service-role misconfiguration)
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: profile, error } = await userClient
    .from("mst_profiles")
    .select("profile_id, auth_user_id, participant_code, role, consent_accepted")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !profile) throw new Error(`Profile not found. auth_user_id=${user.id} db_error=${error?.message ?? "none"}`);
  if (!profile.consent_accepted) throw new Error("Research consent is required.");

  return {
    user_id: user.id,
    profile_id: profile.profile_id,
    participant_code: profile.participant_code,
    role: profile.role,
    consent_accepted: profile.consent_accepted,
  };
}

export function createUserClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function requireAdminOrResearcher(request: NextRequest): Promise<ApiUserContext> {
  const profile = await requireAuthenticatedProfile(request);
  if (profile.role !== "admin" && profile.role !== "researcher") {
    throw new Error("Admin or researcher role is required.");
  }
  return profile;
}
