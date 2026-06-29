create extension if not exists pgcrypto;

create table if not exists public.mst_profiles (
    profile_id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique not null references auth.users(id) on delete cascade,
    participant_code varchar(100) unique not null,
    role varchar(30) not null default 'student',
    display_name varchar(255),
    grade_level varchar(50),
    school_type varchar(100),
    consent_accepted boolean not null default false,
    consent_accepted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_mst_profiles_role check (role in ('student', 'teacher', 'admin', 'researcher'))
);

create table if not exists public.mst_courses (
    course_id uuid primary key default gen_random_uuid(),
    course_code varchar(50) unique not null,
    course_title varchar(255) not null,
    course_description text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.mst_lessons (
    lesson_id uuid primary key default gen_random_uuid(),
    course_id uuid not null references public.mst_courses(course_id) on delete cascade,
    lesson_code varchar(50) not null,
    lesson_title varchar(255) not null,
    lesson_description text,
    display_order int not null default 1,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(course_id, lesson_code)
);

create table if not exists public.mst_tasks (
    task_id uuid primary key default gen_random_uuid(),
    lesson_id uuid references public.mst_lessons(lesson_id) on delete set null,
    task_code varchar(100) unique not null,
    task_title varchar(255) not null,
    task_description text,
    task_type varchar(50) not null,
    difficulty_level varchar(30) not null default 'easy',
    learning_objective text,
    problem_statement text,
    database_schema_json jsonb,
    sample_data_json jsonb,
    expected_output_json jsonb,
    scoring_rubric_json jsonb,
    research_tags jsonb,
    prerequisite_concepts jsonb,
    expected_answer text,
    expected_concept text,
    max_score numeric(10,2) not null default 100,
    time_limit_seconds int,
    estimated_time_seconds int,
    task_status varchar(30) not null default 'draft',
    version_no int not null default 1,
    source_task_id uuid references public.mst_tasks(task_id) on delete set null,
    is_active boolean not null default true,
    published_at timestamptz,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_mst_tasks_task_type check (task_type in ('sql_text','sql_block','er_diagram','stored_procedure','coding_text','coding_block')),
    constraint chk_mst_tasks_difficulty check (difficulty_level in ('easy','medium','hard')),
    constraint chk_mst_tasks_status check (task_status in ('draft','published','archived'))
);

create table if not exists public.mst_blocks (
    block_id uuid primary key default gen_random_uuid(),
    task_id uuid not null references public.mst_tasks(task_id) on delete cascade,
    block_code varchar(100) not null,
    block_label varchar(255) not null,
    block_value text not null,
    block_type varchar(50) not null,
    display_order int not null default 1,
    correct_order int,
    is_correct_part boolean,
    distractor_group varchar(100),
    feedback_text text,
    metadata_json jsonb,
    created_at timestamptz not null default now(),
    unique(task_id, block_code)
);

create table if not exists public.trn_learning_sessions (
    session_id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    task_id uuid not null references public.mst_tasks(task_id) on delete cascade,
    batch_id uuid,
    assignment_id uuid,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    last_event_at timestamptz,
    duration_seconds int,
    status varchar(30) not null default 'started',
    device_type varchar(100),
    browser_name varchar(100),
    user_agent text,
    created_at timestamptz not null default now(),
    constraint chk_learning_session_status check (status in ('started','in_progress','completed','abandoned'))
);

create table if not exists public.trn_event_logs (
    event_id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.trn_learning_sessions(session_id) on delete cascade,
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    task_id uuid not null references public.mst_tasks(task_id) on delete cascade,
    event_order int not null,
    event_type varchar(50) not null,
    event_value text,
    duration_from_start int,
    event_time timestamptz not null default now(),
    metadata_json jsonb,
    created_at timestamptz not null default now(),
    unique(session_id, event_order)
);

create table if not exists public.trn_attempts (
    attempt_id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.trn_learning_sessions(session_id) on delete cascade,
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    task_id uuid not null references public.mst_tasks(task_id) on delete cascade,
    attempt_no int not null,
    attempt_type varchar(30) not null,
    answer_text text,
    answer_json jsonb,
    is_correct boolean,
    score numeric(10,2),
    error_type varchar(100),
    error_message text,
    execution_time_ms int,
    created_at timestamptz not null default now(),
    constraint chk_attempt_type check (attempt_type in ('run','check','submit')),
    unique(session_id, attempt_no)
);

create table if not exists public.trn_submissions (
    submission_id uuid primary key default gen_random_uuid(),
    session_id uuid not null unique references public.trn_learning_sessions(session_id) on delete cascade,
    profile_id uuid not null references public.mst_profiles(profile_id) on delete cascade,
    task_id uuid not null references public.mst_tasks(task_id) on delete cascade,
    final_answer_text text,
    final_answer_json jsonb,
    final_score numeric(10,2),
    is_passed boolean,
    submitted_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table if not exists public.trn_dataset_exports (
    export_id uuid primary key default gen_random_uuid(),
    export_name varchar(255) not null,
    export_type varchar(100) not null,
    exported_by uuid references public.mst_profiles(profile_id) on delete set null,
    filter_json jsonb,
    row_count int,
    created_at timestamptz not null default now()
);
