create table if not exists public.tb_academy (
    academy_id uuid primary key default gen_random_uuid(),
    academy_code varchar(100) unique not null,
    academy_name varchar(255) not null,
    academy_description text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.mst_profiles
add column if not exists academy_id uuid references public.tb_academy(academy_id) on delete set null,
add column if not exists student_academy_code varchar(100),
add column if not exists student_status varchar(30) not null default 'active';

create table if not exists public.tb_classes (
    class_id uuid primary key default gen_random_uuid(),
    academy_id uuid references public.tb_academy(academy_id) on delete set null,
    teacher_profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    class_code varchar(100) not null,
    class_name varchar(255) not null,
    class_level varchar(100),
    class_section varchar(100),
    academic_year varchar(20),
    term varchar(20),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(teacher_profile_id, class_code, academic_year, term)
);

create table if not exists public.tb_class_students (
    class_student_id uuid primary key default gen_random_uuid(),
    class_id uuid not null references public.tb_classes(class_id) on delete cascade,
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    student_academy_code varchar(100),
    status varchar(30) not null default 'active',
    joined_at timestamptz not null default now(),
    left_at timestamptz,
    created_at timestamptz not null default now(),
    unique(class_id, profile_id)
);

create index if not exists idx_tb_classes_teacher_active
on public.tb_classes(teacher_profile_id, is_active);

create index if not exists idx_tb_class_students_class_status
on public.tb_class_students(class_id, status);

create index if not exists idx_tb_class_students_profile
on public.tb_class_students(profile_id);

alter table public.tb_academy enable row level security;
alter table public.tb_classes enable row level security;
alter table public.tb_class_students enable row level security;

drop policy if exists "academy_select_authenticated" on public.tb_academy;
create policy "academy_select_authenticated"
on public.tb_academy for select to authenticated
using (true);

drop policy if exists "teacher_select_own_classes" on public.tb_classes;
create policy "teacher_select_own_classes"
on public.tb_classes for select to authenticated
using (
  teacher_profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid())
  or public.is_admin_or_researcher()
);

drop policy if exists "teacher_select_own_class_students" on public.tb_class_students;
create policy "teacher_select_own_class_students"
on public.tb_class_students for select to authenticated
using (
  class_id in (
    select c.class_id
    from public.tb_classes c
    join public.mst_profiles p on c.teacher_profile_id = p.profile_id
    where p.auth_user_id = auth.uid()
  )
  or profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid())
  or public.is_admin_or_researcher()
);

grant usage on schema public to service_role;
grant all privileges on public.tb_academy to service_role;
grant all privileges on public.tb_classes to service_role;
grant all privileges on public.tb_class_students to service_role;
