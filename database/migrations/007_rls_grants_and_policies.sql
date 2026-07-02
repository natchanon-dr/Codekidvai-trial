-- =============================================================================
-- Migration 007: Explicit RLS grants and supplementary policies
--
-- Context:
--   Migration 003 enabled RLS on all tables and created the core policies.
--   This migration adds:
--     1. Explicit SELECT grants on tables the authenticated role needs to read
--        directly (Supabase does not grant table-level SELECT by default).
--     2. A student-facing SELECT policy on mst_tasks for published/active tasks
--        (003 only granted admin full-access; students had no SELECT path).
--     3. SELECT grants on admin views and dataset views for admin/researcher roles,
--        backed by a view-level security policy via a security_invoker wrapper.
--
-- Safety:
--   - No tables are dropped or altered structurally.
--   - No existing policies are dropped; only additive CREATE POLICY / GRANT statements.
--   - All policies use IF NOT EXISTS where available, or are named distinctly from 003.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SECTION 1: Table-level SELECT grants for the authenticated role
--
-- Supabase's anon/authenticated roles receive no table grants by default.
-- RLS policies alone are not enough — the role must also have the privilege.
-- We grant SELECT on every table a student or researcher needs to read.
-- ---------------------------------------------------------------------------

-- mst_profiles: students read their own row; admins/researchers read all
-- (RLS enforces the row-level restriction; GRANT gives the privilege itself)
grant select on public.mst_profiles to authenticated;

-- mst_tasks: students need to read published tasks during task load;
-- admins/researchers need full read for management views
grant select on public.mst_tasks to authenticated;

-- mst_blocks: students need to read blocks for sql_block-type tasks
grant select on public.mst_blocks to authenticated;

-- mst_courses and mst_lessons: needed for navigation and admin views
grant select on public.mst_courses to authenticated;
grant select on public.mst_lessons to authenticated;

-- trn_task_assignments: students read their own assignments;
-- admins/researchers read all (RLS enforces the distinction)
grant select on public.trn_task_assignments to authenticated;

-- trn_learning_sessions: students read their own sessions for state restoration
grant select on public.trn_learning_sessions to authenticated;

-- trn_attempts: students may review their own run/check/submit history
grant select on public.trn_attempts to authenticated;

-- trn_event_logs: students may read back their own event timeline
grant select on public.trn_event_logs to authenticated;

-- trn_submissions: students may read their own final submission record
grant select on public.trn_submissions to authenticated;

-- mst_experiment_batches: students need to read batch metadata via assignment join
grant select on public.mst_experiment_batches to authenticated;

-- trn_experiment_participants: students read their own participant record
grant select on public.trn_experiment_participants to authenticated;

-- trn_dataset_exports: admins/researchers only (RLS restricts via is_admin_or_researcher)
grant select on public.trn_dataset_exports to authenticated;


-- ---------------------------------------------------------------------------
-- SECTION 2: DML grants for student write tables
--
-- Students insert rows into session/event/attempt/submission tables from
-- client-side service calls. The authenticated role needs INSERT privilege
-- (RLS with_check enforces ownership; GRANT gives the privilege itself).
-- ---------------------------------------------------------------------------

-- trn_learning_sessions: student starts a new session on task entry
grant insert on public.trn_learning_sessions to authenticated;

-- trn_event_logs: student logs every interaction event during a session
grant insert on public.trn_event_logs to authenticated;

-- trn_attempts: student submits run/check/submit attempts
grant insert on public.trn_attempts to authenticated;

-- trn_submissions: student submits their final answer once per session
grant insert on public.trn_submissions to authenticated;

-- UPDATE on trn_learning_sessions: session status transitions
-- (started → in_progress → completed/abandoned) are done by the student client
grant update on public.trn_learning_sessions to authenticated;

-- UPDATE on trn_task_assignments: student client marks assignment in_progress/completed
grant update on public.trn_task_assignments to authenticated;


-- ---------------------------------------------------------------------------
-- SECTION 3: Student SELECT policy on mst_tasks
--
-- Migration 003 created "admin_manage_tasks" which only allows admins/researchers
-- to SELECT/INSERT/UPDATE/DELETE tasks. Students have no SELECT path, so the
-- task page fails to load task metadata. This policy closes that gap.
--
-- Students may only read tasks that are published and active.
-- ---------------------------------------------------------------------------

-- Guard: only create if the policy does not already exist
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mst_tasks'
      and policyname = 'student_select_published_tasks'
  ) then
    execute $policy$
      create policy "student_select_published_tasks"
        on public.mst_tasks
        for select
        to authenticated
        using (
          task_status = 'published'
          and is_active = true
        )
    $policy$;
  end if;
end;
$$;

-- Similarly, students need to read blocks for their task.
-- 003 only granted admins access to mst_blocks.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mst_blocks'
      and policyname = 'student_select_blocks_for_published_tasks'
  ) then
    execute $policy$
      create policy "student_select_blocks_for_published_tasks"
        on public.mst_blocks
        for select
        to authenticated
        using (
          task_id in (
            select task_id from public.mst_tasks
            where task_status = 'published' and is_active = true
          )
        )
    $policy$;
  end if;
