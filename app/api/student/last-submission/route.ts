import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile, getBearerToken, createUserClient } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) throw new Error("Missing authorization token.");
    const profile = await requireAuthenticatedProfile(request);
    const userClient = createUserClient(token);

    const taskId = request.nextUrl.searchParams.get("taskId");
    const batchId = request.nextUrl.searchParams.get("batchId");
    if (!taskId) throw new Error("Missing taskId.");

    let query = userClient
      .from("trn_submissions")
      .select("final_answer_text, final_score, is_passed, total_run_count, total_attempt_count")
      .eq("profile_id", profile.profile_id)
      .eq("task_id", taskId);

    if (batchId) query = query.eq("batch_id", batchId);

    const { data, error } = await query
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      final_answer_text: data?.final_answer_text ?? null,
      final_score: data?.final_score ?? null,
      is_passed: data?.is_passed ?? null,
      total_run_count: data?.total_run_count ?? 0,
      total_attempt_count: data?.total_attempt_count ?? 0,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 400 });
  }
}
