# Data Dictionary Summary

## Dataset Views

- `vw_dataset_attempt_level`: 1 row = 1 attempt/run/submit
- `vw_dataset_session_level`: 1 row = 1 task session
- `vw_dataset_sequence_level`: 1 row = 1 event ordered by session
- `vw_dataset_raw_event_log`: raw anonymized event export

## Key columns

| Column | Meaning |
|---|---|
| participant_code | anonymous learner id |
| batch_code | experiment batch code |
| assigned_condition | condition such as text_first or block_first |
| assigned_order | task order in experiment |
| task_code | task identifier |
| task_type | sql_text or sql_block |
| session_id | learning session id |
| event_order | event order inside session |
| event_type | action type |
| attempt_type | run/check/submit |
| score | attempt score |
| final_score | final submission score |
| is_passed | pass/fail target |

## Event types

- `session_start`
- `question_view`
- `sql_typing`
- `sql_run`
- `sql_success`
- `sql_error`
- `submit_answer`
- `session_end`
- `page_leave`
- `block_add`
- `block_move`
- `block_delete`
- `block_submit`
- `hint_open`
