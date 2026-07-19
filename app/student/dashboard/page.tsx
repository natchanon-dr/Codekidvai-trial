"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  profile_id: string;
  display_name: string | null;
  participant_code: string | null;
};

type BatchItem = {
  batch_id: string;
  batch_code: string;
  batch_name: string;
  batch_type: string | null;
  set_type_id: number | null;
  task_family_code: string | null;
  total_tasks: number;
  done_tasks: number;
};

type ClassWithSets = {
  class_id: string;
  class_code: string;
  class_name: string;
  learner_group: string | null;
  learner_group_label: string | null;
  class_level: string | null;
  class_level_label: string | null;
  academic_year: string | null;
  term: string | null;
  teacher_name: string | null;
  total_assignment_sets: number;
  total_lab_sets: number;
  total_exam_sets: number;
  sets: {
    assignment: BatchItem[];
    lab: BatchItem[];
    exam: BatchItem[];
  };
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

type SetCategory = "assignment" | "lab" | "exam";

type View =
  | { kind: "classes" }
  | { kind: "sets"; selectedClass: ClassWithSets; category: SetCategory }
  | { kind: "tasks"; selectedClass: ClassWithSets | null; category: SetCategory | null; batch: BatchItem };

type LearnerGroupFilter = "" | "G1" | "G2" | "G3" | "G4";
type LevelFilter = "" | "L1" | "L2" | "L3" | "L4";

// ─── Constants ────────────────────────────────────────────────────────────────

type FamilyCode = "QT" | "SP" | "ER" | "QB";

const FAMILY_LABEL: Record<FamilyCode, string> = {
  QT: "SQL Text",
  SP: "Stored Procedure",
  ER: "ER Diagram",
  QB: "SQL Block",
};

const ALL_FAMILIES: FamilyCode[] = ["QT", "QB", "ER", "SP"];

const CATEGORY_LABELS: Record<SetCategory, string> = {
  assignment: "Assignment Sets",
  lab: "Lab Sets",
  exam: "Exam Sets",
};

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
  { value: "L1", short: "1", label: "L1 Beginner" },
  { value: "L2", short: "2", label: "L2 Foundation" },
  { value: "L3", short: "3", label: "L3 Intermediate" },
  { value: "L4", short: "4", label: "L4 Advanced" },
];

// ─── Batch classification (identical to existing dashboard logic) ──────────────

function getFamilyCode(batch: BatchItem): FamilyCode {
  if (batch.task_family_code && batch.task_family_code in FAMILY_LABEL)
    return batch.task_family_code as FamilyCode;
  if (batch.batch_code?.startsWith("AQT") || batch.batch_code?.startsWith("EQT")) return "QT";
  if (batch.batch_code?.startsWith("ASP") || batch.batch_code?.startsWith("ESP")) return "SP";
  if (batch.batch_code?.startsWith("AER") || batch.batch_code?.startsWith("EER")) return "ER";
  if (batch.batch_code?.startsWith("AQB") || batch.batch_code?.startsWith("EQB")) return "QB";
  return "QT";
}

function familyBreakdown(list: BatchItem[]): Partial<Record<FamilyCode, number>> {
  const counts: Partial<Record<FamilyCode, number>> = {};
  for (const b of list) {
    const fc = getFamilyCode(b);
    counts[fc] = (counts[fc] ?? 0) + 1;
  }
  return counts;
}

// ─── Filter button groups ─────────────────────────────────────────────────────

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

// ─── Shared sub-components (preserved from original) ─────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border-green-200",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200",
    assigned: "bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]",
  };
  const labelMap: Record<string, string> = {
    completed: "Done",
    in_progress: "In Progress",
    assigned: "Not Started",
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorMap[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {labelMap[status] ?? status}
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
      <span className="text-[10px] text-[#64748B] text-center leading-tight">{done} of {total} done</span>
    </div>
  );
}

