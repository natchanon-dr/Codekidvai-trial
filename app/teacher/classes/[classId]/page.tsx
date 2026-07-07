"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type TeacherClass = {
  class_id: string;
  class_code: string;
  class_name: string;
  class_level: string | null;
  class_section: string | null;
  academic_year: string | null;
  term: string | null;
  enrollment_code: string | null;
  is_open_for_enrollment: boolean;
  is_active: boolean;
  student_count: number;
  assignment_count: number;
  lab_count: number;
  exam_count: number;
};

type ClassStudent = {
  class_student_id: string;
  profile_id: string;
  status: string | null;
  joined_at: string | null;
  student: {
    participant_code: string | null;
    display_name: string | null;
    grade_level: string | null;
    student_status: string | null;
  } | null;
  progress: {
    lab_done: number;
    assignment_score: number;
    exam_score: number;
    submission_count: number;
    feedback: string;
  };
};

type DetailResponse = {
  error?: string;
  class?: TeacherClass;
  students?: ClassStudent[];
};

export default function TeacherClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const router = useRouter();
  const [classItem, setClassItem] = useState<TeacherClass | null>(null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [className, setClassName] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [classSection, setClassSection] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [isOpenForEnrollment, setIsOpenForEnrollment] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadClass() {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch(`/api/teacher/classes/${params.classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load class.");
        setLoading(false);
        return;
      }

      const loadedClass = json.class ?? null;
      setClassItem(loadedClass);
      setStudents(json.students ?? []);
      setClassName(loadedClass?.class_name ?? "");
      setClassLevel(loadedClass?.class_level ?? "");
      setClassSection(loadedClass?.class_section ?? "");
      setAcademicYear(loadedClass?.academic_year ?? "");
      setTerm(loadedClass?.term ?? "");
      setEnrollmentCode(loadedClass?.enrollment_code ?? loadedClass?.class_code ?? "");
      setIsOpenForEnrollment(Boolean(loadedClass?.is_open_for_enrollment ?? true));
      setIsActive(Boolean(loadedClass?.is_active));
      setLoading(false);
    }

    loadClass();
  }, [params.classId, router]);

  const totals = useMemo(() => students.reduce(
    (current, item) => ({
      assignmentScore: current.assignmentScore + item.progress.assignment_score,
      examScore: current.examScore + item.progress.exam_score,
      labDone: current.labDone + item.progress.lab_done,
      submissions: current.submissions + item.progress.submission_count,
    }),
    { assignmentScore: 0, examScore: 0, labDone: 0, submissions: 0 },
  ), [students]);

  async function saveClass() {
    if (!className.trim() || saving) return;
    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/classes/${params.classId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        class_name: className,
        class_level: classLevel,
        class_section: classSection,
        academic_year: academicYear,
        term,
        enrollment_code: enrollmentCode,
        is_open_for_enrollment: isOpenForEnrollment,
        is_active: isActive,
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to save class.");
      setSaving(false);
      return;
    }

    if (json.class) setClassItem((current) => current ? { ...current, ...json.class } : json.class ?? null);
    setSaveMessage("Class saved.");
    setSaving(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading class...</div>;
  }

  if (errorMessage && !classItem) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/classes" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Classes
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Class Detail</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[#0F172A]">{classItem?.class_name ?? "Class"}</h1>
              <span className="rounded-full border border-[#FED7AA] bg-white px-2 py-0.5 text-xs font-semibold text-[#F37021]">
                {classItem?.class_code}
              </span>
            </div>
            <p className="text-sm text-[#64748B] mt-1">Manage students and learning content attached to this class.</p>
          </div>
          <button
            type="button"
            onClick={saveClass}
            disabled={!className.trim() || saving}
            className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
          >
            {saving ? "Saving..." : "Save Class"}
          </button>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric label="Students" value={students.filter((item) => item.status === "active").length} />
          <Metric label="Assignments" value={classItem?.assignment_count ?? 0} />
          <Metric label="Labs Done" value={totals.labDone} />
          <Metric label="Exam Score" value={totals.examScore} />
          <Metric label="Submissions" value={totals.submissions} />
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Class Code">
              <input
                value={classItem?.class_code ?? ""}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021]"
              />
            </Field>
            <Field label="Class Name">
              <input
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Enrollment Code">
              <input
                value={enrollmentCode}
                onChange={(event) => setEnrollmentCode(event.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm font-mono font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Level">
              <input
                value={classLevel}
                onChange={(event) => setClassLevel(event.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Section">
              <input
                value={classSection}
                onChange={(event) => setClassSection(event.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Academic Year">
              <input
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
            <Field label="Term">
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 text-sm font-semibold text-[#0F172A]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 accent-[#F37021]"
            />
            Active class
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold text-[#0F172A]">
            <input
              type="checkbox"
              checked={isOpenForEnrollment}
              onChange={(event) => setIsOpenForEnrollment(event.target.checked)}
              className="h-4 w-4 accent-[#F37021]"
            />
            Open for student self-enrollment
          </label>
          {saveMessage && <p className="text-sm font-semibold text-green-700">{saveMessage}</p>}
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AttachPanel title="Assignments" count={classItem?.assignment_count ?? 0} href="/teacher/assignmentsets" />
          <AttachPanel title="Labs" count={classItem?.lab_count ?? 0} href="#" />
          <AttachPanel title="Exams" count={classItem?.exam_count ?? 0} href="#" />
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Students</h2>
              <p className="text-sm text-[#64748B] mt-1">Active students under this class with learning status and feedback.</p>
            </div>
            <Link href="/teacher/students" className="text-sm font-semibold text-[#F37021] hover:text-[#C2410C]">
              View All Students
            </Link>
          </div>

          {students.length === 0 ? (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-6 text-center text-sm text-[#64748B]">
              No students registered in this class yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#FED7AA] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 pr-4">Student</th>
                    <th className="py-3 pr-4">Labs</th>
                    <th className="py-3 pr-4">Assignment Score</th>
                    <th className="py-3 pr-4">Exam Score</th>
                    <th className="py-3 pr-4">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((item) => (
                    <tr key={item.class_student_id} className="border-b border-[#FED7AA]/70 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-[#0F172A]">{item.student?.display_name ?? item.student?.participant_code ?? "Unknown student"}</p>
                        <p className="text-xs text-[#64748B]">{item.student?.participant_code ?? "-"}</p>
                      </td>
                      <td className="py-3 pr-4 font-semibold text-[#0F172A]">{item.progress.lab_done}</td>
                      <td className="py-3 pr-4 font-semibold text-[#0F172A]">{item.progress.assignment_score}</td>
                      <td className="py-3 pr-4 font-semibold text-[#0F172A]">{item.progress.exam_score}</td>
                      <td className="py-3 pr-4 text-[#64748B]">{item.progress.feedback}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#FED7AA] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase text-[#64748B]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#F37021]">{value}</p>
    </div>
  );
}

function AttachPanel({ title, count, href }: { title: string; count: number; href: string }) {
  const disabled = href === "#";
  const content = (
    <div className="rounded-2xl border border-[#FED7AA] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#0F172A]">{title}</p>
          <p className="mt-1 text-xs text-[#64748B]">Attached to this class</p>
        </div>
        <span className="text-2xl font-bold text-[#F37021]">{count}</span>
      </div>
      <p className="mt-4 text-xs font-semibold text-[#F37021]">{disabled ? "Coming Soon" : "Manage"}</p>
    </div>
  );

  return disabled ? content : <Link href={href}>{content}</Link>;
}

function safeJsonParse(text: string): DetailResponse {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
