-- Migration 029: Assign academy_member_id to the MAQT0003 mock cohort
--
-- Mirrors the existing logic in app/api/admin/seed-academy-members/route.ts
-- (STUDENT_BASE = 69056020, format 'S' + running number, upsert ignoring
-- duplicates) but scoped to the MAQT0003_S001..025 mock students only,
-- continuing the sequence after the 5 profiles already seeded
-- (S69056020-S69056024) — so this batch gets S69056025..S69056049.
--
-- Does not touch any existing row (ON CONFLICT DO NOTHING). Does not
-- create new profiles — only links existing mst_profiles rows (role=
-- 'student', participant_code like 'MAQT0003_S%') to the KMITL academy.

INSERT INTO public.mst_academy_members (academy_id, participant_code, academy_member_id)
SELECT
  (SELECT academy_id FROM public.tb_academy WHERE academy_code = 'KMITL'),
  p.participant_code,
  'S' || (69056024 + ROW_NUMBER() OVER (ORDER BY p.created_at))::text
FROM public.mst_profiles p
WHERE p.role = 'student'
  AND p.participant_code LIKE 'MAQT0003_S%'
ON CONFLICT (academy_id, participant_code) DO NOTHING;

-- ── Rollback ──────────────────────────────────────────────────────────────────
--
-- DELETE FROM public.mst_academy_members
-- WHERE participant_code LIKE 'MAQT0003_S%'
--   AND academy_member_id BETWEEN 'S69056025' AND 'S69056049';
