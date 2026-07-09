"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import type { RubricCriterion, ScoringRubric } from "@/types/dataset";

type AssignmentDetail = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  task_description: string | null;
  task_type: string | null;
  difficulty_level: string | null;
  learning_objective: string | null;
  problem_statement: string | null;
  expected_answer: string | null;
  expected_concept: string | null;
  max_score: number | null;
  estimated_time_seconds: number | null;
  task_status: string | null;
  is_active: boolean | null;
  created_at: string | null;
  scoring_rubric_json: ScoringRubric | null;
  owner: { display_name: string | null; participant_code: string | null } | null;
  assigned_students_count: number;
  submissions_count: number;
  pending_count: number;
};

type Submission = {
  submission_id: string;
  final_answer_text: string | null;
  final_score: number | null;
  is_passed: boolean | null;
  submitted_at: string | null;
  student: { display_name: string | null; participant_code: string | null } | null;
  batch: { batch_code: string | null; batch_name: string | null } | null;
};

type AssignedStudent = {
  assignment_id: string;
  status: string | null;
  assigned_order: number | null;
  student: { display_name: string | null; participant_code: string | null } | null;
  batch: { batch_code: string | null; batch_name: string | null } | null;
};

type DetailPayload = {
  assignment: AssignmentDetail;
  assigned_students: AssignedStudent[];
  submissions: Submission[];
};

// ─── Rubric editor ────────────────────────────────────────────────────────────

type DraftCriterion = {
  key: string;
  label: string;
  keywords: string; // comma-separated in the editor
  weight: string;   // numeric string in the editor
};

function toDraftCriteria(criteria: RubricCriterion[] | undefined): DraftCriterion[] {
  return (criteria ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    keywords: c.keywords.join(", "),
    weight: String(c.weight),
  }));
}

function fromDraftCriteria(drafts: DraftCriterion[]): RubricCriterion[] {
  return drafts.map((d) => ({
    key: d.key.trim(),
    label: d.label.trim(),
    keywords: d.keywords
      .split(",")
      .map((kw) => kw.trim())
      .filter(Boolean),
    weight: parseFloat(d.weight) || 0,
  }));
}

function weightSum(drafts: DraftCriterion[]): number {
  return drafts.reduce((sum, d) => sum + (parseFloat(d.weight) || 0), 0);
}

interface RubricEditorProps {
  taskId: string;
  taskType: string | null;
  maxScore: number | null;
  initialRubric: ScoringRubric | null;
  onSaved: (rubric: ScoringRubric | null) => void;
}

