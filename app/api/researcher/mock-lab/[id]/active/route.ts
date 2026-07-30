import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrResearcher } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try { await requireAdminOrResearcher(request); }
  catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }

  const { id } = await params;

  let body: { active: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("trn_mock_configs")
    .update({ active: body.active })
    .eq("id", id)
    .select("id, active")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Mock config not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, active: data.active });
}
