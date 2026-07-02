-- =============================================================================
-- Migration 010: Normalized Task Bank and Reusable Learning Sets
--
-- Goal:
--   Extend the platform schema to support a normalized task bank where tasks
--   are stored once and reused across multiple Assignment Sets and Exam Sets.
--
--   Key principle: fixed categorical values (task type, difficulty, set type,
--   status, etc.) are stored as foreign keys to master tables — never as
--   free-text strings directly in transaction or main tables.
--
-- Parts:
--   1. Create master lookup tables with seed values
--   2. Extend mst_tasks (task bank) with normalized columns
--   3. Extend mst_experiment_batches (learning sets) with normalized columns
--   4. Create mst_assignment_set_tasks mapping table
--
-- Safety rules:
--   - No tables are dropped.
--   - No data is deleted.
--   - No existing columns are removed or renamed.
--   - Old string columns (task_type, difficulty_level, task_status, batch_type,
--     status) are kept for backward compatibility.
--   - Uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   - Uses INSERT ... ON CONFLICT ... DO UPDATE for all seed data.
-- =============================================================================


-- =============================================================================
-- PART 1: Master Lookup Tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. mst_task_types
--    Defines supported task interaction formats.
--    task_type_id is the canonical FK used in mst_tasks.task_type_id.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_task_types (
    task_type_id   smallint      primary key,
    task_type_code varchar(50)   unique not null,
    task_type_name varchar(100)  not null,
    description    text,
    is_active      boolean       not null default true,
    created_at     timestamptz   not null default now(),
    updated_at     timestamptz   not null default now()
);

insert into public.mst_task_types (task_type_id, task_type_code, task_type_name, description)
values
    (1, 'SQL_TEXT',          'SQL Text-based Task',        'Student writes free-form SQL text as their answer.'),
    (2, 'SQL_BLOCK',         'SQL Block-based Task',        'Student assembles SQL by dragging/arranging keyword blocks.'),
    (3, 'STORED_PROCEDURE',  'Stored Procedure Task',       'Student writes or completes a stored procedure.'),
    (4, 'ER_DIAGRAM',        'ER Diagram Task',             'Student constructs or labels an ER diagram.')
on conflict (task_type_id) do update
    set task_type_code = excluded.task_type_code,
        task_type_name = excluded.task_type_name,
        description    = excluded.description,
        updated_at     = now();


-- ---------------------------------------------------------------------------
-- 2. mst_set_types
--    Defines the two learning set modes: Assignment Set (practice) and
--    Exam Set (summative). Controls downstream policy defaults.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_set_types (
    set_type_id   smallint      primary key,
    set_type_code varchar(50)   unique not null,
    set_type_name varchar(100)  not null,
    description   text,
    is_active     boolean       not null default true,
    created_at    timestamptz   not null default now(),
    updated_at    timestamptz   not null default now()
);

insert into public.mst_set_types (set_type_id, set_type_code, set_type_name, description)
values
    (1, 'ASSIGNMENT_SET', 'Assignment Set', 'Practice/homework/formative set. Students can run, retry, and see feedback.'),
    (2, 'EXAM_SET',       'Exam Set',       'Assessment/summative set. Single attempt, no immediate feedback or expected result shown.')
on conflict (set_type_id) do update
    set set_type_code = excluded.set_type_code,
        set_type_name = excluded.set_type_name,
        description   = excluded.description,
        updated_at    = now();


-- ---------------------------------------------------------------------------
-- 3. mst_difficulty_levels
--    Canonical difficulty scale. The old string column uses 'easy'/'medium'/'hard';
--    this table introduces a richer named scale (BEGINNER/INTERMEDIATE/ADVANCED).
-- ---------------------------------------------------------------------------
create table if not exists public.mst_difficulty_levels (
    difficulty_level_id   smallint      primary key,
    difficulty_code       varchar(50)   unique not null,
    difficulty_name       varchar(100)  not null,
    description           text,
    is_active             boolean       not null default true,
    created_at            timestamptz   not null default now(),
    updated_at            timestamptz   not null default now()
);

insert into public.mst_difficulty_levels (difficulty_level_id, difficulty_code, difficulty_name, description)
values
    (1, 'BEGINNER',     'Beginner',     'Entry-level tasks; no prior SQL knowledge required.'),
    (2, 'INTERMEDIATE', 'Intermediate', 'Requires basic SQL understanding; involves joins or filtering.'),
    (3, 'ADVANCED',     'Advanced',     'Requires deeper SQL knowledge; subqueries, procedures, or complex ER modeling.')