function FamilyIcon({ code, className = "w-5 h-5" }: { code: FamilyCode; className?: string }) {
  const cls = `${className} text-[#F37021]`;
  if (code === "QT")
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4h10" /><path d="M9 4v16" /><path d="M15 4v16" /><path d="M7 20h10" />
      </svg>
    );
  if (code === "QB")
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 3h3v3a2 2 0 1 0 4 0V3h3A2.5 2.5 0 0 1 21 5.5v3h-3a2 2 0 1 0 0 4h3v3A2.5 2.5 0 0 1 18.5 18h-3v-3a2 2 0 1 0-4 0v3h-3A2.5 2.5 0 0 1 6 15.5v-3H3a2 2 0 1 1 0-4h3v-3A2.5 2.5 0 0 1 8.5 3Z" />
      </svg>
    );
  if (code === "ER")
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
        <path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" />
        <path d="M6.5 9v5a3 3 0 0 0 3 3H14" />
      </svg>
    );
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

// ─── Category tile inside expanded class ──────────────────────────────────────

function CategoryTile({
  icon,
  title,
  subtitle,
  count,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 opacity-50 cursor-not-allowed">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#64748B]">{title}</p>
          <p className="text-[11px] text-[#CBD5E1]">{subtitle}</p>
        </div>
        <span className="text-xs text-[#CBD5E1] font-semibold">Coming soon</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FFF7ED] transition-colors text-left"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#0F172A]">{title}</p>
        <p className="text-[11px] text-[#64748B]">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-bold text-[#F37021]">{count} set{count !== 1 ? "s" : ""}</span>
        <svg className="w-4 h-4 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// ─── Class card ───────────────────────────────────────────────────────────────

function ClassCard({
  cls,
  expanded,
  onToggle,
  onCategoryClick,
}: {
  cls: ClassWithSets;
  expanded: boolean;
  onToggle: () => void;
  onCategoryClick: (category: SetCategory) => void;
}) {
  const totalSets = cls.total_assignment_sets + cls.total_lab_sets + cls.total_exam_sets;

  return (
    <article className="bg-white border border-[#FED7AA] rounded-2xl shadow-sm overflow-hidden">
      {/* Card header — click to expand */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-[#FFFBF5] transition-colors flex items-start gap-4"
      >
        {/* Class icon */}
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center mt-0.5">
          <svg className="w-5 h-5 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 21.5a12.083 12.083 0 01-6.16-10.922L12 14z" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="font-mono text-xs font-bold text-[#F37021]">{cls.class_code}</span>
            {cls.learner_group_label && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                {cls.learner_group_label}
              </span>
            )}
            {cls.class_level_label && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA]">
                {cls.class_level} · {cls.class_level_label}
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-[#0F172A] leading-snug">{cls.class_name}</h3>
          <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-[#64748B]">
            {cls.teacher_name && <span>Instructor: {cls.teacher_name}</span>}
            {cls.academic_year && <span>·</span>}
            {cls.academic_year && <span>Year {cls.academic_year}</span>}
            {cls.term && <span>Term {cls.term}</span>}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">{totalSets} set{totalSets !== 1 ? "s" : ""} total</p>
        </div>

        {/* Expand chevron */}
        <svg
          className={`flex-shrink-0 w-5 h-5 text-[#94A3B8] transition-transform mt-1 ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#FED7AA] divide-y divide-[#FED7AA]">
          <CategoryTile
            icon={
              <svg className="w-5 h-5 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 14l2 2 4-4" />
              </svg>
            }
            title="Assignment Sets"
            subtitle="Practice with feedback and hints"
            count={cls.total_assignment_sets}
            onClick={() => onCategoryClick("assignment")}
          />
          <CategoryTile
            icon={
              <svg className="w-5 h-5 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            title="Lab Sets"
            subtitle="Hands-on lab exercises"
            count={cls.total_lab_sets}
            onClick={() => onCategoryClick("lab")}
          />
          <CategoryTile
            icon={
              <svg className="w-5 h-5 text-[#F37021]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            title="Exam Sets"
            subtitle="Graded assessment — reviewed by instructor"
            count={cls.total_exam_sets}
            onClick={() => onCategoryClick("exam")}
          />
          <CategoryTile
            icon={
              <svg className="w-5 h-5 text-[#CBD5E1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            title="Assessment"
            subtitle="Assessment survey"
            count={0}
            disabled
            onClick={() => {}}
          />
        </div>
      )}
    </article>
  );
}

// ─── Set list card ────────────────────────────────────────────────────────────

function SetCard({
  batch,
  profileId,
  onOpen,
}: {
  batch: BatchItem;
  profileId: string;
  onOpen: () => void;
}) {
  const fc = getFamilyCode(batch);
  const allDone = batch.total_tasks > 0 && batch.done_tasks === batch.total_tasks;
  return (
    <div className="bg-white border border-[#FED7AA] rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={onOpen}
        className="w-full text-left px-5 py-4 hover:bg-[#FFFBF5] transition-all flex items-center gap-4"
      >
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center">
          <FamilyIcon code={fc} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#F37021] uppercase tracking-wide mb-0.5">
            {FAMILY_LABEL[fc]}
          </p>
          <p className="font-semibold text-[#0F172A] text-sm leading-snug truncate">{batch.batch_name}</p>
          <p className="text-[11px] text-[#64748B] mt-0.5">{batch.batch_code}</p>
        </div>
        <CircularProgress done={batch.done_tasks} total={batch.total_tasks} />
      </button>
      {allDone && (
        <div className="border-t border-[#FED7AA] px-5 py-3 bg-green-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-green-700">
            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All tasks completed
          </div>
          <BatchSubmitButton batch={batch} profileId={profileId} />
        </div>
      )}
    </div>
  );
}

// ─── Batch Submit Button (preserved from original) ────────────────────────────

function BatchSubmitButton({ batch, profileId }: { batch: BatchItem; profileId: string }) {
  const [status, setStatus] = useState<"init" | "idle" | "loading" | "done">("init");
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: existing } = await supabase
        .from("trn_batch_submissions")
        .select("batch_submission_id")
        .eq("batch_id", batch.batch_id)
        .eq("profile_id", profileId)
        .maybeSingle();
      setStatus(existing ? "done" : "idle");

      const { data: batchData } = await supabase
        .from("mst_experiment_batches")
        .select("created_by, mst_profiles!created_by(display_name)")
        .eq("batch_id", batch.batch_id)
        .single();
      const bd = batchData as { created_by?: string; mst_profiles?: { display_name?: string } } | null;
      setTeacherId(bd?.created_by ?? null);
      setTeacherName(bd?.mst_profiles?.display_name ?? null);
    }
    void load();
  }, [batch.batch_id, profileId]);

  async function handleSubmit() {
    if (status !== "idle") return;
    setStatus("loading");
    const { error } = await supabase
      .from("trn_batch_submissions")
      .insert({ batch_id: batch.batch_id, profile_id: profileId, teacher_id: teacherId });
    setStatus(error ? "idle" : "done");
  }

  if (status === "init") return null;

  if (status === "done") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Submitted to {teacherName ?? "instructor"}
      </span>
    );
  }

  return (
    <button
      onClick={handleSubmit}
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
      Submit to {teacherName ?? "instructor"}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<ClassWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "classes" });

  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [learnerGroupFilter, setLearnerGroupFilter] = useState<LearnerGroupFilter>("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");

  const [setsSearch, setSetsSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<FamilyCode | "all">("all");

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  type ProfileDetail = {
    display_name: string | null;
    email: string | null;
    participant_code: string;
    academy_member_id: string | null;
    academy_id: string | null;
    academy_name: string | null;
    academy_code: string | null;
  };
  const [profileDetail, setProfileDetail] = useState<ProfileDetail | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

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

    const token = await getToken();
    if (!token) { router.push("/auth/login"); return; }

    fetchProfileDetail(token);

    const res = await fetch("/api/student/dashboard/classes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setLoading(false); return; }

    const classData = (await res.json()) as ClassWithSets[];
    setClasses(classData);
    setLoading(false);

    // Restore ?batchId= URL param (backward compatibility)
    const returnBatchId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("batchId")
        : null;

    if (returnBatchId) {
      let foundBatch: BatchItem | null = null;
      let foundClass: ClassWithSets | null = null;
      let foundCategory: SetCategory | null = null;

      outer: for (const cls of classData) {
        for (const cat of ["assignment", "lab", "exam"] as SetCategory[]) {
          const match = cls.sets[cat].find((b) => b.batch_id === returnBatchId);
          if (match) { foundBatch = match; foundClass = cls; foundCategory = cat; break outer; }
        }
      }

      if (foundBatch) {
        window.history.replaceState(null, "", "/student/dashboard");
        await openBatch(foundBatch, foundClass, foundCategory, prof.profile_id);
      }
    }
  }

  async function openBatch(
    batch: BatchItem,
    selectedClass: ClassWithSets | null,
    category: SetCategory | null,
    overrideProfileId?: string,
  ) {
    setView({ kind: "tasks", selectedClass, category, batch });
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
      })),
    );
    setTasksLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { init(); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function fetchProfileDetail(token: string) {
    try {
      const res = await fetch("/api/profile/me", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setProfileDetail(await res.json());
    } catch { /* silent */ }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  function toggleExpand(classId: string) {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId); else next.add(classId);
      return next;
    });
  }

  function goBackToClass(cls: ClassWithSets) {
    setView({ kind: "classes" });
    setExpandedClasses((prev) => new Set([...prev, cls.class_id]));
  }

  const filteredClasses = classes.filter((cls) => {
    if (search) {
      const q = search.toLowerCase();
      if (!cls.class_name.toLowerCase().includes(q) && !cls.class_code.toLowerCase().includes(q)) return false;
    }
    if (learnerGroupFilter && cls.learner_group !== learnerGroupFilter) return false;
    if (levelFilter && cls.class_level !== levelFilter) return false;
    return true;
  });

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#64748B]">
          <svg className="animate-spin w-8 h-8 text-[#F37021]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  // ── Layout ──
  return (
    <div className="min-h-screen bg-[#FFF7ED]">

      {/* Top bar */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between sticky top-0 z-10">
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/student/classes")}
            className="text-xs font-semibold text-[#F37021] hover:text-[#C2410C] transition-colors"
          >
            My Classes
          </button>
          {/* Profile icon */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-8 h-8 rounded-full bg-[#FED7AA] flex items-center justify-center hover:bg-[#F37021] hover:text-white transition-colors text-[#F37021] border border-[#FED7AA]"
              title="Profile"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-10 w-72 bg-white border border-[#FED7AA] rounded-2xl shadow-lg z-50 p-4 space-y-3">
                {/* Name */}
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Name</p>
                  <p className="text-sm font-semibold text-[#0F172A]">{profileDetail?.display_name ?? profile?.display_name ?? "—"}</p>
                </div>
                {/* Email */}
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Email</p>
                  <p className="text-sm text-[#0F172A] break-all">{profileDetail?.email ?? "—"}</p>
                </div>
                <hr className="border-[#FED7AA]" />
                {/* Register Code */}
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Register Code</p>
                  <p className="text-sm font-mono font-semibold text-[#64748B]">{profileDetail?.participant_code ?? profile?.participant_code ?? "—"}</p>
                </div>
                {/* Academy ID */}
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Academy ID</p>
                  <p className="text-sm font-mono font-bold text-[#F37021]">{profileDetail?.academy_member_id ?? "—"}</p>
                </div>
                {/* Academy Name */}
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Academy</p>
                  <p className="text-sm text-[#0F172A]">{profileDetail?.academy_name ?? "—"}</p>
                </div>
                <hr className="border-[#FED7AA]" />
                {/* Switch / Add Academy */}
                <div className="flex gap-2">
                  <button className="flex-1 py-1.5 rounded-xl border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
                    Switch Academy
                  </button>
                  <button className="flex-1 py-1.5 rounded-xl border border-[#FED7AA] text-xs font-semibold text-[#64748B] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
                    Add Academy
                  </button>
                </div>
                {/* Sign Out */}
                <button
                  onClick={handleLogout}
                  className="w-full py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-[#64748B] mb-6 flex-wrap">
          <button
            onClick={() => setView({ kind: "classes" })}
            className={view.kind === "classes" ? "font-semibold text-[#0F172A]" : "hover:text-[#F37021] transition-colors"}
          >
            Student Dashboard
          </button>

          {view.kind === "sets" && (
            <>
              <span>/</span>
              <button
                onClick={() => goBackToClass(view.selectedClass)}
                className="hover:text-[#F37021] transition-colors truncate max-w-[140px]"
              >
                {view.selectedClass.class_name}
              </button>
              <span>/</span>
              <span className="font-semibold text-[#0F172A]">{CATEGORY_LABELS[view.category]}</span>
            </>
          )}

          {view.kind === "tasks" && (
            <>
              {view.selectedClass && view.category && (
                <>
                  <span>/</span>
                  <button
                    onClick={() => goBackToClass(view.selectedClass!)}
                    className="hover:text-[#F37021] transition-colors truncate max-w-[120px]"
                  >
                    {view.selectedClass.class_name}
                  </button>
                  <span>/</span>
                  <button
                    onClick={() =>
                      setView({ kind: "sets", selectedClass: view.selectedClass!, category: view.category! })
                    }
                    className="hover:text-[#F37021] transition-colors"
                  >
                    {CATEGORY_LABELS[view.category]}
                  </button>
                </>
              )}
              <span>/</span>
              <span className="font-semibold text-[#0F172A] truncate max-w-[160px]">{view.batch.batch_name}</span>
            </>
          )}
        </nav>

        {/* ══════════════════════════════════════════════════════ */}
        {/* VIEW: CLASSES                                          */}
        {/* ══════════════════════════════════════════════════════ */}
        {view.kind === "classes" && (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-[#0F172A] mb-0.5">
                Hello{profile?.display_name ? `, ${profile.display_name}` : ""}!
              </h1>
              <p className="text-sm text-[#64748B]">Select a class to start working on your assignments.</p>
            </div>

            {/* Search + filter bar */}
            <div className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-row items-center gap-3 mb-5 overflow-x-auto">
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

            {/* Class list */}
            {classes.length === 0 ? (
              <div className="rounded-2xl border border-[#FED7AA] bg-white p-10 text-center">
                <svg className="w-10 h-10 text-[#FED7AA] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 14l9-5-9-5-9 5 9 5zm0 7l-9-5 9-5 9 5-9 5z" />
                </svg>
                <p className="text-sm text-[#64748B]">You have not enrolled in any class yet.</p>
                <button
                  onClick={() => router.push("/student/classes")}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#F37021] text-white text-xs font-semibold hover:bg-[#C2410C] transition-colors"
                >
                  Join a Class
                </button>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="rounded-2xl border border-[#FED7AA] bg-white p-8 text-center text-sm text-[#64748B]">
                No classes match your search.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredClasses.map((cls) => (
                  <ClassCard
                    key={cls.class_id}
                    cls={cls}
                    expanded={expandedClasses.has(cls.class_id)}
                    onToggle={() => toggleExpand(cls.class_id)}
                    onCategoryClick={(category) => {
                      setFamilyFilter("all");
                      setSetsSearch("");
                      setView({ kind: "sets", selectedClass: cls, category });
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* VIEW: SETS                                             */}
        {/* ══════════════════════════════════════════════════════ */}
        {view.kind === "sets" && (() => {
          const list = view.selectedClass.sets[view.category];
          const breakdown = familyBreakdown(list);
          return (
            <>
              <div className="mb-5">
                <h2 className="text-lg font-bold text-[#0F172A]">{CATEGORY_LABELS[view.category]}</h2>
                <p className="text-sm text-[#64748B] mt-0.5">
                  {view.selectedClass.class_name} · {list.length} set{list.length !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Search + Family filter — one row (assignment/lab only, not exam) */}
              {list.length > 0 && view.category !== "exam" && (
                <div className="flex items-center gap-2 mb-4">
                  {/* Search box — left, grows to fill */}
                  <input
                    type="text"
                    value={setsSearch}
                    onChange={(e) => setSetsSearch(e.target.value)}
                    placeholder="Search sets…"
                    className="flex-1 min-w-0 px-4 py-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                  />
                  {/* Filter buttons — right */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setFamilyFilter("all")}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        familyFilter === "all"
                          ? "bg-[#F37021] border-[#F37021] text-white"
                          : "bg-white border-[#FED7AA] text-[#64748B] hover:border-[#F37021] hover:text-[#F37021]"
                      }`}
                    >
                      All <span className="text-xs">{list.length}</span>
                    </button>
                    {ALL_FAMILIES.map((fc) => {
                      const count = breakdown[fc] ?? 0;
                      const active = familyFilter === fc;
                      return (
                        <button
                          key={fc}
                          onClick={() => setFamilyFilter(fc)}
                          title={FAMILY_LABEL[fc]}
                          className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                            active
                              ? "bg-[#F37021] border-[#F37021] text-white"
                              : "bg-white border-[#FED7AA] text-[#64748B] hover:border-[#F37021] hover:text-[#F37021]"
                          }`}
                        >
                          <FamilyIcon code={fc} className={`w-4 h-4 ${active ? "text-white" : "text-[#F37021]"}`} />
                          <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(() => {
                const isExam = view.category === "exam";
                const filtered = list.filter((b) => {
                  if (isExam) return true;
                  const matchFamily = familyFilter === "all" || b.task_family_code === familyFilter;
                  const q = setsSearch.trim().toLowerCase();
                  const matchSearch = !q || b.batch_name.toLowerCase().includes(q) || b.batch_code.toLowerCase().includes(q);
                  return matchFamily && matchSearch;
                });
                if (list.length === 0) return (
                  <div className="rounded-2xl border border-[#FED7AA] bg-white p-8 text-center text-sm text-[#64748B]">
                    No sets have been assigned in this category yet.
                  </div>
                );
                if (filtered.length === 0) return (
                  <div className="rounded-2xl border border-[#FED7AA] bg-white p-8 text-center text-sm text-[#64748B]">
                    No sets match your filter.
                  </div>
                );
                return (
                  <div className="flex flex-col gap-3">
                    {filtered.map((batch) => (
                      <SetCard
                        key={batch.batch_id}
                        batch={batch}
                        profileId={profile?.profile_id ?? ""}
                        onOpen={() => openBatch(batch, view.selectedClass, view.category)}
                      />
                    ))}
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* ══════════════════════════════════════════════════════ */}
        {/* VIEW: TASKS                                            */}
        {/* ══════════════════════════════════════════════════════ */}
        {view.kind === "tasks" && (
          <>
            <div className="mb-5">
              <h2 className="text-base font-bold text-[#0F172A] truncate">{view.batch.batch_name}</h2>
              <p className="text-xs text-[#64748B] mt-0.5">{view.batch.batch_code}</p>
            </div>

            {tasksLoading ? (
              <div className="flex justify-center py-12">
                <svg className="animate-spin w-6 h-6 text-[#F37021]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-2xl border border-[#FED7AA] bg-white p-8 text-center text-sm text-[#64748B]">
                No tasks in this set.
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
                        task.is_unlocked
                          ? "border-[#FED7AA] cursor-pointer hover:border-[#F37021] hover:shadow-sm transition-all"
                          : "border-gray-100 opacity-60"
                      }`}
                      onClick={() =>
                        task.is_unlocked &&
                        router.push(
                          `/student/task/${task.task_id}?batchId=${view.kind === "tasks" ? view.batch.batch_id : ""}`,
                        )
                      }
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-[11px] font-bold text-[#F37021]">
                        {task.assigned_order}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[#64748B] mb-0.5">{task.task_code}</p>
                        <p className="text-sm font-semibold text-[#0F172A] leading-snug truncate">{task.task_title}</p>
                      </div>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
