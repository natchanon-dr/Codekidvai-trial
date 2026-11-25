"use client";

// ---------------------------------------------------------------------------
// Final Result Analysis — Result detail modal. Matches the same chrome
// style as Sequential Analysis's AnalysisResultModal (sticky header, full
// screen overlay, SectionCard-based body) per explicit user request to
// keep a consistent look across Analysis "Result" views — reusing the
// shared primitives extracted in M5.31-R2 (AnalysisPrimitives.tsx).
//
// M5.31-R1b: reads a frozen run snapshot (mst_pipeline_run_results,
// analysis_type='final_result') by run_id — not a live query anymore.
// TAG (Traditional Auto Grading) still has no model to train; the "run"
// is just a point-in-time snapshot of the real recorded outcome.
// ---------------------------------------------------------------------------

import { Fragment, useEffect, useMemo, useState } from "react";
import { SectionCard, StatCell, CheckBadge, ProportionBar } from "./AnalysisPrimitives";

type LearnerRow = {
  participant_code: string;
  display_code: string;
  session_id: string;
  is_passed: boolean | null;
  final_score: number | null;
  submitted_at: string | null;
};

type DetailPayload = {
  dataset: { id: string; code: string; name: string; batch_type: string; set_family: string; task_type: string | null };
  learners: LearnerRow[];
  note: string;
  snapshot_created_at: string;
};

type Props = {
  runId: string;
  datasetCode: string;
  token: string;
  onClose: () => void;
};

