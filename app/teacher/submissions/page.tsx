"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type ReviewStatus = "unsubmitted" | "submitted" | "review" | "completed";
type SetFamily = "assignment" | "exam";

type ReviewSet = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
  student_count: number;
  task_count: number;
  submitted_students_count: number;
  completed_students_count: number;
  review_students_count: number;
  status_counts: Record<ReviewStatus, number>;
  students: ReviewStudent[];
};

type ReviewStudent = {
  profile_id: string;
  status: ReviewStatus;
};

type ClassGroup = {
  class_id: string;
  class_code: string;
  class_name: string;
  student_count: number;
  assignment_sets: ReviewSet[];
  exam_sets: ReviewSet[];
};

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadSubmissions() {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/submissions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load submissions.");
        setLoading(false);
        return;
      }

      setClasses(json.classes ?? []);
      setLoading(false);
    }

    loadSubmissions();
  }, [router]);

  function toggleClass(classId: string) {
    setExpandedClassIds((current) => toggleSetValue(current, classId));
  }

  function toggleSection(sectionId: string) {
    setExpandedSections((current) => toggleSetValue(current, sectionId));
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading submissions...</div>;
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/dashboard" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Teacher Dashboard
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Submission Management</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">Submissions</h1>
          <p className="text-sm text-[#64748B] mt-1">Review submitted assignment sets and exam sets by class.</p>
        </section>

        {classes.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No active classes found.
          </div>
        ) : (
          <div className="space-y-4">
            {classes.map((classItem) => (
              <section key={classItem.class_id} className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
                <button
                  type="button"
                  aria-expanded={expandedClassIds.has(classItem.class_id)}
                  onClick={() => toggleClass(classItem.class_id)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#F37021]">
                      <ChevronIcon open={expandedClassIds.has(classItem.class_id)} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-[#0F172A]">{classItem.class_name}</span>
                        <span className="font-mono text-xs font-bold text-[#F37021]">{classItem.class_code}</span>
                      </span>
                      <span className="mt-1 block text-sm text-[#64748B]">
                        {classItem.student_count} students | {classItem.assignment_sets.length} assignment sets | {classItem.exam_sets.length} exam sets
                      </span>
                    </span>
                  </span>
                </button>

                {expandedClassIds.has(classItem.class_id) && (
                  <div className="mt-4 border-t border-[#FED7AA] pt-4 space-y-3">
                    <SubmissionSection
                      title="Assignment List"
                      family="assignment"
                      classItem={classItem}
                      sets={classItem.assignment_sets}
                      open={expandedSections.has(`${classItem.class_id}:assignment`)}
                      onToggle={() => toggleSection(`${classItem.class_id}:assignment`)}
                    />
                    <SubmissionSection
                      title="Exam List"
                      family="exam"
                      classItem={classItem}
                      sets={classItem.exam_sets}
                      open={expandedSections.has(`${classItem.class_id}:exam`)}
                      onToggle={() => toggleSection(`${classItem.class_id}:exam`)}
                    />
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SubmissionSection({
  title,
  family,
  classItem,
  sets,
  open,
  onToggle,
}: {
  title: string;
  family: SetFamily;
  classItem: ClassGroup;
  sets: ReviewSet[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED]">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021]">
            <ChevronIcon open={open} />
          </span>
          <span>
            <span className="block text-sm font-bold text-[#0F172A]">{title}</span>
            <span className="block text-xs text-[#64748B]">{sets.length} linked sets</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-[#FED7AA] p-3 space-y-2">
          {sets.length === 0 ? (
            <div className="rounded-xl bg-white px-4 py-3 text-sm text-[#64748B]">No sets linked to this class.</div>
          ) : (
            sets.map((setItem) => (
              <div key={setItem.batch_id} className="flex flex-col gap-3 rounded-xl bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0F172A]">
                    <span className="font-mono text-xs font-bold text-[#F37021]">{setItem.batch_code ?? "-"}</span>
                    <span className="mx-2 text-[#CBD5E1]">|</span>
                    {setItem.batch_name ?? "Untitled set"}
                  </p>
                  <p className="mt-1 text-xs text-[#64748B]">
                    {setItem.submitted_students_count}/{setItem.student_count} submitted | {setItem.review_students_count} review | {setItem.completed_students_count} completed
                  </p>
                </div>
                <Link
                  href={`/teacher/submissions/review?classId=${encodeURIComponent(classItem.class_id)}&family=${family}&batchId=${encodeURIComponent(setItem.batch_id)}`}
                  aria-label="Review"
                  title="Review"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]"
                >
                  <ReviewIcon />
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function ReviewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 15 11 17 16 12" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function toggleSetValue<T>(current: Set<T>, value: T) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function safeJsonParse(text: string): { error?: string; classes?: ClassGroup[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
