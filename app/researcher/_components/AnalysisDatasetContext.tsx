"use client";

// ---------------------------------------------------------------------------
// AnalysisDatasetContext — shared "which dataset am I looking at" context
// bar (M5.31-R2, see docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md §9).
//
// Purpose: let a researcher navigating Final Result -> Behavioral ->
// Sequential -> Semantic -> BSSI Analysis immediately see that all five
// views refer to the same Canonical Dataset (mst_datasets row — see the
// contract's §3 "One Canonical Dataset" decision).
//
// All values are passed in by the caller from real API data — this
// component never invents or defaults a number. Any field the caller
// doesn't have is simply omitted (not shown as 0 or "—" pretending to be
// real).
//
// Not yet wired into any page as of M5.31-R2 (built ahead of R3+, which
// will adopt it into Final Result / Behavioral / Sequential / Semantic /
// BSSI Analysis without changing their current live behavior in this
// milestone).
// ---------------------------------------------------------------------------

export type DatasetContextInfo = {
  code: string;
  name: string;
  batch_type?: string;
  set_family?: string;
  task_type?: string | null;
  learner_count?: number;
  session_count?: number;
  split_method?: string;
  label_source?: string;
  label_validity?: string;
};

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[#94A3B8] uppercase tracking-wide">{label}</span>
      <span className="text-xs font-semibold text-[#0F172A]">{value}</span>
    </div>
  );
}

export function AnalysisDatasetContext({ dataset }: { dataset: DatasetContextInfo }) {
  return (
    <div className="bg-white border border-[#FED7AA] rounded-2xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex flex-col">
        <span className="text-[9px] text-[#94A3B8] uppercase tracking-wide">Dataset</span>
        <span className="text-sm font-mono font-bold text-[#F37021]">{dataset.code}</span>
      </div>
      <Field label="Name" value={dataset.name} />
      {dataset.batch_type && <Field label="Batch" value={dataset.batch_type} />}
      {dataset.set_family && <Field label="Activity" value={dataset.set_family} />}
      {dataset.task_type && <Field label="Task Type" value={dataset.task_type} />}
      {dataset.learner_count !== undefined && <Field label="Learners" value={dataset.learner_count} />}
      {dataset.session_count !== undefined && <Field label="Sessions" value={dataset.session_count} />}
      {dataset.split_method && <Field label="Split" value={dataset.split_method} />}
      {dataset.label_source && <Field label="Label Source" value={dataset.label_source} />}
      {dataset.label_validity && <Field label="Label Validity" value={dataset.label_validity} />}
    </div>
  );
}
