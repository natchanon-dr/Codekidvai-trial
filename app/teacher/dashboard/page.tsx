"use client";

import { useEffect, useState } from "react";
import { dbClient } from "@/lib/db-client";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>("");

  useEffect(() => {
    async function loadUser() {
      const { data } = await dbClient.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setEmail(data.user.email);
    }

    loadUser();
  }, [router]);

  async function handleLogout() {
    await dbClient.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>Welcome: {email}</p>

      <button onClick={handleLogout} className="bg-red-600 text-white px-4 py-2 rounded">
        Logout
      </button>
    </main>
  );
}