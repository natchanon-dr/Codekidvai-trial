/**
 * Block Journey Generator — Phase 5 M5.2
 *
 * Generates synthetic block event sequences for sql_block task simulation.
 * Used by: e2e-sim-student-flow.mjs (via dynamic import), unit tests.
 *
 * Server-side only — pure function, no DB or RLS calls.
 * Must remain import-safe from Node.js MJS scripts (no Next.js-only globals).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockEventType = "block_add" | "block_delete" | "block_move";

export interface BlockJourneyEvent {
  /** "block_add" | "block_delete" | "block_move" */
  event_type: BlockEventType;
  /** Block identifier (e.g. mst_blocks.block_id, or a mock vocab key) */
  block_id: string;
  /** Client-generated UUID — stable per placed instance across move/delete */
  block_instance_id: string;
  /** 0-indexed final position for block_move; null for add/delete */
  position: number | null;
  /** Seconds elapsed since session start */
  duration_from_start: number;
}

export interface BlockJourneyParams {
  /** All block IDs available in the task's block pool */
  blockPool: string[];
  /** Ordered block IDs representing the correct solution (subset of blockPool) */
  correctSequence: string[];
  /** Drives journey complexity — at-risk → exploratory, more ops */
  isAtRisk: boolean;
  /** Seeded RNG — () => [0, 1). Use mulberry32 for determinism. */
  rng: () => number;
  /** Session wall-clock cap in seconds (events stay within this range) */
  maxDurationSeconds?: number;
}

// ── Pure deterministic UUID generator ────────────────────────────────────────