on conflict (difficulty_level_id) do update
    set difficulty_code = excluded.difficulty_code,
        difficulty_name = excluded.difficulty_name,
        description     = excluded.description,
        updated_at      = now();


-- ---------------------------------------------------------------------------
-- 4. mst_skill_areas
--    Fine-grained learning skill taxonomy used to tag tasks.
--    Enables analysis of which SQL/ER skills students struggle with.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_skill_areas (
    skill_area_id   smallint      primary key,
    skill_area_code varchar(50)   unique not null,
    skill_area_name varchar(100)  not null,
    description     text,
    is_active       boolean       not null default true,
    created_at      timestamptz   not null default now(),
    updated_at      timestamptz   not null default now()
);

insert into public.mst_skill_areas (skill_area_id, skill_area_code, skill_area_name)
values
    ( 1, 'SELECT_BASIC',               'Select Basic'),
    ( 2, 'WHERE_FILTER',               'Where Filter'),
    ( 3, 'ORDER_BY',                   'Order By'),
    ( 4, 'JOIN_BASIC',                 'Join Basic'),
    ( 5, 'MULTI_JOIN',                 'Multi Join'),
    ( 6, 'GROUP_BY',                   'Group By'),
    ( 7, 'HAVING',                     'Having'),
    ( 8, 'SUBQUERY',                   'Subquery'),
    ( 9, 'CASE_WHEN',                  'Case When'),
    (10, 'DATE_FUNCTION',              'Date Function'),
    (11, 'AGGREGATION',                'Aggregation'),
    (12, 'NULL_HANDLING',              'Null Handling'),
    (13, 'LEFT_JOIN',                  'Left Join'),
    (14, 'MIXED_SQL',                  'Mixed SQL'),
    (15, 'STORED_PROCEDURE_BASIC',     'Stored Procedure Basic'),
    (16, 'STORED_PROCEDURE_PARAMETER', 'Stored Procedure Parameter'),
    (17, 'STORED_PROCEDURE_CONDITION', 'Stored Procedure Condition'),
    (18, 'STORED_PROCEDURE_CURSOR',    'Stored Procedure Cursor'),
    (19, 'ER_ENTITY',                  'ER Entity'),
    (20, 'ER_RELATIONSHIP',            'ER Relationship'),
    (21, 'ER_CARDINALITY',             'ER Cardinality'),
    (22, 'ER_NORMALIZATION',           'ER Normalization'),
    (23, 'ER_FULL_MODEL',              'ER Full Model')
on conflict (skill_area_id) do update
    set skill_area_code = excluded.skill_area_code,
        skill_area_name = excluded.skill_area_name,
        updated_at      = now();


-- ---------------------------------------------------------------------------
-- 5. mst_feedback_policies
--    Controls when and how feedback (correct answer, score, explanation)
--    is revealed to the student after an attempt or submission.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_feedback_policies (
    feedback_policy_id   smallint      primary key,
    feedback_policy_code varchar(50)   unique not null,
    feedback_policy_name varchar(100)  not null,
    description          text,
    is_active            boolean       not null default true,
    created_at           timestamptz   not null default now(),
    updated_at           timestamptz   not null default now()
);

insert into public.mst_feedback_policies (feedback_policy_id, feedback_policy_code, feedback_policy_name, description)
values
    (1, 'IMMEDIATE',       'Immediate Feedback',        'Feedback shown immediately after each run or attempt (Assignment Set default).'),
    (2, 'TEACHER_ONLY',    'Teacher Only Feedback',     'Feedback visible only to teacher/admin (Exam Set default).'),
    (3, 'AFTER_SUBMIT',    'Feedback After Submit',     'Feedback shown to student only after they submit a final answer.'),
    (4, 'AFTER_DUE_DATE',  'Feedback After Due Date',   'Feedback released to all students after the set end date.')
on conflict (feedback_policy_id) do update
    set feedback_policy_code = excluded.feedback_policy_code,
        feedback_policy_name = excluded.feedback_policy_name,
        description          = excluded.description,
        updated_at           = now();


