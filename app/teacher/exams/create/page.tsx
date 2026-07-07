"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type ExamItem = {
  task_code: string | null;
};

const examTypes = [
  { value: "sql_text", label: "SQL Text", prefix: "XQT", icon: "text" },
  { value: "sql_block", label: "SQL Block", prefix: "XQB", icon: "block" },
  { value: "er_diagram", label: "ER Diagram", prefix: "XER", icon: "diagram" },
  { value: "stored_procedure", label: "Stored Procedure", prefix: "XSP", icon: "procedure" },
];

export default function NewExamPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [examType, setExamType] = useState("sql_text");
  const [examName, setExamName] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadExams() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/assignments?scope=all&family=exam", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setErrorMessage(json.error ?? text ?? "Failed to load exam code.");
        return;
      }

      setExams(json.assignments ?? []);
    }

    loadExams();
  }, [router]);

  const nextExamCode = useMemo(() => {
    const prefix = examTypes.find((type) => type.value === examType)?.prefix ?? "XQT";
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const numbers = exams
      .map((exam) => exam.task_code?.match(pattern)?.[1])
      .filter(Boolean)
      .map((value) => Number(value));
    const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const maxWidth = Math.max(6, ...exams.map((exam) => exam.task_code?.match(pattern)?.[1]?.length ?? 0));
    return `${prefix}${String(nextNumber).padStart(maxWidth, "0")}`;
  }, [exams, examType]);

  async function saveExam() {
    if (!examName.trim() || saving) return;
    setSaving(true);
    setErrorMessage(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch("/api/teacher/assignments", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        family: "exam",
        task_code: nextExamCode,
        task_title: examName,
        task_type: examType,
        problem_statement: problemStatement,
        expected_answer: expectedAnswer,
        max_score: 10,
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to save exam.");
      setSaving(false);
      return;
    }

    router.push("/teacher/exams/list");
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/teacher/exams" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Exam Management
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">New Exam</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">New Exam</h1>
            <p className="text-sm text-[#64748B] mt-1">Create a new exam item manually or prepare an Excel upload.</p>
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
            <Link href="/api/teacher/assignments/template" className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold">
              Template
            </Link>
            {uploadFileName && <span className="basis-full sm:basis-auto text-xs text-[#64748B]">{uploadFileName}</span>}
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-[#0F172A]">Manual Create</h2>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {examTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setExamType(type.value)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                    examType === type.value
                      ? "border-[#F37021] bg-[#F37021] text-white"
                      : "border-[#FED7AA] bg-[#FFF7ED] text-[#0F172A] hover:border-[#F37021]"
                  }`}
                >
                  <span>{type.label}</span>
                  <TypeIcon name={type.icon} />
                </button>
              ))}
            </div>
            <input
              value={nextExamCode}
              readOnly
              aria-label="Exam code"
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021] cursor-not-allowed"
            />
            <input
              value={examName}
              onChange={(event) => setExamName(event.target.value)}
              placeholder="Exam name"
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
            <textarea
              value={problemStatement}
              onChange={(event) => setProblemStatement(event.target.value)}
              placeholder="Problem statement"
              rows={5}
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
            <textarea
              value={expectedAnswer}
              onChange={(event) => setExpectedAnswer(event.target.value)}
              placeholder="Expected answer"
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
          </div>
          <button
            type="button"
            onClick={saveExam}
            disabled={!examName.trim() || saving}
            className="mt-4 px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
          >
            {saving ? "Saving..." : "Save Exam"}
          </button>
        </section>
      </main>
    </div>
  );
}

function TypeIcon({ name }: { name: string }) {
  const iconClass = "h-5 w-5 shrink-0";
  if (name === "block") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 3h3v3a2 2 0 1 0 4 0V3h3A2.5 2.5 0 0 1 21 5.5v3h-3a2 2 0 1 0 0 4h3v3A2.5 2.5 0 0 1 18.5 18h-3v-3a2 2 0 1 0-4 0v3h-3A2.5 2.5 0 0 1 6 15.5v-3H3a2 2 0 1 1 0-4h3v-3A2.5 2.5 0 0 1 8.5 3Z" />
      </svg>
    );
  }
  if (name === "diagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
        <path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" />
        <path d="M6.5 9v5a3 3 0 0 0 3 3H14" />
      </svg>
    );
  }
  if (name === "procedure") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
      <path d="M7 20h10" />
    </svg>
  );
}

function safeJsonParse(text: string): { error?: string; assignments?: ExamItem[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
