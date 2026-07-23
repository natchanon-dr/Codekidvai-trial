"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { TaskTypeIcon } from "@/lib/task-type-utils";
import {
  SET_FAMILY_LABEL,
  BATCH_TYPE_VALUES,
  THESIS_TASK_TYPE_ORDER,
  THESIS_TASK_TYPE_LABEL,
  type BatchType,
  type SetFamily,
  type TaskType,
} from "@/lib/research-context";

// ─── Types ──────────────────────────────────────────────────────────────────

type DatasetOptionBasic = { id: string; label: string };

type SelectorOption<T extends string> = { value: T; label: string };

type BatchTypeOption = SelectorOption<BatchType> & {
  code: string;
  icon: string;
  aria_label: string;
};

type TaskTypeOption = SelectorOption<TaskType> & {
  dataset_label: string;
  code: string;
};

type ActiveScope = {
  dataset: string;
  batch_type: BatchType | null;
  set_family: string | null;
  task_type: TaskType | null;
};

type ScopedSummary = {
  learner_count: number;
  session_count: number;
  batch_type_filter: BatchType | null;
  task_type_filter: TaskType | null;
  grain: "session_level";
};

type UnavailableDimension = {
  dimension: string;
  ui_label: string;
  reason: string;
  canonical_values: string[];
};

type ValidityMetadata = {
  label_source: string;
  label_validity: string;
  evaluation_purpose: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
};

type DatasetRecord = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_id: string | null;
  task_id: string | null;
  active: boolean;
  usage_status: "used" | "not_used";
  session_count: number;
  learner_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type ApiResponse = {
  available_datasets: readonly DatasetOptionBasic[];
  available_batch_types: BatchTypeOption[];
  available_activity_types: (SelectorOption<string> & { code: string })[];
  available_task_types: TaskTypeOption[];
  active_scope: ActiveScope;
  scoped_summary: ScopedSummary;
  validity_metadata: ValidityMetadata;
  unavailable_dimensions: UnavailableDimension[];
  dataset_list: DatasetRecord[];
  dataset_list_count: number;
};

type CreateDatasetInput = {
  name: string;
  batch_type: BatchType;
  set_family: SetFamily;
  task_type: string;
  class_id: string | null;
  task_id: string | null;
};

type ModalMode = "create" | "edit" | "copy" | "delete" | "run" | "history" | null;

type PipelineRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

type AnalysisStep = {
  analysis: string;
  status: PipelineRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

type PipelineRun = {
  id: string;
  dataset_id: string;
  run_type: string;
  status: PipelineRunStatus;
  analysis_steps: AnalysisStep[] | null;
  started_at: string | null;
  completed_at: string | null;
  error_summary: string | null;
  initiated_by: string | null;
  created_at: string;
};

// ─── Dataset code display labels (dataset-specific) ─────────────────────────

const DATASET_TASK_LABEL: Record<string, string> = {
  sql_text:         "SQL Query",
  sql_block:        "Query Block",
  stored_procedure: "Stored Procedure",
  er_diagram:       "ER Diagram",
};

const DATASET_TASK_CODE: Record<string, string> = {
  sql_text:         "QT",
  sql_block:        "QB",
  stored_procedure: "SP",
  er_diagram:       "ER",
};

const BATCH_CODE: Record<string, string> = { main: "M", trial: "T", pilot: "P" };
const ACTIVITY_CODE: Record<string, string> = { assignment: "A", lab: "L", exam: "E" };

const DATASET_TASK_TYPES_IN_SCOPE = ["sql_text", "stored_procedure", "sql_block", "er_diagram"] as const;

// ─── Icons ───────────────────────────────────────────────────────────────────

function StarIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function DumbbellIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6.5 6.5h1v11h-1z" />
      <path d="M16.5 6.5h1v11h-1z" />
      <path d="M4.5 8.5h3" />
      <path d="M16.5 8.5h3" />
      <path d="M4.5 15.5h3" />
      <path d="M16.5 15.5h3" />
      <path d="M7.5 12h9" />
    </svg>
  );
}

function PaperAirplaneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}

function LightningIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.818a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.845-.143z" clipRule="evenodd" />
    </svg>
  );
}

function CircleEmptyIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function BatchIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon === "star") return <StarIcon className={className} />;
  if (icon === "dumbbell") return <DumbbellIcon className={className} />;
  if (icon === "paper-airplane") return <PaperAirplaneIcon className={className} />;
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ValidityNotice({ meta }: { meta: ValidityMetadata }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-xl mt-0.5" aria-hidden="true">⚠</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-amber-800 text-sm">Pilot Data Notice — Technical Validation Only</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wide">
              PILOT ONLY
            </span>
          </div>
          <p className="text-amber-600 text-xs mt-1.5 italic">{meta.data_warning}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono bg-white/70 border border-amber-200 rounded-lg p-3 min-w-0">
          <span className="text-[#64748B] break-all">evaluation_purpose</span>
          <span className="text-[#0F172A] break-all">= {meta.evaluation_purpose}</span>
          <span className="text-[#64748B] break-all">label_source</span>
          <span className="text-[#0F172A] break-all">= {meta.label_source}</span>
          <span className="text-[#64748B] break-all">label_validity</span>
          <span className="text-[#0F172A] break-all">= {meta.label_validity}</span>
          <span className="text-[#64748B] break-all">proxy_target_circularity</span>
          <span className="text-[#0F172A] break-all">= {String(meta.proxy_target_circularity)}</span>
          <span className="text-[#64748B] break-all">confirmatory_analysis_allowed</span>
          <span className="text-[#0F172A] break-all">= {String(meta.confirmatory_analysis_allowed)}</span>
        </div>
      </div>
    </div>
  );
}


