"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { MockConfig, MockOutcome, MockStep } from "@/lib/mock-pipeline";
import {
  TaskTypeIcon,
  TASK_TYPE_LABEL,
  TASK_TYPE_ORDER,
} from "@/lib/task-type-utils";
import {
  SET_FAMILY_LABEL,
  THESIS_TASK_TYPE_ORDER,
  THESIS_TASK_TYPE_LABEL,
  isPhase4Supported,
  type SetFamily,
  type TaskType,
} from "@/lib/research-context";
import type { MockConfigRecord } from "@/app/api/researcher/mock-lab/route";

// ── types ─────────────────────────────────────────────────────────────────────
interface ClassOption {
  class_id: string;
  class_code: string;
  class_name: string;
  academic_year: string;
  term: string;
  student_count: number;
}

interface TaskSetOption {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  family: string;
  task_count: number;
  task_ids: string[];
  task_type_counts: Record<string, number>;
  learning_mode: string;
}


interface LiveProgress {
  student: string;
  totalStudents: number;
  task: string;
  totalTasks: number;
  op: string;
  completedCalls: number;
  totalCalls: number;
  elapsedMs: number;
  etaSec: number;
}

interface FinalStats {
  totalRequests: number;
  totalDurationSec: number;
  slowestMs: number;
  slowestEndpoint: string;
  p50Ms: number;
  p95Ms: number;
}

type StepStatus = "waiting" | "running" | "completed" | "failed" | "aborted";
type OutcomeTab = "summary" | "metrics" | "sequence" | "charts" | "dataset" | "reports" | "logs";

const PIPELINE_STEPS: MockStep[] = ["data", "extract", "process", "train", "evaluate", "outcome"];

