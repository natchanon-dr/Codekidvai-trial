"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type CreateClassResponse = {
  error?: string;
  class?: { class_id?: string };
};

export default function NewTeacherClassPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState("");
  const [className, setClassName] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [classSection, setClassSection] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suggestedCode = useMemo(() => {
    const year = new Date().getFullYear().toString().slice(-2);
    return `CLS${year}-000001`;
  }, []);

  async function createClass() {
    const name = className.trim();
    const code = classCode.trim();
    if (!name || saving) return;

    setSaving(true);
    setErrorMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch("/api/teacher/classes", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        class_code: code || undefined,
        class_name: name,
        class_level: classLevel,
        class_section: classSection,
        academic_year: academicYear,
        term,
        is_active: true,
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to create class.");
      setSaving(false);
      return;
    }

    const classId = json.class?.class_id;
    router.push(classId ? `/teacher/classes/${classId}` : "/teacher/classes");
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/classes" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Classes
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">New Class</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">New Class</h1>
          <p className="text-sm text-[#64748B] mt-1">Create a teacher-owned class in the default institution.</p>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Class Code">
              <input
                value={classCode}
                onChange={(event) => setClassCode(event.target.value)}
                placeholder={suggestedCode}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm font-mono font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Class Name">
              <input
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="SQL Basic Room 1"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Academic Year">
              <input
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value)}
                placeholder="2026"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Term">
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="1"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Level">
              <input
                value={classLevel}
                onChange={(event) => setClassLevel(event.target.value)}
                placeholder="Junior"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Section">
              <input
                value={classSection}
                onChange={(event) => setClassSection(event.target.value)}
                placeholder="1"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
          </div>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          <div className="flex justify-end gap-2">
            <Link href="/teacher/classes" className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]">
              Cancel
            </Link>
            <button
              type="button"
              onClick={createClass}
              disabled={!className.trim() || saving}
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
            >
              {saving ? "Creating..." : "Create Class"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      {children}
    </label>
  );
}

function safeJsonParse(text: string): CreateClassResponse {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
