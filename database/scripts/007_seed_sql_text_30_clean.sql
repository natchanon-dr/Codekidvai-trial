-- =============================================================================
-- Script 007: Seed clean SQL_TEXT task bank (30 tasks) + Assignment/Exam Sets
--
-- Scenario: School learning management database
-- Tables used in every task:
--   students(student_id, student_name, grade_level, class_section)
--   courses(course_id, course_name, teacher_name)
--   assignments(assignment_id, course_id, assignment_title, max_score)
--   submissions(submission_id, student_id, assignment_id, score, submitted_at)
--
-- Consistent sample data across all tasks:
--   5 students: Alice(1,gr6,A), Bob(2,gr6,A), Charlie(3,gr5,B), Diana(4,gr6,B), Eve(5,gr5,A)
--   3 courses:  Database Basics(1,Somsak), Mathematics(2,Wanna), English(3,Nok)
--   4 assignments: SELECT Query Basics(1,c1,100), WHERE and Filtering(2,c1,100),
--                  Algebra Practice(3,c2,50), Reading Comprehension(4,c3,80)
--   6 submissions: Alice→a1=95, Bob→a1=78, Diana→a2=90, Eve→a2=72,
--                  Alice→a3=88, Bob→a3=65  (Charlie has NO submissions)
--
-- Run order:
--   Part 1  Upsert Assignment Set and Exam Set batch headers
--   Part 2  Upsert 30 SQL_TEXT tasks (shared schema/sample JSON via CTE)
--   Part 3  Map all 30 tasks into Assignment Set (order 1–30, all required)
--   Part 4  Map 10 selected tasks into Exam Set
--
-- Prerequisites: script 006 must be run first (expands batch_type constraint,
--               clears old prototype tasks and their set mappings).
-- =============================================================================


-- =============================================================================
-- PART 1: Upsert batch headers (Assignment Set + Exam Set)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Assignment Set: SQL Practice Basic 001
--   Open practice mode — students can run, retry, see hints and expected output.
--   batch_type = 'assignment_set' (constraint expanded in script 006)
--   set_type_id = 1 (ASSIGNMENT_SET from mst_set_types)
--   status_id   = 7 (SET/ACTIVE from mst_statuses)
-- ---------------------------------------------------------------------------
insert into public.mst_experiment_batches (
  batch_code, batch_name, batch_description,
  batch_type, status,
  set_type_id, feedback_policy_id, attempt_policy_id, visibility_policy_id, status_id,
  allow_run, allow_multiple_attempts, show_expected_result, show_score_to_student, show_hint,
  metadata_json
)
values (
  'SQL_ASSIGNMENT_BASIC_001',
  'SQL Practice Basic 001',
  'Practice assignment set covering SQL fundamentals for a school database scenario. '
  'Students can run their query, see expected output, and retry as many times as needed.',
  'assignment_set',
  'active',
  1, 1, 1, 1, 7,
  true, true, true, true, true,
  '{"set_category":"sql_text","level":"basic","target_audience":"beginner","task_count":30}'
)
on conflict (batch_code) do update set
  batch_name              = excluded.batch_name,
  batch_description       = excluded.batch_description,
  batch_type              = excluded.batch_type,
  status                  = excluded.status,
  set_type_id             = excluded.set_type_id,
  feedback_policy_id      = excluded.feedback_policy_id,
  attempt_policy_id       = excluded.attempt_policy_id,
  visibility_policy_id    = excluded.visibility_policy_id,
  status_id               = excluded.status_id,
  allow_run               = excluded.allow_run,
  allow_multiple_attempts = excluded.allow_multiple_attempts,
  show_expected_result    = excluded.show_expected_result,
  show_score_to_student   = excluded.show_score_to_student,
  show_hint               = excluded.show_hint,
  metadata_json           = excluded.metadata_json,
  updated_at              = now();


-- ---------------------------------------------------------------------------
-- Exam Set: SQL Exam Basic 001
--   Summative exam mode — single attempt, no hints, teacher-only feedback.
--   batch_type = 'exam_set' (constraint expanded in script 006)
--   set_type_id = 2 (EXAM_SET from mst_set_types)
--   feedback_policy_id = 2 (TEACHER_ONLY)
--   attempt_policy_id  = 2 (SINGLE_ATTEMPT)
--   visibility_policy_id = 2 (TEACHER_ONLY)
--   status_id   = 7 (SET/ACTIVE from mst_statuses)
-- ---------------------------------------------------------------------------
insert into public.mst_experiment_batches (
  batch_code, batch_name, batch_description,
  batch_type, status,
  set_type_id, feedback_policy_id, attempt_policy_id, visibility_policy_id, status_id,
  allow_run, allow_multiple_attempts, show_expected_result, show_score_to_student, show_hint,
  metadata_json
)
values (
  'SQL_EXAM_BASIC_001',
  'SQL Exam Basic 001',
  'Summative exam covering SQL fundamentals. '
  'Students have one attempt. Results and expected output are visible to the teacher only until released.',
  'exam_set',
  'active',
  2, 2, 2, 2, 7,
  true, false, false, false, false,
  '{"set_category":"sql_text","level":"basic","exam_type":"summative","target_audience":"beginner","task_count":10}'
)
on conflict (batch_code) do update set
  batch_name              = excluded.batch_name,
  batch_description       = excluded.batch_description,
  batch_type              = excluded.batch_type,
  status                  = excluded.status,
  set_type_id             = excluded.set_type_id,
  feedback_policy_id      = excluded.feedback_policy_id,
  attempt_policy_id       = excluded.attempt_policy_id,
  visibility_policy_id    = excluded.visibility_policy_id,
  status_id               = excluded.status_id,
  allow_run               = excluded.allow_run,
  allow_multiple_attempts = excluded.allow_multiple_attempts,
  show_expected_result    = excluded.show_expected_result,
  show_score_to_student   = excluded.show_score_to_student,
  show_hint               = excluded.show_hint,
  metadata_json           = excluded.metadata_json,
  updated_at              = now();


