"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type ContentFamily = "assignment" | "lab" | "exam";
type ContentItem = { batch_id: string; batch_code: string | null; batch_name: string | null; status: string | null };
type AvailableSet = ContentItem & { task_count?: number };

const LEARNER_GROUPS = [
  { value: "G1", label: "G1 · Youth", icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-1 1a5 5 0 00-5 5v1h12v-1a5 5 0 00-5-5h-2z"/></svg> },
  { value: "G2", label: "G2 · High School", icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5 8.26V14a1 1 0 00.553.894l4 2a1 1 0 00.894 0l4-2A1 1 0 0015 14V8.26l2.606-1.116a1 1 0 000-1.79l-7-3zM10 14.618L6 12.618V9.47l4 1.714 4-1.714v3.148l-4 2z"/></svg> },
  { value: "G3", label: "G3 · Undergraduate", icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 100 1.84l7 3 7-3a1 1 0 000-1.84l-7-3zM3 10.414V15a1 1 0 001 1h12a1 1 0 001-1v-4.586l-6 2.572-7-2.572z"/></svg> },
  { value: "G4", label: "G4 · General Public", icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z"/></svg> },
];

const CLASS_LEVELS = [
  { value: "L1", short: "1", label: "L1 · Beginner" },
  { value: "L2", short: "2", label: "L2 · Foundation" },
  { value: "L3", short: "3", label: "L3 · Intermediate" },
  { value: "L4", short: "4", label: "L4 · Advanced" },
];

const FAMILY_LABELS: Record<ContentFamily, string> = {
  assignment: "Assignment Sets",
  lab: "Lab Sets",
  exam: "Exam Sets",
};

function NewClassForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isDuplicate = searchParams.has("group") || searchParams.has("year") || searchParams.has("name");

  const [classCode, setClassCode] = useState("");
  const [className, setClassName] = useState(searchParams.get("name") ?? "");
  const [learnerGroup, setLearnerGroup] = useState(searchParams.get("group") ?? "");
  const [classLevel, setClassLevel] = useState(searchParams.get("level") ?? "");
  const [academicYear, setAcademicYear] = useState(searchParams.get("year") ?? String(new Date().getFullYear()));
  const [term, setTerm] = useState(searchParams.get("term") ?? "");
  const [registerFrom, setRegisterFrom] = useState(searchParams.get("from_date") ?? "");
  const [registerTo, setRegisterTo] = useState(searchParams.get("to_date") ?? "");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingSets, setPendingSets] = useState<Record<ContentFamily, ContentItem[]>>({
    assignment: [], lab: [], exam: [],
  });
  const [expandedFamily, setExpandedFamily] = useState<ContentFamily | null>(null);
  const [modalFamily, setModalFamily] = useState<ContentFamily | null>(null);
  const [availableSets, setAvailableSets] = useState<AvailableSet[]>([]);
  const [modalQuery, setModalQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const suggestedCode = useMemo(() => {
    const yy = (academicYear || String(new Date().getFullYear())).slice(-2);
    const gg = learnerGroup || "G1";
    const ll = classLevel || "L1";
    return `CLS${yy}${gg}${ll}0001`;
  }, [academicYear, learnerGroup, classLevel]);

  const filteredAvailable = useMemo(() => {
    const q = modalQuery.trim().toLowerCase();
    return q ? availableSets.filter(s => `${s.batch_code ?? ""} ${s.batch_name ?? ""}`.toLowerCase().includes(q)) : availableSets;
  }, [availableSets, modalQuery]);

  async function openModal(family: ContentFamily) {
    setModalFamily(family);
    setModalQuery("");
    setSelectedIds([]);
    setModalError(null);
    setModalLoading(true);
    setExpandedFamily(family);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { router.push("/auth/login"); return; }

    const res = await fetch(`/api/teacher/assignmentsets?family=${family}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setModalError(json.error ?? "Failed to load sets.");
      setAvailableSets([]);
      setModalLoading(false);
      return;
    }

    const linked = new Set(pendingSets[family].map(s => s.batch_id));
    setAvailableSets((json.assignment_sets ?? []).filter((s: AvailableSet) => !linked.has(s.batch_id)));
    setModalLoading(false);
  }

  function addToDraft() {
    if (!modalFamily || selectedIds.length === 0) return;
    const family = modalFamily;
    const selected = availableSets.filter(s => selectedIds.includes(s.batch_id));
    setPendingSets(cur => {
      const existing = new Set(cur[family].map(s => s.batch_id));
      const toAdd = selected.filter(s => !existing.has(s.batch_id));
      return { ...cur, [family]: [...cur[family], ...toAdd] };
    });
    setModalFamily(null);
    setAvailableSets([]);
    setSelectedIds([]);
  }

  function removeFromPending(family: ContentFamily, batchId: string) {
    setPendingSets(cur => ({ ...cur, [family]: cur[family].filter(s => s.batch_id !== batchId) }));
  }

  async function createClass() {
    const name = className.trim();
    const code = classCode.trim();
    if (!name || saving) return;

    setSaving(true);
    setCreateError(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { router.push("/auth/login"); return; }

    const body: Record<string, unknown> = {
      class_name: name,
      class_code: code || suggestedCode,
      is_active: true,
      is_open_for_enrollment: true,
    };
    if (learnerGroup) body.learner_group = learnerGroup;
    if (classLevel) body.class_level = classLevel;
    if (academicYear.trim()) body.academic_year = academicYear.trim();
    if (term.trim()) body.term = term.trim();
    if (registerFrom) body.register_from = registerFrom;
    if (registerTo) body.register_to = registerTo;

    const res = await fetch("/api/teacher/classes", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateError(json.error ?? "Failed to create class.");
      setSaving(false);
      return;
    }

    const newClassId: string | undefined = json.class?.class_id;
    if (!newClassId) { router.push("/teacher/classes"); return; }

    const families: ContentFamily[] = ["assignment", "lab", "exam"];
    for (const family of families) {
      for (const item of pendingSets[family]) {
        await fetch(`/api/teacher/classes/${newClassId}/sets`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: item.batch_id, family }),
        });
      }
    }

    router.push(`/teacher/classes/${newClassId}`);
  }

  const selectedGroup = LEARNER_GROUPS.find(g => g.value === learnerGroup);
  const selectedLevel = CLASS_LEVELS.find(l => l.value === classLevel);

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/teacher/classes" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">Classes</Link>
          <span className="text-xs font-semibold text-[#F37021]">{isDuplicate ? "Duplicate Class" : "New Class"}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">{isDuplicate ? "Duplicate Class" : "New Class"}</h1>
          <p className="text-sm text-[#64748B] mt-1">
            {isDuplicate
              ? "Duplicated from an existing class. A new code will be generated."
              : "Class code, year, group and level are fixed after creation."}
          </p>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Class Code">
              <input value={classCode} onChange={e => setClassCode(e.target.value)} placeholder={suggestedCode}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm font-mono font-semibold text-[#F37021] placeholder:text-[#F37021]/50 focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>
            <Field label="Class Name">
              <input value={className} onChange={e => setClassName(e.target.value)} placeholder="e.g. SQL Basics Room 1"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">Academic Year</span>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-[#F8FAFC]">
                <button type="button" onClick={() => setAcademicYear(y => String(Number(y) - 1))}
                  className="px-3 text-[#64748B] hover:bg-[#FED7AA] font-bold text-lg leading-none">−</button>
                <input value={academicYear} onChange={e => setAcademicYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="flex-1 min-w-0 text-center py-2.5 text-sm font-semibold text-[#0F172A] bg-transparent focus:outline-none" />
                <button type="button" onClick={() => setAcademicYear(y => String(Number(y) + 1))}
                  className="px-3 text-[#64748B] hover:bg-[#FED7AA] font-bold text-lg leading-none">+</button>
              </div>
            </div>

            <Field label="Semester">
              <input value={term} onChange={e => setTerm(e.target.value)} placeholder="1"
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">Learner Group</span>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-[#F8FAFC]">
                {LEARNER_GROUPS.map(g => (
                  <button key={g.value} type="button" title={g.label}
                    onClick={() => setLearnerGroup(g.value === learnerGroup ? "" : g.value)}
                    className={`flex-1 inline-flex items-center justify-center h-11 border-r border-[#FED7AA] last:border-r-0 transition-colors ${learnerGroup === g.value ? "bg-[#F37021] text-white" : "text-[#94A3B8] hover:bg-[#FED7AA] hover:text-[#64748B]"}`}>
                    {g.icon}
                  </button>
                ))}
              </div>
              {selectedGroup && <p className="mt-1 text-[11px] text-[#F37021] font-semibold">{selectedGroup.label}</p>}
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">Class Level</span>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-[#F8FAFC]">
                {CLASS_LEVELS.map(l => (
                  <button key={l.value} type="button" title={l.label}
                    onClick={() => setClassLevel(l.value === classLevel ? "" : l.value)}
                    className={`flex-1 inline-flex items-center justify-center h-11 text-sm font-bold border-r border-[#FED7AA] last:border-r-0 transition-colors ${classLevel === l.value ? "bg-[#F37021] text-white" : "text-[#94A3B8] hover:bg-[#FED7AA] hover:text-[#64748B]"}`}>
                    {l.short}
                  </button>
                ))}
              </div>
              {selectedLevel && <p className="mt-1 text-[11px] text-[#F37021] font-semibold">{selectedLevel.label}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Register From">
              <input type="date" value={registerFrom} onChange={e => setRegisterFrom(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>
            <Field label="Register To">
              <input type="date" value={registerTo} onChange={e => setRegisterTo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>
          </div>

          {createError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Link href="/teacher/classes"
              className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]">
              Cancel
            </Link>
            <button type="button" onClick={createClass} disabled={!className.trim() || saving}
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50">
              {saving ? "Creating…" : "Create Class"}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          {(["assignment", "lab", "exam"] as ContentFamily[]).map(family => {
            const items = pendingSets[family];
            const isExpanded = expandedFamily === family;
            return (
              <div key={family} className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <button type="button" onClick={() => setExpandedFamily(isExpanded ? null : family)}
                    className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                    <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-[#64748B] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                    {FAMILY_LABELS[family]}
                    <span className="text-xs font-normal text-[#64748B]">{items.length} linked</span>
                  </button>
                  <button type="button" onClick={() => openModal(family)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]">
                    <span className="text-lg font-bold leading-none">+</span>
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-[#FED7AA] px-4 py-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-sm text-[#64748B] py-2">No sets added yet.</p>
                    ) : items.map(item => (
                      <div key={item.batch_id} className="flex items-center justify-between gap-3 rounded-xl border border-[#FED7AA] px-3 py-2">
                        <p className="text-sm min-w-0 truncate">
                          <span className="font-mono text-xs font-bold text-[#F37021]">{item.batch_code ?? "—"}</span>
                          <span className="mx-2 text-[#CBD5E1]">|</span>
                          <span className="font-semibold text-[#0F172A]">{item.batch_name ?? "Untitled"}</span>
                        </p>
                        <button type="button" onClick={() => removeFromPending(family, item.batch_id)}
                          className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#FED7AA] text-[#64748B] hover:border-red-400 hover:text-red-500">
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </main>

      {modalFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">{FAMILY_LABELS[modalFamily]}</h2>
                <p className="mt-1 text-sm text-[#64748B]">Select sets to add to this class.</p>
              </div>
              <button type="button" onClick={() => setModalFamily(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]">×</button>
            </div>
            <input value={modalQuery} onChange={e => setModalQuery(e.target.value)}
              placeholder="Search by code or name"
              className="mb-4 w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {modalLoading ? (
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">Loading sets…</div>
              ) : filteredAvailable.length === 0 ? (
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">No sets available.</div>
              ) : filteredAvailable.map(set => {
                const hasAssignments = Number(set.task_count ?? 0) > 0;
                const selected = selectedIds.includes(set.batch_id);
                return (
                  <label key={set.batch_id}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 ${selected ? "border-[#F37021] bg-[#FFF7ED]" : "border-[#FED7AA] bg-white"} ${hasAssignments ? "cursor-pointer hover:bg-[#FFF7ED]" : "cursor-not-allowed opacity-60"}`}>
                    <input type="checkbox" checked={selected} disabled={!hasAssignments}
                      onChange={() => { if (!hasAssignments) return; setSelectedIds(cur => cur.includes(set.batch_id) ? cur.filter(id => id !== set.batch_id) : [...cur, set.batch_id]); }}
                      className="h-4 w-4 shrink-0 accent-[#F37021]" />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm">
                        <span className="font-mono text-xs font-bold text-[#F37021]">{set.batch_code ?? "—"}</span>
                        <span className="mx-2 text-[#CBD5E1]">|</span>
                        <span className="font-semibold text-[#0F172A]">{set.batch_name ?? "Untitled"}</span>
                      </p>
                      <span className="shrink-0 text-xs font-semibold capitalize text-[#92400E]">
                        {hasAssignments ? (set.status ?? "draft") : "No assignments"}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
            {modalError && <p className="mt-3 text-sm text-red-600">{modalError}</p>}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={addToDraft} disabled={selectedIds.length === 0 || modalLoading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:bg-[#F37021]/50">
                <span className="text-lg font-bold leading-none">+</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewTeacherClassPage() {
  return (
    <Suspense>
      <NewClassForm />
    </Suspense>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      {children}
    </label>
  );
}
