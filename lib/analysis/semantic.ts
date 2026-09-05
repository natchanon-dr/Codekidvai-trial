// Semantic analysis step — SQL structural similarity (Static Analysis).
//
// Compares each learner's final submitted SQL answer (trn_submissions.final_answer_text)
// against the task's reference solution (mst_tasks.expected_sql / expected_answer) by
// parsing both to an AST (node-sql-parser) and measuring structural overlap: which
// columns are selected, which tables are used, which WHERE conditions and ORDER BY
// clauses match. This is "Static Analysis" per the BSSA framework's Table 3.6 —
// Dynamic Analysis (executing SQL against sandboxed test databases and comparing
// result sets) is a separate, larger effort and is NOT implemented here.
//
// Scope: sql_text and stored_procedure task types only (Text-based track, per current
// project priority). ER Diagram and Visual Query Builder (sql_block) are Block-based
// and out of scope — this executor throws PhaseDeferredError for those datasets.
//
// Data source: trn_learning_sessions, trn_submissions, mst_tasks

import { Parser } from "node-sql-parser";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DatasetNotFoundError, InsufficientDataError, PhaseDeferredError } from "./types";
import { persistResult } from "./assessment";
import type { StepContext } from "./types";

const TEXT_BASED_TASK_TYPES = new Set(["sql_text", "stored_procedure"]);
const SQL_DIALECT = "Postgresql";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface DatasetRow {
  id: string;
  task_set_id: string | null;
  task_type: string | null;
}

interface SessionRow {
  session_id: string;
  profile_id: string;
}

interface SubmissionRow {
  submission_id: string;
  session_id: string;
  profile_id: string;
  task_id: string;
  final_answer_text: string | null;
}

interface TaskRow {
  task_id: string;
  expected_sql: string | null;
  expected_answer: string | null;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface SemanticSubmissionDetail {
  submission_id: string;
  profile_id: string;
  task_id: string;
  parsed: boolean;
  ast_similarity: number | null;
  structure_score: number | null;
  parse_error: string | null;
}

export interface SemanticLearnerMetrics {
  profile_id: string;
  submission_count: number;
  parsed_count: number;
  parse_error_count: number;
  avg_ast_similarity: number;
  avg_structure_score: number;
}

export interface SemanticResult {
  schema_version: "1.0.0";
  computed_at: string;
  dataset_id: string;
  computation_scope: "static_ast_structural_similarity";
  dynamic_analysis: "deferred";
  deferred_reason: string;
  learner_count: number;
  submission_count: number;
  parsed_count: number;
  parse_error_count: number;
  avg_ast_similarity: number;
  avg_structure_score: number;
  per_learner: SemanticLearnerMetrics[];
  submissions: SemanticSubmissionDetail[];
}

const MAX_SUBMISSION_DETAILS = 100;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runSemanticAnalysis(ctx: StepContext): Promise<void> {
  const { runId, datasetId, onHeartbeat } = ctx;

  const { data: dataset, error: dsErr } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, task_set_id, task_type")
    .eq("id", datasetId)
    .maybeSingle();
  if (dsErr) throw new Error(`Dataset fetch failed: ${dsErr.message}`);
  if (!dataset) throw new DatasetNotFoundError(datasetId, "not found in mst_datasets");

  const taskType = (dataset as DatasetRow).task_type;
  if (!taskType || !TEXT_BASED_TASK_TYPES.has(taskType)) {
    throw new PhaseDeferredError(
      "semantic",
      5,
      `Semantic analysis is implemented for Text-based datasets only (sql_text, stored_procedure). ` +
        `This dataset's task_type is '${taskType ?? "null"}' (Block-based track — ER Diagram / Visual ` +
        `Query Builder support is planned for a later phase).`,
    );
  }

  const taskSetId = (dataset as DatasetRow).task_set_id;
  if (!taskSetId) {
    throw new DatasetNotFoundError(datasetId, "task_set_id is null — dataset is not linked to an experiment batch");
  }

  await onHeartbeat();

  const sessions = await fetchSemanticSessions(taskSetId);
  if (sessions.length === 0) {
    throw new InsufficientDataError(`No learning sessions found for dataset ${datasetId} (batch: ${taskSetId}).`);
  }
  const sessionIds = sessions.map((s) => s.session_id);

  await onHeartbeat();

  const submissions = await fetchSubmissions(sessionIds);
  if (submissions.length === 0) {
    throw new InsufficientDataError(
      `No submissions found for dataset ${datasetId}. Semantic analysis requires final answers from trn_submissions.`,
    );
  }

  await onHeartbeat();

  const taskIds = [...new Set(submissions.map((s) => s.task_id))];
  const tasks = await fetchTasks(taskIds);

  const result = computeSemanticResult(datasetId, submissions, tasks);
  await persistResult(runId, datasetId, "semantic", result);
}

// ---------------------------------------------------------------------------
// Data fetch helpers
// ---------------------------------------------------------------------------

async function fetchSemanticSessions(taskSetId: string): Promise<SessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trn_learning_sessions")
    .select("session_id, profile_id")
    .eq("batch_id", taskSetId)
    .not("profile_id", "is", null);
  if (error) throw new Error(`Session fetch failed: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

async function fetchSubmissions(sessionIds: string[]): Promise<SubmissionRow[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("trn_submissions")
    .select("submission_id, session_id, profile_id, task_id, final_answer_text")
    .in("session_id", sessionIds)
    .not("final_answer_text", "is", null);
  if (error) throw new Error(`Submission fetch failed: ${error.message}`);
  return (data ?? []) as SubmissionRow[];
}

async function fetchTasks(taskIds: string[]): Promise<Map<string, string>> {
  if (taskIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("mst_tasks")
    .select("task_id, expected_sql, expected_answer")
    .in("task_id", taskIds);
  if (error) throw new Error(`Task fetch failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const t of (data ?? []) as TaskRow[]) {
    const reference = t.expected_sql ?? t.expected_answer;
    if (reference) map.set(t.task_id, reference);
  }
  return map;
}

