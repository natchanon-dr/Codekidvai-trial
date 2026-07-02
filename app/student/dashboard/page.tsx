"use client";

import { useEffect, useState } from "react";
import { dbClient } from "@/lib/db-client";
import { useRouter } from "next/navigation";

type Profile = {
  profile_id: string;
  display_name: string | null;
  role: string;
};

type Assignment = {
  assignment_id: string;
  task_id: string;
  assigned_order: number;
  assigned_group: string | null;
  is_required: boolean;
  is_unlocked: boolean;
  status: string;
};

type Task = {
  task_id: string;
  task_code: string;
  task_title: string;
  task_type: string;
  difficulty_level: string;
  task_status: string;
  is_active: boolean;
};

type AssignmentWithTask = Assignment & { task: Task };

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      // Step 1: get authenticated user
      const { data: authData } = await dbClient.auth.getUser();
      if (!authData.user) {
        router.push("/login");
        return;
      }
      setEmail(authData.user.email);

      // Step 2: get profile by auth_user_id
      const { data: profileData, error: profileError } = await dbClient
        .from("mst_profiles")
        .select("profile_id, display_name, role")
        .eq("auth_user_id", authData.user.id)
        .single();

      console.log("profileData:", profileData);
      if (profileError) console.error("profileError:", profileError);

      if (!profileData) {
        setLoading(false);
        return;
      }
      setDisplayName(profileData.display_name);

      // Step 3: get assignments for this profile, ordered by assigned_order
      const { data: assignmentData, error: assignmentError } = await dbClient
        .from("trn_task_assignments")
        .select(
          "assignment_id, task_id, assigned_order, assigned_group, is_required, is_unlocked, status"
        )
        .eq("profile_id", profileData.profile_id)
        .order("assigned_order", { ascending: true });

      console.log("assignmentData:", assignmentData);
      if (assignmentError) console.error("assignmentError:", assignmentError);

      if (!assignmentData || assignmentData.length === 0) {
        setLoading(false);
        return;
      }

      // Step 4: get task details for all assigned task_ids
      const taskIds = assignmentData.map((a: Assignment) => a.task_id);
      const { data: taskData, error: taskError } = await dbClient
        .from("mst_tasks")
        .select(
          "task_id, task_code, task_title, task_type, difficulty_level, task_status, is_active"
        )
        .in("task_id", taskIds);

      console.log("taskData:", taskData);
      if (taskError) console.error("taskError:", taskError);

      if (!taskData) {
        setLoading(false);
        return;
      }

      // Merge assignments with their task details
      const taskMap = new Map<string, Task>(taskData.map((t: Task) => [t.task_id, t]));
      const merged: AssignmentWithTask[] = assignmentData
        .filter((a: Assignment) => taskMap.has(a.task_id))
        .map((a: Assignment) => ({ ...a, task: taskMap.get(a.task_id)! }));

      setAssignments(merged);
      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    await dbClient.auth.signOut();
    router.push("/login");
  }

  // Badge helpers
  function difficultyColor(level: string) {
    if (level === "easy") return "bg-green-100 text-green-700";
    if (level === "medium") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  }

  function statusColor(status: string) {
    if (status === "completed") return "bg-[#F37021]/10 text-[#C2410C]";
    if (status === "in_progress") return "bg-blue-100 text-blue-700";
    return "bg-[#FED7AA] text-[#92400E]";
  }

  function taskTypeLabel(type: string) {
    const map: Record<string, string> = {
      sql_text: "SQL Text",
      sql_block: "SQL Block",
      er_diagram: "ER Diagram",
      stored_procedure: "Stored Procedure",
      coding_text: "Coding Text",
      coding_block: "Coding Block",
    };
    return map[type] ?? type;
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      {/* Navbar */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F37021] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-semibold text-[#0F172A] text-sm">KMITL Learning Research</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#64748B] hidden sm:block">{email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#C2410C] border border-[#FED7AA] hover:border-[#C2410C] rounded-lg transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-[#F37021] to-[#C2410C] rounded-2xl p-6 mb-8 text-white shadow-md">
          <p className="text-orange-100 text-sm mb-1">Welcome back</p>
          <h1 className="text-xl font-bold truncate">{displayName ?? email}</h1>
        </div>

        {/* Assignment section header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#0F172A]">Your Assignments</h2>
          {!loading && assignments.length > 0 && (
            <span className="text-xs text-[#64748B]">{assignments.length} task{assignments.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#FED7AA] p-5 animate-pulse">
                <div className="h-4 bg-[#FED7AA] rounded w-1/3 mb-3" />
                <div className="h-3 bg-[#FED7AA]/60 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && assignments.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#FED7AA] p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#FFF7ED] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#0F172A]">No assignments yet</p>
            <p className="text-xs text-[#64748B] mt-1">Your tasks will appear here once they are assigned.</p>
          </div>
        )}

        {/* Assignment cards */}
        {!loading && assignments.length > 0 && (
          <div className="space-y-3">
            {assignments.map((item) => (
              <div
                key={item.assignment_id}
                className={`bg-white rounded-2xl border p-5 transition ${
                  item.is_unlocked
                    ? "border-[#FED7AA] hover:border-[#F37021] hover:shadow-sm cursor-pointer"
                    : "border-[#FED7AA] opacity-60 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (item.is_unlocked) router.push(`/student/task/${item.task_id}`);
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: order + title */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-xs font-bold text-[#F37021]">
                      {item.assigned_order}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] truncate">{item.task.task_title}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">{item.task.task_code}</p>
                    </div>
                  </div>

                  {/* Right: lock icon or status badge */}
                  <div className="shrink-0 flex items-center gap-2">
                    {!item.is_unlocked && (
                      <svg className="w-4 h-4 text-[#64748B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(item.status)}`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {/* Bottom badges */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#F37021] border border-[#FED7AA]">
                    {taskTypeLabel(item.task.task_type)}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${difficultyColor(item.task.difficulty_level)}`}>
                    {item.task.difficulty_level}
                  </span>
                  {item.is_required && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                      required
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
