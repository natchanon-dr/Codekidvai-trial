"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type TypeFilter = "all" | "qt" | "qb" | "er" | "sp";

type ExamItem = {
  assignment_id: string;
  task_code: string | null;
  title: string | null;
  description: string | null;
  max_score: number | null;
  status: string | null;
  is_active: boolean | null;
  owner: { display_name: string | null; participant_code: string | null } | null;
};

type ExamSetItem = {
  batch_code: string | null;
};

type TeacherProfile = {
  participant_code: string | null;
};

export default function NewExamSetPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [examSets, setExamSets] = useState<ExamSetItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [teacherOwnerKey, setTeacherOwnerKey] = useState<string | null>(null);
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadExams() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const [response, setsResponse, dashboardResponse] = await Promise.all([
        fetch("/api/teacher/assignments?scope=all&family=exam", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/teacher/assignmentsets?scope=all&family=exam", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/teacher/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setErrorMessage(json.error ?? text ?? "Failed to load exams.");
        return;
      }

      const loadedExams = (json.assignments ?? []).filter(isActiveExam);
      setExams(loadedExams);

      const dashboardText = await dashboardResponse.text();
      const dashboardJson = dashboardText ? safeJsonParse(dashboardText) : {};
      const teacherKey = dashboardResponse.ok ? (dashboardJson.profile as TeacherProfile | undefined)?.participant_code ?? null : null;
      if (teacherKey) {
        const hasTeacherExams = loadedExams.some((exam) => {
          const ownerKey = exam.owner?.participant_code ?? exam.owner?.display_name ?? "Unknown";
          return ownerKey === teacherKey;
        });
        setTeacherOwnerKey(hasTeacherExams ? teacherKey : null);
        setOwnerFilter(hasTeacherExams ? teacherKey : "all");
      }

      const setsText = await setsResponse.text();
      const setsJson = setsText ? safeJsonParse(setsText) : {};
      if (setsResponse.ok) setExamSets(setsJson.assignment_sets ?? []);
    }

    loadExams();
  }, [router]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const exam of exams) {
      const key = exam.owner?.participant_code ?? exam.owner?.display_name ?? "Unknown";
      const label = exam.owner?.display_name ?? exam.owner?.participant_code ?? "Unknown";
      map.set(key, label);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [exams]);

  const filteredExams = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return exams.filter((exam) => {
      const ownerKey = exam.owner?.participant_code ?? exam.owner?.display_name ?? "Unknown";
      const haystack = `${exam.task_code ?? ""} ${exam.title ?? ""}`.toLowerCase();
      return matchesExamType(exam.task_code, typeFilter) && (ownerFilter === "all" || ownerFilter === ownerKey) && (!normalized || haystack.includes(normalized));
    });
  }, [exams, query, ownerFilter, typeFilter]);

  const nextExamSetCode = useMemo(() => {
    const year = String(new Date().getFullYear()).slice(-2);
    const prefix = `SX${year}`;
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const numbers = examSets
      .map((set) => set.batch_code?.match(pattern)?.[1])
      .filter(Boolean)
      .map((value) => Number(value));
    const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `${prefix}${String(nextNumber).padStart(4, "0")}`;
  }, [examSets]);

  function toggleSelected(examId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(examId)) next.delete(examId);
      else next.add(examId);
      return next;
    });
  }

  async function createExamSet() {
    const name = setName.trim();
    if (!name || saving) return;

    setSaving(true);
    setErrorMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch("/api/teacher/assignmentsets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        family: "exam",
        batch_code: nextExamSetCode,
        batch_name: name,
        batch_description: setDescription,
        status: "active",
        selected_task_ids: [...selectedIds],
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to create exam set.");
      setSaving(false);
      return;
    }

    router.push("/teacher/exams");
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/exams" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Exam Sets
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">New Exam Set</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">New Exam Set</h1>
            <p className="text-sm text-[#64748B] mt-1">Select exams across all types before creating a new exam set.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => setUploadFileName(event.target.files?.[0]?.name ?? null)}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-xl border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED] text-sm font-semibold">
              Upload
            </button>
            <Link href="/api/teacher/assignmentsets/template" className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold">
              Template
            </Link>
            {uploadFileName && <span className="basis-full sm:basis-auto text-xs text-[#64748B]">{uploadFileName}</span>}
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by exam code or name"
            className="lg:col-span-2 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          >
            <option value="all">All teachers</option>
            {teacherOwnerKey && <option value={teacherOwnerKey}>My exams</option>}
            {owners.map((owner) => (
              owner.value === teacherOwnerKey ? null : <option key={owner.value} value={owner.value}>{owner.label}</option>
            ))}
          </select>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input
              value={nextExamSetCode}
              readOnly
              aria-label="Exam set code"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021] cursor-not-allowed"
            />
            <input
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              placeholder="Exam Set Name"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
          </div>
          <textarea
            value={setDescription}
            onChange={(event) => setSetDescription(event.target.value)}
            placeholder="Exam Set Description"
            rows={3}
            className="w-full mb-5 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm resize-none"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <p className="text-sm font-semibold text-[#0F172A]">
              Selected Exams: <span className="text-[#F37021]">{selectedIds.size}</span>
            </p>
            <TypeFilterButtons value={typeFilter} onChange={setTypeFilter} />
          </div>

          <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
            {filteredExams.length === 0 ? (
              <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                No active exams match the current filters.
              </div>
            ) : (
              filteredExams.map((exam) => (
                <div key={exam.assignment_id} className="flex items-start gap-3 border border-[#FED7AA] rounded-xl px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(exam.assignment_id)}
                    onChange={() => toggleSelected(exam.assignment_id)}
                    className="mt-1 h-4 w-4 accent-[#F37021]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-bold text-[#F37021]">{exam.task_code ?? "-"}</p>
                    <p className="text-sm font-semibold text-[#0F172A]">{exam.title ?? "Untitled exam"}</p>
                    <p className="text-xs text-[#64748B]">Owner: {exam.owner?.display_name ?? exam.owner?.participant_code ?? "Unknown"}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#64748B]">Score {exam.max_score ?? 10}</span>
                </div>
              ))
            )}
          </div>

          <button
            onClick={createExamSet}
            disabled={!setName.trim() || saving}
            className="mt-5 px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
          >
            {saving ? "Creating..." : "Create Exam Set"}
          </button>
        </section>
      </main>
    </div>
  );
}