export function FinalResultDetailModal({ runId, datasetCode, token, onClose }: Props) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLearners, setExpandedLearners] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/researcher/final-result-analysis?run_id=${encodeURIComponent(runId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        setError((j as { error?: string }).error ?? "Failed to load result.");
        setLoading(false);
        return;
      }
      setData((await res.json()) as DetailPayload);
      setLoading(false);
    }
    void load();
  }, [runId, token]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const learners = data?.learners ?? [];
  const graded = learners.filter((l) => l.is_passed !== null);
  const passed = graded.filter((l) => l.is_passed === true).length;
  const failed = graded.filter((l) => l.is_passed === false).length;
  const passRate = graded.length > 0 ? Math.round((passed / graded.length) * 100) : null;
  const ungraded = learners.length - graded.length;

  // Group session rows by learner (participant_code) — a learner can have
  // multiple sessions (attempts); the table below shows one row per
  // learner with aggregate counts, expandable to the underlying sessions.
  const byLearner = useMemo(() => {
    const map = new Map<string, LearnerRow[]>();
    for (const l of learners) {
      const list = map.get(l.participant_code) ?? [];
      list.push(l);
      map.set(l.participant_code, list);
    }
    return [...map.entries()]
      .map(([participant_code, sessions]) => {
        const lGraded = sessions.filter((s) => s.is_passed !== null);
        const lSubmitted = sessions.filter((s) => s.submitted_at !== null);
        const totalScore = sessions.reduce((sum, s) => sum + (s.final_score ?? 0), 0);
        return {
          participant_code,
          display_code: sessions[0]?.display_code ?? participant_code,
          sessions,
          total: sessions.length,
          submitted: lSubmitted.length,
          passed: lGraded.filter((s) => s.is_passed === true).length,
          failed: lGraded.filter((s) => s.is_passed === false).length,
          ungraded: sessions.length - lGraded.length,
          totalScore,
        };
      })
      .sort((a, b) => a.display_code.localeCompare(b.display_code));
  }, [learners]);

  function toggleLearner(code: string) {
    setExpandedLearners((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-screen bg-[#FFF7ED]">
        {/* Sticky header — same pattern as Sequential Analysis's result modal */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-[#0F172A] text-sm">Final Result Analysis &#8212; {datasetCode}</p>
            <p className="text-xs text-[#64748B]">
              Traditional Auto Grading (TAG) &#183; Read-only &#183; frozen snapshot
              {data?.snapshot_created_at && <> &#183; {new Date(data.snapshot_created_at).toLocaleString()}</>}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-[#FFF7ED] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          {loading && <div className="text-center py-16 text-sm text-[#64748B]">Loading result…</div>}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
              <p className="font-semibold mb-1">Error loading result</p>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <SectionCard title="TAG Result Overview" subtitle={data.note}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCell label="Sessions" value={learners.length} />
                  <StatCell label="Graded" value={graded.length} />
                  <StatCell label="Passed" value={passed} />
                  <StatCell label="Failed" value={failed} />
                </div>
                {passRate !== null && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                    <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Pass Rate</p>
                    <p className={`text-2xl font-bold mt-0.5 ${passRate >= 50 ? "text-green-700" : "text-red-600"}`}>{passRate}%</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide mb-1.5">Correct vs Incorrect</p>
                  <ProportionBar
                    segments={[
                      { label: "Correct", count: passed, colorClass: "bg-green-500" },
                      { label: "Incorrect", count: failed, colorClass: "bg-red-400" },
                      { label: "Ungraded", count: ungraded, colorClass: "bg-[#CBD5E1]" },
                    ]}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Learner Results — By Learner"
                subtitle={`${byLearner.length} learner(s) · ${learners.length} session(s) total · click a row to expand that learner's individual sessions`}
              >
                {byLearner.length === 0 ? (
                  <p className="text-xs text-[#94A3B8] italic">No sessions found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#F8FAFC] text-[#94A3B8] uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Participant</th>
                          <th className="text-right px-3 py-2 font-semibold">Total</th>
                          <th className="text-right px-3 py-2 font-semibold">Submitted</th>
                          <th className="text-right px-3 py-2 font-semibold">Passed</th>
                          <th className="text-right px-3 py-2 font-semibold">Failed</th>
                          <th className="text-right px-3 py-2 font-semibold">Ungraded</th>
                          <th className="text-right px-3 py-2 font-semibold">Score</th>
                          <th className="text-center px-3 py-2 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {byLearner.map((learner) => {
                          const isOpen = expandedLearners.has(learner.participant_code);
                          return (
                            <Fragment key={learner.participant_code}>
                              <tr
                                className="border-b border-[#F1F5F9] hover:bg-[#FFFBF7] cursor-pointer transition-colors"
                                onClick={() => toggleLearner(learner.participant_code)}
                              >
                                <td className="px-3 py-2 font-mono text-[#0F172A]">{learner.display_code}</td>
                                <td className="px-3 py-2 text-right text-[#475569]">{learner.total}</td>
                                <td className="px-3 py-2 text-right text-[#475569]">{learner.submitted}</td>
                                <td className="px-3 py-2 text-right text-green-700">{learner.passed}</td>
                                <td className="px-3 py-2 text-right text-red-600">{learner.failed}</td>
                                <td className="px-3 py-2 text-right text-[#94A3B8]">{learner.ungraded}</td>
                                <td className="px-3 py-2 text-right font-semibold text-[#0F172A]">{learner.totalScore}</td>
                                <td className="px-3 py-2 text-center">
                                  <svg
                                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                    strokeLinecap="round" strokeLinejoin="round"
                                    className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform inline-block ${isOpen ? "rotate-180" : ""}`}
                                    aria-hidden="true"
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </td>
                              </tr>
                              {isOpen && (
                                <tr className="border-b border-[#F1F5F9] bg-[#FAFAFA]">
                                  <td colSpan={8} className="px-6 py-2">
                                    <table className="w-full text-[11px]">
                                      <thead className="text-[#94A3B8] uppercase tracking-wide">
                                        <tr>
                                          <th className="text-left px-2 py-1 font-semibold">Session</th>
                                          <th className="text-left px-2 py-1 font-semibold">Result</th>
                                          <th className="text-right px-2 py-1 font-semibold">Final Score</th>
                                          <th className="text-right px-2 py-1 font-semibold">Submitted</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {learner.sessions.map((s) => (
                                          <tr key={s.session_id}>
                                            <td className="px-2 py-1 font-mono text-[#64748B]">{s.session_id.slice(0, 8)}…</td>
                                            <td className="px-2 py-1">
                                              {s.is_passed === null ? (
                                                <span className="text-[#94A3B8] italic">Ungraded</span>
                                              ) : (
                                                <CheckBadge ok={s.is_passed} label={s.is_passed ? "Correct" : "Incorrect"} />
                                              )}
                                            </td>
                                            <td className="px-2 py-1 text-right text-[#475569]">{s.final_score ?? "—"}</td>
                                            <td className="px-2 py-1 text-right text-[#94A3B8]">
                                              {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