-- =============================================================================
-- PART 2: Upsert 30 SQL_TEXT tasks
--
-- Shared schema and sample data are defined once in a CTE (shared_json) and
-- joined into every task row — no repetition in the values list.
--
-- Column key for the values list:
--   (1)  task_code
--   (2)  task_title
--   (3)  task_description
--   (4)  difficulty_level   ('easy'|'medium'|'hard')
--   (5)  difficulty_level_id (1|2|3)
--   (6)  skill_area_id
--   (7)  estimated_time_seconds
--   (8)  max_score
--   (9)  learning_objective
--   (10) problem_statement
--   (11) instruction_text
--   (12) expected_output_json  (jsonb)
--   (13) expected_sql
--   (14) scoring_rubric_json   (jsonb)
--   (15) grading_rules_json    (jsonb)
--   (16) hint_json             (jsonb)
--   (17) answer_format_json    (jsonb)
--   (18) metadata_json         (jsonb)
-- =============================================================================

with shared_json as (
  select
    -- Database schema shown to students in all tasks
    '{
      "tables": [
        {"name":"students",    "columns":["student_id INT PK","student_name VARCHAR","grade_level INT","class_section VARCHAR"]},
        {"name":"courses",     "columns":["course_id INT PK","course_name VARCHAR","teacher_name VARCHAR"]},
        {"name":"assignments", "columns":["assignment_id INT PK","course_id INT FK->courses","assignment_title VARCHAR","max_score INT"]},
        {"name":"submissions", "columns":["submission_id INT PK","student_id INT FK->students","assignment_id INT FK->assignments","score INT","submitted_at DATE"]}
      ]
    }'::jsonb as schema_json,

    -- Consistent sample data used to derive expected_output_json for every task
    '{
      "students":[
        {"student_id":1,"student_name":"Alice",  "grade_level":6,"class_section":"A"},
        {"student_id":2,"student_name":"Bob",    "grade_level":6,"class_section":"A"},
        {"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},
        {"student_id":4,"student_name":"Diana",  "grade_level":6,"class_section":"B"},
        {"student_id":5,"student_name":"Eve",    "grade_level":5,"class_section":"A"}
      ],
      "courses":[
        {"course_id":1,"course_name":"Database Basics","teacher_name":"Teacher Somsak"},
        {"course_id":2,"course_name":"Mathematics",    "teacher_name":"Teacher Wanna"},
        {"course_id":3,"course_name":"English",        "teacher_name":"Teacher Nok"}
      ],
      "assignments":[
        {"assignment_id":1,"course_id":1,"assignment_title":"SELECT Query Basics","max_score":100},
        {"assignment_id":2,"course_id":1,"assignment_title":"WHERE and Filtering", "max_score":100},
        {"assignment_id":3,"course_id":2,"assignment_title":"Algebra Practice",    "max_score":50},
        {"assignment_id":4,"course_id":3,"assignment_title":"Reading Comprehension","max_score":80}
      ],
      "submissions":[
        {"submission_id":1,"student_id":1,"assignment_id":1,"score":95,"submitted_at":"2024-01-10"},
        {"submission_id":2,"student_id":2,"assignment_id":1,"score":78,"submitted_at":"2024-01-10"},
        {"submission_id":3,"student_id":4,"assignment_id":2,"score":90,"submitted_at":"2024-01-15"},
        {"submission_id":4,"student_id":5,"assignment_id":2,"score":72,"submitted_at":"2024-01-15"},
        {"submission_id":5,"student_id":1,"assignment_id":3,"score":88,"submitted_at":"2024-01-20"},
        {"submission_id":6,"student_id":2,"assignment_id":3,"score":65,"submitted_at":"2024-01-20"}
      ]
    }'::jsonb as sample_json
),