-- ---------------------------------------------------------------------------
-- 6. mst_attempt_policies
--    Controls how many attempts a student is allowed per task within a set.
--    max_attempts = null means unlimited.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_attempt_policies (
    attempt_policy_id   smallint      primary key,
    attempt_policy_code varchar(50)   unique not null,
    attempt_policy_name varchar(100)  not null,
    max_attempts        int,           -- null = unlimited
    description         text,
    is_active           boolean       not null default true,
    created_at          timestamptz   not null default now(),
    updated_at          timestamptz   not null default now()
);

insert into public.mst_attempt_policies (attempt_policy_id, attempt_policy_code, attempt_policy_name, max_attempts, description)
values
    (1, 'MULTIPLE_ATTEMPTS', 'Multiple Attempts', null, 'Unlimited attempts allowed (Assignment Set default).'),
    (2, 'SINGLE_ATTEMPT',    'Single Attempt',    1,    'Exactly one attempt allowed (Exam Set default).'),
    (3, 'LIMITED_ATTEMPTS',  'Limited Attempts',  3,    'Up to three attempts allowed.')
on conflict (attempt_policy_id) do update
    set attempt_policy_code = excluded.attempt_policy_code,
        attempt_policy_name = excluded.attempt_policy_name,
        max_attempts        = excluded.max_attempts,
        description         = excluded.description,
        updated_at          = now();


-- ---------------------------------------------------------------------------
-- 7. mst_visibility_policies
--    Controls who can see attempt results and scores.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_visibility_policies (
    visibility_policy_id   smallint      primary key,
    visibility_policy_code varchar(50)   unique not null,
    visibility_policy_name varchar(100)  not null,
    description            text,
    is_active              boolean       not null default true,
    created_at             timestamptz   not null default now(),
    updated_at             timestamptz   not null default now()
);

insert into public.mst_visibility_policies (visibility_policy_id, visibility_policy_code, visibility_policy_name, description)
values
    (1, 'STUDENT_AND_TEACHER',    'Student and Teacher',    'Results visible to both student and teacher (Assignment Set default).'),
    (2, 'TEACHER_ONLY',           'Teacher Only',           'Results visible to teacher/admin only (Exam Set default).'),
    (3, 'STUDENT_AFTER_RELEASE',  'Student After Release',  'Results revealed to student after teacher manually releases them.')
on conflict (visibility_policy_id) do update
    set visibility_policy_code = excluded.visibility_policy_code,
        visibility_policy_name = excluded.visibility_policy_name,
        description            = excluded.description,
        updated_at             = now();


-- ---------------------------------------------------------------------------
-- 8. mst_statuses
--    Unified status dictionary keyed by (status_group, status_code).
--    status_group scopes the status to a specific entity type so that
--    task statuses, set statuses, assignment statuses, etc. stay separate.
-- ---------------------------------------------------------------------------
create table if not exists public.mst_statuses (
    status_id     smallint      primary key,
    status_group  varchar(50)   not null,
    status_code   varchar(50)   not null,
    status_name   varchar(100)  not null,
    description   text,
    is_active     boolean       not null default true,
    created_at    timestamptz   not null default now(),
    updated_at    timestamptz   not null default now(),
    unique(status_group, status_code)
);

insert into public.mst_statuses (status_id, status_group, status_code, status_name)
values
    ( 1, 'GENERAL',    'ACTIVE',       'Active'),
    ( 2, 'GENERAL',    'INACTIVE',     'Inactive'),
    ( 3, 'TASK',       'DRAFT',        'Draft'),
    ( 4, 'TASK',       'PUBLISHED',    'Published'),
    ( 5, 'TASK',       'ARCHIVED',     'Archived'),
    ( 6, 'SET',        'DRAFT',        'Draft'),
    ( 7, 'SET',        'ACTIVE',       'Active'),
    ( 8, 'SET',        'CLOSED',       'Closed'),
    ( 9, 'ASSIGNMENT', 'ASSIGNED',     'Assigned'),
    (10, 'ASSIGNMENT', 'IN_PROGRESS',  'In Progress'),
    (11, 'ASSIGNMENT', 'COMPLETED',    'Completed'),
    (12, 'SUBMISSION', 'DRAFT',        'Draft'),
    (13, 'SUBMISSION', 'SUBMITTED',    'Submitted'),
    (14, 'SUBMISSION', 'GRADED',       'Graded')
