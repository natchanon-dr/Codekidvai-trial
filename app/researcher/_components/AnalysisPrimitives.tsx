"use client";

// ---------------------------------------------------------------------------
// Shared, generic presentational primitives for the Researcher Analysis
// pages (Final Result / Behavioral / Sequential / Semantic / BSSI — see
// docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md, M5.31-R2).
//
// Extracted verbatim (no visual/behavior change) from
// app/researcher/_components/AnalysisResultView.tsx and
// app/researcher/sequential-analysis/page.tsx, which previously each
// defined their own private copies. Any Analysis page may import these
// instead of redefining them.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#FED7AA] px-6 py-5 space-y-4">
      <div>
        <h2 className="font-semibold text-[#0F172A] text-sm">{title}</h2>
        {subtitle && <p className="text-[11px] text-[#64748B] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function StatCell({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-[#0F172A] mt-0.5">{value}</p>
      {note && <p className="text-[9px] text-[#94A3B8] mt-0.5 italic">{note}</p>}
    </div>
  );
}

export function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
        ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <span>{label}</span>
    </div>
  );
}

export function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</p>
      <code
        className="block text-[10px] font-mono text-[#475569] break-all leading-relaxed"
        style={{ wordBreak: "break-all" }}
      >
        {value}
      </code>
    </div>
  );
}

export function UnavailableSection({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <p className="text-xs text-[#94A3B8] italic">Not available for this run.</p>
    </SectionCard>
  );
}

// Stacked horizontal proportion bar (e.g. Correct vs Incorrect vs
// Ungraded). Dependency-free — no charting library in this project; a
// plain divs-based bar keeps every Analysis "Result" view able to show a
// simple, honest visualization without adding a package. Segments with
// count 0 are omitted so the bar never shows a misleading sliver.
export type ProportionSegment = { label: string; count: number; colorClass: string };

export function ProportionBar({ segments }: { segments: ProportionSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const visible = segments.filter((s) => s.count > 0);
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        {total === 0 ? (
          <div className="h-full w-full bg-[#F1F5F9]" />
        ) : (
          visible.map((s) => (
            <div
              key={s.label}
              className={s.colorClass}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${s.colorClass}`} />
            {s.label}: <strong className="text-[#0F172A]">{s.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// Run/analysis status pill. Originally Sequential Analysis's dataset-table
// status column; the color map is generic to any pending/running/
// completed/failed/cancelled lifecycle, not Sequential-specific.
export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    running: "bg-blue-100 text-blue-700 border-blue-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const cls = colorMap[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {status}
    </span>
  );
}
