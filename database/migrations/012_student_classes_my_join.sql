-- Student My Class + Join Class: add columns, RLS, and grants

-- Add registration period + filtering columns to tb_classes (all idempotent)
alter table public.tb_classes
  add column if not exists register_from  timestamptz null,
  add column if not exists register_to    timestamptz null,
  add column if not exists learner_group  text null,
  add column if not exists class_level    text null;

-- Allow students to SELECT classes within their own academy.
-- Existing policy "teacher_select_own_classes" (from 008) already covers:
--   - teacher seeing own classes
--   - admin/researcher seeing all classes
-- This new policy adds academy-scoped access for students browsing available classes.
drop policy if exists "student_select_academy_classes" on public.tb_classes;
create policy "student_select_academy_classes"
on public.tb_classes for select to authenticated
using (
  academy_id in (
    select academy_id from public.mst_profiles
    where auth_user_id = auth.uid()
      and academy_id is not null
  )
);

-- Note: student membership visibility is already covered by the existing
-- "teacher_select_own_class_students" policy from 008, which includes:
--   profile_id in (select profile_id from mst_profiles where auth_user_id = auth.uid())
-- No additional policy on tb_class_students is needed.

-- GRANT authenticated SELECT for client-side queries (defense-in-depth).
-- tb_academy is granted in migration 011.
grant select on public.tb_classes to authenticated;
grant select on public.tb_class_students to authenticated;
