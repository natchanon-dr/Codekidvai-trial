"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Profile = {
  profile_id: string;
  display_name: string | null;
  role: string;
};

type BatchInfo = {
  batch_id: string;
  batch_code: string;
  batch_name: string;
  batch_description: string | null;
  set_type_id: number | null;
  batch_type: string;
  status: string;
};

type AssignmentRow = {
  assignment_id: string;
  batch_id: string;
  task_id: string;
  assigned_order: number;
  is_required: boolean;
  is_unlocked: boolean;
  status: string;
};

type TaskInfo = {
  task_id: string;
  task_code: string;
  task_title: string;
  task_type: string;
  difficulty_level: string;
};

type TaskItem = AssignmentRow & { task: TaskInfo };
type SetGroup = { batch: BatchInfo; items: TaskItem[] };
type View = "categories" | "sets" | "tasks";

// ─── Badge helpers ──────────────────────────────────────────────────────────────

function DifficultyBadge({ level }: { level: string }) {
  const cls =
    level === "easy"
      ? "bg-green-100 text-green-700 border-green-200"
      : level === "medium"
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full border ${cls}`}>
      {level}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-orange-50 text-[#C2410C] border-orange-200"
      : status === "in_progress"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]";
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full border ${cls} capitalize`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-[#FED7AA]/60 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-[#F37021] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[#64748B] whitespace-nowrap">{done}/{total}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-[#F37021]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [assignmentSets, setAssignmentSets] = useState<SetGroup[]>([]);
  const [examSets, setExamSets] = useState<SetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("categories");
  const [selectedTypeId, setSelectedTypeId] = useState<1 | 2 | null>(null);
  const [selectedSet, setSelectedSet] = useState<SetGroup | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      // 1. Auth user
      const { data: authData } = await dbClient.auth.getUser();
      console.log("current user:", authData.user);
      if (!authData.user) { router.push("/auth/login"); return; }
      setEmail(authData.user.email ?? "");

      // 2. Profile
      const { data: profileData, error: profileError } = await dbClient
        .from("mst_profiles")
        .select("profile_id, display_name, role")
        .eq("auth_user_id", authData.user.id)
        .single<Profile>();
      console.log("profileData:", profileData);
      if (profileError) { console.error("profileError:", profileError); setError(profileError.message); return; }
      if (!profileData) return;
      setDisplayName(profileData.display_name);

      // 3. Assignments for this profile
      const { data: assignmentData, error: assignmentError } = await dbClient
        .from("trn_task_assignments")
        .select("assignment_id, batch_id, task_id, assigned_order, is_required, is_unlocked, status")
        .eq("profile_id", profileData.profile_id)
        .order("assigned_order", { ascending: true });
      console.log("raw assignment rows:", assignmentData);
      if (assignmentError) { console.error("assignmentError:", assignmentError); setError(assignmentError.message); return; }
      if (!assignmentData?.length) return;

      // 4. Batches
      const batchIds = [...new Set((assignmentData as AssignmentRow[]).map((a) => a.batch_id))];
      const { data: batchData, error: batchError } = await dbClient
        .from("mst_experiment_batches")
        .select("batch_id, batch_code, batch_name, batch_description, set_type_id, batch_type, status")
        .in("batch_id", batchIds);
      if (batchError) { console.error("batchError:", batchError); setError(batchError.message); return; }

      // 5. Tasks
      const taskIds = [...new Set((assignmentData as AssignmentRow[]).map((a) => a.task_id))];
      const { data: taskData, error: taskError } = await dbClient
        .from("mst_tasks")
        .select("task_id, task_code, task_title, task_type, difficulty_level")
        .in("task_id", taskIds);
      if (taskError) { console.error("taskError:", taskError); setError(taskError.message); return; }

      // 6. Build SetGroup map
      const batchMap = new Map<string, BatchInfo>(
        ((batchData ?? []) as BatchInfo[]).map((b) => [b.batch_id, b])
      );
      const taskMap = new Map<string, TaskInfo>(
        ((taskData ?? []) as TaskInfo[]).map((t) => [t.task_id, t])
      );

      const groups = new Map<string, SetGroup>();
      for (const a of (assignmentData as AssignmentRow[])) {
        const batch = batchMap.get(a.batch_id);
        const task = taskMap.get(a.task_id);
        if (!batch || !task) continue;
        if (!groups.has(a.batch_id)) groups.set(a.batch_id, { batch, items: [] });
        groups.get(a.batch_id)!.items.push({ ...a, task });
      }

      const allGroups = [...groups.values()];
      console.log("grouped sets:", allGroups);

      setAssignmentSets(allGroups.filter((g) => g.batch.set_type_id === 1));
      setExamSets(allGroups.filter((g) => g.batch.set_type_id === 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("loadDashboard error:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await dbClient.auth.signOut();
    router.push("/auth/login");
  }

  function goToSets(typeId: 1 | 2) {
    setSelectedTypeId(typeId);
    setView("sets");
  }

  function goToTasks(set: SetGroup) {
    setSelectedSet(set);
    setView("tasks");
  }

  function goBack() {
    if (view === "tasks") {
      setView("sets");
      setSelectedSet(null);
    } else {
      setView("categories");
      setSelectedTypeId(null);
    }
  }

  const currentSets = selectedTypeId === 1 ? assignmentSets : examSets;
  const categoryLabel = selectedTypeId === 1 ? "Assignment Sets" : "Exam Sets";

  // ─── Breadcrumb ──────────────────────────────────────────────────────────────

  function Breadcrumb() {
    return (
      <nav className="flex items-center gap-1.5 text-xs text-[#64748B] mb-6">
        <button
          onClick={() => { setView("categories"); setSelectedTypeId(null); setSelectedSet(null); }}
          className={`hover:text-[#F37021] transition-colors ${view === "categories" ? "text-[#0F172A] font-semibold pointer-events-none" : ""}`}
        >
          Dashboard
        </button>
        {view !== "categories" && (
          <>
            <svg className="w-3 h-3 text-[#FED7AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={() => { setView("sets"); setSelectedSet(null); }}
              className={`hover:text-[#F37021] transition-colors ${view === "sets" ? "text-[#0F172A] font-semibold pointer-events-none" : ""}`}
            >
              {categoryLabel}
            </button>
          </>
        )}
        {view === "tasks" && selectedSet && (
          <>
            <svg className="w-3 h-3 text-[#FED7AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[#0F172A] font-semibold truncate max-w-[180px]">
              {selectedSet.batch.batch_name}
            </span>
          </>
        )}
      </nav>
    );
  }

  // ─── Views ───────────────────────────────────────────────────────────────────

  function CategoriesView() {
    const totalAssignment = assignmentSets.reduce((s, g) => s + g.items.length, 0);
    const totalExam = examSets.reduce((s, g) => s + g.items.length, 0);

    return (
      <>
        <h2 className="text-base font-bold text-[#0F172A] mb-4">Choose Category</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Assignment Sets */}
          <button
            onClick={() => goToSets(1)}
            className="bg-white rounded-2xl border border-[#FED7AA] p-6 text-left hover:border-[#F37021] hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center mb-4 group-hover:bg-[#F37021]/10 transition-colors">
              <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <p className="text-base font-bold text-[#0F172A] mb-1">Assignment Sets</p>
            <p className="text-xs text-[#64748B] mb-3">Practice with feedback and hints enabled.</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F37021]">
                {assignmentSets.length} set{assignmentSets.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-[#64748B]">{totalAssignment} tasks</span>
            </div>
          </button>

          {/* Exam Sets */}
          <button
            onClick={() => goToSets(2)}
            className="bg-white rounded-2xl border border-[#FED7AA] p-6 text-left hover:border-[#F37021] hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center mb-4 group-hover:bg-[#F37021]/10 transition-colors">
              <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-base font-bold text-[#0F172A] mb-1">Exam Sets</p>
            <p className="text-xs text-[#64748B] mb-3">Formal assessment — teacher review only.</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F37021]">
                {examSets.length} set{examSets.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-[#64748B]">{totalExam} tasks</span>
            </div>
          </button>
        </div>
      </>
    );
  }

  function SetsView() {
    const isExam = selectedTypeId === 2;
    return (
      <>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#F37021] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h2 className="text-base font-bold text-[#0F172A]">{categoryLabel}</h2>
          <span className="ml-auto text-xs text-[#64748B]">{currentSets.length} set{currentSets.length !== 1 ? "s" : ""}</span>
        </div>

        {currentSets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#FED7AA] p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#FFF7ED] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#0F172A]">
              No {isExam ? "exam" : "assignment"} sets assigned yet.
            </p>
            <p className="text-xs text-[#64748B] mt-1">Check back later or contact your teacher.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentSets.map((group) => {
              const done = group.items.filter((i) => i.status === "completed").length;
              const total = group.items.length;
              return (
                <button
                  key={group.batch.batch_id}
                  onClick={() => goToTasks(group)}
                  className="w-full bg-white rounded-2xl border border-[#FED7AA] p-5 text-left hover:border-[#F37021] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px] text-[#F37021] font-bold">{group.batch.batch_code}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${isExam ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                          {isExam ? "Exam Set" : "Assignment Set"}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-[#0F172A] truncate">{group.batch.batch_name}</p>
                      {group.batch.batch_description && (
                        <p className="text-xs text-[#64748B] mt-0.5 line-clamp-2 leading-relaxed">{group.batch.batch_description}</p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-[#F37021] flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <ProgressBar done={done} total={total} />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-[#64748B]">
                      {isExam ? "Teacher review only" : "Feedback enabled"}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold text-[#F37021]">
                      {done}/{total} completed
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function TasksView() {
    if (!selectedSet) return null;
    const { batch, items } = selectedSet;
    const done = items.filter((i) => i.status === "completed").length;

    return (
      <>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#F37021] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#0F172A] truncate">{batch.batch_name}</h2>
            <p className="text-xs text-[#64748B] font-mono">{batch.batch_code}</p>
          </div>
          <span className="ml-auto text-xs text-[#64748B] flex-shrink-0">{done}/{items.length} done</span>
        </div>

        {batch.batch_description && (
          <div className="bg-white border border-[#FED7AA] rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-[#64748B] leading-relaxed">{batch.batch_description}</p>
          </div>
        )}

        <div className="space-y-2">
          {items.map((item) => {
            const locked = !item.is_unlocked;
            return (
              <div
                key={item.assignment_id}
                onClick={() => { if (!locked) router.push(`/student/task/${item.task_id}`); }}
                className={`bg-white rounded-xl border p-4 flex items-center gap-3 transition ${
                  locked
                    ? "border-[#FED7AA] opacity-50 cursor-not-allowed"
                    : "border-[#FED7AA] hover:border-[#F37021] hover:shadow-sm cursor-pointer"
                }`}
              >
                {/* Order number */}
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-xs font-bold text-[#F37021]">
                  {item.assigned_order}
                </div>

                {/* Task info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-[10px] text-[#64748B]">{item.task.task_code}</span>
                    <DifficultyBadge level={item.task.difficulty_level} />
                  </div>
                  <p className="text-sm font-semibold text-[#0F172A] truncate">{item.task.task_title}</p>
                </div>

                {/* Right side */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {locked ? (
                    <svg className="w-4 h-4 text-[#64748B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ) : (
                    <StatusBadge status={item.status} />
                  )}
                  {!locked && (
                    <svg className="w-4 h-4 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ─── Shell ───────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      {/* Navbar */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-4 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-[#F37021] to-[#C2410C] rounded-2xl px-6 py-5 mb-8 text-white shadow-md">
          <p className="text-orange-100 text-xs mb-0.5">Welcome back</p>
          <h1 className="text-xl font-bold truncate">{displayName ?? email}</h1>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <p className="text-xs font-bold text-red-700 mb-1">Error loading data</p>
            <p className="text-xs text-red-600 font-mono break-all">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-[#64748B]">
            <Spinner />
            <span className="text-sm">Loading your assignments…</span>
          </div>
        )}

        {/* Main navigation views */}
        {!loading && (
          <>
            <Breadcrumb />
            {view === "categories" && <CategoriesView />}
            {view === "sets" && <SetsView />}
            {view === "tasks" && <TasksView />}
          </>
        )}
      </div>
    </main>
  );
}
