"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  profile_id: string;
  display_name: string | null;
  participant_code: string | null;
};

type BatchInfo = {
  batch_id: string;
  batch_code: string;
  batch_name: string;
  batch_type: string | null;
  set_type_id: number | null;
  task_family_code: string | null;
  total_tasks: number;
  done_tasks: number;
};

type TaskItem = {
  assignment_id: string;
  task_id: string;
  task_code: string;
  task_title: string;
  task_description: string | null;
  difficulty_level: string | null;
  status: string;
  is_unlocked: boolean;
  assigned_order: number;
};

type View =
  | { kind: "category" }
  | { kind: "sets"; category: "assignment" | "exam" }
  | { kind: "tasks"; batch: BatchInfo };

// ─── Constants ────────────────────────────────────────────────────────────────

type FamilyCode = "QT" | "SP" | "ER" | "QB";

const FAMILY_LABEL: Record<FamilyCode, string> = {
  QT: "SQL Text",
  SP: "Stored Procedure",
  ER: "ER Diagram",
  QB: "SQL Block",
};

const ALL_FAMILIES: FamilyCode[] = ["QT", "SP", "ER", "QB"];

function getFamilyCode(batch: BatchInfo): FamilyCode {
  if (batch.task_family_code && batch.task_family_code in FAMILY_LABEL)
    return batch.task_family_code as FamilyCode;
  if (batch.batch_code?.startsWith("AQT") || batch.batch_code?.startsWith("EQT"))
    return "QT";
  if (batch.batch_code?.startsWith("ASP") || batch.batch_code?.startsWith("ESP"))
    return "SP";
  if (batch.batch_code?.startsWith("AER") || batch.batch_code?.startsWith("EER"))
    return "ER";
  if (batch.batch_code?.startsWith("AQB") || batch.batch_code?.startsWith("EQB"))
    return "QB";
  return "QT";
}

function isAssignment(batch: BatchInfo): boolean {
  return (
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    batch.batch_code?.startsWith("A")
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border-green-200",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200",
    assigned: "bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]",
  };
  const label: Record<string, string> = {
    completed: "สำเร็จ",
    in_progress: "กำลังทำ",
    assigned: "ยังไม่เริ่ม",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label[status] ?? status}
    </span>
  );
}

function CircularProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="relative w-[72px] h-[72px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#FED7AA" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={r}
            fill="none" stroke="#22c55e" strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-bold text-[#0F172A]">{done}/{total}</span>
        </div>
      </div>
      <span className="text-[10px] text-[#64748B] text-center leading-tight">ทำแล้ว {done} จาก {total} ข้อ</span>
    </div>
  );
}

