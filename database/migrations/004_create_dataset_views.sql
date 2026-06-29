create or replace view public.vw_dataset_attempt_level as
select p.participant_code, b.batch_code, b.batch_name, b.batch_type, b.status as batch_status,
 ep.participant_group, ep.assigned_condition, ta.assignment_id, ta.assigned_order, ta.assigned_group, ta.status as assignment_status,
 t.task_code, t.task_type, t.difficulty_level, t.expected_concept,
 s.session_id, s.status as session_status, s.started_at as session_started_at, s.ended_at as session_ended_at, s.duration_seconds as session_duration_seconds,
 a.attempt_id, a.attempt_no, a.attempt_type, a.answer_text, a.is_correct, a.score, a.error_type, a.error_message, a.execution_time_ms, a.created_at as attempt_created_at
from public.trn_attempts a
join public.trn_learning_sessions s on a.session_id = s.session_id
join public.mst_profiles p on a.profile_id = p.profile_id
join public.mst_tasks t on a.task_id = t.task_id
left join public.mst_experiment_batches b on s.batch_id = b.batch_id
left join public.trn_task_assignments ta on s.assignment_id = ta.assignment_id
left join public.trn_experiment_participants ep on s.batch_id = ep.batch_id and s.profile_id = ep.profile_id;

create or replace view public.vw_dataset_session_level as
with attempt_summary as (
  select session_id, count(*) as total_attempts, count(*) filter (where attempt_type = 'run') as total_runs,
  count(*) filter (where attempt_type = 'submit') as total_submit_attempts, count(*) filter (where error_message is not null) as total_errors,
  round(avg(score), 2) as average_attempt_score, max(score) as max_attempt_score
  from public.trn_attempts group by session_id
), event_summary as (
  select session_id, count(*) as total_events, count(*) filter (where event_type = 'hint_open') as total_hints,
  count(*) filter (where event_type in ('block_add','block_move','block_delete','block_submit')) as total_block_actions,
  count(*) filter (where event_type = 'sql_typing') as total_typing_events, count(*) filter (where event_type = 'sql_run') as total_sql_runs
  from public.trn_event_logs group by session_id
)
select p.participant_code, b.batch_code, b.batch_name, b.batch_type, b.status as batch_status,
 ep.participant_group, ep.assigned_condition, ta.assignment_id, ta.assigned_order, ta.assigned_group, ta.status as assignment_status,
 t.task_code, t.task_type, t.difficulty_level, t.expected_concept,
 s.session_id, s.started_at, s.ended_at, s.duration_seconds, s.status as session_status, s.device_type, s.browser_name,
 coalesce(a.total_attempts,0) as total_attempts, coalesce(a.total_runs,0) as total_runs, coalesce(a.total_submit_attempts,0) as total_submit_attempts,
 coalesce(a.total_errors,0) as total_errors, a.average_attempt_score, a.max_attempt_score,
 coalesce(e.total_events,0) as total_events, coalesce(e.total_hints,0) as total_hints, coalesce(e.total_block_actions,0) as total_block_actions,
 coalesce(e.total_typing_events,0) as total_typing_events, coalesce(e.total_sql_runs,0) as total_sql_runs,
 sub.final_score, sub.is_passed, sub.submitted_at
from public.trn_learning_sessions s
join public.mst_profiles p on s.profile_id = p.profile_id
join public.mst_tasks t on s.task_id = t.task_id
left join public.mst_experiment_batches b on s.batch_id = b.batch_id
left join public.trn_task_assignments ta on s.assignment_id = ta.assignment_id
left join public.trn_experiment_participants ep on s.batch_id = ep.batch_id and s.profile_id = ep.profile_id
left join attempt_summary a on s.session_id = a.session_id
left join event_summary e on s.session_id = e.session_id
left join public.trn_submissions sub on s.session_id = sub.session_id;

create or replace view public.vw_dataset_sequence_level as
select p.participant_code, b.batch_code, b.batch_name, b.batch_type, b.status as batch_status,
 ep.participant_group, ep.assigned_condition, ta.assignment_id, ta.assigned_order, ta.assigned_group, ta.status as assignment_status,
 t.task_code, t.task_type, t.difficulty_level, t.expected_concept, s.session_id, s.status as session_status, s.started_at as session_started_at,
 e.event_id, e.event_order, e.event_type, e.event_value, e.duration_from_start, e.event_time, e.metadata_json, e.created_at as event_created_at
from public.trn_event_logs e
join public.trn_learning_sessions s on e.session_id = s.session_id
join public.mst_profiles p on e.profile_id = p.profile_id
join public.mst_tasks t on e.task_id = t.task_id
left join public.mst_experiment_batches b on s.batch_id = b.batch_id
left join public.trn_task_assignments ta on s.assignment_id = ta.assignment_id
left join public.trn_experiment_participants ep on s.batch_id = ep.batch_id and s.profile_id = ep.profile_id;

create or replace view public.vw_dataset_raw_event_log as
select * from public.vw_dataset_sequence_level;
