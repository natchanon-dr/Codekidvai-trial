/**
 * Teacher Review confirmatory gate (M5.33).
 *
 * The thesis sample plan is 60 unique participants (30 experimental / 30
 * control). These tests lock in that the gate counts unique participants,
 * not learner-batch records, and stays closed while the experimental/control
 * split is not recorded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock("@/lib/api-auth", () => ({
  requireAdminOrResearcher: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    }),
  },
}));

import { GET } from "@/app/api/researcher/teacher-review/route";

const CRITERIA = [
  "c1_correctness_result",
  "c2_semantic_consistency",
  "l1_logical_reasoning",
  "l2_learning_process",
  "l3_difficulty_complexity",
];

type Submission = { submission_id: string; profile_id: string; batch_id: string; review_status: string };

function makeChain(result: { data: unknown; error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

/** Fully scored, teacher-reviewed submissions for the given (profile, batch) pairs. */
function setupMocks(pairs: Array<{ profile_id: string; batch_id: string }>) {
  const submissions: Submission[] = pairs.map((p, i) => ({
    submission_id: `sub-${i}`,
    profile_id: p.profile_id,
    batch_id: p.batch_id,
    review_status: "completed",
  }));
  const rubricRows = submissions.flatMap((s) =>
    CRITERIA.map((criterion_key) => ({
      submission_id: s.submission_id,
      criterion_key,
      criterion_score: 4,
      max_criterion_score: 5,
    })),
  );
  const profiles = [...new Set(pairs.map((p) => p.profile_id))].map((profile_id) => ({
    profile_id,
    participant_code: `PC-${profile_id}`,
  }));
  const batches = [...new Set(pairs.map((p) => p.batch_id))].map((batch_id) => ({
    batch_id,
    batch_code: `B-${batch_id}`,
  }));

  const byTable: Record<string, unknown> = {
    trn_submissions: submissions,
    trn_submission_rubric_scores: rubricRows,
    mst_profiles: profiles,
    mst_experiment_batches: batches,
  };
  mockFrom.mockImplementation((table: string) => makeChain({ data: byTable[table] ?? [], error: null }));
}

function makeRequest() {
  return { headers: { get: () => "Bearer test-token" } } as unknown as import("next/server").NextRequest;
}

type Summary = {
  total_learner_batches: number;
  total_participants: number;
  teacher_reviewed: number;
  teacher_reviewed_participants: number;
  threshold_target: number;
  participant_threshold_met: boolean;
  group_split_verified: boolean;
  confirmatory_ready: boolean;
};

async function getSummary(): Promise<Summary> {
  const res = (await GET(makeRequest())) as unknown as { _body: { summary: Summary }; _status: number };
  expect(res._status).toBe(200);
  return res._body.summary;
}

describe("GET /api/researcher/teacher-review — confirmatory gate", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("counts a learner reviewed in several batches as one participant", async () => {
    setupMocks([
      { profile_id: "p1", batch_id: "b1" },
      { profile_id: "p1", batch_id: "b2" },
      { profile_id: "p1", batch_id: "b3" },
    ]);
    const sm = await getSummary();
    expect(sm.teacher_reviewed).toBe(3);
    expect(sm.total_learner_batches).toBe(3);
    expect(sm.teacher_reviewed_participants).toBe(1);
    expect(sm.total_participants).toBe(1);
  });

  it("60 learner-batch records from 20 participants do not meet the participant threshold", async () => {
    const pairs = Array.from({ length: 60 }, (_, i) => ({
      profile_id: `p${i % 20}`,
      batch_id: `b${Math.floor(i / 20)}`,
    }));
    setupMocks(pairs);
    const sm = await getSummary();
    expect(sm.teacher_reviewed).toBe(60);
    expect(sm.teacher_reviewed_participants).toBe(20);
    expect(sm.threshold_target).toBe(60);
    expect(sm.participant_threshold_met).toBe(false);
    expect(sm.confirmatory_ready).toBe(false);
  });

  it("stays closed with 60 unique participants while the 30/30 split is not recorded", async () => {
    const pairs = Array.from({ length: 60 }, (_, i) => ({ profile_id: `p${i}`, batch_id: "b1" }));
    setupMocks(pairs);
    const sm = await getSummary();
    expect(sm.teacher_reviewed_participants).toBe(60);
    expect(sm.participant_threshold_met).toBe(true);
    expect(sm.group_split_verified).toBe(false);
    expect(sm.confirmatory_ready).toBe(false);
  });
});
