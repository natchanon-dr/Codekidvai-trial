-- =============================================================================
-- Seed: Stored Procedure Task Bank (10 tasks)
-- Scenario: School management system (same schema as SQL_TEXT tasks)
--
-- expected_procedure stores a complete PostgreSQL CREATE OR REPLACE FUNCTION block.
-- task_type = 'stored_procedure', task_type_id = 3
-- =============================================================================

insert into public.mst_tasks (
  task_code, task_title, task_type, difficulty_level,
  task_type_id, difficulty_level_id, skill_area_id, task_status_id,
  task_status, is_active, estimated_time_seconds,
  instruction_text, expected_procedure,
  database_schema_json, sample_data_json, expected_output_json,
  grading_rules_json, hint_json, answer_format_json, metadata_json
)
values

-- ── Task SP_001 ──────────────────────────────────────────────────────────────
('SQL_PROC_001',
 'Procedure: get student by ID',
 'stored_procedure', 'easy',
 3, 1, 15, 4,
 'published', true, 120,
 'Write a PostgreSQL function get_student_by_id(p_student_id INT) that returns the students row for the given student_id.',
 $sp$CREATE OR REPLACE FUNCTION get_student_by_id(p_student_id INT)
RETURNS TABLE(student_id INT, name TEXT, grade_level INT, class_section TEXT)
LANGUAGE sql STABLE AS $$
  SELECT student_id, name, grade_level, class_section
  FROM students
  WHERE student_id = p_student_id;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name","grade_level","class_section"]}]}',
 '{"students":[{"student_id":1,"name":"Alice","grade_level":6,"class_section":"A"}]}',
 '[{"student_id":1,"name":"Alice","grade_level":6,"class_section":"A"}]',
 '{"check_type":"function_call","call":"SELECT * FROM get_student_by_id(1)","expected_rows":1}',
 '{"hints":["RETURNS TABLE lists the columns returned","WHERE filters to the input ID"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"basic_function","bloom_level":"apply"}'),

-- ── Task SP_002 ──────────────────────────────────────────────────────────────
('SQL_PROC_002',
 'Procedure: get students by grade level',
 'stored_procedure', 'easy',
 3, 1, 15, 4,
 'published', true, 120,
 'Write a function get_students_by_grade(p_grade INT) that returns all students with the given grade_level.',
 $sp$CREATE OR REPLACE FUNCTION get_students_by_grade(p_grade INT)
RETURNS TABLE(student_id INT, name TEXT, grade_level INT, class_section TEXT)
LANGUAGE sql STABLE AS $$
  SELECT student_id, name, grade_level, class_section
  FROM students
  WHERE grade_level = p_grade;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name","grade_level","class_section"]}]}',
 '{"students":[{"student_id":1,"name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"name":"Bob","grade_level":6,"class_section":"A"}]}',
 '[{"student_id":1,"name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"name":"Bob","grade_level":6,"class_section":"A"}]',
 '{"check_type":"function_call","call":"SELECT * FROM get_students_by_grade(6)","expected_min_rows":1}',
 '{"hints":["The parameter p_grade is compared to grade_level in WHERE"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"parameter_function","bloom_level":"apply"}'),

