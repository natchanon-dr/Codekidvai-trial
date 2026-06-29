create or replace view public.vw_admin_dashboard_summary as
select
  (select count(*) from public.mst_profiles where role = 'student') as total_students,
  (select count(*) from public.trn_learning_sessions) as total_sessions,
  (select count(*) from public.trn_learning_sessions where status = 'completed') as completed_sessions,
  (select count(*) from public.trn_learning_sessions where status = 'abandoned') as abandoned_sessions,
  (select count(*) from public.trn_attempts) as total_attempts,
  (select count(*) from public.trn_submissions) as total_submissions,
  (select count(*) from public.trn_event_logs) as total_events,
  (select round(avg(final_score), 2) from public.trn_submissions where final_score is not null) as average_final_score,
  (select count(*) from public.mst_tasks where task_status = 'published' and is_active = true) as published_tasks,
  (select count(*) from public.mst_tasks where task_status = 'draft') as draft_tasks,
  (select count(*) from public.mst_tasks where task_status = 'archived') as archived_tasks;

create or replace view public.vw_admin_task_error_summary as
select t.task_code, t.task_title, t.task_type, t.difficulty_level, count(a.attempt_id) as total_attempts,
 count(a.attempt_id) filter (where a.error_message is not null) as total_errors,
 round((count(a.attempt_id) filter (where a.error_message is not null)::numeric / nullif(count(a.attempt_id),0)) * 100, 2) as error_rate_percent,
 round(avg(a.score), 2) as average_score
from public.mst_tasks t left join public.trn_attempts a on t.task_id = a.task_id
group by t.task_code, t.task_title, t.task_type, t.difficulty_level;

create or replace view public.vw_admin_task_duration_summary as
select t.task_code, t.task_title, t.task_type, t.difficulty_level, count(s.session_id) as total_sessions,
 round(avg(s.duration_seconds), 2) as average_duration_seconds, min(s.duration_seconds) as min_duration_seconds, max(s.duration_seconds) as max_duration_seconds
from public.mst_tasks t left join public.trn_learning_sessions s on t.task_id = s.task_id and s.duration_seconds is not null
group by t.task_code, t.task_title, t.task_type, t.difficulty_level;

create or replace view public.vw_admin_daily_activity_summary as
select date(s.created_at) as activity_date, count(distinct s.profile_id) as active_students, count(distinct s.session_id) as total_sessions,
 count(distinct a.attempt_id) as total_attempts, count(distinct sub.submission_id) as total_submissions, count(distinct e.event_id) as total_events
from public.trn_learning_sessions s
left join public.trn_attempts a on s.session_id = a.session_id
left join public.trn_submissions sub on s.session_id = sub.session_id
left join public.trn_event_logs e on s.session_id = e.session_id
group by date(s.created_at);

create or replace view public.vw_data_quality_summary as
select 'PLACEHOLDER'::text as check_code, 'Use full data-quality SQL from project notes'::text as check_name, 'low'::text as severity, 0::bigint as issue_count;
