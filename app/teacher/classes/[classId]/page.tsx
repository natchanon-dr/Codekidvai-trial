"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentFamily = "assignment" | "lab" | "exam";

type ContentItem = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
};

type AvailableSet = ContentItem & { task_count?: number };

type ClassData = {
  class_id: string;
  class_code: string;
  class_name: string;
  learner_group: string | null;
  class_level: string | null;
  academic_year: string | null;
  term: string | null;
  register_from: string | null;
  register_to: string | null;
  is_active: boolean;
  assignment_sets: ContentItem[];
  lab_sets: ContentItem[];
  exam_sets: ContentItem[];
};

type PendingChanges = { added: ContentItem[]; removed: string[] };

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditClassPage() {
  const params = useParams<{ classId: string }>();
  const router = useRouter();

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [className, setClassName] = useState("");
  const [term, setTerm] = useState("");
  const [registerFrom, setRegisterFrom] = useState("");
  const [registerTo, setRegisterTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Content management
  const [pending, setPending] = useState<Record<ContentFamily, PendingChanges>>({
    assignment: { added: [], removed: [] },
    lab: { added: [], removed: [] },
    exam: { added: [], removed: [] },
  });
  const [expandedFamily, setExpandedFamily] = useState<ContentFamily | null>(null);
  const [editingFamily, setEditingFamily] = useState<ContentFamily | null>(null);
  const [savingFamily, setSavingFamily] = useState<ContentFamily | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  // Modal
  const [modalFamily, setModalFamily] = useState<ContentFamily | null>(null);
  const [availableSets, setAvailableSets] = useState<AvailableSet[]>([]);
  const [modalQuery, setModalQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { router.push("/auth/login"); return; }

      const res = await fetch(`/api/teacher/classes/${params.classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setError(json.error ?? "Failed to load class.");
        setLoading(false);
        return;
      }

      const cls: ClassData = json.class;
      setClassData(cls);
      setClassName(cls.class_name ?? "");
      setTerm(cls.term ?? "");
      setRegisterFrom(cls.register_from ? cls.register_from.slice(0, 10) : "");
      setRegisterTo(cls.register_to ? cls.register_to.slice(0, 10) : "");
      setLoading(false);
    }
    load();
  }, [params.classId, router]);

  // ── Field save ──────────────────────────────────────────────────────────────

  async function save() {
    if (!className.trim() || saving) return;
    setSaving(true);
    setError(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { router.push("/auth/login"); return; }

    const res = await fetch(`/api/teacher/classes/${params.classId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ class_name: className, term, register_from: registerFrom || null, register_to: registerTo || null }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Failed to save class."); setSaving(false); return; }
    router.push("/teacher/classes");
  }

  // ── Content sets helpers ────────────────────────────────────────────────────

  function getBaseSets(family: ContentFamily): ContentItem[] {
    if (!classData) return [];
    return family === "lab" ? (classData.lab_sets ?? []) : family === "exam" ? (classData.exam_sets ?? []) : (classData.assignment_sets ?? []);
  }

  function getDraftSets(family: ContentFamily): ContentItem[] {
    const p = pending[family];
    const removed = new Set(p.removed);
    const base = getBaseSets(family).filter(s => !removed.has(s.batch_id));
    const baseIds = new Set(base.map(s => s.batch_id));
    return [...base, ...p.added.filter(s => !baseIds.has(s.batch_id))];
  }

  const filteredAvailable = useMemo(() => {
    const q = modalQuery.trim().toLowerCase();
    return q ? availableSets.filter(s => `${s.batch_code} ${s.batch_name}`.toLowerCase().includes(q)) : availableSets;
  }, [availableSets, modalQuery]);

  // ── Open add modal ──────────────────────────────────────────────────────────

  async function openModal(family: ContentFamily) {
    setModalFamily(family);
    setModalQuery("");
    setSelectedIds([]);
    setModalError(null);
    setModalLoading(true);
    setEditingFamily(family);
    setExpandedFamily(family);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { router.push("/auth/login"); return; }

    const res = await fetch(`/api/teacher/assignmentsets?family=${family}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setModalError(json.error ?? "Failed to load sets."); setAvailableSets([]); setModalLoading(false); return; }

    const linked = new Set(getDraftSets(family).map(s => s.batch_id));
    setAvailableSets((json.assignment_sets ?? []).filter((s: AvailableSet) => !linked.has(s.batch_id)));
    setModalLoading(false);
  }

  function addToDraft() {
    if (!modalFamily || selectedIds.length === 0) return;
    const family = modalFamily;
    const selected = availableSets.filter(s => selectedIds.includes(s.batch_id));
    const baseIds = new Set(getBaseSets(family).map(s => s.batch_id));
    setPending(cur => {
      const p = cur[family];
      const addedMap = new Map(p.added.map(s => [s.batch_id, s]));
      for (const s of selected) { if (!baseIds.has(s.batch_id)) addedMap.set(s.batch_id, s); }
      const selIds = new Set(selected.map(s => s.batch_id));
      return { ...cur, [family]: { added: [...addedMap.values()], removed: p.removed.filter(id => !selIds.has(id)) } };
    });
    setModalFamily(null);
    setAvailableSets([]);
    setSelectedIds([]);
  }

  function removeFromDraft(family: ContentFamily, batchId: string) {
    setEditingFamily(family);
    const isBase = getBaseSets(family).some(s => s.batch_id === batchId);
    setPending(cur => {
      const p = cur[family];
      return {
        ...cur,
        [family]: {
          added: p.added.filter(s => s.batch_id !== batchId),
          removed: isBase && !p.removed.includes(batchId) ? [...p.removed, batchId] : p.removed,
        },
      };
    });
  }

  // ── Save content ────────────────────────────────────────────────────────────

  async function saveContentChanges(family: ContentFamily) {
    const p = pending[family];
    if (p.added.length === 0 && p.removed.length === 0) { setEditingFamily(null); return; }

    setSavingFamily(family);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { router.push("/auth/login"); return; }

    setContentError(null);
    for (const item of p.added) {
      const res = await fetch(`/api/teacher/classes/${params.classId}/sets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: item.batch_id, family }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setContentError(j.error ?? "Failed to add set.");
        setSavingFamily(null);
        return;
      }
    }

    for (const batchId of p.removed) {
      const res = await fetch(`/api/teacher/classes/${params.classId}/sets?batch_id=${encodeURIComponent(batchId)}&family=${family}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setContentError(j.error ?? "Failed to remove set.");
        setSavingFamily(null);
        return;
      }
    }

    // Refresh class data
    const { data: sd } = await supabase.auth.getSession();
    const t2 = sd.session?.access_token;
    if (t2) {
      const r2 = await fetch(`/api/teacher/classes/${params.classId}`, { headers: { Authorization: `Bearer ${t2}` } });
      const j2 = await r2.json().catch(() => ({}));
      if (r2.ok) setClassData(j2.class);
    }
    setPending(cur => ({ ...cur, [family]: { added: [], removed: [] } }));
    setEditingFamily(null);
    setSavingFamily(null);
  }

  function cancelChanges(family: ContentFamily) {
    setPending(cur => ({ ...cur, [family]: { added: [], removed: [] } }));
    setEditingFamily(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading...</div>;
  if (error && !classData) return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{error}</div>;

  const selectedGroup = LEARNER_GROUPS.find(g => g.value === classData?.learner_group);
  const selectedLevel = CLASS_LEVELS.find(l => l.value === classData?.class_level);

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/teacher/classes" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">Classes</Link>
          <span className="text-xs font-semibold text-[#F37021]">Edit Class</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">Edit Class</h1>
          <p className="text-sm text-[#64748B] mt-1">Class code, year, group and level are fixed.</p>
        </section>

        {/* ── Class fields ── */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadOnlyField label="Class Code" value={classData?.class_code ?? "—"} mono />
            <Field label="Class Name">
              <input value={className} onChange={e => setClassName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <ReadOnlyField label="Academic Year" value={classData?.academic_year ?? "—"} />
            <Field label="Semester">
              <input value={term} onChange={e => setTerm(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]" />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">Learner Group</span>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-[#F8FAFC]">
                {LEARNER_GROUPS.map(g => (
                  <div key={g.value} title={g.label} className={`flex-1 inline-flex items-center justify-center h-11 border-r border-[#FED7AA] last:border-r-0 ${classData?.learner_group === g.value ? "bg-[#F37021] text-white" : "text-[#CBD5E1]"}`}>{g.icon}</div>
                ))}
              </div>
              {selectedGroup && <p className="mt-1 text-[11px] text-[#F37021] font-semibold">{selectedGroup.label}</p>}
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">Class Level</span>
              <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-[#F8FAFC]">
                {CLASS_LEVELS.map(l => (
                  <div key={l.value} title={l.label} className={`flex-1 inline-flex items-center justify-center h-11 text-sm font-bold border-r border-[#FED7AA] last:border-r-0 ${classData?.class_level === l.value ? "bg-[#F37021] text-white" : "text-[#CBD5E1]"}`}>{l.short}</div>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Link href="/teacher/classes" className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]">Cancel</Link>
            <button type="button" onClick={save} disabled={!className.trim() || saving}
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50">
              {saving ? "Saving…" : "Save Class"}
            </button>
          </div>
        </section>

        {/* ── Content sets ── */}
        {contentError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-500 shrink-0 mt-0.5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd"/></svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">{contentError}</p>
              {contentError.includes("no active students") && (
                <p className="mt-1 text-xs text-red-600">Students must be enrolled in this class before sets can be assigned to them.</p>
              )}
            </div>
            <button type="button" onClick={() => setContentError(null)} className="shrink-0 text-red-400 hover:text-red-600">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
            </button>
          </div>
        )}
        <section className="space-y-2">
          {(["assignment", "lab", "exam"] as ContentFamily[]).map(family => {
            const items = getDraftSets(family);
            const isExpanded = expandedFamily === family;
            const isEditing = editingFamily === family;
            const isSaving = savingFamily === family;
            const p = pending[family];
            const hasPending = p.added.length > 0 || p.removed.length > 0;

            return (
              <div key={family} className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <button type="button" onClick={() => setExpandedFamily(isExpanded ? null : family)}
                    className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                    <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-[#64748B] transition-transform ${isExpanded ? "rotate-180" : ""}`}><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                    {FAMILY_LABELS[family]}
                    <span className="text-xs font-normal text-[#64748B]">{items.length} linked</span>
                    {hasPending && <span className="text-[10px] font-semibold text-[#F37021] border border-[#F37021] rounded-full px-1.5">unsaved</span>}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {isEditing && (
                      <>
                        <button type="button" onClick={() => saveContentChanges(family)} disabled={isSaving}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C] disabled:opacity-50">
                          <SaveIcon />
                        </button>
                        <button type="button" onClick={() => cancelChanges(family)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#64748B] hover:border-[#F37021]">
                          <XIcon />
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => openModal(family)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]">
                      <span className="text-lg font-bold leading-none">+</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#FED7AA] px-4 py-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-sm text-[#64748B] py-2">No sets linked yet.</p>
                    ) : items.map(item => (
                      <div key={item.batch_id} className="flex items-center justify-between gap-3 rounded-xl border border-[#FED7AA] px-3 py-2">
                        <p className="text-sm min-w-0 truncate">
                          <span className="font-mono text-xs font-bold text-[#F37021]">{item.batch_code ?? "—"}</span>
                          <span className="mx-2 text-[#CBD5E1]">|</span>
                          <span className="font-semibold text-[#0F172A]">{item.batch_name ?? "Untitled"}</span>
                        </p>
                        <button type="button" onClick={() => { setEditingFamily(family); removeFromDraft(family, item.batch_id); }}
                          className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#FED7AA] text-[#64748B] hover:border-red-400 hover:text-red-500">
                          <XIcon small />
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

      {/* ── Add set modal ── */}
      {modalFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">{FAMILY_LABELS[modalFamily]}</h2>
                <p className="mt-1 text-sm text-[#64748B]">Select sets to add to {classData?.class_code}.</p>
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

// ─── Helper components ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      <input value={value} disabled className={`w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm text-[#0F172A] ${mono ? "font-mono font-bold text-[#F37021]" : ""}`} />
    </label>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" /><path d="M7 3v5h8" />
    </svg>
  );
}

function XIcon({ small }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={small ? "h-3 w-3" : "h-4 w-4"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