function ToggleBtn({
  active,
  onClick,
  children,
  "aria-label": ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        active
          ? "bg-[#F37021] text-white border-[#F37021]"
          : "bg-white text-[#475569] border-[#E2E8F0] hover:border-[#F37021] hover:text-[#F37021]"
      }`}
    >
      {children}
    </button>
  );
}

function ScopeSummaryCard({ summary }: { summary: ScopedSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
        <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Learners</p>
        <p className="text-3xl font-bold text-[#0F172A] mt-1">{summary.learner_count}</p>
        <p className="text-[10px] text-[#94A3B8] mt-1">COUNT(DISTINCT participant_code)</p>
      </div>
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
        <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Sessions</p>
        <p className="text-3xl font-bold text-[#0F172A] mt-1">{summary.session_count}</p>
        <p className="text-[10px] text-[#94A3B8] mt-1">COUNT(DISTINCT session_id)</p>
      </div>
    </div>
  );
}

// ─── Modal overlay ───────────────────────────────────────────────────────────

function ModalOverlay({
  onClose,
  children,
  title,
}: {
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}) {
  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1F5F9]">
          <h2 className="font-semibold text-[#0F172A] text-sm">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-[#94A3B8] hover:text-[#0F172A] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Code preview helper ─────────────────────────────────────────────────────

function codePreview(batchType: string, setFamily: string, taskType: string): string | null {
  const b = BATCH_CODE[batchType];
  const a = ACTIVITY_CODE[setFamily];
  if (!b || !a) return null;
  // Exam has no task type — use "EX" as placeholder code segment
  const t = setFamily === "exam" ? "EX" : DATASET_TASK_CODE[taskType];
  if (!t) return null;
  return `${b}${a}${t}####`;
}

// ─── Create / Copy Modal ─────────────────────────────────────────────────────

type ClassOption   = { class_id: string; class_code: string; class_name: string; academic_year: number; term: number };
type TaskSetOption = { batch_id: string; batch_code: string | null; batch_name: string | null; family: string; task_type_counts: Record<string, number> };