on conflict (status_id) do update
    set status_group = excluded.status_group,
        status_code  = excluded.status_code,
        status_name  = excluded.status_name,
        updated_at   = now();


-- =============================================================================
-- PART 2: Extend mst_tasks as a Normalized Task Bank
--
-- The existing mst_tasks table stores tasks with free-text categorical columns
-- (task_type, difficulty_level, task_status). We add normalized FK columns
-- alongside the old columns; old columns are NOT dropped.
--
-- New content columns support all four task types:
--   SQL/SP tasks: expected_sql, expected_procedure, sample_data_json
--   ER tasks:     expected_er_model_json
--   All tasks:    instruction_text, hint_json, explanation_text,
--                 grading_rules_json, answer_format_json, metadata_json
-- =============================================================================

-- Sequential display number (useful for ordered task lists in admin UI)
alter table public.mst_tasks
    add column if not exists task_no bigint generated by default as identity;

-- Normalized FK to mst_task_types (replaces free-text task_type)
alter table public.mst_tasks
    add column if not exists task_type_id smallint
        references public.mst_task_types(task_type_id);

-- Normalized FK to mst_difficulty_levels (replaces free-text difficulty_level)
alter table public.mst_tasks
    add column if not exists difficulty_level_id smallint
        references public.mst_difficulty_levels(difficulty_level_id);

-- Normalized FK to mst_skill_areas (new; no equivalent old column)
alter table public.mst_tasks
    add column if not exists skill_area_id smallint
        references public.mst_skill_areas(skill_area_id);

-- Normalized FK to mst_statuses with status_group = 'TASK'
alter table public.mst_tasks
    add column if not exists task_status_id smallint
        references public.mst_statuses(status_id);

-- Instruction text shown to student (may differ from or supplement problem_statement)
alter table public.mst_tasks
    add column if not exists instruction_text text;

-- Reference/teacher SQL answer for SQL_TEXT and SQL_BLOCK task types
-- (problem_statement holds the question; expected_sql holds the model answer)
alter table public.mst_tasks
    add column if not exists expected_sql text;

-- Reference stored procedure for STORED_PROCEDURE task type
alter table public.mst_tasks
    add column if not exists expected_procedure text;

-- Reference ER diagram model (JSON representation) for ER_DIAGRAM task type
alter table public.mst_tasks
    add column if not exists expected_er_model_json jsonb;

-- Hints shown to students in Assignment Sets only (array of hint strings)
-- Example: {"hints": ["Start with SELECT *", "Use FROM students"]}
alter table public.mst_tasks
    add column if not exists hint_json jsonb;

-- Post-answer explanation shown after submission or feedback release
alter table public.mst_tasks
    add column if not exists explanation_text text;

-- Grading criteria rules (partial credit, keyword matching, exact match, etc.)
-- Example: {"strategy": "exact_match", "case_sensitive": false}
alter table public.mst_tasks
    add column if not exists grading_rules_json jsonb;

-- Required output format/columns for answer validation
-- Example: {"required_columns": ["student_id", "name"]}
alter table public.mst_tasks
    add column if not exists answer_format_json jsonb;

-- Research/tagging metadata (concepts, bloom level, research tags)
-- Supplements existing research_tags jsonb column without replacing it
alter table public.mst_tasks
    add column if not exists metadata_json jsonb;

-- ---------------------------------------------------------------------------
-- Backfill: populate new normalized FK columns from existing string columns
-- ---------------------------------------------------------------------------

-- task_type_id from task_type string
update public.mst_tasks set task_type_id = 1
    where task_type_id is null
      and task_type = 'sql_text';

update public.mst_tasks set task_type_id = 2
    where task_type_id is null
      and task_type = 'sql_block';

update public.mst_tasks set task_type_id = 3
    where task_type_id is null
      and task_type = 'stored_procedure';

update public.mst_tasks set task_type_id = 4
    where task_type_id is null
      and task_type = 'er_diagram';

-- Fallback: infer from task_code prefix when task_type is null
update public.mst_tasks set task_type_id = 1
    where task_type_id is null
      and task_type is null
      and task_code ilike 'SQL_TEXT%';

update public.mst_tasks set task_type_id = 2
    where task_type_id is null
      and task_type is null
      and task_code ilike 'SQL_BLOCK%';