function FamilyIcon({ code }: { code: FamilyCode }) {
  const cls = "w-8 h-8 text-[#F37021]";
  if (code === "QT")
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  if (code === "SP")
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    );
  if (code === "ER")
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "category" });

  // tasks for the tasks-view
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { router.push("/auth/login"); return; }

    const { data: prof } = await supabase
      .from("mst_profiles")
      .select("profile_id, display_name, participant_code")
      .eq("auth_user_id", user.id)
      .single();

    if (!prof) { router.push("/auth/login"); return; }
    setProfile(prof);

    // fetch batches the student has assignments in
    const { data: asgn } = await supabase
      .from("trn_task_assignments")
      .select("batch_id, status")
      .eq("profile_id", prof.profile_id);

    if (!asgn || asgn.length === 0) { setLoading(false); return; }

    const batchIds = [...new Set(asgn.map((a) => a.batch_id).filter(Boolean))];

    const { data: batchRows } = await supabase
      .from("mst_experiment_batches")
      .select("batch_id, batch_code, batch_name, batch_type, set_type_id, task_family_code")
      .in("batch_id", batchIds);

    if (!batchRows) { setLoading(false); return; }

    // count total and done per batch
    const totals: Record<string, number> = {};
    const done: Record<string, number> = {};
    for (const a of asgn) {
      if (!a.batch_id) continue;
      totals[a.batch_id] = (totals[a.batch_id] ?? 0) + 1;
      if (a.status === "completed") done[a.batch_id] = (done[a.batch_id] ?? 0) + 1;
    }

    const builtBatches = batchRows.map((b) => ({
      ...b,
      total_tasks: totals[b.batch_id] ?? 0,
      done_tasks: done[b.batch_id] ?? 0,
    }));
    setBatches(builtBatches);
    setLoading(false);

    // Restore batch view if ?batchId= is in URL
    const returnBatchId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("batchId")
      : null;
    if (returnBatchId) {
      const targetBatch = builtBatches.find((b) => b.batch_id === returnBatchId);
      if (targetBatch) {
        window.history.replaceState(null, "", "/student/dashboard");
        await openBatch(targetBatch, prof.profile_id);
      }
    }
  }

  async function openBatch(batch: BatchInfo, overrideProfileId?: string) {
    setView({ kind: "tasks", batch });
    setTasksLoading(true);
    setTasks([]);

    const profileId = overrideProfileId ?? profile?.profile_id ?? "";

    const { data: asgn } = await supabase
      .from("trn_task_assignments")
      .select("assignment_id, task_id, status, is_unlocked, assigned_order")
      .eq("profile_id", profileId)
      .eq("batch_id", batch.batch_id)
      .order("assigned_order", { ascending: true });

    if (!asgn || asgn.length === 0) { setTasksLoading(false); return; }

    const taskIds = asgn.map((a) => a.task_id);
    const { data: taskRows } = await supabase
      .from("mst_tasks")
      .select("task_id, task_code, task_title, task_description, difficulty_level")
      .in("task_id", taskIds);

    const taskMap = new Map((taskRows ?? []).map((t) => [t.task_id, t]));

    setTasks(
      asgn.map((a) => ({
        assignment_id: a.assignment_id,
        task_id: a.task_id,
        task_code: taskMap.get(a.task_id)?.task_code ?? "",
        task_title: taskMap.get(a.task_id)?.task_title ?? "Untitled",
        task_description: taskMap.get(a.task_id)?.task_description ?? null,
        difficulty_level: taskMap.get(a.task_id)?.difficulty_level ?? null,
        status: a.status ?? "assigned",
        is_unlocked: a.is_unlocked ?? true,
        assigned_order: a.assigned_order ?? 0,
      }))
    );
    setTasksLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  // ── derived ──
  const assignmentBatches = batches.filter(isAssignment);
  const examBatches = batches.filter((b) => !isAssignment(b));

  function familyBreakdown(list: BatchInfo[]) {
    const counts: Partial<Record<FamilyCode, number>> = {};
    for (const b of list) {
      const fc = getFamilyCode(b);
      counts[fc] = (counts[fc] ?? 0) + 1;
    }
    return counts;
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#64748B]">
          <svg className="animate-spin w-8 h-8 text-[#F37021]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">กำลังโหลด...</span>
        </div>
      </div>
    );
  }

  // ── Layout wrapper ──
  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      {/* Top bar */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#F37021] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 14l6.16-3.422A12.083 12.083 0 0112 21.5a12.083 12.083 0 01-6.16-10.922L12 14z" />
            </svg>
          </div>
          <span className="font-bold text-[#0F172A] text-sm">CodeKidVai</span>
        </div>
        <div className="flex items-center gap-4">
          {profile?.participant_code && (
            <span className="text-xs text-[#64748B]">รหัส: <span className="font-mono font-semibold text-[#0F172A]">{profile.participant_code}</span></span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-[#64748B] hover:text-red-600 transition-colors"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1.5 text-xs text-[#64748B] mb-6">
          <button
            onClick={() => setView({ kind: "category" })}
            className={view.kind === "category" ? "font-semibold text-[#0F172A]" : "hover:text-[#F37021] transition-colors"}
          >
            Dashboard
          </button>
          {(view.kind === "sets" || view.kind === "tasks") && (
            <>
              <span>/</span>
              <button
                onClick={() => setView({ kind: "sets", category: view.kind === "tasks" ? (isAssignment(view.batch) ? "assignment" : "exam") : view.category })}
                className={view.kind === "sets" ? "font-semibold text-[#0F172A]" : "hover:text-[#F37021] transition-colors"}
              >
                {view.kind === "tasks"
                  ? (isAssignment(view.batch) ? "ชุดแบบฝึกหัด" : "ชุดแบบทดสอบ")
                  : (view.category === "assignment" ? "ชุดแบบฝึกหัด" : "ชุดแบบทดสอบ")}
              </button>
            </>
          )}
          {view.kind === "tasks" && (
            <>
              <span>/</span>
              <span className="font-semibold text-[#0F172A] truncate max-w-[180px]">{view.batch.batch_name}</span>
            </>
          )}
        </nav>

        {/* ════════════════════════════════════════════════════ */}
        {/* VIEW: CATEGORY                                       */}
        {/* ════════════════════════════════════════════════════ */}
        {view.kind === "category" && (
          <>
            <h1 className="text-xl font-bold text-[#0F172A] mb-1">
              สวัสดี{profile?.display_name ? `, ${profile.display_name}` : ""} 👋
            </h1>
            <p className="text-sm text-[#64748B] mb-6">เลือกประเภทชุดที่ต้องการทำ</p>

            <h2 className="text-base font-bold text-[#0F172A] mb-3">เลือกประเภท</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Assignment card */}
              <CategoryCard
                title="ชุดแบบฝึกหัด"
                subtitle="ฝึกทำพร้อม feedback และ hints"
                icon={
                  <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
                totalSets={assignmentBatches.length}
                breakdown={familyBreakdown(assignmentBatches)}
                onClick={() => setView({ kind: "sets", category: "assignment" })}
              />
              {/* Exam card */}
              <CategoryCard
                title="ชุดแบบทดสอบ"
                subtitle="ประเมินผล — ตรวจสอบโดยอาจารย์"
                icon={
                  <svg className="w-6 h-6 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
                totalSets={examBatches.length}
                breakdown={familyBreakdown(examBatches)}
                onClick={() => setView({ kind: "sets", category: "exam" })}
              />
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════ */}
        {/* VIEW: SETS                                           */}
        {/* ════════════════════════════════════════════════════ */}
        {view.kind === "sets" && (() => {
          const list = view.category === "assignment" ? assignmentBatches : examBatches;
          return (
            <>
              <h2 className="text-lg font-bold text-[#0F172A] mb-1">
                {view.category === "assignment" ? "ชุดแบบฝึกหัด" : "ชุดแบบทดสอบ"}
              </h2>
              <p className="text-sm text-[#64748B] mb-5">
                {list.length} ชุด
              </p>

              {list.length === 0 ? (
                <div className="rounded-2xl border border-[#FED7AA] bg-white p-8 text-center text-sm text-[#64748B]">
                  ยังไม่มีชุดที่ได้รับมอบหมาย
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {list.map((batch) => {
                    const fc = getFamilyCode(batch);
                    const allDone = batch.total_tasks > 0 && batch.done_tasks === batch.total_tasks;
                    return (
                      <div key={batch.batch_id} className="bg-white border border-[#FED7AA] rounded-2xl shadow-sm overflow-hidden">
                        {/* Main row */}
                        <button
                          onClick={() => openBatch(batch)}
                          className="w-full text-left px-5 py-4 hover:bg-[#FFFBF5] transition-all flex items-center gap-4"
                        >
                          {/* Left: family icon */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex flex-col items-center justify-center gap-0.5">
                            <FamilyIcon code={fc} />
                          </div>
                          {/* Center */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-[#F37021] uppercase tracking-wide mb-0.5">
                              {FAMILY_LABEL[fc]}
                            </p>
                            <p className="font-semibold text-[#0F172A] text-sm leading-snug truncate">
                              {batch.batch_name}
                            </p>
                            <p className="text-[11px] text-[#64748B] mt-0.5">
                              {batch.batch_code}
                            </p>
                          </div>
                          {/* Right: progress */}
                          <CircularProgress done={batch.done_tasks} total={batch.total_tasks} />
                        </button>
                        {/* Submit to teacher row — shown when all tasks done */}
                        {allDone && (
                          <div className="border-t border-[#FED7AA] px-5 py-3 bg-green-50 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs text-green-700">
                              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              ทำครบทุกข้อแล้ว
                            </div>
                            <BatchSubmitButton batch={batch} profileId={profile!.profile_id} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* ════════════════════════════════════════════════════ */}
        {/* VIEW: TASKS                                          */}
        {/* ════════════════════════════════════════════════════ */}
        {view.kind === "tasks" && (
          <>
            <h2 className="text-base font-bold text-[#0F172A] mb-1 truncate">
              {view.batch.batch_name}
            </h2>
            <p className="text-xs text-[#64748B] mb-5">{view.batch.batch_code}</p>

            {tasksLoading ? (
              <div className="flex justify-center py-12">
                <svg className="animate-spin w-6 h-6 text-[#F37021]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-2xl border border-[#FED7AA] bg-white p-8 text-center text-sm text-[#64748B]">
                ไม่มีโจทย์ในชุดนี้
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {tasks.map((task) => {
                  const diffColor =
                    task.difficulty_level === "easy"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : task.difficulty_level === "medium"
                      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                      : "bg-red-100 text-red-700 border-red-200";
                  return (
                    <div
                      key={task.assignment_id}
                      className={`bg-white border rounded-xl px-4 py-3.5 flex items-center gap-3 ${
                        task.is_unlocked ? "border-[#FED7AA] cursor-pointer hover:border-[#F37021] hover:shadow-sm transition-all" : "border-gray-100 opacity-60"
                      }`}
                      onClick={() => task.is_unlocked && router.push(`/student/task/${task.task_id}?batchId=${view.kind === "tasks" ? view.batch.batch_id : ""}`)}
                    >
                      {/* Order number */}
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-[11px] font-bold text-[#F37021]">
                        {task.assigned_order}
                      </span>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[#64748B] mb-0.5">{task.task_code}</p>
                        <p className="text-sm font-semibold text-[#0F172A] leading-snug truncate">{task.task_title}</p>
                      </div>
                      {/* Right badges */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {task.difficulty_level && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${diffColor}`}>
                            {task.difficulty_level}
                          </span>
                        )}
                        <StatusBadge status={task.status} />
                        {task.is_unlocked ? (
                          <svg className="w-4 h-4 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  title, subtitle, icon, totalSets, breakdown, onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  totalSets: number;
  breakdown: Partial<Record<FamilyCode, number>>;
  onClick: () => void;
}) {
  const ALL_FAMILIES: FamilyCode[] = ["QT", "SP", "ER", "QB"];
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-[#F37021] transition-all flex flex-col gap-4"
    >
      {/* Icon + title */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-[#0F172A] text-sm leading-snug">{title}</p>
          <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug">{subtitle}</p>
        </div>
      </div>

      {/* Set count */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-[#F37021]">
          {totalSets} ชุด
        </span>
      </div>

      {/* Breakdown by family */}
      <div className="border-t border-[#FED7AA] pt-3 flex flex-col gap-1.5">
        {ALL_FAMILIES.map((fc) => {
          const count = breakdown[fc] ?? 0;
          return (
            <div key={fc} className="flex items-center justify-between text-[11px]">
              <span className="text-[#64748B]">{FAMILY_LABEL[fc]}</span>
              <span className={`font-semibold ${count > 0 ? "text-[#0F172A]" : "text-[#CBD5E1]"}`}>
                {count} ชุด
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ─── Batch Submit Button ──────────────────────────────────────────────────────

function BatchSubmitButton({ batch, profileId }: { batch: BatchInfo; profileId: string }) {
  const [status, setStatus] = useState<"init" | "idle" | "loading" | "done">("init");
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Check already submitted
      const { data: existing } = await supabase
        .from("trn_batch_submissions")
        .select("batch_submission_id, submitted_at")
        .eq("batch_id", batch.batch_id)
        .eq("profile_id", profileId)
        .maybeSingle();

      if (existing) { setStatus("done"); }
      else { setStatus("idle"); }

      // Fetch teacher name
      if (batch.batch_id) {
        const { data: batchData } = await supabase
          .from("mst_experiment_batches")
          .select("created_by, mst_profiles!created_by(display_name)")
          .eq("batch_id", batch.batch_id)
          .single();
        const bd = batchData as { created_by?: string; mst_profiles?: { display_name?: string } } | null;
        setTeacherId(bd?.created_by ?? null);
        setTeacherName(bd?.mst_profiles?.display_name ?? null);
      }
    }
    load();
  }, [batch.batch_id, profileId]);

  async function handleSubmitBatch() {
    if (status !== "idle") return;
    setStatus("loading");
    const { error } = await supabase
      .from("trn_batch_submissions")
      .insert({ batch_id: batch.batch_id, profile_id: profileId, teacher_id: teacherId });
    if (!error) setStatus("done");
    else setStatus("idle");
  }

  if (status === "init") return null;

  if (status === "done") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        ส่งให้{teacherName ?? "อาจารย์"}แล้ว
      </span>
    );
  }

  return (
    <button
      onClick={handleSubmitBatch}
      disabled={status === "loading"}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F37021] hover:bg-[#C2410C] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
    >
      {status === "loading" ? (
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      )}
      ส่งให้{teacherName ?? "อาจารย์"}
    </button>
  );
}