const STEP_META: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
  data: {
    label: "Mock Data",
    desc: "Create synthetic students, tasks, class structure",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  extract: {
    label: "Mock Extract",
    desc: "Simulate student login sessions and attempt submissions",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  process: {
    label: "Mock Process",
    desc: "Export CSV datasets from simulated transactions",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  train: {
    label: "Mock Train",
    desc: "Run NB01-NB03: feature engineering and model training",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  evaluate: {
    label: "Mock Evaluate",
    desc: "Run NB04: cross-validation and model evaluation",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  outcome: {
    label: "Mock Outcome",
    desc: "Load evaluation results and generate outcome report",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

// ── small helpers ─────────────────────────────────────────────────────────────
function MetricBar({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  const pct = value != null ? Math.round(value * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[#64748B]">{label}</span>
        <span className="font-mono font-semibold text-[#0F172A]">{value != null ? value.toFixed(3) : "—"}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ["Not at-risk", "At-risk"];
  return (
    <div>
      <p className="text-xs font-semibold text-[#64748B] mb-2">Confusion Matrix (predicted → actual)</p>
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1.5 text-[#94A3B8]" />
            {labels.map(l => <th key={l} className="p-1.5 font-semibold text-[#0F172A] text-center min-w-[80px]">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td className="p-1.5 font-semibold text-[#0F172A] pr-3 text-right">{labels[ri]}</td>
              {row.map((v, ci) => (
                <td key={ci} className={`p-2 text-center font-mono font-bold rounded text-sm ${ri === ci ? "bg-[#FED7AA] text-[#C2410C]" : "bg-[#F1F5F9] text-[#475569]"}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: "green" | "yellow" | "red" | "idle" }) {
  const map = {
    green:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    yellow: "bg-amber-100 text-amber-700 border-amber-200",
    red:    "bg-red-100 text-red-600 border-red-200",
    idle:   "bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0]",
  };
  const dot = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", idle: "bg-[#CBD5E1]" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      {status === "green" ? "Ready" : status === "yellow" ? "Partial" : status === "red" ? "Failed" : "Not Run"}
    </span>
  );
}

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <svg className={`${s} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── helpers (module-level — safe to call anywhere) ────────────────────────────
function getTimestamp(): number { return Date.now(); }

// ── main component ────────────────────────────────────────────────────────────
export default function MockLab() {
  // config
  const [config, setConfig] = useState<MockConfig>({
    batchCode: "MOCK_20260714_001",
    nStudents: 10,
    nTasks: 3,
    atRiskRate: 35,
    missingRate: 7,
    seed: 42,
    setFamily: "assignment",
    taskTypeCounts: { sql_text: 3 },
    apiBase: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  });
  const [configError, setConfigError] = useState<string | null>(null);

  // class + task set selection
  const [classes, setClasses]                   = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading]     = useState(true);
  const [selectedClassId, setSelectedClassId]   = useState<string>("");
  const [taskSets, setTaskSets]                 = useState<TaskSetOption[]>([]);
  const [taskSetsLoading, setTaskSetsLoading]   = useState(false);
  const [selectedSetId, setSelectedSetId]       = useState<string>("");

  // dummy-mode context selectors (used when no real task set is selected)
  const [dummySetFamily, setDummySetFamily]     = useState<SetFamily>("assignment");
  const [dummyTaskType, setDummyTaskType]       = useState<TaskType>("sql_text");

  // pipeline state
  const [running, setRunning]         = useState<MockStep | null>(null);
  const [stepStatus, setStepStatus]   = useState<Record<string, StepStatus>>({});
  const [logs, setLogs]               = useState<string[]>([]);
  // Phase 5 M5.17: NB02-NB09 PASS/FAIL results parsed from run_e2e_notebooks.py summary lines
  const [nbResults, setNbResults]     = useState<Record<string, "PASS" | "FAIL">>({});
  const [outcome, setOutcome]         = useState<MockOutcome | null>(null);
  const [errorCount, setErrorCount]   = useState(0);
  const [startTime, setStartTime]     = useState<number | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [completedSteps, setCompleted] = useState<string[]>([]);

  // live extract progress
  const [liveProgress, setLiveProgress]   = useState<LiveProgress | null>(null);
  const lastProgressAtRef                 = useRef<number | null>(null);
  const [hangSeconds, setHangSeconds]     = useState<number | null>(null);
  const [finalStats, setFinalStats]       = useState<FinalStats | null>(null);

  // UI state
  const [activeTab, setActiveTab]       = useState<OutcomeTab>("summary");
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showCreateModal, setShowCreateModal]     = useState(false);
  const [editingConfig, setEditingConfig]         = useState<MockConfigRecord | null>(null);
  const logEndRef          = useRef<HTMLDivElement>(null);
  const abortRef           = useRef<AbortController | null>(null);
  const pipelineStepRef    = useRef<MockStep>("data");
  const pendingSetIdRef    = useRef<string>("");
  const runConfigRef       = useRef<typeof config | null>(null);
  // true = outcome came from a live run (unsaved); false = loaded from DB
  const [isNewOutcome, setIsNewOutcome] = useState(false);
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  // Phase 5 M5.15: timestamp (ms) when outcome was restored from localStorage; null = live/DB
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  // configs table state
  const [configs, setConfigs]               = useState<MockConfigRecord[]>([]);
  const [loading, setLoading]               = useState(true);
  const [filterActivity, setFilterActivity] = useState<string>("all");
  const [filterTaskType, setFilterTaskType] = useState<string>("all");
  const [searchQuery, setSearchQuery]       = useState<string>("");
  const [filterStatus, setFilterStatus]     = useState<"all"|"active"|"inactive">("all");
  const [filterUsage, setFilterUsage]       = useState<"all"|"used"|"unused">("all");
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);

  // client-side filtered view of configs
  const filteredConfigs = configs.filter(cfg => {
    const q = searchQuery.trim().toLowerCase();
    if (q && !cfg.code.toLowerCase().includes(q) && !(cfg.name ?? "").toLowerCase().includes(q)) return false;
    if (filterStatus === "active" && !cfg.active) return false;
    if (filterStatus === "inactive" && cfg.active) return false;
    if (filterUsage === "used" && cfg.run_count === 0) return false;
    if (filterUsage === "unused" && cfg.run_count > 0) return false;
    return true;
  });

  // elapsed timer + hang detector
  useEffect(() => {
    if (!startTime) return;
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
      setHangSeconds(lastProgressAtRef.current !== null
        ? Math.floor((Date.now() - lastProgressAtRef.current) / 1000)
        : null);
    }, 1000);
    return () => clearInterval(iv);
  }, [startTime]);

  // fetch configs from DB
  const fetchConfigs = useCallback(async () => {
    queueMicrotask(() => setLoading(true));
    try {
      const { data: { session: listSession } } = await supabase.auth.getSession();
      const listToken = listSession?.access_token ?? "";
      const params = new URLSearchParams();
      if (filterActivity !== "all") params.set("set_family", filterActivity);
      if (filterTaskType !== "all") params.set("task_type", filterTaskType);
      const res = await fetch(`/api/researcher/mock-lab?${params}`, {
        headers: listToken ? { Authorization: `Bearer ${listToken}` } : {},
      });
      if (res.ok) {
        const json = await res.json() as { configs?: MockConfigRecord[] };
        setConfigs(json.configs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterActivity, filterTaskType]);

  useEffect(() => { void fetchConfigs(); }, [fetchConfigs]);

  // Phase 5 M5.15: restore last completed outcome from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ckv-mocklab-last-outcome");
      if (!raw) return;
      const stored = JSON.parse(raw) as { batchCode: string; outcome: MockOutcome; savedAt: number };
      if (!stored.outcome || !stored.batchCode) return;
      setOutcome(stored.outcome);
      setConfig(prev => ({ ...prev, batchCode: stored.batchCode }));
      setStepStatus(Object.fromEntries(PIPELINE_STEPS.map(s => [s, "completed" as StepStatus])));
      setCompleted([...PIPELINE_STEPS]);
      setRestoredAt(stored.savedAt);
      // Optimistically mark NB02-NB04 as PASS on restore (live results not stored)
      setNbResults({ NB02: "PASS", NB03: "PASS", NB04: "PASS" });
    } catch { /* corrupt storage — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // fetch class list on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token ?? "";
      fetch("/api/researcher/classes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then((d: { classes?: ClassOption[] }) => setClasses(d.classes ?? []))
        .catch(() => setClasses([]))
        .finally(() => setClassesLoading(false));
    });
  }, []);

  // fetch task sets when class changes
  useEffect(() => {
    if (!selectedClassId) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setTaskSetsLoading(true);
      setSelectedSetId("");
      setConfig(prev => ({ ...prev, taskIds: undefined, taskSetId: undefined, nTasks: 3 }));
      const token = session?.access_token ?? "";
      fetch(`/api/researcher/classes/${selectedClassId}/sets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then((d: { sets?: TaskSetOption[] }) => {
          const sets = (d.sets ?? []).filter((s: TaskSetOption) => s.task_count > 0);
          setTaskSets(sets);
          const pendingId = pendingSetIdRef.current;
          if (pendingId) {
            pendingSetIdRef.current = "";
            const found = sets.find(s => s.batch_id === pendingId);
            if (found) {
              setSelectedSetId(found.batch_id);
              setConfig(prev => ({
                ...prev,
                taskIds: found.task_ids,
                taskSetId: found.batch_id,
                nTasks: found.task_count,
                setFamily: found.family as SetFamily,
                taskTypeCounts: found.task_type_counts,
              }));
            }
          }
        })
        .catch(() => setTaskSets([]))
        .finally(() => setTaskSetsLoading(false));
    });
  }, [selectedClassId]);

  // Sync dummy selectors -> config when no real task set is active
  useEffect(() => {
    if (selectedSetId) return;
    queueMicrotask(() => {
      setConfig(prev => ({
        ...prev,
        setFamily: dummySetFamily,
        taskTypeCounts: { [dummyTaskType]: prev.taskIds?.length ?? prev.nTasks },
      }));
    });
  }, [dummySetFamily, dummyTaskType, selectedSetId]);

  // Reset task set selection when Activity Type or Task Type filter changes
  useEffect(() => {
    if (!selectedSetId) return;
    const found = taskSets.find(s => s.batch_id === selectedSetId);
    if (!found) return;
    const familyMatch = found.family === dummySetFamily;
    const taskTypeMatch = Object.keys(found.task_type_counts).includes(dummyTaskType);
    if (!familyMatch || !taskTypeMatch) {
      queueMicrotask(() => {
        setSelectedSetId("");
        setConfig(prev => ({
          ...prev,
          taskIds: undefined,
          taskSetId: undefined,
          nTasks: 3,
          setFamily: dummySetFamily,
          taskTypeCounts: { [dummyTaskType]: 3 },
        }));
      });
    }
  }, [dummySetFamily, dummyTaskType, selectedSetId, taskSets]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-800), msg]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  }, []);

  function updateConfig<K extends keyof MockConfig>(key: K, val: MockConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: val }));
    setConfigError(null);
  }

  function handleTaskSetSelect(setId: string) {
    setSelectedSetId(setId);
    const found = taskSets.find(s => s.batch_id === setId);
    if (found) {
      setConfig(prev => ({
        ...prev,
        taskIds: found.task_ids,
        taskSetId: found.batch_id,
        nTasks: found.task_count,
        setFamily: found.family,
        taskTypeCounts: found.task_type_counts,
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        taskIds: undefined,
        taskSetId: undefined,
        nTasks: 3,
        setFamily: dummySetFamily,
        taskTypeCounts: { [dummyTaskType]: 3 },
      }));
    }
  }

  async function openModalWithConfig(cfg: MockConfigRecord, mode: "edit" | "duplicate" = "edit") {
    const firstTaskType = (Object.keys(cfg.task_type_counts)[0] ?? "sql_text") as TaskType;
    setDummySetFamily(cfg.set_family as SetFamily);
    setDummyTaskType(firstTaskType);
    setConfig(prev => ({
      ...prev,
      batchCode: `MOCK_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_001`,
      nStudents:   cfg.n_students,
      nTasks:      Object.values(cfg.task_type_counts)[0] ?? 3,
      atRiskRate:  cfg.at_risk_rate,
      missingRate: cfg.missing_rate,
      seed:        cfg.seed,
      setFamily:   cfg.set_family as SetFamily,
      taskTypeCounts: cfg.task_type_counts,
      taskIds:    cfg.task_ids.length > 0 ? cfg.task_ids : undefined,
      taskSetId:  cfg.task_set_id ?? undefined,
    }));
    setConfigError(null);

    if (cfg.task_set_id) {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      try {
        const res  = await fetch(`/api/researcher/batch-class?batch_id=${cfg.task_set_id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json() as { class_id?: string | null };
        if (data.class_id) {
          pendingSetIdRef.current = cfg.task_set_id;
          setSelectedClassId(data.class_id);
        } else {
          setSelectedClassId(""); setSelectedSetId(""); setTaskSets([]);
        }
      } catch {
        setSelectedClassId(""); setSelectedSetId(""); setTaskSets([]);
      }
    } else {
      setSelectedClassId(""); setSelectedSetId(""); setTaskSets([]);
    }

    setEditingConfig(mode === "edit" ? cfg : null);
    setShowCreateModal(true);
  }

  function validateBatchCode(code: string): string | null {
    if (!code.startsWith("SIM_E2E_") && !code.startsWith("MOCK_") && !code.startsWith("M")) {
      return "Batch code must start with SIM_E2E_, MOCK_, or M";
    }
    return null;
  }

  async function runStep(step: MockStep) {
    const err = validateBatchCode(config.batchCode);
    if (err) { setConfigError(err); return; }

    setRunning(step);
    setLogs([]);
    setNbResults({});
    setErrorCount(0);
    setStartTime(getTimestamp());
    setElapsed(0);
    setLiveProgress(null);
    lastProgressAtRef.current = null;
    setHangSeconds(null);
    setFinalStats(null);
    if (step !== "outcome") setOutcome(null);
    if (step === "run-all") {
      setStepStatus({});
      setCompleted([]);
    } else {
      setStepStatus(prev => ({ ...prev, [step]: "running" }));
    }
    addLog(`-- Starting: ${step} --`);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/researcher/mock-pipeline/${step}`, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(runConfigRef.current ?? config),
      });
      runConfigRef.current = null;

      if (!res.ok) {
        addLog(`ERROR: ${res.status} ${await res.text()}`);
        if (step !== "run-all") setStepStatus(prev => ({ ...prev, [step]: "failed" }));
        setRunning(null);
        setStartTime(null);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      pipelineStepRef.current = step;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const eventMatch = part.match(/^event: (\w[\w-]*)/m);
          const dataMatch  = part.match(/^data: (.+)$/m);
          if (!dataMatch) continue;
          const eventType = eventMatch?.[1] ?? "log";
          try {
            const payload = JSON.parse(dataMatch[1]) as Record<string, unknown>;
            if (eventType === "log") {
              const msg = (payload.msg as string) ?? "";
              if (msg.startsWith("[PROGRESS] ")) {
                try {
                  const p = JSON.parse(msg.slice(11)) as LiveProgress;
                  setLiveProgress(p);
                  lastProgressAtRef.current = getTimestamp();
                } catch { /* ignore */ }
                continue;
              }
              if (msg.startsWith("[WORKLOAD] ")) continue;
              if (msg.startsWith("[STATS] ")) {
                try { setFinalStats(JSON.parse(msg.slice(8)) as FinalStats); } catch { /* ignore */ }
                continue;
              }
              addLog(msg);
              if (msg.includes("❌")) setErrorCount(c => c + 1);
              // Phase 5 M5.17: parse notebook summary lines from run_e2e_notebooks.py
              // Format: "  ✅  02_baseline_model.ipynb: PASS" / "  ❌  …: FAIL"
              const nbMatch = msg.match(/[✅❌]\s+(\d{2})_\S+\.ipynb:\s*(PASS|FAIL)/);
              if (nbMatch) {
                const nbKey = `NB${nbMatch[1]}`;
                const nbSts = nbMatch[2] as "PASS" | "FAIL";
                setNbResults(prev => ({ ...prev, [nbKey]: nbSts }));
              }
              const match = msg.match(/^-- Step: (\w+)/);
              if (match) {
                if (pipelineStepRef.current !== step) {
                  setStepStatus(prev => ({ ...prev, [pipelineStepRef.current]: "completed" }));
                  setCompleted(prev => [...prev, pipelineStepRef.current]);
                }
                pipelineStepRef.current = match[1] as MockStep;
                setStepStatus(prev => ({ ...prev, [pipelineStepRef.current]: "running" }));
              }
            }
            if (eventType === "error") {
              addLog(`❌ ${payload.msg as string}`);
              setErrorCount(c => c + 1);
              setStepStatus(prev => ({ ...prev, [pipelineStepRef.current]: "failed" }));
            }
            if (eventType === "progress") {
              const s = payload.step as string;
              if (s) setStepStatus(prev => ({ ...prev, [s]: payload.pct === 100 ? "completed" : "running" }));
            }
            if (eventType === "outcome") parseOutcome(payload as { report?: MockOutcome }, true);
            if (eventType === "done") {
              const s = payload.step as string;
              const wasAborted: boolean = payload.aborted === true;
              if (s && s !== "run-all") {
                const st: StepStatus = payload.success ? "completed" : wasAborted ? "aborted" : "failed";
                setStepStatus(prev => ({ ...prev, [s]: st }));
                if (payload.success) setCompleted(prev => [...new Set([...prev, s])]);
              }
              if (s === "run-all" && payload.success) {
                PIPELINE_STEPS.forEach(ps => setStepStatus(prev => ({ ...prev, [ps]: "completed" })));
                setCompleted(PIPELINE_STEPS as string[]);
              }
            }
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addLog("⛔ Stopped by user.");
        setStepStatus(prev => {
          const next = { ...prev };
          for (const s of PIPELINE_STEPS) {
            if (next[s] === "running") next[s] = "aborted";
          }
          return next;
        });
      }
    } finally {
      abortRef.current = null;
      setRunning(null);
      setStartTime(null);
      setHangSeconds(null);
      lastProgressAtRef.current = null;
      addLog("-- Done --");
      // Refresh table after pipeline completes
      void fetchConfigs();
    }
  }

  function stopPipeline() {
    abortRef.current?.abort();
  }

  async function handleRunPipeline(configId: string) {
    const cfg = configs.find(c => c.id === configId);
    const merged = cfg ? {
      ...config,
      batchCode:      cfg.code,
      nStudents:      cfg.n_students,
      nTasks:         Object.values(cfg.task_type_counts)[0] ?? 3,
      atRiskRate:     cfg.at_risk_rate,
      missingRate:    cfg.missing_rate,
      seed:           cfg.seed,
      setFamily:      cfg.set_family as SetFamily,
      taskTypeCounts: cfg.task_type_counts,
      taskIds:        cfg.task_ids.length > 0 ? cfg.task_ids : undefined,
      taskSetId:      cfg.task_set_id ?? undefined,
    } : config;
    runConfigRef.current = merged;
    setConfig(merged);
    setActiveConfigId(configId);
    // Reset pipeline UI state
    setLogs([]);
    setErrorCount(0);
    setElapsed(0);
    setStepStatus({});
    setCompleted([]);
    setLiveProgress(null);
    setFinalStats(null);
    setOutcome(null);
    setIsNewOutcome(false);
    setOutcomeSaved(false);
    setRestoredAt(null);
    setShowPipelineModal(true);

    // If already run before, load last successful outcome instead of auto-running
    if (cfg && cfg.run_count > 0) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
        const res = await fetch(`/api/researcher/mock-lab/${configId}/runs`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json() as { runs?: Array<{ outcome?: unknown; status: string }> };
        // Find the most recent run that actually has a stored outcome
        const lastSuccessful = (data.runs ?? []).find(r => r.outcome != null);
        if (lastSuccessful?.outcome) {
          parseOutcome({ report: lastSuccessful.outcome as MockOutcome });
          setIsNewOutcome(false);
          setOutcomeSaved(true);
          // Restore all steps as completed so the workflow panel shows green
          PIPELINE_STEPS.forEach(ps => setStepStatus(prev => ({ ...prev, [ps]: "completed" })));
          setCompleted(PIPELINE_STEPS as string[]);
          setActiveTab("summary");
        }
      } catch { /* show empty modal, user can re-run */ }
    } else {
      void runStep("run-all");
    }
  }

  // Phase 5 M5.16: wipe the localStorage cache and reset outcome UI to blank
  function clearSaved() {
    try { localStorage.removeItem("ckv-mocklab-last-outcome"); } catch { /* ignore */ }
    setOutcome(null);
    setRestoredAt(null);
    setIsNewOutcome(false);
    setOutcomeSaved(false);
    setStepStatus({});
    setCompleted([]);
    setNbResults({});
  }

  function parseOutcome(payload: { report?: MockOutcome }, fromLiveRun = false) {
    if (payload.report) {
      setOutcome(payload.report);
      setRestoredAt(null); // cleared — this is a fresh live result
      setActiveTab("summary");
      if (fromLiveRun) {
        setIsNewOutcome(true);
        setOutcomeSaved(false);
        // Phase 5 M5.15: persist to localStorage so the outcome survives navigation
        try {
          const entry = {
            batchCode: runConfigRef.current?.batchCode ?? config.batchCode,
            outcome: payload.report,
            savedAt: Date.now(),
          };
          localStorage.setItem("ckv-mocklab-last-outcome", JSON.stringify(entry));
        } catch { /* storage full or unavailable — non-critical */ }
      }
    }
  }

  async function saveOutcome() {
    if (!activeConfigId || !outcome) return;
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Create run record
      const postRes = await fetch(`/api/researcher/mock-lab/${activeConfigId}/runs`, {
        method: "POST",
        headers,
      });
      if (!postRes.ok) return;
      const { run } = await postRes.json() as { run: { id: string } };

      // Save outcome
      await fetch(`/api/researcher/mock-lab/${activeConfigId}/runs`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          run_id:       run.id,
          status:       "completed",
          outcome,
          completed_at: new Date().toISOString(),
        }),
      });

      setIsNewOutcome(false);
      setOutcomeSaved(true);
      void fetchConfigs(); // refresh run_count in table
      setShowPipelineModal(false);
    } catch { /* ignore */ }
  }

  async function handleCreateMock() {
    setConfigError(null);

    // Validate activity type
    if (!config.setFamily) {
      setConfigError("Please select an activity type.");
      return;
    }
    const isExamFamilyVal = config.setFamily === "exam";

    // Validate task type (not required for exam)
    if (!isExamFamilyVal && Object.keys(config.taskTypeCounts ?? {}).length === 0) {
      setConfigError("Please select a task type.");
      return;
    }

    // Validate seed
    if (config.seed !== undefined && (!Number.isInteger(config.seed) || config.seed < 0)) {
      setConfigError("Simulation seed must be a non-negative integer.");
      return;
    }

    // Validate rates
    if (config.atRiskRate < 0 || config.atRiskRate > 100) {
      setConfigError("At-Risk rate must be between 0 and 100.");
      return;
    }
    if (config.missingRate < 0 || config.missingRate > 100) {
      setConfigError("Missing submission rate must be between 0 and 100.");
      return;
    }

    const { data: { session: createSession } } = await supabase.auth.getSession();
    const createToken = createSession?.access_token ?? "";
    const res = await fetch("/api/researcher/mock-lab", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(createToken ? { Authorization: `Bearer ${createToken}` } : {}),
      },
      body: JSON.stringify({
        name: config.batchCode || undefined,
        n_students: config.nStudents,
        at_risk_rate: config.atRiskRate,
        missing_rate: config.missingRate,
        seed: config.seed ?? 42,
        set_family: config.setFamily,
        task_type_counts: config.taskTypeCounts ?? {},
        task_set_id: config.taskSetId ?? null,
        task_ids: config.taskIds ?? [],
      }),
    });

    if (res.ok) {
      setShowCreateModal(false);
      await fetchConfigs();
    } else {
      const json = await res.json() as { error?: string };
      const errMsg = json.error ?? "Failed to create mock config";
      if (res.status === 409) {
        setConfigError("Code for this Activity + Task combination is full (max 9999). Choose a different combination.");
      } else {
        setConfigError(errMsg);
      }
    }
  }

  async function handleSaveMock() {
    if (!editingConfig) { void handleCreateMock(); return; }
    // Edit mode — PATCH existing config
    setConfigError(null);
    const isUsed = editingConfig.run_count > 0;
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const body: Record<string, unknown> = { name: config.batchCode, active: editingConfig.active };
    if (!isUsed) {
      body.n_students      = config.nStudents;
      body.at_risk_rate    = config.atRiskRate;
      body.missing_rate    = config.missingRate;
      body.seed            = config.seed;
      body.set_family      = config.setFamily;
      body.task_type_counts = config.taskTypeCounts;
      body.task_set_id     = config.taskSetId ?? null;
      body.task_ids        = config.taskIds ?? [];
    }
    const res = await fetch(`/api/researcher/mock-lab/${editingConfig.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowCreateModal(false);
      setEditingConfig(null);
      await fetchConfigs();
    } else {
      const json = await res.json() as { error?: string };
      setConfigError(json.error ?? "Failed to update mock config");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this mock config and all its run history?")) return;
    const { data: { session: delSession } } = await supabase.auth.getSession();
    const delToken = delSession?.access_token ?? "";
    await fetch(`/api/researcher/mock-lab/${id}`, {
      method: "DELETE",
      headers: delToken ? { Authorization: `Bearer ${delToken}` } : {},
    });
    await fetchConfigs();
  }

  async function handleToggleActive(id: string, current: boolean) {
    const { data: { session: toggleSession } } = await supabase.auth.getSession();
    const toggleToken = toggleSession?.access_token ?? "";
    await fetch(`/api/researcher/mock-lab/${id}/active`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(toggleToken ? { Authorization: `Bearer ${toggleToken}` } : {}),
      },
      body: JSON.stringify({ active: !current }),
    });
    await fetchConfigs();
  }

  const isRunning = running !== null;
  const pipelineProgress = PIPELINE_STEPS.filter(s => stepStatus[s] === "completed").length;
  const pipelinePct = Math.round((pipelineProgress / PIPELINE_STEPS.length) * 100);

  const statusOf = (step: string): "green" | "yellow" | "red" | "idle" => {
    const s = stepStatus[step];
    if (!s || s === "waiting") return "idle";
    if (s === "completed") return "green";
    if (s === "running") return "yellow";
    if (s === "failed" || s === "aborted") return "red";
    return "idle";
  };

  const hasOutcome = outcome !== null;
  const topStatus = [
    { label: "Dataset Ready",    status: statusOf("data") },
    { label: "Feature Ready",    status: statusOf("process") },
    { label: "Model Ready",      status: statusOf("train") },
    { label: "Evaluation Ready", status: statusOf("evaluate") },
    { label: "Report Ready",     status: hasOutcome ? "green" as const : statusOf("outcome") },
  ];

  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  // ── icon helpers ────────────────────────────────────────────────────────────
  const SET_FAMILY_ICON: Record<string, React.ReactNode> = {
    assignment: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-[#64748B]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    lab: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-[#64748B]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    exam: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-[#64748B]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  };

  // ── inline activity icon buttons ────────────────────────────────────────────
  const AssignmentIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
  const LabIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  );
  const ExamIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );

  return (
    <>
    {/* ══════════════════════════════════════════════════════════════════════════
        CREATE MOCK MODAL — Dataset Analytics layout
    ══════════════════════════════════════════════════════════════════════════ */}
    {showCreateModal && (() => {
      // Edit vs Create context
      const isEdit = editingConfig !== null;
      const isUsed = isEdit && (editingConfig?.run_count ?? 0) > 0;
      const isLocked = isUsed; // when used, only name + status editable

      // Compute code preview from current form state
      const PREVIEW_ACTIVITY_CODE: Record<string, string> = { assignment: "A", lab: "L", exam: "E" };
      const PREVIEW_TASK_TYPE_CODE: Record<string, string> = { sql_text: "QT", sql_block: "QB", stored_procedure: "SP", er_diagram: "ER" };
      const mockActivityCode = config.setFamily ? PREVIEW_ACTIVITY_CODE[config.setFamily] : null;
      const previewFirstTaskType = Object.keys(config.taskTypeCounts ?? {})[0] ?? "";
      const isExamFamily = config.setFamily === "exam";
      const mockTaskCode = isExamFamily ? "EX" : (previewFirstTaskType ? PREVIEW_TASK_TYPE_CODE[previewFirstTaskType] : null);
      const mockCodePreview = isEdit
        ? editingConfig!.code
        : ((mockActivityCode && mockTaskCode) ? `M${mockActivityCode}${mockTaskCode}####` : null);

      return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget && !isRunning) setShowCreateModal(false); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#FED7AA] shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-[#0F172A]">{isEdit ? "Edit Mock" : "Create Mock"}</h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                {isEdit ? "แก้ไขข้อมูล mock simulation dataset" : "Configure a mock simulation dataset"}
              </p>
              {isEdit && (
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isUsed ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0]"}`}>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    {isUsed ? `Used · ${editingConfig!.run_count} run${editingConfig!.run_count !== 1 ? "s" : ""}` : "Not used"}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${editingConfig!.active ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${editingConfig!.active ? "bg-emerald-500" : "bg-[#CBD5E1]"}`} />
                    {editingConfig!.active ? "Active" : "Inactive"}
                  </span>
                  {isUsed && (
                    <span className="text-[10px] text-amber-600 font-medium">— แก้ได้เฉพาะ Name และ Status</span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-[#94A3B8] hover:text-[#0F172A] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">

            {/* Error banner */}
            {configError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
                <p className="text-xs text-red-600 font-semibold">{configError}</p>
              </div>
            )}

            {/* Code Preview */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-center">
              {mockCodePreview ? (
                <span className="font-mono text-lg tracking-widest text-[#0F172A] font-bold">{mockCodePreview}</span>
              ) : (
                <span className="text-[#94A3B8] italic text-sm">Select Activity · Task Type</span>
              )}
              <p className="text-[10px] text-[#94A3B8] mt-1">code assigned on save</p>
            </div>

            {/* Mock Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#64748B]">Mock Name</label>
              <input
                type="text"
                value={config.batchCode}
                onChange={e => updateConfig("batchCode", e.target.value)}
                placeholder="e.g. Pilot Simulation Jan 2026"
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021]"
              />
            </div>

            {/* Type badge + Activity Type + Task Type */}
            <div className="flex gap-4 flex-wrap">
              {/* Column A — Mock Type badge (non-interactive) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#64748B]">Type</label>
                <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-[#F37021]">
                  <div className="flex items-center justify-center px-3 py-2 text-white gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Column B — Activity Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#64748B]">Activity Type *</label>
                <div className={`flex rounded-xl border border-[#FED7AA] overflow-hidden w-fit ${isLocked ? "opacity-50 pointer-events-none" : "bg-white"}`}>
                  <button type="button" title={SET_FAMILY_LABEL["assignment"]} disabled={isLocked}
                    onClick={() => { setDummySetFamily("assignment"); updateConfig("setFamily", "assignment"); updateConfig("taskTypeCounts", { [dummyTaskType]: config.taskIds?.length ?? config.nTasks }); }}
                    className={`flex items-center justify-center px-3 py-2 border-r border-[#FED7AA] transition-colors ${(config.setFamily ?? dummySetFamily) === "assignment" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M9 5h6"/><path d="M9 12h6"/><path d="M9 17h4"/>
                      <path d="M5 7.5 6.5 9 9 6"/><path d="M5 14.5 6.5 16 9 13"/>
                      <rect x="4" y="3" width="16" height="18" rx="2"/>
                    </svg>
                  </button>
                  <button type="button" title={SET_FAMILY_LABEL["lab"]} disabled={isLocked}
                    onClick={() => { setDummySetFamily("lab"); updateConfig("setFamily", "lab"); updateConfig("taskTypeCounts", { [dummyTaskType]: config.taskIds?.length ?? config.nTasks }); }}
                    className={`flex items-center justify-center px-3 py-2 border-r border-[#FED7AA] transition-colors ${(config.setFamily ?? dummySetFamily) === "lab" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2"/>
                      <path d="M8 2h8"/><path d="M7 15h10"/>
                    </svg>
                  </button>
                  <button type="button" title={SET_FAMILY_LABEL["exam"]} disabled={isLocked}
                    onClick={() => { setDummySetFamily("exam"); updateConfig("setFamily", "exam"); updateConfig("taskTypeCounts", {}); }}
                    className={`flex items-center justify-center px-3 py-2 transition-colors ${(config.setFamily ?? dummySetFamily) === "exam" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                      <path d="M14 2v6h6"/><path d="M9 14h6"/><path d="M9 18h4"/>
                    </svg>
                  </button>
                </div>
                {!config.setFamily && (
                  <p className="text-xs text-red-500">Select an activity type</p>
                )}
              </div>

              {/* Column C — Task Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#64748B]">
                  Task Type{isExamFamily ? "" : " *"}
                </label>
                {isExamFamily ? (
                  <div className="inline-flex items-center px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-mono text-[#94A3B8]">
                    EX = All
                  </div>
                ) : (
                  <>
                    <div className={`flex rounded-xl border border-[#FED7AA] overflow-hidden w-fit ${isLocked ? "opacity-50 pointer-events-none" : "bg-white"}`}>
                      {(THESIS_TASK_TYPE_ORDER as TaskType[]).map((tt, i) => {
                        const phase4 = isPhase4Supported(tt);
                        const label  = THESIS_TASK_TYPE_LABEL[tt] ?? tt;
                        const isSelected = dummyTaskType === tt && Object.keys(config.taskTypeCounts ?? {}).includes(tt);
                        return (
                          <button
                            key={tt}
                            type="button"
                            disabled={!phase4 || isLocked}
                            title={!phase4 ? `${label} — Planned Phase 5` : label}
                            onClick={() => {
                              if (!phase4) return;
                              setDummyTaskType(tt);
                              updateConfig("taskTypeCounts", { [tt]: config.taskIds?.length ?? config.nTasks });
                            }}
                            className={`relative flex items-center justify-center px-3 py-2 ${i < THESIS_TASK_TYPE_ORDER.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${
                              !phase4
                                ? "opacity-40 cursor-not-allowed bg-[#F8FAFC] text-[#94A3B8]"
                                : isSelected
                                  ? "bg-[#F37021] text-white"
                                  : "text-[#64748B] hover:bg-[#FFF7ED]"
                            }`}
                          >
                            <TaskTypeIcon type={tt} className="w-4 h-4" />
                            {!phase4 && (
                              <span className="absolute top-0.5 right-0.5 text-[7px] font-bold leading-none opacity-60">5</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {!isExamFamily && Object.keys(config.taskTypeCounts ?? {}).length === 0 && (
                      <p className="text-xs text-red-500">Select a task type</p>
                    )}
                  </>
                )}
              </div>
            </div>


            {/* Simulation Parameters */}
            <div className="space-y-2 border-t border-[#F1F5F9] pt-4">
              <p className="text-xs font-bold text-[#0F172A]">Simulation Parameters</p>
              <div className={`grid grid-cols-2 gap-3 ${isLocked ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#64748B]">At-Risk (%)</label>
                  <input type="number" min={0} max={100} value={config.atRiskRate} disabled={isLocked}
                    onChange={e => updateConfig("atRiskRate", Math.max(0, Math.min(100, +e.target.value)))}
                    className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#64748B]">Submission (%)</label>
                  <input type="number" min={0} max={100} disabled={isLocked}
                    value={100 - (config.missingRate ?? 7)}
                    onChange={e => updateConfig("missingRate", Math.max(0, Math.min(100, 100 - +e.target.value)))}
                    className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021]" />
                </div>
              </div>
            </div>

            {/* Link to Real Class (optional) — auto-fills student count */}
            <div className={`border-t border-[#F1F5F9] pt-4 space-y-2 ${isLocked ? "opacity-50 pointer-events-none" : ""}`}>
              <p className="text-xs font-bold text-[#0F172A]">Link to Real Class <span className="font-normal text-[#94A3B8]">(optional)</span></p>
              <select
                value={selectedClassId}
                onChange={e => {
                  const val = e.target.value;
                  if (!val) {
                    setTaskSets([]);
                    setSelectedSetId("");
                    setConfig(prev => ({
                      ...prev,
                      taskIds: undefined,
                      taskSetId: undefined,
                      nTasks: 3,
                      nStudents: 10,
                      setFamily: dummySetFamily,
                      taskTypeCounts: { [dummyTaskType]: 3 },
                    }));
                  } else {
                    const cls = classes.find(c => c.class_id === val);
                    if (cls && cls.student_count > 0) {
                      setConfig(prev => ({ ...prev, nStudents: cls.student_count }));
                    }
                  }
                  setSelectedClassId(val);
                }}
                disabled={classesLoading}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] bg-white"
              >
                <option value="">{classesLoading ? "Loading classes..." : classes.length === 0 ? "No active classes found" : "— Select class —"}</option>
                {classes.map(c => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.class_name} ({c.class_code}) · {c.academic_year}/{c.term} · {c.student_count} students
                  </option>
                ))}
              </select>
              {(() => {
                const filteredTaskSets = taskSets.filter(s =>
                  s.family === dummySetFamily &&
                  Object.keys(s.task_type_counts).includes(dummyTaskType)
                );
                return (
                  <select
                    value={selectedSetId}
                    onChange={e => handleTaskSetSelect(e.target.value)}
                    disabled={!selectedClassId || taskSetsLoading}
                    className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] bg-white"
                  >
                    <option value="">
                      {!selectedClassId
                        ? "— Select class first —"
                        : taskSetsLoading
                        ? "Loading task sets..."
                        : filteredTaskSets.length === 0
                        ? "No matching task sets"
                        : "— Select task set —"}
                    </option>
                    {filteredTaskSets.map(s => (
                      <option key={s.batch_id} value={s.batch_id}>
                        {SET_FAMILY_LABEL[s.family as SetFamily] ?? s.family} · {s.batch_name ?? s.batch_code ?? s.batch_id} · {s.task_count} task{s.task_count !== 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#FED7AA] flex items-center justify-between shrink-0">
            {/* Left — Status toggle (edit only) */}
            {isEdit ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingConfig(prev => prev ? { ...prev, active: !prev.active } : prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editingConfig!.active ? "bg-emerald-500" : "bg-[#CBD5E1]"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editingConfig!.active ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className="text-xs font-semibold text-[#64748B]">{editingConfig!.active ? "Active" : "Inactive"}</span>
              </div>
            ) : <div />}
            {/* Right — action buttons */}
            <div className="flex items-center gap-2">
            {isEdit ? (
              /* Edit mode: show Delete (only when not used) */
              !isUsed && (
                <button
                  onClick={async () => { await handleDelete(editingConfig!.id); setShowCreateModal(false); setEditingConfig(null); }}
                  className="p-2.5 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete Mock"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )
            ) : (
              /* Create mode: Reset button */
              <button
                onClick={() => {
                  setDummySetFamily("assignment");
                  setDummyTaskType("sql_text");
                  setConfig(prev => ({
                    ...prev,
                    batchCode: "",
                    nStudents: 10,
                    atRiskRate: 35,
                    missingRate: 7,
                    seed: 42,
                    setFamily: "assignment",
                    taskTypeCounts: { sql_text: 3 },
                  }));
                  setConfigError(null);
                }}
                className="p-2.5 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                title="Reset"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
            <button
              onClick={() => { void handleSaveMock(); }}
              className="p-2.5 rounded-xl bg-[#F37021] text-white hover:bg-[#C2410C] transition-colors"
              title="Save Mock"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            </div>
          </div>
        </div>
      </div>
      );
    })()}

    {/* ══════════════════════════════════════════════════════════════════════════
        PIPELINE MODAL — Workflow + Progress + Outcome
    ══════════════════════════════════════════════════════════════════════════ */}
    {showPipelineModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#FED7AA] shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">Pipeline Workflow</h2>
                <p className="text-xs text-[#64748B] font-mono mt-0.5">{config.batchCode}</p>
              </div>
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-200 text-[11px] font-bold text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Running
                </span>
              )}
              {!isRunning && pipelineProgress > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-[11px] font-bold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {pipelinePct}% complete
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isRunning ? (
                <button
                  onClick={stopPipeline}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                  </svg>
                  Stop
                </button>
              ) : (
                <>
                  {/* Phase 5 M5.15/M5.16: restored-from-storage badge + clear button */}
                  {outcome && restoredAt !== null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-700 border border-sky-200">
                      <span title={`Restored from localStorage — run completed at ${new Date(restoredAt).toLocaleTimeString()}`}>
                        ↺ Restored
                      </span>
                      <button
                        onClick={clearSaved}
                        title="Clear saved outcome and reset"
                        className="ml-0.5 hover:text-sky-900 transition-colors leading-none"
                        aria-label="Clear saved outcome"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {/* Save icon — shown only after a live run, before saving */}
                  {outcome && isNewOutcome && !outcomeSaved && (
                    <button
                      onClick={() => void saveOutcome()}
                      title="Save result"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      {/* floppy-disk save icon */}
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => void runStep("run-all")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F37021] text-white hover:bg-[#C2410C] transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                    </svg>
                    {(pipelineProgress > 0 || outcome) ? "Re-run" : "Run All"}
                  </button>
                </>
              )}
              <button
                onClick={() => setShowPipelineModal(false)}
                disabled={isRunning}
                className="text-[#94A3B8] hover:text-[#0F172A] transition-colors disabled:opacity-30"
                title={isRunning ? "Stop the pipeline before closing" : "Close"}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 p-5 space-y-4">

            {/* Settings */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl px-4 py-3 flex items-center gap-4">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide shrink-0">Settings</span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#64748B] shrink-0">Simulation Seed</label>
                <input
                  type="number" min={0} max={2147483647}
                  value={config.seed ?? 42}
                  onChange={e => updateConfig("seed", Math.max(0, Math.min(2147483647, +e.target.value)))}
                  disabled={isRunning}
                  className="w-28 px-2 py-1 text-sm border border-[#CBD5E1] rounded-lg font-mono focus:outline-none focus:border-[#F37021] disabled:opacity-50 disabled:bg-[#F1F5F9]"
                />
              </div>
            </div>

            {/* Status cards row */}
            <div className="grid grid-cols-5 gap-2">
              {topStatus.map(({ label, status }) => (
                <div key={label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 space-y-1 text-center">
                  <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide leading-tight">{label}</p>
                  <StatusPill status={status} />
                </div>
              ))}
            </div>

            {/* Pipeline steps */}
            <div className="space-y-1">
              {PIPELINE_STEPS.map((stepId, idx) => {
                const meta = STEP_META[stepId];
                const status = stepStatus[stepId] ?? "waiting";
                const isThisRunning = running === stepId || (running === "run-all" && status === "running");

                const statusStyle = {
                  waiting:   "border-[#E2E8F0] bg-[#F8FAFC]",
                  running:   "border-[#FED7AA] bg-[#FFF7ED]",
                  completed: "border-emerald-200 bg-emerald-50",
                  failed:    "border-red-200 bg-red-50",
                  aborted:   "border-orange-200 bg-orange-50",
                }[status];

                const iconStyle = {
                  waiting:   "bg-[#F1F5F9] text-[#94A3B8]",
                  running:   "bg-[#FED7AA] text-[#F37021]",
                  completed: "bg-emerald-100 text-emerald-600",
                  failed:    "bg-red-100 text-red-500",
                  aborted:   "bg-orange-100 text-orange-500",
                }[status];

                const labelStyle = {
                  waiting:   "text-[#94A3B8]",
                  running:   "text-[#C2410C]",
                  completed: "text-emerald-700",
                  failed:    "text-red-600",
                  aborted:   "text-orange-600",
                }[status];

                return (
                  <div key={stepId}>
                    <button
                      onClick={() => void runStep(stepId)}
                      disabled={isRunning}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left disabled:cursor-not-allowed ${statusStyle} ${!isRunning ? "hover:border-[#F37021]" : ""}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconStyle}`}>
                        {isThisRunning ? <Spinner /> : meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${labelStyle}`}>{meta.label}</p>
                        <p className="text-[11px] text-[#94A3B8] truncate">{meta.desc}</p>
                      </div>
                      <div className="shrink-0">
                        {status === "waiting" && <span className="text-[10px] font-semibold text-[#CBD5E1] uppercase tracking-wide">Waiting</span>}
                        {status === "running" && <span className="text-[10px] font-semibold text-[#F37021] uppercase tracking-wide">Running</span>}
                        {status === "completed" && (
                          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                        {status === "failed" && (
                          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {status === "aborted" && <span className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide">Aborted</span>}
                      </div>
                    </button>
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <div className="ml-7 w-0.5 h-3 bg-[#E2E8F0]" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress section */}
            {(isRunning || pipelineProgress > 0) && (
              <div className="border-t border-[#F1F5F9] pt-4 space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-[#64748B]">
                    <span>{pipelinePct}% complete</span>
                    <span>{pipelineProgress}/{PIPELINE_STEPS.length} steps</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div className="h-full rounded-full bg-[#F37021] transition-all duration-500" style={{ width: `${pipelinePct}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Current Step", value: running ? STEP_META[running]?.label ?? running : "—", color: "text-[#C2410C]" },
                    { label: "Elapsed",      value: fmtElapsed(elapsed),                                  color: "text-[#0F172A]" },
                    { label: "Completed",    value: `${completedSteps.length} steps`,                     color: "text-emerald-600" },
                    { label: "Errors",       value: String(errorCount),                                   color: errorCount > 0 ? "text-red-600" : "text-[#0F172A]" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-[#FFF7ED] rounded-xl px-3 py-2 space-y-0.5">
                      <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide">{label}</p>
                      <p className={`text-xs font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Live Extract Progress */}
                {liveProgress && (
                  <div className="border border-[#FED7AA] rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#0F172A]">Extract Live Progress</p>
                      {isRunning && hangSeconds !== null && hangSeconds > 30 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-[10px] font-bold text-amber-700">
                          No progress for {hangSeconds}s
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {[
                        { label: "Student",   value: liveProgress.student },
                        { label: "Task",      value: liveProgress.task },
                        { label: "Operation", value: liveProgress.op },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-[#F8FAFC] rounded-xl px-2 py-1.5 space-y-0.5">
                          <p className="text-[#94A3B8] font-semibold uppercase tracking-wide text-[9px]">{label}</p>
                          <p className="font-mono font-bold text-[#0F172A] truncate text-xs">{value}</p>
                        </div>
                      ))}
                    </div>
                    {liveProgress.totalCalls > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-[#64748B]">
                          <span>{liveProgress.completedCalls} / {liveProgress.totalCalls} API calls</span>
                          <span>ETA ~ {Math.floor(liveProgress.etaSec / 60)}m {liveProgress.etaSec % 60}s</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                          <div className="h-full rounded-full bg-[#F37021] transition-all duration-300"
                            style={{ width: `${Math.round(liveProgress.completedCalls / liveProgress.totalCalls * 100)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Final Stats */}
                {finalStats && !isRunning && (
                  <div className="border-t border-[#F1F5F9] pt-3 space-y-2">
                    <p className="text-xs font-bold text-[#0F172A]">Extract Performance</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {[
                        ["Total Requests",   String(finalStats.totalRequests)],
                        ["Duration",         `${finalStats.totalDurationSec}s`],
                        ["p50",              `${finalStats.p50Ms}ms`],
                        ["p95",              `${finalStats.p95Ms}ms`],
                        ["Slowest",          `${finalStats.slowestMs}ms`],
                        ["Endpoint",         finalStats.slowestEndpoint.split(":")[0]],
                      ].map(([k, v]) => (
                        <div key={k} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2 py-1.5 space-y-0.5">
                          <p className="text-[#94A3B8] font-semibold uppercase tracking-wide text-[9px]">{k}</p>
                          <p className="font-mono font-bold text-[#0F172A] truncate text-xs">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Outcome Tabs */}
            {(outcome || logs.length > 0) && (
              <div className="border border-[#FED7AA] rounded-2xl overflow-hidden">
                <div className="flex border-b border-[#FED7AA] overflow-x-auto">
                  {(["summary", "metrics",
                    ...(outcome?.sequenceModels ? ["sequence"] : []),
                    "charts", "dataset", "reports", "logs",
                  ] as OutcomeTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2.5 text-xs font-semibold capitalize whitespace-nowrap transition-colors border-b-2 ${
                        activeTab === tab
                          ? "border-[#F37021] text-[#F37021] bg-[#FFF7ED]"
                          : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                      }`}
                    >
                      {tab}
                      {tab === "logs" && logs.length > 0 && (
                        <span className="ml-1.5 bg-[#FED7AA] text-[#C2410C] text-[10px] font-bold px-1.5 py-0.5 rounded-full">{logs.length}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="p-4">
                  {/* Summary */}
                  {activeTab === "summary" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {([
                          { label: "Pipeline Status", value: isRunning ? "Running" : pipelineProgress > 0 ? "Completed" : "Not started", ok: !isRunning && pipelineProgress > 0 },
                          { label: "Dataset Ready",   value: stepStatus["data"]     === "completed" ? "Yes" : "No", ok: stepStatus["data"]     === "completed" },
                          { label: "Training Ready",  value: stepStatus["train"]    === "completed" ? "Yes" : "No", ok: stepStatus["train"]    === "completed" },
                          { label: "Eval Ready",      value: stepStatus["evaluate"] === "completed" ? "Yes" : "No", ok: stepStatus["evaluate"] === "completed" },
                          { label: "Report Ready",    value: outcome ? "Yes" : "No", ok: !!outcome },
                          { label: "Samples",         value: outcome ? String(outcome.dataset.samples) : "—", ok: null },
                        ] as { label: string; value: string; ok: boolean | null }[]).map(({ label, value, ok }) => (
                          <div key={label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 space-y-0.5">
                            <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide">{label}</p>
                            <p className={`text-sm font-bold ${ok === true ? "text-emerald-600" : ok === false ? "text-[#94A3B8]" : "text-[#0F172A]"}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                      {outcome && (
                        <div className="grid grid-cols-3 gap-2">
                          {(["pii", "leakage", "splitIntegrity"] as const).map(k => (
                            <div key={k} className={`rounded-xl px-3 py-2 border text-center ${outcome.checks[k] === "pass" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                              <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide">{k === "splitIntegrity" ? "Split" : k.toUpperCase()}</p>
                              <p className={`text-sm font-bold mt-0.5 ${outcome.checks[k] === "pass" ? "text-emerald-600" : "text-red-600"}`}>
                                {outcome.checks[k] === "pass" ? "Pass" : "Fail"}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Phase 5 M5.17 — notebook PASS/FAIL badge grid */}
                      {Object.keys(nbResults).length > 0 && (
                        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 space-y-2">
                          <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide">
                            Notebook Run Results
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {([
                              { key: "NB02", label: "NB02 Baseline" },
                              { key: "NB03", label: "NB03 CV" },
                              { key: "NB04", label: "NB04 Test" },
                              { key: "NB05", label: "NB05 Seq" },
                              { key: "NB06", label: "NB06 TAG" },
                              { key: "NB07", label: "NB07 LSTM" },
                              { key: "NB08", label: "NB08 GRU" },
                              { key: "NB09", label: "NB09 Cmp" },
                            ] as const).map(({ key, label }) => {
                              const r = nbResults[key];
                              if (!r) return null;
                              return (
                                <span
                                  key={key}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    r === "PASS"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-red-50 text-red-700 border-red-200"
                                  }`}
                                >
                                  {r === "PASS" ? "✅" : "❌"} {label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Phase 5 M5.12 — sequence model summary card (sql_block sessions only) */}
                      {outcome?.sequenceModels && (
                        <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl p-3 space-y-2">
                          <p className="text-[9px] font-semibold text-[#7C3AED] uppercase tracking-wide">
                            Sequence Models (NB05–NB09) ✓
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {(["lstm", "gru"] as const).map(key => {
                              const m = outcome.sequenceModels![key];
                              if (!m) return null;
                              return (
                                <div key={key} className="bg-white rounded-lg px-3 py-2 border border-[#DDD6FE]">
                                  <p className="text-[9px] font-semibold text-[#94A3B8] uppercase">{key}</p>
                                  <p className="text-sm font-bold text-[#7C3AED]">
                                    AUC {m.auc != null ? m.auc.toFixed(3) : "—"}
                                  </p>
                                  <p className="text-[10px] text-[#94A3B8]">
                                    F1 {m.f1 != null ? m.f1.toFixed(3) : "—"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            onClick={() => setActiveTab("sequence")}
                            className="text-[10px] text-[#7C3AED] hover:underline"
                          >
                            ↗ View full comparison in Sequence tab
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Metrics */}
                  {activeTab === "metrics" && (
                    <div className="space-y-3">
                      {outcome ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {([
                            { key: "majorityBaseline",   label: "Majority Baseline",   aucColor: "#94A3B8", f1Color: "#CBD5E1" },
                            { key: "logisticRegression", label: "Logistic Regression", aucColor: "#F37021", f1Color: "#FB923C" },
                            { key: "randomForest",       label: "Random Forest",       aucColor: "#0EA5E9", f1Color: "#38BDF8" },
                          ] as const).map(({ key, label, aucColor, f1Color }) => (
                            <div key={key} className="space-y-2">
                              <p className="text-xs font-bold text-[#0F172A] pb-1 border-b border-[#F1F5F9]">{label}</p>
                              <MetricBar label="AUC-ROC" value={outcome.metrics[key].auc} color={aucColor} />
                              <MetricBar label="F1"      value={outcome.metrics[key].f1}  color={f1Color} />
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-[#94A3B8]">Run Mock Outcome to load metrics.</p>}
                    </div>
                  )}
                  {/* Sequence Models — Phase 5 M5.8 (NB05–NB09, sql_block sessions only) */}
                  {activeTab === "sequence" && (
                    <div className="space-y-4">
                      {outcome?.sequenceModels ? (
                        <>
                          {/* Pilot-only disclaimer */}
                          <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-lg p-3 text-xs text-[#92400E]">
                            <span className="font-semibold">⚠ Pilot Only</span>
                            {" — label_validity="}<span className="font-mono">{outcome.sequenceModels.labelValidity ?? "pilot_only"}</span>.
                            {" Pipeline validation results only — not thesis conclusions."}
                          </div>

                          {/* LSTM / GRU metric bars */}
                          {(outcome.sequenceModels.lstm || outcome.sequenceModels.gru) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {(["lstm", "gru"] as const).map(key => {
                                const m = outcome.sequenceModels![key];
                                if (!m) return null;
                                const color = key === "lstm"
                                  ? { auc: "#8B5CF6", f1: "#A78BFA" }
                                  : { auc: "#10B981", f1: "#34D399" };
                                return (
                                  <div key={key} className="space-y-2">
                                    <p className="text-xs font-bold text-[#0F172A] pb-1 border-b border-[#F1F5F9] uppercase">{key}</p>
                                    <MetricBar label="AUC-ROC" value={m.auc} color={color.auc} />
                                    <MetricBar label="F1"      value={m.f1}  color={color.f1} />
                                    {m.params != null && (
                                      <p className="text-[10px] text-[#94A3B8]">Parameters: {m.params.toLocaleString()}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* NB09 full comparison table */}
                          {(outcome.sequenceModels.comparisonRows?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-xs font-bold text-[#0F172A] mb-2">Model Comparison (NB09)</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-[#E2E8F0]">
                                      <th className="text-left py-1.5 pr-3 text-[#64748B] font-medium">Model</th>
                                      <th className="text-right py-1.5 pr-3 text-[#64748B] font-medium">AUC-ROC</th>
                                      <th className="text-right py-1.5 pr-3 text-[#64748B] font-medium">F1</th>
                                      <th className="text-right py-1.5 text-[#64748B] font-medium">Params</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {outcome.sequenceModels.comparisonRows!.map(row => (
                                      <tr key={row.model} className="border-b border-[#F1F5F9] last:border-0">
                                        <td className="py-1.5 pr-3 text-[#0F172A] font-medium">{row.model}</td>
                                        <td className="py-1.5 pr-3 text-right font-mono text-[#0F172A]">
                                          {row.auc != null ? row.auc.toFixed(3) : "—"}
                                        </td>
                                        <td className="py-1.5 pr-3 text-right font-mono text-[#0F172A]">
                                          {row.f1 != null ? row.f1.toFixed(3) : "—"}
                                        </td>
                                        <td className="py-1.5 text-right font-mono text-[#64748B]">
                                          {row.params != null ? row.params.toLocaleString() : "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Phase 5 M5.9 — sequence model charts (NB05–NB08 PNGs) */}
                          {outcome.sequenceModels.charts && (() => {
                            const c = outcome.sequenceModels!.charts!;
                            const chartDefs = ([
                              { key: "seqLengthDist"        as const, label: "Sequence Length Distribution (NB05)" },
                              { key: "tagTransitionHeatmap" as const, label: "Block Transition Heatmap (NB06)"     },
                              { key: "tagCohortGraphs"      as const, label: "Cohort TAG Graphs (NB06)"            },
                              { key: "lstmTrainingCurves"   as const, label: "LSTM Training Curves (NB07)"         },
                              { key: "gruTrainingCurves"    as const, label: "GRU Training Curves (NB08)"          },
                            ] as const).filter(d => !!c[d.key]);
                            if (chartDefs.length === 0) return null;
                            return (
                              <div>
                                <p className="text-xs font-bold text-[#0F172A] mb-2">Block Journey Charts</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {chartDefs.map(({ key, label }) => (
                                    <div key={key} className="border border-[#E2E8F0] rounded-xl p-3">
                                      <p className="text-[11px] font-semibold text-[#64748B] mb-2">{label}</p>
                                      <img src={c[key]!} alt={label} className="w-full rounded-xl" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <p className="text-sm text-[#94A3B8]">
                          Sequence models not available — NB05–NB09 require sql_block sessions.
                        </p>
                      )}
                    </div>
                  )}
                  {/* Charts */}
                  {activeTab === "charts" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([
                        { key: "confusionMatrix",   label: "Confusion Matrix" },
                        { key: "rocCurve",          label: "ROC Curve" },
                        { key: "featureImportance", label: "Feature Importance" },
                      ] as const).map(({ key, label }) =>
                        outcome?.charts[key] ? (
                          <div key={key} className="border border-[#E2E8F0] rounded-xl p-3">
                            <p className="text-[11px] font-semibold text-[#64748B] mb-2">{label}</p>
                            <img src={outcome.charts[key]} alt={label} className="w-full rounded-xl" />
                          </div>
                        ) : <ChartPlaceholder key={key} label={label} />
                      )}
                    </div>
                  )}
                  {/* Dataset */}
                  {activeTab === "dataset" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {([
                        ["Batch Code",    outcome?.batchCode ?? config.batchCode],
                        ["Students",      outcome ? String(outcome.dataset.students)    : String(config.nStudents)],
                        ["Tasks",         outcome ? String(outcome.dataset.tasks)       : String(config.taskIds?.length ?? config.nTasks)],
                        ["Samples",       outcome ? String(outcome.dataset.samples)     : "—"],
                        ["Train",         outcome ? String(outcome.dataset.trainSamples): "—"],
                        ["Test",          outcome ? String(outcome.dataset.testSamples) : "—"],
                        ["Sessions",      outcome ? String(outcome.dataset.sessions)    : "—"],
                        ["Attempts",      outcome ? String(outcome.dataset.attempts)    : "—"],
                        ["Submissions",   outcome ? String(outcome.dataset.submissions) : "—"],
                        ["At-Risk Rate",  `${config.atRiskRate}%`],
                        ["Missing Rate",  `${config.missingRate}%`],
                        ["Split Method",  "GroupShuffleSplit"],
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 space-y-0.5">
                          <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wide">{k}</p>
                          <p className="text-xs font-mono font-bold text-[#0F172A]">{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reports */}
                  {activeTab === "reports" && (
                    <div className="space-y-3">
                      {outcome ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {([
                            { key: "metadata",   label: "Metadata JSON",    desc: outcome.reports.metadata   ?? "notebooks/models/metadata_*.json" },
                            { key: "evaluation", label: "Evaluation Report", desc: outcome.reports.evaluation ?? "Not generated" },
                            { key: "log",        label: "Pipeline Log",      desc: "Full SSE stream from this session", onClick: () => setActiveTab("logs") },
                          ] as { key: string; label: string; desc: string; onClick?: () => void }[]).map(({ key, label, desc, onClick }) => (
                            <div key={key} className="border border-[#E2E8F0] rounded-xl p-3 space-y-2">
                              <p className="text-sm font-bold text-[#0F172A]">{label}</p>
                              <p className="text-xs text-[#64748B] font-mono break-all">{desc}</p>
                              {onClick && (
                                <button onClick={onClick} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#FED7AA] text-[#C2410C] hover:border-[#F37021] transition-colors">
                                  View Logs
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-[#94A3B8]">Run the full pipeline to generate reports.</p>}
                    </div>
                  )}
                  {/* Logs */}
                  {activeTab === "logs" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#0F172A]">Pipeline Log</p>
                        {logs.length > 0 && (
                          <button onClick={() => setLogs([])} className="text-[11px] text-[#94A3B8] hover:text-red-500 transition-colors">Clear</button>
                        )}
                      </div>
                      {logs.length > 0 ? (
                        <div className="bg-[#0F172A] rounded-xl px-4 py-3 h-56 overflow-y-auto font-mono text-xs text-[#94A3B8] space-y-0.5">
                          {logs.map((line, i) => (
                            <div key={i} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-green-400" : line.startsWith("--") ? "text-[#F37021] font-semibold" : undefined}>
                              {line}
                            </div>
                          ))}
                          <div ref={logEndRef} />
                        </div>
                      ) : <p className="text-sm text-[#94A3B8]">No log output yet.</p>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* ══════════════════════════════════════════════════════════════════════════
        MAIN PAGE — Title row + filter bar + data table
    ══════════════════════════════════════════════════════════════════════════ */}
    <section className="space-y-5">
      {/* ── Title row ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Mock Lab</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Simulated baseline AI pipeline for technical validation.</p>
        </div>
        <button
          onClick={() => {
            setDummySetFamily("assignment");
            setDummyTaskType("sql_text");
            setConfig({
              batchCode: `MOCK_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_001`,
              nStudents: 10,
              nTasks: 3,
              atRiskRate: 35,
              missingRate: 7,
              seed: 42,
              setFamily: "assignment",
              taskTypeCounts: { sql_text: 3 },
              apiBase: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
            });
            setConfigError(null);
            setSelectedClassId("");
            setSelectedSetId("");
            setTaskSets([]);
            setEditingConfig(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-[#F37021] text-white hover:bg-[#C2410C] transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Mock
        </button>
      </div>

      {/* ── Filter bar ── */}
      <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 overflow-x-auto">
      <div className="flex items-end gap-4 min-w-max">
        {/* Search */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748B] font-medium">Search</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
            </svg>
            <input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Code or name…" aria-label="Search mock configs"
              className="pl-9 pr-3 py-2.5 border border-[#FED7AA] rounded-xl bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021] w-44" />
          </div>
        </div>

        {/* Activity */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748B] font-medium">Activity</label>
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            <button type="button" title="All activities" onClick={() => setFilterActivity("all")}
              className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${filterActivity === "all" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              All
            </button>
            <button type="button" title="Assignment" onClick={() => setFilterActivity("assignment")}
              className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${filterActivity === "assignment" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M9 5h6"/><path d="M9 12h6"/><path d="M9 17h4"/>
                <path d="M5 7.5 6.5 9 9 6"/><path d="M5 14.5 6.5 16 9 13"/>
                <rect x="4" y="3" width="16" height="18" rx="2"/>
              </svg>
            </button>
            <button type="button" title="Lab" onClick={() => setFilterActivity("lab")}
              className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${filterActivity === "lab" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17L14 8V2"/>
                <path d="M8 2h8"/><path d="M7 15h10"/>
              </svg>
            </button>
            <button type="button" title="Exam" onClick={() => setFilterActivity("exam")}
              className={`flex items-center justify-center px-3 py-2.5 transition-colors ${filterActivity === "exam" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                <path d="M14 2v6h6"/><path d="M9 14h6"/><path d="M9 18h4"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Task */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748B] font-medium">Task</label>
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            <button type="button" title="All task types" onClick={() => setFilterTaskType("all")}
              className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${filterTaskType === "all" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              All
            </button>
            {(THESIS_TASK_TYPE_ORDER as TaskType[]).map((tt, i) => (
              <button key={tt} type="button" title={tt} onClick={() => setFilterTaskType(tt)}
                disabled={!isPhase4Supported(tt)}
                className={`flex items-center justify-center px-3 py-2.5 ${i < THESIS_TASK_TYPE_ORDER.length - 1 ? "border-r border-[#FED7AA]" : ""} transition-colors ${filterTaskType === tt ? "bg-[#F37021] text-white" : isPhase4Supported(tt) ? "text-[#64748B] hover:bg-[#FFF7ED]" : "text-[#CBD5E1] cursor-not-allowed"}`}>
                <TaskTypeIcon type={tt} className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Usage */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748B] font-medium">Usage</label>
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            <button type="button" title="All" onClick={() => setFilterUsage("all")}
              className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${filterUsage === "all" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              All
            </button>
            <button type="button" title="Used" onClick={() => setFilterUsage("used")}
              className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${filterUsage === "used" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </button>
            <button type="button" title="Unused" onClick={() => setFilterUsage("unused")}
              className={`flex items-center justify-center px-3 py-2.5 transition-colors ${filterUsage === "unused" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="12" cy="12" r="9"/></svg>
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748B] font-medium">Status</label>
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            <button type="button" title="All" onClick={() => setFilterStatus("all")}
              className={`px-3 py-2.5 text-xs font-semibold border-r border-[#FED7AA] transition-colors ${filterStatus === "all" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              All
            </button>
            <button type="button" title="Active" onClick={() => setFilterStatus("active")}
              className={`flex items-center justify-center px-3 py-2.5 border-r border-[#FED7AA] transition-colors ${filterStatus === "active" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <span className={`w-2 h-2 rounded-full ${filterStatus === "active" ? "bg-white" : "bg-emerald-500"}`} />
            </button>
            <button type="button" title="Inactive" onClick={() => setFilterStatus("inactive")}
              className={`flex items-center justify-center px-3 py-2.5 transition-colors ${filterStatus === "inactive" ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}>
              <span className={`w-2 h-2 rounded-full ${filterStatus === "inactive" ? "bg-white" : "bg-[#CBD5E1]"}`} />
            </button>
          </div>
        </div>

        {/* Clear All */}
        {(searchQuery || filterActivity !== "all" || filterTaskType !== "all" || filterUsage !== "all" || filterStatus !== "all") && (
          <button type="button" onClick={() => { setSearchQuery(""); setFilterActivity("all"); setFilterTaskType("all"); setFilterUsage("all"); setFilterStatus("all"); }}
            className="self-end pb-[11px] text-xs font-semibold text-[#F37021] hover:underline">
            Clear All
          </button>
        )}
      </div>
      </section>

      {/* ── Table ── */}
      <div className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="bg-[#FFF7ED] border-b-2 border-[#FED7AA]">
                {[
                  { label: "Code",       align: "left"   },
                  { label: "Name",       align: "left"   },
                  { label: "Activity",   align: "center" },
                  { label: "Task Type",  align: "center" },
                  { label: "Learners",   align: "center" },
                  { label: "At-Risk",    align: "center" },
                  { label: "Submission", align: "center" },
                  { label: "Runs",       align: "center" },
                  { label: "Usage",      align: "center" },
                  { label: "Active",     align: "center" },
                ].map(({ label, align }) => (
                  <th key={label} className={`px-3 py-2.5 text-[10px] font-bold text-[#F37021] uppercase tracking-widest whitespace-nowrap ${align === "center" ? "text-center" : "text-left"}`}>
                    {label}
                  </th>
                ))}
                <th className="sticky right-0 bg-white px-3 py-2.5 text-[10px] font-bold text-[#F37021] uppercase tracking-widest text-center whitespace-nowrap shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="p-8 text-center text-sm text-[#94A3B8]">Loading...</td></tr>
              ) : filteredConfigs.length === 0 ? (
                <tr><td colSpan={11} className="p-12 text-center">
                  <p className="text-sm font-semibold text-[#64748B]">{configs.length === 0 ? "No mock configs yet." : "No results match your filters."}</p>
                  <p className="text-xs text-[#94A3B8] mt-1">{configs.length === 0 ? "Click + Create Mock to get started." : "Try adjusting your search or filters."}</p>
                </td></tr>
              ) : filteredConfigs.map(cfg => (
                <tr key={cfg.id} className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7] transition-colors">
                  {/* Code */}
                  <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                    <span className="font-mono text-[11px] font-bold text-[#F37021] bg-[#FFF7ED] border border-[#FED7AA] px-2 py-1 rounded-lg tracking-widest">{cfg.code}</span>
                  </td>
                  {/* Name */}
                  <td className="px-3 py-3.5 align-middle min-w-[140px]">
                    <span className="text-xs text-[#0F172A] font-medium leading-snug">{cfg.name || cfg.code}</span>
                  </td>
                  {/* Activity */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    <span className="inline-flex items-center justify-center text-[#64748B]">{SET_FAMILY_ICON[cfg.set_family] ?? null}</span>
                  </td>
                  {/* Task Type */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    {Object.keys(cfg.task_type_counts)[0]
                      ? <span className="inline-flex items-center justify-center text-[#64748B]"><TaskTypeIcon type={Object.keys(cfg.task_type_counts)[0] as TaskType} className="w-4 h-4" /></span>
                      : <span className="text-[10px] font-mono font-bold text-[#94A3B8]">EX</span>}
                  </td>
                  {/* Students */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">{cfg.n_students}</span>
                  </td>
                  {/* At-Risk */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">{cfg.at_risk_rate}%</span>
                  </td>
                  {/* Submission */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">{100 - cfg.missing_rate}%</span>
                  </td>
                  {/* Runs */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span className="inline-flex items-center justify-center min-w-[2rem] font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2 py-0.5">{cfg.run_count}</span>
                      {cfg.last_run_status && (
                        <span className={`text-[9px] font-bold uppercase ${cfg.last_run_status === "completed" ? "text-emerald-500" : cfg.last_run_status === "failed" ? "text-red-400" : "text-amber-500"}`}>{cfg.last_run_status}</span>
                      )}
                    </span>
                  </td>
                  {/* Usage */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    {cfg.run_count > 0 ? (
                      <span title="Used" className="inline-flex items-center justify-center text-amber-500">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      </span>
                    ) : (
                      <span title="Not Used" className="inline-flex items-center justify-center text-[#CBD5E1]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="12" cy="12" r="9"/></svg>
                      </span>
                    )}
                  </td>
                  {/* Active */}
                  <td className="px-2 py-3.5 whitespace-nowrap text-center align-middle">
                    <button onClick={() => { void handleToggleActive(cfg.id, cfg.active); }}
                      aria-label={cfg.active ? "Deactivate" : "Activate"}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cfg.active ? "bg-[#F37021]" : "bg-[#E2E8F0]"}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cfg.active ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  {/* Actions */}
                  <td className="sticky right-0 bg-white px-3 py-3.5 whitespace-nowrap align-middle shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => handleRunPipeline(cfg.id)} title="Run Pipeline"
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#FED7AA] text-[#F37021] hover:bg-[#FFF7ED] transition-colors">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </button>
                      <button onClick={() => { void openModalWithConfig(cfg); }} title="Edit"
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#E2E8F0] text-[#94A3B8] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                          <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                        </svg>
                      </button>
                      <button onClick={() => { void openModalWithConfig(cfg, "duplicate"); }} title="Duplicate"
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#E2E8F0] text-[#94A3B8] hover:border-[#F37021] hover:text-[#F37021] transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                          <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                      </button>
                      <button onClick={() => { void handleDelete(cfg.id); }} title="Delete"
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                          <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Row count */}
      {!loading && configs.length > 0 && (
        <p className="text-xs text-[#94A3B8] px-1">{filteredConfigs.length} of {configs.length} mock config{configs.length !== 1 ? "s" : ""} shown</p>
      )}
    </section>

</>
  );
}

function ChartPlaceholder({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-[#CBD5E1] rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center bg-[#F8FAFC]">
      <svg className="w-6 h-6 text-[#CBD5E1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <p className="text-xs font-semibold text-[#94A3B8]">{label}</p>
      <p className="text-[10px] text-[#CBD5E1]">Available after full pipeline run</p>
    </div>
  );
}
