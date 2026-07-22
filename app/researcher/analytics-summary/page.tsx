"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import {
  TaskTypeIcon,
  TASK_TYPE_LABEL,
  TASK_TYPE_ORDER,
} from "@/lib/task-type-utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LiveStats = {
  learner_count: number;
  session_count: number;
  batch_type_filter: string | null;
  task_type_filter: string | null;
  grain: "session_level";
};

type PipelineStats = {
  total_learners: number;
  train_learners: number;
  test_learners: number;
  train_sequences: number;
  test_sequences: number;
  total_sequences: number;
  total_canonical_events: number;
  max_sequence_length: number;
  sequence_length_percentile: number;
  split_method: string;
  split_random_state: number;
  dedup_window_seconds: number;
  vocab_size: number;
  features_per_timestep: number;
  thesis_minimum_learners: number;
  source: string;
  note: string;
};

type Validation = {
  checks_run: number;
  checks_passed: number;
  no_learner_overlap: boolean;
  no_pii_in_exports: boolean;
  leakage_check_passed: boolean;
  split_integrity_passed: boolean;
};

type BssaGroup = {
  label: string;
  status: string;
  feature_count: number;
  features?: string[];
  features_per_timestep?: number;
  max_seq_len?: number;
  feature_note?: string;
  model_usage: string[];
  description: string;
  phase?: string;
  note?: string;
};

type BssaFeatures = {
  framework: string;
  note: string;
  groups: Record<string, BssaGroup>;
};

type ApiData = {
  evaluation_purpose: string;
  label_source: string;
  label_validity: string;
  proxy_target_circularity: boolean;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
  live_stats: LiveStats;
  pipeline_stats: PipelineStats;
  validation: Validation;
  bssa_features: BssaFeatures;
};

// ─── Dimension filter config ────────────────────────────────────────────────

type BatchTypeValue = "assignment_set" | "lab_set" | "exam_set";
type TaskTypeValue = string;

