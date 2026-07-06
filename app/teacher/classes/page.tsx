"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type StatusFilter = "active" | "inactive" | "all";
type ContentFamily = "assignment" | "lab" | "exam";

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
  class_level: string | null;
  class_section: string | null;
  academic_year: string | null;
  term: string | null;
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
  class_level: string;
  class_section: string;
  academic_year: string;
  term: string;
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
      const haystack = `${item.class_code} ${item.class_name} ${item.class_level ?? ""} ${item.class_section ?? ""}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [classes, query, statusFilter]);

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
      class_level: classItem.class_level ?? "",
      class_section: classItem.class_section ?? "",
      academic_year: classItem.academic_year ?? "",
      term: classItem.term ?? "",
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
          class_level: classDraft.class_level || null,
          class_section: classDraft.class_section || null,
          academic_year: classDraft.academic_year || null,
          term: classDraft.term || null,
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

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by class code or name"
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            {(["active", "inactive", "all"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 text-sm font-semibold capitalize ${statusFilter === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        {filteredClasses.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No classes match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredClasses.map((item) => {
              const assignmentItems = getDraftContentSets(item, "assignment");
              const labItems = getDraftContentSets(item, "lab");
              const examItems = getDraftContentSets(item, "exam");
              const assignmentMenuId = getContentMenuId(item.class_id, "assignment");
              const labMenuId = getContentMenuId(item.class_id, "lab");
              const examMenuId = getContentMenuId(item.class_id, "exam");
              return (
              <article key={item.class_id} className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge>{item.is_active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <ClassFields
                      classItem={item}
                      draft={editingClassId === item.class_id ? classDraft : null}
                      editing={editingClassId === item.class_id}
                      onChange={updateClassDraft}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Edit class"
                      title={editingClassId === item.class_id ? "Save" : "Edit"}
                      onClick={() => editingClassId === item.class_id ? saveClass(item.class_id) : startEditClass(item)}
                      disabled={savingClassId === item.class_id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] hover:bg-[#C2410C] text-white disabled:opacity-50"
                    >
                      {editingClassId === item.class_id ? <SaveIcon /> : <PencilIcon />}
                    </button>
                    <ClassActiveSwitch
                      active={item.is_active}
                      disabled={updatingId === item.class_id}
                      onToggle={(nextActive) => toggleClassStatus(item.class_id, nextActive)}
                    />
                  </div>
                </div>
                <div className="mt-5 border-t border-[#FED7AA] pt-4 space-y-2">
                  <ContentMenu
                    title="Assignment Sets"
                    count={assignmentItems.length}
                    items={assignmentItems}
                    menuId={assignmentMenuId}
                    open={expandedMenus.has(assignmentMenuId)}
                    editable={editMenus.has(assignmentMenuId)}
                    saving={savingContentMenuId === assignmentMenuId}
                    onToggle={toggleMenu}
                    onAdd={() => openAddSetModal(item, "assignment")}
                    onEdit={() => startEditContentMenu(item.class_id, "assignment")}
                    onSave={() => saveContentSetChanges(item.class_id, "assignment")}
                    onCancel={() => cancelContentSetChanges(item.class_id, "assignment")}
                    onRemove={(batchId) => removeSetFromDraft(item.class_id, "assignment", batchId)}
                  />
                  <ContentMenu
                    title="Lab Set"
                    count={labItems.length}
                    items={labItems}
                    menuId={labMenuId}
                    open={expandedMenus.has(labMenuId)}
                    editable={editMenus.has(labMenuId)}
                    saving={savingContentMenuId === labMenuId}
                    onToggle={toggleMenu}
                    onAdd={() => openAddSetModal(item, "lab")}
                    onEdit={() => startEditContentMenu(item.class_id, "lab")}
                    onSave={() => saveContentSetChanges(item.class_id, "lab")}
                    onCancel={() => cancelContentSetChanges(item.class_id, "lab")}
                    onRemove={(batchId) => removeSetFromDraft(item.class_id, "lab", batchId)}
                  />
                  <ContentMenu
                    title="Exam Sets"
                    count={examItems.length}
                    items={examItems}
                    menuId={examMenuId}
                    open={expandedMenus.has(examMenuId)}
                    editable={editMenus.has(examMenuId)}
                    saving={savingContentMenuId === examMenuId}
                    onToggle={toggleMenu}
                    onAdd={() => openAddSetModal(item, "exam")}
                    onEdit={() => startEditContentMenu(item.class_id, "exam")}
                    onSave={() => saveContentSetChanges(item.class_id, "exam")}
                    onCancel={() => cancelContentSetChanges(item.class_id, "exam")}
                    onRemove={(batchId) => removeSetFromDraft(item.class_id, "exam", batchId)}
                  />
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
    class_level: classItem.class_level ?? "",
    class_section: classItem.class_section ?? "",
    academic_year: classItem.academic_year ?? "",
    term: classItem.term ?? "",
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReadOnlyField label="Class Code" value={classItem.class_code} mono />
        <EditableField
          label="Class Name"
          value={values.class_name}
          editing={editing}
          onChange={(value) => onChange("class_name", value)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <EditableField
          label="Academic Year"
          value={values.academic_year}
          editing={editing}
          onChange={(value) => onChange("academic_year", value)}
        />
        <EditableField
          label="Term"
          value={values.term}
          editing={editing}
          onChange={(value) => onChange("term", value)}
        />
        <EditableField
          label="Level"
          value={values.class_level}
          editing={editing}
          onChange={(value) => onChange("class_level", value)}
        />
        <EditableField
          label="Section"
          value={values.class_section}
          editing={editing}
          onChange={(value) => onChange("class_section", value)}
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
