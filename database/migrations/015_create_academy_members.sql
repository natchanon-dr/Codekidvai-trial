-- 015_create_academy_members.sql
-- Academy-scoped member IDs: S69056020+ for students, T69056020+ for teachers

create table if not exists public.mst_academy_members (
  academy_id       uuid          not null references public.tb_academy(academy_id) on delete cascade,
  participant_code varchar(100)  not null,
  academy_member_id varchar(50)  not null,
  created_at       timestamptz   not null default now(),
  primary key (academy_id, participant_code),
  constraint uq_academy_member_id unique (academy_member_id),
  constraint fk_academy_members_profile
    foreign key (participant_code)
    references public.mst_profiles(participant_code)
    on delete cascade on update cascade
);

-- RLS
alter table public.mst_academy_members enable row level security;

-- Authenticated users can read their own record
create policy "academy_members_read_own"
  on public.mst_academy_members for select to authenticated
  using (
    participant_code = (
      select participant_code from public.mst_profiles
      where auth_user_id = auth.uid()
      limit 1
    )
  );

-- Teachers/admins can read records for students in their classes
create policy "academy_members_teacher_read"
  on public.mst_academy_members for select to authenticated
  using (
    exists (
      select 1 from public.mst_profiles p
      where p.auth_user_id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );
