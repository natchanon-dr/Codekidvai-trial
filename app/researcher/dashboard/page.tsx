"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type ProfileDetail = {
  display_name: string | null;
  email: string | null;
  participant_code: string | null;
};

const NAV_ITEMS = [
  {
    title: "Dataset Export",
    description: "Download anonymised session, attempt, sequence, and event data as CSV.",
    href: "/researcher/dataset",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    available: true,
  },
  {
    title: "Model Results",
    description: "View AI risk model evaluation metrics and feature importance reports.",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#94A3B8]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    available: false,
  },
  {
    title: "Analytics Summary",
    description: "Aggregate learning analytics across batches and learner groups.",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#94A3B8]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    available: false,
  },
];

export default function ResearcherDashboardPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("mst_profiles")
        .select("display_name, participant_code, role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (prof && prof.role !== "researcher" && prof.role !== "admin") {
        router.push("/student/dashboard");
        return;
      }

      setProfile({
        display_name: prof?.display_name ?? null,
        email: user?.email ?? null,
        participant_code: prof?.participant_code ?? null,
      });
      setLoading(false);
    }
    init();
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      {/* Header */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">CodeKidVai Researcher</p>
          <p className="text-xs text-[#64748B]">Research data access portal</p>
        </div>
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-[#FED7AA] flex items-center justify-center hover:bg-[#F37021] hover:text-white transition-colors text-[#F37021] border border-[#FED7AA]"
            title="Profile"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-10 w-64 bg-white border border-[#FED7AA] rounded-2xl shadow-lg z-50 p-4 space-y-3">
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Name</p>
                <p className="text-sm font-semibold text-[#0F172A]">{profile?.display_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Email</p>
                <p className="text-sm text-[#0F172A] break-all">{profile?.email ?? "—"}</p>
              </div>
              <hr className="border-[#FED7AA]" />
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Participant Code</p>
                <p className="text-sm font-mono font-semibold text-[#64748B]">{profile?.participant_code ?? "—"}</p>
              </div>
              <hr className="border-[#FED7AA]" />
              <div className="flex gap-2">
                <button className="flex-1 py-1.5 rounded-xl border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
                  Switch Academy
                </button>
                <button className="flex-1 py-1.5 rounded-xl border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
                  Add Academy
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Title */}
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Hello, {profile?.display_name?.split(" ")[0] ?? "Researcher"}
          </h1>
          <p className="text-sm text-[#64748B] mt-1">Research data access for CKV learning analytics platform.</p>
        </section>

        {/* Nav cards */}
        <section>
          <h2 className="text-base font-bold text-[#0F172A] mb-3">Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {NAV_ITEMS.map((item) =>
              item.available ? (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex flex-col gap-3 bg-white border border-[#FED7AA] rounded-2xl p-5 hover:border-[#F37021] hover:shadow-sm transition-all"
                >
                  {item.icon}
                  <span>
                    <span className="block font-bold text-[#0F172A] text-sm">{item.title}</span>
                    <span className="block text-xs text-[#64748B] mt-0.5 leading-relaxed">{item.description}</span>
                  </span>
                </Link>
              ) : (
                <div
                  key={item.title}
                  className="flex flex-col gap-3 bg-white border border-[#FED7AA] rounded-2xl p-5 opacity-50 cursor-not-allowed"
                >
                  {item.icon}
                  <span>
                    <span className="block font-bold text-[#0F172A] text-sm">{item.title}</span>
                    <span className="block text-xs text-[#64748B] mt-0.5 leading-relaxed">{item.description}</span>
                  </span>
                  <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Phase 4</span>
                </div>
              )
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
