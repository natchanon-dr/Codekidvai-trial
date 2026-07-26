import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import { SET_FAMILY_VALUES, type SetFamily } from "@/lib/research-context";

// ---------------------------------------------------------------------------
// PATCH /api/researcher/mock-lab/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try { await requireAdminOrResearcher(request); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const allowed = ["name", "n_students", "at_risk_rate", "missing_rate",
                   "seed", "set_family", "task_type_counts", "task_set_id", "task_ids"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if ("set_family" in update && !SET_FAMILY_VALUES.includes(update.set_family as SetFamily)) {
    return NextResponse.json({ error: "Invalid set_family" }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("trn_mock_configs")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Mock config not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

// ---------------------------------------------------------------------------
// DELETE /api/researcher/mock-lab/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try { await requireAdminOrResearcher(request); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("trn_mock_configs")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
