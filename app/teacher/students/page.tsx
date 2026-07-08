"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type StudentItem = {
  profile_id: string;
  joined_at: string | null;
  student: {
    participant_code: string | null;
    display_name: string | null;
    grade_level: string | null;
    student_status: string | null;
    academy_member_id?: string | null;
  } | null;
  progress: {
    lab_done: number;
    assignment_score: number;
    exam_score: number;
    submission_count: number;
    feedback: string;
    assignment_records: AssignmentRecord[];
  };
};

type AssignmentRecord = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  assigned_order: number | null;
  score: number;
  max_score: number | null;
};

type ClassGroup = {
  class_id: string;
  class_code: string;
  class_name: string;
  students: StudentItem[];
};

type StudentsResponse = {
  error?: string;
  classes?: ClassGroup[];
};

type SortKey = "participant_code" | "display_name" | "assignment_score" | "exam_score";
type SortDirection = "asc" | "desc";
type FeedbackModal = {
  classId: string;
  profileIds: string[];
  title: string;
};

type ScoreModal = {
  classItem: ClassGroup;
  student: StudentItem;
};

const FEEDBACK_STORAGE_KEY = "teacher-student-feedback";

export default function TeacherStudentsPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("participant_code");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [multiFeedbackClassId, setMultiFeedbackClassId] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [teacherFeedback, setTeacherFeedback] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    const saved = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!saved) return {};
    try {
      return JSON.parse(saved) as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModal | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [scoreModal, setScoreModal] = useState<ScoreModal | null>(null);

  useEffect(() => {
    async function loadStudents() {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/students", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load students.");
        setLoading(false);
        return;
      }

      setClasses(json.classes ?? []);
      setLoading(false);
    }

    loadStudents();
  }, [router]);

  useEffect(() => {
    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(teacherFeedback));
  }, [teacherFeedback]);

  const filteredClasses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return classes
      .map((classItem) => ({
        ...classItem,
        students: sortStudents(
          classItem.students.filter((item) => {
            const haystack = `${item.student?.display_name ?? ""} ${item.student?.academy_member_id ?? ""} ${item.student?.participant_code ?? ""}`.toLowerCase();
            return !normalized || haystack.includes(normalized);
          }),
          sortKey,
          sortDirection,
        ),
      }))
      .filter((classItem) => classItem.students.length > 0);
  }, [classes, query, sortDirection, sortKey]);

  const feedbackStudents = useMemo(() => {
    if (!feedbackModal) return [];
    const classItem = classes.find((item) => item.class_id === feedbackModal.classId);
    if (!classItem) return [];
    const selectedIds = new Set(feedbackModal.profileIds);
    return classItem.students.filter((item) => selectedIds.has(item.profile_id));
  }, [classes, feedbackModal]);

  const scoreModalGroups = useMemo(() => {
    if (!scoreModal) return [];
    return groupAssignmentRecordsBySet(scoreModal.student.progress.assignment_records);
  }, [scoreModal]);

  function toggleClass(classId: string) {
    setExpandedClassIds((current) => {
      const next = new Set(current);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function feedbackKey(classId: string, profileId: string) {
    return `${classId}:${profileId}`;
  }

  function toggleStudentSelection(profileId: string) {
    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  function handleClassFeedback(classItem: ClassGroup) {
    if (multiFeedbackClassId !== classItem.class_id) {
      setMultiFeedbackClassId(classItem.class_id);
      setSelectedStudentIds(new Set());
      setExpandedClassIds((current) => new Set(current).add(classItem.class_id));
      return;
    }

    if (selectedStudentIds.size === 0) return;
    setFeedbackModal({
      classId: classItem.class_id,
      profileIds: [...selectedStudentIds],
      title: `Feedback (${selectedStudentIds.size})`,
    });
    setFeedbackText("");
  }

  function openStudentFeedback(classId: string, student: StudentItem) {
    const key = feedbackKey(classId, student.profile_id);
    setFeedbackModal({
      classId,
      profileIds: [student.profile_id],
      title: student.student?.display_name ?? student.student?.participant_code ?? "Student Feedback",
    });
    setFeedbackText(teacherFeedback[key] ?? "");
  }

  function saveFeedback() {
    if (!feedbackModal) return;
    setTeacherFeedback((current) => {
      const next = { ...current };
      for (const profileId of feedbackModal.profileIds) {
        next[feedbackKey(feedbackModal.classId, profileId)] = feedbackText;
      }
      return next;
    });
    setFeedbackModal(null);
    setFeedbackText("");
    setSelectedStudentIds(new Set());
    setMultiFeedbackClassId(null);
  }

  function exportClassStudents(classItem: ClassGroup) {
    const rows = [
      ["Student Code", "Student Name", "Labs", "Assignment Score", "Exam Score", "System Feedback", "Teacher Feedback"],
      ...sortStudents(classItem.students, sortKey, sortDirection).map((item) => [
        item.student?.participant_code ?? "",
        item.student?.display_name ?? "",
        String(item.progress.lab_done),
        String(item.progress.assignment_score),
        String(item.progress.exam_score),
        item.progress.feedback,
        teacherFeedback[feedbackKey(classItem.class_id, item.profile_id)] ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${classItem.class_code}-students.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading students...</div>;
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
          <span className="text-xs font-semibold text-[#F37021]">Students Management</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Students</h1>
            <p className="text-sm text-[#64748B] mt-1">Active students grouped by classes owned by this teacher.</p>
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by student name or code"
            className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
        </section>

        {filteredClasses.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No active class students match the current search.
          </div>
        ) : (
          <div className="space-y-5">
            {filteredClasses.map((classItem) => (
              <section key={classItem.class_id} className="bg-white border border-[#FED7AA] rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    aria-expanded={expandedClassIds.has(classItem.class_id)}
                    onClick={() => toggleClass(classItem.class_id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#F37021]">
                      <ChevronIcon open={expandedClassIds.has(classItem.class_id)} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-[#0F172A]">{classItem.class_name}</span>
                        <span className="font-mono text-xs font-bold text-[#F37021]">{classItem.class_code}</span>
                      </span>
                      <span className="mt-1 block text-sm text-[#64748B]">
                        {classItem.students.length} active students
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleClassFeedback(classItem)}
                      className="px-4 py-2 rounded-xl bg-[#F37021] text-sm font-semibold text-white hover:bg-[#C2410C]"
                    >
                      {multiFeedbackClassId === classItem.class_id ? "Feedback" : "Select"}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportClassStudents(classItem)}
                      className="px-4 py-2 rounded-xl border border-[#F37021] bg-white text-sm font-semibold text-[#F37021] hover:bg-[#FFF7ED]"
                    >
                      Export
                    </button>
                  </div>
                </div>

                {expandedClassIds.has(classItem.class_id) && (
                  <div className="mt-4 border-t border-[#FED7AA] pt-4">
                    {classItem.students.length === 0 ? (
                      <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                        No active students in this class.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-[#FED7AA] text-xs font-semibold text-[#64748B]">
                              {multiFeedbackClassId === classItem.class_id && <th className="py-3 pr-4 w-10" />}
                              <th className="py-3 pr-4">
                                <SortButton label="Academy ID" sortKey="participant_code" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                              </th>
                              <th className="py-3 pr-4">
                                <SortButton label="Student Name" sortKey="display_name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                              </th>
                              <th className="py-3 px-3 text-center">Labs</th>
                              <th className="py-3 px-3 text-center">
                                <span className="inline-flex justify-center">
                                  <SortButton label="Assignment Score" sortKey="assignment_score" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                                </span>
                              </th>
                              <th className="py-3 px-3 text-center">
                                <span className="inline-flex justify-center">
                                  <SortButton label="Exam Score" sortKey="exam_score" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                                </span>
                              </th>
                              <th className="py-3 pr-4">System Feedback</th>
                              <th className="py-3 pr-4">Teacher Feedback</th>
                              <th className="py-3 pr-4 w-12" />
                            </tr>
                          </thead>
                          <tbody>
                            {classItem.students.map((item) => (
                              <tr key={`${classItem.class_id}-${item.profile_id}`} className="border-b border-[#FED7AA]/70 last:border-0">
                                {multiFeedbackClassId === classItem.class_id && (
                                  <td className="py-3 pr-4">
                                    <input
                                      type="checkbox"
                                      checked={selectedStudentIds.has(item.profile_id)}
                                      onChange={() => toggleStudentSelection(item.profile_id)}
                                      className="h-4 w-4 accent-[#F37021]"
                                    />
                                  </td>
                                )}
                                <td className="py-3 pr-4">
                                  <p className="font-mono text-xs font-bold text-[#F37021]">{item.student?.academy_member_id ?? item.student?.participant_code ?? "-"}</p>
                                </td>
                                <td className="py-3 pr-4">
                                  <p className="font-semibold text-[#0F172A]">{item.student?.display_name ?? "Unknown student"}</p>
                                </td>
                                <td className="py-3 px-3 text-center font-semibold text-[#0F172A]">{item.progress.lab_done}</td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setScoreModal({ classItem, student: item })}
                                    className="font-semibold text-[#F37021] underline-offset-2 hover:underline"
                                  >
                                    {item.progress.assignment_score}
                                  </button>
                                </td>
                                <td className="py-3 px-3 text-center font-semibold text-[#0F172A]">{item.progress.exam_score}</td>
                                <td className="py-3 pr-4 text-[#64748B]">{item.progress.feedback}</td>
                                <td className="py-3 pr-4 text-[#64748B]">
                                  {teacherFeedback[feedbackKey(classItem.class_id, item.profile_id)] || "-"}
                                </td>
                                <td className="py-3 pr-4">
                                  <button
                                    type="button"
                                    onClick={() => openStudentFeedback(classItem.class_id, item)}
                                    aria-label="Student feedback"
                                    title="Feedback"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]"
                                  >
                                    <FeedbackIcon />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">Teacher Feedback</h2>
                <p className="mt-1 text-sm text-[#64748B]">{feedbackModal.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackModal(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]"
              >
                x
              </button>
            </div>
            <div className="mb-4 space-y-2">
              {feedbackStudents.map((item) => (
                <div key={item.profile_id} className="flex items-center justify-between gap-3 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2">
                  <p className="min-w-0 truncate text-sm text-[#0F172A]">
                    <span className="font-mono text-xs font-bold text-[#F37021]">{item.student?.academy_member_id ?? item.student?.participant_code ?? "-"}</span>
                    <span className="mx-2 text-[#CBD5E1]">|</span>
                    <span className="font-semibold">{item.student?.display_name ?? "Unknown student"}</span>
                  </p>
                </div>
              ))}
            </div>
            <textarea
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              rows={6}
              className="w-full resize-none rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFeedbackModal(null)}
                className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveFeedback}
                className="px-4 py-2 rounded-xl bg-[#F37021] text-sm font-semibold text-white hover:bg-[#C2410C]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {scoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">Assignment Score by Set</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  <span className="font-mono font-semibold text-[#F37021]">{scoreModal.student.student?.academy_member_id ?? scoreModal.student.student?.participant_code ?? "-"}</span>
                  <span className="mx-2 text-[#CBD5E1]">|</span>
                  {scoreModal.student.student?.display_name ?? "Unknown student"}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  {scoreModal.classItem.class_code} | Total Score {scoreModal.student.progress.assignment_score}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScoreModal(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]"
              >
                x
              </button>
            </div>
            {scoreModal.student.progress.assignment_records.length === 0 ? (
              <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                No assignment records.
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto pr-1">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#FED7AA] text-xs font-semibold text-[#64748B]">
                      <th className="py-3 pr-4">Assignment Set</th>
                      <th className="py-3 px-3 text-center">Assignments</th>
                      <th className="py-3 px-3 text-center">Set Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreModalGroups.map((group) => (
                      <tr key={group.batch_id} className="border-b border-[#FED7AA]/70 last:border-0">
                        <td className="py-3 pr-4">
                          <p className="font-mono text-xs font-bold text-[#F37021]">{group.batch_code ?? "-"}</p>
                          <p className="font-semibold text-[#0F172A]">{group.batch_name ?? "Untitled set"}</p>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-[#0F172A]">{group.records.length}</td>
                        <td className="py-3 px-3 text-center font-semibold text-[#F37021]">{group.totalScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

function SortButton({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-semibold hover:text-[#F37021]">
      {label}
      <span className="text-[10px] text-[#F37021]">{active ? (direction === "asc" ? "▲" : "▼") : ""}</span>
    </button>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function sortStudents(students: StudentItem[], sortKey: SortKey, direction: SortDirection) {
  const sorted = [...students].sort((a, b) => {
    const multiplier = direction === "asc" ? 1 : -1;
    if (sortKey === "assignment_score") {
      return (a.progress.assignment_score - b.progress.assignment_score) * multiplier;
    }
    if (sortKey === "exam_score") {
      return (a.progress.exam_score - b.progress.exam_score) * multiplier;
    }
    const aValue = sortKey === "participant_code" ? a.student?.participant_code ?? "" : a.student?.display_name ?? "";
    const bValue = sortKey === "participant_code" ? b.student?.participant_code ?? "" : b.student?.display_name ?? "";
    return aValue.localeCompare(bValue) * multiplier;
  });
  return sorted;
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function groupAssignmentRecordsBySet(records: AssignmentRecord[]) {
  const groups = new Map<string, {
    batch_id: string;
    batch_code: string | null;
    batch_name: string | null;
    totalScore: number;
    records: AssignmentRecord[];
  }>();

  for (const record of records) {
    const group = groups.get(record.batch_id) ?? {
      batch_id: record.batch_id,
      batch_code: record.batch_code,
      batch_name: record.batch_name,
      totalScore: 0,
      records: [],
    };
    group.totalScore += Number(record.score ?? 0);
    group.records.push(record);
    groups.set(record.batch_id, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    records: group.records.sort((a, b) => Number(a.assigned_order ?? 0) - Number(b.assigned_order ?? 0)),
  }));
}

function safeJsonParse(text: string): StudentsResponse {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
