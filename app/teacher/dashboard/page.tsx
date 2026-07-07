"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type DashboardData = {
  profile: { role: string; participant_code: string };
  summary: {
    assignment_sets: number;
    exam_sets: number;
    assigned_classes: number;
    assigned_students: number;
  };
};

const navItems = [
  { title: "Assignment", subtitle: "Manage assignment sets and tasks", href: "/teacher/assignmentsets", enabled: true, icon: "assignment" },
  { title: "Labs", subtitle: "Manage lab sets and practice tasks", href: "/teacher/labs", enabled: true, icon: "labs" },
  { title: "Exams", subtitle: "Manage exam sets and tasks", href: "/teacher/exams", enabled: true, icon: "exams" },
  { title: "Classes", subtitle: "Manage owned classes", href: "/teacher/classes", enabled: true, icon: "classes" },
  { title: "Students", subtitle: "View active class students", href: "/teacher/students", enabled: true, icon: "students" },
  { title: "Submission", subtitle: "Review submitted work", href: "/teacher/submissions", enabled: true, icon: "submission" },
];

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load dashboard.");
        setLoading(false);
        return;
      }

      setData(json as DashboardData);
      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading teacher dashboard...</div>;
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  const summary = data?.summary ?? { assignment_sets: 0, exam_sets: 0, assigned_classes: 0, assigned_students: 0 };

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">CodeKidVai Teacher</p>
          <p className="text-xs text-[#64748B]">Assignment mode dashboard</p>
        </div>
        <button onClick={handleLogout} className="text-xs text-[#64748B] hover:text-red-600 transition-colors">
          Logout
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">Teacher Dashboard</h1>
          <p className="text-sm text-[#64748B] mt-1">Overview by teacher assignment sets, exam sets, active classes, and unique active students.</p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard title="Assignment Sets" value={summary.assignment_sets} description="Batch Assignment by teacher" />
          <SummaryCard title="Exam Sets" value={summary.exam_sets} description="Batch Exam by teacher" />
          <SummaryCard title="Assigned Classes" value={summary.assigned_classes} description="Active classes by teacher" />
          <SummaryCard title="Assigned Students" value={summary.assigned_students} description="Unique active students from classes" />
        </section>

        <section>
          <h2 className="text-base font-bold text-[#0F172A] mb-3">Management</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {navItems.map((item) => (
              item.enabled ? (
                <Link key={item.title} href={item.href} className="flex items-center justify-between gap-4 bg-white border border-[#FED7AA] rounded-2xl p-5 hover:border-[#F37021] hover:shadow-sm transition-all">
                  <span className="min-w-0">
                    <span className="block font-bold text-[#0F172A] text-sm">{item.title}</span>
                    <span className="block text-xs text-[#64748B] mt-1">{item.subtitle}</span>
                  </span>
                  <ManagementIcon name={item.icon} />
                </Link>
              ) : (
                <div key={item.title} className="flex items-center justify-between gap-4 bg-white border border-[#FED7AA] rounded-2xl p-5 opacity-60">
                  <span className="min-w-0">
                    <span className="block font-bold text-[#0F172A] text-sm">{item.title}</span>
                    <span className="block text-xs text-[#64748B] mt-1">{item.subtitle}</span>
                  </span>
                  <ManagementIcon name={item.icon} />
                </div>
              )
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({ title, value, description }: { title: string; value: number; description: string }) {
  return (
    <div className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">{title}</p>
      <p className="text-3xl font-bold text-[#F37021] mt-3">{value}</p>
      <p className="text-xs text-[#64748B] mt-2">{description}</p>
    </div>
  );
}

function ManagementIcon({ name }: { name: string }) {
  const iconClass = "h-5 w-5";
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#F37021]">
      {name === "assignment" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5h6" />
          <path d="M9 12h6" />
          <path d="M9 17h4" />
          <path d="M5 7.5 6.5 9 9 6" />
          <path d="M5 14.5 6.5 16 9 13" />
          <rect x="4" y="3" width="16" height="18" rx="2" />
        </svg>
      )}
      {name === "labs" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2" />
          <path d="M8 2h8" />
          <path d="M7 15h10" />
        </svg>
      )}
      {name === "exams" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M9 14h6" />
          <path d="M9 18h4" />
        </svg>
      )}
      {name === "classes" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
          <path d="M9 8h1" />
          <path d="M14 8h1" />
          <path d="M9 12h1" />
          <path d="M14 12h1" />
        </svg>
      )}
      {name === "students" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
          <circle cx="12" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )}
      {name === "submission" && (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
          <path d="M5 17v4" />
          <path d="M19 17v4" />
        </svg>
      )}
    </span>
  );
}

function safeJsonParse(text: string): { error?: string } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
