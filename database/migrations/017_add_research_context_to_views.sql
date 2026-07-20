-- 017_add_research_context_to_views.sql
--
-- Adds set_family, set_family_ambiguous, and learning_mode to all three
-- dataset views. The batch_context CTE aggregates tb_class_sets per batch_id
-- and returns NULL for set_family when the same batch_id appears under multiple
-- class_ids with different family values (ambiguous case, guarded by the
-- UNIQUE(class_id, batch_id) constraint which does NOT prevent one batch_id
-- from appearing in multiple rows with different class_ids).
--
-- All existing column order is preserved; new columns are appended at the end.
-- vw_dataset_raw_event_log inherits via SELECT * and requires no change.
-- No RLS changes. No PII exposed.

CREATE OR REPLACE VIEW public.vw_dataset_attempt_level AS
WITH batch_context AS (
  SELECT
    batch_id,
    CASE WHEN COUNT(DISTINCT family) = 1 THEN MIN(family) ELSE NULL END AS set_family,
    (COUNT(DISTINCT family) > 1) AS set_family_ambiguous
  FROM public.tb_class_sets
  GROUP BY batch_id
)
SELECT
  p.participant_code, b.batch_code, b.batch_name, b.batch_type, b.status AS batch_status,
  ep.participant_group, ep.assigned_condition,
  ta.assignment_id, ta.assigned_order, ta.assigned_group, ta.status AS assignment_status,
  t.task_code, t.task_type, t.difficulty_level, t.expected_concept,
  s.session_id, s.status AS session_status,
  s.started_at AS session_started_at, s.ended_at AS session_ended_at,
  s.duration_seconds AS session_duration_seconds,
  a.attempt_id, a.attempt_no, a.attempt_type, a.answer_text,
  a.is_correct, a.score, a.error_type, a.error_message,
  a.execution_time_ms, a.created_at AS attempt_created_at,
  bc.set_family,
  bc.set_family_ambiguous,
  CASE t.task_type
    WHEN 'sql_text'         THEN 'text_based'
    WHEN 'stored_procedure' THEN 'text_based'
    WHEN 'coding_text'      THEN 'text_based'
    WHEN 'sql_block'        THEN 'block_based'
    WHEN 'er_diagram'       THEN 'block_based'
    WHEN 'coding_block'     THEN 'block_based'
    ELSE NULL
  END AS learning_mode
FROM public.trn_attempts a
JOIN  public.trn_learning_sessions s   ON a.session_id  = s.session_id
JOIN  public.mst_profiles p            ON a.profile_id  = p.profile_id
JOIN  public.mst_tasks t               ON a.task_id     = t.task_id
LEFT JOIN public.mst_experiment_batches b      ON s.batch_id = b.batch_id
LEFT JOIN public.trn_task_assignments ta       ON s.assignment_id = ta.assignment_id
LEFT JOIN public.trn_experiment_participants ep ON s.batch_id = ep.batch_id AND s.profile_id = ep.profile_id
LEFT JOIN batch_context bc             ON bc.batch_id   = s.batch_id;


CREATE OR REPLACE VIEW public.vw_dataset_session_level AS
WITH attempt_summary AS (
  SELECT
    session_id,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE attempt_type = 'run') AS total_runs,
    count(*) FILTER (WHERE attempt_type = 'submit') AS total_submit_attempts,
    count(*) FILTER (WHERE error_message IS NOT NULL) AS total_errors,
    round(avg(score), 2) AS average_attempt_score,
    max(score) AS max_attempt_score
  FROM public.trn_attempts
  GROUP BY session_id
), event_summary AS (
  SELECT
    session_id,
    count(*) AS total_events,
    count(*) FILTER (WHERE event_type = 'hint_open') AS total_hints,
    count(*) FILTER (WHERE event_type IN ('block_add','block_move','block_delete','block_submit')) AS total_block_actions,
    count(*) FILTER (WHERE event_type = 'sql_typing') AS total_typing_events,
    count(*) FILTER (WHERE event_type = 'sql_run') AS total_sql_runs
  FROM public.trn_event_logs
  GROUP BY session_id
), batch_context AS (
  SELECT
    batch_id,
    CASE WHEN COUNT(DISTINCT family) = 1 THEN MIN(family) ELSE NULL END AS set_family,
    (COUNT(DISTINCT family) > 1) AS set_family_ambiguous
  FROM public.tb_class_sets
  GROUP BY batch_id
)
SELECT
  p.participant_code, b.batch_code, b.batch_name, b.batch_type, b.status AS batch_status,
  ep.participant_group, ep.assigned_condition,
  ta.assignment_id, ta.assigned_order, ta.assigned_group, ta.status AS assignment_status,
  t.task_code, t.task_type, t.difficulty_level, t.expected_concept,
  s.session_id, s.started_at, s.ended_at, s.duration_seconds,
  s.status AS session_status, s.device_type, s.browser_name,
  coalesce(a.total_attempts,0)        AS total_attempts,
  coalesce(a.total_runs,0)            AS total_runs,
  coalesce(a.total_submit_attempts,0) AS total_submit_attempts,
  coalesce(a.total_errors,0)          AS total_errors,
  a.average_attempt_score, a.max_attempt_score,
  coalesce(e.total_events,0)          AS total_events,
  coalesce(e.total_hints,0)           AS total_hints,
  coalesce(e.total_block_actions,0)   AS total_block_actions,
  coalesce(e.total_typing_events,0)   AS total_typing_events,
  coalesce(e.total_sql_runs,0)        AS total_sql_runs,
  sub.final_score, sub.is_passed, sub.submitted_at,
  bc.set_family,
  bc.set_family_ambiguous,
  CASE t.task_type
    WHEN 'sql_text'         THEN 'text_based'
    WHEN 'stored_procedure' THEN 'text_based'
    WHEN 'coding_text'      THEN 'text_based'
    WHEN 'sql_block'        THEN 'block_based'
    WHEN 'er_diagram'       THEN 'block_based'
    WHEN 'coding_block'     THEN 'block_based'
    ELSE NULL
  END AS learning_mode
