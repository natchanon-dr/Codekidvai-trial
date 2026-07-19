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
  const [originalAssignments, setOriginalAssignments] = useState<AssignmentItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentItem[]>([]);
  const [scoreByAssignment, setScoreByAssignment] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [addQuery, setAddQuery] = useState("");
  const [addAssignmentIds, setAddAssignmentIds] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [setCode, setSetCode] = useState("");
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [originalSetName, setOriginalSetName] = useState("");
  const [originalSetDescription, setOriginalSetDescription] = useState("");
  const [editingAssignments, setEditingAssignments] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

      setAssignments(loadedAssignments);
      setOriginalAssignments(loadedAssignments);
      setAllAssignments((assignmentsJson.assignments ?? []).filter(isActiveAssignment));
      setSetCode(payload.assignment_set.batch_code ?? "");
      setSetName(payload.assignment_set.batch_name ?? "");
      setSetDescription(payload.assignment_set.batch_description ?? "");
      setOriginalSetName(payload.assignment_set.batch_name ?? "");
      setOriginalSetDescription(payload.assignment_set.batch_description ?? "");
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

  function updateScore(assignmentId: string, value: string) {
    const score = Math.max(0, Number(value || 0));
    setEditingAssignments(true);
    setScoreByAssignment((current) => ({ ...current, [assignmentId]: score }));
  }

  function openAddModal() {
    setEditingAssignments(true);
    setAddQuery("");
    setAddAssignmentIds([]);
    setAddModalOpen(true);
  }

  function closeAddModal() {
    setAddModalOpen(false);
    setAddAssignmentIds([]);
  }

  function addAssignmentToSet() {
    if (addAssignmentIds.length === 0) return;
    const selectedAssignments = allAssignments.filter((item) => addAssignmentIds.includes(item.assignment_id));
    if (selectedAssignments.length === 0) return;

    setAssignments((current) => [...current, ...selectedAssignments]);
    setScoreByAssignment((current) => ({
      ...current,
      ...Object.fromEntries(selectedAssignments.map((assignment) => [
        assignment.assignment_id,
        Number(assignment.max_score ?? 10),
      ])),
    }));
    closeAddModal();
  }

  function toggleAddAssignment(assignmentId: string) {
    setAddAssignmentIds((current) => current.includes(assignmentId)
      ? current.filter((id) => id !== assignmentId)
      : [...current, assignmentId]);
  }

  function startEditAssignments() {
    setEditingAssignments(true);
  }

  function removeAssignmentFromDraft(assignmentId: string) {
    setEditingAssignments(true);
    setAssignments((current) => current.filter((assignment) => assignment.assignment_id !== assignmentId));
  }

  function cancelAssignmentDraft() {
    setAssignments(originalAssignments);
    setSetName(originalSetName);
    setSetDescription(originalSetDescription);
    setScoreByAssignment(Object.fromEntries(originalAssignments.map((assignment) => [
      assignment.assignment_id,
      Number(assignment.max_score ?? 10),
    ])));
    setEditingAssignments(false);
    closeAddModal();
    setSaveMessage(null);
  }

  async function saveAssignmentSet() {
    const name = setName.trim();
    if (!name || saving) return;

    setSaving(true);
    setErrorMessage(null);
    setSaveMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/assignmentsets/${params.setId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        batch_name: name,
        batch_description: setDescription,
        assignments: assignments.map((assignment, index) => ({
          task_id: assignment.assignment_id,
          assigned_order: index + 1,
        })),
      }),
    });
    const text = await response.text();
    const json = (text ? safeJsonParse(text) : {}) as { error?: string };
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to save assignment set.");
      setSaving(false);
      return;
    }

    setSetName(name);
    setOriginalSetName(name);
    setOriginalSetDescription(setDescription);
    setOriginalAssignments(assignments);
    setEditingAssignments(false);
    setSaveMessage("Assignment set saved.");
    setSaving(false);
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
              onChange={(event) => {
                setSetName(event.target.value);
                setEditingAssignments(true);
              }}
              placeholder="Assignment Set Name"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
          </div>
          <textarea
            value={setDescription}
            onChange={(event) => {
              setSetDescription(event.target.value);
              setEditingAssignments(true);
            }}
            placeholder="Assignment Set Description"
            rows={3}
            className="w-full mb-5 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm resize-none"
          />

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0F172A]">
              Selected Assignments: <span className="text-[#F37021]">{assignments.length}</span>
            </p>
            <div className="flex items-center gap-2">
              {!editingAssignments ? (
                <>
                  <button
                    type="button"
                    onClick={openAddModal}
                    aria-label="Add assignment"
                    title="Add assignment"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F37021] text-lg font-bold leading-none text-white hover:bg-[#C2410C]"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={startEditAssignments}
                    aria-label="Edit assignments"
                    title="Edit assignments"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED]"
                  >
                    <PencilIcon />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={saveAssignmentSet}
                    disabled={!setName.trim() || saving}
                    aria-label="Save assignment set"
                    title="Save"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
                  >
                    <SaveIcon />
                  </button>
                  <button
                    type="button"
                    onClick={cancelAssignmentDraft}
                    disabled={saving}
                    aria-label="Cancel assignment changes"
                    title="Cancel"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED] disabled:opacity-50"
                  >
                    <XIcon />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
            {filteredAssignments.map((assignment) => (
              <div key={assignment.assignment_id} className="flex items-start gap-3 border border-[#FED7AA] rounded-xl px-4 py-3">
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
                {editingAssignments && (
                  <button
                    type="button"
                    onClick={() => removeAssignmentFromDraft(assignment.assignment_id)}
                    aria-label="Remove assignment"
                    title="Remove"
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 text-base font-bold leading-none text-red-600 hover:bg-red-50"
                  >
                    -
                  </button>
                )}
              </div>
            ))}
          </div>
          {saveMessage && <p className="mt-4 text-sm font-semibold text-green-700">{saveMessage}</p>}
        </section>
      </main>

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">Assignment List</h2>
                <p className="text-sm text-[#64748B] mt-1">Select active assignments to add to this set.</p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label="Cancel"
                title="Cancel"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]"
              >
                x
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
                  <label
                    key={assignment.assignment_id}
                    className={`block w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors ${
                      addAssignmentIds.includes(assignment.assignment_id)
                        ? "border-[#F37021] bg-[#FFF7ED]"
                        : "border-[#FED7AA] bg-white hover:bg-[#FFF7ED]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={addAssignmentIds.includes(assignment.assignment_id)}
                        onChange={() => toggleAddAssignment(assignment.assignment_id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#F37021]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono font-bold text-[#F37021]">{assignment.task_code ?? "-"}</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{assignment.title ?? "Untitled assignment"}</p>
                        <p className="text-xs text-[#64748B]">Owner: {assignment.owner?.display_name ?? assignment.owner?.participant_code ?? "Unknown"}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#64748B]">Score {assignment.max_score ?? 10}</span>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={addAssignmentToSet}
                disabled={addAssignmentIds.length === 0}
                aria-label="Add selected assignment"
                title="Add selected assignment"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-xl font-bold text-white hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:bg-[#F37021]/40"
              >
                +
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

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function safeJsonParse(text: string): { error?: string; assignments?: AssignmentItem[] } | AssignmentSetPayload {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