-- ── Task SP_003 ──────────────────────────────────────────────────────────────
('SQL_PROC_003',
 'Procedure: count students per section',
 'stored_procedure', 'easy',
 3, 1, 15, 4,
 'published', true, 120,
 'Write a function count_students_per_section() that returns class_section and the count of students in each section.',
 $sp$CREATE OR REPLACE FUNCTION count_students_per_section()
RETURNS TABLE(class_section TEXT, student_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT class_section, COUNT(*) AS student_count
  FROM students
  GROUP BY class_section;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name","grade_level","class_section"]}]}',
 '{"students":[{"class_section":"A","count":3},{"class_section":"B","count":2}]}',
 '[{"class_section":"A","student_count":3},{"class_section":"B","student_count":2}]',
 '{"check_type":"function_call","call":"SELECT * FROM count_students_per_section()","ignore_row_order":true}',
 '{"hints":["No input parameters needed","COUNT(*) returns BIGINT by default"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"aggregate_function","bloom_level":"apply"}'),

-- ── Task SP_004 ──────────────────────────────────────────────────────────────
('SQL_PROC_004',
 'Procedure: get average score by student',
 'stored_procedure', 'medium',
 3, 2, 15, 4,
 'published', true, 180,
 'Write a function get_avg_score_by_student(p_student_id INT) that returns the average score for that student.',
 $sp$CREATE OR REPLACE FUNCTION get_avg_score_by_student(p_student_id INT)
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(score), 2)
  FROM submissions
  WHERE student_id = p_student_id;
$$;$sp$,
 '{"tables":[{"name":"submissions","columns":["submission_id","student_id","assignment_id","score"]}]}',
 '{"submissions":[{"student_id":1,"score":95},{"student_id":1,"score":85}]}',
 '[{"round":90.00}]',
 '{"check_type":"function_call","call":"SELECT get_avg_score_by_student(1)","expected_value":90.00}',
 '{"hints":["RETURNS NUMERIC for a single scalar value","ROUND(AVG(...), 2) rounds to 2 decimal places"]}',
 '{"type":"function","return_type":"NUMERIC"}',
 '{"topic":"scalar_function","bloom_level":"apply"}'),