-- difficulty_level_id from difficulty_level string
-- Covers both old values ('easy'/'medium'/'hard') and new naming ('beginner'/etc.)
update public.mst_tasks set difficulty_level_id = 1
    where difficulty_level_id is null
      and difficulty_level in ('easy', 'beginner');

update public.mst_tasks set difficulty_level_id = 2
    where difficulty_level_id is null
      and difficulty_level in ('medium', 'intermediate');

update public.mst_tasks set difficulty_level_id = 3
    where difficulty_level_id is null
      and difficulty_level in ('hard', 'advanced');

-- task_status_id from task_status string
update public.mst_tasks set task_status_id = 3
    where task_status_id is null
      and task_status = 'draft';

update public.mst_tasks set task_status_id = 4
    where task_status_id is null
      and task_status = 'published';

update public.mst_tasks set task_status_id = 5
    where task_status_id is null
      and task_status = 'archived';

-- Default: if task_status_id is still null but task is active, treat as published
update public.mst_tasks set task_status_id = 4
    where task_status_id is null
      and is_active = true;

-- Backfill expected_sql from existing expected_answer where task is SQL type
update public.mst_tasks set expected_sql = expected_answer
    where expected_sql is null
      and expected_answer is not null
      and task_type_id in (1, 2);


-- =============================================================================
-- PART 3: Extend mst_experiment_batches as Reusable Learning Sets
--
-- mst_experiment_batches acts as the set header for both Assignment Sets and
-- Exam Sets. We add policy FK columns and boolean flags alongside old columns.
-- The existing check constraints on batch_type and status are preserved.
--
-- Policy columns on the set header define defaults for all tasks in the set.
-- Per-task overrides can be applied via mst_assignment_set_tasks if needed.
-- =============================================================================

-- Sequential display number
alter table public.mst_experiment_batches
    add column if not exists batch_no bigint generated by default as identity;

-- Normalized FK to mst_set_types (replaces free-text batch_type for set mode)
alter table public.mst_experiment_batches
    add column if not exists set_type_id smallint
        references public.mst_set_types(set_type_id);

-- Feedback policy: when/to whom is feedback shown
alter table public.mst_experiment_batches
    add column if not exists feedback_policy_id smallint
        references public.mst_feedback_policies(feedback_policy_id);

-- Attempt policy: how many attempts students are allowed
alter table public.mst_experiment_batches
    add column if not exists attempt_policy_id smallint
        references public.mst_attempt_policies(attempt_policy_id);

-- Visibility policy: who can see results
alter table public.mst_experiment_batches
    add column if not exists visibility_policy_id smallint
        references public.mst_visibility_policies(visibility_policy_id);

-- Normalized FK to mst_statuses with status_group = 'SET'
alter table public.mst_experiment_batches
    add column if not exists status_id smallint
        references public.mst_statuses(status_id);

-- Whether students can run/test their answer before submitting
alter table public.mst_experiment_batches
    add column if not exists allow_run boolean;

-- Whether students can attempt more than once
alter table public.mst_experiment_batches
    add column if not exists allow_multiple_attempts boolean;

-- Whether the expected result/output is shown to the student after running
alter table public.mst_experiment_batches
    add column if not exists show_expected_result boolean;

-- Whether the student's score is shown immediately (vs. teacher-release only)
alter table public.mst_experiment_batches
    add column if not exists show_score_to_student boolean;

-- Whether hints from hint_json are surfaced to the student
alter table public.mst_experiment_batches
    add column if not exists show_hint boolean;

-- Additional set-level metadata (tags, research conditions, etc.)
alter table public.mst_experiment_batches
    add column if not exists metadata_json jsonb;

-- ---------------------------------------------------------------------------
-- Backfill: set_type_id from existing batch_type string
-- Existing values in the check constraint: 'pilot', 'main', 'practice'.
-- None of these map to 'exam_set', so all existing rows default to Assignment Set.
-- ---------------------------------------------------------------------------
update public.mst_experiment_batches set set_type_id = 1
    where set_type_id is null
      and batch_type in ('pilot', 'main', 'practice');

-- Handle future rows that might use explicit type strings
update public.mst_experiment_batches set set_type_id = 1
    where set_type_id is null
      and batch_type = 'assignment_set';

update public.mst_experiment_batches set set_type_id = 2
    where set_type_id is null
      and batch_type = 'exam_set';

