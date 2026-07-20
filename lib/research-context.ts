/**
 * Canonical Research Context Contract — Phase 4
 *
 * Source-of-truth decisions (from M8A audit, 2026-07-20):
 *
 *   set_family     → tb_class_sets.family          CHECK ('assignment','lab','exam')
 *   task_type      → mst_tasks.task_type            CHECK (6 values, see below)
 *   batch_type     → mst_experiment_batches.batch_type  CHECK ('pilot','main','practice')
 *                    NOTE: batch_type is an operational field, NOT set_family.
 *                    Do NOT use batch_type as a proxy for set_family.
 *
 * Every research record (session / attempt / sequence / outcome) must be
 * resolvable to: batch_code · set_family · task_code · task_type · learning_mode
 *
 * Naming inconsistency noted:
 *   The researcher dataset filter UI (app/researcher/dataset/page.tsx) currently
 *   filters on batch_type using values 'lab_set'/'assignment_set'/'exam_set'.
 *   These values do not exist in the DB CHECK constraint and do not match
 *   tb_class_sets.family. This is a pre-existing bug to be fixed in M8D.
 */

// ---------------------------------------------------------------------------
// Set Family
// ---------------------------------------------------------------------------

export type SetFamily = "assignment" | "lab" | "exam";

export const SET_FAMILY_VALUES = ["assignment", "lab", "exam"] as const satisfies readonly SetFamily[];

export const SET_FAMILY_LABEL: Record<SetFamily, string> = {
  assignment: "Assignment",
  lab: "Lab",
  exam: "Exam",
};

// ---------------------------------------------------------------------------
// Task Type
// All six values permitted by the mst_tasks CHECK constraint.
// ---------------------------------------------------------------------------

export type TaskType =
  | "sql_text"
  | "stored_procedure"
  | "sql_block"
  | "er_diagram"
  | "coding_text"
  | "coding_block";

export const TASK_TYPE_VALUES = [
  "sql_text",
  "stored_procedure",
  "sql_block",
  "er_diagram",
  "coding_text",
  "coding_block",
] as const satisfies readonly TaskType[];

// ---------------------------------------------------------------------------
// Learning Mode
// Derived from task_type. "block_based" means the UI is block/drag-drop;
// "text_based" means the learner writes text (SQL, code, etc.).
// Note: learning_mode is INDEPENDENT of phase_availability and research_scope.
// Do not equate "block_based" with "Phase 5" in the type system.
// ---------------------------------------------------------------------------

export type LearningMode = "text_based" | "block_based";

export const TASK_TYPE_LEARNING_MODE: Record<TaskType, LearningMode> = {
  sql_text:          "text_based",
  stored_procedure:  "text_based",
  coding_text:       "text_based",
  sql_block:         "block_based",
  er_diagram:        "block_based",
  coding_block:      "block_based",
};

export function getLearningMode(taskType: string): LearningMode {
  return (TASK_TYPE_LEARNING_MODE as Record<string, LearningMode>)[taskType] ?? "text_based";
}

// ---------------------------------------------------------------------------
// Phase Availability
// Describes when simulation/analysis support is planned to be active.
// phase4 = currently implemented; phase5 = planned but not yet simulated.
// Do NOT derive learning_mode from phase_availability.
// ---------------------------------------------------------------------------

export type PhaseAvailability = "phase4" | "phase5";

/** Only the four Thesis SQL task types have a defined phase. */
export const TASK_TYPE_PHASE: Partial<Record<TaskType, PhaseAvailability>> = {
  sql_text:         "phase4",
  stored_procedure: "phase4",
  er_diagram:       "phase5",
  sql_block:        "phase5",
  // coding_text and coding_block are platform-supported but outside the
  // current Thesis SQL research scope. They have no phase entry here.
  // Do not expose them in Phase 4/5 Researcher Analytics filters unless
  // the Research Contract is explicitly expanded.
};

export function getPhaseAvailability(taskType: string): PhaseAvailability | null {
  return (TASK_TYPE_PHASE as Record<string, PhaseAvailability>)[taskType] ?? null;
}

