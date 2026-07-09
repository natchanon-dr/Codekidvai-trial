"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { getOrCreateCurrentProfile } from "@/services/profile-service";
import { getAssignedTaskForStudent, type AssignedStudentTask } from "@/services/student-assignment-service";
import { startLearningSession, markAssignmentInProgress } from "@/services/session-service";
import { logLearningEvent, calculateDurationFromStart } from "@/services/event-service";
import { runAnswerOnServer, submitAnswerOnServer } from "@/services/student-answer-api-service";
import { leaveSessionOnServer } from "@/services/student-session-api-service";
import type { LearningSession, Profile } from "@/types/dataset";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SchemaJson = { tables: Array<{ name: string; columns: string[] }> };
type SampleDataJson = Record<string, Record<string, unknown>[]>;
type HintJson = { hints: string[] };
type ExpectedRow = Record<string, unknown>;

type ExtraTask = {
  instruction_text: string | null;
  expected_output_json: ExpectedRow[] | null;
  hint_json: HintJson | null;
  answer_format_json: { initial_sql?: string; required_columns?: string[] } | null;
};

type BatchPolicy = {
  set_type_id: number | null;
  show_hint: boolean | null;
  show_expected_result: boolean | null;
  show_score_to_student: boolean | null;
  allow_run: boolean | null;
  allow_multiple_attempts: boolean | null;
};

type RunFeedback = { is_correct: boolean; score: number; error_message: string | null };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseCol(col: string) {
  const parts = col.split(" ");
  return { name: parts[0] ?? col, type: parts[1] ?? "", notes: parts.slice(2).join(" ") };
}

function colsFromRows(rows: ExpectedRow[]): string[] {
  return rows.length ? Object.keys(rows[0]) : [];
}

