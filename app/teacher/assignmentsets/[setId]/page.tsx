"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type AssignmentItem = {
  assignment_id: string;
  task_id?: string;
  task_code: string | null;
  title: string | null;
  description: string | null;
  max_score: number | null;
  status: string | null;
  is_active: boolean | null;
  owner: { display_name: string | null; participant_code: string | null } | null;
};

type AssignmentSetPayload = {
  assignment_set: {
    batch_id: string;
    batch_code: string | null;
    batch_name: string | null;
    batch_description: string | null;
    status: string | null;
    owner: { display_name: string | null; participant_code: string | null } | null;
  };
  assignments: Array<{
    assignment_id: string;
    task_id: string;
    assigned_order: number | null;
    status: string | null;
    task: {
      task_code: string | null;
      task_title: string | null;
      task_description?: string | null;
      task_status?: string | null;
      is_active?: boolean | null;
      max_score?: number | null;
    } | null;
  }>;
};

export default function AssignmentSetDetailPage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scoreByAssignment, setScoreByAssignment] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [addQuery, setAddQuery] = useState("");
  const [addAssignmentId, setAddAssignmentId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [setCode, setSetCode] = useState("");
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const [setResponse, assignmentsResponse] = await Promise.all([
        fetch(`/api/teacher/assignmentsets/${params.setId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/teacher/assignments?scope=all", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const setText = await setResponse.text();
      const setJson = (setText ? safeJsonParse(setText) : {}) as Partial<AssignmentSetPayload> & { error?: string };
      if (!setResponse.ok) {
        setErrorMessage(setJson.error ?? setText ?? "Failed to load assignment set.");
        setLoading(false);
        return;
      }

      const assignmentsText = await assignmentsResponse.text();
      const assignmentsJson = (assignmentsText ? safeJsonParse(assignmentsText) : {}) as {
        error?: string;
        assignments?: AssignmentItem[];
      };
      if (!assignmentsResponse.ok) {
        setErrorMessage(assignmentsJson.error ?? assignmentsText ?? "Failed to load assignments.");
        setLoading(false);
        return;
      }

      const payload = setJson as AssignmentSetPayload;
      const assignmentMap = new Map<string, AssignmentItem>();
      for (const row of payload.assignments) {
        if (assignmentMap.has(row.task_id)) continue;
        assignmentMap.set(row.task_id, {
          assignment_id: row.task_id,
          task_id: row.task_id,
          task_code: row.task?.task_code ?? null,
          title: row.task?.task_title ?? null,
          description: row.task?.task_description ?? null,
          max_score: row.task?.max_score ?? null,
          status: row.task?.task_status ?? row.status,
          is_active: row.task?.is_active ?? null,
          owner: payload.assignment_set.owner,
        });
      }
      const loadedAssignments = [...assignmentMap.values()];
      const selectedTaskIds = new Set(loadedAssignments.map((assignment) => assignment.assignment_id));

      setAssignments(loadedAssignments);
      setAllAssignments((assignmentsJson.assignments ?? []).filter(isActiveAssignment));
      setSelectedIds(selectedTaskIds);
      setSetCode(payload.assignment_set.batch_code ?? "");
      setSetName(payload.assignment_set.batch_name ?? "");
      setSetDescription(payload.assignment_set.batch_description ?? "");
      setScoreByAssignment(Object.fromEntries(loadedAssignments.map((assignment) => [
        assignment.assignment_id,
        Number(assignment.max_score ?? 10),
      ])));
      setLoading(false);
    }

    loadData();
  }, [params.setId, router]);

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

  const addableAssignments = useMemo(() => {
    const setAssignmentIds = new Set(assignments.map((assignment) => assignment.assignment_id));
    const normalized = addQuery.trim().toLowerCase();
    return allAssignments.filter((assignment) => {
      const haystack = `${assignment.task_code ?? ""} ${assignment.title ?? ""}`.toLowerCase();
      return !setAssignmentIds.has(assignment.assignment_id) && (!normalized || haystack.includes(normalized));
    });
  }, [addQuery, allAssignments, assignments]);

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

  function openAddModal() {
    setAddQuery("");
    setAddAssignmentId(null);
    setAddModalOpen(true);
  }

  function closeAddModal() {
    setAddModalOpen(false);
    setAddAssignmentId(null);
  }

  function addAssignmentToSet() {
    if (!addAssignmentId) return;
    const assignment = allAssignments.find((item) => item.assignment_id === addAssignmentId);
    if (!assignment) return;

    setAssignments((current) => [...current, assignment]);
    setSelectedIds((current) => new Set(current).add(assignment.assignment_id));
    setScoreByAssignment((current) => ({
      ...current,
      [assignment.assignment_id]: Number(assignment.max_score ?? 10),
    }));
    closeAddModal();
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading assignment set...</div>;
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
          <span className="text-xs font-semibold text-[#F37021]">Edit Assignment Set</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Edit Assignment Set</h1>
            <p className="text-sm text-[#64748B] mt-1">Edit set details and selected assignments.</p>
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
              value={setCode}
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
            <button
              type="button"
              onClick={openAddModal}
              aria-label="Add assignment"
              title="Add assignment"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F37021] text-lg font-bold leading-none text-white hover:bg-[#C2410C]"
            >
              +
            </button>
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
            Save Assignment Set ({selectedIds.size})
          </button>
        </section>
      </main>

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">Assignment List</h2>
                <p className="text-sm text-[#64748B] mt-1">Select an active assignment to add to this set.</p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label="Cancel"
                title="Cancel"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]"
              >
                ×
              </button>
            </div>

            <input
              value={addQuery}
              onChange={(event) => setAddQuery(event.target.value)}
              placeholder="Search by assignment code or name"
              className="mb-4 w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {addableAssignments.length === 0 ? (
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                  No assignments available to add.
                </div>
              ) : (
                addableAssignments.map((assignment) => (
                  <button
                    key={assignment.assignment_id}
                    type="button"
                    onClick={() => setAddAssignmentId(assignment.assignment_id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      addAssignmentId === assignment.assignment_id
                        ? "border-[#F37021] bg-[#FFF7ED]"
                        : "border-[#FED7AA] bg-white hover:bg-[#FFF7ED]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-4 w-4 rounded-full border ${
                          addAssignmentId === assignment.assignment_id
                            ? "border-[#F37021] bg-[#F37021]"
                            : "border-[#FED7AA] bg-white"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono font-bold text-[#F37021]">{assignment.task_code ?? "-"}</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{assignment.title ?? "Untitled assignment"}</p>
                        <p className="text-xs text-[#64748B]">Owner: {assignment.owner?.display_name ?? assignment.owner?.participant_code ?? "Unknown"}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#64748B]">Score {assignment.max_score ?? 10}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={addAssignmentToSet}
                disabled={!addAssignmentId}
                aria-label="Add selected assignment"
                title="Add selected assignment"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-xl font-bold text-white hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:bg-[#F37021]/40"
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isActiveAssignment(assignment: AssignmentItem) {
  return Boolean(assignment.is_active) && assignment.status !== "archived";
}

function safeJsonParse(text: string): { error?: string; assignments?: AssignmentItem[] } | AssignmentSetPayload {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