FROM public.trn_learning_sessions s
JOIN  public.mst_profiles p             ON s.profile_id   = p.profile_id
JOIN  public.mst_tasks t                ON s.task_id      = t.task_id
LEFT JOIN public.mst_experiment_batches b      ON s.batch_id = b.batch_id
LEFT JOIN public.trn_task_assignments ta       ON s.assignment_id = ta.assignment_id
LEFT JOIN public.trn_experiment_participants ep ON s.batch_id = ep.batch_id AND s.profile_id = ep.profile_id
LEFT JOIN attempt_summary a             ON s.session_id = a.session_id
LEFT JOIN event_summary e               ON s.session_id = e.session_id
LEFT JOIN public.trn_submissions sub    ON s.session_id = sub.session_id
LEFT JOIN batch_context bc              ON bc.batch_id  = s.batch_id;


CREATE OR REPLACE VIEW public.vw_dataset_sequence_level AS
WITH batch_context AS (
  SELECT
    batch_id,
    CASE WHEN COUNT(DISTINCT family) = 1 THEN MIN(family) ELSE NULL END AS set_family,
    (COUNT(DISTINCT family) > 1) AS set_family_ambiguous
  FROM public.tb_class_sets
  GROUP BY batch_id
)
SELECT
  p.participant_code, b.batch_code, b.batch_name, b.batch_type, b.status AS batch_status,
  ep.participant_group, ep.assigned_condition,
  ta.assignment_id, ta.assigned_order, ta.assigned_group, ta.status AS assignment_status,
  t.task_code, t.task_type, t.difficulty_level, t.expected_concept,
  s.session_id, s.status AS session_status, s.started_at AS session_started_at,
  e.event_id, e.event_order, e.event_type, e.event_value,
  e.duration_from_start, e.event_time, e.metadata_json, e.created_at AS event_created_at,
  bc.set_family,
  bc.set_family_ambiguous,
  CASE t.task_type
    WHEN 'sql_text'         THEN 'text_based'
    WHEN 'stored_procedure' THEN 'text_based'
    WHEN 'coding_text'      THEN 'text_based'
    WHEN 'sql_block'        THEN 'block_based'
    WHEN 'er_diagram'       THEN 'block_based'
    WHEN 'coding_block'     THEN 'block_based'
    ELSE NULL
  END AS learning_mode
FROM public.trn_event_logs e
JOIN  public.trn_learning_sessions s    ON e.session_id  = s.session_id
JOIN  public.mst_profiles p             ON e.profile_id  = p.profile_id
JOIN  public.mst_tasks t                ON e.task_id     = t.task_id
LEFT JOIN public.mst_experiment_batches b      ON s.batch_id = b.batch_id
LEFT JOIN public.trn_task_assignments ta       ON s.assignment_id = ta.assignment_id
LEFT JOIN public.trn_experiment_participants ep ON s.batch_id = ep.batch_id AND s.profile_id = ep.profile_id
LEFT JOIN batch_context bc              ON bc.batch_id   = s.batch_id;


-- vw_dataset_raw_event_log inherits all columns via SELECT * — no change needed.
CREATE OR REPLACE VIEW public.vw_dataset_raw_event_log AS
SELECT * FROM public.vw_dataset_sequence_level;
