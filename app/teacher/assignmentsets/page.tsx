"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type StatusFilter = "active" | "inactive" | "all";

type AssignmentSet = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  batch_description: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  task_count: number;
  assigned_classes_count: number;
  owner: { display_name: string | null; participant_code: string | null } | null;
};

export default function TeacherAssignmentSetsPage() {
  const router = useRouter();
  const [sets, setSets] = useState<AssignmentSet[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadSets() {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/assignmentsets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load assignment sets.");
        setLoading(false);
        return;
      }

      setSets(json.assignment_sets ?? []);
      setLoading(false);
    }

    loadSets();
  }, [router]);

  const filteredSets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sets.filter((set) => {
      const active = set.status === "active";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);
      const haystack = `${set.batch_code ?? ""} ${set.batch_name ?? ""}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [sets, query, statusFilter]);

  async function toggleSetStatus(setId: string, nextActive: boolean) {
    setUpdatingId(setId);
    const token = await getToken();
    if (!token) return;

    const response = await fetch(`/api/teacher/assignmentsets/${setId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextActive ? "active" : "inactive" }),
    });
    if (response.ok) {
      setSets((current) => current.map((set) => set.batch_id === setId
        ? { ...set, status: nextActive ? "active" : "archived", updated_at: new Date().toISOString() }
        : set));
    } else {
      const text = await response.text();
      alert(safeJsonParse(text).error ?? "Failed to update assignment set.");
    }
    setUpdatingId(null);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading assignment sets...</div>;
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
          <span className="text-xs font-semibold text-[#F37021]">Assignment Sets by teacher</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Assignment Sets</h1>
            <p className="text-sm text-[#64748B] mt-1">Batch Assignment records created by this teacher.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/assignmentsets/new" className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold">
              New Assignment Set
            </Link>
            <Link href="/teacher/assignments/new" className="px-4 py-2 rounded-xl border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED] text-sm font-semibold">
              New Assignment
            </Link>
            <Link href="/teacher/assignments" className="px-4 py-2 rounded-xl border border-[#FED7AA] text-[#0F172A] bg-white hover:border-[#F37021] text-sm font-semibold">
              Assignment List
            </Link>
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by set code or name"
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            {(["active", "inactive", "all"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 text-sm font-semibold capitalize ${statusFilter === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        {filteredSets.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No assignment sets match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSets.map((set) => (
              <article key={set.batch_id} className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {set.batch_code && <span className="font-mono text-xs font-bold text-[#F37021]">{set.batch_code}</span>}
                      <Badge>{set.status ?? "draft"}</Badge>
                    </div>
                    <h2 className="text-base font-bold text-[#0F172A]">{set.batch_name ?? "Untitled assignment set"}</h2>
                    <p className="text-sm text-[#64748B] mt-1">{set.batch_description ?? "No description provided."}</p>
                    <div className="flex flex-wrap gap-4 mt-4 text-xs text-[#64748B]">
                      <span>{set.task_count} assignments</span>
                      <span>{set.assigned_classes_count} classes</span>
                      {set.created_at && <span>Created {new Date(set.created_at).toLocaleDateString()}</span>}
                      {set.updated_at && <span>Updated {new Date(set.updated_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-start lg:items-end gap-3">
                    <p className="text-xs text-[#64748B] text-left lg:text-right">
                      Owner: <span className="font-semibold text-[#0F172A]">{set.owner?.display_name ?? set.owner?.participant_code ?? "Unknown"}</span>
                    </p>
                    <div className="flex items-center gap-3">
                    <Link
                      href={`/teacher/assignmentsets/${set.batch_id}`}
                      aria-label="Edit assignment set"
                      title="Edit"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] hover:bg-[#C2410C] text-white"
                    >
                      <PencilIcon />
                    </Link>
                    <SetActiveSwitch
                      active={set.status === "active"}
                      disabled={updatingId === set.batch_id}
                      onToggle={(nextActive) => toggleSetStatus(set.batch_id, nextActive)}
                    />
                    </div>
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

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA] capitalize">
      {children}
    </span>
  );
}

function SetActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  onToggle: (active: boolean) => void;
}) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-pressed={active}
        aria-label="Toggle assignment set active status"
        disabled={disabled}
        onClick={() => onToggle(!active)}
        title={active ? "Active" : "Inactive"}
        className={`relative h-8 w-14 rounded-full transition-colors disabled:opacity-40 ${active ? "bg-green-500" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${active ? "left-1 translate-x-6" : "left-1"}`}
        />
      </button>
    </div>
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

function safeJsonParse(text: string): { error?: string; assignment_sets?: AssignmentSet[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
