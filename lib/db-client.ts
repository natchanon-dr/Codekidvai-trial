import { createClient } from "@supabase/supabase-js";

const dbUrl = process.env.NEXT_PUBLIC_DB_API_URL;
const dbPublicKey = process.env.NEXT_PUBLIC_DB_PUBLIC_KEY;

if (!dbUrl) {
  throw new Error("Missing NEXT_PUBLIC_DB_API_URL");
}

if (!dbPublicKey) {
  throw new Error("Missing NEXT_PUBLIC_DB_PUBLIC_KEY");
}

export const dbClient = createClient(dbUrl, dbPublicKey);
