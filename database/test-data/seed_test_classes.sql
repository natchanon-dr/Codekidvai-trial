-- ============================================================
-- TEST DATA: Student My Class + Join Class E2E Tests
-- Target: local dev / Supabase SQL Editor only
-- DO NOT run in production.
-- Idempotent: safe to run multiple times.
-- ============================================================
--
-- Learner group codes (mst_learner_groups):
--   G1 = Youth
--   G2 = High School
--   G3 = Undergraduate
--   G4 = General Public
--
-- Class level codes:
--   L1 = Beginner
--   L2 = Foundation
--   L3 = Intermediate
--   L4 = Advanced
-- ============================================================

do $$
declare
  v_academy_id  uuid := '0f0d74d4-de28-4093-a54e-02b53c940136';
  v_teacher_id  uuid;
begin

  -- ── 1. Resolve teacher profile ─────────────────────────────
  -- Prefer a teacher in the same KMITL academy.
  select profile_id into v_teacher_id
  from public.mst_profiles
  where role = 'teacher'
    and academy_id = v_academy_id
  order by created_at
  limit 1;

  -- Fall back to any teacher in the system.
  if v_teacher_id is null then
    select profile_id into v_teacher_id
    from public.mst_profiles
    where role = 'teacher'
    order by created_at
    limit 1;
  end if;

  if v_teacher_id is null then
    raise exception
      'No teacher profile found. '
      'Create a teacher account first, then re-run this script.';
  end if;

  raise notice 'Using teacher_profile_id = %', v_teacher_id;

  -- ── 2. Insert test classes ─────────────────────────────────
  -- Pattern:
  --   insert … select … where not exists (select 1 from tb_classes where class_code = '…')
  -- Idempotent: skips rows whose class_code already exists.

  -- ── 2A. OPEN class — G2 (High School) / L1 / no registration window ──
  insert into public.tb_classes (
    academy_id, teacher_profile_id,
    class_code, class_name, enrollment_code,
    learner_group, class_level,
    is_active, is_open_for_enrollment,
    register_from, register_to
  )
  select
    v_academy_id, v_teacher_id,
    'TEST-HS-L1-OPEN', 'Test High School Beginner Open', 'TEST-HS-L1-OPEN',
    'G2', 'L1',
    true, true,
    null, null
  where not exists (
    select 1 from public.tb_classes where class_code = 'TEST-HS-L1-OPEN'
  );

  -- ── 2B. EXPIRED class — G2 (High School) / L1 / window closed yesterday ──
  -- register_to = yesterday → app logic blocks join AND leave.
  insert into public.tb_classes (
    academy_id, teacher_profile_id,
    class_code, class_name, enrollment_code,
    learner_group, class_level,
    is_active, is_open_for_enrollment,
    register_from, register_to
  )
  select
    v_academy_id, v_teacher_id,
    'TEST-HS-L1-EXP', 'Test High School Beginner Expired', 'TEST-HS-L1-EXP',
    'G2', 'L1',
    true, true,
    now() - interval '30 days',
    now() - interval '1 day'
  where not exists (
    select 1 from public.tb_classes where class_code = 'TEST-HS-L1-EXP'
  );

  -- ── 2C. FUTURE class — G2 (High School) / L2 / window opens tomorrow ──
  -- register_from = tomorrow → join blocked (not yet open).
  insert into public.tb_classes (
    academy_id, teacher_profile_id,
    class_code, class_name, enrollment_code,
    learner_group, class_level,
    is_active, is_open_for_enrollment,
    register_from, register_to
  )
  select
    v_academy_id, v_teacher_id,
    'TEST-HS-L2-FUTURE', 'Test High School Foundation Future', 'TEST-HS-L2-FUTURE',
    'G2', 'L2',
    true, true,
    now() + interval '1 day',
    now() + interval '30 days'
  where not exists (
    select 1 from public.tb_classes where class_code = 'TEST-HS-L2-FUTURE'
  );

  -- ── 2D. G1 (Youth) / L1 / open ──
  insert into public.tb_classes (
    academy_id, teacher_profile_id,
    class_code, class_name, enrollment_code,
    learner_group, class_level,
    is_active, is_open_for_enrollment,
    register_from, register_to
  )
  select
    v_academy_id, v_teacher_id,
    'TEST-YOUTH-L1-OPEN', 'Test Youth Beginner Open', 'TEST-YOUTH-L1-OPEN',
    'G1', 'L1',
    true, true,
    null, null
  where not exists (
    select 1 from public.tb_classes where class_code = 'TEST-YOUTH-L1-OPEN'
  );

  -- ── 2E. G3 (Undergraduate) / L3 / open ──
  insert into public.tb_classes (
    academy_id, teacher_profile_id,
    class_code, class_name, enrollment_code,
    learner_group, class_level,
    is_active, is_open_for_enrollment,
    register_from, register_to
  )
  select
    v_academy_id, v_teacher_id,
    'TEST-UG-L3-OPEN', 'Test Undergraduate Intermediate Open', 'TEST-UG-L3-OPEN',
    'G3', 'L3',
    true, true,
    null, null
  where not exists (
    select 1 from public.tb_classes where class_code = 'TEST-UG-L3-OPEN'
  );

  -- ── 2F. G4 (General Public) / L4 / open ──
  insert into public.tb_classes (
    academy_id, teacher_profile_id,
    class_code, class_name, enrollment_code,
    learner_group, class_level,
    is_active, is_open_for_enrollment,
    register_from, register_to
  )
  select
    v_academy_id, v_teacher_id,
    'TEST-GP-L4-OPEN', 'Test General Public Advanced Open', 'TEST-GP-L4-OPEN',
    'G4', 'L4',
    true, true,
    null, null
  where not exists (
    select 1 from public.tb_classes where class_code = 'TEST-GP-L4-OPEN'
  );

  raise notice 'Test classes inserted (or already existed). Run verification queries below.';

