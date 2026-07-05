"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type AssignmentItem = {
  task_code: string | null;
};

export default function NewAssignmentPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAssignments() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/assignments?scope=all", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setErrorMessage(json.error ?? text ?? "Failed to load assignment code.");
        return;
      }

      setAssignments(json.assignments ?? []);
    }

    loadAssignments();
  }, [router]);

  const nextAssignmentCode = useMemo(() => {
    const numbers = assignments
      .map((assignment) => assignment.task_code?.match(/^QT(\d+)$/)?.[1])
      .filter(Boolean)
      .map((value) => Number(value));
    const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const maxWidth = Math.max(4, ...assignments.map((assignment) => assignment.task_code?.match(/^QT(\d+)$/)?.[1]?.length ?? 0));
    return `QT${String(nextNumber).padStart(maxWidth, "0")}`;
  }, [assignments]);

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/teacher/assignmentsets" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Assignment Management
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">New Assignment</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">New Assignment</h1>
            <p className="text-sm text-[#64748B] mt-1">Create a new assignment manually or prepare an Excel upload.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => setUploadFileName(event.target.files?.[0]?.name ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED] text-sm font-semibold"
            >
              Upload
            </button>
            <Link
              href="/api/teacher/assignments/template"
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold"
            >
              Template
            </Link>
            {uploadFileName && <span className="basis-full sm:basis-auto text-xs text-[#64748B]">{uploadFileName}</span>}
          </div>
        </section>

        <section>
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-[#0F172A]">Manual Create</h2>
            <div className="mt-4 space-y-3">
              <input
                value={nextAssignmentCode}
                readOnly
                aria-label="Assignment code"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021] cursor-not-allowed"
              />
              <input placeholder="Assignment name" className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm" />
              <textarea placeholder="Problem statement" rows={5} className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm" />
              <textarea placeholder="Expected answer" rows={4} className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm" />
            </div>
            <button className="mt-4 px-4 py-2 rounded-xl bg-[#F37021]/60 text-white text-sm font-semibold cursor-not-allowed" disabled>
              Save Assignment
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function safeJsonParse(text: string): { error?: string; assignments?: AssignmentItem[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
