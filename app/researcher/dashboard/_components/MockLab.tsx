"use client";

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { MockConfig, MockOutcomeData, MockStep } from "@/lib/mock-pipeline";

// ── types ─────────────────────────────────────────────────────────────────────
interface OutcomeReport {
  lrAuc?: number | null; lrF1?: number | null;
  rfAuc?: number | null; rfF1?: number | null;
  majorityAuc?: number | null; majorityF1?: number | null;
  confusionMatrix?: number[][] | null;
  splitInfo?: string | null;
  sampleCount?: number | null;
  atRiskCount?: number | null;
}

// ── mini chart helpers ────────────────────────────────────────────────────────
function MetricBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value != null ? Math.round(value * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-[#64748B]">{label}</span>
        <span className="font-mono font-semibold text-[#0F172A]">{value != null ? value.toFixed(3) : "—"}</span>
      </div>
      <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ["Not at-risk", "At-risk"];
  return (
    <div>
      <p className="text-xs font-semibold text-[#64748B] mb-2">Confusion Matrix (predicted vs actual)</p>
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1.5 text-[#94A3B8]" />
            {labels.map(l => <th key={l} className="p-1.5 font-semibold text-[#0F172A] text-center">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td className="p-1.5 font-semibold text-[#0F172A] pr-3">{labels[ri]}</td>
              {row.map((v, ci) => (
                <td key={ci} className={`p-1.5 text-center font-mono font-semibold rounded ${ri === ci ? "bg-[#FED7AA] text-[#C2410C]" : "bg-[#F1F5F9] text-[#475569]"}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── step button ───────────────────────────────────────────────────────────────
type StepDef = { id: MockStep; label: string; variant: "primary" | "secondary" | "danger" | "full" };

const STEPS: StepDef[] = [
  { id: "data",      label: "1. Mock Data",     variant: "primary" },
  { id: "extract",   label: "2. Mock Extract",  variant: "primary" },
  { id: "process",   label: "3. Mock Process",  variant: "primary" },
  { id: "train",     label: "4. Mock Train",    variant: "primary" },
  { id: "evaluate",  label: "5. Mock Evaluate", variant: "primary" },
  { id: "outcome",   label: "6. Mock Outcome",  variant: "secondary" },
  { id: "reset",     label: "Mock Reset",       variant: "danger" },
  { id: "run-all",   label: "Run Full Mock Pipeline", variant: "full" },
];

const BTN_CLASS: Record<string, string> = {
  primary:   "bg-white border border-[#FED7AA] text-[#C2410C] hover:border-[#F37021] hover:bg-[#FFF7ED]",
  secondary: "bg-white border border-[#CBD5E1] text-[#475569] hover:border-[#94A3B8]",
  danger:    "bg-white border border-red-200 text-red-600 hover:bg-red-50",
  full:      "bg-[#F37021] text-white hover:bg-[#C2410C]",
};

// ── main component ────────────────────────────────────────────────────────────
export default function MockLab() {
  const [config, setConfig] = useState<MockConfig>({
    batchCode: "MOCK_20260714_001",
    nStudents: 40,
    nTasks: 3,
    atRiskRate: 35,
    missingRate: 7,
    apiBase: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  });

  const [running, setRunning]     = useState<MockStep | null>(null);
  const [logs, setLogs]           = useState<string[]>([]);
  const [outcome, setOutcome]     = useState<MockOutcomeData | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-500), msg]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  }, []);

  function updateConfig<K extends keyof MockConfig>(key: K, val: MockConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: val }));
    setConfigError(null);
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
    if (step !== "outcome") setOutcome(null);
    addLog(`── Starting: ${step} ──`);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/researcher/mock-pipeline/${step}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        addLog(`ERROR: ${res.status} ${await res.text()}`);
        setRunning(null);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch  = part.match(/^data: (.+)$/m);
          if (!dataMatch) continue;
          const eventType = eventMatch?.[1] ?? "log";
          try {
            const payload = JSON.parse(dataMatch[1]);
            if (eventType === "log")     addLog(payload.msg ?? "");
            if (eventType === "error")   addLog(`❌ ${payload.msg}`);
            if (eventType === "outcome") parseOutcome(payload);
          } catch { /* ignore malformed SSE */ }
        }
      }
    } finally {
      setRunning(null);
      addLog("── Done ──");
    }
  }

  function parseOutcome(payload: { report?: OutcomeReport }) {
    const r = payload.report ?? {};
    setOutcome({
      lrAuc:           r.lrAuc          ?? null,
      lrF1:            r.lrF1           ?? null,
      rfAuc:           r.rfAuc          ?? null,
      rfF1:            r.rfF1           ?? null,
      majorityAuc:     r.majorityAuc    ?? null,
      majorityF1:      r.majorityF1     ?? null,
      confusionMatrix: r.confusionMatrix ?? null,
      splitInfo:       r.splitInfo      ?? null,
      sampleCount:     r.sampleCount    ?? null,
      atRiskCount:     r.atRiskCount    ?? null,
    });
  }

  const isRunning = running !== null;

  return (
    <section className="space-y-4">
      {/* Warning banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex gap-3 items-start">
        <svg className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-amber-700 leading-relaxed">
          <span className="font-bold">Technical Validation Only</span> — Mock data and mock evaluation are not research findings.
          All pipeline runs use synthetic data under batch codes prefixed <code className="font-mono">SIM_E2E_</code> or <code className="font-mono">MOCK_</code>.
          Reset never touches real pilot data.
        </p>
      </div>

      <div className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-5">
        <h2 className="text-base font-bold text-[#0F172A]">Mock Evaluation Lab</h2>

        {/* Config panel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Batch code */}
          <div className="sm:col-span-2 lg:col-span-3 space-y-1">
            <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Batch Code</label>
            <input
              type="text"
              value={config.batchCode}
              onChange={e => updateConfig("batchCode", e.target.value)}
              disabled={isRunning}
              placeholder="MOCK_20260714_001"
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl font-mono focus:outline-none focus:border-[#F37021] disabled:opacity-50"
            />
            {configError && <p className="text-xs text-red-600">{configError}</p>}
          </div>

          {/* N students */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Students (5–200)</label>
            <input
              type="number" min={5} max={200}
              value={config.nStudents}
              onChange={e => updateConfig("nStudents", Math.max(5, Math.min(200, +e.target.value)))}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50"
            />
          </div>

          {/* N tasks */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Tasks (1–10)</label>
            <input
              type="number" min={1} max={10}
              value={config.nTasks}
              onChange={e => updateConfig("nTasks", Math.max(1, Math.min(10, +e.target.value)))}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50"
            />
          </div>

          {/* At-risk rate */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">At-Risk Rate %</label>
            <input
              type="number" min={0} max={100}
              value={config.atRiskRate}
              onChange={e => updateConfig("atRiskRate", Math.max(0, Math.min(100, +e.target.value)))}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50"
            />
          </div>

          {/* Missing rate */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Missing Submit %</label>
            <input
              type="number" min={0} max={100}
              value={config.missingRate}
              onChange={e => updateConfig("missingRate", Math.max(0, Math.min(100, +e.target.value)))}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#F37021] disabled:opacity-50"
            />
          </div>

          {/* API base */}
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">API Base URL</label>
            <input
              type="text"
              value={config.apiBase}
              onChange={e => updateConfig("apiBase", e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-xl font-mono focus:outline-none focus:border-[#F37021] disabled:opacity-50"
            />
          </div>
        </div>

        {/* Step buttons */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Pipeline Steps</p>
          <div className="flex flex-wrap gap-2">
            {STEPS.filter(s => s.id !== "run-all" && s.id !== "reset").map(s => (
              <button
                key={s.id}
                onClick={() => runStep(s.id)}
                disabled={isRunning}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BTN_CLASS[s.variant]}`}
              >
                {running === s.id ? "Running…" : s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => runStep("run-all")}
              disabled={isRunning}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BTN_CLASS.full}`}
            >
              {running === "run-all" ? "Running Pipeline…" : "Run Full Mock Pipeline"}
            </button>
            <button
              onClick={() => runStep("reset")}
              disabled={isRunning}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BTN_CLASS.danger}`}
            >
              {running === "reset" ? "Resetting…" : "Mock Reset"}
            </button>
          </div>
        </div>

        {/* Log panel */}
        {logs.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Pipeline Log</p>
            <div className="bg-[#0F172A] rounded-xl px-4 py-3 h-56 overflow-y-auto font-mono text-xs text-[#94A3B8] space-y-0.5">
              {logs.map((line, i) => (
                <div key={i} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-green-400" : undefined}>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Outcome charts */}
        {outcome && (
          <div className="space-y-4 pt-2 border-t border-[#FED7AA]">
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">
              Evaluation Results
              {outcome.sampleCount != null && (
                <span className="ml-2 font-normal normal-case">({outcome.sampleCount} samples, {outcome.atRiskCount} at-risk)</span>
              )}
            </p>
            {outcome.splitInfo && (
              <p className="text-xs text-[#64748B] font-mono">{outcome.splitInfo}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* LR */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#0F172A]">Logistic Regression</p>
                <MetricBar label="AUC-ROC" value={outcome.lrAuc} color="#F37021" />
                <MetricBar label="F1"      value={outcome.lrF1}  color="#FB923C" />
              </div>
              {/* RF */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#0F172A]">Random Forest</p>
                <MetricBar label="AUC-ROC" value={outcome.rfAuc} color="#0EA5E9" />
                <MetricBar label="F1"      value={outcome.rfF1}  color="#38BDF8" />
              </div>
              {/* Majority */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#0F172A]">Majority Baseline</p>
                <MetricBar label="AUC-ROC" value={outcome.majorityAuc} color="#94A3B8" />
                <MetricBar label="F1"      value={outcome.majorityF1}  color="#CBD5E1" />
              </div>
            </div>

            {outcome.confusionMatrix && (
              <ConfusionMatrix matrix={outcome.confusionMatrix} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
