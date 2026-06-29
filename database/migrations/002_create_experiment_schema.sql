create table if not exists public.mst_experiment_batches (
    batch_id uuid primary key default gen_random_uuid(),
    batch_code varchar(50) unique not null,
    batch_name varchar(255) not null,
    batch_description text,
    batch_type varchar(30) not null default 'pilot',
    status varchar(30) not null default 'draft',
    start_at timestamptz,
    end_at timestamptz,
    created_by uuid references public.mst_profiles(profile_id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_experiment_batch_type check (batch_type in ('pilot','main','practice')),
    constraint chk_experiment_batch_status check (status in ('draft','active','closed','archived'))
);

create table if not exists public.trn_experiment_participants (
    experiment_participant_id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.mst_experiment_batches(batch_id) on delete cascade,
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    participant_group varchar(50),
    assigned_condition varchar(50),
    joined_at timestamptz not null default now(),
    completed_at timestamptz,
    status varchar(30) not null default 'assigned',
    created_at timestamptz not null default now(),
    unique(batch_id, profile_id),
    constraint chk_experiment_participant_status check (status in ('assigned','in_progress','completed','dropped'))
);

create table if not exists public.trn_task_assignments (
    assignment_id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.mst_experiment_batches(batch_id) on delete cascade,
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    task_id uuid not null references public.mst_tasks(task_id) on delete cascade,
    assigned_order int not null,
    assigned_group varchar(50),
    is_required boolean not null default true,
    is_unlocked boolean not null default true,
    status varchar(30) not null default 'assigned',
    assigned_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    unique(batch_id, profile_id, task_id),
    unique(batch_id, profile_id, assigned_order),
    constraint chk_task_assignment_status check (status in ('assigned','in_progress','completed','skipped'))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_learning_sessions_batch') then
    alter table public.trn_learning_sessions add constraint fk_learning_sessions_batch foreign key (batch_id) references public.mst_experiment_batches(batch_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_learning_sessions_assignment') then
    alter table public.trn_learning_sessions add constraint fk_learning_sessions_assignment foreign key (assignment_id) references public.trn_task_assignments(assignment_id) on delete set null;
  end if;
end $$;
