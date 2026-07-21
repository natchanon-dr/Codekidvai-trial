/**
 * export-research-snapshots.mjs
 *
 * Phase 4 — Export all four research snapshot types for a given batch:
 *   sequence_<date>_<tag>.csv   from vw_dataset_sequence_level
 *   attempt_<date>_<tag>.csv    from vw_dataset_attempt_level
 *   session_<date>_<tag>.csv    from vw_dataset_session_level
 *   outcome_<date>_<tag>.csv    with computed 2C3L labels
 *
 * Unlike e2e-sim-export-csv.mjs, this script is NOT restricted to SIM/MOCK
 * batches. It reads existing data. It does NOT simulate a student flow.
 *
 * Usage:
 *   node scripts/export-research-snapshots.mjs --batch <BATCH_CODE> [--skip-existing]
 *
 * Output: notebooks/data/raw/
 */
import fs   from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv('.env.local');

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs() {
  const out = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}
const opts = parseArgs();
const BATCH_CODE   = opts['batch'];
const SKIP_EXISTING = opts['skip-existing'] === 'true';

if (!BATCH_CODE) {
  console.error('ERROR: --batch <BATCH_CODE> is required.');
  process.exit(1);
}

const TODAY     = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BATCH_TAG = BATCH_CODE.replace(/_/g, '-');
const OUT_DIR   = path.join('notebooks', 'data', 'raw');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────
function escapeCsv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return '﻿' + [headers.join(','), ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(','))].join('\n');
}
function skip(file) {
  if (SKIP_EXISTING && fs.existsSync(file)) {
    console.log(`  SKIP (exists): ${file}`);
    return true;
  }
  return false;
}

const CANONICAL_KEYS = [
  'c1_correctness_result',
  'c2_semantic_consistency',
  'l1_logical_reasoning',
  'l2_learning_process',
  'l3_difficulty_complexity',
];

function deriveGrade(s) {
  if (s >= 85) return 'A';
  if (s >= 75) return 'B';
  if (s >= 65) return 'C';
  if (s >= 55) return 'D';
  if (s >= 45) return 'E';
  return 'F';
}

// ── 1. Sequence snapshot ──────────────────────────────────────────────────────
const seqFile = path.join(OUT_DIR, `sequence_${TODAY}_${BATCH_TAG}.csv`);
if (!skip(seqFile)) {
  console.log(`\n[1/4] Fetching vw_dataset_sequence_level for ${BATCH_CODE}...`);
  const { data: seqRaw, error: seqErr } = await admin
    .from('vw_dataset_sequence_level')
    .select('*')
    .eq('batch_code', BATCH_CODE);
  if (seqErr) throw seqErr;
  console.log(`  ${seqRaw.length} event rows`);

  const seqRows = seqRaw.map(r => ({
    academy_member_id:   r.participant_code,
    batch_code:          r.batch_code ?? BATCH_CODE,
    task_code:           r.task_code,
    task_type:           r.task_type ?? '',
    session_id:          r.session_id,
    session_status:      r.session_status,
    session_started_at:  r.session_started_at,
    event_id:            r.event_id,
    event_order:         r.event_order,
    event_type:          r.event_type,
    event_value:         r.event_value ?? '',
    duration_from_start: r.duration_from_start ?? '',
    event_time:          r.event_time,
    metadata_json:       r.metadata_json ? JSON.stringify(r.metadata_json) : '',
    set_family:          r.set_family ?? '',
    learning_mode:       r.learning_mode ?? '',
  }));
  fs.writeFileSync(seqFile, toCsv(seqRows), 'utf8');
  console.log(`  Written: ${seqFile}`);
}

// ── 2. Attempt snapshot ───────────────────────────────────────────────────────
const attFile = path.join(OUT_DIR, `attempt_${TODAY}_${BATCH_TAG}.csv`);
if (!skip(attFile)) {
  console.log(`\n[2/4] Fetching vw_dataset_attempt_level for ${BATCH_CODE}...`);
  const { data: attRaw, error: attErr } = await admin
    .from('vw_dataset_attempt_level')
    .select('*')
    .eq('batch_code', BATCH_CODE);
  if (attErr) throw attErr;
  console.log(`  ${attRaw.length} attempt rows`);

  const attRows = attRaw.map(r => ({
    academy_member_id: r.participant_code,
    batch_code:        r.batch_code ?? BATCH_CODE,
    task_code:         r.task_code,
    attempt_no:        r.attempt_no,
    attempt_type:      r.attempt_type,
    is_correct:        r.is_correct,
    error_type:        r.error_type ?? '',
    execution_time_ms: r.execution_time_ms ?? '',
    created_at:        r.attempt_created_at ?? '',
    set_family:        r.set_family ?? '',
    learning_mode:     r.learning_mode ?? '',
  }));
  fs.writeFileSync(attFile, toCsv(attRows), 'utf8');
  console.log(`  Written: ${attFile}`);
}