function DifficultyBadge({ level }: { level: string }) {
  const cls = level === "easy"
    ? "bg-green-100 text-green-700 border-green-200"
    : level === "medium"
    ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-red-100 text-red-700 border-red-200";
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${cls}`}>{level}</span>;
}

function DataTable({ rows }: { rows: ExpectedRow[] }) {
  const cols = colsFromRows(rows);
  if (!cols.length) return <p className="text-sm text-[#64748B]">Query returned no rows.</p>;
  return (
    <div className="overflow-x-auto border border-[#FED7AA] rounded-xl">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#FFF7ED]">
            {cols.map((c) => (
              <th key={c} className="px-2.5 py-1.5 text-left font-semibold text-[#0F172A] whitespace-nowrap border-b border-[#FED7AA]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#FFF7ED]/40"}>
              {cols.map((c) => (
                <td key={c} className="px-2.5 py-1.5 font-mono text-[#0F172A] whitespace-nowrap">
                  {row[c] === null ? <span className="text-[#64748B] italic">null</span> : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function StudentTaskPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const batchId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("batchId")
    : null;

  const [task, setTask] = useState<AssignedStudentTask | null>(null);
  const [extra, setExtra] = useState<ExtraTask | null>(null);
  const [policy, setPolicy] = useState<BatchPolicy | null>(null);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runFeedback, setRunFeedback] = useState<RunFeedback | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [batchTasks, setBatchTasks] = useState<{ task_id: string; assigned_order: number }[]>([]);

  const sessionRef = useRef<LearningSession | null>(null);
  const taskRef = useRef<AssignedStudentTask | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initializeTask = useCallback(async () => {
    const p = await getOrCreateCurrentProfile();
    if (!p.consent_accepted) { router.push("/consent"); return; }

    const t = await getAssignedTaskForStudent(params.taskId);
    if (!t) throw new Error("This task is not assigned to you.");

    const [{ data: extraData }, { data: batchData }, { data: batchTaskRows }] = await Promise.all([
      supabase
        .from("mst_tasks")
        .select("instruction_text, expected_output_json, hint_json, answer_format_json")
        .eq("task_id", t.task_id)
        .single<ExtraTask>(),
      supabase
        .from("mst_experiment_batches")
        .select("set_type_id, show_hint, show_expected_result, show_score_to_student, allow_run, allow_multiple_attempts")
        .eq("batch_id", t.batch_id)
        .single<BatchPolicy>(),
      supabase
        .from("trn_task_assignments")
        .select("task_id, assigned_order")
        .eq("batch_id", t.batch_id)
        .eq("profile_id", p.profile_id)
        .order("assigned_order", { ascending: true }),
    ]);

    const s = await startLearningSession({
      profile_id: p.profile_id, task_id: t.task_id,
      batch_id: t.batch_id, assignment_id: t.assignment_id,
      user_agent: window.navigator.userAgent,
    });
    await markAssignmentInProgress({ task_id: t.task_id, profile_id: p.profile_id });
    await logLearningEvent({ session_id: s.session_id, profile_id: p.profile_id, task_id: t.task_id, event_type: "session_start", event_value: "start_task", duration_from_start: 0 });
    await logLearningEvent({ session_id: s.session_id, profile_id: p.profile_id, task_id: t.task_id, event_type: "question_view", event_value: t.task_code, duration_from_start: 0 });

    sessionRef.current = s; taskRef.current = t; profileRef.current = p;
    setTask(t); setExtra(extraData ?? null); setPolicy(batchData ?? null); setSession(s);
    setBatchTasks(batchTaskRows ?? []);

    // Show submitted banner and pre-fill if task was previously completed
    if (t.assignment_status === "completed") {
      setSubmitted(true);
      // Try localStorage first (fastest, most reliable)
      const cached = localStorage.getItem(`last_answer_${t.task_id}`);
      if (cached) {
        setAnswer(cached);
      } else {
        // Fall back to API
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token;
        if (token) {
          const res = await fetch(`/api/student/last-submission?taskId=${t.task_id}&batchId=${t.batch_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (json.final_answer_text) {
              setAnswer(json.final_answer_text);
              localStorage.setItem(`last_answer_${t.task_id}`, json.final_answer_text);
            }
          }
        }
      }
    }
  }, [params.taskId, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initializeTask().catch((e: unknown) => {
      console.error("initializeTask error:", e);
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
          ? String((e as Record<string, unknown>).message)
          : "Failed to load task.";
      setInitError(msg);
    });
  }, [initializeTask]);

  const handleSqlChange = useCallback((value: string) => {
    setAnswer(value);
    setRunFeedback(null);
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    editTimerRef.current = setTimeout(() => {
      const s = sessionRef.current; const t = taskRef.current; const p = profileRef.current;
      if (s && t && p) {
        logLearningEvent({ session_id: s.session_id, profile_id: p.profile_id, task_id: t.task_id, event_type: "sql_edit", event_value: value.substring(0, 500), duration_from_start: calculateDurationFromStart(s.started_at) });
      }
    }, 1000);
  }, []);

  async function handleRun() {
    if (!task || !session || !profileRef.current) return;
    setRunning(true);
    try {
      await logLearningEvent({ session_id: session.session_id, profile_id: profileRef.current.profile_id, task_id: task.task_id, event_type: "sql_run", event_value: answer.substring(0, 500), duration_from_start: calculateDurationFromStart(session.started_at) });
      const result = await runAnswerOnServer({ session_id: session.session_id, task_id: task.task_id, answer_text: answer, answer_json: { mode: "sql_text" } });
      setRunFeedback({ is_correct: result.is_correct, score: result.score, error_message: result.error_message ?? null });
    } catch (e) {
      setRunFeedback({ is_correct: false, score: 0, error_message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่" });
    } finally { setRunning(false); }
  }

  async function handleSubmit() {
    if (!task || !session || !profileRef.current) return;
    setSubmitting(true);
    try {
      await logLearningEvent({ session_id: session.session_id, profile_id: profileRef.current.profile_id, task_id: task.task_id, event_type: "submit_answer", event_value: answer.substring(0, 500), duration_from_start: calculateDurationFromStart(session.started_at) });
      await submitAnswerOnServer({ session_id: session.session_id, task_id: task.task_id, batch_id: task.batch_id, answer_text: answer, answer_json: { mode: "sql_text" } });
      localStorage.setItem(`last_answer_${task.task_id}`, answer);
      setRunFeedback(null);
      setSubmitted(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่");
    } finally { setSubmitting(false); }
  }

  function batchUrl() {
    return batchId ? `/student/dashboard?batchId=${batchId}` : "/student/dashboard";
  }

  async function handleBack() {
    if (task && session) {
      await leaveSessionOnServer({ session_id: session.session_id, task_id: task.task_id, reason: "back_to_dashboard" }).catch(() => {});
    }
    router.push(batchUrl());
  }

  async function handleNavigate(targetTaskId: string) {
    if (task && session) {
      await leaveSessionOnServer({ session_id: session.session_id, task_id: task.task_id, reason: "navigate_to_task" }).catch(() => {});
    }
    router.push(`/student/task/${targetTaskId}${batchId ? `?batchId=${batchId}` : ""}`);
  }

  // ── Full-page states ──

  if (initError) return (
    <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center p-4">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <p className="text-red-600 font-medium mb-4">{initError}</p>
        <button onClick={() => router.push("/student/dashboard")} className="px-5 py-2 bg-[#F37021] text-white rounded-xl text-sm font-semibold hover:bg-[#C2410C] transition-colors">
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  // submitted state is now shown inline — no full-page redirect

  if (!task) return (
    <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center gap-3 text-[#64748B]">
      <Spinner />
      <span>Loading task…</span>
    </div>
  );

  // ── Derived display flags ──

  const currentIdx = batchTasks.findIndex((bt) => bt.task_id === task.task_id);
  const prevTask = currentIdx > 0 ? batchTasks[currentIdx - 1] : null;
  const nextTask = currentIdx >= 0 && currentIdx < batchTasks.length - 1 ? batchTasks[currentIdx + 1] : null;
  const taskPosition = currentIdx >= 0 ? `${currentIdx + 1}/${batchTasks.length}` : null;

  const schemaJson = task.database_schema_json as unknown as SchemaJson | null;
  const sampleDataJson = task.sample_data_json as unknown as SampleDataJson | null;
  const isAssignmentSet = policy?.set_type_id === 1;
  const canRun = policy?.allow_run !== false;
  const canShowScore = isAssignmentSet && (policy?.show_score_to_student ?? false);
  const canShowExpected = isAssignmentSet && (policy?.show_expected_result ?? false) && !!extra?.expected_output_json;
  const canShowHints = isAssignmentSet && (policy?.show_hint ?? false) && !!(extra?.hint_json?.hints?.length);

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      {/* ── Sticky top bar ── */}
      <header className="bg-white border-b border-[#FED7AA] sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 min-w-0">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-[#64748B] hover:text-[#F37021] text-sm font-medium transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {batchId ? (task?.batch_code ?? "กลับไปชุดโจทย์") : "Dashboard"}
          </button>
          <span className="text-[#FED7AA] flex-shrink-0">|</span>
          <span className="font-mono text-xs text-[#F37021] font-bold flex-shrink-0">{task.task_code}</span>
          <span className="text-[#0F172A] font-semibold text-sm truncate">{task.task_title}</span>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <DifficultyBadge level={task.difficulty_level} />
            <span className="hidden sm:inline px-2 py-0.5 text-xs font-semibold rounded-full border bg-[#FFF7ED] text-[#F37021] border-[#FED7AA]">
              {task.batch_name}
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full border bg-blue-50 text-blue-700 border-blue-200 capitalize">
              {task.assignment_status}
            </span>
            {/* Prev / position / Next */}
            {batchTasks.length > 1 && (
              <div className="flex items-center gap-1 border border-[#FED7AA] rounded-xl overflow-hidden">
                <button
                  onClick={() => prevTask && handleNavigate(prevTask.task_id)}
                  disabled={!prevTask}
                  title="โจทย์ก่อนหน้า"
                  className="px-2 py-1 hover:bg-[#FFF7ED] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 text-[#64748B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {taskPosition && (
                  <span className="text-xs font-semibold text-[#64748B] px-1 min-w-[36px] text-center">{taskPosition}</span>
                )}
                <button
                  onClick={() => nextTask && handleNavigate(nextTask.task_id)}
                  disabled={!nextTask}
                  title="โจทย์ต่อไป"
                  className="px-2 py-1 hover:bg-[#FFF7ED] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 text-[#64748B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Two-column body ── */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* LEFT: Problem info */}
        <div className="space-y-4">

          {/* Problem statement */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden shadow-sm">
            <div className="bg-[#F37021] px-4 py-2.5">
              <h2 className="text-white font-bold text-sm tracking-wide">Problem</h2>
            </div>
            <div className="p-4 space-y-3">
              {task.learning_objective && (
                <p className="text-xs text-[#64748B] italic leading-relaxed">{task.learning_objective}</p>
              )}
              <p className="text-[#0F172A] text-sm leading-relaxed">{task.problem_statement}</p>
              {extra?.instruction_text && (
                <div className="pt-3 border-t border-[#FED7AA]">
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">Instructions</p>
                  <p className="text-[#0F172A] text-sm leading-relaxed">{extra.instruction_text}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-4 pt-2 border-t border-[#FED7AA]">
                <span className="text-xs text-[#64748B]">
                  Score: <strong className="text-[#0F172A]">{task.max_score} pts</strong>
                </span>
                {task.estimated_time_seconds && (
                  <span className="text-xs text-[#64748B]">
                    Est. time: <strong className="text-[#0F172A]">{Math.round(task.estimated_time_seconds / 60)} min</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Database schema */}
          {schemaJson?.tables?.length ? (
            <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden shadow-sm">
              <div className="bg-[#FFF7ED] border-b border-[#FED7AA] px-4 py-2.5">
                <h2 className="text-[#0F172A] font-bold text-sm">Database Schema</h2>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {schemaJson.tables.map((tbl) => (
                  <div key={tbl.name} className="border border-[#FED7AA] rounded-xl overflow-hidden">
                    <div className="bg-[#F37021] px-3 py-1.5">
                      <span className="text-white text-xs font-mono font-bold">{tbl.name}</span>
                    </div>
                    <div>
                      {tbl.columns.map((col, i) => {
                        const { name, type, notes } = parseCol(col);
                        return (
                          <div key={i} className="px-3 py-1 flex items-center gap-2 text-xs border-b border-[#FED7AA]/50 last:border-0 bg-white">
                            <span className="font-mono text-[#0F172A] font-medium">{name}</span>
                            {notes && <span className="text-[#64748B] text-[10px]">{notes}</span>}
                            <span className="text-[#F37021] font-mono text-[11px] ml-auto">{type}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Sample data */}
          {sampleDataJson && Object.keys(sampleDataJson).length > 0 ? (
            <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden shadow-sm">
              <div className="bg-[#FFF7ED] border-b border-[#FED7AA] px-4 py-2.5">
                <h2 className="text-[#0F172A] font-bold text-sm">Sample Data</h2>
              </div>
              <div className="p-4 space-y-4">
                {Object.entries(sampleDataJson).map(([tableName, rows]) => (
                  <div key={tableName}>
                    <p className="text-xs font-mono font-bold text-[#F37021] mb-1.5">
                      {tableName}{" "}
                      <span className="text-[#64748B] font-sans font-normal">({rows.length} rows)</span>
                    </p>
                    <DataTable rows={rows} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Hints — Assignment Set only */}
          {canShowHints && extra?.hint_json && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Hints</p>
              <ul className="space-y-2">
                {extra.hint_json.hints.map((hint, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800 leading-relaxed">
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    {hint}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT: Editor + results */}
        <div className="space-y-4">

          {/* Submitted banner */}
          {submitted && (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-700">ส่งคำตอบแล้ว</p>
                <p className="text-xs text-green-600">คำตอบของคุณถูกบันทึกเรียบร้อยแล้ว</p>
              </div>
              <button
                onClick={() => setSubmitted(false)}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold border border-green-300 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
              >
                แก้ไขคำตอบ
              </button>
            </div>
          )}

          {/* Exam set notice */}
          {!isAssignmentSet && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <p className="text-xs text-blue-700 font-semibold">
                Exam mode — no feedback is shown during this exam. Submit when you are ready.
              </p>
            </div>
          )}

          {/* SQL Editor */}
          <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden shadow-sm">
            <div className="bg-[#FFF7ED] border-b border-[#FED7AA] px-4 py-2.5 flex items-center justify-between">
              <h2 className="text-[#0F172A] font-bold text-sm">SQL Editor</h2>
              <span className="text-xs text-[#64748B] font-mono bg-[#F3F4F6] px-2 py-0.5 rounded">sql_text</span>
            </div>
            <div className="p-4">
              <textarea
                value={answer}
                onChange={(e) => handleSqlChange(e.target.value)}
                disabled={submitted || submitting}
                rows={12}
                placeholder={"-- พิมพ์คำสั่ง SQL ที่นี่\nSELECT ..."}
                className="sql-editor w-full font-mono text-sm rounded-xl p-3 border border-[#1e293b] bg-[#0F172A] text-green-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <div className={`mt-3 flex gap-2.5 ${submitted ? "hidden" : ""}`}>
                <button
                  onClick={handleRun}
                  disabled={submitted || running || submitting || !answer.trim() || !canRun}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] hover:bg-[#1e293b] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {running ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {running ? "Running…" : "Run Query"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitted || submitting || running || !answer.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#F37021] hover:bg-[#C2410C] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {submitting ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {submitting ? "Submitting…" : "Submit Answer"}
                </button>
              </div>
              {/* Prev / Next within batch */}
              {batchTasks.length > 1 && (
                <div className="mt-3 pt-3 border-t border-[#FED7AA] flex items-center justify-between gap-2">
                  <button
                    onClick={() => prevTask && handleNavigate(prevTask.task_id)}
                    disabled={!prevTask}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#64748B] border border-[#FED7AA] rounded-xl hover:border-[#F37021] hover:text-[#F37021] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    โจทย์ก่อนหน้า
                  </button>
                  {taskPosition && (
                    <span className="text-xs text-[#64748B] font-semibold">ข้อ {taskPosition}</span>
                  )}
                  <button
                    onClick={() => nextTask && handleNavigate(nextTask.task_id)}
                    disabled={!nextTask}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#64748B] border border-[#FED7AA] rounded-xl hover:border-[#F37021] hover:text-[#F37021] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    โจทย์ต่อไป
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Run feedback */}
          {runFeedback && (
            <div className={`rounded-2xl border p-4 shadow-sm ${runFeedback.is_correct ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center gap-2">
                {runFeedback.is_correct ? (
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className={`font-bold text-sm ${runFeedback.is_correct ? "text-green-700" : "text-red-700"}`}>
                  {runFeedback.is_correct ? "ถูกต้อง" : "ยังไม่ถูกต้อง"}
                </span>
                {canShowScore && runFeedback.is_correct && (
                  <span className="ml-auto text-sm font-bold text-green-700">+{runFeedback.score} pts</span>
                )}
              </div>
              {!runFeedback.is_correct && isAssignmentSet && (
                <p className="text-sm text-red-600 mt-1.5 leading-relaxed">
                  {runFeedback.error_message ?? "ยังไม่ถูกต้อง กรุณาตรวจสอบคำสั่ง SQL แล้วลองอีกครั้ง"}
                </p>
              )}
            </div>
          )}

          {/* Expected output — Assignment Set only, after a correct run */}
          {canShowExpected && runFeedback?.is_correct && extra?.expected_output_json && (
            <div className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden shadow-sm">
              <div className="bg-[#FFF7ED] border-b border-[#FED7AA] px-4 py-2.5">
                <h2 className="text-[#0F172A] font-bold text-sm">Expected Output</h2>
              </div>
              <div className="p-4">
                <DataTable rows={extra.expected_output_json} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
