import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ─── Label maps ───────────────────────────────────────────────────────────────

const LEARNER_GROUP_LABELS: Record<string, string> = {
  G1: "Youth",
  G2: "High School",
  G3: "Undergraduate",
  G4: "General Public",
};

const LEVEL_LABELS: Record<string, string> = {
  L1: "Beginner",
  L2: "Foundation",
  L3: "Intermediate",
  L4: "Advanced",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchRow = {
  batch_id: string;
  batch_code: string;
  batch_name: string;
  batch_type: string | null;
  set_type_id?: number | null;
  task_family_code: string | null;
};

type ClassRow = {
  class_id: string;
  class_code: string;
  class_name: string;
  class_level: string | null;
  learner_group: string | null;
  academic_year: string | null;
  term: string | null;
  teacher_profile_id: string;
};

type ClassSetRow = {
  class_id: string;
  batch_id: string;
  family: string;
};

// ─── Batch family fallback (used only when tb_class_sets.family is unknown) ──

function getBatchFamily(batch: BatchRow): "assignment" | "lab" | "exam" {
  const code = (batch.batch_code ?? "").toUpperCase();
  const isLab =
    batch.batch_type === "lab_set" ||
    code.startsWith("SL") ||
    (code.startsWith("L") && !code.startsWith("LA"));
  if (isLab) return "lab";
  const isAssignment =
    batch.set_type_id === 1 ||
    batch.batch_type === "assignment_set" ||
    code.startsWith("SA") ||
    code.startsWith("A");
  if (isAssignment) return "assignment";
  return "exam";
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAuthenticatedProfile(request);
    if (profile.role !== "student") throw new Error("Student role is required.");

    // ── 1. Active class memberships ──
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from("tb_class_students")
      .select(
        "class_id, tb_classes(class_id, class_code, class_name, class_level, learner_group, academic_year, term, teacher_profile_id)",
      )
      .eq("profile_id", profile.profile_id)
      .eq("status", "active");
    if (memberError) throw memberError;
    if (!memberships || memberships.length === 0) return NextResponse.json([]);

    const classIds = memberships
      .map((m) => (m.tb_classes as unknown as ClassRow | null)?.class_id)
      .filter((id): id is string => Boolean(id));

    // ── 2. Teacher display names ──
    const teacherIds = [
      ...new Set(
        memberships
          .map((m) => (m.tb_classes as unknown as ClassRow | null)?.teacher_profile_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const teacherMap = new Map<string, string>();
    if (teacherIds.length > 0) {
      const { data: teachers } = await supabaseAdmin
        .from("mst_profiles")
        .select("profile_id, display_name")
        .in("profile_id", teacherIds);
      for (const t of teachers ?? []) {
        if (t.display_name) teacherMap.set(t.profile_id, t.display_name);
      }
    }

    // ── 3. Class-to-set mapping from tb_class_sets (authoritative) ──
    const { data: classSetsData, error: classSetsError } = await supabaseAdmin
      .from("tb_class_sets")
      .select("class_id, batch_id, family")
      .in("class_id", classIds);
    if (classSetsError) throw classSetsError;

    const classSets = (classSetsData ?? []) as ClassSetRow[];
    const allBatchIds = [...new Set(classSets.map((cs) => cs.batch_id))];

    // ── 4. Task assignment progress for this student ──
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from("trn_task_assignments")
      .select("batch_id, status")
      .eq("profile_id", profile.profile_id);
    if (assignError) throw assignError;

    const totalMap = new Map<string, number>();
    const doneMap = new Map<string, number>();
    for (const a of assignments ?? []) {
      if (!a.batch_id) continue;
      totalMap.set(a.batch_id, (totalMap.get(a.batch_id) ?? 0) + 1);
      if (a.status === "completed") doneMap.set(a.batch_id, (doneMap.get(a.batch_id) ?? 0) + 1);
    }

    // ── 5. Batch details for all linked batches ──
    const batchMap = new Map<string, BatchRow>();
    if (allBatchIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("mst_experiment_batches")
        .select("batch_id, batch_code, batch_name, batch_type, set_type_id, task_family_code")
        .in("batch_id", allBatchIds);

      let rows: BatchRow[];
      if (error?.code === "42703") {
        // set_type_id column missing — fallback select
        const { data: data2 } = await supabaseAdmin
          .from("mst_experiment_batches")
          .select("batch_id, batch_code, batch_name, batch_type, task_family_code")
          .in("batch_id", allBatchIds);
        rows = (data2 ?? []) as BatchRow[];
      } else {
        rows = (data ?? []) as BatchRow[];
      }
      for (const b of rows) batchMap.set(b.batch_id, b);
    }

    // ── 6. Build per-class result using tb_class_sets (not created_by) ──
    const result = memberships
      .map((membership) => {
        const cls = membership.tb_classes as unknown as ClassRow | null;
        if (!cls) return null;

        const grouped: Record<"assignment" | "lab" | "exam", BatchRow[]> = {
          assignment: [],
          lab: [],
          exam: [],
        };

        const setsForClass = classSets.filter((cs) => cs.class_id === cls.class_id);

        for (const cs of setsForClass) {
          const batch = batchMap.get(cs.batch_id);
          if (!batch) continue;

          // Use tb_class_sets.family as authoritative source
          const family: "assignment" | "lab" | "exam" =
            cs.family === "assignment" || cs.family === "lab" || cs.family === "exam"
              ? cs.family
              : getBatchFamily(batch); // fallback only if db value is unexpected

          grouped[family].push(batch);
        }

        function toItem(batch: BatchRow) {
          return {
            batch_id: batch.batch_id,
            batch_code: batch.batch_code,
            batch_name: batch.batch_name,
            batch_type: batch.batch_type ?? null,
            set_type_id: batch.set_type_id ?? null,
            task_family_code: batch.task_family_code ?? null,
            total_tasks: totalMap.get(batch.batch_id) ?? 0,
            done_tasks: doneMap.get(batch.batch_id) ?? 0,
          };
        }

        return {
          class_id: cls.class_id,
          class_code: cls.class_code,
          class_name: cls.class_name,
          learner_group: cls.learner_group,
          learner_group_label: cls.learner_group
            ? (LEARNER_GROUP_LABELS[cls.learner_group] ?? cls.learner_group)
            : null,
          class_level: cls.class_level,
          class_level_label: cls.class_level
            ? (LEVEL_LABELS[cls.class_level] ?? cls.class_level)
            : null,
          academic_year: cls.academic_year,
          term: cls.term,
          teacher_name: teacherMap.get(cls.teacher_profile_id) ?? null,
          total_assignment_sets: grouped.assignment.length,
          total_lab_sets: grouped.lab.length,
          total_exam_sets: grouped.exam.length,
          sets: {
            assignment: grouped.assignment.map(toItem),
            lab: grouped.lab.map(toItem),
            exam: grouped.exam.map(toItem),
          },
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch dashboard." },
      { status: 400 },
    );
  }
}
