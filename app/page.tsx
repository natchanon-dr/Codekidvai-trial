import { redirect } from "next/navigation";

// The app has no public landing page yet. Send visitors to login, which then
// routes each role to its own dashboard (see lib/role-home.ts).
export default function Home() {
  redirect("/auth/login");
}
