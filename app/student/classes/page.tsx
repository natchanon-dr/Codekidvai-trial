"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassInfo = {
  class_id: string;
  class_code: string;
  class_name: string;
  class_level: string | null;
  class_section: string | null;
  academic_year: string | null;
  term: string | null;
  register_from: string | null;
  register_to: string | null;
};

type MyClassRow = {
  class_student_id: string;
  status: string;
  joined_at: string;
  can_withdraw: boolean;
  tb_classes: ClassInfo;
};

type AvailableClass = ClassInfo & {
  is_open_for_enrollment: boolean | null;
  learner_group: string | null;
};

// ─── Filter constants ─────────────────────────────────────────────────────────

type LearnerGroupFilter = "" | "G1" | "G2" | "G3" | "G4";
type LevelFilter = "" | "L1" | "L2" | "L3" | "L4";

const LEARNER_GROUP_BUTTONS: { value: LearnerGroupFilter; label: string; icon: React.ReactNode }[] = [
  {
    value: "G1",
    label: "Youth",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-1 1a5 5 0 00-5 5v1h12v-1a5 5 0 00-5-5h-2z" />
        <circle cx="10" cy="2" r="1" />
      </svg>
    ),
  },
  {
    value: "G2",
    label: "High School",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5 8.26V14a1 1 0 00.553.894l4 2a1 1 0 00.894 0l4-2A1 1 0 0015 14V8.26l2.606-1.116a1 1 0 000-1.79l-7-3zM10 14.618L6 12.618V9.47l4 1.714 4-1.714v3.148l-4 2z" />
      </svg>
    ),
  },
  {
    value: "G3",
    label: "Undergraduate",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 100 1.84l7 3 7-3a1 1 0 000-1.84l-7-3zM3 10.414V15a1 1 0 001 1h12a1 1 0 001-1v-4.586l-6 2.572-7-2.572z" />
      </svg>
    ),
  },
  {
    value: "G4",
    label: "General Public",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
];

const LEVEL_BUTTONS: { value: LevelFilter; short: string; label: string }[] = [
  { value: "L1", short: "1", label: "Level 1 · Beginner" },
  { value: "L2", short: "2", label: "Level 2 · Foundation" },
  { value: "L3", short: "3", label: "Level 3 · Intermediate" },
  { value: "L4", short: "4", label: "Level 4 · Advanced" },
];

function getLearnerGroupLabel(value: string): string {
  return LEARNER_GROUP_BUTTONS.find((b) => b.value === value)?.label ?? value;
}

function getLevelLabel(value: string): string {
  return LEVEL_BUTTONS.find((b) => b.value === value)?.label ?? value;
}

// ─── Segmented Button Groups ──────────────────────────────────────────────────

const BTN_ON = "bg-[#F37021] text-white";
const BTN_OFF = "text-[#64748B] hover:bg-[#FFF7ED]";

function LearnerGroupFilterGroup({
  value,
  onChange,
}: {
  value: LearnerGroupFilter;
  onChange: (v: LearnerGroupFilter) => void;
}) {
  return (
    <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white flex-shrink-0">
      {LEARNER_GROUP_BUTTONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-label={opt.label}
          title={opt.label}
          className={`inline-flex w-10 h-10 items-center justify-center border-r border-[#FED7AA] ${value === opt.value ? BTN_ON : BTN_OFF}`}
        >
          {opt.icon}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange("")}
        className={`inline-flex w-10 h-10 items-center justify-center text-[10px] font-bold uppercase ${value === "" ? BTN_ON : BTN_OFF}`}
      >
        ALL
      </button>
    </div>
  );
}

function LevelFilterGroup({
  value,
  onChange,
}: {
  value: LevelFilter;
  onChange: (v: LevelFilter) => void;
}) {
  return (
    <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white flex-shrink-0">
      {LEVEL_BUTTONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-label={opt.label}
          title={opt.label}
          className={`inline-flex w-10 h-10 items-center justify-center text-sm font-bold border-r border-[#FED7AA] ${value === opt.value ? BTN_ON : BTN_OFF}`}
        >
          {opt.short}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange("")}
        className={`inline-flex w-10 h-10 items-center justify-center text-[10px] font-bold uppercase ${value === "" ? BTN_ON : BTN_OFF}`}
      >
        ALL
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function getBearerToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  );
}


