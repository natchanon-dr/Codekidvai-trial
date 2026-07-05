"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type AssignmentItem = {
  assignment_id: string;
  task_id: string;
  task_code: string | null;
  title: string | null;
  description: string | null;
  task_type: string | null;
  difficulty_level: string | null;
  status: string | null;
  is_active: boolean | null;
  created_at: string | null;
  assigned_students_count: number;
  submissions_count: number;
  batches: Array<{ batch_code?: string | null; batch_name?: string | null }>;
  owner: { display_name: string | null; participant_code: string | null } | null;
};

type StatusFilter = "active" | "inactive" | "all";

export default function TeacherAssignmentsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAssignments() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/assignments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load assignments.");
        setLoading(false);
        return;
      }

      setAssignments(json.assignments ?? []);
      setLoading(false);
    }

    loadAssignments();
  }, [router]);

  const filteredAssignments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assignments.filter((assignment) => {
      const active = assignment.is_active && assignment.status !== "archived";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);
      const haystack = `${assignment.task_code ?? ""} ${assignment.title ?? ""}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [assignments, query, statusFilter]);

  async function toggleAssignmentStatus(assignmentId: string, nextActive: boolean) {
    setUpdatingId(assignmentId);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/teacher/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextActive ? "active" : "inactive" }),
    });
    if (response.ok) {
      setAssignments((current) => current.map((assignment) => assignment.assignment_id === assignmentId
        ? { ...assignment, status: nextActive ? "published" : "archived", is_active: nextActive }
        : assignment));
    } else {
      const text = await response.text();
      alert(safeJsonParse(text).error ?? "Failed to update assignment.");
    }
    setUpdatingId(null);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading assignments...</div>;
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/teacher/dashboard" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Teacher Dashboard
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Assignment List</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Assignments</h1>
            <p className="text-sm text-[#64748B] mt-1">Assignment records created by this teacher.</p>
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by assignment code or name"
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <StatusFilterButtons value={statusFilter} onChange={setStatusFilter} />
        </section>

        {filteredAssignments.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No assignments match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredAssignments.map((assignment) => (
              <article key={assignment.assignment_id} className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {assignment.task_code && <span className="font-mono text-xs font-bold text-[#F37021]">{assignment.task_code}</span>}
                      {assignment.difficulty_level && <Badge>{assignment.difficulty_level}</Badge>}
                      <Badge>{assignment.status ?? "draft"}</Badge>
                      <Badge>{assignment.is_active ? "active" : "inactive"}</Badge>
                    </div>
                    <h2 className="text-base font-bold text-[#0F172A]">{assignment.title ?? "Untitled assignment"}</h2>
                    <p className="text-sm text-[#64748B] mt-1 line-clamp-2">{assignment.description ?? "No description provided."}</p>
                    <div className="flex flex-wrap gap-4 mt-4 text-xs text-[#64748B]">
                      <span>{assignment.batches.length} batches</span>
                      <span>Owner: {assignment.owner?.display_name ?? assignment.owner?.participant_code ?? "Unknown"}</span>
                      {assignment.created_at && <span>Created {new Date(assignment.created_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/teacher/assignments/${assignment.assignment_id}`}
                      aria-label="Edit assignment"
                      title="Edit"
                      className="inline-flex h-8 w-8 items-center justify-center bg-[#F37021] hover:bg-[#C2410C] text-white rounded-full transition-colors"
                    >
                      <PencilIcon />
                    </Link>
                    <AssignmentActiveSwitch
                      active={Boolean(assignment.is_active && assignment.status !== "archived")}
                      disabled={updatingId === assignment.assignment_id}
                      onToggle={(nextActive) => toggleAssignmentStatus(assignment.assignment_id, nextActive)}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
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

function StatusFilterButtons({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  return (
    <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
      {(["active", "inactive", "all"] as StatusFilter[]).map((status) => (
        <button
          key={status}
          onClick={() => onChange(status)}
          className={`px-4 py-2 text-sm font-semibold capitalize ${value === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
        >
          {status}
        </button>
      ))}
    </div>
  );
}

function AssignmentActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  onToggle: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label="Toggle assignment active status"
      disabled={disabled}
      onClick={() => onToggle(!active)}
      title={active ? "Active" : "Inactive"}
      className={`relative h-8 w-14 rounded-full transition-colors disabled:opacity-40 ${active ? "bg-green-500" : "bg-gray-300"}`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${active ? "left-1 translate-x-6" : "left-1"}`}
      />
    </button>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function safeJsonParse(text: string): { error?: string; assignments?: AssignmentItem[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