function RubricEditor({ taskId, taskType, maxScore, initialRubric, onSaved }: RubricEditorProps) {
  const [drafts, setDrafts] = useState<DraftCriterion[]>(() =>
    toDraftCriteria(initialRubric?.criteria),
  );
  const [passThreshold, setPassThreshold] = useState(
    String(initialRubric?.pass_threshold ?? "1.0"),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  function addCriterion() {
    const n = drafts.length + 1;
    setDrafts((prev) => [
      ...prev,
      { key: `criterion_${n}`, label: `Criterion ${n}`, keywords: "", weight: "0" },
    ]);
  }

  function removeCriterion(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDraft(index: number, field: keyof DraftCriterion, value: string) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const criteria = fromDraftCriteria(drafts);
      const rubric: ScoringRubric | null =
        criteria.length > 0
          ? {
              version: (initialRubric?.version ?? 0) + 1,
              type: "criterion_based",
              pass_threshold: parseFloat(passThreshold) || 1.0,
              criteria,
            }
          : null;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const res = await fetch(`/api/teacher/assignments/${taskId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scoring_rubric_json: rubric }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Save failed.");
      }
      onSaved(rubric);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Only criterion_based editing is supported here; block tasks use mst_blocks metadata
  if (taskType === "sql_block") {
    return (
      <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#0F172A] mb-2">Rubric</h2>
        <p className="text-sm text-[#64748B]">
          Block-type tasks are scored automatically from block metadata (<code>correct_order</code> and{" "}
          <code>is_correct_part</code> on each block). No manual rubric is required.
        </p>
      </div>
    );
  }

  const totalWeight = weightSum(drafts);
  const weightOk = drafts.length === 0 || Math.abs(totalWeight - 1) < 0.001;

  return (
    <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-[#0F172A]">Scoring Rubric</h2>
        {drafts.length === 0 && (
          <span className="text-xs text-[#64748B]">No rubric — exact match scoring is used.</span>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_1fr_1.5fr_6rem_2rem] gap-2 text-xs font-semibold text-[#64748B] px-1">
            <span>Key</span><span>Label</span><span>Keywords (comma-separated)</span><span>Weight</span><span />
          </div>
          {drafts.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_6rem_2rem] gap-2 items-center">
              <input
                value={d.key}
                onChange={(e) => updateDraft(i, "key", e.target.value)}
                className="border border-[#FED7AA] rounded-lg px-2 py-1 text-xs font-mono"
                placeholder="key"
              />
              <input
                value={d.label}
                onChange={(e) => updateDraft(i, "label", e.target.value)}
                className="border border-[#FED7AA] rounded-lg px-2 py-1 text-xs"
                placeholder="Label"
              />
              <input
                value={d.keywords}
                onChange={(e) => updateDraft(i, "keywords", e.target.value)}
                className="border border-[#FED7AA] rounded-lg px-2 py-1 text-xs font-mono"
                placeholder="select, from, where"
              />
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={d.weight}
                onChange={(e) => updateDraft(i, "weight", e.target.value)}
                className="border border-[#FED7AA] rounded-lg px-2 py-1 text-xs text-right"
              />
              <button
                type="button"
                onClick={() => removeCriterion(i)}
                className="text-red-400 hover:text-red-600 font-bold text-sm"
                title="Remove criterion"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className={`font-semibold ${weightOk ? "text-green-700" : "text-red-600"}`}>
            Total weight: {totalWeight.toFixed(2)} {weightOk ? "✓" : "(must equal 1.0)"}
          </span>
          <span className="text-[#64748B]">|</span>
          <label className="flex items-center gap-1 text-[#64748B]">
            Pass threshold
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={passThreshold}
              onChange={(e) => setPassThreshold(e.target.value)}
              className="border border-[#FED7AA] rounded-lg px-2 py-0.5 w-16 text-right text-xs"
            />
            <span>(fraction of {maxScore ?? 100} pts)</span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={addCriterion}
          className="px-3 py-1.5 text-xs font-semibold border border-[#F37021] text-[#F37021] rounded-xl hover:bg-[#FFF7ED] transition-colors"
        >
          + Add criterion
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || (!weightOk && drafts.length > 0)}
          className="px-4 py-1.5 text-xs font-semibold bg-[#F37021] text-white rounded-xl hover:bg-[#C2410C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save rubric"}
        </button>
        {saveOk && <span className="text-xs text-green-700 font-semibold">Saved.</span>}
        {saveError && <span className="text-xs text-red-600">{saveError}</span>}
      </div>

      {drafts.length > 0 && (
        <p className="text-xs text-[#64748B] border-t border-[#FED7AA] pt-3">
          Each criterion checks that <strong>all</strong> listed keywords appear in the student&apos;s
          normalized answer. Score = Σ(matched criterion weights) × {maxScore ?? 100} pts.
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherAssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/assignments/${params.assignmentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
      else setErrorMessage(json.error ?? text ?? "Failed to load assignment.");
      setLoading(false);
      return;
    }

    setData(json as DetailPayload);
    setLoading(false);
  }, [params.assignmentId, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">
        Loading assignment...
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <p className="text-sm text-red-600">{errorMessage ?? "Assignment not found."}</p>
          <Link
            href="/teacher/assignments"
            className="inline-flex mt-4 px-4 py-2 bg-[#F37021] text-white rounded-xl text-sm font-semibold"
          >
            Back to assignments
          </Link>
        </div>
      </div>
    );
  }

  const assignment = data.assignment;

  function handleRubricSaved(rubric: ScoringRubric | null) {
    setData((prev) =>
      prev ? { ...prev, assignment: { ...prev.assignment, scoring_rubric_json: rubric } } : prev,
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/teacher/assignments"
            className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]"
          >
            Assignments
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Assignment detail</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <section className="space-y-4">
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {assignment.task_code && (
                <span className="font-mono text-xs font-bold text-[#F37021]">{assignment.task_code}</span>
              )}
              <Badge>{assignment.task_type ?? "task"}</Badge>
              <Badge>{assignment.difficulty_level ?? "difficulty"}</Badge>
              <Badge>{assignment.task_status ?? "draft"}</Badge>
              <Badge>{assignment.is_active ? "active" : "inactive"}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              {assignment.task_title ?? "Untitled assignment"}
            </h1>
            <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
              {assignment.task_description ?? "No description provided."}
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric
                label="Assignment Owner"
                value={
                  assignment.owner?.display_name ??
                  assignment.owner?.participant_code ??
                  "Unknown"
                }
              />
              <Metric label="Max Score" value={assignment.max_score ?? 0} />
              <Metric
                label="Estimated Minutes"
                value={
                  assignment.estimated_time_seconds
                    ? Math.round(assignment.estimated_time_seconds / 60)
                    : 0
                }
              />
            </div>
          </div>

          <InfoBlock title="Problem">
            {assignment.problem_statement ??
              assignment.learning_objective ??
              "No problem statement available."}
          </InfoBlock>
          {assignment.expected_answer && (
            <InfoBlock title="Expected Answer">{assignment.expected_answer}</InfoBlock>
          )}
          {assignment.expected_concept && (
            <InfoBlock title="Expected Concept">{assignment.expected_concept}</InfoBlock>
          )}

          <RubricEditor
            taskId={assignment.task_id}
            taskType={assignment.task_type}
            maxScore={assignment.max_score}
            initialRubric={assignment.scoring_rubric_json}
            onSaved={handleRubricSaved}
          />
        </section>
      </main>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
      <h2 className="text-base font-bold text-[#0F172A] mb-2">{title}</h2>
      <p className="text-sm text-[#0F172A] leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3">
      <p className="text-xs text-[#64748B]">{label}</p>
      <p className="text-sm font-bold text-[#0F172A] mt-1">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA] capitalize">
      {children}
    </span>
  );
}

function safeJsonParse(text: string): { error?: string } & Partial<DetailPayload> {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