export function isPhase4Supported(taskType: string): boolean {
  return getPhaseAvailability(taskType) === "phase4";
}

// ---------------------------------------------------------------------------
// Research Scope
// The four Thesis SQL task types that are within scope for the researcher
// analytics pipeline. Separate from phase_availability and learning_mode.
// ---------------------------------------------------------------------------

export type ResearchScope = "thesis_sql" | "out_of_scope";

export const TASK_TYPE_RESEARCH_SCOPE: Record<TaskType, ResearchScope> = {
  sql_text:         "thesis_sql",
  stored_procedure: "thesis_sql",
  er_diagram:       "thesis_sql",
  sql_block:        "thesis_sql",
  coding_text:      "out_of_scope",
  coding_block:     "out_of_scope",
};

/** Canonical Thesis SQL label per task_type (for researcher analytics UI). */
export const THESIS_TASK_TYPE_LABEL: Partial<Record<TaskType, string>> = {
  sql_text:         "SQL Query",
  stored_procedure: "Stored Procedure",
  er_diagram:       "ER Diagram",
  sql_block:        "Visual Query Builder",
};

export function isInResearchScope(taskType: string): boolean {
  return (TASK_TYPE_RESEARCH_SCOPE as Record<string, ResearchScope>)[taskType] === "thesis_sql";
}

/** In-scope task types in canonical display order. */
export const THESIS_TASK_TYPE_ORDER: readonly TaskType[] = [
  "sql_text",
  "stored_procedure",
  "er_diagram",
  "sql_block",
];

// ---------------------------------------------------------------------------
// Batch Type (operational — separate from set_family)
// ---------------------------------------------------------------------------

export type BatchType = "pilot" | "main" | "practice";

export const BATCH_TYPE_VALUES = ["pilot", "main", "practice"] as const satisfies readonly BatchType[];

// ---------------------------------------------------------------------------
// Pilot Constraints (unchanged Phase 4 research contract)
// ---------------------------------------------------------------------------

export const PHASE4_CONSTRAINTS = {
  evaluation_purpose: "technical_pipeline_validation",
  label_source: "proxy_behavioral",
  label_validity: "pilot_only",
  proxy_target_circularity: true,
  confirmatory_analysis_allowed: false,
  thesis_minimum_learners: 60,
} as const;

// ---------------------------------------------------------------------------
// Coverage Matrix
// Covers the four Thesis SQL task types × three set families.
// Status reflects phase_availability for the current pilot.
// ---------------------------------------------------------------------------

export type ContextCellStatus = "available" | "no_data" | "phase5";

export interface ContextCell {
  set_family: SetFamily;
  task_type: TaskType;
  status: ContextCellStatus;
}

/** All 6 Phase 4 active (text-based) validation combinations. */
export const PHASE4_VALIDATION_MATRIX: ContextCell[] = [
  { set_family: "assignment", task_type: "sql_text",         status: "available" },
  { set_family: "assignment", task_type: "stored_procedure", status: "available" },
  { set_family: "lab",        task_type: "sql_text",         status: "available" },
  { set_family: "lab",        task_type: "stored_procedure", status: "available" },
  { set_family: "exam",       task_type: "sql_text",         status: "available" },
  { set_family: "exam",       task_type: "stored_procedure", status: "available" },
];

/**
 * Full coverage matrix for UI display: 3 set families × 4 Thesis SQL task types.
 * Does not include coding_text / coding_block (out of research scope).
 */
export function buildCoverageMatrix(): ContextCell[] {
  const cells: ContextCell[] = [];
  for (const sf of SET_FAMILY_VALUES) {
    for (const tt of THESIS_TASK_TYPE_ORDER) {
      const phase4Entry = PHASE4_VALIDATION_MATRIX.find(
        (c) => c.set_family === sf && c.task_type === tt
      );
      if (phase4Entry) {
        cells.push(phase4Entry);
      } else {
        // er_diagram and sql_block are Phase 5 planned
        cells.push({ set_family: sf, task_type: tt, status: "phase5" });
      }
    }
  }
  return cells;
}