// ── 3. Session snapshot ───────────────────────────────────────────────────────
const sessFile = path.join(OUT_DIR, `session_${TODAY}_${BATCH_TAG}.csv`);
if (!skip(sessFile)) {
  console.log(`\n[3/4] Fetching vw_dataset_session_level for ${BATCH_CODE}...`);
  const { data: sessRaw, error: sessErr } = await admin
    .from('vw_dataset_session_level')
    .select('*')
    .eq('batch_code', BATCH_CODE);
  if (sessErr) throw sessErr;
  console.log(`  ${sessRaw.length} session rows`);

  const sessRows = sessRaw.map(r => ({
    academy_member_id:   r.participant_code,
    batch_code:          r.batch_code ?? BATCH_CODE,
    task_code:           r.task_code,
    task_type:           r.task_type ?? '',
    session_id:          r.session_id,
    session_status:      r.session_status,
    started_at:          r.started_at ?? '',
    ended_at:            r.ended_at ?? '',
    duration_seconds:    r.duration_seconds ?? '',
    total_attempts:      r.total_attempts ?? 0,
    total_runs:          r.total_runs ?? 0,
    total_errors:        r.total_errors ?? 0,
    total_hints:         r.total_hints ?? 0,
    total_block_actions: r.total_block_actions ?? 0,
    final_score:         r.final_score ?? '',
    is_passed:           r.is_passed ?? '',
    submitted_at:        r.submitted_at ?? '',
    set_family:          r.set_family ?? '',
    learning_mode:       r.learning_mode ?? '',
  }));
  fs.writeFileSync(sessFile, toCsv(sessRows), 'utf8');
  console.log(`  Written: ${sessFile}`);
}

