"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type AssignmentItem = {
  assignment_id: string;
  task_code: string | null;
  title: string | null;
  description: string | null;
  max_score: number | null;
  status: string | null;
  is_active: boolean | null;
  owner: { display_name: string | null; participant_code: string | null } | null;
};

type AssignmentSetItem = {
  batch_code: string | null;
};

export default function NewAssignmentSetPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [assignmentSets, setAssignmentSets] = useState<AssignmentSetItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scoreByAssignment, setScoreByAssignment] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
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

      const [response, setsResponse] = await Promise.all([
        fetch("/api/teacher/assignments?scope=all", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/teacher/assignmentsets?scope=all", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setErrorMessage(json.error ?? text ?? "Failed to load assignments.");
        return;
      }
      const loadedAssignments = (json.assignments ?? []).filter(isActiveAssignment);
      setAssignments(loadedAssignments);
      setScoreByAssignment(Object.fromEntries(loadedAssignments.map((assignment) => [
        assignment.assignment_id,
        Number(assignment.max_score ?? 10),
      ])));

      const setsText = await setsResponse.text();
      const setsJson = setsText ? safeJsonParse(setsText) : {};
      if (setsResponse.ok) {
        setAssignmentSets(setsJson.assignment_sets ?? []);
      }
    }

    loadAssignments();
  }, [router]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of assignments) {
      const key = assignment.owner?.participant_code ?? assignment.owner?.display_name ?? "Unknown";
      const label = assignment.owner?.display_name ?? assignment.owner?.participant_code ?? "Unknown";
      map.set(key, label);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assignments.filter((assignment) => {
      const ownerKey = assignment.owner?.participant_code ?? assignment.owner?.display_name ?? "Unknown";
      const haystack = `${assignment.task_code ?? ""} ${assignment.title ?? ""}`.toLowerCase();
      return (ownerFilter === "all" || ownerFilter === ownerKey) && (!normalized || haystack.includes(normalized));
    });
  }, [assignments, query, ownerFilter]);

  const nextAssignmentSetCode = useMemo(() => {
    const numbers = assignmentSets
      .map((set) => set.batch_code?.match(/^AQT(\d+)$/)?.[1])
      .filter(Boolean)
      .map((value) => Number(value));
    const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const maxWidth = Math.max(4, ...assignmentSets.map((set) => set.batch_code?.match(/^AQT(\d+)$/)?.[1]?.length ?? 0));
    return `AQT${String(nextNumber).padStart(maxWidth, "0")}`;
  }, [assignmentSets]);

  function toggleSelected(assignmentId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }

  function updateScore(assignmentId: string, value: string) {
    const score = Math.max(0, Number(value || 0));
    setScoreByAssignment((current) => ({ ...current, [assignmentId]: score }));
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/assignmentsets" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Assignment Sets
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">New Assignment Set</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">New Assignment Set</h1>
            <p className="text-sm text-[#64748B] mt-1">Select assignments from all teachers before creating a new batch assignment.</p>
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
              href="/api/teacher/assignmentsets/template"
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold"
            >
              Template
            </Link>
            {uploadFileName && <span className="basis-full sm:basis-auto text-xs text-[#64748B]">{uploadFileName}</span>}
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by assignment code or name"
            className="lg:col-span-2 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          >
            <option value="all">All teachers</option>
            {owners.map((owner) => (
              <option key={owner.value} value={owner.value}>{owner.label}</option>
            ))}
          </select>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input
              value={nextAssignmentSetCode}
              readOnly
              aria-label="Assignment set code"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021] cursor-not-allowed"
            />
            <input
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              placeholder="Assignment Set Name"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
          </div>
          <textarea
            value={setDescription}
            onChange={(event) => setSetDescription(event.target.value)}
            placeholder="Assignment Set Description"
            rows={3}
            className="w-full mb-5 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm resize-none"
          />
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0F172A]">
              Selected Assignments: <span className="text-[#F37021]">{selectedIds.size}</span>
            </p>
          </div>
          <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
            {filteredAssignments.map((assignment) => (
              <div key={assignment.assignment_id} className="flex items-start gap-3 border border-[#FED7AA] rounded-xl px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(assignment.assignment_id)}
                  onChange={() => toggleSelected(assignment.assignment_id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono font-bold text-[#F37021]">{assignment.task_code ?? "-"}</p>
                  <p className="text-sm font-semibold text-[#0F172A]">{assignment.title ?? "Untitled assignment"}</p>
                  <p className="text-xs text-[#64748B]">Owner: {assignment.owner?.display_name ?? assignment.owner?.participant_code ?? "Unknown"}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#64748B]">
                  Score
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={scoreByAssignment[assignment.assignment_id] ?? 10}
                    onChange={(event) => updateScore(assignment.assignment_id, event.target.value)}
                    className="w-20 px-2 py-1.5 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] text-sm font-semibold text-[#0F172A]"
                  />
                </label>
              </div>
            ))}
          </div>
          <button className="mt-5 px-4 py-2 rounded-xl bg-[#F37021]/60 text-white text-sm font-semibold cursor-not-allowed" disabled>
            Create Assignment Set ({selectedIds.size})
          </button>
        </section>
      </main>
    </div>
  );
}

function isActiveAssignment(assignment: AssignmentItem) {
  return Boolean(assignment.is_active) && assignment.status !== "archived";
}

function safeJsonParse(text: string): { error?: string; assignments?: AssignmentItem[]; assignment_sets?: AssignmentSetItem[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