task_rows (
  task_code, task_title, task_description,
  difficulty_level, difficulty_level_id, skill_area_id,
  estimated_time_seconds, max_score,
  learning_objective, problem_statement, instruction_text,
  expected_output_json, expected_sql,
  scoring_rubric_json, grading_rules_json, hint_json, answer_format_json, metadata_json
) as (
  values

  -- ── 001 SELECT all students ────────────────────────────────────────────────
  ( 'SQL_TEXT_001',
    'SELECT all students',
    'Retrieve every row and every column from the students table.',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'Students will be able to retrieve all rows and columns from a single table using SELECT *.',
    'The school administrator wants to see the complete list of all students including their ID, name, grade level, and class section.',
    'Write a SQL query to select all columns from the students table.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["Use SELECT * to select all columns","The table name goes after FROM"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"remember","topic":"basic_select","sequence":1}'::jsonb ),

  -- ── 002 SELECT specific columns ───────────────────────────────────────────
  ( 'SQL_TEXT_002',
    'SELECT specific columns from students',
    'Retrieve only the student_id and student_name columns from the students table.',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'Students will be able to specify which columns to retrieve instead of selecting all columns.',
    'The admin only needs a name list — student IDs and names — without grade or section information.',
    'Write a SQL query to select only the student_id and student_name columns from the students table.',
    '[{"student_id":1,"student_name":"Alice"},{"student_id":2,"student_name":"Bob"},{"student_id":3,"student_name":"Charlie"},{"student_id":4,"student_name":"Diana"},{"student_id":5,"student_name":"Eve"}]'::jsonb,
    'SELECT student_id, student_name FROM students;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_id","student_name"]}'::jsonb,
    '{"hints":["List column names separated by commas after SELECT","Do not use * when you need only specific columns"]}'::jsonb,
    '{"required_columns":["student_id","student_name"]}'::jsonb,
    '{"bloom_level":"remember","topic":"column_selection","sequence":2}'::jsonb ),

  -- ── 003 Filter by grade level ──────────────────────────────────────────────
  ( 'SQL_TEXT_003',
    'Filter students by grade level',
    'Use WHERE to retrieve only students in grade level 6.',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'Students will be able to filter rows using a WHERE clause with an equality condition on an integer column.',
    'The teacher wants to see only the Grade 6 students for an upcoming event.',
    'Write a SQL query to select all columns from the students table where grade_level equals 6.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"}]'::jsonb,
    'SELECT * FROM students WHERE grade_level = 6;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["Use WHERE to filter rows","grade_level = 6 compares an integer — no quotes needed"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_filter","sequence":3}'::jsonb ),

  -- ── 004 Filter by class section ───────────────────────────────────────────
  ( 'SQL_TEXT_004',
    'Filter students by class section',
    'Use WHERE to retrieve only students in class section A.',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'Students will be able to filter rows using a WHERE clause with an equality condition on a text column.',
    'The homeroom teacher for Section A needs the list of students assigned to her class.',
    'Write a SQL query to select all columns from the students table where class_section equals ''A''.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students WHERE class_section = ''A'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["Text values must be wrapped in single quotes","class_section = ''A'' compares to the string A"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_string_filter","sequence":4}'::jsonb ),

  -- ── 005 Sort by name ASC ───────────────────────────────────────────────────
  ( 'SQL_TEXT_005',
    'Sort students by name ascending',
    'Retrieve all students ordered alphabetically by student_name.',
    'easy', 1::smallint, 3::smallint, 120, 10.00::numeric,
    'Students will be able to sort query results using ORDER BY with ascending order.',
    'The school wants to print a sorted attendance sheet with students listed alphabetically by name.',
    'Write a SQL query to select all columns from the students table ordered by student_name in ascending order.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students ORDER BY student_name ASC;',
    '{"full_credit":{"score":10,"condition":"output matches expected result in correct order"},"zero_credit":{"condition":"output does not match or wrong order"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false}'::jsonb,
    '{"hints":["Use ORDER BY followed by the column name","ASC means ascending — A comes before Z"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"order_by_asc","sequence":5}'::jsonb ),

  -- ── 006 Sort by grade DESC ────────────────────────────────────────────────
  ( 'SQL_TEXT_006',
    'Sort students by grade level descending',
    'Retrieve student_name and grade_level ordered from highest to lowest grade level.',
    'easy', 1::smallint, 3::smallint, 120, 10.00::numeric,
    'Students will be able to sort query results using ORDER BY with descending order.',
    'The principal wants to see a list of students ranked from the highest grade level to the lowest.',
    'Write a SQL query to select student_name and grade_level from the students table, ordered by grade_level descending.',
    '[{"student_name":"Alice","grade_level":6},{"student_name":"Bob","grade_level":6},{"student_name":"Diana","grade_level":6},{"student_name":"Charlie","grade_level":5},{"student_name":"Eve","grade_level":5}]'::jsonb,
    'SELECT student_name, grade_level FROM students ORDER BY grade_level DESC;',
    '{"full_credit":{"score":10,"condition":"grade_level column is sorted descending"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false,"required_columns":["student_name","grade_level"]}'::jsonb,
    '{"hints":["DESC means descending — highest value appears first","Select only the two columns needed"]}'::jsonb,
    '{"required_columns":["student_name","grade_level"]}'::jsonb,
    '{"bloom_level":"understand","topic":"order_by_desc","sequence":6}'::jsonb ),

  -- ── 007 COUNT all students ────────────────────────────────────────────────
  ( 'SQL_TEXT_007',
    'COUNT all students',
    'Count the total number of students enrolled in the school.',
    'easy', 1::smallint, 11::smallint, 120, 10.00::numeric,
    'Students will be able to use the COUNT aggregate function to count all rows in a table.',
    'The school registrar needs to know the total number of registered students.',
    'Write a SQL query to count the total number of rows in the students table. Name the result column total_students.',
    '[{"total_students":5}]'::jsonb,
    'SELECT COUNT(*) AS total_students FROM students;',
    '{"full_credit":{"score":10,"condition":"output shows count of 5"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(*) counts all rows","Use AS to rename the result column"]}'::jsonb,
    '{"required_columns":["total_students"]}'::jsonb,
    '{"bloom_level":"understand","topic":"count_all","sequence":7}'::jsonb ),

  -- ── 008 COUNT per grade level ─────────────────────────────────────────────
  ( 'SQL_TEXT_008',
    'COUNT students per grade level',
    'Count how many students are in each grade level using GROUP BY.',
    'easy', 1::smallint, 6::smallint, 120, 10.00::numeric,
    'Students will be able to use GROUP BY with COUNT to produce a frequency summary.',
    'The registrar wants a breakdown of how many students are in each grade level.',
    'Write a SQL query to show each grade_level and the count of students in that grade. Name the count column student_count.',
    '[{"grade_level":5,"student_count":2},{"grade_level":6,"student_count":3}]'::jsonb,
    'SELECT grade_level, COUNT(*) AS student_count FROM students GROUP BY grade_level;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["GROUP BY groups all rows with the same grade_level value","COUNT(*) counts how many rows are in each group"]}'::jsonb,
    '{"required_columns":["grade_level","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"group_by_count","sequence":8}'::jsonb ),

  -- ── 009 JOIN students and submissions ────────────────────────────────────
  ( 'SQL_TEXT_009',
    'JOIN students and submissions',
    'Join the students and submissions tables to show each student''s name alongside their score.',
    'medium', 2::smallint, 4::smallint, 180, 15.00::numeric,
    'Students will be able to join two tables using INNER JOIN on a shared key column.',
    'The teacher wants to see each student''s name next to the score they received on any submission.',
    'Write a SQL query using INNER JOIN to show student_name and score for every submission. Join students and submissions on student_id.',
    '[{"student_name":"Alice","score":95},{"student_name":"Bob","score":78},{"student_name":"Diana","score":90},{"student_name":"Eve","score":72},{"student_name":"Alice","score":88},{"student_name":"Bob","score":65}]'::jsonb,
    'SELECT s.student_name, sub.score FROM students s INNER JOIN submissions sub ON s.student_id = sub.student_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","score"]}'::jsonb,
    '{"hints":["INNER JOIN keeps only rows that have a match in both tables","ON specifies the column that links the two tables — student_id appears in both"]}'::jsonb,
    '{"required_columns":["student_name","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"inner_join_two_tables","sequence":9}'::jsonb ),

  -- ── 010 JOIN three tables ─────────────────────────────────────────────────
  ( 'SQL_TEXT_010',
    'JOIN three tables: students, submissions, assignments',
    'Chain two INNER JOINs to show student name, assignment title, and score.',
    'medium', 2::smallint, 5::smallint, 180, 15.00::numeric,
    'Students will be able to chain multiple JOIN clauses to combine data from three tables.',
    'The teacher wants a grade report showing which student submitted which assignment and what score they received.',
    'Write a SQL query to show student_name, assignment_title, and score. Join students, submissions, and assignments.',
    '[{"student_name":"Alice","assignment_title":"SELECT Query Basics","score":95},{"student_name":"Bob","assignment_title":"SELECT Query Basics","score":78},{"student_name":"Diana","assignment_title":"WHERE and Filtering","score":90},{"student_name":"Eve","assignment_title":"WHERE and Filtering","score":72},{"student_name":"Alice","assignment_title":"Algebra Practice","score":88},{"student_name":"Bob","assignment_title":"Algebra Practice","score":65}]'::jsonb,
    'SELECT s.student_name, a.assignment_title, sub.score FROM students s INNER JOIN submissions sub ON s.student_id = sub.student_id INNER JOIN assignments a ON sub.assignment_id = a.assignment_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","assignment_title","score"]}'::jsonb,
    '{"hints":["Chain JOINs one after another","Each JOIN needs its own ON clause","submissions links students (via student_id) and assignments (via assignment_id)"]}'::jsonb,
    '{"required_columns":["student_name","assignment_title","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"multi_join","sequence":10}'::jsonb ),

  -- ── 011 AVG score per student ─────────────────────────────────────────────
  ( 'SQL_TEXT_011',
    'AVG score per student',
    'Calculate the average score for each student across all their submissions.',
    'medium', 2::smallint, 11::smallint, 180, 15.00::numeric,
    'Students will be able to use AVG with GROUP BY to compute a per-group average.',
    'The teacher wants to know each student''s average performance across all submitted assignments.',
    'Write a SQL query to show student_id and the average score (rounded to 2 decimal places) for each student. Name the average column avg_score.',
    '[{"student_id":1,"avg_score":91.50},{"student_id":2,"avg_score":71.50},{"student_id":4,"avg_score":90.00},{"student_id":5,"avg_score":72.00}]'::jsonb,
    'SELECT student_id, ROUND(AVG(score), 2) AS avg_score FROM submissions GROUP BY student_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["AVG(score) calculates the mean score in each group","GROUP BY student_id creates one group per student","ROUND(value, 2) rounds to two decimal places"]}'::jsonb,
    '{"required_columns":["student_id","avg_score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"avg_group_by","sequence":11}'::jsonb ),

  -- ── 012 MAX and MIN score ─────────────────────────────────────────────────
  ( 'SQL_TEXT_012',
    'MAX and MIN score',
    'Find the highest and lowest score ever recorded in the submissions table.',
    'easy', 1::smallint, 11::smallint, 120, 10.00::numeric,
    'Students will be able to use MAX and MIN aggregate functions in a single query.',
    'The exam coordinator needs to know the range of scores achieved by all students.',
    'Write a SQL query to find the highest score (max_score) and lowest score (min_score) from the submissions table.',
    '[{"max_score":95,"min_score":65}]'::jsonb,
    'SELECT MAX(score) AS max_score, MIN(score) AS min_score FROM submissions;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_column_alias":true}'::jsonb,
    '{"hints":["MAX() returns the largest value in a column","MIN() returns the smallest value","Both can appear in the same SELECT"]}'::jsonb,
    '{"required_columns":["max_score","min_score"]}'::jsonb,
    '{"bloom_level":"understand","topic":"max_min_aggregate","sequence":12}'::jsonb ),

  -- ── 013 HAVING clause ────────────────────────────────────────────────────
  ( 'SQL_TEXT_013',
    'Filter groups with HAVING',
    'Use HAVING to filter grade level groups that have more than 2 students.',
    'medium', 2::smallint, 7::smallint, 180, 15.00::numeric,
    'Students will be able to use HAVING to filter aggregated groups after GROUP BY.',
    'The school wants to identify grade levels that are large enough to form their own team — specifically grades with more than 2 students.',
    'Write a SQL query to show grade_level and student_count for grade levels that have more than 2 students.',
    '[{"grade_level":6,"student_count":3}]'::jsonb,
    'SELECT grade_level, COUNT(*) AS student_count FROM students GROUP BY grade_level HAVING COUNT(*) > 2;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["HAVING filters groups after GROUP BY","Use HAVING COUNT(*) > 2, not WHERE","WHERE filters rows before grouping; HAVING filters groups after"]}'::jsonb,
    '{"required_columns":["grade_level","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"having_clause","sequence":13}'::jsonb ),

  -- ── 014 WHERE AND ─────────────────────────────────────────────────────────
  ( 'SQL_TEXT_014',
    'WHERE with AND condition',
    'Use WHERE with AND to filter students who are in Grade 6 AND Section A.',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'Students will be able to combine two filter conditions using AND in a WHERE clause.',
    'The teacher of Grade 6 Section A needs the exact list of students in her class.',
    'Write a SQL query to select all columns from students where grade_level is 6 AND class_section is ''A''.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students WHERE grade_level = 6 AND class_section = ''A'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["AND requires both conditions to be true","Combine grade_level = 6 AND class_section = ''A''"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_and","sequence":14}'::jsonb ),

  -- ── 015 WHERE OR ──────────────────────────────────────────────────────────
  ( 'SQL_TEXT_015',
    'WHERE with OR condition',
    'Use WHERE with OR to find students who are in Grade 5 or in Section B.',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'Students will be able to combine two filter conditions using OR in a WHERE clause.',
    'The sports coordinator wants to invite all Grade 5 students and all Section B students to a special event.',
    'Write a SQL query to select all columns from students where grade_level is 5 OR class_section is ''B''.',
    '[{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students WHERE grade_level = 5 OR class_section = ''B'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["OR returns rows where EITHER condition is true","Diana (grade 6, section B) is included because she is in section B","Eve (grade 5, section A) is included because she is in grade 5"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_or","sequence":15}'::jsonb ),

  -- ── 016 DISTINCT ──────────────────────────────────────────────────────────
  ( 'SQL_TEXT_016',
    'DISTINCT grade levels',
    'Use DISTINCT to retrieve a unique list of grade levels from the students table.',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'Students will be able to use DISTINCT to eliminate duplicate values from a result set.',
    'The registrar wants to know which grade levels exist in the school without listing duplicates.',
    'Write a SQL query to select all distinct grade_level values from the students table.',
    '[{"grade_level":5},{"grade_level":6}]'::jsonb,
    'SELECT DISTINCT grade_level FROM students;',
    '{"full_credit":{"score":10,"condition":"output shows exactly two distinct grade levels"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["DISTINCT removes duplicate values from results","Place DISTINCT immediately after SELECT"]}'::jsonb,
    '{"required_columns":["grade_level"]}'::jsonb,
    '{"bloom_level":"understand","topic":"distinct","sequence":16}'::jsonb ),

  -- ── 017 LIMIT ────────────────────────────────────────────────────────────
  ( 'SQL_TEXT_017',
    'LIMIT number of rows',
    'Use LIMIT to retrieve only the first 3 rows from the students table.',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'Students will be able to use LIMIT to control the maximum number of rows returned.',
    'The system needs to show a preview of the students table showing only the first 3 records.',
    'Write a SQL query to select all columns from the students table but return only the first 3 rows.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"}]'::jsonb,
    'SELECT * FROM students LIMIT 3;',
    '{"full_credit":{"score":10,"condition":"output contains exactly 3 rows"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"row_count","expected_count":3}'::jsonb,
    '{"hints":["LIMIT n restricts the result to at most n rows","Place LIMIT at the end of the query"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"remember","topic":"limit","sequence":17}'::jsonb ),

  -- ── 018 SUM per assignment ────────────────────────────────────────────────
  ( 'SQL_TEXT_018',
    'SUM of scores per assignment',
    'Calculate the total score earned by all students for each assignment.',
    'medium', 2::smallint, 11::smallint, 180, 15.00::numeric,
    'Students will be able to use SUM with GROUP BY to aggregate numeric values per group.',
    'The teacher wants to know the total points scored by all students on each assignment to assess overall class performance.',
    'Write a SQL query to show assignment_id and the sum of scores (total_score) for each assignment in the submissions table.',
    '[{"assignment_id":1,"total_score":173},{"assignment_id":2,"total_score":162},{"assignment_id":3,"total_score":153}]'::jsonb,
    'SELECT assignment_id, SUM(score) AS total_score FROM submissions GROUP BY assignment_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["SUM() adds up all values in a column per group","GROUP BY assignment_id creates one group per assignment"]}'::jsonb,
    '{"required_columns":["assignment_id","total_score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"sum_group_by","sequence":18}'::jsonb ),

  -- ── 019 LEFT JOIN students without submissions ────────────────────────────
  ( 'SQL_TEXT_019',
    'LEFT JOIN to find students without submissions',
    'Use LEFT JOIN to include all students even those who have not submitted anything.',
    'medium', 2::smallint, 13::smallint, 180, 15.00::numeric,
    'Students will be able to use LEFT JOIN to preserve all rows from the left table including unmatched rows.',
    'The teacher needs a complete list of students and their scores. Students who have not submitted anything should also appear in the list with a NULL score.',
    'Write a SQL query using LEFT JOIN to show student_name and score for all students. Students with no submissions should show NULL for score.',
    '[{"student_name":"Alice","score":95},{"student_name":"Alice","score":88},{"student_name":"Bob","score":78},{"student_name":"Bob","score":65},{"student_name":"Charlie","score":null},{"student_name":"Diana","score":90},{"student_name":"Eve","score":72}]'::jsonb,
    'SELECT s.student_name, sub.score FROM students s LEFT JOIN submissions sub ON s.student_id = sub.student_id;',
    '{"full_credit":{"score":15,"condition":"output includes Charlie with NULL score"},"zero_credit":{"condition":"output does not match or Charlie is missing"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","score"]}'::jsonb,
    '{"hints":["LEFT JOIN keeps all rows from the left table (students)","If a student has no matching submission, score will be NULL","INNER JOIN would exclude Charlie entirely"]}'::jsonb,
    '{"required_columns":["student_name","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"left_join","sequence":19}'::jsonb ),

  -- ── 020 Subquery above-average ────────────────────────────────────────────
  ( 'SQL_TEXT_020',
    'Subquery: students with above-average score',
    'Use a subquery to find students whose score is above the overall average.',
    'medium', 2::smallint, 8::smallint, 180, 15.00::numeric,
    'Students will be able to write a correlated or uncorrelated subquery using IN and AVG.',
    'The teacher wants to reward students who scored above the class average on any submission.',
    'Write a SQL query to find student_name for all students who have at least one submission with a score above the overall average score. Use a subquery.',
    '[{"student_name":"Alice"},{"student_name":"Diana"}]'::jsonb,
    'SELECT s.student_name FROM students s WHERE s.student_id IN (SELECT student_id FROM submissions WHERE score > (SELECT AVG(score) FROM submissions));',
    '{"full_credit":{"score":15,"condition":"output shows Alice and Diana only"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name"]}'::jsonb,
    '{"hints":["A subquery is a SELECT inside another SELECT","The inner AVG(score) calculates the overall average: (95+78+90+72+88+65)/6 = 81.33","Use IN(...) to check if a student has a qualifying submission"]}'::jsonb,
    '{"required_columns":["student_name"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"subquery_in","sequence":20}'::jsonb ),

  -- ── 021 CASE WHEN grade label ─────────────────────────────────────────────
  ( 'SQL_TEXT_021',
    'CASE WHEN for score grade',
    'Use CASE WHEN to assign a letter grade (A/B/C) to each submission based on score.',
    'hard', 3::smallint, 9::smallint, 300, 20.00::numeric,
    'Students will be able to use CASE WHEN to create a computed column with conditional logic.',
    'The teacher wants a grade column added to the results: A for score >= 90, B for score >= 75, and C for everything else.',
    'Write a SQL query to show submission_id, score, and a computed grade column: ''A'' if score >= 90, ''B'' if score >= 75, otherwise ''C''.',
    '[{"submission_id":1,"score":95,"grade":"A"},{"submission_id":2,"score":78,"grade":"B"},{"submission_id":3,"score":90,"grade":"A"},{"submission_id":4,"score":72,"grade":"C"},{"submission_id":5,"score":88,"grade":"B"},{"submission_id":6,"score":65,"grade":"C"}]'::jsonb,
    'SELECT submission_id, score, CASE WHEN score >= 90 THEN ''A'' WHEN score >= 75 THEN ''B'' ELSE ''C'' END AS grade FROM submissions;',
    '{"full_credit":{"score":20,"condition":"all grades match expected values"},"partial_credit":{"score":10,"condition":"CASE WHEN structure is correct but threshold is slightly off"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["CASE WHEN condition THEN result ... ELSE default END","Conditions are checked top to bottom — the first matching WHEN wins","ELSE handles all remaining cases"]}'::jsonb,
    '{"required_columns":["submission_id","score","grade"]}'::jsonb,
    '{"bloom_level":"apply","topic":"case_when","sequence":21}'::jsonb ),

  -- ── 022 COUNT per class section ───────────────────────────────────────────
  ( 'SQL_TEXT_022',
    'COUNT students per class section',
    'Count how many students are in each class section.',
    'easy', 1::smallint, 6::smallint, 120, 10.00::numeric,
    'Students will be able to use GROUP BY with COUNT to summarize data by a text category.',
    'The school needs a headcount report broken down by class section for capacity planning.',
    'Write a SQL query to show each class_section and the number of students (student_count) in that section.',
    '[{"class_section":"A","student_count":3},{"class_section":"B","student_count":2}]'::jsonb,
    'SELECT class_section, COUNT(*) AS student_count FROM students GROUP BY class_section;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["GROUP BY class_section groups students by section","COUNT(*) counts how many students are in each group"]}'::jsonb,
    '{"required_columns":["class_section","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"group_by_text","sequence":22}'::jsonb ),

  -- ── 023 ORDER BY multiple columns ────────────────────────────────────────
  ( 'SQL_TEXT_023',
    'ORDER BY multiple columns',
    'Sort students by grade level descending, then by student name ascending within the same grade.',
    'medium', 2::smallint, 3::smallint, 180, 15.00::numeric,
    'Students will be able to specify multiple sort columns in ORDER BY to produce a stable ordering.',
    'The school wants a ranked list sorted first by grade (highest first) and then alphabetically within each grade.',
    'Write a SQL query to select all columns from students ordered by grade_level descending, then by student_name ascending.',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students ORDER BY grade_level DESC, student_name ASC;',
    '{"full_credit":{"score":15,"condition":"output matches expected order exactly"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false}'::jsonb,
    '{"hints":["Separate multiple sort columns with a comma","Each column can have its own ASC or DESC direction","grade_level DESC sorts grades 6 before 5; within grade 6, student_name ASC sorts alphabetically"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"apply","topic":"order_by_multi","sequence":23}'::jsonb ),

  -- ── 024 JOIN + GROUP BY submission count ──────────────────────────────────
  ( 'SQL_TEXT_024',
    'JOIN with GROUP BY: submission count per student',
    'Show every student and how many submissions they have made, including students with zero.',
    'hard', 3::smallint, 5::smallint, 300, 20.00::numeric,
    'Students will be able to combine LEFT JOIN with GROUP BY and COUNT to produce a per-student count that includes zeros.',
    'The teacher wants to check student participation. Students who have not submitted anything should show a count of 0.',
    'Write a SQL query using LEFT JOIN to show student_name and submission_count for every student. Students with no submissions should show 0.',
    '[{"student_name":"Alice","submission_count":2},{"student_name":"Bob","submission_count":2},{"student_name":"Charlie","submission_count":0},{"student_name":"Diana","submission_count":1},{"student_name":"Eve","submission_count":1}]'::jsonb,
    'SELECT s.student_name, COUNT(sub.submission_id) AS submission_count FROM students s LEFT JOIN submissions sub ON s.student_id = sub.student_id GROUP BY s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"Charlie shows 0; all counts are correct"},"partial_credit":{"score":10,"condition":"counts are correct but Charlie is missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(sub.submission_id) counts non-NULL values — a student with no submissions gets 0","LEFT JOIN is required so Charlie appears even with no submissions","GROUP BY both student_id and student_name to avoid grouping errors"]}'::jsonb,
    '{"required_columns":["student_name","submission_count"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"left_join_group_by","sequence":24}'::jsonb ),

  -- ── 025 Top scorers per course ────────────────────────────────────────────
  ( 'SQL_TEXT_025',
    'Full pipeline: top scorers per course',
    'Join four tables to find each student''s maximum score per course.',
    'hard', 3::smallint, 5::smallint, 300, 20.00::numeric,
    'Students will be able to join multiple tables and combine GROUP BY with MAX to produce an aggregated multi-table report.',
    'The academic committee wants to recognise the highest-scoring student in each course for each assignment. Show course name, student name, and their maximum score per course.',
    'Write a SQL query to show course_name, student_name, and max_score. Join courses, assignments, submissions, and students. Group by course and student.',
    '[{"course_name":"Database Basics","student_name":"Alice","max_score":95},{"course_name":"Database Basics","student_name":"Bob","max_score":78},{"course_name":"Database Basics","student_name":"Diana","max_score":90},{"course_name":"Database Basics","student_name":"Eve","max_score":72},{"course_name":"Mathematics","student_name":"Alice","max_score":88},{"course_name":"Mathematics","student_name":"Bob","max_score":65}]'::jsonb,
    'SELECT c.course_name, s.student_name, MAX(sub.score) AS max_score FROM courses c INNER JOIN assignments a ON c.course_id = a.course_id INNER JOIN submissions sub ON a.assignment_id = sub.assignment_id INNER JOIN students s ON sub.student_id = s.student_id GROUP BY c.course_id, c.course_name, s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"output matches expected result"},"partial_credit":{"score":10,"condition":"joins are correct but grouping is incomplete"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true,"required_columns":["course_name","student_name","max_score"]}'::jsonb,
    '{"hints":["Join 4 tables step by step: courses → assignments → submissions → students","GROUP BY must include both course and student identifiers","MAX(score) per (course, student) group gives the best score per student per course"]}'::jsonb,
    '{"required_columns":["course_name","student_name","max_score"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_join_max","sequence":25}'::jsonb ),

  -- ── 026 Assignments with no submissions ───────────────────────────────────
  ( 'SQL_TEXT_026',
    'Find assignments with no submissions',
    'Use LEFT JOIN and IS NULL to find assignments that have not been submitted by anyone.',
    'medium', 2::smallint, 13::smallint, 180, 15.00::numeric,
    'Students will be able to use LEFT JOIN with IS NULL to identify unmatched rows (anti-join pattern).',
    'The teacher wants to identify any assignments that no student has attempted yet — these may need to be re-announced.',
    'Write a SQL query to find assignment_id and assignment_title for assignments that have no entries in the submissions table.',
    '[{"assignment_id":4,"assignment_title":"Reading Comprehension"}]'::jsonb,
    'SELECT a.assignment_id, a.assignment_title FROM assignments a LEFT JOIN submissions sub ON a.assignment_id = sub.assignment_id WHERE sub.submission_id IS NULL;',
    '{"full_credit":{"score":15,"condition":"output shows only assignment 4"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["assignment_id","assignment_title"]}'::jsonb,
    '{"hints":["LEFT JOIN keeps all assignments even those with no submissions","WHERE sub.submission_id IS NULL keeps only the unmatched rows","This is called an anti-join pattern"]}'::jsonb,
    '{"required_columns":["assignment_id","assignment_title"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"anti_join","sequence":26}'::jsonb ),

  -- ── 027 Course-level average score report ────────────────────────────────
  ( 'SQL_TEXT_027',
    'Course-level average score report',
    'Join courses, assignments, and submissions to show the average score per course.',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'Students will be able to join three tables and aggregate data at the course level, handling courses with no submissions via LEFT JOIN.',
    'The academic board wants to compare course difficulty by looking at the average submission score across all assignments in each course.',
    'Write a SQL query to show course_name and the average score (avg_score, rounded to 2 decimal places) for each course. Courses with no submissions should show NULL.',
    '[{"course_name":"Database Basics","avg_score":83.75},{"course_name":"Mathematics","avg_score":76.50},{"course_name":"English","avg_score":null}]'::jsonb,
    'SELECT c.course_name, ROUND(AVG(sub.score), 2) AS avg_score FROM courses c LEFT JOIN assignments a ON c.course_id = a.course_id LEFT JOIN submissions sub ON a.assignment_id = sub.assignment_id GROUP BY c.course_id, c.course_name;',
    '{"full_credit":{"score":20,"condition":"all three courses appear; English shows NULL avg"},"partial_credit":{"score":10,"condition":"averages are correct but English is missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["Use LEFT JOIN so English (no submissions) still appears","GROUP BY course to get one row per course","AVG across multiple assignments in the same course includes all submissions for that course"]}'::jsonb,
    '{"required_columns":["course_name","avg_score"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_join_avg","sequence":27}'::jsonb ),

  -- ── 028 Student pass/fail summary ────────────────────────────────────────
  ( 'SQL_TEXT_028',
    'Student pass/fail summary',
    'Combine AVG with CASE WHEN to produce a pass or fail result for each student.',
    'hard', 3::smallint, 9::smallint, 300, 20.00::numeric,
    'Students will be able to combine aggregate functions with conditional logic to classify rows.',
    'The teacher wants a summary report: each student''s average score and whether they pass (avg >= 75) or fail.',
    'Write a SQL query to show student_name, avg_score (rounded to 2 decimal places), and result (''PASS'' if avg_score >= 75, otherwise ''FAIL'') for all students including those with no submissions.',
    '[{"student_name":"Alice","avg_score":91.50,"result":"PASS"},{"student_name":"Bob","avg_score":71.50,"result":"FAIL"},{"student_name":"Charlie","avg_score":null,"result":"FAIL"},{"student_name":"Diana","avg_score":90.00,"result":"PASS"},{"student_name":"Eve","avg_score":72.00,"result":"FAIL"}]'::jsonb,
    'SELECT s.student_name, ROUND(AVG(sub.score), 2) AS avg_score, CASE WHEN AVG(sub.score) >= 75 THEN ''PASS'' ELSE ''FAIL'' END AS result FROM students s LEFT JOIN submissions sub ON s.student_id = sub.student_id GROUP BY s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"all students appear with correct pass/fail; Charlie is FAIL with null avg"},"partial_credit":{"score":10,"condition":"CASE WHEN logic is correct but some students are missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["Use LEFT JOIN so Charlie (no submissions) appears","CASE WHEN AVG(score) >= 75 works inside SELECT after GROUP BY","A student with NULL avg gets FAIL because NULL >= 75 evaluates to NULL (not true)"]}'::jsonb,
    '{"required_columns":["student_name","avg_score","result"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"aggregate_case_when","sequence":28}'::jsonb ),

  -- ── 029 Teacher workload summary ──────────────────────────────────────────
  ( 'SQL_TEXT_029',
    'Teacher workload summary by course',
    'Summarise how many courses and assignments each teacher is responsible for.',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'Students will be able to join tables and use multiple aggregate functions in a single GROUP BY query.',
    'The principal wants to review teacher workload — specifically how many courses each teacher handles and how many total assignments they have.',
    'Write a SQL query to show teacher_name, the number of courses they teach (course_count), and the total number of assignments across all their courses (assignment_count).',
    '[{"teacher_name":"Teacher Somsak","course_count":1,"assignment_count":2},{"teacher_name":"Teacher Wanna","course_count":1,"assignment_count":1},{"teacher_name":"Teacher Nok","course_count":1,"assignment_count":1}]'::jsonb,
    'SELECT c.teacher_name, COUNT(DISTINCT c.course_id) AS course_count, COUNT(a.assignment_id) AS assignment_count FROM courses c LEFT JOIN assignments a ON c.course_id = a.course_id GROUP BY c.teacher_name;',
    '{"full_credit":{"score":20,"condition":"output matches expected result"},"partial_credit":{"score":10,"condition":"teacher_name and assignment_count are correct but course_count is wrong"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(DISTINCT c.course_id) counts unique courses per teacher","COUNT(a.assignment_id) counts all assignments linked to those courses","LEFT JOIN ensures teachers with no assignments still appear"]}'::jsonb,
    '{"required_columns":["teacher_name","course_count","assignment_count"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_aggregate","sequence":29}'::jsonb ),

  -- ── 030 Final mixed report ────────────────────────────────────────────────
  ( 'SQL_TEXT_030',
    'Final mixed report: student, course, assignment, score, status',
    'Join all four tables to produce a complete grade report with a pass/fail status column.',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'Students will be able to join four tables and add a computed status column using CASE WHEN.',
    'The school wants a full grade report: for every submission, show the student name, course name, assignment title, score, and whether the student passed that assignment (score >= 75).',
    'Write a SQL query to show student_name, course_name, assignment_title, score, and status (''PASS'' if score >= 75, otherwise ''FAIL''). Join all four tables.',
    '[{"student_name":"Alice","course_name":"Database Basics","assignment_title":"SELECT Query Basics","score":95,"status":"PASS"},{"student_name":"Bob","course_name":"Database Basics","assignment_title":"SELECT Query Basics","score":78,"status":"PASS"},{"student_name":"Diana","course_name":"Database Basics","assignment_title":"WHERE and Filtering","score":90,"status":"PASS"},{"student_name":"Eve","course_name":"Database Basics","assignment_title":"WHERE and Filtering","score":72,"status":"FAIL"},{"student_name":"Alice","course_name":"Mathematics","assignment_title":"Algebra Practice","score":88,"status":"PASS"},{"student_name":"Bob","course_name":"Mathematics","assignment_title":"Algebra Practice","score":65,"status":"FAIL"}]'::jsonb,
    'SELECT s.student_name, c.course_name, a.assignment_title, sub.score, CASE WHEN sub.score >= 75 THEN ''PASS'' ELSE ''FAIL'' END AS status FROM students s INNER JOIN submissions sub ON s.student_id = sub.student_id INNER JOIN assignments a ON sub.assignment_id = a.assignment_id INNER JOIN courses c ON a.course_id = c.course_id;',
    '{"full_credit":{"score":20,"condition":"all 6 rows appear with correct status values"},"partial_credit":{"score":10,"condition":"joins are correct but CASE WHEN status is missing or wrong"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true,"required_columns":["student_name","course_name","assignment_title","score","status"]}'::jsonb,
    '{"hints":["Join 4 tables: students → submissions → assignments → courses","CASE WHEN score >= 75 THEN ''PASS'' ELSE ''FAIL'' END creates the status column","INNER JOIN is correct here — only students with submissions appear"]}'::jsonb,
    '{"required_columns":["student_name","course_name","assignment_title","score","status"]}'::jsonb,
    '{"bloom_level":"create","topic":"full_report","sequence":30}'::jsonb )

)
insert into public.mst_tasks (
  task_code, task_title, task_description, task_type,
  difficulty_level, task_type_id, difficulty_level_id, skill_area_id,
  task_status_id, task_status, is_active,
  estimated_time_seconds, max_score,
  learning_objective, problem_statement, instruction_text,
  database_schema_json, sample_data_json,
  expected_output_json, expected_sql,
  scoring_rubric_json, grading_rules_json, hint_json, answer_format_json, metadata_json
)
select
  t.task_code, t.task_title, t.task_description, 'sql_text',
  t.difficulty_level, 1, t.difficulty_level_id, t.skill_area_id,
  4, 'published', true,
  t.estimated_time_seconds, t.max_score,
  t.learning_objective, t.problem_statement, t.instruction_text,
  j.schema_json, j.sample_json,
  t.expected_output_json, t.expected_sql,
  t.scoring_rubric_json, t.grading_rules_json, t.hint_json, t.answer_format_json, t.metadata_json
from task_rows t
cross join shared_json j
on conflict (task_code) do update set
  task_title             = excluded.task_title,
  task_description       = excluded.task_description,
  task_type              = excluded.task_type,
  difficulty_level       = excluded.difficulty_level,
  task_type_id           = excluded.task_type_id,
  difficulty_level_id    = excluded.difficulty_level_id,
  skill_area_id          = excluded.skill_area_id,
  task_status_id         = excluded.task_status_id,
  task_status            = excluded.task_status,
  is_active              = excluded.is_active,
  estimated_time_seconds = excluded.estimated_time_seconds,
  max_score              = excluded.max_score,
  learning_objective     = excluded.learning_objective,
  problem_statement      = excluded.problem_statement,
  instruction_text       = excluded.instruction_text,
  database_schema_json   = excluded.database_schema_json,
  sample_data_json       = excluded.sample_data_json,
  expected_output_json   = excluded.expected_output_json,
  expected_sql           = excluded.expected_sql,
  scoring_rubric_json    = excluded.scoring_rubric_json,
  grading_rules_json     = excluded.grading_rules_json,
  hint_json              = excluded.hint_json,
  answer_format_json     = excluded.answer_format_json,
  metadata_json          = excluded.metadata_json,
  updated_at             = now();


-- =============================================================================
-- PART 3: Map all 30 tasks into Assignment Set (task_order 1–30, all required)
-- =============================================================================

insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required, is_active)
select
  b.batch_id,
  t.task_id,
  m.task_order,
  true,
  true
from (
  values
    ('SQL_TEXT_001',  1), ('SQL_TEXT_002',  2), ('SQL_TEXT_003',  3),
    ('SQL_TEXT_004',  4), ('SQL_TEXT_005',  5), ('SQL_TEXT_006',  6),
    ('SQL_TEXT_007',  7), ('SQL_TEXT_008',  8), ('SQL_TEXT_009',  9),
    ('SQL_TEXT_010', 10), ('SQL_TEXT_011', 11), ('SQL_TEXT_012', 12),
    ('SQL_TEXT_013', 13), ('SQL_TEXT_014', 14), ('SQL_TEXT_015', 15),
    ('SQL_TEXT_016', 16), ('SQL_TEXT_017', 17), ('SQL_TEXT_018', 18),
    ('SQL_TEXT_019', 19), ('SQL_TEXT_020', 20), ('SQL_TEXT_021', 21),
    ('SQL_TEXT_022', 22), ('SQL_TEXT_023', 23), ('SQL_TEXT_024', 24),
    ('SQL_TEXT_025', 25), ('SQL_TEXT_026', 26), ('SQL_TEXT_027', 27),
    ('SQL_TEXT_028', 28), ('SQL_TEXT_029', 29), ('SQL_TEXT_030', 30)
) as m(task_code, task_order)
inner join public.mst_tasks              t on t.task_code  = m.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'SQL_ASSIGNMENT_BASIC_001'
on conflict (batch_id, task_id) do update set
  task_order  = excluded.task_order,
  is_required = excluded.is_required,
  is_active   = excluded.is_active,
  updated_at  = now();


-- =============================================================================
-- PART 4: Map 10 selected tasks into Exam Set (task_order 1–10)
--
-- Selected tasks span easy → hard to test the full skill range:
--   001 SELECT all         (easy  / basic_select)
--   003 WHERE grade        (easy  / where_filter)
--   005 ORDER BY name      (easy  / order_by)
--   010 Three-table JOIN   (medium/ multi_join)
--   013 HAVING             (medium/ having)
--   015 WHERE OR           (easy  / where_filter)
--   018 SUM per assignment (medium/ aggregation)
--   020 Subquery avg       (medium/ subquery)
--   025 Top scorers        (hard  / multi_join)
--   030 Full mixed report  (hard  / full_report)
-- =============================================================================

insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required, is_active)
select
  b.batch_id,
  t.task_id,
  m.task_order,
  true,
  true
from (
  values
    ('SQL_TEXT_001',  1),
    ('SQL_TEXT_003',  2),
    ('SQL_TEXT_005',  3),
    ('SQL_TEXT_010',  4),
    ('SQL_TEXT_013',  5),
    ('SQL_TEXT_015',  6),
    ('SQL_TEXT_018',  7),
    ('SQL_TEXT_020',  8),
    ('SQL_TEXT_025',  9),
    ('SQL_TEXT_030', 10)
) as m(task_code, task_order)
inner join public.mst_tasks              t on t.task_code  = m.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'SQL_EXAM_BASIC_001'
on conflict (batch_id, task_id) do update set
  task_order  = excluded.task_order,
  is_required = excluded.is_required,
  is_active   = excluded.is_active,
  updated_at  = now();
