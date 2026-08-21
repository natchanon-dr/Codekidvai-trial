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

type NavItem = {
  stepNumber: number;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  available: boolean;
  disabledLabel?: string;
};

const NAV_ITEMS: NavItem[] = [
  // 1
  {
    stepNumber: 1,
    title: "Dataset Mock",
    description: "Create simulated classes, run the baseline AI pipeline, review mock charts and reports, and reset simulated transactions.",
    href: "/researcher/mock-lab",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5" />
      </svg>
    ),
    available: true,
  },
  // 2
  {
    stepNumber: 2,
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
  // 3
  {
    stepNumber: 3,
    title: "Dataset Analytics",
    description: "Explore learner population statistics, feature distributions, and cohort-level descriptive analytics.",
    href: "/researcher/dataset-analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.5c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    available: true,
  },
  // 4
  {
    stepNumber: 4,
    title: "Behavioral Analysis",
    description: "Examine learner behavioral patterns, BSSA feature profiles, and sequence-level engagement indicators.",
    href: "/researcher/behavioral-analysis",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    available: true,
  },
  // 5
  {
    stepNumber: 5,
    title: "Sequential Analysis",
    description: "Sequence-aware learner behavior and temporal learning patterns across coding attempts.",
    href: "/researcher/sequential-analysis",
    available: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  // 6
  {
    stepNumber: 6,
    title: "Semantic Analysis",
    description: "Semantic interpretation of learner solutions, responses, and generated artifacts.",
    href: "/researcher/semantic-analysis",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
      </svg>
    ),
    available: true,
  },
  // 7
  {
    stepNumber: 7,
    title: "Assessment Analysis",
    description: "Assessment evidence, rubric dimensions, and 2C3L-related analysis across learner submissions.",
    href: "/researcher/assessment-analysis",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    available: true,
  },
  // 8
  {
    stepNumber: 8,
    title: "Feature Analytics",
    description: "Phase 4 dataset statistics: learner counts, split summary, sequence stats, and validation checks.",
    href: "/researcher/analytics-summary",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    available: true,
  },
  // 9
  {
    stepNumber: 9,
    title: "Model Results",
    description: "View Phase 4 pilot model comparison: Dummy, LR, RF, TAG-LR, LSTM, GRU — pipeline validation only.",
    href: "/researcher/model-results",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
      </svg>
    ),
    available: true,
  },
  // 10
  {
    stepNumber: 10,
    title: "Learning Outcomes",
    description: "Track at-risk prediction outcomes, assessment rubric scores, and learning progression across pilot cohorts.",
    href: "/researcher/learning-outcomes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    available: true,
  },
  // 11
  {
    stepNumber: 11,
    title: "Hypothesis Summary",
    description: "Review research hypotheses, evaluation criteria, and pilot-phase findings against the thesis research contract.",
    href: "/researcher/hypothesis-summary",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
    available: true,
  },
  // 12
  {
    stepNumber: 12,
    title: "Research Summary",
    description: "Package validated research outputs — dataset profile, feature summaries, model comparison, and reproducibility metadata — into tables, figures, and captions suitable for research reporting.",
    href: "/researcher/report-summary",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6 text-[#F37021]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    available: true,
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
          <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-9 gap-1.5">
            {NAV_ITEMS.map((item) =>
              item.available ? (
                <Link
                  key={item.title}
                  href={item.href}
                  className="aspect-square flex flex-col items-center justify-center gap-1 bg-white border border-[#FED7AA] rounded-xl p-1.5 hover:border-[#F37021] hover:shadow-sm transition-all"
                >
                  <span className="inline-flex h-[53px] w-[53px] shrink-0 items-center justify-center rounded-full border border-[#FED7AA] bg-[#FFF7ED] [&>svg]:w-6 [&>svg]:h-6">
                    {item.icon}
                  </span>
                  <span className="font-semibold text-[#0F172A] text-[11px] text-center leading-tight">{item.title}</span>
                </Link>
              ) : (
                <div
                  key={item.title}
                  className="aspect-square flex flex-col items-center justify-center gap-1 bg-white border border-[#FED7AA] rounded-xl p-1.5 opacity-50 cursor-not-allowed"
                >
                  <span className="inline-flex h-[53px] w-[53px] shrink-0 items-center justify-center rounded-full border border-[#FED7AA] bg-[#FFF7ED] [&>svg]:w-6 [&>svg]:h-6">
                    {item.icon}
                  </span>
                  <span className="font-semibold text-[#0F172A] text-[11px] text-center leading-tight">{item.title}</span>
                  <span className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide">{item.disabledLabel ?? "Phase 4"}</span>
                </div>
              )
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