-- ── Task SP_005 ──────────────────────────────────────────────────────────────
('SQL_PROC_005',
 'Procedure: get top N students by score',
 'stored_procedure', 'medium',
 3, 2, 15, 4,
 'published', true, 180,
 'Write a function get_top_students(p_limit INT) that returns student names and their average score, ordered by avg_score descending, limited to p_limit rows.',
 $sp$CREATE OR REPLACE FUNCTION get_top_students(p_limit INT)
RETURNS TABLE(name TEXT, avg_score NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT s.name, ROUND(AVG(sub.score), 2) AS avg_score
  FROM students s
  INNER JOIN submissions sub ON s.student_id = sub.student_id
  GROUP BY s.student_id, s.name
  ORDER BY avg_score DESC
  LIMIT p_limit;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name"]},{"name":"submissions","columns":["submission_id","student_id","score"]}]}',
 '{"students":[{"student_id":1,"name":"Alice"},{"student_id":2,"name":"Bob"}],"submissions":[{"student_id":1,"score":95},{"student_id":2,"score":78}]}',
 '[{"name":"Alice","avg_score":95.00}]',
 '{"check_type":"function_call","call":"SELECT * FROM get_top_students(1)","expected_rows":1}',
 '{"hints":["LIMIT p_limit uses the parameter value","ORDER BY must come before LIMIT"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"limit_parameter","bloom_level":"analyze"}'),

-- ── Task SP_006 ──────────────────────────────────────────────────────────────
('SQL_PROC_006',
 'Procedure: get submissions for assignment',
 'stored_procedure', 'medium',
 3, 2, 15, 4,
 'published', true, 180,
 'Write a function get_submissions_for_assignment(p_assignment_id INT) that returns student name and score for all submissions for that assignment.',
 $sp$CREATE OR REPLACE FUNCTION get_submissions_for_assignment(p_assignment_id INT)
RETURNS TABLE(name TEXT, score NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT s.name, sub.score
  FROM students s
  INNER JOIN submissions sub ON s.student_id = sub.student_id
  WHERE sub.assignment_id = p_assignment_id;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name"]},{"name":"submissions","columns":["submission_id","student_id","assignment_id","score"]}]}',
 '{"students":[{"student_id":1,"name":"Alice"},{"student_id":2,"name":"Bob"}],"submissions":[{"student_id":1,"assignment_id":1,"score":95},{"student_id":2,"assignment_id":1,"score":78}]}',
 '[{"name":"Alice","score":95},{"name":"Bob","score":78}]',
 '{"check_type":"function_call","call":"SELECT * FROM get_submissions_for_assignment(1)","ignore_row_order":true}',
 '{"hints":["JOIN students to submissions on student_id","Filter by assignment_id = p_assignment_id"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"join_function","bloom_level":"apply"}'),

-- ── Task SP_007 ──────────────────────────────────────────────────────────────
('SQL_PROC_007',
 'Procedure: check if student passed',
 'stored_procedure', 'medium',
 3, 2, 15, 4,
 'published', true, 180,
 'Write a function student_passed(p_student_id INT, p_pass_score NUMERIC) that returns TRUE if the student''s average score is >= p_pass_score, otherwise FALSE.',
 $sp$CREATE OR REPLACE FUNCTION student_passed(p_student_id INT, p_pass_score NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(AVG(score), 0) >= p_pass_score
  FROM submissions
  WHERE student_id = p_student_id;
$$;$sp$,
 '{"tables":[{"name":"submissions","columns":["submission_id","student_id","score"]}]}',
 '{"submissions":[{"student_id":1,"score":95},{"student_id":1,"score":85}]}',
 '[{"student_passed":true}]',
 '{"check_type":"function_call","call":"SELECT student_passed(1, 80)","expected_value":true}',
 '{"hints":["Comparison expressions return BOOLEAN directly","COALESCE handles students with no submissions"]}',
 '{"type":"function","return_type":"BOOLEAN"}',
 '{"topic":"boolean_function","bloom_level":"analyze"}'),

-- ── Task SP_008 ──────────────────────────────────────────────────────────────
('SQL_PROC_008',
 'Procedure: get course summary',
 'stored_procedure', 'hard',
 3, 3, 15, 4,
 'published', true, 300,
 'Write a function get_course_summary(p_course_id INT) that returns course_name, total_students enrolled, and average_score across all submissions for that course.',
 $sp$CREATE OR REPLACE FUNCTION get_course_summary(p_course_id INT)
RETURNS TABLE(course_name TEXT, total_students BIGINT, average_score NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT
    c.course_name,
    COUNT(DISTINCT e.student_id) AS total_students,
    ROUND(AVG(sub.score), 2) AS average_score
  FROM courses c
  LEFT JOIN enrollments e ON c.course_id = e.course_id
  LEFT JOIN assignments a ON c.course_id = a.course_id
  LEFT JOIN submissions sub ON a.assignment_id = sub.assignment_id
  WHERE c.course_id = p_course_id
  GROUP BY c.course_id, c.course_name;
$$;$sp$,
 '{"tables":[{"name":"courses","columns":["course_id","course_name","teacher_name"]},{"name":"enrollments","columns":["enrollment_id","student_id","course_id","enrolled_at"]},{"name":"assignments","columns":["assignment_id","course_id","title"]},{"name":"submissions","columns":["submission_id","student_id","assignment_id","score"]}]}',
 '{"courses":[{"course_id":1,"course_name":"Database Basics"}],"enrollments":[{"student_id":1,"course_id":1},{"student_id":2,"course_id":1}],"assignments":[{"assignment_id":1,"course_id":1}],"submissions":[{"student_id":1,"assignment_id":1,"score":95},{"student_id":2,"assignment_id":1,"score":78}]}',
 '[{"course_name":"Database Basics","total_students":2,"average_score":86.50}]',
 '{"check_type":"function_call","call":"SELECT * FROM get_course_summary(1)","required_columns":["course_name","total_students","average_score"]}',
 '{"hints":["COUNT(DISTINCT e.student_id) avoids double-counting enrolled students","LEFT JOIN keeps the course even if no submissions exist"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"multi_join_function","bloom_level":"analyze"}'),

-- ── Task SP_009 ──────────────────────────────────────────────────────────────
('SQL_PROC_009',
 'Procedure: update student grade level',
 'stored_procedure', 'hard',
 3, 3, 15, 4,
 'published', true, 300,
 'Write a procedure promote_student(p_student_id INT) that increments grade_level by 1 for the given student and returns the new grade_level.',
 $sp$CREATE OR REPLACE FUNCTION promote_student(p_student_id INT)
RETURNS INT
LANGUAGE sql AS $$
  UPDATE students
  SET grade_level = grade_level + 1
  WHERE student_id = p_student_id
  RETURNING grade_level;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name","grade_level","class_section"]}]}',
 '{"students":[{"student_id":1,"name":"Alice","grade_level":6}]}',
 '[{"promote_student":7}]',
 '{"check_type":"function_call","call":"SELECT promote_student(1)","expected_value":7,"note":"assumes starting grade_level=6"}',
 '{"hints":["UPDATE with RETURNING returns the modified value","Omit STABLE because this function writes data"]}',
 '{"type":"function","return_type":"INT"}',
 '{"topic":"update_function","bloom_level":"analyze"}'),

-- ── Task SP_010 ──────────────────────────────────────────────────────────────
('SQL_PROC_010',
 'Procedure: full student report',
 'stored_procedure', 'hard',
 3, 3, 15, 4,
 'published', true, 300,
 'Write a function get_student_report(p_student_id INT) that returns the student name, total submissions, average score, max score, and min score.',
 $sp$CREATE OR REPLACE FUNCTION get_student_report(p_student_id INT)
RETURNS TABLE(name TEXT, total_submissions BIGINT, avg_score NUMERIC, max_score NUMERIC, min_score NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT
    s.name,
    COUNT(sub.submission_id) AS total_submissions,
    ROUND(AVG(sub.score), 2) AS avg_score,
    MAX(sub.score) AS max_score,
    MIN(sub.score) AS min_score
  FROM students s
  LEFT JOIN submissions sub ON s.student_id = sub.student_id
  WHERE s.student_id = p_student_id
  GROUP BY s.student_id, s.name;
$$;$sp$,
 '{"tables":[{"name":"students","columns":["student_id","name"]},{"name":"submissions","columns":["submission_id","student_id","score"]}]}',
 '{"students":[{"student_id":1,"name":"Alice"}],"submissions":[{"student_id":1,"score":95},{"student_id":1,"score":85}]}',
 '[{"name":"Alice","total_submissions":2,"avg_score":90.00,"max_score":95,"min_score":85}]',
 '{"check_type":"function_call","call":"SELECT * FROM get_student_report(1)","required_columns":["name","total_submissions","avg_score","max_score","min_score"]}',
 '{"hints":["Combine multiple aggregate functions in one SELECT","LEFT JOIN so a student with no submissions still appears"]}',
 '{"type":"function","return_type":"TABLE"}',
 '{"topic":"full_report_function","bloom_level":"analyze"}')

on conflict (task_code) do update set
  task_title              = excluded.task_title,
  task_type               = excluded.task_type,
  difficulty_level        = excluded.difficulty_level,
  task_type_id            = excluded.task_type_id,
  difficulty_level_id     = excluded.difficulty_level_id,
  skill_area_id           = excluded.skill_area_id,
  task_status_id          = excluded.task_status_id,
  task_status             = excluded.task_status,
  is_active               = excluded.is_active,
  estimated_time_seconds  = excluded.estimated_time_seconds,
  instruction_text        = excluded.instruction_text,
  expected_procedure      = excluded.expected_procedure,
  database_schema_json    = excluded.database_schema_json,
  sample_data_json        = excluded.sample_data_json,
  expected_output_json    = excluded.expected_output_json,
  grading_rules_json      = excluded.grading_rules_json,
  hint_json               = excluded.hint_json,
  answer_format_json      = excluded.answer_format_json,
  metadata_json           = excluded.metadata_json,
  updated_at              = now();
