"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type Profile = {
  profile_id: string;
  display_name: string | null;
  participant_code: string | null;
  role: string | null;
};

type Assignment = {
  assignment_id: string;
  task_id: string;
  assigned_order: number | null;
  is_required: boolean | null;
  is_unlocked: boolean | null;
  status: string | null;
  assigned_at: string | null;
};

type Task = {
  task_id: string;
  task_code: string;
  task_title: string;
  task_type: string;
  difficulty_level: string | null;
  task_status: string | null;
};

type DashboardTask = Assignment & {
  task?: Task;
};

export default function StudentDashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.push("/auth/login");
      return;
    }

    setEmail(userData.user.email ?? "");

    const { data: profileData, error: profileError } = await supabase
      .from("mst_profiles")
      .select("profile_id, display_name, participant_code, role")
      .eq("auth_user_id", userData.user.id)
      .single();

    if (profileError || !profileData) {
      setErrorMessage(profileError?.message || "Profile not found.");
      setLoading(false);
      return;
    }

    setProfile(profileData);

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("trn_task_assignments")
      .select(
        "assignment_id, task_id, assigned_order, is_required, is_unlocked, status, assigned_at"
      )
      .eq("profile_id", profileData.profile_id)
      .order("assigned_order", { ascending: true });

    if (assignmentError) {
      setErrorMessage(assignmentError.message);
      setLoading(false);
      return;
    }

    const assignments = assignmentData ?? [];
    const taskIds = assignments.map((item) => item.task_id);

    if (taskIds.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("mst_tasks")
      .select(
        "task_id, task_code, task_title, task_type, difficulty_level, task_status"
      )
      .in("task_id", taskIds);

    if (taskError) {
      setErrorMessage(taskError.message);
      setLoading(false);
      return;
    }

    const taskMap = new Map<string, Task>();
    for (const task of taskData ?? []) {
      taskMap.set(task.task_id, task);
    }

    const dashboardTasks: DashboardTask[] = assignments.map((assignment) => ({
      ...assignment,
      task: taskMap.get(assignment.task_id),
    }));

    setTasks(dashboardTasks);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 960, margin: "40px auto", padding: 24 }}>
        <h1>Student Dashboard</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>Student Dashboard</h1>
          <p>Welcome: {email}</p>
          {profile && (
            <p>
              Participant: <strong>{profile.participant_code}</strong>
            </p>
          )}
        </div>

        <button
          onClick={handleLogout}
          style={{
            height: 40,
            padding: "0 16px",
            background: "#dc2626",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {errorMessage && (
        <p style={{ color: "red", marginTop: 24 }}>{errorMessage}</p>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>Assigned Tasks</h2>

        {tasks.length === 0 ? (
          <p>No assigned tasks found.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
              marginTop: 16,
            }}
          >
            {tasks.map((item) => (
              <div
                key={item.assignment_id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 20,
                  background: "white",
                }}
              >
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {item.task?.task_code}
                </div>

                <h3 style={{ marginTop: 8 }}>
                  {item.task?.task_title || "Untitled Task"}
                </h3>

                <p style={{ color: "#64748b" }}>
                  Type: {item.task?.task_type}
                  <br />
                  Difficulty: {item.task?.difficulty_level || "-"}
                  <br />
                  Status: {item.status}
                </p>

                {item.is_unlocked ? (
                  <Link
                    href={`/student/task/${item.task_id}`}
                    style={{
                      display: "inline-block",
                      marginTop: 12,
                      padding: "10px 14px",
                      background: "#f37021",
                      color: "white",
                      borderRadius: 8,
                      textDecoration: "none",
                    }}
                  >
                    Start Task
                  </Link>
                ) : (
                  <button
                    disabled
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      background: "#e5e7eb",
                      color: "#64748b",
                      borderRadius: 8,
                      border: 0,
                    }}
                  >
                    Locked
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}