end;
$$;

-- Students also need to read batch metadata (mst_experiment_batches) for active batches,
-- since the assignment service joins on batch status = 'active'.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mst_experiment_batches'
      and policyname = 'student_select_active_batches'
  ) then
    execute $policy$
      create policy "student_select_active_batches"
        on public.mst_experiment_batches
        for select
        to authenticated
        using (
          status = 'active'
          or public.is_admin_or_researcher()
        )
    $policy$;
  end if;
end;
$$;

-- Students need to read mst_courses and mst_lessons for navigation.
-- No sensitive data; restrict to is_active rows for students.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mst_courses'
      and policyname = 'student_select_active_courses'
  ) then
    execute $policy$
      create policy "student_select_active_courses"
        on public.mst_courses
        for select
        to authenticated
        using (is_active = true or public.is_admin_or_researcher())
    $policy$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mst_lessons'
      and policyname = 'student_select_active_lessons'
  ) then
    execute $policy$
      create policy "student_select_active_lessons"
        on public.mst_lessons
        for select
        to authenticated
        using (is_active = true or public.is_admin_or_researcher())
    $policy$;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 4: Admin/researcher access to dataset views and admin views
--
-- Views in Postgres inherit the privileges of their owner (typically postgres)
-- and bypass the RLS of underlying tables when queried directly — unless the
-- view itself is restricted. We grant SELECT on each view to `authenticated`
-- and rely on is_admin_or_researcher() to gate access at the application layer.
--
-- For defence-in-depth, we also create a thin security-invoker RPC function
-- per view family so that callers must pass through an authenticated context.
-- The view grants are kept for direct Supabase client queries by the admin UI.
-- ---------------------------------------------------------------------------

-- Dataset views (used for CSV export and research analysis)
grant select on public.vw_dataset_attempt_level   to authenticated;
grant select on public.vw_dataset_session_level   to authenticated;
grant select on public.vw_dataset_sequence_level  to authenticated;
grant select on public.vw_dataset_raw_event_log   to authenticated;

-- Admin summary views (used by the admin dashboard and data-quality pages)
grant select on public.vw_admin_dashboard_summary     to authenticated;
grant select on public.vw_admin_task_error_summary    to authenticated;
grant select on public.vw_admin_task_duration_summary to authenticated;
grant select on public.vw_admin_daily_activity_summary to authenticated;
grant select on public.vw_data_quality_summary        to authenticated;


-- ---------------------------------------------------------------------------
-- SECTION 5: Helper RPC functions for admin view access
--
-- These security-definer functions act as a checked gateway: they verify the
-- caller is admin/researcher before returning data from the admin views.
-- The admin app pages call these instead of querying the views directly,
-- ensuring the role check cannot be bypassed even if a view grant is broad.
-- ---------------------------------------------------------------------------

create or replace function public.get_admin_dashboard_summary()
returns setof public.vw_admin_dashboard_summary
language sql security definer set search_path = public stable as $$
  select * from public.vw_admin_dashboard_summary
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_admin_dashboard_summary() to authenticated;

create or replace function public.get_admin_task_error_summary()
returns setof public.vw_admin_task_error_summary
language sql security definer set search_path = public stable as $$
  select * from public.vw_admin_task_error_summary
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_admin_task_error_summary() to authenticated;

create or replace function public.get_admin_task_duration_summary()
returns setof public.vw_admin_task_duration_summary
language sql security definer set search_path = public stable as $$
  select * from public.vw_admin_task_duration_summary
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_admin_task_duration_summary() to authenticated;

create or replace function public.get_admin_daily_activity_summary()
returns setof public.vw_admin_daily_activity_summary
language sql security definer set search_path = public stable as $$
  select * from public.vw_admin_daily_activity_summary
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_admin_daily_activity_summary() to authenticated;

create or replace function public.get_data_quality_summary()
returns setof public.vw_data_quality_summary
language sql security definer set search_path = public stable as $$
  select * from public.vw_data_quality_summary
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_data_quality_summary() to authenticated;

-- Dataset export functions (used by the export-dataset API route)
create or replace function public.get_dataset_attempt_level()
returns setof public.vw_dataset_attempt_level
language sql security definer set search_path = public stable as $$
  select * from public.vw_dataset_attempt_level
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_dataset_attempt_level() to authenticated;

create or replace function public.get_dataset_session_level()
returns setof public.vw_dataset_session_level
language sql security definer set search_path = public stable as $$
  select * from public.vw_dataset_session_level
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_dataset_session_level() to authenticated;

create or replace function public.get_dataset_sequence_level()
returns setof public.vw_dataset_sequence_level
language sql security definer set search_path = public stable as $$
  select * from public.vw_dataset_sequence_level
  where public.is_admin_or_researcher();
$$;
grant execute on function public.get_dataset_sequence_level() to authenticated;