end $$;


-- ============================================================
-- VERIFICATION QUERIES
-- Run each block independently in Supabase SQL Editor.
-- ============================================================

-- V1. List all inserted test classes with key fields.
select
  c.class_code,
  c.class_name,
  c.learner_group,
  lg.learner_group_name,
  c.class_level,
  c.is_active,
  c.is_open_for_enrollment,
  c.register_from,
  c.register_to
from public.tb_classes c
left join public.mst_learner_groups lg on lg.learner_group_code = c.learner_group
where c.class_code like 'TEST-%'
order by c.class_code;


-- V2. Confirm all test classes belong to KMITL academy.
select
  c.class_code,
  a.academy_code,
  a.academy_name,
  c.academy_id = '0f0d74d4-de28-4093-a54e-02b53c940136' as is_kmitl
from public.tb_classes c
join public.tb_academy a on a.academy_id = c.academy_id
where c.class_code like 'TEST-%'
order by c.class_code;


-- V3. Joinability check: show whether each class is currently
--     within its registration window.
--     Expected: OPEN=true, EXPIRED=false, FUTURE=false.
select
  class_code,
  register_from,
  register_to,
  (
    (register_from is null or register_from <= now())
    and
    (register_to   is null or register_to   >= now())
  ) as is_joinable_now
from public.tb_classes
where class_code like 'TEST-%'
order by class_code;


-- V4. Verify OPEN class is joinable.
select
  class_code,
  is_open_for_enrollment,
  (register_from is null or register_from <= now()) as from_ok,
  (register_to   is null or register_to   >= now()) as to_ok
from public.tb_classes
where class_code = 'TEST-HS-L1-OPEN';
-- Expected: is_open_for_enrollment=true, from_ok=true, to_ok=true


-- V5. Verify EXPIRED class is NOT joinable.
select
  class_code,
  register_from,
  register_to,
  (
    (register_from is null or register_from <= now())
    and
    (register_to   is null or register_to   >= now())
  ) as is_joinable_now
from public.tb_classes
where class_code = 'TEST-HS-L1-EXP';
-- Expected: is_joinable_now=false  (register_to is yesterday)


-- V6. Verify FUTURE class is NOT joinable yet.
select
  class_code,
  register_from,
  register_to,
  (
    (register_from is null or register_from <= now())
    and
    (register_to   is null or register_to   >= now())
  ) as is_joinable_now
from public.tb_classes
where class_code = 'TEST-HS-L2-FUTURE';
-- Expected: is_joinable_now=false  (register_from is tomorrow)


-- V7. Verify learner_group coverage with labels from master table.
select
  c.learner_group,
  lg.learner_group_name,
  count(*) as class_count,
  array_agg(c.class_code order by c.class_code) as codes
from public.tb_classes c
left join public.mst_learner_groups lg on lg.learner_group_code = c.learner_group
where c.class_code like 'TEST-%'
group by c.learner_group, lg.learner_group_name
order by c.learner_group;
-- Expected: G1/Youth, G2/High School, G3/Undergraduate, G4/General Public


-- V8. Verify class_level coverage.
select
  class_level,
  count(*) as class_count,
  array_agg(class_code order by class_code) as codes
from public.tb_classes
where class_code like 'TEST-%'
group by class_level
order by class_level;
-- Expected: L1 (3 classes), L2, L3, L4 each appear


-- V9. Cleanup helper (run only when test data is no longer needed).
-- Remove memberships first (FK constraint), then the classes.
-- UNCOMMENT to execute:
/*
delete from public.tb_class_students
where class_id in (
  select class_id from public.tb_classes where class_code like 'TEST-%'
);

delete from public.tb_classes
where class_code like 'TEST-%';
*/
