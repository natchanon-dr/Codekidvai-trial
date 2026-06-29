create or replace function public.current_user_role()
returns text language sql security definer set search_path = public stable as $$
  select role from public.mst_profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin_or_researcher()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.mst_profiles where auth_user_id = auth.uid() and role in ('admin','researcher'));
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin_or_researcher() to authenticated;

alter table public.mst_profiles enable row level security;
alter table public.mst_courses enable row level security;
alter table public.mst_lessons enable row level security;
alter table public.mst_tasks enable row level security;
alter table public.mst_blocks enable row level security;
alter table public.trn_learning_sessions enable row level security;
alter table public.trn_event_logs enable row level security;
alter table public.trn_attempts enable row level security;
alter table public.trn_submissions enable row level security;
alter table public.trn_dataset_exports enable row level security;
alter table public.mst_experiment_batches enable row level security;
alter table public.trn_experiment_participants enable row level security;
alter table public.trn_task_assignments enable row level security;

create policy "profiles_select_own_or_admin" on public.mst_profiles for select to authenticated using (auth_user_id = auth.uid() or public.is_admin_or_researcher());
create policy "profiles_insert_own" on public.mst_profiles for insert to authenticated with check (auth_user_id = auth.uid());
create policy "profiles_update_own_or_admin" on public.mst_profiles for update to authenticated using (auth_user_id = auth.uid() or public.is_admin_or_researcher()) with check (auth_user_id = auth.uid() or public.is_admin_or_researcher());

create policy "admin_manage_courses" on public.mst_courses for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());
create policy "admin_manage_lessons" on public.mst_lessons for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());
create policy "admin_manage_tasks" on public.mst_tasks for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());
create policy "admin_manage_blocks" on public.mst_blocks for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());

create policy "student_manage_own_sessions" on public.trn_learning_sessions for all to authenticated using (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher()) with check (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher());
create policy "student_manage_own_events" on public.trn_event_logs for all to authenticated using (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher()) with check (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher());
create policy "student_manage_own_attempts" on public.trn_attempts for all to authenticated using (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher()) with check (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher());
create policy "student_manage_own_submissions" on public.trn_submissions for all to authenticated using (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher()) with check (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()) or public.is_admin_or_researcher());
create policy "admin_manage_exports" on public.trn_dataset_exports for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());

create policy "admin_manage_experiment_batches" on public.mst_experiment_batches for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());
create policy "admin_manage_experiment_participants" on public.trn_experiment_participants for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());
create policy "student_select_own_experiment_participants" on public.trn_experiment_participants for select to authenticated using (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()));
create policy "admin_manage_task_assignments" on public.trn_task_assignments for all to authenticated using (public.is_admin_or_researcher()) with check (public.is_admin_or_researcher());
create policy "student_select_own_task_assignments" on public.trn_task_assignments for select to authenticated using (profile_id in (select profile_id from public.mst_profiles where auth_user_id = auth.uid()));

create or replace function public.get_assigned_tasks_for_student()
returns table (
  assignment_id uuid, batch_id uuid, batch_code varchar, batch_name varchar,
  task_id uuid, task_code varchar, task_title varchar, task_description text, task_type varchar,
  difficulty_level varchar, expected_concept text, max_score numeric, time_limit_seconds int,
  learning_objective text, problem_statement text, database_schema_json jsonb, sample_data_json jsonb,
  estimated_time_seconds int, assigned_order int, assigned_group varchar, is_required boolean,
  is_unlocked boolean, assignment_status varchar
)
language sql security definer set search_path = public stable as $$
  select a.assignment_id, b.batch_id, b.batch_code, b.batch_name, t.task_id, t.task_code, t.task_title,
  t.task_description, t.task_type, t.difficulty_level, t.expected_concept, t.max_score, t.time_limit_seconds,
  t.learning_objective, t.problem_statement, t.database_schema_json, t.sample_data_json, t.estimated_time_seconds,
  a.assigned_order, a.assigned_group, a.is_required, a.is_unlocked, a.status
  from public.trn_task_assignments a
  join public.mst_profiles p on a.profile_id = p.profile_id
  join public.mst_experiment_batches b on a.batch_id = b.batch_id
  join public.mst_tasks t on a.task_id = t.task_id
  where p.auth_user_id = auth.uid() and b.status = 'active' and t.task_status = 'published' and t.is_active = true
  order by b.created_at desc, a.assigned_order asc;
$$;
grant execute on function public.get_assigned_tasks_for_student() to authenticated;

create or replace function public.get_blocks_for_student_task(p_task_id uuid)
returns table (block_id uuid, task_id uuid, block_code varchar, block_label varchar, block_value text, block_type varchar, display_order int, metadata_json jsonb)
language sql security definer set search_path = public stable as $$
  select b.block_id, b.task_id, b.block_code, b.block_label, b.block_value, b.block_type, b.display_order, b.metadata_json
  from public.mst_blocks b join public.mst_tasks t on b.task_id = t.task_id
  where b.task_id = p_task_id and t.task_status = 'published' and t.is_active = true
  order by b.display_order asc, b.created_at asc;
$$;
grant execute on function public.get_blocks_for_student_task(uuid) to authenticated;
