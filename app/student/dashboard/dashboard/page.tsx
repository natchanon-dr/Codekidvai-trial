"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrCreateCurrentProfile } from "@/services/profile-service";
import { getAssignedTasksForStudent, type AssignedStudentTask } from "@/services/student-assignment-service";
import type { Profile } from "@/types/dataset";

export default function StudentDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<AssignedStudentTask[]>([]);

  useEffect(() => {
    async function init() {
      const p = await getOrCreateCurrentProfile();
      if (!p.consent_accepted) { router.push("/consent"); return; }
      setProfile(p);
      setTasks(await getAssignedTasksForStudent());
    }
    init();
  }, [router]);

  return <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
    <h1>Student Dashboard</h1>
    <p>Participant: {profile?.participant_code}</p>
    <h2>Assigned Tasks</h2>
    {tasks.map((task) => <div key={task.assignment_id} style={{ border: "1px solid #ddd", padding: 16, marginBottom: 12 }}>
      <h3>{task.assigned_order}. {task.task_title}</h3>
      <p>{task.problem_statement ?? task.task_description}</p>
      <p>Batch: {task.batch_code} | Type: {task.task_type} | Status: {task.assignment_status}</p>
      {task.is_unlocked ? <Link href={`/student/task/${task.task_id}`}>Start Task</Link> : <span>Locked</span>}
    </div>)}
  </main>;
}
