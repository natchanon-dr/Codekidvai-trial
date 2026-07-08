"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type StatusFilter = "active" | "inactive" | "all";
type ContentFamily = "assignment" | "lab" | "exam";
type LearnerGroupFilter = "" | "G1" | "G2" | "G3" | "G4";
type LevelFilter = "" | "L1" | "L2" | "L3" | "L4";

type ContentItem = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
};

type TeacherClass = {
  class_id: string;
  class_code: string;
  class_name: string;
  learner_group: string | null;
  class_level: string | null;
  class_section: string | null;
  academic_year: string | null;
  term: string | null;
  register_from: string | null;
  register_to: string | null;
  is_active: boolean;
  student_count: number;
  assignment_count: number;
  lab_count: number;
  exam_count: number;
  assignment_sets: ContentItem[];
  lab_sets: ContentItem[];
  exam_sets: ContentItem[];
  created_at: string | null;
};

type AvailableSet = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  status: string | null;
  task_count?: number;
};

type ClassDraft = {
  class_name: string;
  term: string;
  register_from: string;
  register_to: string;
};

type PendingContentChanges = {
  added: ContentItem[];
  removed: string[];
};

export default function TeacherClassesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [learnerGroupFilter, setLearnerGroupFilter] = useState<LearnerGroupFilter>("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [editMenus, setEditMenus] = useState<Set<string>>(new Set());
  const [addModalClass, setAddModalClass] = useState<TeacherClass | null>(null);
  const [addModalFamily, setAddModalFamily] = useState<ContentFamily>("assignment");
  const [availableSets, setAvailableSets] = useState<AvailableSet[]>([]);
  const [modalQuery, setModalQuery] = useState("");
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classDraft, setClassDraft] = useState<ClassDraft | null>(null);
  const [savingClassId, setSavingClassId] = useState<string | null>(null);
  const [pendingContentChanges, setPendingContentChanges] = useState<Record<string, PendingContentChanges>>({});
  const [savingContentMenuId, setSavingContentMenuId] = useState<string | null>(null);

  const loadClasses = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch("/api/teacher/classes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
      else setErrorMessage(json.error ?? text ?? "Failed to load classes.");
      setLoading(false);
      return;
    }

    setClasses(json.classes ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    async function loadInitialClasses() {
      await loadClasses(true);
    }

    loadInitialClasses();
  }, [loadClasses]);

  const filteredClasses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return classes.filter((item) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && item.is_active) ||
        (statusFilter === "inactive" && !item.is_active);
      const matchesGroup = !learnerGroupFilter || item.learner_group === learnerGroupFilter;
      const matchesLevel = !levelFilter || item.class_level === levelFilter;
      const haystack = `${item.class_code} ${item.class_name} ${item.class_level ?? ""} ${item.class_section ?? ""}`.toLowerCase();
      return matchesStatus && matchesGroup && matchesLevel && (!normalized || haystack.includes(normalized));
    });
  }, [classes, query, statusFilter, learnerGroupFilter, levelFilter]);

  async function toggleClassStatus(classId: string, nextActive: boolean) {
    setUpdatingId(classId);
    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/classes/${classId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: nextActive }),
    });
    if (response.ok) {
      setClasses((current) => current.map((item) => item.class_id === classId
        ? { ...item, is_active: nextActive }
        : item));
    } else {
      const text = await response.text();
      alert(safeJsonParse(text).error ?? "Failed to update class.");
    }
    setUpdatingId(null);
  }

  function toggleMenu(menuId: string) {
    setExpandedMenus((current) => {
      const next = new Set(current);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });
  }

  function startEditContentMenu(classId: string, family: ContentFamily) {
    const menuId = getContentMenuId(classId, family);
    setEditMenus((current) => new Set(current).add(menuId));
    setExpandedMenus((current) => new Set(current).add(menuId));
  }

  function getPendingContentChange(classId: string, family: ContentFamily): PendingContentChanges {
    return pendingContentChanges[getContentMenuId(classId, family)] ?? { added: [], removed: [] };
  }

  function getBaseContentSets(classItem: TeacherClass, family: ContentFamily) {
    if (family === "lab") return classItem.lab_sets ?? [];
    if (family === "exam") return classItem.exam_sets ?? [];
    return classItem.assignment_sets ?? [];
  }

  function getDraftContentSets(classItem: TeacherClass, family: ContentFamily) {
    const pending = getPendingContentChange(classItem.class_id, family);
    const removedIds = new Set(pending.removed);
    const baseItems = getBaseContentSets(classItem, family).filter((set) => !removedIds.has(set.batch_id));
    const baseIds = new Set(baseItems.map((set) => set.batch_id));
    const addedItems = pending.added.filter((set) => !baseIds.has(set.batch_id));
    return [...baseItems, ...addedItems].sort(compareContentItem);
  }

  async function openAddSetModal(classItem: TeacherClass, family: ContentFamily) {
    startEditContentMenu(classItem.class_id, family);
    setAddModalFamily(family);
    setAddModalClass(classItem);
    setModalQuery("");
    setSelectedSetIds([]);
    setActionError(null);
    setModalLoading(true);

    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/assignmentsets?family=${family}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setActionError(json.error ?? text ?? "Failed to load sets.");
      setAvailableSets([]);
      setModalLoading(false);
      return;
    }

    const linkedIds = new Set(getDraftContentSets(classItem, family).map((item) => item.batch_id));
    setAvailableSets((json.assignment_sets ?? []).filter((set) => !linkedIds.has(set.batch_id)));
    setModalLoading(false);
  }

  async function addSetToDraft() {
    if (!addModalClass || selectedAvailableSetIds.length === 0) return;
    setActionError(null);

    const family = addModalFamily;
    const menuId = getContentMenuId(addModalClass.class_id, family);
    const baseSetIds = new Set(getBaseContentSets(addModalClass, family).map((set) => set.batch_id));
    const selectedSets = availableSets
      .filter((set) => selectedAvailableSetIds.includes(set.batch_id))
      .map((set) => ({
        batch_id: set.batch_id,
        batch_code: set.batch_code,
        batch_name: set.batch_name,
        status: set.status,
      }));

    setPendingContentChanges((current) => {
      const existing = current[menuId] ?? { added: [], removed: [] };
      const selectedIds = new Set(selectedSets.map((set) => set.batch_id));
      const addedMap = new Map(existing.added.map((set) => [set.batch_id, set]));
      for (const set of selectedSets) {
        if (!baseSetIds.has(set.batch_id)) addedMap.set(set.batch_id, set);
      }
      return {
        ...current,
        [menuId]: {
          added: [...addedMap.values()],
          removed: existing.removed.filter((batchId) => !selectedIds.has(batchId)),
        },
      };
    });

    setAddModalClass(null);
    setAvailableSets([]);
    setSelectedSetIds([]);
  }

  function toggleSelectedSet(batchId: string) {
    const selectedSet = availableSets.find((set) => set.batch_id === batchId);
    if (Number(selectedSet?.task_count ?? 0) === 0) return;
    setSelectedSetIds((current) => current.includes(batchId)
      ? current.filter((id) => id !== batchId)
      : [...current, batchId]);
  }

  function removeSetFromDraft(classId: string, family: ContentFamily, batchId: string) {
    startEditContentMenu(classId, family);
    const classItem = classes.find((item) => item.class_id === classId);
    const isBaseSet = Boolean(classItem && getBaseContentSets(classItem, family).some((set) => set.batch_id === batchId));
    const menuId = getContentMenuId(classId, family);
    setPendingContentChanges((current) => {
      const existing = current[menuId] ?? { added: [], removed: [] };
      return {
        ...current,
        [menuId]: {
          added: existing.added.filter((set) => set.batch_id !== batchId),
          removed: isBaseSet && !existing.removed.includes(batchId)
            ? [...existing.removed, batchId]
            : existing.removed,
        },
      };
    });
  }

  async function saveContentSetChanges(classId: string, family: ContentFamily) {
    const menuId = getContentMenuId(classId, family);
    const pending = getPendingContentChange(classId, family);
    if (pending.added.length === 0 && pending.removed.length === 0) {
      cancelContentSetChanges(classId, family);
      return;
    }

    setSavingContentMenuId(menuId);
    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    for (const item of pending.added) {
      const response = await fetch(`/api/teacher/classes/${classId}/sets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: item.batch_id, family }),
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setSavingContentMenuId(null);
        alert(json.error ?? text ?? "Failed to add set.");
        return;
      }
    }

    for (const batchId of pending.removed) {
      const response = await fetch(`/api/teacher/classes/${classId}/sets?batch_id=${encodeURIComponent(batchId)}&family=${family}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setSavingContentMenuId(null);
        alert(json.error ?? text ?? "Failed to remove set.");
        return;
      }
    }

    setPendingContentChanges((current) => {
      const next = { ...current };
      delete next[menuId];
      return next;
    });
    setEditMenus((current) => {
      const next = new Set(current);
      next.delete(menuId);
      return next;
    });
    await loadClasses();
    setSavingContentMenuId(null);
  }

  function cancelContentSetChanges(classId: string, family: ContentFamily) {
    const menuId = getContentMenuId(classId, family);
    setPendingContentChanges((current) => {
      const next = { ...current };
      delete next[menuId];
      return next;
    });
    setEditMenus((current) => {
      const next = new Set(current);
      next.delete(menuId);
      return next;
    });
    if (addModalClass?.class_id === classId && addModalFamily === family) {
      setAddModalClass(null);
      setAvailableSets([]);
      setSelectedSetIds([]);
    }
  }

  function startEditClass(classItem: TeacherClass) {
    setEditingClassId(classItem.class_id);
    setClassDraft({
      class_name: classItem.class_name ?? "",
      term: classItem.term ?? "",
      register_from: classItem.register_from ? classItem.register_from.slice(0, 10) : "",
      register_to: classItem.register_to ? classItem.register_to.slice(0, 10) : "",
    });
  }

  function updateClassDraft(field: keyof ClassDraft, value: string) {
    setClassDraft((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveClass(classId: string) {
    if (!classDraft?.class_name.trim()) return;
    setSavingClassId(classId);
    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/classes/${classId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(classDraft),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      alert(json.error ?? text ?? "Failed to update class.");
      setSavingClassId(null);
      return;
    }

    setClasses((current) => current.map((item) => item.class_id === classId
      ? {
          ...item,
          class_name: classDraft.class_name,
          term: classDraft.term || null,
          register_from: classDraft.register_from || null,
          register_to: classDraft.register_to || null,
        }
      : item));
    setEditingClassId(null);
    setClassDraft(null);
    setSavingClassId(null);
  }

  const filteredAvailableSets = useMemo(() => {
    const normalized = modalQuery.trim().toLowerCase();
    return availableSets.filter((set) => {
      const haystack = `${set.batch_code ?? ""} ${set.batch_name ?? ""}`.toLowerCase();
      return !normalized || haystack.includes(normalized);
    });
  }, [availableSets, modalQuery]);

  const addableSetIds = new Set(
    availableSets
      .filter((set) => Number(set.task_count ?? 0) > 0)
      .map((set) => set.batch_id),
  );
  const selectedAvailableSetIds = selectedSetIds.filter((id) => addableSetIds.has(id));

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading classes...</div>;
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
          <span className="text-xs font-semibold text-[#F37021]">Classes Management</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Classes</h1>
            <p className="text-sm text-[#64748B] mt-1">Classes owned by this teacher in the default institution.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
            />
            <Link href="/teacher/classes/new" className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold">
              New Class
            </Link>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED] text-sm font-semibold"
            >
              Upload
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold"
            >
              Template
            </button>
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by class code or name"
            className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          {/* Status */}
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white flex-shrink-0">
            {(["active", "inactive", "all"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2.5 text-sm font-semibold capitalize border-r border-[#FED7AA] last:border-r-0 ${statusFilter === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
              >
                {status}
              </button>
            ))}
          </div>
          {/* Learner Group */}
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white flex-shrink-0">
            {([
              ["G1","Youth",<svg key="g1" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-1 1a5 5 0 00-5 5v1h12v-1a5 5 0 00-5-5h-2z"/></svg>],
              ["G2","High School",<svg key="g2" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5 8.26V14a1 1 0 00.553.894l4 2a1 1 0 00.894 0l4-2A1 1 0 0015 14V8.26l2.606-1.116a1 1 0 000-1.79l-7-3zM10 14.618L6 12.618V9.47l4 1.714 4-1.714v3.148l-4 2z"/></svg>],
              ["G3","Undergraduate",<svg key="g3" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 100 1.84l7 3 7-3a1 1 0 000-1.84l-7-3zM3 10.414V15a1 1 0 001 1h12a1 1 0 001-1v-4.586l-6 2.572-7-2.572z"/></svg>],
              ["G4","General Public",<svg key="g4" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z"/></svg>],
            ] as [LearnerGroupFilter, string, React.ReactNode][]).map(([val, label, icon]) => (
              <button key={val} type="button"
                onClick={() => setLearnerGroupFilter(val === learnerGroupFilter ? "" : val)}
                title={label}
                className={`inline-flex w-10 h-10 items-center justify-center border-r border-[#FED7AA] last:border-r-0 ${learnerGroupFilter === val ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                {icon}
              </button>
            ))}
          </div>
          {/* Level */}
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white flex-shrink-0">
            {(["L1","L2","L3","L4"] as LevelFilter[]).map((val) => (
              <button key={val} type="button" onClick={() => setLevelFilter(val === levelFilter ? "" : val)}
                title={val} className={`w-10 h-10 text-sm font-bold border-r border-[#FED7AA] last:border-r-0 ${levelFilter === val ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                {val.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {filteredClasses.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No classes match the current filters.
          </div>
        ) : (
          <div className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden divide-y divide-[#FED7AA]">
            {filteredClasses.map((item) => {
              const isEditing = editingClassId === item.class_id;
              const assignmentItems = getDraftContentSets(item, "assignment");
              const labItems = getDraftContentSets(item, "lab");
              const examItems = getDraftContentSets(item, "exam");
              const assignmentMenuId = getContentMenuId(item.class_id, "assignment");
              const labMenuId = getContentMenuId(item.class_id, "lab");
              const examMenuId = getContentMenuId(item.class_id, "exam");
              return (
              <article key={item.class_id}>
                {/* â”€â”€ Single-row summary â”€â”€ */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Class Code */}
                  <span className="font-mono text-sm font-bold text-[#F37021] w-36 shrink-0 truncate">{item.class_code}</span>
                  {/* Class Name */}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-[#0F172A] truncate">{item.class_name}</span>
                  {/* Academic Year */}
                  <span className="text-sm text-[#64748B] w-12 text-center shrink-0">{item.academic_year ?? "—"}</span>
                  {/* Learner Group icon */}
                  <span className="w-6 flex justify-center shrink-0 text-[#64748B]" title={LEARNER_GROUP_LABELS[item.learner_group ?? ""] ?? "—"}>
                    {item.learner_group ? LEARNER_GROUP_ICONS[item.learner_group] : <span className="text-xs">—</span>}
                  </span>
                  {/* Class Level */}
                  <span className="w-6 text-center text-sm font-bold text-[#64748B] shrink-0">{item.class_level ? item.class_level.slice(1) : "—"}</span>
                  {/* Content Counts */}
                  <div className="hidden sm:flex items-center gap-2.5 shrink-0 text-xs font-semibold text-[#64748B]">
                    <span className="inline-flex items-center gap-1" title="Students">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-[#64748B]"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
                      {item.student_count}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Assignment sets">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-[#F37021]"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
                      {item.assignment_count}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Lab sets">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#F37021]"><path d="M9 3h6M9 3v6l-4 8a2 2 0 001.8 2.9h10.4A2 2 0 0019 17l-4-8V3"/><line x1="6.8" y1="15" x2="17.2" y2="15"/></svg>
                      {item.lab_count}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Exam sets">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-[#F37021]"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>
                      {item.exam_count}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <DuplicateButton item={item} />
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => router.push(`/teacher/classes/${item.class_id}`)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] hover:bg-[#C2410C] text-white"
                    >
                      <PencilIcon />
                    </button>
                    <ClassActiveSwitch
                      active={item.is_active}
                      disabled={updatingId === item.class_id}
                      onToggle={(nextActive) => toggleClassStatus(item.class_id, nextActive)}
                    />
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </main>
      {addModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">{getContentFamilyLabel(addModalFamily)}</h2>
                <p className="mt-1 text-sm text-[#64748B]">Select {getContentFamilyLabel(addModalFamily).toLowerCase()} to add to {addModalClass.class_code}.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalClass(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]"
              >
                x
              </button>
            </div>

            <input
              value={modalQuery}
              onChange={(event) => setModalQuery(event.target.value)}
              placeholder="Search by assignment set code or name"
              className="mb-4 w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {modalLoading ? (
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                  Loading assignment sets...
                </div>
              ) : filteredAvailableSets.length === 0 ? (
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                  No assignment sets available to add.
                </div>
              ) : (
                filteredAvailableSets.map((set) => {
                  const hasAssignments = Number(set.task_count ?? 0) > 0;
                  const selected = selectedSetIds.includes(set.batch_id);
                  return (
                    <label
                      key={set.batch_id}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                        selected
                          ? "border-[#F37021] bg-[#FFF7ED]"
                          : "border-[#FED7AA] bg-white"
                      } ${hasAssignments ? "cursor-pointer hover:bg-[#FFF7ED]" : "cursor-not-allowed opacity-60"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!hasAssignments}
                      onChange={() => toggleSelectedSet(set.batch_id)}
                        className="h-4 w-4 shrink-0 accent-[#F37021]"
                      />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm text-[#0F172A]">
                          <span className="font-mono text-xs font-bold text-[#F37021]">{set.batch_code ?? "-"}</span>
                          <span className="mx-2 text-[#CBD5E1]">|</span>
                          <span className="font-semibold">{set.batch_name ?? "Untitled set"}</span>
                        </p>
                        <span className="shrink-0 text-xs font-semibold capitalize text-[#92400E]">
                          {hasAssignments ? set.status ?? "draft" : "No assignments"}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {actionError && <p className="mt-4 text-sm text-red-600">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                aria-label={selectedAvailableSetIds.length > 0 ? `Add ${selectedAvailableSetIds.length} assignment sets` : "Add assignment sets"}
                title={selectedAvailableSetIds.length > 0 ? `Add (${selectedAvailableSetIds.length})` : "Add"}
                onClick={addSetToDraft}
                disabled={selectedAvailableSetIds.length === 0 || modalLoading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
              >
                <span className="text-lg font-bold leading-none">+</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function getContentMenuId(classId: string, family: ContentFamily) {
  return `${classId}:${family}`;
}

function getContentFamilyLabel(family: ContentFamily) {
  if (family === "lab") return "Lab Set";
  if (family === "exam") return "Exam Sets";
  return "Assignment Sets";
}

function compareContentItem(a: ContentItem, b: ContentItem) {
  return String(a.batch_code ?? a.batch_name ?? "").localeCompare(String(b.batch_code ?? b.batch_name ?? ""));
}

const LEARNER_GROUP_LABELS: Record<string, string> = {
  G1: "G1 Â· Youth", G2: "G2 Â· High School", G3: "G3 Â· Undergraduate", G4: "G4 Â· General Public",
};
const CLASS_LEVEL_LABELS: Record<string, string> = {
  L1: "L1 Â· Beginner", L2: "L2 Â· Foundation", L3: "L3 Â· Intermediate", L4: "L4 Â· Advanced",
};
const LEARNER_GROUP_ICONS: Record<string, React.ReactNode> = {
  G1: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-1 1a5 5 0 00-5 5v1h12v-1a5 5 0 00-5-5h-2z"/></svg>,
  G2: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5 8.26V14a1 1 0 00.553.894l4 2a1 1 0 00.894 0l4-2A1 1 0 0015 14V8.26l2.606-1.116a1 1 0 000-1.79l-7-3zM10 14.618L6 12.618V9.47l4 1.714 4-1.714v3.148l-4 2z"/></svg>,
  G3: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 100 1.84l7 3 7-3a1 1 0 000-1.84l-7-3zM3 10.414V15a1 1 0 001 1h12a1 1 0 001-1v-4.586l-6 2.572-7-2.572z"/></svg>,
  G4: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z"/></svg>,
};

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function ClassFields({
  classItem,
  draft,
  editing,
  onChange,
}: {
  classItem: TeacherClass;
  draft: ClassDraft | null;
  editing: boolean;
  onChange: (field: keyof ClassDraft, value: string) => void;
}) {
  const values = draft ?? {
    class_name: classItem.class_name ?? "",
    term: classItem.term ?? "",
    register_from: toLocalDatetime(classItem.register_from),
    register_to: toLocalDatetime(classItem.register_to),
  };

  return (
    <div className="space-y-3">
      {/* Row 1: Class Code (readonly) + Class Name (editable) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReadOnlyField label="Class Code" value={classItem.class_code} mono />
        <EditableField
          label="Class Name"
          value={values.class_name}
          editing={editing}
          onChange={(value) => onChange("class_name", value)}
        />
      </div>
      {/* Row 2: Year (readonly) + Term (editable) + Group (readonly) + Level (readonly) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ReadOnlyField label="Academic Year" value={classItem.academic_year ?? "—"} />
        <EditableField
          label="Term"
          value={values.term}
          editing={editing}
          onChange={(value) => onChange("term", value)}
        />
        <ReadOnlyField label="Learner Group" value={classItem.learner_group ? (LEARNER_GROUP_LABELS[classItem.learner_group] ?? classItem.learner_group) : "—"} />
        <ReadOnlyField label="Class Level" value={classItem.class_level ? (CLASS_LEVEL_LABELS[classItem.class_level] ?? classItem.class_level) : "—"} />
      </div>
      {/* Row 3: Register From + Register To (editable) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EditableDatetimeField
          label="Register From"
          value={values.register_from}
          editing={editing}
          onChange={(value) => onChange("register_from", value)}
        />
        <EditableDatetimeField
          label="Register To"
          value={values.register_to}
          editing={editing}
          onChange={(value) => onChange("register_to", value)}
        />
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      <input
        value={value}
        disabled
        className={`w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm text-[#0F172A] ${mono ? "font-mono font-bold text-[#F37021]" : ""}`}
      />
    </label>
  );
}

function EditableField({
  label,
  value,
  editing,
  className = "",
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      <input
        value={value}
        disabled={!editing}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] text-sm text-[#0F172A] ${
          editing
            ? "bg-[#FFF7ED] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            : "bg-[#F8FAFC]"
        }`}
      />
    </label>
  );
}

function EditableDatetimeField({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">{label}</span>
      <input
        type={editing ? "date" : "text"}
        value={editing ? value.slice(0, 10) : (value ? formatDateDisplay(value) : "—")}
        disabled={!editing}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] text-sm text-[#0F172A] ${
          editing
            ? "bg-[#FFF7ED] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            : "bg-[#F8FAFC]"
        }`}
      />
    </label>
  );
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function DuplicateButton({ item }: { item: TeacherClass }) {
  const router = useRouter();
  function handleDuplicate() {
    const params = new URLSearchParams();
    if (item.class_name) params.set("name", item.class_name);
    if (item.learner_group) params.set("group", item.learner_group);
    if (item.class_level) params.set("level", item.class_level);
    if (item.academic_year) params.set("year", item.academic_year);
    if (item.term) params.set("term", item.term);
    if (item.register_from) params.set("from_date", item.register_from.slice(0, 10));
    if (item.register_to) params.set("to_date", item.register_to.slice(0, 10));
    router.push(`/teacher/classes/new?${params.toString()}`);
  }
  return (
    <button
      type="button"
      title="Duplicate to new class"
      onClick={handleDuplicate}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#64748B] hover:border-[#F37021] hover:text-[#F37021] transition-colors"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
      {children}
    </span>
  );
}

function ClassActiveSwitch({
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
        aria-label="Toggle class active status"
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

function ContentMenu({
  title,
  count,
  items,
  menuId,
  open,
  editable,
  saving = false,
  onToggle,
  onAdd,
  onEdit,
  onSave,
  onCancel,
  onRemove,
}: {
  title: string;
  count: number;
  items: ContentItem[];
  menuId: string;
  open: boolean;
  editable: boolean;
  saving?: boolean;
  onToggle: (menuId: string) => void;
  onAdd?: () => void;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onRemove?: (batchId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED]">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onToggle(menuId)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021]">
            <ChevronIcon open={open} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#0F172A]">{title}</span>
            <span className="block text-xs font-semibold text-[#64748B]">{count} linked sets</span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          {onAdd && !editable && (
            <button
              type="button"
              aria-label={`Add ${title}`}
              title="Add"
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F37021] text-base font-bold leading-none text-white hover:bg-[#C2410C]"
            >
              +
            </button>
          )}
          {onEdit && !editable && (
            <button
              type="button"
              aria-label={`Edit ${title}`}
              title="Edit"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED]"
            >
              <PencilIcon />
            </button>
          )}
          {editable && (
            <>
              <button
                type="button"
                aria-label={`Save ${title}`}
                title="Save"
                disabled={saving}
                onClick={(event) => {
                  event.stopPropagation();
                  onSave?.();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C] disabled:opacity-50"
              >
                <SaveIcon />
              </button>
              <button
                type="button"
                aria-label={`Cancel ${title}`}
                title="Cancel"
                disabled={saving}
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel?.();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED] disabled:opacity-50"
              >
                <XIcon />
              </button>
            </>
          )}
        </span>
      </div>
      {open && (
        <div className="border-t border-[#FED7AA] px-4 py-3 space-y-2">
          {items.length === 0 ? (
            <div className="rounded-lg bg-white px-3 py-2 text-sm text-[#64748B]">
              No sets linked to this class.
            </div>
          ) : (
            items.map((item) => (
              <div key={item.batch_id} className="rounded-lg bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-sm text-[#0F172A]">
                  <p className="min-w-0 truncate">
                    <span className="font-mono text-xs font-bold text-[#F37021]">{item.batch_code ?? "-"}</span>
                    <span className="mx-2 text-[#CBD5E1]">|</span>
                    <span className="font-semibold">{item.batch_name ?? "Untitled set"}</span>
                  </p>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-semibold text-[#92400E] capitalize">{item.status ?? "draft"}</span>
                    {editable && onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(item.batch_id)}
                        aria-label="Remove assignment set from class"
                        title="Remove"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 text-base font-bold leading-none text-red-600 hover:bg-red-50"
                      >
                        -
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function safeJsonParse(text: string): { error?: string; classes?: TeacherClass[]; assignment_sets?: AvailableSet[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

