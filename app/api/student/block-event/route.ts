import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile, getBearerToken, createUserClient } from "@/lib/api-auth";
import { calculateDurationFromStart, getOwnedLearningSession } from "@/lib/server-dataset-utils";
import type { BlockEventInput, BlockEventResult, BlockEventType } from "@/types/dataset";

const VALID_BLOCK_EVENT_TYPES: readonly BlockEventType[] = [
  "block_add",
  "block_delete",
  "block_move",
] as const;

function isBlockEventType(value: unknown): value is BlockEventType {
  return typeof value === "string" && (VALID_BLOCK_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * POST /api/student/block-event
 *
 * Records a single block-manipulation event (block_add | block_delete | block_move)
 * with a server-authoritative, atomically allocated event_order.
 *
 * Atomicity guarantee:
 *   The insert_block_event DB function acquires a session-scoped advisory lock,
 *   computes max(event_order)+1 inside the lock, and inserts — all in one DB
 *   transaction. This eliminates the race condition in the client-side count+1
 *   pattern when rapid interactions emit events concurrently.
 *
 * block_submit (token 9) is intentionally NOT accepted here. Final answer
 * submission is captured by the existing submit_answer event pair (Phase 4
 * contract). See notebooks/PHASE5_BLOCK_EVENT_CONTRACT_v1.md §4.
 *
 * Request body (BlockEventInput):
 *   session_id          string (UUID)   — must be owned by the caller
 *   task_id             string (UUID)
 *   event_type          "block_add" | "block_delete" | "block_move"
 *   block_instance_id   string (UUID)   — client-generated; stable across move/delete
 *   block_id            string (UUID)   — mst_blocks.block_id
 *   position?           number | null   — 0-indexed final position (block_move only)
 *   duration_from_start number          — seconds since session.started_at
 *   metadata_json?      object | null   — extra structured context
 *
 * Response (BlockEventResult):
 *   event_id    string   — UUID of the newly created trn_event_logs row
 *   event_order number   — server-allocated monotonic sequence number
 */
export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const profile = await requireAuthenticatedProfile(request);
    const userClient = createUserClient(token);

    // ── Parse and validate body ──────────────────────────────────────────────

    let body: Partial<BlockEventInput> & Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const { session_id, task_id, event_type, block_instance_id, block_id } = body;

    if (typeof session_id !== "string" || !session_id) {
      return NextResponse.json({ error: "session_id is required." }, { status: 400 });
    }
    if (typeof task_id !== "string" || !task_id) {
      return NextResponse.json({ error: "task_id is required." }, { status: 400 });
    }
    if (!isBlockEventType(event_type)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${VALID_BLOCK_EVENT_TYPES.join(", ")}.` },
        { status: 400 },
      );
    }
    if (typeof block_instance_id !== "string" || !block_instance_id) {
      return NextResponse.json({ error: "block_instance_id is required." }, { status: 400 });
    }
    if (typeof block_id !== "string" || !block_id) {
      return NextResponse.json({ error: "block_id is required." }, { status: 400 });
    }

    const position =
      typeof body.position === "number" ? body.position : null;
    const incomingDuration =
      typeof body.duration_from_start === "number" ? body.duration_from_start : null;
    const incomingMetadata =
      body.metadata_json && typeof body.metadata_json === "object" && !Array.isArray(body.metadata_json)
        ? (body.metadata_json as Record<string, unknown>)
        : null;

    // ── Verify session ownership (defence-in-depth before RPC call) ──────────
    //    getOwnedLearningSession throws if the session is not found or is not
    //    owned by profile_id. This avoids an unnecessary DB round-trip inside
    //    insert_block_event when ownership cannot be satisfied.
    const session = await getOwnedLearningSession(
      { session_id, profile_id: profile.profile_id, task_id },
      userClient,
    );

    // ── Compute server-side duration if client did not supply one ─────────────
    const durationFromStart =
      incomingDuration !== null
        ? incomingDuration
        : calculateDurationFromStart(session.started_at);

    // ── Build metadata_json ──────────────────────────────────────────────────
    //    block_instance_id and block_id are canonical Phase 5 fields and are
    //    always stored in metadata_json regardless of what the client sends.
    const metadataJson: Record<string, unknown> = {
      ...incomingMetadata,
      block_id,
      block_instance_id,
      ...(position !== null && event_type === "block_move" ? { position } : {}),
    };

    // ── Atomic insert via DB advisory-lock RPC ───────────────────────────────
    const { data, error } = await userClient.rpc("insert_block_event", {
      p_session_id: session_id,
      p_profile_id: profile.profile_id,
      p_task_id: task_id,
      p_event_type: event_type,
      p_event_value: block_instance_id, // event_value stores the instance identifier
      p_duration_from_start: durationFromStart,
      p_metadata_json: metadataJson,
    });

    if (error) {
      // Surface errcode-specific messages as 400 / 403 rather than generic 500
      if (error.code === "insufficient_privilege") {
        return NextResponse.json({ error: "Session not found or not owned by current user." }, { status: 403 });
      }
      if (error.code === "invalid_parameter_value") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    // insert_block_event returns a single-row SETOF; Supabase RPC wraps it in an array.
    const row = Array.isArray(data) ? (data[0] as BlockEventResult | undefined) : null;
    if (!row?.event_id || row.event_order == null) {
      throw new Error("insert_block_event returned unexpected shape.");
    }

    return NextResponse.json<BlockEventResult>({
      event_id: row.event_id,
      event_order: row.event_order,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Block event insert failed." },
      { status: 500 },
    );
  }
}