-- Default: any remaining null → Assignment Set
update public.mst_experiment_batches set set_type_id = 1
    where set_type_id is null;

-- status_id from existing status string
update public.mst_experiment_batches set status_id = 6
    where status_id is null
      and status = 'draft';

update public.mst_experiment_batches set status_id = 7
    where status_id is null
      and status = 'active';

update public.mst_experiment_batches set status_id = 8
    where status_id is null
      and status = 'closed';

-- 'archived' in the old constraint maps to closest SET status = CLOSED
update public.mst_experiment_batches set status_id = 8
    where status_id is null
      and status = 'archived';

-- ---------------------------------------------------------------------------
-- Backfill policy columns based on resolved set_type_id
-- Assignment Set (set_type_id = 1): open, immediate, student-visible
-- Exam Set (set_type_id = 2): restricted, teacher-only, no hints
-- ---------------------------------------------------------------------------
update public.mst_experiment_batches
set
    feedback_policy_id    = 1,   -- IMMEDIATE
    attempt_policy_id     = 1,   -- MULTIPLE_ATTEMPTS
    visibility_policy_id  = 1,   -- STUDENT_AND_TEACHER
    allow_run             = true,
    allow_multiple_attempts = true,
    show_expected_result  = true,
    show_score_to_student = true,
    show_hint             = true
where set_type_id = 1
  and feedback_policy_id is null;

update public.mst_experiment_batches
set
    feedback_policy_id    = 2,   -- TEACHER_ONLY
    attempt_policy_id     = 2,   -- SINGLE_ATTEMPT
    visibility_policy_id  = 2,   -- TEACHER_ONLY
    allow_run             = true,
    allow_multiple_attempts = false,
    show_expected_result  = false,
    show_score_to_student = false,
    show_hint             = false
where set_type_id = 2
  and feedback_policy_id is null;


-- =============================================================================
-- PART 4: Task-to-Set Mapping Table (mst_assignment_set_tasks)
--
-- Links tasks from the task bank to specific Assignment Sets or Exam Sets.
-- A task can appear in multiple sets; a set can contain many tasks.
-- Per-set overrides for max_score and time_limit allow the same task to be
-- used with different scoring or timing across different sets.
-- =============================================================================

create table if not exists public.mst_assignment_set_tasks (
    -- Surrogate primary key
    set_task_id    uuid     primary key default gen_random_uuid(),

    -- Sequential order number for admin display
    set_task_no    bigint   generated by default as identity,

    -- The learning set this entry belongs to (Assignment Set or Exam Set)
    batch_id       uuid     not null references public.mst_experiment_batches(batch_id) on delete cascade,

    -- The task from the task bank included in this set
    task_id        uuid     not null references public.mst_tasks(task_id) on delete cascade,

    -- Display/navigation order within the set
    task_order     int      not null default 1,

    -- Whether completion of this task is mandatory for the student
    is_required    boolean  not null default true,

    -- Whether this inclusion is currently active (soft-disable without deletion)
    is_active      boolean  not null default true,

    -- Optional per-set score override; null means use mst_tasks.max_score
    max_score_override         numeric(10,2),

    -- Optional per-set time limit override; null means use mst_tasks.time_limit_seconds
    time_limit_seconds_override int,

    -- Extra per-mapping metadata (e.g., presentation notes, research conditions)
    metadata_json  jsonb,

    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    -- A task may appear in the same set only once
    unique(batch_id, task_id)
);

comment on table public.mst_assignment_set_tasks is
    'Maps tasks from the task bank (mst_tasks) to learning sets (mst_experiment_batches). '
    'A task can be reused across multiple Assignment Sets and Exam Sets. '
    'Per-set score and time overrides are supported at the mapping level.';

comment on column public.mst_assignment_set_tasks.batch_id is
    'FK to mst_experiment_batches. Identifies the Assignment Set or Exam Set.';

comment on column public.mst_assignment_set_tasks.task_id is
    'FK to mst_tasks. The reusable task from the central task bank.';

comment on column public.mst_assignment_set_tasks.max_score_override is
    'Overrides mst_tasks.max_score for this specific set. Null = use task default.';

comment on column public.mst_assignment_set_tasks.time_limit_seconds_override is
    'Overrides mst_tasks.time_limit_seconds for this specific set. Null = use task default.';
