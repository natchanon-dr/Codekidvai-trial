-- =============================================================================
-- Script 008: Enroll all student profiles into SQL_ASSIGNMENT_BASIC_001
--
-- Context:
--   Script 006 deleted old prototype tasks and their batch mappings.
--   Script 007 created a new batch (SQL_ASSIGNMENT_BASIC_001) and 30 new tasks
--   with new UUIDs.  Any existing rows in trn_task_assignments still point to
--   the old (now deleted) task_ids and batch_ids, so the dashboard shows empty.
--
--   This script creates fresh trn_task_assignments rows for every profile with
--   role = 'student' for every task in SQL_ASSIGNMENT_BASIC_001.
--
-- Safety:
--   - Uses ON CONFLICT DO NOTHING — safe to run multiple times.
--   - Does not delete any existing rows.
--   - Does not touch profiles, auth users, or session/attempt data.
--
-- Run order: after scripts 006 and 007.
-- =============================================================================

insert into public.trn_task_assignments (
  profile_id,
  batch_id,
  task_id,
  assigned_order,
  is_required,
  is_unlocked,
  status
)
select
  p.profile_id,
  b.batch_id,
  ast.task_id,
  ast.task_order   as assigned_order,
  ast.is_required,
  true             as is_unlocked,
  'assigned'       as status
from public.mst_profiles              p
cross join public.mst_experiment_batches b
inner join public.mst_assignment_set_tasks ast
  on ast.batch_id = b.batch_id and ast.is_active = true
where p.role      = 'student'
  and b.batch_code = 'SQL_ASSIGNMENT_BASIC_001'
  and not exists (
    select 1
    from public.trn_task_assignments ta
    where ta.profile_id = p.profile_id
      and ta.task_id    = ast.task_id
      and ta.batch_id   = b.batch_id
  );
