"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BlockSqlBuilder from "@/components/BlockSqlBuilder";
import { getOrCreateCurrentProfile } from "@/services/profile-service";
import { getAssignedTaskForStudent, type AssignedStudentTask } from "@/services/student-assignment-service";
import { getBlocksForStudentTask } from "@/services/student-block-service";
import { startLearningSession, markAssignmentInProgress } from "@/services/session-service";
import { logLearningEvent, calculateDurationFromStart } from "@/services/event-service";
import { runAnswerOnServer, submitAnswerOnServer } from "@/services/student-answer-api-service";
import { leaveSessionOnServer } from "@/services/student-session-api-service";
import type { LearningSession, Profile, StudentBlock } from "@/types/dataset";

export default function StudentTaskPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [task, setTask] = useState<AssignedStudentTask | null>(null);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [blocks, setBlocks] = useState<StudentBlock[]>([]);
  const [answer, setAnswer] = useState("");
  const [blockSql, setBlockSql] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { initializeTask(); }, []);

  async function initializeTask() {
    const p = await getOrCreateCurrentProfile();
    if (!p.consent_accepted) { router.push("/consent"); return; }
    const t = await getAssignedTaskForStudent(params.taskId);
    if (!t) throw new Error("Task is not assigned to this student.");
    const s = await startLearningSession({ profile_id: p.profile_id, task_id: t.task_id, batch_id: t.batch_id, assignment_id: t.assignment_id, user_agent: window.navigator.userAgent });
    await markAssignmentInProgress({ task_id: t.task_id, profile_id: p.profile_id });
    await logLearningEvent({ session_id: s.session_id, profile_id: p.profile_id, task_id: t.task_id, event_type: "session_start", event_value: "start_task", duration_from_start: 0 });
    await logLearningEvent({ session_id: s.session_id, profile_id: p.profile_id, task_id: t.task_id, event_type: "question_view", event_value: t.task_code, duration_from_start: 0 });
    setProfile(p); setTask(t); setSession(s);
    if (t.task_type === "sql_block") setBlocks(await getBlocksForStudentTask(t.task_id));
  }

  async function handleBlockEvent(eventType: "block_add" | "block_move" | "block_delete" | "block_submit", value: string, metadata?: Record<string, unknown>) {
    if (!profile || !task || !session) return;
    await logLearningEvent({ session_id: session.session_id, profile_id: profile.profile_id, task_id: task.task_id, event_type: eventType, event_value: value, duration_from_start: calculateDurationFromStart(session.started_at), metadata_json: metadata ?? null });
  }

  function getPayload() {
    if (task?.task_type === "sql_block") return { answer_text: blockSql, answer_json: { mode: "sql_block", selected_block_ids: selectedBlockIds, generated_sql: blockSql } };
    return { answer_text: answer, answer_json: { mode: "sql_text" } };
  }

  async function handleRun() {
    if (!task || !session) return;
    setSaving(true);
    try {
      const payload = getPayload();
      const result = await runAnswerOnServer({ session_id: session.session_id, task_id: task.task_id, ...payload });
      setMessage(result.is_correct ? "ถูกต้อง" : "ยังไม่ถูกต้อง");
    } finally { setSaving(false); }
  }

  async function handleSubmit() {
    if (!task || !session) return;
    setSaving(true);
    try {
      const payload = getPayload();
      if (task.task_type === "sql_block") await handleBlockEvent("block_submit", "submit_block_answer", payload.answer_json);
      await submitAnswerOnServer({ session_id: session.session_id, task_id: task.task_id, ...payload });
      router.push("/student/dashboard");
    } finally { setSaving(false); }
  }

  async function handleBack() {
    if (task && session) await leaveSessionOnServer({ session_id: session.session_id, task_id: task.task_id, reason: "back_to_dashboard" });
    router.push("/student/dashboard");
  }

  return <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
    <button onClick={handleBack}>Back to Dashboard</button>
    <h1>{task?.task_title}</h1>
    <p>{task?.problem_statement}</p>
    {task?.task_type === "sql_block" ? <BlockSqlBuilder blocks={blocks} disabled={saving} onSqlChange={(sql, ids) => { setBlockSql(sql); setSelectedBlockIds(ids); }} onBlockEvent={handleBlockEvent} /> : <textarea rows={8} value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ width: "100%", fontFamily: "monospace" }} />}
    {message && <p>{message}</p>}
    <button disabled={saving} onClick={handleRun}>Run</button>{" "}
    <button disabled={saving} onClick={handleSubmit}>Submit</button>
  </main>;
}