// ---------------------------------------------------------------------------
// AST extraction helpers
// ---------------------------------------------------------------------------

const parser = new Parser();

function tryParse(sql: string): Record<string, unknown> | null {
  try {
    const ast = parser.astify(sql, { database: SQL_DIALECT });
    return (Array.isArray(ast) ? ast[0] : ast) as unknown as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

type ColumnRef = { column?: string | { expr?: { value?: unknown } }; value?: unknown } | null | undefined;

function extractColumnName(ref: ColumnRef): string {
  if (!ref) return "";
  if (typeof ref.column === "string") return ref.column.toLowerCase();
  const nested = (ref.column as { expr?: { value?: unknown } } | undefined)?.expr?.value;
  if (nested !== undefined) return String(nested).toLowerCase();
  return "";
}

function extractValue(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { column?: unknown; value?: unknown };
  if (n.column !== undefined) return extractColumnName(n as ColumnRef);
  if (n.value !== undefined) return String(n.value).toLowerCase();
  return "";
}

function extractColumns(ast: Record<string, unknown>): string[] {
  const columns = ast.columns;
  if (!Array.isArray(columns)) return [];
  return columns
    .map((c) => {
      if (c === "*") return "*";
      const expr = (c as { expr?: ColumnRef }).expr;
      return extractColumnName(expr);
    })
    .filter((c): c is string => Boolean(c))
    .sort();
}

function extractTables(ast: Record<string, unknown>): string[] {
  const from = ast.from;
  if (!Array.isArray(from)) return [];
  return from
    .map((f) => {
      const table = (f as { table?: string }).table;
      return table ? table.toLowerCase() : "";
    })
    .filter((t): t is string => Boolean(t))
    .sort();
}

function flattenWhere(node: unknown, acc: string[] = []): string[] {
  if (!node || typeof node !== "object") return acc;
  const n = node as { type?: string; operator?: string; left?: unknown; right?: unknown };
  if (n.type === "binary_expr") {
    const op = String(n.operator ?? "").toLowerCase();
    if (op === "and" || op === "or") {
      flattenWhere(n.left, acc);
      flattenWhere(n.right, acc);
    } else {
      const left = extractValue(n.left);
      const right = extractValue(n.right);
      acc.push(`${left}${op}${right}`);
    }
  }
  return acc;
}

function extractOrderBy(ast: Record<string, unknown>): string[] {
  const orderby = ast.orderby;
  if (!Array.isArray(orderby)) return [];
  return orderby
    .map((o) => {
      const item = o as { expr?: ColumnRef; type?: string | null };
      const col = extractColumnName(item.expr);
      if (!col) return "";
      return `${col}:${(item.type ?? "asc").toLowerCase()}`;
    })
    .filter((s): s is string => Boolean(s))
    .sort();
}

// ---------------------------------------------------------------------------
// Similarity computation
// ---------------------------------------------------------------------------

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function computeAstSimilarity(learner: Record<string, unknown>, expected: Record<string, unknown>): number {
  const dims = [
    jaccard(extractColumns(learner), extractColumns(expected)),
    jaccard(extractTables(learner), extractTables(expected)),
    jaccard(flattenWhere(learner.where), flattenWhere(expected.where)),
    jaccard(extractOrderBy(learner), extractOrderBy(expected)),
  ];
  return r2(dims.reduce((a, b) => a + b, 0) / dims.length);
}

function computeStructureScore(learner: Record<string, unknown>, expected: Record<string, unknown>): number {
  const checks = [
    learner.type === expected.type,
    jaccard(extractTables(learner), extractTables(expected)) === 1,
    Boolean(learner.where) === Boolean(expected.where),
    (Array.isArray(learner.orderby) && learner.orderby.length > 0) ===
      (Array.isArray(expected.orderby) && expected.orderby.length > 0),
    Boolean(learner.groupby) === Boolean(expected.groupby),
    (learner.distinct as { type?: string } | undefined)?.type ===
      (expected.distinct as { type?: string } | undefined)?.type,
  ];
  return r2(checks.filter(Boolean).length / checks.length);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function computeSemanticResult(
  datasetId: string,
  submissions: SubmissionRow[],
  taskReferenceMap: Map<string, string>,
): SemanticResult {
  const details: SemanticSubmissionDetail[] = submissions.map((s) => {
    const reference = taskReferenceMap.get(s.task_id);
    if (!reference || !s.final_answer_text) {
      return {
        submission_id: s.submission_id,
        profile_id: s.profile_id,
        task_id: s.task_id,
        parsed: false,
        ast_similarity: null,
        structure_score: null,
        parse_error: "No reference SQL configured for this task.",
      };
    }

    const learnerAst = tryParse(s.final_answer_text);
    const expectedAst = tryParse(reference);

    if (!learnerAst || !expectedAst) {
      return {
        submission_id: s.submission_id,
        profile_id: s.profile_id,
        task_id: s.task_id,
        parsed: false,
        ast_similarity: 0,
        structure_score: 0,
        parse_error: !learnerAst ? "Could not parse learner's SQL answer." : "Could not parse reference SQL.",
      };
    }

    return {
      submission_id: s.submission_id,
      profile_id: s.profile_id,
      task_id: s.task_id,
      parsed: true,
      ast_similarity: computeAstSimilarity(learnerAst, expectedAst),
      structure_score: computeStructureScore(learnerAst, expectedAst),
      parse_error: null,
    };
  });

  const parsedDetails = details.filter((d) => d.parsed);
  const parseErrorCount = details.length - parsedDetails.length;

  const byLearner = new Map<string, SemanticSubmissionDetail[]>();
  for (const d of details) {
    const list = byLearner.get(d.profile_id) ?? [];
    list.push(d);
    byLearner.set(d.profile_id, list);
  }

  const perLearner: SemanticLearnerMetrics[] = Array.from(byLearner.entries())
    .map(([profileId, subs]) => {
      const parsed = subs.filter((s) => s.parsed);
      const avgSim = parsed.length > 0
        ? r2(parsed.reduce((sum, s) => sum + (s.ast_similarity ?? 0), 0) / parsed.length)
        : 0;
      const avgStruct = parsed.length > 0
        ? r2(parsed.reduce((sum, s) => sum + (s.structure_score ?? 0), 0) / parsed.length)
        : 0;
      return {
        profile_id: profileId,
        submission_count: subs.length,
        parsed_count: parsed.length,
        parse_error_count: subs.length - parsed.length,
        avg_ast_similarity: avgSim,
        avg_structure_score: avgStruct,
      };
    })
    .sort((a, b) => a.profile_id.localeCompare(b.profile_id));

  const n = parsedDetails.length;
  const avgAstSimilarity = n > 0
    ? r2(parsedDetails.reduce((sum, d) => sum + (d.ast_similarity ?? 0), 0) / n)
    : 0;
  const avgStructureScore = n > 0
    ? r2(parsedDetails.reduce((sum, d) => sum + (d.structure_score ?? 0), 0) / n)
    : 0;

  return {
    schema_version: "1.0.0",
    computed_at: new Date().toISOString(),
    dataset_id: datasetId,
    computation_scope: "static_ast_structural_similarity",
    dynamic_analysis: "deferred",
    deferred_reason:
      "Dynamic Analysis (executing learner SQL against sandboxed test databases and comparing result " +
      "sets) requires a sandboxed query-execution environment that is not available in this repository. " +
      "This result uses Static Analysis only: AST structural comparison against the reference solution.",
    learner_count: byLearner.size,
    submission_count: details.length,
    parsed_count: parsedDetails.length,
    parse_error_count: parseErrorCount,
    avg_ast_similarity: avgAstSimilarity,
    avg_structure_score: avgStructureScore,
    per_learner: perLearner,
    submissions: details.slice(0, MAX_SUBMISSION_DETAILS),
  };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
