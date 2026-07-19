-- Normalize learner_group: introduce mst_learner_groups master table
-- and migrate tb_classes.learner_group from long-text to G1-G4 codes.
--
-- Safe to run multiple times (fully idempotent).
-- Do NOT modify already-applied migrations 008-012.

-- ── 1. Create master table ─────────────────────────────────────────────────────
create table if not exists public.mst_learner_groups (
  learner_group_code        text primary key,
  learner_group_name        text not null,
  learner_group_description text null,
  sort_order                integer not null,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now()
);

-- ── 2. Seed G1-G4 (idempotent) ────────────────────────────────────────────────
insert into public.mst_learner_groups
  (learner_group_code, learner_group_name, learner_group_description, sort_order)
values
  ('G1', 'Youth',          'Learners younger than High School',      1),
  ('G2', 'High School',    'High School students',                    2),
  ('G3', 'Undergraduate',  'Undergraduate university students',       3),
  ('G4', 'General Public', 'General public learners',                 4)
on conflict (learner_group_code) do update
  set learner_group_name        = excluded.learner_group_name,
      learner_group_description = excluded.learner_group_description,
      sort_order                = excluded.sort_order;

-- ── 3. Backfill old long-text values → G1-G4 in tb_classes ───────────────────
update public.tb_classes
set learner_group = case learner_group
  when 'YOUTH'          then 'G1'
  when 'HIGH_SCHOOL'    then 'G2'
  when 'UNDERGRADUATE'  then 'G3'
  when 'GENERAL_PUBLIC' then 'G4'
  else learner_group
end
where learner_group in ('YOUTH', 'HIGH_SCHOOL', 'UNDERGRADUATE', 'GENERAL_PUBLIC');

-- ── 4. Add FK constraint (skip if already exists) ─────────────────────────────
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'tb_classes'
      and constraint_name = 'fk_tb_classes_learner_group'
  ) then
    alter table public.tb_classes
      add constraint fk_tb_classes_learner_group
      foreign key (learner_group)
      references public.mst_learner_groups (learner_group_code);
  end if;
end $$;

-- ── 5. Grant SELECT to authenticated ──────────────────────────────────────────
grant select on public.mst_learner_groups to authenticated;
