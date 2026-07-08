"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type ReviewStatus = "unsubmitted" | "submitted" | "review" | "completed";
type TaskReviewStatus = "submitted" | "reviewed" | "completed";
type SetFamily = "assignment" | "exam";
type ReviewMode = "student" | "task";
type StudentSortKey = "code" | "name" | "submitted" | "score";
type SortDirection = "asc" | "desc";
type TaskSummaryStatus = "not_start" | "in_progress" | "delivered" | "review" | "completed";

type TaskResult = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  assigned_order: number | null;
  max_score: number | null;
  submission: {
    submission_id: string;
    final_answer_text: string | null;
    auto_score: number | null;
    review_score: number | null;
    review_status: TaskReviewStatus | null;
    teacher_feedback: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    final_score: number;
    is_passed: boolean | null;
    submitted_at: string | null;
    total_run_count: number | null;
    total_attempt_count: number | null;
  } | null;
};

type ReviewStudent = {
  profile_id: string;
  student: {
    participant_code: string | null;
    display_name: string | null;
    academy_member_id?: string | null;
  } | null;
  task_count: number;
  submitted_count: number;
  total_score: number;
  max_score: number;
  status: ReviewStatus;
  tasks: TaskResult[];
};

type ReviewSet = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  student_count: number;
  task_count: number;
  submitted_students_count: number;
  completed_students_count: number;
  review_students_count: number;
  students: ReviewStudent[];
};

type ClassGroup = {
  class_id: string;
  class_code: string;
  class_name: string;
  student_count: number;
  assignment_sets: ReviewSet[];
  exam_sets: ReviewSet[];
};

type ReviewTarget = {
  classItem: ClassGroup;
  setItem: ReviewSet;
};

type TaskSummary = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  min_score: number;
  max_score: number;
  average_score: number;
  sd_score: number;
  submitted_count: number;
  status: TaskSummaryStatus;
};

type TaskReviewSnapshot = {
  statuses: Record<string, TaskReviewStatus>;
  scores: Record<string, number>;
};

const STATUS_FILTERS: Array<ReviewStatus | "all"> = ["unsubmitted", "submitted", "review", "completed", "all"];
const TASK_STATUS_FILTERS: Array<TaskSummaryStatus | "all"> = ["not_start", "in_progress", "delivered", "review", "completed", "all"];
const EDITABLE_STATUSES = new Set<ReviewStatus>(["submitted", "review", "completed"]);

