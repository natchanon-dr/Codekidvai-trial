"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type StatusFilter = "active" | "inactive" | "all";
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
    </div>
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}


const LEARNER_GROUP_LABELS: Record<string, string> = {
  G1: "G1 Â· Youth", G2: "G2 Â· High School", G3: "G3 Â· Undergraduate", G4: "G4 Â· General Public",
};
const LEARNER_GROUP_ICONS: Record<string, React.ReactNode> = {
  G1: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-1 1a5 5 0 00-5 5v1h12v-1a5 5 0 00-5-5h-2z"/></svg>,
  G2: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5 8.26V14a1 1 0 00.553.894l4 2a1 1 0 00.894 0l4-2A1 1 0 0015 14V8.26l2.606-1.116a1 1 0 000-1.79l-7-3zM10 14.618L6 12.618V9.47l4 1.714 4-1.714v3.148l-4 2z"/></svg>,
  G3: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 100 1.84l7 3 7-3a1 1 0 000-1.84l-7-3zM3 10.414V15a1 1 0 001 1h12a1 1 0 001-1v-4.586l-6 2.572-7-2.572z"/></svg>,
  G4: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z"/></svg>,
};


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

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function safeJsonParse(text: string): { error?: string; classes?: TeacherClass[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

