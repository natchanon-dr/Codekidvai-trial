import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// PATCH /:id/active — toggle dataset active status
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

  // Fetch current state
  const { data: current, error: fetchError } = await supabaseAdmin
    .from("mst_datasets")
    .select("id, active")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  const newActive = !Boolean(current.active);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("mst_datasets")
    .update({ active: newActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, active, updated_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Failed to toggle active status." }, { status: 500 });
  }

  return NextResponse.json({
    id: String(updated.id),
    active: Boolean(updated.active),
    updated_at: String(updated.updated_at),
  });
}
