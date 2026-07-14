"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { MockConfig, MockStep } from "@/lib/mock-pipeline";

// ── types ─────────────────────────────────────────────────────────────────────
interface ClassOption {
  class_id: string;
  class_code: string;
  class_name: string;
  academic_year: string;
  term: string;
}

interface TaskSetOption {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  task_count: number;
  task_ids: string[];
}

interface OutcomeReport {
  lrAuc?: number | null; lrF1?: number | null;
  rfAuc?: number | null; rfF1?: number | null;
  majorityAuc?: number | null; majorityF1?: number | null;
  confusionMatrix?: number[][] | null;
  splitInfo?: string | null;
  sampleCount?: number | null;
  atRiskCount?: number | null;
}

type StepStatus = "waiting" | "running" | "completed" | "failed" | "aborted";
type OutcomeTab = "summary" | "metrics" | "charts" | "dataset" | "reports" | "logs";

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
    desc: "Run NB01–NB03: feature engineering and model training",
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

// ── main component ────────────────────────────────────────────────────────────
export default function MockLab() {
  // config
  const [config, setConfig] = useState<MockConfig>({
    batchCode: "MOCK_20260714_001",
    nStudents: 10,
    nTasks: 3,
    atRiskRate: 35,
    missingRate: 7,
    apiBase: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  });
  const [configError, setConfigError] = useState<string | null>(null);

  // class + task set selection
  const [classes, setClasses]                   = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading]     = useState(false);
  const [selectedClassId, setSelectedClassId]   = useState<string>("");
  const [taskSets, setTaskSets]                 = useState<TaskSetOption[]>([]);
  const [taskSetsLoading, setTaskSetsLoading]   = useState(false);
  const [selectedSetId, setSelectedSetId]       = useState<string>("");

  // pipeline state
  const [running, setRunning]         = useState<MockStep | null>(null);
  const [stepStatus, setStepStatus]   = useState<Record<string, StepStatus>>({});
  const [logs, setLogs]               = useState<string[]>([]);
  const [outcome, setOutcome]         = useState<OutcomeReport | null>(null);
  const [errorCount, setErrorCount]   = useState(0);
  const [startTime, setStartTime]     = useState<number | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [completedSteps, setCompleted] = useState<string[]>([]);

  // UI state
  const [activeTab, setActiveTab]     = useState<OutcomeTab>("summary");
  const logEndRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // elapsed timer
  useEffect(() => {
    if (!startTime) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime]);

  // fetch class list on mount
  useEffect(() => {
    setClassesLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token ?? "";
      fetch("/api/researcher/classes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(d => setClasses(d.classes ?? []))
        .catch(() => setClasses([]))
        .finally(() => setClassesLoading(false));
    });
  }, []);

  // fetch task sets when class changes
  useEffect(() => {
    if (!selectedClassId) {
      setTaskSets([]);
      setSelectedSetId("");
      setConfig(prev => ({ ...prev, taskIds: undefined, taskSetId: undefined, nTasks: 3 }));
      return;
    }
    setTaskSetsLoading(true);
    setSelectedSetId("");
    setConfig(prev => ({ ...prev, taskIds: undefined, taskSetId: undefined, nTasks: 3 }));
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token ?? "";
      fetch(`/api/researcher/classes/${selectedClassId}/sets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(d => setTaskSets((d.sets ?? []).filter((s: TaskSetOption) => s.task_count > 0)))
        .catch(() => setTaskSets([]))
        .finally(() => setTaskSetsLoading(false));
    });
  }, [selectedClassId]);

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
      }));
    } else {
      setConfig(prev => ({ ...prev, taskIds: undefined, taskSetId: undefined, nTasks: 3 }));
    }
  }

  function validateBatchCode(code: string): string | null {
    if (!code.startsWith("SIM_E2E_") && !code.startsWith("MOCK_")) {
      return "Batch code must start with SIM_E2E_ or MOCK_";
    }
    return null;
  }

  async function runStep(step: MockStep) {
    const err = validateBatchCode(config.batchCode);
    if (err) { setConfigError(err); return; }

    setRunning(step);
    setLogs([]);
    setErrorCount(0);
    setStartTime(Date.now());
    setElapsed(0);
    if (step !== "outcome") setOutcome(null);
    if (step === "run-all") {
      setStepStatus({});
      setCompleted([]);
    } else {
      setStepStatus(prev => ({ ...prev, [step]: "running" }));
    }
    addLog(`── Starting: ${step} ──`);

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
        body: JSON.stringify(config),
      });

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
      let currentPipelineStep = step;

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
            const payload = JSON.parse(dataMatch[1]);
            if (eventType === "log") {
              const msg = payload.msg ?? "";
              addLog(msg);
              if (msg.includes("❌")) setErrorCount(c => c + 1);
              // detect step transitions in run-all
              const match = msg.match(/^── Step: (\w+)/);
              if (match) {
                if (currentPipelineStep !== step) {
                  setStepStatus(prev => ({ ...prev, [currentPipelineStep]: "completed" }));
                  setCompleted(prev => [...prev, currentPipelineStep]);
                }
                currentPipelineStep = match[1] as MockStep;
                setStepStatus(prev => ({ ...prev, [currentPipelineStep]: "running" }));
              }
            }
            if (eventType === "error") {
              addLog(`❌ ${payload.msg}`);
              setErrorCount(c => c + 1);
              setStepStatus(prev => ({ ...prev, [currentPipelineStep]: "failed" }));
            }
            if (eventType === "progress") {
              const s = payload.step as string;
              if (s) setStepStatus(prev => ({ ...prev, [s]: payload.pct === 100 ? "completed" : "running" }));
            }
            if (eventType === "outcome") parseOutcome(payload);
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
      // fetch aborted by Stop button — mark any still-running step as aborted
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
      addLog("── Done ──");
    }
  }

  function stopPipeline() {
    abortRef.current?.abort();
  }

  function parseOutcome(payload: { report?: OutcomeReport }) {
    const r = payload.report ?? {};
    setOutcome({
      lrAuc: r.lrAuc ?? null, lrF1: r.lrF1 ?? null,
      rfAuc: r.rfAuc ?? null, rfF1: r.rfF1 ?? null,
      majorityAuc: r.majorityAuc ?? null, majorityF1: r.majorityF1 ?? null,
      confusionMatrix: r.confusionMatrix ?? null,
      splitInfo: r.splitInfo ?? null,
      sampleCount: r.sampleCount ?? null,
      atRiskCount: r.atRiskCount ?? null,
    });
    setActiveTab("summary");
  }

  const isRunning = running !== null;
  const pipelineProgress = PIPELINE_STEPS.filter(s => stepStatus[s] === "completed").length;
  const pipelinePct = Math.round((pipelineProgress / PIPELINE_STEPS.length) * 100);

  // status card logic
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

  return (
    <section className="space-y-5">
      {/* ── Status Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {topStatus.map(({ label, status }) => (
          <div key={label} className="bg-white border border-[#FED7AA] rounded-2xl px-4 py-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide leading-tight">{label}</p>
            <StatusPill status={status} />
          </div>
        ))}
      </div>

      {/* ── Configuration + Summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Config panels — left 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Batch Configuration */}
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#0F172A]">Batch Configuration</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Mock Code</label>
                <input
                  type="text"
                  value={config.batchCode}
                  onChange={e => updateConfig("batchCode", e.target.value)}
                  disabled={isRunning}
                  placeholder="MOCK_20260714_001"
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl font-mono focus:outline-none focus:border-[#F37021] disabled:opacity-50"
                />
                {configError && <p className="text-xs text-red-600 mt-0.5">{configError}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Students (5–200)</label>
                <input type="number" min={5} max={200} value={config.nStudents}
                  onChange={e => updateConfig("nStudents", Math.max(5, Math.min(200, +e.target.value)))}
                  disabled={isRunning}
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50" />
                <div className="flex gap-1 flex-wrap pt-0.5">
                  {([["5", "Demo"], ["10", "Quick"], ["40", "Class"], ["100", "Stress"]] as const).map(([n, label]) => (
                    <button key={n} type="button"
                      onClick={() => updateConfig("nStudents", Number(n))}
                      disabled={isRunning}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors disabled:opacity-40
                        ${config.nStudents === Number(n)
                          ? "bg-[#F37021] text-white border-[#F37021]"
                          : "bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#F37021] hover:text-[#F37021]"}`}
                    >{label} ({n})</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">At-Risk Rate %</label>
                <input type="number" min={0} max={100} value={config.atRiskRate}
                  onChange={e => updateConfig("atRiskRate", Math.max(0, Math.min(100, +e.target.value)))}
                  disabled={isRunning}
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Missing Submission %</label>
                <input type="number" min={0} max={100} value={config.missingRate}
                  onChange={e => updateConfig("missingRate", Math.max(0, Math.min(100, +e.target.value)))}
                  disabled={isRunning}
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50" />
              </div>
            </div>

            {/* Task Set — Class + Set dropdowns */}
            <div className="space-y-3 pt-1 border-t border-[#F1F5F9]">
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Task Set (from real class)</p>
              <div className="space-y-2">
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  disabled={isRunning || classesLoading}
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50 bg-white"
                >
                  <option value="">{classesLoading ? "Loading classes…" : classes.length === 0 ? "No active classes found" : "— Select class —"}</option>
                  {classes.map(c => (
                    <option key={c.class_id} value={c.class_id}>
                      {c.class_name} ({c.class_code}) · {c.academic_year}/{c.term}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedSetId}
                  onChange={e => handleTaskSetSelect(e.target.value)}
                  disabled={isRunning || !selectedClassId || taskSetsLoading}
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50 bg-white"
                >
                  <option value="">
                    {!selectedClassId ? "— Select class first —" : taskSetsLoading ? "Loading task sets…" : taskSets.length === 0 ? "No task sets found" : "— Select task set —"}
                  </option>
                  {taskSets.map(s => (
                    <option key={s.batch_id} value={s.batch_id}>
                      {s.batch_name ?? s.batch_code ?? s.batch_id} · {s.task_count} task{s.task_count !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {config.taskIds?.length ? (
                <p className="text-[11px] text-emerald-600 font-semibold">
                  ✅ {config.taskIds.length} real task{config.taskIds.length !== 1 ? "s" : ""} selected
                </p>
              ) : null}
            </div>
          </div>

        </div>

        {/* Summary card — right 1/3 */}
        <div className="bg-white border border-[#FED7AA] rounded-2xl p-5 h-fit space-y-4 lg:sticky lg:top-4">
          <h3 className="text-sm font-bold text-[#0F172A]">Current Configuration</h3>
          <dl className="space-y-2.5 text-sm">
            {([
              ["Mock Code",         config.batchCode],
              ["Students",          String(config.nStudents)],
              ...(config.taskIds?.length
                ? [["Task Set", taskSets.find(s => s.batch_id === selectedSetId)?.batch_name ?? selectedSetId],
                   ["Tasks",    String(config.taskIds.length)]]
                : []),
              ["Expected At-Risk",  `${config.atRiskRate}% (≈${Math.round(config.nStudents * config.atRiskRate / 100)} students)`],
              ["Expected Missing",  `${config.missingRate}% (≈${Math.round(config.nStudents * config.missingRate / 100)} students)`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">{k}</dt>
                <dd className="font-mono text-xs text-[#0F172A] break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ── Pipeline Workflow ── */}
      <div className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-bold text-[#0F172A]">Pipeline Workflow</h3>
          <div className="flex gap-2">
            {isRunning ? (
              <button
                onClick={stopPipeline}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={() => runStep("run-all")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[#F37021] text-white hover:bg-[#C2410C] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                </svg>
                Run Full Mock Pipeline
              </button>
            )}
            <button
              onClick={() => runStep("reset")}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running === "reset" ? <Spinner /> : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              )}
              {running === "reset" ? "Resetting…" : "Mock Reset"}
            </button>
          </div>
        </div>

        {/* Vertical pipeline */}
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
                  onClick={() => runStep(stepId)}
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
      </div>

      {/* ── Progress ── */}
      {(isRunning || pipelineProgress > 0) && (
        <div className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0F172A]">Pipeline Progress</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[#64748B]">
              <span>{pipelinePct}% complete</span>
              <span>{pipelineProgress}/{PIPELINE_STEPS.length} steps</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#F37021] transition-all duration-500"
                style={{ width: `${pipelinePct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#FFF7ED] rounded-xl px-3 py-2.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Current Step</p>
              <p className="text-sm font-bold text-[#C2410C]">{running ? STEP_META[running]?.label ?? running : "—"}</p>
            </div>
            <div className="bg-[#FFF7ED] rounded-xl px-3 py-2.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Elapsed</p>
              <p className="text-sm font-bold text-[#0F172A]">{fmtElapsed(elapsed)}</p>
            </div>
            <div className="bg-[#FFF7ED] rounded-xl px-3 py-2.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Completed</p>
              <p className="text-sm font-bold text-emerald-600">{completedSteps.length} steps</p>
            </div>
            <div className="bg-[#FFF7ED] rounded-xl px-3 py-2.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Errors</p>
              <p className={`text-sm font-bold ${errorCount > 0 ? "text-red-600" : "text-[#0F172A]"}`}>{errorCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Outcome Tabs ── */}
      {(outcome || logs.length > 0) && (
        <div className="bg-white border border-[#FED7AA] rounded-2xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-[#FED7AA] overflow-x-auto">
            {(["summary", "metrics", "charts", "dataset", "reports", "logs"] as OutcomeTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-xs font-semibold capitalize whitespace-nowrap transition-colors border-b-2 ${
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

          <div className="p-5">
            {/* Summary tab */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#0F172A]">Pipeline Summary</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Pipeline Status",   value: isRunning ? "Running" : pipelineProgress > 0 ? "Completed" : "Not started", ok: !isRunning && pipelineProgress > 0 },
                    { label: "Dataset Ready",      value: stepStatus["data"] === "completed" ? "Yes" : "No",     ok: stepStatus["data"] === "completed" },
                    { label: "Training Ready",     value: stepStatus["train"] === "completed" ? "Yes" : "No",    ok: stepStatus["train"] === "completed" },
                    { label: "Evaluation Ready",   value: stepStatus["evaluate"] === "completed" ? "Yes" : "No", ok: stepStatus["evaluate"] === "completed" },
                    { label: "Report Ready",       value: outcome ? "Yes" : "No",   ok: !!outcome },
                    { label: "Samples",            value: outcome?.sampleCount != null ? String(outcome.sampleCount) : "—", ok: null },
                  ].map(({ label, value, ok }) => (
                    <div key={label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 space-y-0.5">
                      <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">{label}</p>
                      <p className={`text-sm font-bold ${ok === true ? "text-emerald-600" : ok === false ? "text-[#94A3B8]" : "text-[#0F172A]"}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {outcome?.splitInfo && (
                  <p className="text-xs font-mono text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">{outcome.splitInfo}</p>
                )}
              </div>
            )}

            {/* Metrics tab */}
            {activeTab === "metrics" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#0F172A]">Evaluation Metrics</h4>
                {outcome ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-[#0F172A] pb-1 border-b border-[#F1F5F9]">Majority Baseline</p>
                      <MetricBar label="AUC-ROC" value={outcome.majorityAuc} color="#94A3B8" />
                      <MetricBar label="F1"      value={outcome.majorityF1}  color="#CBD5E1" />
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-[#0F172A] pb-1 border-b border-[#F1F5F9]">Logistic Regression</p>
                      <MetricBar label="AUC-ROC" value={outcome.lrAuc} color="#F37021" />
                      <MetricBar label="F1"      value={outcome.lrF1}  color="#FB923C" />
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-[#0F172A] pb-1 border-b border-[#F1F5F9]">Random Forest</p>
                      <MetricBar label="AUC-ROC" value={outcome.rfAuc} color="#0EA5E9" />
                      <MetricBar label="F1"      value={outcome.rfF1}  color="#38BDF8" />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#94A3B8]">Run Mock Outcome to load metrics.</p>
                )}
              </div>
            )}

            {/* Charts tab */}
            {activeTab === "charts" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#0F172A]">Charts</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {outcome?.confusionMatrix ? (
                    <div className="border border-[#E2E8F0] rounded-2xl p-4">
                      <ConfusionMatrix matrix={outcome.confusionMatrix} />
                    </div>
                  ) : (
                    <ChartPlaceholder label="Confusion Matrix" />
                  )}
                  {(["ROC Curve", "Feature Importance", "Dataset Distribution", "Class Balance"] as const).map(name => (
                    <ChartPlaceholder key={name} label={name} />
                  ))}
                </div>
              </div>
            )}

            {/* Dataset tab */}
            {activeTab === "dataset" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#0F172A]">Dataset Info</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ["Students (config)",   String(config.nStudents)],
                    ["SQL Tasks",           config.taskIds?.length ? `${config.taskIds.length} (real)` : String(config.nTasks)],
                    ["Total Samples",       outcome?.sampleCount != null ? String(outcome.sampleCount) : "—"],
                    ["At-Risk Count",       outcome?.atRiskCount  != null ? String(outcome.atRiskCount)  : "—"],
                    ["At-Risk Rate",        `${config.atRiskRate}%`],
                    ["Missing Rate",        `${config.missingRate}%`],
                    ["Split Method",        "GroupShuffleSplit"],
                    ["Group Key",           "academy_member_id"],
                    ["PII Status",          "Anonymised"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 space-y-0.5">
                      <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">{k}</p>
                      <p className="text-sm font-mono font-bold text-[#0F172A]">{v}</p>
                    </div>
                  ))}
                </div>
                {outcome?.splitInfo && (
                  <p className="text-xs font-mono text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">{outcome.splitInfo}</p>
                )}
              </div>
            )}

            {/* Reports tab */}
            {activeTab === "reports" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#0F172A]">Reports</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Metadata JSON", desc: "notebooks/models/metadata_*.json", action: "Open Metadata" },
                    { label: "Pipeline Log",  desc: "Full SSE stream log from this session", action: "View Logs", onClick: () => setActiveTab("logs") },
                  ].map(({ label, desc, action, onClick }) => (
                    <div key={label} className="border border-[#E2E8F0] rounded-2xl p-4 space-y-2">
                      <p className="text-sm font-bold text-[#0F172A]">{label}</p>
                      <p className="text-xs text-[#64748B] font-mono">{desc}</p>
                      <button
                        onClick={onClick}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#FED7AA] text-[#C2410C] hover:border-[#F37021] transition-colors"
                      >
                        {action}
                      </button>
                    </div>
                  ))}
                </div>
                {!outcome && (
                  <p className="text-sm text-[#94A3B8]">Run the full pipeline to generate reports.</p>
                )}
              </div>
            )}

            {/* Logs tab */}
            {activeTab === "logs" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#0F172A]">Pipeline Log</h4>
                  {logs.length > 0 && (
                    <button onClick={() => setLogs([])} className="text-[11px] text-[#94A3B8] hover:text-red-500 transition-colors">Clear</button>
                  )}
                </div>
                {logs.length > 0 ? (
                  <div className="bg-[#0F172A] rounded-xl px-4 py-3 h-64 overflow-y-auto font-mono text-xs text-[#94A3B8] space-y-0.5">
                    {logs.map((line, i) => (
                      <div key={i} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-green-400" : line.startsWith("──") ? "text-[#F37021] font-semibold" : undefined}>
                        {line}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                ) : (
                  <p className="text-sm text-[#94A3B8]">No log output yet. Run a pipeline step to see logs here.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
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