/** Generates a UUID v4-like string from the provided seeded rng. */
function pseudoUuid(rng: () => number): string {
  const h = () => Math.floor(rng() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${["8", "9", "a", "b"][Math.floor(rng() * 4)]}${h().slice(1)}-${h()}${h()}${h()}`;
}

// ── Core generator ────────────────────────────────────────────────────────────

/**
 * Generates a synthetic block event sequence for one sql_block session.
 *
 * Non-risk pattern: linear add → occasional single reorder → correct final state.
 * At-risk pattern:  add (mix of correct+wrong) → delete (confusion) → move → wrong final state.
 *
 * The returned array is ordered by duration_from_start ascending.
 * Each event carries a stable block_instance_id so downstream analysis can
 * track the same block across move/delete events.
 */
export function generateBlockJourney(params: BlockJourneyParams): BlockJourneyEvent[] {
  const {
    blockPool,
    correctSequence,
    isAtRisk,
    rng,
    maxDurationSeconds = 600,
  } = params;

  if (blockPool.length === 0) return [];

  const events: BlockJourneyEvent[] = [];

  // Workspace: tracks currently placed blocks with their stable instance IDs.
  const workspace: Array<{ block_id: string; instance_id: string }> = [];

  // Monotonic clock for duration_from_start — spread across 5–90% of session.
  const startFrac = 0.05 + rng() * 0.15;
  const endFrac   = 0.60 + rng() * 0.30;
  let   currentTime = Math.floor(startFrac * maxDurationSeconds);
  const timeEnd     = Math.floor(endFrac   * maxDurationSeconds);

  function advanceTime(minGap: number, maxGap: number): number {
    const gap   = minGap + Math.floor(rng() * Math.max(1, maxGap - minGap));
    currentTime = Math.min(currentTime + gap, timeEnd);
    return currentTime;
  }

  function addBlock(blockId: string): void {
    const instance_id = pseudoUuid(rng);
    workspace.push({ block_id: blockId, instance_id });
    events.push({
      event_type:        "block_add",
      block_id:          blockId,
      block_instance_id: instance_id,
      position:          null,
      duration_from_start: advanceTime(3, 15),
    });
  }

  function deleteBlock(workspaceIdx: number): void {
    const item = workspace[workspaceIdx];
    if (!item) return;
    workspace.splice(workspaceIdx, 1);
    events.push({
      event_type:        "block_delete",
      block_id:          item.block_id,
      block_instance_id: item.instance_id,
      position:          null,
      duration_from_start: advanceTime(2, 10),
    });
  }

  function moveBlock(fromIdx: number, toIdx: number): void {
    if (fromIdx === toIdx || workspace.length < 2) return;
    const item = workspace[fromIdx];
    if (!item) return;
    workspace.splice(fromIdx, 1);
    workspace.splice(toIdx, 0, item);
    events.push({
      event_type:        "block_move",
      block_id:          item.block_id,
      block_instance_id: item.instance_id,
      position:          toIdx,
      duration_from_start: advanceTime(2, 8),
    });
  }

  // ── Journey simulation ──────────────────────────────────────────────────────

  const solution = correctSequence.length > 0
    ? correctSequence
    : blockPool.slice(0, Math.min(3, blockPool.length));

  if (!isAtRisk) {
    // ── Non-risk: linear, near-correct ────────────────────────────────────────
    // Add solution blocks in order.
    for (const bid of solution) {
      addBlock(bid);
    }
    // 30% chance: one misplacement then correction (shows some uncertainty).
    if (workspace.length >= 2 && rng() < 0.3) {
      const last = workspace.length - 1;
      moveBlock(last, last - 1);       // displace last two
      if (rng() < 0.7) {
        moveBlock(last - 1, last);     // fix back
      }
    }

  } else {
    // ── At-risk: exploratory, confusion pattern ────────────────────────────────
    // Adds 4–8 blocks (mix of correct + wrong), deletes some, moves, ends incomplete.
    const targetAdds = 4 + Math.floor(rng() * 5);
    const wrongPool  = blockPool.filter((b) => !solution.includes(b));

    for (let i = 0; i < targetAdds; i++) {
      // 40% chance of adding a wrong block (if pool has one).
      if (wrongPool.length > 0 && rng() < 0.4) {
        addBlock(wrongPool[Math.floor(rng() * wrongPool.length)]);
      } else {
        addBlock(solution[Math.floor(rng() * Math.max(1, solution.length))] ?? blockPool[0]);
      }
    }

    // Delete 1–3 blocks (confusion: removes some correct ones too).
    const deleteCount = 1 + Math.floor(rng() * Math.min(3, Math.max(1, workspace.length - 1)));
    for (let d = 0; d < deleteCount && workspace.length > 1; d++) {
      deleteBlock(Math.floor(rng() * workspace.length));
    }

    // Move 1–2 times (incorrect reordering).
    const moveCount = 1 + Math.floor(rng() * 2);
    for (let m = 0; m < moveCount && workspace.length >= 2; m++) {
      const fromIdx = Math.floor(rng() * workspace.length);
      const toIdx   = Math.floor(rng() * workspace.length);
      if (fromIdx !== toIdx) moveBlock(fromIdx, toIdx);
    }
  }

  return events;
}

/**
 * Returns the final ordered block_id list from the workspace after a journey.
 * Convenience: derive from events by replaying — or call this alongside generateBlockJourney
 * by tracking workspace state externally.
 *
 * NOTE: This replays the event sequence from scratch; O(n²) — only for small mock sets.
 */
export function deriveWorkspaceBlockIds(events: BlockJourneyEvent[]): string[] {
  const workspace: Array<{ block_id: string; instance_id: string }> = [];

  for (const ev of events) {
    if (ev.event_type === "block_add") {
      workspace.push({ block_id: ev.block_id, instance_id: ev.block_instance_id });
    } else if (ev.event_type === "block_delete") {
      const idx = workspace.findIndex((w) => w.instance_id === ev.block_instance_id);
      if (idx !== -1) workspace.splice(idx, 1);
    } else if (ev.event_type === "block_move" && ev.position !== null) {
      const fromIdx = workspace.findIndex((w) => w.instance_id === ev.block_instance_id);
      if (fromIdx !== -1) {
        const [item] = workspace.splice(fromIdx, 1);
        workspace.splice(ev.position, 0, item);
      }
    }
  }

  return workspace.map((w) => w.block_id);
}

// ── Mock block vocabulary ─────────────────────────────────────────────────────

/**
 * 8 canonical SQL clause block identifiers used when real mst_blocks rows
 * are not available (offline tests, generate_mock_data.py, dummy tasks).
 * These are stored verbatim in trn_event_logs.metadata_json.block_id —
 * they are NOT foreign keys and do NOT need to exist in mst_blocks.
 */
export const SQL_BLOCK_VOCAB: readonly string[] = [
  "BLK_SELECT",
  "BLK_FROM",
  "BLK_WHERE",
  "BLK_JOIN",
  "BLK_GROUP_BY",
  "BLK_HAVING",
  "BLK_ORDER_BY",
  "BLK_LIMIT",
];

/**
 * Canonical 3-block correct solution: SELECT → FROM → WHERE.
 * Used by generate_mock_data.py and e2e-sim-student-flow.mjs for dummy sql_block tasks.
 */
export const SQL_BLOCK_CORRECT_SEQUENCE: readonly string[] = [
  "BLK_SELECT",
  "BLK_FROM",
  "BLK_WHERE",
];