// ── 4. Outcome snapshot ───────────────────────────────────────────────────────
const outcomeFile = path.join(OUT_DIR, `outcome_${TODAY}_${BATCH_TAG}.csv`);
if (!skip(outcomeFile)) {
  console.log(`\n[4/4] Building outcome snapshot for ${BATCH_CODE}...`);

  // Resolve batch_id
  const { data: batchRow } = await admin
    .from('mst_experiment_batches')
    .select('batch_id')
    .eq('batch_code', BATCH_CODE)
    .single();
  const batchId = batchRow?.batch_id;

  if (!batchId) {
    console.warn(`  WARNING: batch_code '${BATCH_CODE}' not found in mst_experiment_batches.`);
    console.warn(`  Writing empty outcome CSV.`);
    fs.writeFileSync(outcomeFile, '', 'utf8');
  } else {
    // Fetch submissions
    const { data: subs } = await admin
      .from('trn_submissions')
      .select('submission_id, profile_id, task_id, submitted_at')
      .eq('batch_id', batchId);

    const subIds = (subs ?? []).map(s => s.submission_id);
    console.log(`  ${(subs ?? []).length} submissions`);

    // Profile codes
    const profileIds = [...new Set((subs ?? []).map(s => s.profile_id))];
    const { data: profiles } = profileIds.length
      ? await admin.from('mst_profiles').select('profile_id, participant_code').in('profile_id', profileIds)
      : { data: [] };
    const codeByPid = new Map((profiles ?? []).map(p => [p.profile_id, p.participant_code]));

    // Task codes and types
    const taskIds = [...new Set((subs ?? []).map(s => s.task_id))];
    const { data: tasks } = taskIds.length
      ? await admin.from('mst_tasks').select('task_id, task_code, task_type').in('task_id', taskIds)
      : { data: [] };
    const codeByTid = new Map((tasks ?? []).map(t => [t.task_id, t.task_code]));
    const typeByTid = new Map((tasks ?? []).map(t => [t.task_id, t.task_type ?? '']));

    // Resolve set_family for this batch (NULL if ambiguous)
    const { data: csRows } = await admin
      .from('tb_class_sets').select('family').eq('batch_id', batchId);
    const batchFamilies = [...new Set((csRows ?? []).map(r => r.family).filter(Boolean))];
    const batchSetFamily = batchFamilies.length === 1 ? batchFamilies[0] : null;

    // Rubric scores
    let rubricRows = [];
    if (subIds.length > 0) {
      const { data: rr } = await admin
        .from('trn_submission_rubric_scores')
        .select('submission_id, criterion_key, criterion_score, max_criterion_score')
        .in('submission_id', subIds);
      rubricRows = rr ?? [];
    }
    console.log(`  ${rubricRows.length} rubric score rows`);

    const rubricBySub = new Map();
    for (const r of rubricRows) {
      if (!rubricBySub.has(r.submission_id)) rubricBySub.set(r.submission_id, []);
      rubricBySub.get(r.submission_id).push(r);
    }

    const outcomeRows = (subs ?? []).map(sub => {
      const rubric   = rubricBySub.get(sub.submission_id) ?? [];
      const byKey    = new Map(rubric.map(r => [r.criterion_key, r]));
      const scores   = {};
      let totalRubric = 0, maxRubric = 0, criteriaCount = 0;

      for (const key of CANONICAL_KEYS) {
        const r = byKey.get(key);
        scores[`${key}_score`] = r?.criterion_score ?? '';
        scores[`${key}_max`]   = r?.max_criterion_score ?? '';
        if (r) { totalRubric += Number(r.criterion_score); maxRubric += Number(r.max_criterion_score); criteriaCount++; }
      }

      const hasAll     = criteriaCount === CANONICAL_KEYS.length;
      const total2c3l  = hasAll && maxRubric > 0 ? Math.round(totalRubric / maxRubric * 10000) / 100 : '';
      const atRisk     = total2c3l !== '' ? (total2c3l < 65 ? 1 : 0) : '';
      const grade      = total2c3l !== '' ? deriveGrade(total2c3l) : '';
      const labelSrc   = criteriaCount === 0 ? 'no_rubric' : 'auto_generated';
      const labelVal   = criteriaCount === 0 ? 'invalid'   : 'pilot_only';

      const taskType    = typeByTid.get(sub.task_id) ?? '';
      const learningMode = taskType === 'sql_text' || taskType === 'stored_procedure' || taskType === 'coding_text'
        ? 'text_based'
        : taskType === 'sql_block' || taskType === 'er_diagram' || taskType === 'coding_block'
        ? 'block_based'
        : '';

      return {
        participant_code:    codeByPid.get(sub.profile_id) ?? sub.profile_id,
        batch_code:          BATCH_CODE,
        task_code:           codeByTid.get(sub.task_id) ?? sub.task_id,
        task_type:           taskType,
        set_family:          batchSetFamily ?? '',
        learning_mode:       learningMode,
        submission_id:       sub.submission_id,
        submitted_at:        sub.submitted_at ?? '',
        ...scores,
        total_rubric_score:  hasAll ? totalRubric : '',
        max_rubric_score:    hasAll ? maxRubric   : '',
        total_2c3l_score:    total2c3l,
        grade_letter:        grade,
        at_risk:             atRisk,
        label_source:        labelSrc,
        label_validity:      labelVal,
        is_teacher_reviewed: false,
        criteria_count:      criteriaCount,
      };
    });

    fs.writeFileSync(outcomeFile, toCsv(outcomeRows), 'utf8');
    console.log(`  Written: ${outcomeFile}`);

    const atRisk1  = outcomeRows.filter(r => r.at_risk === 1).length;
    const atRisk0  = outcomeRows.filter(r => r.at_risk === 0).length;
    const noRubric = outcomeRows.filter(r => r.label_source === 'no_rubric').length;
    console.log(`  at_risk=1: ${atRisk1}  at_risk=0: ${atRisk0}  no_rubric: ${noRubric}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Snapshot Export Summary ───────────────────────────────────────────');
for (const [label, f] of [['sequence', seqFile], ['attempt', attFile], ['session', sessFile], ['outcome', outcomeFile]]) {
  const exists = fs.existsSync(f);
  const size   = exists ? `${(fs.statSync(f).size / 1024).toFixed(1)} KB` : 'MISSING';
  console.log(`  ${label.padEnd(10)}: ${exists ? '✅' : '❌'}  ${path.basename(f)}  (${size})`);
}
console.log('\n⚠️  label_source=auto_generated / label_validity=pilot_only');
console.log('⚠️  These CSVs are gitignored. Do NOT commit.');