function TypeFilterButtons({ value, onChange }: { value: TypeFilter; onChange: (value: TypeFilter) => void }) {
  return (
    <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
      {(["qt", "qb", "er", "sp", "all"] as TypeFilter[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          aria-label={`Filter ${type}`}
          title={type}
          className={`inline-flex h-10 w-12 items-center justify-center text-sm font-semibold uppercase ${value === type ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
        >
          {type === "all" ? "ALL" : <TypeFilterIcon type={type} />}
        </button>
      ))}
    </div>
  );
}

function TypeFilterIcon({ type }: { type: Exclude<TypeFilter, "all"> }) {
  const iconClass = "h-4 w-4";
  if (type === "qb") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 3h3v3a2 2 0 1 0 4 0V3h3A2.5 2.5 0 0 1 21 5.5v3h-3a2 2 0 1 0 0 4h3v3A2.5 2.5 0 0 1 18.5 18h-3v-3a2 2 0 1 0-4 0v3h-3A2.5 2.5 0 0 1 6 15.5v-3H3a2 2 0 1 1 0-4h3v-3A2.5 2.5 0 0 1 8.5 3Z" /></svg>;
  if (type === "er") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" /><path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" /><path d="M6.5 9v5a3 3 0 0 0 3 3H14" /></svg>;
  if (type === "sp") return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h10" /><path d="M9 4v16" /><path d="M15 4v16" /><path d="M7 20h10" /></svg>;
}

function matchesExamType(code: string | null, type: TypeFilter) {
  if (type === "all") return true;
  const normalized = String(code ?? "").toUpperCase();
  const prefixes: Record<Exclude<TypeFilter, "all">, string[]> = {
    qt: ["XQT"],
    qb: ["XQB"],
    er: ["XER"],
    sp: ["XSP"],
  };
  return prefixes[type].some((prefix) => normalized.startsWith(prefix));
}

function isActiveExam(exam: ExamItem) {
  return Boolean(exam.is_active) && exam.status !== "archived";
}

function safeJsonParse(text: string): { error?: string; assignments?: ExamItem[]; assignment_sets?: ExamSetItem[]; profile?: TeacherProfile } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
