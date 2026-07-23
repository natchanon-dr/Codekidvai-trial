import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DatasetRow = {
  id: string;
  code: string;
  name: string;
  batch_type: string;
  set_family: string;
  task_type: string;
  class_id: string | null;
  task_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type UpdateDatasetInput = {
  name?: string;
  class_id?: string | null;
  task_id?: string | null;
};

/** Locked fields that can never be changed after creation. */
const LOCKED_FIELDS = ["code", "batch_type", "set_family", "task_type"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine usage status.
 * Currently always "not_used" — no FK from sessions to mst_datasets yet.
 */
function resolveUsageStatus(_id: string): "used" | "not_used" {
  return "not_used";
}

async function fetchDataset(id: string): Promise<DatasetRow | null> {
  const { data, error } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, code, name, batch_type, set_family, task_type, class_id, task_id, active, created_at, updated_at, archived_at")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    code: String(data.code),
    name: String(data.name),
    batch_type: String(data.batch_type),
    set_family: String(data.set_family),
    task_type: String(data.task_type),
    class_id: data.class_id ? String(data.class_id) : null,
    task_id: data.task_id ? String(data.task_id) : null,
    active: Boolean(data.active),
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
    archived_at: data.archived_at ? String(data.archived_at) : null,
  };
}

// ---------------------------------------------------------------------------
// PATCH /:id — update dataset
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const dataset = await fetchDataset(id);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json() as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // Check for locked field update attempts
  const attemptedLocked = LOCKED_FIELDS.filter((f) => f in raw);
  if (attemptedLocked.length > 0) {
    return NextResponse.json(
      {
        error: `Fields [${attemptedLocked.join(", ")}] cannot be changed after creation. They are locked to preserve data integrity.`,
        locked_fields: attemptedLocked,
      },
      { status: 403 },
    );
  }

  const usageStatus = resolveUsageStatus(id);
  const isUsed = usageStatus === "used";

  // Build update payload
  const update: UpdateDatasetInput = {};
  const fieldErrors: Record<string, string> = {};

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) fieldErrors.name = "name cannot be empty.";
    else update.name = name;
  }

  if (isUsed) {
    // Used datasets: only name is editable
    const disallowedFields = (["class_id", "task_id"] as const).filter((f) => f in raw);
    if (disallowedFields.length > 0) {
      return NextResponse.json(
        {
          error: `Fields [${disallowedFields.join(", ")}] cannot be changed on a dataset that has been used in a run. Only 'name' can be updated.`,
          locked_fields: disallowedFields,
          usage_status: "used",
        },
        { status: 403 },
      );
    }
  } else {
    // Unused datasets: name, class_id, task_id are editable
    if ("class_id" in raw) {
      update.class_id = typeof raw.class_id === "string" ? raw.class_id : null;
    }
    if ("task_id" in raw) {
      update.task_id = typeof raw.task_id === "string" ? raw.task_id : null;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ error: "Validation failed.", field_errors: fieldErrors }, { status: 422 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("mst_datasets")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, code, name, batch_type, set_family, task_type, class_id, task_id, active, created_at, updated_at, archived_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Failed to update dataset." }, { status: 500 });
  }

  return NextResponse.json({
    dataset: {
      id: String(updated.id),
      code: String(updated.code),
      name: String(updated.name),
      batch_type: String(updated.batch_type),
      set_family: String(updated.set_family),
      task_type: String(updated.task_type),
      class_id: updated.class_id ? String(updated.class_id) : null,
      task_id: updated.task_id ? String(updated.task_id) : null,
      active: Boolean(updated.active),
      usage_status: usageStatus,
      created_at: String(updated.created_at),
      updated_at: String(updated.updated_at),
      archived_at: null,
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE /:id — soft-delete dataset
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const dataset = await fetchDataset(id);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  // Server-side recheck: refuse if used
  const usageStatus = resolveUsageStatus(id);
  if (usageStatus === "used") {
    return NextResponse.json(
      {
        error: "This dataset cannot be deleted because it has been used in one or more runs. Archive it instead.",
        usage_status: "used",
      },
      { status: 409 },
    );
  }

  // Soft-delete
  const { error: deleteError } = await supabaseAdmin
    .from("mst_datasets")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete dataset." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