function CreateModal({
  onClose,
  onCreated,
  prefill,
  isEdit = false,
  editDataset,
  token,
  contextSummary,
}: {
  onClose: () => void;
  onCreated: () => void;
  prefill?: Partial<CreateDatasetInput>;
  isEdit?: boolean;
  editDataset?: DatasetRecord;
  token: string;
  contextSummary?: { session_count: number; learner_count: number } | null;
}) {
  const [name, setName] = useState(prefill?.name ?? editDataset?.name ?? "");
  const [batchType, setBatchType] = useState<BatchType | "">(
    (prefill?.batch_type ?? editDataset?.batch_type ?? "") as BatchType | ""
  );
  const [setFamily, setSetFamily] = useState<SetFamily | "">(
    (prefill?.set_family ?? editDataset?.set_family ?? "") as SetFamily | ""
  );
  const [taskType, setTaskType] = useState(prefill?.task_type ?? editDataset?.task_type ?? "");
  const [classId, setClassId] = useState(prefill?.class_id ?? editDataset?.class_id ?? "");
  const [taskId, setTaskId] = useState(prefill?.task_id ?? editDataset?.task_id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Class & Task Set dropdown data
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [allSets, setAllSets] = useState<TaskSetOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSets, setLoadingSets] = useState(false);

  // Scoped session/learner counts for selected class
  const [scopedStats, setScopedStats] = useState<{ session_count: number; learner_count: number } | null>(null);

  // Load active classes once on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/researcher/classes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const j = await res.json() as { classes: ClassOption[] };
          setClasses(j.classes ?? []);
        }
      } finally {
        setLoadingClasses(false);
      }
    })();
  }, [token]);

  // Exam has no specific task type — auto-clear taskType when exam is selected
  useEffect(() => {
    if (setFamily === "exam") setTaskType("");
  }, [setFamily]);

  // Reload sets + scoped stats when class changes
  const isInitialClassLoad = useRef(true);
  useEffect(() => {
    if (!classId) { setAllSets([]); setTaskId(""); setScopedStats(null); isInitialClassLoad.current = false; return; }
    setLoadingSets(true);
    void Promise.all([
      fetch(`/api/researcher/classes/${classId}/sets`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() as Promise<{ sets: TaskSetOption[] }> : Promise.resolve({ sets: [] })),
      fetch(`/api/researcher/classes/${classId}/summary`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() as Promise<{ session_count: number; learner_count: number }> : Promise.resolve(null)),
    ]).then(([setsData, stats]) => {
      setAllSets(setsData.sets ?? []);
      // On initial load (edit/copy mode): keep existing taskId; on user class-change: clear
      if (!isInitialClassLoad.current) setTaskId("");
      isInitialClassLoad.current = false;
      setScopedStats(stats);
    }).finally(() => setLoadingSets(false));
  }, [classId, token]);

  // Visible sets: filter by selected activity type and task type
  const visibleSets = allSets.filter((s) => {
    if (setFamily && s.family !== setFamily) return false;
    if (taskType  && !(s.task_type_counts[taskType] > 0)) return false;
    return true;
  });

  const isUsed  = editDataset?.usage_status === "used";
  const preview = !isEdit ? codePreview(batchType, setFamily, taskType) : null;
  const taskTypeRequired = setFamily !== "exam";
  const canSave = !submitting && name.trim() !== "" && batchType !== "" && setFamily !== "" && (!taskTypeRequired || taskType !== "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isEdit && editDataset) {
        const body: Record<string, unknown> = { name };
        if (!isUsed) { body.class_id = classId || null; body.task_id = taskId || null; }
        const res = await fetch(`/api/researcher/dataset-analytics/${editDataset.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json() as { error?: string; field_errors?: Record<string, string> };
        if (!res.ok) {
          setError(j.error ?? "Failed to update dataset.");
          if (j.field_errors) setFieldErrors(j.field_errors);
          setSubmitting(false);
          return;
        }
      } else {
        const body: Record<string, unknown> = {
          name, batch_type: batchType, set_family: setFamily, task_type: taskType,
          class_id: classId || null, task_id: taskId || null,
        };
        const res = await fetch("/api/researcher/dataset-analytics", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json() as { error?: string; field_errors?: Record<string, string> };
        if (!res.ok) {
          setError(j.error ?? "Failed to create dataset.");
          if (j.field_errors) setFieldErrors(j.field_errors);
          setSubmitting(false);
          return;
        }
      }
      onCreated();
    } catch {
      setError("Network error — could not reach the server.");
      setSubmitting(false);
    }
  }

  const readonlyBox = "bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] rounded-lg px-3 py-2 text-sm";
  const inputCls    = "w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#F37021] bg-white";
  const selectCls   = "w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#F37021] bg-white appearance-none";

  // Icon-only selector group helpers
  function selectorGroup(children: React.ReactNode) {
    return <div className="flex rounded-xl border border-[#E2E8F0] overflow-hidden bg-white">{children}</div>;
  }
  function selectorBtn(
    key: string,
    active: boolean,
    onClick: () => void,
    title: string,
    icon: React.ReactNode,
    last = false,
  ) {
    return (
      <button key={key} type="button" title={title} aria-pressed={active} onClick={onClick}
        className={`flex items-center justify-center px-3 py-2.5 transition-colors ${last ? "" : "border-r border-[#E2E8F0]"} ${active ? "bg-[#F37021] text-white" : "text-[#475569] hover:bg-[#FFF7ED]"}`}>
        {icon}
      </button>
    );
  }

  const modalTitle = isEdit ? "Edit Dataset" : prefill ? "Copy Dataset" : "Create Dataset";

  return (
    <ModalOverlay onClose={onClose} title={modalTitle}>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-5 space-y-4">

        {/* ── 1. Code Preview (top) ── */}
        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1">
            {isEdit ? "Dataset Code" : "Code Preview"}
            {!isEdit && <span className="ml-1 font-normal text-[#94A3B8]">(provisional — number assigned on save)</span>}
          </label>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
            <span className="font-mono text-sm text-[#0F172A] tracking-widest">
              {isEdit
                ? editDataset?.code
                : preview ?? <span className="text-[#94A3B8] italic text-xs">Select Batch · Activity · Task Type</span>}
            </span>
          </div>
        </div>

        {/* ── 2. Dataset Name ── */}
        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1" htmlFor="ds-name">
            Dataset Name <span className="text-red-500">*</span>
          </label>
          <input id="ds-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
            className={inputCls} required maxLength={255} />
          {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
        </div>

        {/* ── 3–5. Batch · Activity · Task Type — icon selectors (locked in edit mode) ── */}
        <div className="flex flex-wrap gap-4 items-end">
          {/* Batch Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#475569]">
              Batch Type {!isEdit && <span className="text-red-500">*</span>}
              {isEdit && <span className="ml-1 text-[10px] text-[#94A3B8]">(locked)</span>}
            </label>
            <div className={`flex rounded-xl border overflow-hidden ${isEdit ? "border-[#E2E8F0] opacity-70 pointer-events-none" : "border-[#FED7AA]"} bg-white`}>
              {selectorBtn("main",  batchType === "main",  () => setBatchType("main"),  "Main",  <StarIcon className="w-4 h-4" />)}
              {selectorBtn("trial", batchType === "trial", () => setBatchType("trial"), "Trial", <DumbbellIcon className="w-4 h-4" />)}
              {selectorBtn("pilot", batchType === "pilot", () => setBatchType("pilot"), "Pilot", <PaperAirplaneIcon className="w-4 h-4" />, true)}
            </div>
          </div>
          {/* Activity Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#475569]">
              Activity Type {!isEdit && <span className="text-red-500">*</span>}
              {isEdit && <span className="ml-1 text-[10px] text-[#94A3B8]">(locked)</span>}
            </label>
            <div className={`flex rounded-xl border overflow-hidden ${isEdit ? "border-[#E2E8F0] opacity-70 pointer-events-none" : "border-[#FED7AA]"} bg-white`}>
              {selectorBtn("assignment", setFamily === "assignment", () => setSetFamily("assignment"), "Assignment",
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M9 5h6"/><path d="M9 12h6"/><path d="M9 17h4"/>
                  <path d="M5 7.5 6.5 9 9 6"/><path d="M5 14.5 6.5 16 9 13"/>
                  <rect x="4" y="3" width="16" height="18" rx="2"/>
                </svg>)}
              {selectorBtn("lab", setFamily === "lab", () => setSetFamily("lab"), "Lab",
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2"/>
                  <path d="M8 2h8"/><path d="M7 15h10"/>
                </svg>)}
              {selectorBtn("exam", setFamily === "exam", () => setSetFamily("exam"), "Exam",
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                  <path d="M14 2v6h6"/><path d="M9 14h6"/><path d="M9 18h4"/>
                </svg>, true)}
            </div>
          </div>
          {/* Task Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#475569]">
              Task Type {!isEdit && setFamily !== "exam" && <span className="text-red-500">*</span>}
              {isEdit && <span className="ml-1 text-[10px] text-[#94A3B8]">(locked)</span>}
            </label>
            {setFamily === "exam" ? (
              <div className="flex rounded-xl border border-[#E2E8F0] overflow-hidden bg-white opacity-70 cursor-not-allowed" title="Exam covers all task types">
                <span className="flex items-center gap-1.5 px-3 py-2.5 bg-[#F8FAFC] text-[#94A3B8] text-xs font-mono select-none">
                  EX <span className="font-sans">= All</span>
                </span>
              </div>
            ) : (
              <div className={`flex rounded-xl border overflow-hidden ${isEdit ? "border-[#E2E8F0] opacity-70 pointer-events-none" : "border-[#FED7AA]"} bg-white`}>
                {DATASET_TASK_TYPES_IN_SCOPE.map((v, i) =>
                  selectorBtn(v, taskType === v, () => setTaskType(v), DATASET_TASK_LABEL[v],
                    <TaskTypeIcon type={v} />,
                    i === DATASET_TASK_TYPES_IN_SCOPE.length - 1)
                )}
              </div>
            )}
            {fieldErrors.task_type && <p className="text-xs text-red-600">{fieldErrors.task_type}</p>}
          </div>
        </div>

        {/* ── 6. Class ── */}
        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1" htmlFor="ds-class">Class</label>
          {isUsed ? (
            <div className={readonlyBox}>
              {classes.find((c) => c.class_id === classId)?.class_name ?? classId ?? "—"}
              <span className="ml-1 text-[10px] text-[#94A3B8]">(locked)</span>
            </div>
          ) : (
            <select id="ds-class" value={classId} onChange={(e) => setClassId(e.target.value)}
              disabled={loadingClasses} className={selectCls}>
              <option value="">{loadingClasses ? "Loading…" : "— select class —"}</option>
              {classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.class_code} · {c.class_name} ({c.academic_year}/{c.term})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── 7. Task Set ── */}
        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1" htmlFor="ds-taskset">Task Set</label>
          {isUsed ? (
            <div className={readonlyBox}>
              {allSets.find((s) => s.batch_id === taskId)?.batch_name ?? taskId ?? "—"}
              <span className="ml-1 text-[10px] text-[#94A3B8]">(locked)</span>
            </div>
          ) : (
            <select id="ds-taskset" value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={!classId || loadingSets}
              className={selectCls}>
              <option value="">
                {!classId ? "— select class first —" : loadingSets ? "Loading…" : visibleSets.length === 0 ? "— no sets match —" : "— select task set —"}
              </option>
              {visibleSets.map((s) => (
                <option key={s.batch_id} value={s.batch_id}>
                  {s.batch_code ?? s.batch_id} · {s.batch_name ?? "Unnamed set"}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Summary strip: Usage · Status · Sessions · Learners ── */}
        {(() => {
          // Show class-scoped stats when class selected; otherwise 0
          const displayStats = classId ? (scopedStats ?? { session_count: 0, learner_count: 0 }) : { session_count: 0, learner_count: 0 };
          const statsLabel = classId && scopedStats ? "class" : null;
          return (
            <div className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#64748B]">
              {/* Usage */}
              <span className="flex items-center gap-1">
                {isEdit && editDataset?.usage_status === "used"
                  ? <LightningIcon className="w-3.5 h-3.5 text-[#F37021]" />
                  : <CircleEmptyIcon className="w-3.5 h-3.5 text-[#94A3B8]" />}
                <span>{isEdit ? (editDataset?.usage_status === "used" ? "Used" : "Not Used") : "Not Used"}</span>
              </span>
              {/* Status */}
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${isEdit && editDataset ? (editDataset.active ? "bg-emerald-500" : "bg-[#CBD5E1]") : "bg-emerald-500"}`} />
                <span>{isEdit && editDataset ? (editDataset.active ? "Active" : "Inactive") : "Active"}</span>
              </span>
              {/* Sessions */}
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#94A3B8]">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                <span className="font-mono">{loadingSets ? "…" : (displayStats?.session_count ?? "—")}</span>
                <span className="text-[#94A3B8]">sessions</span>
              </span>
              {/* Learners */}
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#94A3B8]">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span className="font-mono">{loadingSets ? "…" : (displayStats?.learner_count ?? "—")}</span>
                <span className="text-[#94A3B8]">learners</span>
              </span>
              {/* Source label */}
              {statsLabel && (
                <span className="ml-auto text-[10px] text-[#CBD5E1] italic">{statsLabel}</span>
              )}
            </div>
          );
        })()}

        {isEdit && isUsed && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            This dataset has been used in a run. Only the name can be updated.
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        {/* ── Actions: icon-only Save (+ icon Delete for unused edit) ── */}
        <div className="flex justify-end items-center gap-2 pt-2 border-t border-[#F1F5F9]">
          {isEdit && editDataset?.usage_status === "not_used" && (
            <button type="button" title="Delete dataset" onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          )}
          <button type="submit" title={isEdit ? "Save changes" : "Create dataset"}
            disabled={!canSave}
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
              canSave
                ? "bg-[#F37021] hover:bg-[#D45F10] text-white"
                : "bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed"
            }`}>
            {submitting
              ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <path d="M17 21v-8H7v8M7 3v5h8"/>
                </svg>
            }
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ─── Delete Confirmation Modal ───────────────────────────────────────────────

function DeleteModal({
  dataset,
  onClose,
  onDeleted,
  token,
}: {
  dataset: DatasetRecord;
  onClose: () => void;
  onDeleted: () => void;
  token: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${dataset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 204) {
        onDeleted();
        return;
      }
      const j = await res.json() as { error?: string };
      setError(j.error ?? "Failed to delete dataset.");
    } catch {
      setError("Network error.");
    }
    setSubmitting(false);
  }

  return (
    <ModalOverlay onClose={onClose} title="Delete Dataset">
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm text-[#0F172A]">
          Are you sure you want to delete dataset{" "}
          <span className="font-mono font-semibold">{dataset.code}</span>{" "}
          — <span className="font-semibold">{dataset.name}</span>?
        </p>
        <p className="text-xs text-[#64748B]">
          This action is permanent and cannot be undone. The code will not be reused.
        </p>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#475569] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleDelete(); }}
            disabled={submitting}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Delete Dataset"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Dataset List row ────────────────────────────────────────────────────────

function DatasetRow({
  ds,
  batchTypeOptions,
  token,
  onEdit,
  onCopy,
  onDelete,
  onToggled,
  onRunPipeline,
  onViewHistory,
}: {
  ds: DatasetRecord;
  batchTypeOptions: BatchTypeOption[];
  token: string;
  onEdit: (ds: DatasetRecord) => void;
  onCopy: (ds: DatasetRecord) => void;
  onDelete: (ds: DatasetRecord) => void;
  onToggled: (id: string, newActive: boolean) => void;
  onRunPipeline: (ds: DatasetRecord) => void;
  onViewHistory: (ds: DatasetRecord) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const bto = batchTypeOptions.find((b) => b.value === ds.batch_type);

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${ds.id}/active`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const j = await res.json() as { active: boolean };
        onToggled(ds.id, j.active);
      }
    } finally {
      setToggling(false);
    }
  }

  const iconCell = "px-2 py-3.5 whitespace-nowrap text-center align-middle";
  const numCell  = "px-2 py-3.5 whitespace-nowrap text-center align-middle";

  return (
    <tr className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7] transition-colors">
      {/* Code */}
      <td className="px-4 py-3.5 whitespace-nowrap align-middle">
        <span className="font-mono text-[11px] font-bold text-[#F37021] bg-[#FFF7ED] border border-[#FED7AA] px-2 py-1 rounded-lg tracking-widest">
          {ds.code}
        </span>
      </td>
      {/* Name */}
      <td className="px-3 py-3.5 align-middle min-w-[140px]">
        <span className="text-xs text-[#0F172A] font-medium leading-snug">{ds.name}</span>
      </td>
      {/* Batch Type */}
      <td className={iconCell}>
        {bto ? (
          <span title={bto.label} aria-label={bto.aria_label} className="inline-flex items-center justify-center">
            <BatchIcon icon={bto.icon} className="w-4 h-4 text-[#F37021]" />
          </span>
        ) : (
          <span className="text-[10px] text-[#94A3B8]">{ds.batch_type}</span>
        )}
      </td>
      {/* Activity */}
      <td className={iconCell}>
        <span title={SET_FAMILY_LABEL[ds.set_family as "assignment" | "lab" | "exam"] ?? ds.set_family} className="inline-flex items-center justify-center text-[#64748B]">
          {ds.set_family === "assignment" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 14h6"/><path d="M9 18h4"/></svg>}
          {ds.set_family === "lab" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 3h6v7l4 8H5L9 10z"/><line x1="6" y1="14" x2="18" y2="14"/></svg>}
          {ds.set_family === "exam" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
        </span>
      </td>
      {/* Task Type */}
      <td className={iconCell}>
        {ds.task_type ? (
          <span title={DATASET_TASK_LABEL[ds.task_type] ?? ds.task_type} className="inline-flex items-center justify-center text-[#64748B]">
            <TaskTypeIcon type={ds.task_type} />
          </span>
        ) : (
          <span title="All (Exam)" className="text-[10px] font-mono font-bold text-[#94A3B8]">EX</span>
        )}
      </td>
      {/* Sessions */}
      <td className={numCell}>
        <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">
          {ds.session_count}
        </span>
      </td>
      {/* Learners */}
      <td className={numCell}>
        <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">
          {ds.learner_count}
        </span>
      </td>
      {/* Usage */}
      <td className={iconCell}>
        {ds.usage_status === "used" ? (
          <span title="Used" className="inline-flex items-center justify-center text-amber-500">
            <LightningIcon className="w-4 h-4" />
          </span>
        ) : (
          <span title="Not Used" className="inline-flex items-center justify-center text-[#CBD5E1]">
            <CircleEmptyIcon className="w-4 h-4" />
          </span>
        )}
      </td>
      {/* Active toggle */}
      <td className={iconCell}>
        <button
          onClick={() => { void handleToggle(); }}
          disabled={toggling}
          aria-label={ds.active ? "Deactivate dataset" : "Activate dataset"}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ds.active ? "bg-[#F37021]" : "bg-[#E2E8F0]"} ${toggling ? "opacity-50" : ""}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${ds.active ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </button>
      </td>
      {/* Actions */}
      <td className="px-3 py-3.5 whitespace-nowrap align-middle">
        <div className="inline-flex items-center gap-1">
          <button onClick={() => onRunPipeline(ds)} title="Run Pipeline" className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#FED7AA] text-[#F37021] hover:bg-[#FFF7ED] transition-colors">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button onClick={() => onViewHistory(ds)} title="Run History" className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#E2E8F0] text-[#94A3B8] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <button onClick={() => onEdit(ds)} title="Edit" className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#E2E8F0] text-[#94A3B8] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => onCopy(ds)} title="Copy" className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#E2E8F0] text-[#94A3B8] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          {ds.usage_status === "not_used" && (
            <button onClick={() => onDelete(ds)} title="Delete" className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Full Pipeline Run analyses ──────────────────────────────────────────────

const PIPELINE_ANALYSES: { key: string; label: string }[] = [
  { key: "behavioral",  label: "Behavioral Analysis" },
  { key: "sequential",  label: "Sequential Analysis" },
  { key: "semantic",    label: "Semantic Analysis" },
  { key: "assessment",  label: "Assessment Analysis" },
];

// ─── Run Confirm Modal ────────────────────────────────────────────────────────

function RunConfirmModal({
  dataset,
  onClose,
  onStarted,
  token,
}: {
  dataset: DatasetRecord;
  onClose: () => void;
  onStarted: (runId: string) => void;
  token: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInactive = !dataset.active;

  async function handleConfirm() {
    if (isInactive) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/researcher/dataset-analytics/${dataset.id}/runs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ run_type: "full_pipeline" }),
      });
      const j = await res.json() as { run?: { id: string }; error?: string; existing_run_id?: string };
      if (!res.ok) {
        setError(j.error ?? "Failed to start pipeline run.");
        setSubmitting(false);
        return;
      }
      onStarted(j.run?.id ?? "");
    } catch {
      setError("Network error — could not reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} title="Run Full Pipeline">
      <div className="px-6 py-5 space-y-5">
        {/* Dataset details */}
        <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Dataset</span>
            <span className="font-mono text-xs font-semibold text-[#0F172A]">{dataset.code}</span>
          </div>
          <p className="text-xs text-[#0F172A] font-medium">{dataset.name}</p>
          <div className="grid grid-cols-3 gap-x-2 pt-1">
            <div>
              <p className="text-[9px] text-[#94A3B8] uppercase tracking-wide">Batch</p>
              <p className="text-xs text-[#475569] capitalize">{dataset.batch_type}</p>
            </div>
            <div>
              <p className="text-[9px] text-[#94A3B8] uppercase tracking-wide">Activity</p>
              <p className="text-xs text-[#475569] capitalize">{SET_FAMILY_LABEL[dataset.set_family as "assignment" | "lab" | "exam"] ?? dataset.set_family}</p>
            </div>
            <div>
              <p className="text-[9px] text-[#94A3B8] uppercase tracking-wide">Task</p>
              <p className="text-xs text-[#475569]">{DATASET_TASK_LABEL[dataset.task_type] ?? dataset.task_type}</p>
            </div>
          </div>
        </div>

        {/* Readiness check */}
        {isInactive && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            This dataset is inactive. Activate it before running the full pipeline.
          </div>
        )}

        {/* Analyses that will run */}
        <div>
          <p className="text-xs font-semibold text-[#475569] mb-2">Analyses to run:</p>
          <div className="space-y-1.5">
            {PIPELINE_ANALYSES.map((a) => (
              <div key={a.key} className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${isInactive ? "bg-[#E2E8F0]" : "bg-[#F37021]"}`} />
                <span className="text-xs text-[#475569]">{a.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-[#94A3B8]">
          This will create a run record. Pipeline execution requires additional backend tooling not yet connected.
        </p>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#475569] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleConfirm(); }}
            disabled={submitting || isInactive}
            aria-label="Confirm full pipeline run"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#F37021] rounded-lg hover:bg-[#D45F10] disabled:opacity-50 transition-colors"
          >
            {submitting ? "Starting…" : "Confirm Run"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Run History Modal ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:   "text-[#94A3B8] bg-[#F1F5F9]",
  running:   "text-blue-700 bg-blue-50",
  completed: "text-green-700 bg-green-50",
  failed:    "text-red-700 bg-red-50",
  cancelled: "text-[#64748B] bg-[#F8FAFC]",
};

function RunHistoryModal({
  dataset,
  onClose,
  token,
}: {
  dataset: DatasetRecord;
  onClose: () => void;
  token: string;
}) {
  const [runs, setRuns] = useState<PipelineRun[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/researcher/dataset-analytics/${dataset.id}/runs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "Failed" })) as { error?: string };
          if (!cancelled) setError(j.error ?? "Failed to load run history.");
        } else {
          const j = await res.json() as { runs: PipelineRun[] };
          if (!cancelled) setRuns(j.runs ?? []);
        }
      } catch {
        if (!cancelled) setError("Network error.");
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [dataset.id, token]);

  return (
    <ModalOverlay onClose={onClose} title={`Run History — ${dataset.code}`}>
      <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
        {loading ? (
          <p className="text-sm text-[#94A3B8] text-center py-4">Loading…</p>
        ) : error ? (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : !runs || runs.length === 0 ? (
          <div className="text-center py-8 text-sm text-[#94A3B8]">
            No runs yet for this dataset.
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <div key={run.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#64748B]">{run.id.slice(0, 8)}…</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[run.status] ?? "text-[#64748B] bg-[#F8FAFC]"}`}>
                      {run.status}
                    </span>
                    <span className="text-[10px] text-[#94A3B8] italic">{run.run_type}</span>
                  </div>
                  <span className="text-[10px] text-[#94A3B8]">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
                {run.analysis_steps && run.analysis_steps.length > 0 && (
                  <div className="grid grid-cols-2 gap-1">
                    {run.analysis_steps.map((step) => (
                      <div key={step.analysis} className="flex items-center gap-1.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${step.status === "completed" ? "bg-green-500" : step.status === "failed" ? "bg-red-500" : step.status === "running" ? "bg-blue-500" : "bg-[#E2E8F0]"}`} />
                        <span className="text-[10px] text-[#475569] capitalize">{step.analysis}</span>
                        <span className={`text-[9px] ${STATUS_COLORS[step.status] ?? ""} px-1 rounded`}>{step.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {run.error_summary && (
                  <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                    {run.error_summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function DatasetAnalyticsPage() {
  const router = useRouter();

  // Dataset list filters
  const [search, setSearch] = useState("");
  const [listBatchType, setListBatchType] = useState<string>("");
  const [listSetFamily, setListSetFamily] = useState<string>("");
  const [listTaskType, setListTaskType] = useState<string>("");
  const [listActive, setListActive] = useState<string>("");
  const [listUsage, setListUsage] = useState<string>("");

  // API state
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth token
  const [token, setToken] = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalDataset, setModalDataset] = useState<DatasetRecord | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const loadData = useCallback(async () => {
    const t = await getToken();
    if (!t) { router.push("/auth/login"); return; }
    setToken(t);
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ dataset: "phase4_pilot" });
    if (search) qs.set("search", search);
    if (listBatchType) qs.set("filter_batch_type", listBatchType);
    if (listSetFamily) qs.set("filter_set_family", listSetFamily);
    if (listTaskType) qs.set("filter_task_type", listTaskType);
    if (listActive) qs.set("filter_active", listActive);
    if (listUsage) qs.set("filter_usage", listUsage);

    try {
      const res = await fetch(`/api/researcher/dataset-analytics?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
        setError(j.error ?? "Failed to load data.");
        setLoading(false);
        return;
      }
      setData(await res.json() as ApiResponse);
    } catch {
      setError("Network error — could not reach the server.");
    }
    setLoading(false);
  }, [getToken, router, search, listBatchType, listSetFamily, listTaskType, listActive, listUsage]);

  useEffect(() => { queueMicrotask(() => { void loadData(); }); }, [loadData]);

  function handleDatasetUpdated(id: string, newActive: boolean) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        dataset_list: prev.dataset_list.map((d) =>
          d.id === id ? { ...d, active: newActive } : d
        ),
      };
    });
  }

  function closeModal() {
    setModalMode(null);
    setModalDataset(null);
  }

  function afterMutation() {
    closeModal();
    void loadData();
  }

  function openEdit(ds: DatasetRecord) {
    setModalDataset(ds);
    setModalMode("edit");
  }

  function openCopy(ds: DatasetRecord) {
    setModalDataset(ds);
    setModalMode("copy");
  }

  function openDelete(ds: DatasetRecord) {
    setModalDataset(ds);
    setModalMode("delete");
  }

  function openRunPipeline(ds: DatasetRecord) {
    setModalDataset(ds);
    setModalMode("run");
  }

  function openViewHistory(ds: DatasetRecord) {
    setModalDataset(ds);
    setModalMode("history");
  }

  // Filter panel: Exam has no task type — auto-clear when exam selected
  useEffect(() => {
    if (listSetFamily === "exam") setListTaskType("");
  }, [listSetFamily]);

  const hasListFilter = search || listBatchType || listSetFamily || listTaskType || listActive || listUsage;

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      {/* Header — Teacher nav pattern */}
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/researcher/dashboard" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Researcher Dashboard
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Dataset Analytics</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* ── Title row: left = title/desc, right = Create button ── */}
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Dataset Analytics</h1>
            <p className="text-sm text-[#64748B] mt-1">Create, filter, and manage research datasets</p>
          </div>
          {token && (
            <button
              onClick={() => { setModalMode("create"); setModalDataset(null); }}
              className="shrink-0 px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Dataset
            </button>
          )}
        </div>

        {/* ── Filters (Dataset Export icon-only style) ── */}
        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 flex flex-wrap items-end gap-4">

          {/* Search */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Search</label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Code or name…"
                aria-label="Search datasets by code or name"
                className="pl-9 pr-3 py-2.5 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] w-44"
              />
            </div>
          </div>

          {/* Batch Type — icon-only */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Batch</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All batches" onClick={() => setListBatchType("")}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${listBatchType === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              <button type="button" title="Main" onClick={() => setListBatchType(listBatchType === "main" ? "" : "main")}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${listBatchType === "main" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <StarIcon className="w-4 h-4" />
              </button>
              <button type="button" title="Trial" onClick={() => setListBatchType(listBatchType === "trial" ? "" : "trial")}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${listBatchType === "trial" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <DumbbellIcon className="w-4 h-4" />
              </button>
              <button type="button" title="Pilot" onClick={() => setListBatchType(listBatchType === "pilot" ? "" : "pilot")}
                className={`flex items-center justify-center px-3 py-2.5 transition-colors ${listBatchType === "pilot" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Activity Type — icon-only */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Activity</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All activities" onClick={() => setListSetFamily("")}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${listSetFamily === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              {/* Assignment: checklist */}
              <button type="button" title="Assignment" onClick={() => setListSetFamily(listSetFamily === "assignment" ? "" : "assignment")}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${listSetFamily === "assignment" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M9 5h6"/><path d="M9 12h6"/><path d="M9 17h4"/>
                  <path d="M5 7.5 6.5 9 9 6"/><path d="M5 14.5 6.5 16 9 13"/>
                  <rect x="4" y="3" width="16" height="18" rx="2"/>
                </svg>
              </button>
              {/* Lab: beaker */}
              <button type="button" title="Lab" onClick={() => setListSetFamily(listSetFamily === "lab" ? "" : "lab")}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${listSetFamily === "lab" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2"/>
                  <path d="M8 2h8"/><path d="M7 15h10"/>
                </svg>
              </button>
              {/* Exam: document */}
              <button type="button" title="Exam" onClick={() => setListSetFamily(listSetFamily === "exam" ? "" : "exam")}
                className={`flex items-center justify-center px-3 py-2.5 transition-colors ${listSetFamily === "exam" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                  <path d="M14 2v6h6"/><path d="M9 14h6"/><path d="M9 18h4"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Task Type — icon-only via TaskTypeIcon */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Task</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All task types" onClick={() => setListTaskType("")}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${listTaskType === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              {DATASET_TASK_TYPES_IN_SCOPE.map((v, i) => (
                <button key={v} type="button" title={DATASET_TASK_LABEL[v]}
                  onClick={() => setListTaskType(listTaskType === v ? "" : v)}
                  className={`flex items-center justify-center px-3 py-2.5 ${i < DATASET_TASK_TYPES_IN_SCOPE.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${listTaskType === v ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                  <TaskTypeIcon type={v} />
                </button>
              ))}
            </div>
          </div>

          {/* Usage Status — icon-only */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Usage</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All" onClick={() => setListUsage("")}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${listUsage === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              <button type="button" title="Used" onClick={() => setListUsage(listUsage === "used" ? "" : "used")}
                className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${listUsage === "used" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <LightningIcon className="w-4 h-4" />
              </button>
              <button type="button" title="Not Used" onClick={() => setListUsage(listUsage === "not_used" ? "" : "not_used")}
                className={`flex items-center justify-center px-3 py-2.5 transition-colors ${listUsage === "not_used" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <CircleEmptyIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Status — dot style */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#64748B] font-medium">Status</label>
            <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
              <button type="button" title="All" onClick={() => setListActive("")}
                className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${listActive === "" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                All
              </button>
              <button type="button" title="Active" onClick={() => setListActive(listActive === "true" ? "" : "true")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${listActive === "true" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <span className={`w-2 h-2 rounded-full ${listActive === "true" ? "bg-white" : "bg-emerald-500"}`} />
              </button>
              <button type="button" title="Inactive" onClick={() => setListActive(listActive === "false" ? "" : "false")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 transition-colors ${listActive === "false" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                <span className={`w-2 h-2 rounded-full ${listActive === "false" ? "bg-white" : "bg-[#CBD5E1]"}`} />
              </button>
            </div>
          </div>

          {/* Clear All */}
          {hasListFilter && (
            <button type="button" onClick={() => { setSearch(""); setListBatchType(""); setListSetFamily(""); setListTaskType(""); setListActive(""); setListUsage(""); }}
              className="self-end pb-[11px] text-xs font-semibold text-[#F37021] hover:underline">
              Clear All
            </button>
          )}
        </section>

        {/* ── Dataset Table ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] overflow-hidden">

          {/* Dataset table */}
          {loading ? (
            <p className="text-sm text-[#94A3B8] py-6 text-center">Loading…</p>
          ) : error ? (
            <div className="m-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{error}</div>
          ) : !data ? null : data.dataset_list.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#94A3B8]">
              No datasets found. {hasListFilter ? "Try adjusting your filters." : "Create one to get started."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="bg-[#FFF7ED] border-b-2 border-[#FED7AA]">
                    {[
                      { label: "Code",       align: "left"   },
                      { label: "Name",       align: "left"   },
                      { label: "Batch",      align: "center" },
                      { label: "Activity",   align: "center" },
                      { label: "Task Type",  align: "center" },
                      { label: "Sessions",   align: "center" },
                      { label: "Learners",   align: "center" },
                      { label: "Usage",      align: "center" },
                      { label: "Active",     align: "center" },
                      { label: "Actions",    align: "center" },
                    ].map(({ label, align }) => (
                      <th key={label} className={`px-3 py-2.5 text-[10px] font-bold text-[#F37021] uppercase tracking-widest whitespace-nowrap ${align === "center" ? "text-center" : "text-left"}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dataset_list.map((ds) => (
                    <DatasetRow
                      key={ds.id}
                      ds={ds}
                      batchTypeOptions={data.available_batch_types}
                      token={token ?? ""}
                      onEdit={openEdit}
                      onCopy={openCopy}
                      onDelete={openDelete}
                      onToggled={handleDatasetUpdated}
                      onRunPipeline={openRunPipeline}
                      onViewHistory={openViewHistory}
                    />
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-[#94A3B8] pt-2 px-4">
                {data.dataset_list_count} dataset{data.dataset_list_count !== 1 ? "s" : ""} shown
              </p>
            </div>
          )}
        </section>

      </main>

      {/* ── Modals ── */}
      {token && modalMode === "create" && (
        <CreateModal
          key="create"
          onClose={closeModal}
          onCreated={afterMutation}
          token={token}
          contextSummary={data?.scoped_summary}
        />
      )}
      {token && modalMode === "copy" && modalDataset && (
        <CreateModal
          key="copy"
          onClose={closeModal}
          onCreated={afterMutation}
          prefill={{
            name: `${modalDataset.name} (Copy)`,
            batch_type: modalDataset.batch_type as BatchType,
            set_family: modalDataset.set_family as SetFamily,
            task_type: modalDataset.task_type,
            class_id: modalDataset.class_id,
            task_id: modalDataset.task_id,
          }}
          token={token}
          contextSummary={data?.scoped_summary}
        />
      )}
      {token && modalMode === "edit" && modalDataset && (
        <CreateModal
          key={`edit-${modalDataset.id}`}
          onClose={closeModal}
          onCreated={afterMutation}
          isEdit
          editDataset={modalDataset}
          token={token}
          contextSummary={data?.scoped_summary}
        />
      )}
      {token && modalMode === "delete" && modalDataset && (
        <DeleteModal
          dataset={modalDataset}
          onClose={closeModal}
          onDeleted={afterMutation}
          token={token}
        />
      )}
      {token && modalMode === "run" && modalDataset && (
        <RunConfirmModal
          dataset={modalDataset}
          onClose={closeModal}
          onStarted={() => { closeModal(); void loadData(); }}
          token={token}
        />
      )}
      {token && modalMode === "history" && modalDataset && (
        <RunHistoryModal
          dataset={modalDataset}
          onClose={closeModal}
          token={token}
        />
      )}
    </div>
  );
}

// ─── FilterChip ──────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
        active
          ? "bg-[#F37021] text-white border-[#F37021]"
          : "bg-white text-[#475569] border-[#FED7AA] hover:bg-[#FFF7ED] hover:border-[#F37021] hover:text-[#F37021]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
