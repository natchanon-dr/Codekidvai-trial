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
  { title: "Assignment Management", subtitle: "Manage assignment sets and tasks", href: "/teacher/assignmentsets", enabled: true },
  { title: "Labs", subtitle: "Coming Soon", href: "#", enabled: false },
  { title: "Exams", subtitle: "Coming Soon", href: "#", enabled: false },
  { title: "Submissions", subtitle: "Review student submissions", href: "/teacher/assignmentsets", enabled: true },
  { title: "Students", subtitle: "View assigned students", href: "/teacher/assignmentsets", enabled: true },
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

      setData(json);
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
                <Link key={item.title} href={item.href} className="bg-white border border-[#FED7AA] rounded-2xl p-5 hover:border-[#F37021] hover:shadow-sm transition-all">
                  <p className="font-bold text-[#0F172A] text-sm">{item.title}</p>
                  <p className="text-xs text-[#64748B] mt-1">{item.subtitle}</p>
                </Link>
              ) : (
                <div key={item.title} className="bg-white border border-[#FED7AA] rounded-2xl p-5 opacity-60">
                  <p className="font-bold text-[#0F172A] text-sm">{item.title}</p>
                  <p className="text-xs text-[#64748B] mt-1">{item.subtitle}</p>
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

function safeJsonParse(text: string): { error?: string } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