function IconX({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconSave({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" /><path d="M7 3v5h8" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentClassesPage() {
  const router = useRouter();

  // Refresh triggers
  const [myRefresh, setMyRefresh] = useState(0);
  const [availRefresh, setAvailRefresh] = useState(0);

  // My classes (from API)
  const [myClasses, setMyClasses] = useState<MyClassRow[]>([]);
  const [myLoading, setMyLoading] = useState(true);

  // Available classes (from API)
  const [available, setAvailable] = useState<AvailableClass[]>([]);
  const [availLoading, setAvailLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");
  const [learnerGroupFilter, setLearnerGroupFilter] = useState<LearnerGroupFilter>("");

  // Draft state — store data snapshots so filter changes don't lose items
  // joinDraftMap: class_id → AvailableClass (pending join)
  const [joinDraftMap, setJoinDraftMap] = useState<Map<string, AvailableClass>>(new Map());
  // withdrawDraftMap: class_student_id → MyClassRow (pending withdrawal)
  const [withdrawDraftMap, setWithdrawDraftMap] = useState<Map<string, MyClassRow>>(new Map());

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // ── Fetch my classes ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMyLoading(true);
      const token = await getBearerToken();
      if (!token) { router.push("/auth/login"); return; }
      const res = await fetch("/api/student/classes/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!cancelled && res.ok) setMyClasses(await res.json());
      if (!cancelled) setMyLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [router, myRefresh]);

  // ── Fetch available classes ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setAvailLoading(true);
      const token = await getBearerToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (levelFilter) params.set("level", levelFilter);
      if (learnerGroupFilter) params.set("learner_group", learnerGroupFilter);
      const res = await fetch(`/api/student/classes/available?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!cancelled && res.ok) setAvailable(await res.json());
      if (!cancelled) setAvailLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [search, levelFilter, learnerGroupFilter, availRefresh]);

  // ── Draft operations ──

  function addJoin(cls: AvailableClass) {
    setJoinDraftMap((prev) => new Map([...prev, [cls.class_id, cls]]));
    setSaveError(null);
    setSaveSuccess(null);
  }

  function removeJoin(classId: string) {
    setJoinDraftMap((prev) => {
      const next = new Map(prev);
      next.delete(classId);
      return next;
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function addWithdraw(row: MyClassRow) {
    setWithdrawDraftMap((prev) => new Map([...prev, [row.class_student_id, row]]));
    setSaveError(null);
    setSaveSuccess(null);
  }

  function removeWithdraw(classStudentId: string) {
    setWithdrawDraftMap((prev) => {
      const next = new Map(prev);
      next.delete(classStudentId);
      return next;
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function cancelAll() {
    setJoinDraftMap(new Map());
    setWithdrawDraftMap(new Map());
    setSaveError(null);
    setSaveSuccess(null);
  }

  async function saveAll() {
    if (joinDraftMap.size === 0 && withdrawDraftMap.size === 0) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const token = await getBearerToken();
    if (!token) { router.push("/auth/login"); setSaving(false); return; }

    const errors: string[] = [];
    let joinCount = 0;
    let leaveCount = 0;

    // Process joins
    for (const cls of joinDraftMap.values()) {
      const res = await fetch("/api/student/classes/join", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ class_code: cls.class_code }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        errors.push(`${cls.class_code}: ${j.error ?? "Error joining class."}`);
      } else {
        const j = (await res.json()) as { joined?: boolean; already_member?: boolean };
        if (!j.already_member) joinCount++;
      }
    }

    // Process withdrawals
    for (const row of withdrawDraftMap.values()) {
      const res = await fetch("/api/student/classes/leave", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: row.tb_classes.class_id }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        errors.push(j.error ?? "Error leaving class.");
      } else {
        leaveCount++;
      }
    }

    setSaving(false);

    // Always clear drafts and refresh — show errors for any that failed
    setJoinDraftMap(new Map());
    setWithdrawDraftMap(new Map());
    setMyRefresh((n) => n + 1);
    setAvailRefresh((n) => n + 1);

    if (errors.length > 0) {
      setSaveError(errors.join(" · "));
      return;
    }

    const parts: string[] = [];
    if (joinCount > 0) parts.push(`Joined ${joinCount} class${joinCount !== 1 ? "es" : ""}`);
    if (leaveCount > 0) parts.push(`Left ${leaveCount} class${leaveCount !== 1 ? "es" : ""}`);
    if (parts.length > 0) setSaveSuccess(parts.join(" · ") + " — saved.");
  }

  // ── Derived lists ──

  const hasDraft = joinDraftMap.size > 0 || withdrawDraftMap.size > 0;
  const draftCount = joinDraftMap.size + withdrawDraftMap.size;

  // My Classes: actual joined (not in withdrawDraft) + pending joins
  const activeMyClasses = myClasses.filter((r) => !withdrawDraftMap.has(r.class_student_id));
  const pendingJoinList = [...joinDraftMap.values()];

  // Join a Class: available not in joinDraft + pending withdrawals
  const availableToShow = available.filter((cls) => !joinDraftMap.has(cls.class_id));
  const pendingWithdrawList = [...withdrawDraftMap.values()];

  const myClassesEmpty = !myLoading && activeMyClasses.length === 0 && pendingJoinList.length === 0;
  const availEmpty = !availLoading && availableToShow.length === 0 && pendingWithdrawList.length === 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FFF7ED]">

      {/* Header */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href="/student/dashboard"
            className="text-sm font-semibold text-[#64748B] hover:text-[#F37021] transition-colors"
          >
            Student Dashboard
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">My Classes</span>
          <div className="min-w-[48px]" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-10">

        {/* Global messages */}
        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {saveSuccess}
          </div>
        )}

        {/* ══ MY CLASSES ════════════════════════════════════════════════════ */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">My Classes</h2>
              <p className="text-xs text-[#64748B] mt-0.5">Classes you are enrolled in</p>
            </div>
            {hasDraft && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={saveAll}
                  disabled={saving}
                  title={`Save ${draftCount} pending change${draftCount !== 1 ? "s" : ""}`}
                  className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-[#F37021] hover:bg-[#C2410C] disabled:opacity-50 text-white shadow-sm transition-colors"
                >
                  {saving ? <IconSpinner /> : <IconSave className="w-5 h-5" />}
                </button>
                <button
                  onClick={cancelAll}
                  disabled={saving}
                  title="Cancel all pending changes"
                  className="inline-flex w-10 h-10 items-center justify-center rounded-full border border-[#FED7AA] bg-white hover:bg-red-50 hover:border-red-200 text-[#64748B] hover:text-red-500 disabled:opacity-50 shadow-sm transition-colors"
                >
                  <IconX className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {myLoading ? (
            <div className="text-sm text-[#64748B] py-6 text-center">Loading…</div>
          ) : myClassesEmpty ? (
            <div className="rounded-2xl border border-[#FED7AA] bg-white p-6 text-center text-sm text-[#64748B]">
              You have not enrolled in any class yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">

              {/* Pending join (draft — not yet saved) */}
              {pendingJoinList.map((cls) => (
                <article
                  key={cls.class_id}
                  className="bg-white border border-[#F37021] rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-[#F37021]">{cls.class_code}</span>
                        {cls.learner_group && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                            {getLearnerGroupLabel(cls.learner_group)}
                          </span>
                        )}
                        {cls.class_level && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                            {getLevelLabel(cls.class_level)}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#F37021] border border-[#F37021]">
                          Pending Join
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A]">{cls.class_name}</h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#64748B]">
                        {cls.class_section && <span>{cls.class_section}</span>}
                        {cls.academic_year && <span>{cls.academic_year}</span>}
                        {cls.term && <span>Term {cls.term}</span>}
                        {cls.register_to && <span>Open until {formatDate(cls.register_to)}</span>}
                      </div>
                    </div>
                    {/* × to remove from joinDraft */}
                    <button
                      onClick={() => removeJoin(cls.class_id)}
                      title="Remove from pending join"
                      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#F37021] hover:bg-[#FFF7ED] border border-[#F37021] transition-colors"
                    >
                      <IconX />
                    </button>
                  </div>
                </article>
              ))}

              {/* Actual joined classes (not in withdrawDraft) */}
              {activeMyClasses.map((row) => {
                const cls = row.tb_classes;
                return (
                  <article
                    key={row.class_student_id}
                    className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-[#F37021]">{cls.class_code}</span>
                          {cls.class_level && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                              {getLevelLabel(cls.class_level)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-[#0F172A]">{cls.class_name}</h3>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#64748B]">
                          {cls.class_section && <span>{cls.class_section}</span>}
                          {cls.academic_year && <span>{cls.academic_year}</span>}
                          {cls.term && <span>Term {cls.term}</span>}
                          {cls.register_to && <span>Withdraw by {formatDate(cls.register_to)}</span>}
                        </div>
                      </div>
                      {/* − button: only when within registration period */}
                      <button
                        onClick={() => { if (row.can_withdraw) addWithdraw(row); }}
                        disabled={!row.can_withdraw}
                        title={
                          row.can_withdraw
                            ? "Leave this class"
                            : "Cannot leave outside the registration period"
                        }
                        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xl font-bold leading-none transition-colors ${
                          row.can_withdraw
                            ? "border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED]"
                            : "border border-gray-200 text-gray-300 cursor-not-allowed bg-white"
                        }`}
                      >
                        −
                      </button>
                    </div>
                  </article>
                );
              })}

            </div>
          )}
        </section>

        {/* ══ JOIN A CLASS ══════════════════════════════════════════════════ */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Join a Class</h2>
            <p className="text-xs text-[#64748B] mt-0.5">Classes available in your institution</p>
          </div>

          {/* Search + filters */}
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-row items-center gap-3 mb-4 overflow-x-auto">
            <input
              type="text"
              placeholder="Search by class name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 px-4 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />
            <LearnerGroupFilterGroup value={learnerGroupFilter} onChange={setLearnerGroupFilter} />
            <LevelFilterGroup value={levelFilter} onChange={setLevelFilter} />
          </div>

          {availLoading ? (
            <div className="text-sm text-[#64748B] py-6 text-center">Loading…</div>
          ) : availEmpty ? (
            <div className="rounded-2xl border border-[#FED7AA] bg-white p-6 text-center text-sm text-[#64748B]">
              No classes are currently open for enrollment.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">

              {/* Pending withdrawal (leaving — draft, not yet saved) */}
              {pendingWithdrawList.map((row) => {
                const cls = row.tb_classes;
                return (
                  <article
                    key={row.class_student_id}
                    className="bg-white border border-red-300 rounded-2xl p-5 shadow-sm bg-red-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-[#F37021]">{cls.class_code}</span>
                          {cls.class_level && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                              {getLevelLabel(cls.class_level)}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">
                            Pending Leave
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#0F172A]">{cls.class_name}</h3>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#64748B]">
                          {cls.class_section && <span>{cls.class_section}</span>}
                          {cls.academic_year && <span>{cls.academic_year}</span>}
                          {cls.term && <span>Term {cls.term}</span>}
                        </div>
                      </div>
                      {/* + to undo withdrawal draft */}
                      <button
                        onClick={() => removeWithdraw(row.class_student_id)}
                        title="Keep in My Classes"
                        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-red-500 hover:bg-red-100 border border-red-200 transition-colors"
                      >
                        <IconX className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Available classes */}
              {availableToShow.map((cls) => (
                <article
                  key={cls.class_id}
                  className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-[#F37021]">{cls.class_code}</span>
                        {cls.learner_group && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                            {getLearnerGroupLabel(cls.learner_group)}
                          </span>
                        )}
                        {cls.class_level && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                            {getLevelLabel(cls.class_level)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A]">{cls.class_name}</h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#64748B]">
                        {cls.class_section && <span>{cls.class_section}</span>}
                        {cls.academic_year && <span>{cls.academic_year}</span>}
                        {cls.term && <span>Term {cls.term}</span>}
                        {cls.register_to && <span>Open until {formatDate(cls.register_to)}</span>}
                      </div>
                    </div>
                    {/* + button */}
                    <button
                      onClick={() => addJoin(cls)}
                      title="Join this class"
                      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#FFF7ED] border border-[#FED7AA] text-[#F37021] hover:bg-[#F37021] hover:text-white hover:border-[#F37021] transition-colors"
                    >
                      <IconPlus />
                    </button>
                  </div>
                </article>
              ))}

            </div>
          )}
        </section>

      </main>
    </div>
  );
}
