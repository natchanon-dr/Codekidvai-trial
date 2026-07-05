"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type AssignmentDetail = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  task_description: string | null;
  task_type: string | null;
  difficulty_level: string | null;
  learning_objective: string | null;
  problem_statement: string | null;
  expected_answer: string | null;
  expected_concept: string | null;
  max_score: number | null;
  estimated_time_seconds: number | null;
  task_status: string | null;
  is_active: boolean | null;
  created_at: string | null;
  owner: { display_name: string | null; participant_code: string | null } | null;
  assigned_students_count: number;
  submissions_count: number;
  pending_count: number;
};

type Submission = {
  submission_id: string;
  final_answer_text: string | null;
  final_score: number | null;
  is_passed: boolean | null;
  submitted_at: string | null;
  student: { display_name: string | null; participant_code: string | null } | null;
  batch: { batch_code: string | null; batch_name: string | null } | null;
};

type AssignedStudent = {
  assignment_id: string;
  status: string | null;
  assigned_order: number | null;
  student: { display_name: string | null; participant_code: string | null } | null;
  batch: { batch_code: string | null; batch_name: string | null } | null;
};

type DetailPayload = {
  assignment: AssignmentDetail;
  assigned_students: AssignedStudent[];
  submissions: Submission[];
};

export default function TeacherAssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadDetail() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch(`/api/teacher/assignments/${params.assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load assignment.");
        setLoading(false);
        return;
      }

      setData(json);
      setLoading(false);
    }

    loadDetail();
  }, [params.assignmentId, router]);

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading assignment...</div>;
  }

  if (errorMessage || !data) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <p className="text-sm text-red-600">{errorMessage ?? "Assignment not found."}</p>
          <Link href="/teacher/assignments" className="inline-flex mt-4 px-4 py-2 bg-[#F37021] text-white rounded-xl text-sm font-semibold">
            Back to assignments
          </Link>
        </div>
      </div>
    );
  }

  const assignment = data.assignment;

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/assignments" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Assignments
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Assignment detail</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <section className="space-y-4">
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {assignment.task_code && <span className="font-mono text-xs font-bold text-[#F37021]">{assignment.task_code}</span>}
              <Badge>{assignment.task_type ?? "task"}</Badge>
              <Badge>{assignment.difficulty_level ?? "difficulty"}</Badge>
              <Badge>{assignment.task_status ?? "draft"}</Badge>
              <Badge>{assignment.is_active ? "active" : "inactive"}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A]">{assignment.task_title ?? "Untitled assignment"}</h1>
            <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{assignment.task_description ?? "No description provided."}</p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric label="Assignment Owner" value={assignment.owner?.display_name ?? assignment.owner?.participant_code ?? "Unknown"} />
              <Metric label="Max Score" value={assignment.max_score ?? 0} />
              <Metric label="Estimated Minutes" value={assignment.estimated_time_seconds ? Math.round(assignment.estimated_time_seconds / 60) : 0} />
            </div>
          </div>

          <InfoBlock title="Problem">{assignment.problem_statement ?? assignment.learning_objective ?? "No problem statement available."}</InfoBlock>
          {assignment.expected_answer && <InfoBlock title="Expected Answer">{assignment.expected_answer}</InfoBlock>}
          {assignment.expected_concept && <InfoBlock title="Expected Concept">{assignment.expected_concept}</InfoBlock>}
        </section>
      </main>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
      <h2 className="text-base font-bold text-[#0F172A] mb-2">{title}</h2>
      <p className="text-sm text-[#0F172A] leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3">
      <p className="text-xs text-[#64748B]">{label}</p>
      <p className="text-sm font-bold text-[#0F172A] mt-1">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA] capitalize">
      {children}
    </span>
  );
}

function safeJsonParse(text: string): ({ error?: string } & Partial<DetailPayload>) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
