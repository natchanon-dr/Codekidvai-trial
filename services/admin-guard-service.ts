import { getCurrentProfile } from "@/services/profile-service";

export async function requireAdminOrResearcher(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "researcher";
}