export default function TeacherSubmissionReviewPage() {
  const router = useRouter();
  const [routeParams, setRouteParams] = useState<{ classId: string; family: SetFamily; batchId: string } | null>(null);
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ReviewMode>("student");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskSummaryStatus | "all">("all");
  const [studentSort, setStudentSort] = useState<{ key: StudentSortKey; direction: SortDirection }>({ key: "code", direction: "asc" });
  const [studentModal, setStudentModal] = useState<ReviewStudent | null>(null);
  const [taskModal, setTaskModal] = useState<TaskSummary | null>(null);
  const [taskStatusOverrides, setTaskStatusOverrides] = useState<Record<string, TaskReviewStatus>>({});
  const [taskScoreOverrides, setTaskScoreOverrides] = useState<Record<string, number>>({});
  const [savedTaskStatusOverrides, setSavedTaskStatusOverrides] = useState<Record<string, TaskReviewStatus>>({});
  const [savedTaskScoreOverrides, setSavedTaskScoreOverrides] = useState<Record<string, number>>({});
  const taskStatusOverridesRef = useRef<Record<string, TaskReviewStatus>>({});
  const taskScoreOverridesRef = useRef<Record<string, number>>({});
  const savedTaskStatusOverridesRef = useRef<Record<string, TaskReviewStatus>>({});
  const savedTaskScoreOverridesRef = useRef<Record<string, number>>({});
  const taskReviewSnapshotRef = useRef<TaskReviewSnapshot>({ statuses: {}, scores: {} });
  const [dirtyTaskKeys, setDirtyTaskKeys] = useState<Set<string>>(new Set());
  const [approvedStudentIds, setApprovedStudentIds] = useState<Set<string>>(new Set());
  const [approvalDraftStudentIds, setApprovalDraftStudentIds] = useState<Set<string>>(new Set());
  const [draftSavedStudentIds, setDraftSavedStudentIds] = useState<Set<string>>(new Set());
  const [deliveredTaskIds, setDeliveredTaskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadReview() {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/submissions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load review.");
        setLoading(false);
        return;
      }

      const queryParams = new URLSearchParams(window.location.search);
      const classId = queryParams.get("classId") ?? "";
      const family = queryParams.get("family") === "exam" ? "exam" : "assignment";
      const batchId = queryParams.get("batchId") ?? "";
      setRouteParams({ classId, family, batchId });

      const classItem = (json.classes ?? []).find((item) => item.class_id === classId) ?? null;
      const sets = family === "exam" ? classItem?.exam_sets ?? [] : classItem?.assignment_sets ?? [];
      const setItem = sets.find((item) => item.batch_id === batchId) ?? null;
      if (!classItem || !setItem) {
        setErrorMessage("Review set not found.");
        setLoading(false);
        return;
      }

      setTarget({ classItem, setItem });
      setLoading(false);
    }

    loadReview();
  }, [router]);

  const students = (() => {
    if (!target || mode !== "student") return [];
    const normalized = query.trim().toLowerCase();
    return target.setItem.students
      .filter((student) => {
        const status = getStudentStatus(student);
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        const haystack = `${student.student?.academy_member_id ?? ""} ${student.student?.participant_code ?? ""} ${student.student?.display_name ?? ""}`.toLowerCase();
        return matchesStatus && (!normalized || haystack.includes(normalized));
      })
      .sort((a, b) => compareStudents(a, b, studentSort.key, studentSort.direction, getStudentSubmittedCount, getCurrentTotalScore));
  })();

  const taskSummaries = (() => {
    if (!target || mode !== "task") return [];
    const normalized = query.trim().toLowerCase();
    return buildTaskSummaries(target.setItem, getTaskStatus, getTaskScore, deliveredTaskIds)
      .filter((task) => {
        const matchesStatus = taskStatusFilter === "all" || task.status === taskStatusFilter;
        const haystack = `${task.task_code ?? ""} ${task.task_title ?? ""}`.toLowerCase();
        return matchesStatus && (!normalized || haystack.includes(normalized));
      })
      .sort((a, b) => String(a.task_code ?? a.task_title ?? "").localeCompare(String(b.task_code ?? b.task_title ?? ""), undefined, { numeric: true, sensitivity: "base" }));
  })();

  function toggleStudentSort(key: StudentSortKey) {
    setStudentSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function updateTaskStatusOverrides(updater: (current: Record<string, TaskReviewStatus>) => Record<string, TaskReviewStatus>) {
    const next = updater(taskStatusOverridesRef.current);
    taskStatusOverridesRef.current = next;
    setTaskStatusOverrides(next);
  }

  function updateTaskScoreOverrides(updater: (current: Record<string, number>) => Record<string, number>) {
    const next = updater(taskScoreOverridesRef.current);
    taskScoreOverridesRef.current = next;
    setTaskScoreOverrides(next);
  }

  function updateSavedTaskStatusOverrides(updater: (current: Record<string, TaskReviewStatus>) => Record<string, TaskReviewStatus>) {
    const next = updater(savedTaskStatusOverridesRef.current);
    savedTaskStatusOverridesRef.current = next;
    setSavedTaskStatusOverrides(next);
  }

  function updateSavedTaskScoreOverrides(updater: (current: Record<string, number>) => Record<string, number>) {
    const next = updater(savedTaskScoreOverridesRef.current);
    savedTaskScoreOverridesRef.current = next;
    setSavedTaskScoreOverrides(next);
  }

  function getStudentStatus(student: ReviewStudent): ReviewStatus {
    const submittedTasks = student.tasks.filter((task) => isTaskEffectivelySubmitted(student, task));
    const statuses = submittedTasks.map((task) => getTaskStatus(student, task));
    if (statuses.some((status) => status === "reviewed" || status === "completed")) {
      if (student.tasks.length > 0 && submittedTasks.length === student.tasks.length && statuses.every((status) => status === "completed")) return "completed";
      return "review";
    }
    if (student.tasks.length === 0 || submittedTasks.length < student.tasks.length) return "unsubmitted";
    if (statuses.every((status) => status === "completed")) return "completed";
    if (draftSavedStudentIds.has(student.profile_id)) return "review";
    if (statuses.some((status) => status === "reviewed")) return "review";
    return "submitted";
  }

  function openStudentReview(student: ReviewStudent) {
    const status = getStudentStatus(student);
    setStudentModal(student);
    setDirtyTaskKeys(new Set());
    if (status === "submitted" || status === "review") {
      setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
      return;
    }
    setApprovalDraftStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
  }

  function openTaskReview(taskSummary: TaskSummary) {
    if (!target) return;
    const snapshot: TaskReviewSnapshot = { statuses: {}, scores: {} };
    for (const student of target.setItem.students) {
      const task = student.tasks.find((item) => item.task_id === taskSummary.task_id);
      if (!task || !isTaskEffectivelySubmittedNow(student, task)) continue;
      const key = getTaskStatusKey(student.profile_id, taskSummary.task_id);
      snapshot.statuses[key] = taskStatusOverridesRef.current[key] ?? savedTaskStatusOverridesRef.current[key] ?? getDefaultTaskStatus(student, task);
      snapshot.scores[key] = taskScoreOverridesRef.current[key] ?? savedTaskScoreOverridesRef.current[key] ?? getSubmissionDisplayScore(task);
    }
    taskReviewSnapshotRef.current = snapshot;
    setTaskModal(taskSummary);
  }

  function getTaskStatus(student: ReviewStudent, task: TaskResult): TaskReviewStatus {
    const key = getTaskStatusKey(student.profile_id, task.task_id);
    const override = taskStatusOverrides[key] ?? savedTaskStatusOverrides[key];
    if (override) return override;
    if (!task.submission && deliveredTaskIds.has(task.task_id)) return "submitted";
    return getDefaultTaskStatus(student, task);
  }

  function isTaskEffectivelySubmitted(student: ReviewStudent, task: TaskResult) {
    const key = getTaskStatusKey(student.profile_id, task.task_id);
    return Boolean(
        task.submission ||
        deliveredTaskIds.has(task.task_id) ||
        Object.prototype.hasOwnProperty.call(taskStatusOverrides, key) ||
        Object.prototype.hasOwnProperty.call(savedTaskStatusOverrides, key) ||
        Object.prototype.hasOwnProperty.call(taskScoreOverrides, key) ||
        Object.prototype.hasOwnProperty.call(savedTaskScoreOverrides, key),
    );
  }

  function isTaskEffectivelySubmittedNow(student: ReviewStudent, task: TaskResult) {
    const key = getTaskStatusKey(student.profile_id, task.task_id);
    return Boolean(
      task.submission ||
        deliveredTaskIds.has(task.task_id) ||
        Object.prototype.hasOwnProperty.call(taskStatusOverridesRef.current, key) ||
        Object.prototype.hasOwnProperty.call(savedTaskStatusOverridesRef.current, key) ||
        Object.prototype.hasOwnProperty.call(taskScoreOverridesRef.current, key) ||
        Object.prototype.hasOwnProperty.call(savedTaskScoreOverridesRef.current, key),
    );
  }

  function getDefaultTaskStatus(student: ReviewStudent, task?: TaskResult): TaskReviewStatus {
    if (task?.submission?.review_status) return task.submission.review_status;
    if (student.status === "completed") return "completed";
    if (student.status === "review") return "reviewed";
    return "submitted";
  }

  function getStudentSubmittedCount(student: ReviewStudent) {
    return student.tasks.filter((task) => isTaskEffectivelySubmitted(student, task)).length;
  }

  function toggleTaskDelivered(taskId: string) {
    setDeliveredTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSetDelivered(taskIds: string[]) {
    setDeliveredTaskIds((current) => {
      const next = new Set(current);
      const allDelivered = taskIds.length > 0 && taskIds.every((taskId) => next.has(taskId));
      for (const taskId of taskIds) {
        if (allDelivered) next.delete(taskId);
        else next.add(taskId);
      }
      return next;
    });
  }

  function getTaskScore(student: ReviewStudent, task: TaskResult) {
    const key = getTaskStatusKey(student.profile_id, task.task_id);
    return taskScoreOverrides[key] ?? savedTaskScoreOverrides[key] ?? getSubmissionDisplayScore(task);
  }

  function getSubmissionDisplayScore(task: TaskResult) {
    return Number(task.submission?.review_score ?? task.submission?.auto_score ?? task.submission?.final_score ?? 0);
  }

  async function persistTaskReview(student: ReviewStudent, task: TaskResult, statusOverride?: TaskReviewStatus) {
    if (!task.submission) return;
    const token = await getToken();
    if (!token) {
      router.push("/auth/login");
      throw new Error("Missing session.");
    }

    const status = statusOverride ?? getTaskStatus(student, task);
    const response = await fetch("/api/teacher/submissions", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_id: task.submission.submission_id,
        review_status: status,
        review_score: getTaskScore(student, task),
        teacher_feedback: task.submission.teacher_feedback ?? null,
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) throw new Error(json.error ?? text ?? "Failed to save review.");
  }

  function updateTaskScore(student: ReviewStudent, task: TaskResult, value: string) {
    const key = getTaskStatusKey(student.profile_id, task.task_id);
    const maxScore = Number(task.max_score ?? 0);
    const parsed = Number(value);
    const nextScore = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), maxScore) : 0;
    updateTaskScoreOverrides((current) => ({ ...current, [key]: nextScore }));
    updateTaskStatusOverrides((current) => ({ ...current, [key]: "reviewed" }));
    setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
    setDirtyTaskKeys((current) => {
      const next = new Set(current);
      const baselineScore = savedTaskScoreOverridesRef.current[key] ?? savedTaskScoreOverrides[key] ?? getSubmissionDisplayScore(task);
      if (nextScore === baselineScore) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetTaskScoreChanges(student: ReviewStudent) {
    updateTaskScoreOverrides((current) => {
      const next = { ...current };
      for (const task of student.tasks) delete next[getTaskStatusKey(student.profile_id, task.task_id)];
      return next;
    });
    updateTaskStatusOverrides((current) => {
      const next = { ...current };
      for (const task of student.tasks) delete next[getTaskStatusKey(student.profile_id, task.task_id)];
      return next;
    });
    setDirtyTaskKeys((current) => {
      const next = new Set(current);
      for (const task of student.tasks) next.delete(getTaskStatusKey(student.profile_id, task.task_id));
      return next;
    });
    setApprovalDraftStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setApprovedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setDraftSavedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    if (student.status === "submitted" || student.status === "review") {
      setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
    }
  }

  function resetTaskReviewChanges(taskId: string) {
    if (!target) return;
    const studentsWithTask = target.setItem.students.filter((student) => student.tasks.some((task) => task.task_id === taskId));
    const snapshot = taskReviewSnapshotRef.current;
    updateTaskScoreOverrides((current) => {
      const next = { ...current };
      for (const student of studentsWithTask) {
        const key = getTaskStatusKey(student.profile_id, taskId);
        if (Object.prototype.hasOwnProperty.call(snapshot.scores, key)) next[key] = snapshot.scores[key];
        else delete next[key];
      }
      return next;
    });
    updateTaskStatusOverrides((current) => {
      const next = { ...current };
      for (const student of studentsWithTask) {
        const key = getTaskStatusKey(student.profile_id, taskId);
        if (Object.prototype.hasOwnProperty.call(snapshot.statuses, key)) next[key] = snapshot.statuses[key];
        else delete next[key];
      }
      return next;
    });
    setDirtyTaskKeys((current) => {
      const next = new Set(current);
      for (const student of studentsWithTask) next.delete(getTaskStatusKey(student.profile_id, taskId));
      return next;
    });
  }

  function resetTaskReviewStatusesToSubmitted(taskId: string) {
    if (!target) return;
    const studentsWithTask = target.setItem.students.filter((student) => student.tasks.some((task) => task.task_id === taskId));
    updateTaskStatusOverrides((current) => {
      const next = { ...current };
      for (const student of studentsWithTask) next[getTaskStatusKey(student.profile_id, taskId)] = "submitted";
      return next;
    });
    setApprovedStudentIds((current) => {
      const next = new Set(current);
      for (const student of studentsWithTask) next.delete(student.profile_id);
      return next;
    });
    setDraftSavedStudentIds((current) => {
      const next = new Set(current);
      for (const student of studentsWithTask) next.delete(student.profile_id);
      return next;
    });
    setApprovalDraftStudentIds((current) => {
      const next = new Set(current);
      for (const student of studentsWithTask) next.add(student.profile_id);
      return next;
    });
  }

  async function saveTaskReviewChanges(taskId: string) {
    if (!target) return;
    const studentsWithTask = target.setItem.students.filter((student) => student.tasks.some((task) => task.task_id === taskId));
    try {
      await Promise.all(studentsWithTask.map(async (student) => {
        const task = student.tasks.find((item) => item.task_id === taskId);
        if (!task || !task.submission) return;
        await persistTaskReview(student, task);
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save review.");
      return;
    }
    updateSavedTaskScoreOverrides((current) => {
      const next = { ...current };
      for (const student of studentsWithTask) {
        const key = getTaskStatusKey(student.profile_id, taskId);
        if (Object.prototype.hasOwnProperty.call(taskScoreOverridesRef.current, key)) next[key] = taskScoreOverridesRef.current[key];
      }
      return next;
    });
    updateSavedTaskStatusOverrides((current) => {
      const next = { ...current };
      for (const student of studentsWithTask) {
        const key = getTaskStatusKey(student.profile_id, taskId);
        const task = student.tasks.find((item) => item.task_id === taskId);
        if (task && isTaskEffectivelySubmittedNow(student, task)) next[key] = taskStatusOverridesRef.current[key] ?? savedTaskStatusOverridesRef.current[key] ?? getDefaultTaskStatus(student, task);
      }
      return next;
    });
    setDirtyTaskKeys((current) => {
      const next = new Set(current);
      for (const student of studentsWithTask) next.delete(getTaskStatusKey(student.profile_id, taskId));
      return next;
    });
    setApprovalDraftStudentIds((current) => {
      const next = new Set(current);
      for (const student of studentsWithTask) next.add(student.profile_id);
      return next;
    });
    setTaskModal(null);
  }

  function hasDirtyScores(student: ReviewStudent) {
    return student.tasks.some((task) => dirtyTaskKeys.has(getTaskStatusKey(student.profile_id, task.task_id)));
  }

  function reviewTask(student: ReviewStudent, task: TaskResult) {
    updateTaskStatusOverrides((current) => ({ ...current, [getTaskStatusKey(student.profile_id, task.task_id)]: "completed" }));
    setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
    setDraftSavedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
  }

  function reviewAllTasks(student: ReviewStudent) {
    updateTaskStatusOverrides((current) => {
      const next = { ...current };
      for (const task of student.tasks) {
        if (isTaskEffectivelySubmitted(student, task)) next[getTaskStatusKey(student.profile_id, task.task_id)] = "completed";
      }
      return next;
    });
    setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
  }

  function resetAllTaskStatusesToSubmitted(student: ReviewStudent) {
    updateTaskStatusOverrides((current) => {
      const next = { ...current };
      for (const task of student.tasks) {
        if (isTaskEffectivelySubmitted(student, task)) next[getTaskStatusKey(student.profile_id, task.task_id)] = "submitted";
      }
      return next;
    });
    setApprovedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setDraftSavedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
  }

  function canApproveStudent(student: ReviewStudent) {
    if (approvedStudentIds.has(student.profile_id) && !approvalDraftStudentIds.has(student.profile_id)) return false;
    return student.tasks.length > 0 && student.tasks.every((task) => isTaskEffectivelySubmitted(student, task) && getTaskStatus(student, task) === "completed");
  }

  function isApprovedLocked(student: ReviewStudent) {
    return (approvedStudentIds.has(student.profile_id) || student.status === "completed") && !approvalDraftStudentIds.has(student.profile_id);
  }

  function canShowReviewActions(student: ReviewStudent) {
    return approvalDraftStudentIds.has(student.profile_id) && !isApprovedLocked(student);
  }

  function hasPopupChanges(student: ReviewStudent) {
    return hasDirtyScores(student) || approvalDraftStudentIds.has(student.profile_id);
  }

  function hasSubmittedTasks(student: ReviewStudent) {
    return student.tasks.some((task) => isTaskEffectivelySubmitted(student, task));
  }

  async function saveDraftReview(student: ReviewStudent) {
    try {
      await Promise.all(student.tasks.map(async (task) => {
        if (!task.submission || !isTaskEffectivelySubmitted(student, task)) return;
        await persistTaskReview(student, task, getTaskStatus(student, task) === "completed" ? "reviewed" : getTaskStatus(student, task));
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save review.");
      return;
    }
    setDirtyTaskKeys((current) => {
      const next = new Set(current);
      for (const task of student.tasks) next.delete(getTaskStatusKey(student.profile_id, task.task_id));
      return next;
    });
    setApprovedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setDraftSavedStudentIds((current) => new Set(current).add(student.profile_id));
    setApprovalDraftStudentIds((current) => new Set(current).add(student.profile_id));
    setStudentModal(null);
  }

  async function approveStudentReview(student: ReviewStudent) {
    try {
      await Promise.all(student.tasks.map(async (task) => {
        if (!task.submission || !isTaskEffectivelySubmitted(student, task)) return;
        await persistTaskReview(student, task, "completed");
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to approve review.");
      return;
    }
    setApprovedStudentIds((current) => new Set(current).add(student.profile_id));
    setDraftSavedStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setApprovalDraftStudentIds((current) => {
      const next = new Set(current);
      next.delete(student.profile_id);
      return next;
    });
    setStudentModal(null);
  }

  function getCurrentTotalScore(student: ReviewStudent) {
    return student.tasks.reduce((sum, task) => sum + (isTaskEffectivelySubmitted(student, task) ? getTaskScore(student, task) : 0), 0);
  }

  function exportReviewCsv() {
    if (!target) return;
    const rows =
      mode === "student"
        ? [
            ["Academy ID", "Student Name", "Submit", "Score", "Status"],
            ...students.map((student) => [
              student.student?.academy_member_id ?? student.student?.participant_code ?? "",
              student.student?.display_name ?? "",
              String(getStudentSubmittedCount(student)),
              String(getCurrentTotalScore(student)),
              getStatusLabel(getStudentStatus(student)),
            ]),
          ]
        : [
            ["Task Code", "Task", "Min", "Max", "Avg", "SD", "Submit", "Status"],
            ...taskSummaries.map((task) => [
              task.task_code ?? "",
              task.task_title ?? "",
              formatMetric(task.min_score),
              formatMetric(task.max_score),
              formatMetric(task.average_score),
              formatMetric(task.sd_score),
              String(task.submitted_count),
              getTaskSummaryStatusLabel(task.status),
            ]),
          ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${target.classItem.class_code}-${target.setItem.batch_code ?? "review"}-${mode}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading review...</div>;
  }

  if (errorMessage || !target) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage ?? "Review not found."}</div>;
  }

  const title = routeParams?.family === "exam" ? "Review Exam Set" : "Review Assignment Set";
  const itemLabel = routeParams?.family === "exam" ? "Exam" : "Assignment";
  const setSubmittedTotal = target.setItem.students.reduce((sum, student) => sum + getStudentSubmittedCount(student), 0);
  const setMaxScore = getSetMaxScore(target.setItem);
  const setTaskIds = getSetTaskIds(target.setItem);
  const isSetDelivered = setTaskIds.length > 0 && setTaskIds.every((taskId) => deliveredTaskIds.has(taskId));

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/submissions" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Submissions
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">{title}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-[#0F172A]">{title}</h1>
            <p className="text-sm text-[#64748B]">
              <span className="font-mono font-semibold text-[#F37021]">{target.setItem.batch_code ?? "-"}</span>
              <span className="mx-2 text-[#CBD5E1]">|</span>
              {target.setItem.batch_name ?? "Untitled set"}
              <span className="mx-2 text-[#CBD5E1]">|</span>
              <span className="font-semibold text-[#0F172A]">
                Total {itemLabel}: <span className="text-[#F37021]">{setSubmittedTotal}</span>
              </span>
              <span className="mx-2 text-[#CBD5E1]">|</span>
              <span className="font-semibold text-[#0F172A]">
                Total Score: <span className="text-[#F37021]">{setMaxScore}</span>
              </span>
              <span className="mx-2 text-[#CBD5E1]">|</span>
              <span className="font-semibold text-[#0F172A]">
                Total Student: <span className="text-[#F37021]">{target.classItem.student_count}</span>
              </span>
            </p>
            <p className="text-xs text-[#64748B]">
              {target.classItem.class_code} | {target.classItem.class_name}
            </p>
          </div>
          <div className="flex self-start items-center gap-3">
            <button
              type="button"
              aria-label="Set delivered for all tasks"
              title="Set Delivered"
              onClick={() => toggleSetDelivered(setTaskIds)}
              className="inline-flex h-10 min-w-[154px] items-center justify-between gap-3 rounded-xl border border-[#FED7AA] bg-white px-3 text-sm font-semibold text-[#64748B] hover:border-[#F37021]"
            >
              <span>Delivered</span>
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${isSetDelivered ? "bg-[#F37021]" : "bg-[#E2E8F0]"}`}>
                <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${isSetDelivered ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
            <button
              type="button"
              onClick={exportReviewCsv}
              className="rounded-xl border border-[#F37021] bg-white px-4 py-2 text-sm font-semibold text-[#F37021] hover:bg-[#FFF7ED]"
            >
              Export
            </button>
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-col lg:flex-row gap-3">
          <div className="flex rounded-xl border border-[#FED7AA] bg-white overflow-hidden">
            {(["student", "task"] as ReviewMode[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-label={item}
                title={item === "student" ? "Student" : "Task"}
                onClick={() => {
                  setMode(item);
                  setQuery("");
                }}
                className={`inline-flex h-10 w-12 items-center justify-center text-sm font-semibold ${
                  mode === item ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"
                }`}
              >
                {item === "student" ? <StudentIcon /> : <TaskIcon />}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === "student" ? "Search by student code or name" : "Search by task code or name"}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <div className="flex rounded-xl border border-[#FED7AA] bg-white overflow-hidden">
            {mode === "student"
              ? STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-label={status}
                    title={getStatusLabel(status)}
                    onClick={() => setStatusFilter(status)}
                    className={`inline-flex h-10 w-12 items-center justify-center text-sm font-semibold ${
                      statusFilter === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"
                    }`}
                  >
                    {status === "all" ? "ALL" : <StatusIcon status={status} />}
                  </button>
                ))
              : TASK_STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-label={status}
                    title={getTaskSummaryStatusLabel(status)}
                    onClick={() => setTaskStatusFilter(status)}
                    className={`inline-flex h-10 w-12 items-center justify-center text-sm font-semibold ${
                      taskStatusFilter === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"
                    }`}
                  >
                    {status === "all" ? "ALL" : <TaskSummaryStatusIcon status={status} />}
                  </button>
                ))}
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
          {mode === "student" && students.length === 0 ? (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
              No students match the current filters.
            </div>
          ) : mode === "student" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[820px] space-y-2">
                <div className="grid grid-cols-[72px_150px_minmax(220px,1fr)_100px_120px_48px] items-center gap-3 px-4 text-xs font-semibold text-[#64748B]">
                  <span>Status</span>
                  <SortButton label="Code" sortKey="code" current={studentSort} onClick={toggleStudentSort} />
                  <SortButton label="Student Name" sortKey="name" current={studentSort} onClick={toggleStudentSort} />
                  <SortButton label="Submit" sortKey="submitted" current={studentSort} onClick={toggleStudentSort} />
                  <SortButton label="Score" sortKey="score" current={studentSort} onClick={toggleStudentSort} />
                  <span />
                </div>
                {students.map((student) => {
                  const status = getStudentStatus(student);
                  const canEdit = EDITABLE_STATUSES.has(status);
                  return (
                    <div key={student.profile_id} className="grid grid-cols-[72px_150px_minmax(220px,1fr)_100px_120px_48px] items-center gap-3 rounded-xl border border-[#FED7AA] bg-white px-4 py-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${getStatusClass(status)}`} title={getStatusLabel(status)}>
                          <StatusIcon status={status} />
                        </span>
                      </div>
                      <p className="truncate font-mono text-xs font-bold text-[#F37021]">{student.student?.academy_member_id ?? student.student?.participant_code ?? "-"}</p>
                      <p className="truncate text-sm font-semibold text-[#0F172A]">{student.student?.display_name ?? "Unknown student"}</p>
                      <p className="text-sm font-semibold text-[#0F172A]">{getStudentSubmittedCount(student)}</p>
                      <p className="text-sm font-semibold text-[#F37021]">{getCurrentTotalScore(student)}</p>
                      <div className="flex justify-end">
                        {canEdit && (
                          <button
                            type="button"
                            aria-label="Edit review status"
                            title="Edit review status"
                            onClick={() => openStudentReview(student)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]"
                          >
                            <PencilIcon />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : taskSummaries.length === 0 ? (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
              No tasks match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[900px] space-y-2">
                <div className="grid grid-cols-[60px_110px_minmax(180px,1fr)_56px_56px_64px_56px_72px_64px_44px] items-center gap-2 px-4 text-xs font-semibold text-[#64748B]">
                  <span>Status</span>
                  <span>Task Code</span>
                  <span>Task</span>
                  <span className="text-center">Min</span>
                  <span className="text-center">Max</span>
                  <span className="text-center">Avg</span>
                  <span className="text-center">SD</span>
                  <span className="text-center">Submit</span>
                  <span className="text-center" title="Set Delivered">Delivered</span>
                  <span />
                </div>
                {taskSummaries.map((task) => {
                  const canEditTask = task.submitted_count === target.classItem.student_count;
                  const delivered = deliveredTaskIds.has(task.task_id);
                  return (
                    <div key={task.task_id} className="grid grid-cols-[60px_110px_minmax(180px,1fr)_56px_56px_64px_56px_72px_64px_44px] items-center gap-2 rounded-xl border border-[#FED7AA] bg-white px-4 py-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${getTaskSummaryStatusClass(task.status)}`} title={getTaskSummaryStatusLabel(task.status)}>
                          <TaskSummaryStatusIcon status={task.status} />
                        </span>
                      </div>
                      <p className="truncate font-mono text-xs font-bold text-[#F37021]">{task.task_code ?? "-"}</p>
                      <p className="truncate text-sm font-semibold text-[#0F172A]">{task.task_title ?? "Untitled task"}</p>
                      <p className="text-center text-sm font-semibold text-[#0F172A]">{formatMetric(task.min_score)}</p>
                      <p className="text-center text-sm font-semibold text-[#0F172A]">{formatMetric(task.max_score)}</p>
                      <p className="text-center text-sm font-semibold text-[#F37021]">{formatMetric(task.average_score)}</p>
                      <p className="text-center text-sm font-semibold text-[#0F172A]">{formatMetric(task.sd_score)}</p>
                      <p className="text-center text-sm font-semibold text-[#0F172A]">{task.submitted_count}</p>
                      <button
                        type="button"
                        aria-label="Set delivered"
                        title="Set Delivered"
                        onClick={() => toggleTaskDelivered(task.task_id)}
                        className={`relative mx-auto h-7 w-12 rounded-full transition-colors ${delivered ? "bg-[#F37021]" : "bg-[#E2E8F0]"}`}
                      >
                        <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${delivered ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                      <div className="flex justify-end">
                        {canEditTask && (
                          <button
                            type="button"
                            aria-label="Edit task review"
                            title="Edit task review"
                            onClick={() => openTaskReview(task)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]"
                          >
                            <PencilIcon />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>

      {studentModal && (
        <StudentReviewModal
          student={studentModal}
          onClose={() => setStudentModal(null)}
          getTaskScore={getTaskScore}
          getTaskStatus={getTaskStatus}
          isTaskEffectivelySubmitted={isTaskEffectivelySubmitted}
          updateTaskScore={updateTaskScore}
          reviewTask={reviewTask}
          canShowReviewActions={canShowReviewActions}
          hasSubmittedTasks={hasSubmittedTasks}
          resetAllTaskStatusesToSubmitted={resetAllTaskStatusesToSubmitted}
          reviewAllTasks={reviewAllTasks}
          canApproveStudent={canApproveStudent}
          hasPopupChanges={hasPopupChanges}
          resetTaskScoreChanges={resetTaskScoreChanges}
          approveStudentReview={approveStudentReview}
          saveDraftReview={saveDraftReview}
          getCurrentTotalScore={getCurrentTotalScore}
        />
      )}

      {taskModal && target && (
        <TaskReviewModal
          task={taskModal}
          students={target.setItem.students}
          delivered={deliveredTaskIds.has(taskModal.task_id)}
          onClose={() => setTaskModal(null)}
          getTaskScore={getTaskScore}
          getTaskStatus={getTaskStatus}
          updateTaskScore={updateTaskScore}
          reviewTask={reviewTask}
          resetTaskReviewChanges={resetTaskReviewChanges}
          resetTaskReviewStatusesToSubmitted={resetTaskReviewStatusesToSubmitted}
          saveTaskReviewChanges={saveTaskReviewChanges}
        />
      )}
    </div>
  );
}

function StudentReviewModal({
  student,
  onClose,
  getTaskScore,
  getTaskStatus,
  isTaskEffectivelySubmitted,
  updateTaskScore,
  reviewTask,
  canShowReviewActions,
  hasSubmittedTasks,
  resetAllTaskStatusesToSubmitted,
  reviewAllTasks,
  canApproveStudent,
  hasPopupChanges,
  resetTaskScoreChanges,
  approveStudentReview,
  saveDraftReview,
  getCurrentTotalScore,
}: {
  student: ReviewStudent;
  onClose: () => void;
  getTaskScore: (student: ReviewStudent, task: TaskResult) => number;
  getTaskStatus: (student: ReviewStudent, task: TaskResult) => TaskReviewStatus;
  isTaskEffectivelySubmitted: (student: ReviewStudent, task: TaskResult) => boolean;
  updateTaskScore: (student: ReviewStudent, task: TaskResult, value: string) => void;
  reviewTask: (student: ReviewStudent, task: TaskResult) => void;
  canShowReviewActions: (student: ReviewStudent) => boolean;
  hasSubmittedTasks: (student: ReviewStudent) => boolean;
  resetAllTaskStatusesToSubmitted: (student: ReviewStudent) => void;
  reviewAllTasks: (student: ReviewStudent) => void;
  canApproveStudent: (student: ReviewStudent) => boolean;
  hasPopupChanges: (student: ReviewStudent) => boolean;
  resetTaskScoreChanges: (student: ReviewStudent) => void;
  approveStudentReview: (student: ReviewStudent) => void;
  saveDraftReview: (student: ReviewStudent) => void;
  getCurrentTotalScore: (student: ReviewStudent) => number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
      <div className="w-full max-w-5xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Review Student Work</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              <span className="font-mono font-semibold text-[#F37021]">{student.student?.academy_member_id ?? student.student?.participant_code ?? "-"}</span>
              <span className="mx-2 text-[#CBD5E1]">|</span>
              {student.student?.display_name ?? "Unknown student"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]">
            x
          </button>
        </div>

        <div className="max-h-[520px] overflow-y-auto pr-1">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#FED7AA] text-xs font-semibold text-[#64748B]">
                <th className="py-2 pr-3 w-20">Status</th>
                <th className="py-2 pr-3">Task</th>
                <th className="py-2 px-3 text-center">Score</th>
                <th className="py-2 px-3 text-center">Result</th>
                <th className="py-2 px-3 text-center">Attempts</th>
                <th className="py-2 pr-3">Submitted</th>
                <th className="py-2 pr-3">Student Answer</th>
                <th className="py-2 pr-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {student.tasks.map((task) => {
                const taskStatus = getTaskStatus(student, task);
                const taskSubmitted = isTaskEffectivelySubmitted(student, task);
                const score = getTaskScore(student, task);
                return (
                  <tr key={task.task_id} className="border-b border-[#FED7AA]/70 last:border-0">
                    <td className="py-3 pr-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${taskSubmitted ? getTaskReviewStatusClass(taskStatus) : "border-[#FED7AA] bg-[#FFF7ED] text-[#94A3B8]"}`} title={taskSubmitted ? getTaskReviewStatusLabel(taskStatus) : "UnSubmitted"}>
                          {taskSubmitted ? <TaskReviewStatusIcon status={taskStatus} /> : <StatusIcon status="unsubmitted" />}
                        </span>
                        <span className="hidden text-xs font-semibold text-[#64748B] xl:inline">
                          {taskSubmitted ? getTaskReviewStatusLabel(taskStatus) : "UnSubmitted"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <p className="font-mono text-xs font-bold text-[#F37021]">{task.task_code ?? "-"}</p>
                      <p className="font-semibold text-[#0F172A]">{task.task_title ?? "Untitled task"}</p>
                    </td>
                    <td className="py-3 px-3 text-center align-top font-semibold text-[#0F172A]">
                      {taskSubmitted ? (
                        <span className="inline-flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={Number(task.max_score ?? 0)}
                            value={score}
                            onChange={(event) => updateTaskScore(student, task, event.target.value)}
                            className="h-9 w-20 rounded-xl border border-[#FED7AA] bg-white px-3 text-center text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                          />
                          <span className="text-[#64748B]">/{task.max_score ?? 0}</span>
                        </span>
                      ) : "-"}
                    </td>
                    <td className="py-3 px-3 text-center align-top">
                      {task.submission ? (
                        <span className={task.submission.is_passed ? "font-semibold text-green-700" : "font-semibold text-red-600"}>
                          {task.submission.is_passed ? "Pass" : "Check"}
                        </span>
                      ) : taskSubmitted ? (
                        <span className="font-semibold text-[#D97706]">Skip</span>
                      ) : (
                        <span className="text-[#64748B]">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center align-top text-[#64748B]">{task.submission?.total_attempt_count ?? "-"}</td>
                    <td className="py-3 pr-3 align-top text-[#64748B]">{formatDate(task.submission?.submitted_at ?? null)}</td>
                    <td className="py-3 pr-3 align-top text-[#64748B]">
                      <div className="max-h-24 overflow-y-auto rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-2">
                        {task.submission?.final_answer_text ?? "-"}
                      </div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      {taskSubmitted && taskStatus !== "completed" && canShowReviewActions(student) ? (
                        <button type="button" aria-label="Review task" title="Review" onClick={() => reviewTask(student, task)} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]">
                          <ReviewTaskIcon />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-2 text-sm font-semibold text-[#0F172A]">
              Total Score: <span className="text-[#F37021]">{getCurrentTotalScore(student)}</span>
              <span className="text-[#64748B]">/{student.max_score}</span>
            </div>
            {hasSubmittedTasks(student) && (
              <button type="button" onClick={() => resetAllTaskStatusesToSubmitted(student)} className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]">
                Reset
              </button>
            )}
            {canShowReviewActions(student) && !canApproveStudent(student) && (
              <button type="button" onClick={() => reviewAllTasks(student)} className="inline-flex items-center gap-2 rounded-xl bg-[#F37021] px-4 py-2 text-sm font-semibold text-white hover:bg-[#C2410C]">
                <ReviewTaskIcon />
                Review All
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {hasPopupChanges(student) && (
              <button type="button" aria-label="Refresh popup" title="Refresh" onClick={() => resetTaskScoreChanges(student)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED]">
                <RefreshIcon />
              </button>
            )}
            {canShowReviewActions(student) && canApproveStudent(student) ? (
              <button type="button" aria-label="Approve" title="Approve" onClick={() => approveStudentReview(student)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]">
                <SaveIcon />
              </button>
            ) : (
              canShowReviewActions(student) && (
                <button type="button" aria-label="Save draft" title="Save" onClick={() => saveDraftReview(student)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]">
                  <SaveIcon />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskReviewModal({
  task,
  students,
  delivered,
  onClose,
  getTaskScore,
  getTaskStatus,
  updateTaskScore,
  reviewTask,
  resetTaskReviewChanges,
  resetTaskReviewStatusesToSubmitted,
  saveTaskReviewChanges,
}: {
  task: TaskSummary;
  students: ReviewStudent[];
  delivered: boolean;
  onClose: () => void;
  getTaskScore: (student: ReviewStudent, task: TaskResult) => number;
  getTaskStatus: (student: ReviewStudent, task: TaskResult) => TaskReviewStatus;
  updateTaskScore: (student: ReviewStudent, task: TaskResult, value: string) => void;
  reviewTask: (student: ReviewStudent, task: TaskResult) => void;
  resetTaskReviewChanges: (taskId: string) => void;
  resetTaskReviewStatusesToSubmitted: (taskId: string) => void;
  saveTaskReviewChanges: (taskId: string) => void;
}) {
  const reviewableRows = students
    .map((student) => ({ student, task: getStudentTask(student, task.task_id) }))
    .filter((item): item is { student: ReviewStudent; task: TaskResult } => Boolean(item.task && (item.task.submission || delivered)));

  function reviewAllRows() {
    for (const item of reviewableRows) {
      if (getTaskStatus(item.student, item.task) !== "completed") reviewTask(item.student, item.task);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
      <div className="w-full max-w-5xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Review Task</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              <span className="font-mono font-semibold text-[#F37021]">{task.task_code ?? "-"}</span>
              <span className="mx-2 text-[#CBD5E1]">|</span>
              {task.task_title ?? "Untitled task"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]">
            x
          </button>
        </div>
        <div className="max-h-[520px] overflow-y-auto pr-1">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#FED7AA] text-xs font-semibold text-[#64748B]">
                <th className="py-2 pr-3 w-12">Status</th>
                <th className="py-2 pr-3">Student Code</th>
                <th className="py-2 pr-3">Student Name</th>
                <th className="py-2 px-3 text-center">Attempts</th>
                <th className="py-2 px-3 text-center">Score</th>
                <th className="py-2 pr-3">Student Answer</th>
                <th className="py-2 pr-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const studentTask = getStudentTask(student, task.task_id);
                const score = studentTask ? getTaskScore(student, studentTask) : 0;
                const canReview = Boolean(studentTask && (studentTask.submission || delivered));
                const status = studentTask && canReview ? getTaskStatus(student, studentTask) : null;
                return (
                  <tr key={student.profile_id} className="border-b border-[#FED7AA]/70 last:border-0">
                    <td className="py-3 pr-3 align-top">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${status ? getTaskReviewStatusClass(status) : "border-[#FED7AA] bg-[#FFF7ED] text-[#94A3B8]"}`} title={status ? getTaskReviewStatusLabel(status) : "UnSubmitted"}>
                        {status ? <TaskReviewStatusIcon status={status} /> : <StatusIcon status="unsubmitted" />}
                      </span>
                    </td>
                    <td className="py-3 pr-3 align-top font-mono text-xs font-bold text-[#F37021]">{student.student?.academy_member_id ?? student.student?.participant_code ?? "-"}</td>
                    <td className="py-3 pr-3 align-top font-semibold text-[#0F172A]">{student.student?.display_name ?? "Unknown student"}</td>
                    <td className="py-3 px-3 text-center align-top text-[#64748B]">{studentTask?.submission?.total_attempt_count ?? "-"}</td>
                    <td className="py-3 px-3 text-center align-top font-semibold text-[#0F172A]">
                      {studentTask && (studentTask.submission || delivered) ? (
                        <span className="inline-flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={Number(studentTask.max_score ?? 0)}
                            value={score}
                            onChange={(event) => updateTaskScore(student, studentTask, event.target.value)}
                            className="h-9 w-20 rounded-xl border border-[#FED7AA] bg-white px-3 text-center text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                          />
                          <span className="text-[#64748B]">/{studentTask.max_score ?? 0}</span>
                        </span>
                      ) : "-"}
                    </td>
                    <td className="py-3 pr-3 align-top text-[#64748B]">
                      <div className="max-h-24 overflow-y-auto rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-2">
                        {studentTask?.submission?.final_answer_text ?? "-"}
                      </div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      {studentTask && canReview && status !== "completed" ? (
                        <button
                          type="button"
                          aria-label="Review student task"
                          title="Review"
                          onClick={() => reviewTask(student, studentTask)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]"
                        >
                          <ReviewTaskIcon />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => resetTaskReviewStatusesToSubmitted(task.task_id)}
              className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={reviewAllRows}
              className="inline-flex items-center gap-2 rounded-xl bg-[#F37021] px-4 py-2 text-sm font-semibold text-white hover:bg-[#C2410C]"
            >
              <ReviewTaskIcon />
              Review All
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Refresh task review"
              title="Refresh"
              onClick={() => resetTaskReviewChanges(task.task_id)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-[#F37021] hover:bg-[#FFF7ED]"
            >
              <RefreshIcon />
            </button>
            <button type="button" aria-label="Save task scores" title="Save" onClick={() => saveTaskReviewChanges(task.task_id)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]">
              <SaveIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTaskStatusKey(profileId: string, taskId: string) {
  return `${profileId}:${taskId}`;
}

function getStudentTask(student: ReviewStudent, taskId: string) {
  return student.tasks.find((task) => task.task_id === taskId) ?? null;
}

function compareStudents(
  a: ReviewStudent,
  b: ReviewStudent,
  key: StudentSortKey,
  direction: SortDirection,
  getSubmittedCount: (student: ReviewStudent) => number,
  getTotalScore: (student: ReviewStudent) => number,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  if (key === "score") return (getTotalScore(a) - getTotalScore(b)) * multiplier;
  if (key === "submitted") return (getSubmittedCount(a) - getSubmittedCount(b)) * multiplier;
  const aValue = key === "code" ? a.student?.participant_code ?? "" : a.student?.display_name ?? "";
  const bValue = key === "code" ? b.student?.participant_code ?? "" : b.student?.display_name ?? "";
  return aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: "base" }) * multiplier;
}

function buildTaskSummaries(
  setItem: ReviewSet,
  getStatus: (student: ReviewStudent, task: TaskResult) => TaskReviewStatus,
  getScore: (student: ReviewStudent, task: TaskResult) => number,
  deliveredTaskIds: Set<string>,
): TaskSummary[] {
  const taskMap = new Map<string, { task: TaskResult; results: Array<{ student: ReviewStudent; task: TaskResult }> }>();
  for (const student of setItem.students) {
    for (const task of student.tasks) {
      const current = taskMap.get(task.task_id) ?? { task, results: [] };
      current.results.push({ student, task });
      taskMap.set(task.task_id, current);
    }
  }

  return [...taskMap.values()].map(({ task, results }) => {
    const submittedResults = results.filter((item) => item.task.submission);
    const submittedCount = deliveredTaskIds.has(task.task_id) ? setItem.students.length : submittedResults.length;
    const effectiveSubmittedResults = results.filter((item) => item.task.submission || deliveredTaskIds.has(task.task_id));
    const scores = effectiveSubmittedResults.map((item) => getScore(item.student, item.task));
    const classScores = results.map((item) => (item.task.submission || deliveredTaskIds.has(task.task_id) ? getScore(item.student, item.task) : 0));
    const average = submittedCount ? scores.reduce((sum, score) => sum + score, 0) / submittedCount : 0;
    const variance = submittedCount ? scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / submittedCount : 0;
    const reviewedCount = effectiveSubmittedResults.filter((item) => {
      const status = getStatus(item.student, item.task);
      return status === "reviewed" || status === "completed";
    }).length;
    const completedCount = effectiveSubmittedResults.filter((item) => getStatus(item.student, item.task) === "completed").length;

    return {
      task_id: task.task_id,
      task_code: task.task_code,
      task_title: task.task_title,
      min_score: classScores.length ? Math.min(...classScores) : 0,
      max_score: scores.length ? Math.max(...scores) : 0,
      average_score: average,
      sd_score: Math.sqrt(variance),
      submitted_count: submittedCount,
      status: getTaskSummaryStatus(setItem.students.length, submittedCount, reviewedCount, completedCount),
    };
  });
}

function getTaskSummaryStatus(studentCount: number, submittedCount: number, reviewedCount: number, completedCount: number): TaskSummaryStatus {
  if (submittedCount === 0) return "not_start";
  if (studentCount > 0 && completedCount >= studentCount) return "completed";
  if (studentCount > 0 && submittedCount >= studentCount && reviewedCount > 0) return "review";
  if (studentCount > 0 && submittedCount >= studentCount) return "delivered";
  return "in_progress";
}

function getSetMaxScore(setItem: ReviewSet) {
  const sourceStudent = setItem.students.find((student) => student.tasks.length > 0);
  return sourceStudent?.tasks.reduce((sum, task) => sum + Number(task.max_score ?? 0), 0) ?? 0;
}

function getSetTaskIds(setItem: ReviewSet) {
  const taskIds = new Set<string>();
  for (const student of setItem.students) {
    for (const task of student.tasks) taskIds.add(task.task_id);
  }
  return [...taskIds];
}

function SortButton({
  label,
  sortKey,
  current,
  onClick,
}: {
  label: string;
  sortKey: StudentSortKey;
  current: { key: StudentSortKey; direction: SortDirection };
  onClick: (key: StudentSortKey) => void;
}) {
  const active = current.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`inline-flex items-center gap-1 text-left font-semibold ${active ? "text-[#F37021]" : "text-[#64748B] hover:text-[#F37021]"}`}
    >
      {label}
      <span className="text-[10px]">{active ? (current.direction === "asc" ? "^" : "v") : "-"}</span>
    </button>
  );
}

function formatMetric(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function getTaskSummaryStatusLabel(status: TaskSummaryStatus | "all") {
  if (status === "not_start") return "Not Start";
  if (status === "in_progress") return "In Progress";
  if (status === "delivered") return "Delivered";
  if (status === "review") return "In Review";
  if (status === "completed") return "Completed";
  return "ALL";
}

function getTaskSummaryStatusClass(status: TaskSummaryStatus) {
  if (status === "not_start") return "border-[#FED7AA] bg-[#FFF7ED] text-[#64748B]";
  if (status === "in_progress") return "border-[#FDBA74] bg-[#FFEDD5] text-[#C2410C]";
  if (status === "delivered") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "review") return "border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]";
  return "border-green-200 bg-green-50 text-green-700";
}

function TaskSummaryStatusIcon({ status }: { status: TaskSummaryStatus }) {
  if (status === "not_start") return <StatusIcon status="unsubmitted" />;
  if (status === "in_progress") return <StatusIcon status="submitted" />;
  if (status === "delivered") return <DeliveredIcon />;
  if (status === "review") return <StatusIcon status="review" />;
  return <StatusIcon status="completed" />;
}

function getTaskReviewStatusLabel(status: TaskReviewStatus) {
  if (status === "reviewed") return "Reviewed";
  if (status === "completed") return "Completed";
  return "Submitted";
}

function getTaskReviewStatusClass(status: TaskReviewStatus) {
  if (status === "reviewed") return "border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]";
  if (status === "completed") return "border-green-200 bg-green-50 text-green-700";
  return "border-[#FDBA74] bg-[#FFEDD5] text-[#C2410C]";
}

function TaskReviewStatusIcon({ status }: { status: TaskReviewStatus }) {
  if (status === "reviewed") return <StatusIcon status="review" />;
  if (status === "completed") return <StatusIcon status="completed" />;
  return <StatusIcon status="submitted" />;
}

function StatusIcon({ status }: { status: ReviewStatus }) {
  const className = "h-4 w-4";
  if (status === "unsubmitted") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (status === "submitted") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  if (status === "review") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function StudentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function DeliveredIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
      <path d="M5 6v12" />
    </svg>
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

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.3 6.4" />
      <path d="M3 12A9 9 0 0 1 18.3 5.6" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function ReviewTaskIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="m8 11 2 2 5-5" />
    </svg>
  );
}

function getStatusLabel(status: ReviewStatus | "all") {
  if (status === "unsubmitted") return "UnSubmitted";
  if (status === "submitted") return "Submitted";
  if (status === "review") return "In Review";
  if (status === "completed") return "Completed";
  return "ALL";
}

function getStatusClass(status: ReviewStatus) {
  if (status === "unsubmitted") return "border-[#FED7AA] bg-[#FFF7ED] text-[#64748B]";
  if (status === "submitted") return "border-[#FDBA74] bg-[#FFEDD5] text-[#C2410C]";
  if (status === "review") return "border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]";
  return "border-green-200 bg-green-50 text-green-700";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US");
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function safeJsonParse(text: string): { error?: string; classes?: ClassGroup[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
