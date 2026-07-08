-- Migration 014: tb_class_sets
-- Stores which sets (assignment/lab/exam) belong to a class,
-- independent of student enrollment. When a student joins the class,
-- the join route auto-assigns tasks from these sets to the student.

CREATE TABLE IF NOT EXISTS tb_class_sets (
  class_set_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     uuid        NOT NULL REFERENCES tb_classes(class_id) ON DELETE CASCADE,
  batch_id     uuid        NOT NULL REFERENCES mst_experiment_batches(batch_id) ON DELETE CASCADE,
  family       text        NOT NULL CHECK (family IN ('assignment', 'lab', 'exam')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, batch_id)
);

-- Index for fast class-based lookups
CREATE INDEX IF NOT EXISTS idx_class_sets_class_id ON tb_class_sets(class_id);

-- RLS: service role has full access (API uses supabaseAdmin)
ALTER TABLE tb_class_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON tb_class_sets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