const BATCH_TYPE_OPTIONS: { value: BatchTypeValue; label: string }[] = [
  { value: "assignment_set", label: "Assignment" },
  { value: "lab_set", label: "Lab" },
  { value: "exam_set", label: "Exam" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function PilotDisclaimer({ warning }: { warning: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-xl mt-0.5">⚠</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-amber-800 text-sm">Pilot Data Notice — Technical Validation Only</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wide">PILOT ONLY</span>
          </div>
          <p className="text-amber-700 text-xs mt-2 leading-relaxed">
            ข้อมูลนี้ใช้ <code className="bg-amber-100 border border-amber-200 px-1 rounded text-amber-800">proxy_behavioral</code> labels
            {" "}(Proxy Label — ป้ายกำกับทดแทนที่ยังไม่ใช่ผลประเมินจริง) ที่ derive จาก attempt stream.
            Proxy-target circularity มีอยู่. ห้ามสรุปผลวิจัยยืนยัน.
          </p>
          <p className="text-amber-600 text-xs mt-1.5 italic">{warning}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono bg-white/70 border border-amber-200 rounded-lg p-3">
        <span className="text-[#64748B]">evaluation_purpose</span><span className="text-[#0F172A]">= technical_pipeline_validation</span>
        <span className="text-[#64748B]">label_source</span><span className="text-[#0F172A]">= proxy_behavioral</span>
        <span className="text-[#64748B]">label_validity</span><span className="text-[#0F172A]">= pilot_only</span>
        <span className="text-[#64748B]">proxy_target_circularity</span><span className="text-[#0F172A]">= true</span>
        <span className="text-[#64748B]">confirmatory_analysis_allowed</span><span className="text-[#0F172A]">= false</span>
      </div>
    </div>
  );
}

function StatRow({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-[#F1F5F9] last:border-0">
      <span className="text-xs text-[#475569]">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-[#0F172A]">{value}</span>
        {note && <span className="ml-2 text-xs text-[#94A3B8]">{note}</span>}
      </div>
    </div>
  );
}

function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      <span>{ok ? "✅" : "❌"}</span>
      <span>{label}</span>
    </div>
  );
}

function ToggleBtn({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
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

// ─── BSSA Feature Group Card ─────────────────────────────────────────────────

function BssaGroupCard({ groupKey, group }: { groupKey: string; group: BssaGroup }) {
  const [expanded, setExpanded] = useState(false);
  const isImplemented = group.status === "implemented";
  const isDeferred = group.status === "deferred";

  const statusColor = isImplemented
    ? "bg-green-50 border-green-200 text-green-700"
    : isDeferred
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]";

  const statusLabel = isImplemented
    ? "Implemented"
    : isDeferred
      ? "Deferred → Phase 5"
      : "Not Implemented";

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${isImplemented ? "border-[#E2E8F0] bg-white" : "border-[#F1F5F9] bg-[#F8FAFC] opacity-80"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-[#0F172A]">{group.label}</span>
          {isImplemented && (
            <span className="text-[10px] font-mono text-[#F37021]">{group.feature_count} features</span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <p className="text-[11px] text-[#64748B] leading-relaxed">{group.description}</p>

      {group.model_usage.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-[#94A3B8]">ใช้โดย:</span>
          {group.model_usage.map(m => (
            <span key={m} className="text-[10px] font-mono bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded">{m}</span>
          ))}
        </div>
      )}

      {groupKey === "sequential" && (
        <div className="text-[10px] text-[#64748B] space-y-0.5">
          <p><span className="text-[#94A3B8]">Features per timestep:</span> {group.features_per_timestep}</p>
          <p><span className="text-[#94A3B8]">Max sequence length:</span> {group.max_seq_len} steps</p>
          {group.feature_note && <p className="italic">{group.feature_note}</p>}
        </div>
      )}

      {isImplemented && group.features && group.features.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-[#F37021] hover:underline font-medium"
          >
            {expanded ? "▲ ซ่อนรายชื่อ feature" : `▼ ดู feature ทั้ง ${group.features.length} ตัว`}
          </button>
          {expanded && (
            <div className="mt-2 flex flex-wrap gap-1">
              {group.features.map(f => (
                <code key={f} className="text-[9px] bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] px-1.5 py-0.5 rounded">{f}</code>
              ))}
            </div>
          )}
        </div>
      )}

      {!isImplemented && group.note && (
        <p className="text-[10px] text-[#94A3B8] italic">{group.note}</p>
      )}
    </div>
  );
}

// ─── 2C3L Rubric Component Card ──────────────────────────────────────────────

function C2L3ComponentCard({ code, description }: { code: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm text-[#0F172A] font-mono">{code}</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
          Pilot Only · Not Yet Validated
        </span>
      </div>
      <p className="text-[11px] text-[#64748B] leading-relaxed">{description}</p>
      <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-[10px] text-[#94A3B8]">
        ไม่มี teacher-reviewed หรือ expert-validated assessment — ยังไม่สามารถแสดงคะแนนได้
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsSummaryPage() {
  const router = useRouter();

  // Dimension filters
  const [batchType, setBatchType] = useState<BatchTypeValue | null>(null);
  const [taskType, setTaskType] = useState<TaskTypeValue | null>(null);

  // API data
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Task type options from batch list
  const [availableTaskTypes, setAvailableTaskTypes] = useState<string[]>([]);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  // Load available task types once from batch list
  useEffect(() => {
    async function loadTaskTypes() {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch("/api/researcher/batches", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json();
        if (j.taskTypes?.length) setAvailableTaskTypes(j.taskTypes as string[]);
      } catch {
        // non-critical — fallback to TASK_TYPE_ORDER
      }
    }
    void loadTaskTypes();
  }, [getToken]);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) { router.push("/auth/login"); return; }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (batchType) params.set("batch_type", batchType);
    if (taskType) params.set("task_type", taskType);
    const res = await fetch(`/api/researcher/analytics-summary?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Request failed" }));
      setError((j as { error?: string }).error ?? "Failed to load data.");
      setLoading(false);
      return;
    }
    setData(await res.json() as ApiData);
    setLoading(false);
  }, [getToken, router, batchType, taskType]);

  useEffect(() => { queueMicrotask(() => { void loadData(); }); }, [loadData]);

  const bssaGroupOrder = ["behavioral", "sequential", "tag_based", "semantic", "combined"];

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">Analytics Summary</p>
          <p className="text-xs text-[#64748B]">Phase 4 Dataset Statistics & Feature Analysis</p>
        </div>
        <Link href="/researcher/dashboard" className="text-xs text-[#F37021] hover:underline">← Dashboard</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Pilot Disclaimer */}
        {data && <PilotDisclaimer warning={data.data_warning} />}

        {/* ── ส่วนที่ 1: มิติการวิเคราะห์ ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <div>
            <h2 className="font-semibold text-[#0F172A] text-sm">มิติการวิเคราะห์</h2>
            <p className="text-[11px] text-[#64748B] mt-1">
              เลือกมิติเพื่อกรองข้อมูลสถิติกิจกรรมด้านล่าง — ผลการเปรียบเทียบโมเดลไม่เปลี่ยนตามมิตินี้
            </p>
          </div>

          {/* มิติชุดกิจกรรม */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
              ชุดกิจกรรม (Activity Set) — <code className="text-[#64748B] font-normal normal-case">batch_type</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <ToggleBtn active={batchType === null} onClick={() => setBatchType(null)}>ทั้งหมด</ToggleBtn>
              {BATCH_TYPE_OPTIONS.map(o => (
                <ToggleBtn key={o.value} active={batchType === o.value} onClick={() => setBatchType(o.value)}>
                  {o.label}
                </ToggleBtn>
              ))}
            </div>
          </div>

          {/* มิติประเภทโจทย์ */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">
              ประเภทโจทย์ (Task Type) — <code className="text-[#64748B] font-normal normal-case">task_type</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <ToggleBtn active={taskType === null} onClick={() => setTaskType(null)}>ทั้งหมด</ToggleBtn>
              {(availableTaskTypes.length > 0
                ? [...availableTaskTypes].sort((a, b) => {
                    const ai = TASK_TYPE_ORDER.indexOf(a);
                    const bi = TASK_TYPE_ORDER.indexOf(b);
                    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                  })
                : [...TASK_TYPE_ORDER]
              ).map(t => (
                <ToggleBtn key={t} active={taskType === t} onClick={() => setTaskType(t)}>
                  <span className="flex items-center gap-1">
                    <TaskTypeIcon type={t} className="w-3.5 h-3.5" />
                    <span>{TASK_TYPE_LABEL[t] ?? t}</span>
                  </span>
                </ToggleBtn>
              ))}
            </div>
          </div>

          {/* Active filter summary */}
          {(batchType ?? taskType) && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-[11px] text-orange-700 flex items-center justify-between flex-wrap gap-2">
              <span>
                กรองโดย:{" "}
                {batchType && <strong>{BATCH_TYPE_OPTIONS.find(o => o.value === batchType)?.label ?? batchType}</strong>}
                {batchType && taskType && " × "}
                {taskType && <strong>{TASK_TYPE_LABEL[taskType] ?? taskType}</strong>}
              </span>
              <button
                onClick={() => { setBatchType(null); setTaskType(null); }}
                className="text-[10px] font-semibold text-[#F37021] hover:underline"
              >
                ล้างตัวกรอง
              </button>
            </div>
          )}
        </section>

        {/* ── ส่วนที่ 2: สถิติกิจกรรม (Live จาก Supabase) ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-[#0F172A] text-sm">สถิติกิจกรรม</h2>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">
                Live query จาก <code>vw_dataset_session_level</code> — grain: 1 row ต่อ session
                {(batchType ?? taskType) ? " (filtered)" : " (ทั้งหมด)"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-[#94A3B8]">กำลังโหลดข้อมูล...</p>
          ) : error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{error}</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Learner Count</p>
                  <p className="text-3xl font-bold text-[#0F172A] mt-1">{data.live_stats.learner_count}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-1">COUNT(DISTINCT participant_code)</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Session Count</p>
                  <p className="text-3xl font-bold text-[#0F172A] mt-1">{data.live_stats.session_count}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-1">COUNT(DISTINCT session_id)</p>
                </div>
              </div>

              {data.live_stats.learner_count === 0 && (
                <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 text-xs text-[#64748B] text-center">
                  ไม่พบข้อมูลสำหรับมิติที่เลือก — ลองเปลี่ยนตัวกรอง
                </div>
              )}

              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Live statistics may include learners outside the frozen Phase 4 pilot cohort (10 learners). Live count reflects all participants in <code>vw_dataset_session_level</code>.
              </p>

              <p className="text-[10px] text-[#94A3B8]">
                Sequence Count (90 sequences จาก Phase 4 pipeline) คือข้อมูลจาก offline artifact — ดูในส่วน Pipeline Statistics ด้านล่าง
              </p>
            </>
          ) : null}
        </section>

        {/* ── ส่วนที่ 3: Pipeline Statistics (Frozen artifact) ── */}
        {data && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[#0F172A] text-sm">สถิติ Pipeline (Phase 4 Artifact)</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-0.5 rounded-full">
                  Frozen at NB05
                </span>
                <span className="text-[10px] text-[#94A3B8]">— ไม่เปลี่ยนตามมิติที่เลือกด้านบน</span>
              </div>
            </div>

            <div className="space-y-0">
              <StatRow label="จำนวน learner ทั้งหมด" value={data.pipeline_stats.total_learners}
                note={`thesis minimum: ${data.pipeline_stats.thesis_minimum_learners}`} />
              <StatRow label="Train / test learners" value={`${data.pipeline_stats.train_learners} / ${data.pipeline_stats.test_learners}`} />
              <StatRow label="Sequence ทั้งหมด" value={data.pipeline_stats.total_sequences}
                note={`train ${data.pipeline_stats.train_sequences} / test ${data.pipeline_stats.test_sequences}`} />
              <StatRow label="Canonical events" value={data.pipeline_stats.total_canonical_events} />
              <StatRow label="Max sequence length" value={`${data.pipeline_stats.max_sequence_length} steps`}
                note={`${data.pipeline_stats.sequence_length_percentile}th percentile`} />
              <StatRow label="Features per timestep" value={data.pipeline_stats.features_per_timestep} />
              <StatRow label="Vocabulary size" value={data.pipeline_stats.vocab_size} note="event types" />
              <StatRow label="Split method" value={data.pipeline_stats.split_method} />
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              ⚠ {data.pipeline_stats.total_learners} learners — ต่ำกว่าเกณฑ์ขั้นต่ำของวิทยานิพนธ์ ({data.pipeline_stats.thesis_minimum_learners} learners). Pipeline validation scope เท่านั้น.
            </div>
          </section>
        )}

        {/* ── ส่วนที่ 4: BSSA Feature Analysis ── */}
        {data?.bssa_features && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[#0F172A] text-sm">การวิเคราะห์คุณลักษณะ BSSA</h2>
              <p className="text-[11px] text-[#64748B] mt-1">
                BSSA คือ Feature Framework (กรอบการแบ่งกลุ่ม feature) ไม่ใช่มิติการวิเคราะห์
                — แหล่งข้อมูล: <code className="text-[10px]">comparison_manifest_v1.json</code>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {bssaGroupOrder.map(key => {
                const group = data.bssa_features.groups[key];
                if (!group) return null;
                return <BssaGroupCard key={key} groupKey={key} group={group} />;
              })}
            </div>
          </section>
        )}

        {/* ── ส่วนที่ 5: 2C3L Assessment ── */}
        <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
          <div>
            <h2 className="font-semibold text-[#0F172A] text-sm">การประเมินตามเกณฑ์ 2C3L</h2>
            <p className="text-[11px] text-[#64748B] mt-1">
              2C3L คือ Assessment Rubric (เกณฑ์การประเมินผู้เรียน) ไม่ใช่มิติการวิเคราะห์ ไม่ใช่ BSSA feature และไม่ใช่ analytical model
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">สถานะปัจจุบัน: Pilot Only — ยังไม่ผ่านการตรวจสอบ</p>
            <p>ยังไม่มี teacher-reviewed หรือ expert-validated assessment results เพียงพอสำหรับการรายงานผล</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <C2L3ComponentCard
              code="C1"
              description="Correctness — ความถูกต้องของผลลัพธ์จากโจทย์ (เช่น SQL query ให้ผลถูกต้องหรือไม่)"
            />
            <C2L3ComponentCard
              code="C2"
              description="Clarity — ความชัดเจนและความเหมาะสมของวิธีการแก้ปัญหา"
            />
            <C2L3ComponentCard
              code="L1"
              description="Logic — ความสมเหตุสมผลของกระบวนการคิดและลำดับขั้นตอน"
            />
            <C2L3ComponentCard
              code="L2"
              description="Learning Process — พฤติกรรมการเรียนรู้ เช่น การ revise การ retry และการใช้ hint"
            />
            <C2L3ComponentCard
              code="L3"
              description="Level of Mastery — ระดับความเชี่ยวชาญโดยรวมที่ประเมินจาก rubric ทั้งหมด"
            />
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide">เงื่อนไขก่อนแสดงผล 2C3L จริง</p>
            <ul className="text-[11px] text-[#64748B] space-y-1">
              <li>• teacher-reviewed หรือ expert-validated labels พร้อมใช้งาน</li>
              <li>• อย่างน้อย 60 learners (เกณฑ์ขั้นต่ำวิทยานิพนธ์)</li>
              <li>• ผ่าน validation protocol ที่กำหนดในสัญญาวิจัย</li>
            </ul>
          </div>
        </section>

        {/* ── Pipeline Validation Gate ── */}
        {data && (
          <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-3">
            <h2 className="font-semibold text-[#0F172A] text-sm">Pipeline Validation Gate</h2>
            <p className="text-xs text-[#64748B]">{data.validation.checks_passed} / {data.validation.checks_run} checks passed</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CheckBadge ok={data.validation.checks_passed === data.validation.checks_run}
                label={`All ${data.validation.checks_run} pipeline checks passed`} />
              <CheckBadge ok={data.validation.no_learner_overlap} label="No learner overlap (train/test)" />
              <CheckBadge ok={data.validation.no_pii_in_exports} label="No PII in exports" />
              <CheckBadge ok={data.validation.leakage_check_passed} label="Leakage check passed" />
              <CheckBadge ok={data.validation.split_integrity_passed} label="Split integrity passed" />
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
