// Re-export the shared Supabase client to avoid multiple GoTrueClient instances
export { supabase as dbClient } from "@/lib/supabase-client";
