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
    <main className="min-h-screen bg-[#FFF7ED]">
      {/* Navbar */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F37021] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-semibold text-[#0F172A] text-sm">KMITL Learning Research</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#64748B] hidden sm:block">{email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#C2410C] border border-[#FED7AA] hover:border-[#C2410C] rounded-lg transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-[#F37021] to-[#C2410C] rounded-2xl p-6 mb-8 text-white shadow-md">
          <p className="text-orange-100 text-sm mb-1">Welcome back</p>
          <h1 className="text-xl font-bold truncate">{email}</h1>
        </div>

        {/* Placeholder — assignment list goes here */}
        <div className="bg-white rounded-2xl border border-[#FED7AA] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#FFF7ED] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#0F172A]">No assignments yet</p>
          <p className="text-xs text-[#64748B] mt-1">Your tasks will appear here once they are assigned.</p>
        </div>
      </div>
    </main>
  );
}
