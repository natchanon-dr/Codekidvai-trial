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
    'แสดงข้อมูลนักเรียนทั้งหมด',
    'ดึงข้อมูลทุกแถวและทุกคอลัมน์จากตาราง students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถดึงข้อมูลทุกแถวและทุกคอลัมน์จากตารางเดียวได้โดยใช้ SELECT *',
    'ผู้ดูแลระบบของโรงเรียนต้องการดูรายชื่อนักเรียนทั้งหมด ซึ่งประกอบด้วยรหัสนักเรียน ชื่อ ระดับชั้น และห้องเรียน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง students',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["ใช้ SELECT * เพื่อเลือกทุกคอลัมน์","ชื่อตารางระบุหลัง FROM"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"remember","topic":"basic_select","sequence":1}'::jsonb ),

  -- ── 002 SELECT specific columns ───────────────────────────────────────────
  ( 'SQL_TEXT_002',
    'เลือกเฉพาะบางคอลัมน์จากตาราง students',
    'ดึงเฉพาะคอลัมน์ student_id และ student_name จากตาราง students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถระบุคอลัมน์ที่ต้องการแสดงผลได้ แทนที่จะเลือกทุกคอลัมน์',
    'ผู้ดูแลต้องการเพียงรายชื่อนักเรียน ได้แก่ รหัสนักเรียนและชื่อ โดยไม่ต้องการข้อมูลระดับชั้นและห้องเรียน',
    'เขียนคำสั่ง SQL เพื่อเลือกเฉพาะคอลัมน์ student_id และ student_name จากตาราง students',
    '[{"student_id":1,"student_name":"Alice"},{"student_id":2,"student_name":"Bob"},{"student_id":3,"student_name":"Charlie"},{"student_id":4,"student_name":"Diana"},{"student_id":5,"student_name":"Eve"}]'::jsonb,
    'SELECT student_id, student_name FROM students;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_id","student_name"]}'::jsonb,
    '{"hints":["ระบุชื่อคอลัมน์คั่นด้วยเครื่องหมายจุลภาค (,) หลัง SELECT","ไม่ต้องใช้ * เมื่อต้องการเฉพาะบางคอลัมน์"]}'::jsonb,
    '{"required_columns":["student_id","student_name"]}'::jsonb,
    '{"bloom_level":"remember","topic":"column_selection","sequence":2}'::jsonb ),

  -- ── 003 Filter by grade level ──────────────────────────────────────────────
  ( 'SQL_TEXT_003',
    'กรองนักเรียนตามระดับชั้น',
    'ใช้ WHERE เพื่อดึงเฉพาะนักเรียนที่อยู่ในระดับชั้น 6',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถกรองแถวข้อมูลโดยใช้ WHERE ร่วมกับเงื่อนไขเปรียบเทียบค่าตัวเลข',
    'ครูต้องการดูเฉพาะนักเรียนชั้น 6 สำหรับกิจกรรมที่กำลังจะมาถึง',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง students โดยกรองเฉพาะแถวที่ grade_level เท่ากับ 6',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"}]'::jsonb,
    'SELECT * FROM students WHERE grade_level = 6;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["ใช้ WHERE เพื่อกรองแถวข้อมูล","grade_level = 6 เปรียบเทียบตัวเลข ไม่ต้องใส่เครื่องหมายคำพูด"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_filter","sequence":3}'::jsonb ),

  -- ── 004 Filter by class section ───────────────────────────────────────────
  ( 'SQL_TEXT_004',
    'กรองนักเรียนตามห้องเรียน',
    'ใช้ WHERE เพื่อดึงเฉพาะนักเรียนที่อยู่ในห้องเรียน A',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถกรองแถวข้อมูลโดยใช้ WHERE ร่วมกับเงื่อนไขเปรียบเทียบค่าข้อความ',
    'ครูประจำห้อง Section A ต้องการรายชื่อนักเรียนในห้องของตน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง students โดยกรองเฉพาะแถวที่ class_section เท่ากับ ''A''',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students WHERE class_section = ''A'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["ค่าข้อความต้องครอบด้วยเครื่องหมายคำพูดเดี่ยว (single quotes)","class_section = ''A'' เปรียบเทียบกับสตริง A"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_string_filter","sequence":4}'::jsonb ),

  -- ── 005 Sort by name ASC ───────────────────────────────────────────────────
  ( 'SQL_TEXT_005',
    'เรียงชื่อนักเรียนจาก ก–ฮ (A–Z)',
    'ดึงข้อมูลนักเรียนทั้งหมดโดยเรียงลำดับตามชื่อจาก A ถึง Z',
    'easy', 1::smallint, 3::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถเรียงลำดับผลลัพธ์โดยใช้ ORDER BY แบบน้อยไปมาก (ascending)',
    'โรงเรียนต้องการพิมพ์รายชื่อเข้าห้องเรียนโดยเรียงตามชื่อตัวอักษร',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง students โดยเรียงลำดับตาม student_name แบบ ascending',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students ORDER BY student_name ASC;',
    '{"full_credit":{"score":10,"condition":"output matches expected result in correct order"},"zero_credit":{"condition":"output does not match or wrong order"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false}'::jsonb,
    '{"hints":["ใช้ ORDER BY ตามด้วยชื่อคอลัมน์","ASC หมายถึงเรียงจากน้อยไปมาก — A อยู่ก่อน Z"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"order_by_asc","sequence":5}'::jsonb ),

  -- ── 006 Sort by grade DESC ────────────────────────────────────────────────
  ( 'SQL_TEXT_006',
    'เรียงนักเรียนตามระดับชั้นจากมากไปน้อย',
    'ดึง student_name และ grade_level โดยเรียงลำดับจากระดับชั้นสูงสุดไปต่ำสุด',
    'easy', 1::smallint, 3::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถเรียงลำดับผลลัพธ์โดยใช้ ORDER BY แบบมากไปน้อย (descending)',
    'ผู้อำนวยการต้องการดูรายชื่อนักเรียนโดยเรียงจากระดับชั้นสูงสุดไปต่ำสุด',
    'เขียนคำสั่ง SQL เพื่อเลือก student_name และ grade_level จากตาราง students โดยเรียงตาม grade_level แบบ descending',
    '[{"student_name":"Alice","grade_level":6},{"student_name":"Bob","grade_level":6},{"student_name":"Diana","grade_level":6},{"student_name":"Charlie","grade_level":5},{"student_name":"Eve","grade_level":5}]'::jsonb,
    'SELECT student_name, grade_level FROM students ORDER BY grade_level DESC;',
    '{"full_credit":{"score":10,"condition":"grade_level column is sorted descending"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false,"required_columns":["student_name","grade_level"]}'::jsonb,
    '{"hints":["DESC หมายถึงเรียงจากมากไปน้อย — ค่าสูงสุดอยู่บนสุด","เลือกเฉพาะสองคอลัมน์ที่ต้องการ"]}'::jsonb,
    '{"required_columns":["student_name","grade_level"]}'::jsonb,
    '{"bloom_level":"understand","topic":"order_by_desc","sequence":6}'::jsonb ),

  -- ── 007 COUNT all students ────────────────────────────────────────────────
  ( 'SQL_TEXT_007',
    'นับจำนวนนักเรียนทั้งหมด',
    'นับจำนวนนักเรียนทั้งหมดที่ลงทะเบียนในโรงเรียน',
    'easy', 1::smallint, 11::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ฟังก์ชัน COUNT เพื่อนับจำนวนแถวทั้งหมดในตาราง',
    'เจ้าหน้าที่ทะเบียนต้องการทราบจำนวนนักเรียนที่ลงทะเบียนทั้งหมด',
    'เขียนคำสั่ง SQL เพื่อนับจำนวนแถวทั้งหมดในตาราง students โดยตั้งชื่อคอลัมน์ผลลัพธ์ว่า total_students',
    '[{"total_students":5}]'::jsonb,
    'SELECT COUNT(*) AS total_students FROM students;',
    '{"full_credit":{"score":10,"condition":"output shows count of 5"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(*) นับทุกแถวในตาราง","ใช้ AS เพื่อตั้งชื่อให้คอลัมน์ผลลัพธ์"]}'::jsonb,
    '{"required_columns":["total_students"]}'::jsonb,
    '{"bloom_level":"understand","topic":"count_all","sequence":7}'::jsonb ),

  -- ── 008 COUNT per grade level ─────────────────────────────────────────────
  ( 'SQL_TEXT_008',
    'นับจำนวนนักเรียนในแต่ละระดับชั้น',
    'นับจำนวนนักเรียนในแต่ละระดับชั้นโดยใช้ GROUP BY',
    'easy', 1::smallint, 6::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ GROUP BY ร่วมกับ COUNT เพื่อสรุปความถี่ตามกลุ่ม',
    'เจ้าหน้าที่ทะเบียนต้องการทราบว่าแต่ละระดับชั้นมีนักเรียนกี่คน',
    'เขียนคำสั่ง SQL เพื่อแสดง grade_level และจำนวนนักเรียนในแต่ละระดับชั้น โดยตั้งชื่อคอลัมน์จำนวนว่า student_count',
    '[{"grade_level":5,"student_count":2},{"grade_level":6,"student_count":3}]'::jsonb,
    'SELECT grade_level, COUNT(*) AS student_count FROM students GROUP BY grade_level;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["GROUP BY จะรวมแถวที่มีค่า grade_level เดียวกันเข้าเป็นกลุ่ม","COUNT(*) นับจำนวนแถวในแต่ละกลุ่ม"]}'::jsonb,
    '{"required_columns":["grade_level","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"group_by_count","sequence":8}'::jsonb ),

  -- ── 009 JOIN students and submissions ────────────────────────────────────
  ( 'SQL_TEXT_009',
    'JOIN ตาราง students กับ submissions',
    'เชื่อมตาราง students และ submissions เพื่อแสดงชื่อนักเรียนพร้อมคะแนนที่ได้รับ',
    'medium', 2::smallint, 4::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถเชื่อมสองตารางโดยใช้ INNER JOIN บน key column ที่ใช้ร่วมกัน',
    'ครูต้องการดูชื่อนักเรียนพร้อมกับคะแนนที่ได้รับจากการส่งงาน',
    'เขียนคำสั่ง SQL โดยใช้ INNER JOIN เพื่อแสดง student_name และ score สำหรับทุกการส่งงาน โดยเชื่อม students และ submissions บน student_id',
    '[{"student_name":"Alice","score":95},{"student_name":"Bob","score":78},{"student_name":"Diana","score":90},{"student_name":"Eve","score":72},{"student_name":"Alice","score":88},{"student_name":"Bob","score":65}]'::jsonb,
    'SELECT s.student_name, sub.score FROM students s INNER JOIN submissions sub ON s.student_id = sub.student_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","score"]}'::jsonb,
    '{"hints":["INNER JOIN เก็บเฉพาะแถวที่มีข้อมูลตรงกันในทั้งสองตาราง","ON ระบุคอลัมน์ที่เชื่อมตาราง — student_id ปรากฏในทั้งสองตาราง"]}'::jsonb,
    '{"required_columns":["student_name","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"inner_join_two_tables","sequence":9}'::jsonb ),

  -- ── 010 JOIN three tables ─────────────────────────────────────────────────
  ( 'SQL_TEXT_010',
    'JOIN สามตาราง: students, submissions, assignments',
    'เชื่อม INNER JOIN สองครั้งเพื่อแสดงชื่อนักเรียน ชื่องาน และคะแนน',
    'medium', 2::smallint, 5::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถเชื่อมตารางหลายตารางต่อเนื่องกันได้โดยใช้ JOIN หลายครั้ง',
    'ครูต้องการรายงานคะแนนที่แสดงว่านักเรียนคนใดส่งงานชื่ออะไร และได้คะแนนเท่าใด',
    'เขียนคำสั่ง SQL เพื่อแสดง student_name, assignment_title และ score โดยเชื่อมตาราง students, submissions และ assignments',
    '[{"student_name":"Alice","assignment_title":"SELECT Query Basics","score":95},{"student_name":"Bob","assignment_title":"SELECT Query Basics","score":78},{"student_name":"Diana","assignment_title":"WHERE and Filtering","score":90},{"student_name":"Eve","assignment_title":"WHERE and Filtering","score":72},{"student_name":"Alice","assignment_title":"Algebra Practice","score":88},{"student_name":"Bob","assignment_title":"Algebra Practice","score":65}]'::jsonb,
    'SELECT s.student_name, a.assignment_title, sub.score FROM students s INNER JOIN submissions sub ON s.student_id = sub.student_id INNER JOIN assignments a ON sub.assignment_id = a.assignment_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","assignment_title","score"]}'::jsonb,
    '{"hints":["เขียน JOIN ต่อเนื่องกันทีละครั้ง","แต่ละ JOIN ต้องมี ON ของตัวเอง","submissions เชื่อมกับ students (ผ่าน student_id) และ assignments (ผ่าน assignment_id)"]}'::jsonb,
    '{"required_columns":["student_name","assignment_title","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"multi_join","sequence":10}'::jsonb ),

  -- ── 011 AVG score per student ─────────────────────────────────────────────
  ( 'SQL_TEXT_011',
    'คะแนนเฉลี่ยของแต่ละนักเรียน',
    'คำนวณคะแนนเฉลี่ยของแต่ละนักเรียนจากทุกการส่งงาน',
    'medium', 2::smallint, 11::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ AVG ร่วมกับ GROUP BY เพื่อคำนวณค่าเฉลี่ยรายกลุ่ม',
    'ครูต้องการทราบผลการเรียนเฉลี่ยของนักเรียนแต่ละคนจากทุกงานที่ส่ง',
    'เขียนคำสั่ง SQL เพื่อแสดง student_id และคะแนนเฉลี่ย (ปัดเศษ 2 ตำแหน่ง) ของแต่ละนักเรียน โดยตั้งชื่อคอลัมน์เฉลี่ยว่า avg_score',
    '[{"student_id":1,"avg_score":91.50},{"student_id":2,"avg_score":71.50},{"student_id":4,"avg_score":90.00},{"student_id":5,"avg_score":72.00}]'::jsonb,
    'SELECT student_id, ROUND(AVG(score), 2) AS avg_score FROM submissions GROUP BY student_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["AVG(score) คำนวณค่าเฉลี่ยคะแนนในแต่ละกลุ่ม","GROUP BY student_id สร้างกลุ่มสำหรับนักเรียนแต่ละคน","ROUND(value, 2) ปัดเศษให้เหลือ 2 ตำแหน่งทศนิยม"]}'::jsonb,
    '{"required_columns":["student_id","avg_score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"avg_group_by","sequence":11}'::jsonb ),

  -- ── 012 MAX and MIN score ─────────────────────────────────────────────────
  ( 'SQL_TEXT_012',
    'ค้นหาคะแนนสูงสุดและต่ำสุด',
    'ค้นหาคะแนนสูงสุดและต่ำสุดที่บันทึกไว้ในตาราง submissions',
    'easy', 1::smallint, 11::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ฟังก์ชัน MAX และ MIN ในคำสั่งเดียวกันได้',
    'ผู้ประสานงานการสอบต้องการทราบช่วงคะแนนที่นักเรียนทำได้',
    'เขียนคำสั่ง SQL เพื่อค้นหาคะแนนสูงสุด (max_score) และคะแนนต่ำสุด (min_score) จากตาราง submissions',
    '[{"max_score":95,"min_score":65}]'::jsonb,
    'SELECT MAX(score) AS max_score, MIN(score) AS min_score FROM submissions;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_column_alias":true}'::jsonb,
    '{"hints":["MAX() คืนค่าที่มากที่สุดในคอลัมน์","MIN() คืนค่าที่น้อยที่สุดในคอลัมน์","ใช้ทั้งสองฟังก์ชันใน SELECT เดียวกันได้"]}'::jsonb,
    '{"required_columns":["max_score","min_score"]}'::jsonb,
    '{"bloom_level":"understand","topic":"max_min_aggregate","sequence":12}'::jsonb ),

  -- ── 013 HAVING clause ────────────────────────────────────────────────────
  ( 'SQL_TEXT_013',
    'กรองกลุ่มด้วย HAVING',
    'ใช้ HAVING เพื่อกรองเฉพาะระดับชั้นที่มีนักเรียนมากกว่า 2 คน',
    'medium', 2::smallint, 7::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ HAVING เพื่อกรองกลุ่มที่รวมแล้วด้วย GROUP BY',
    'โรงเรียนต้องการระบุระดับชั้นที่มีนักเรียนมากพอสำหรับการแข่งขัน โดยเฉพาะระดับชั้นที่มีนักเรียนมากกว่า 2 คน',
    'เขียนคำสั่ง SQL เพื่อแสดง grade_level และ student_count สำหรับระดับชั้นที่มีนักเรียนมากกว่า 2 คน',
    '[{"grade_level":6,"student_count":3}]'::jsonb,
    'SELECT grade_level, COUNT(*) AS student_count FROM students GROUP BY grade_level HAVING COUNT(*) > 2;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["HAVING กรองกลุ่มหลังจาก GROUP BY","ใช้ HAVING COUNT(*) > 2 ไม่ใช่ WHERE","WHERE กรองแถวก่อนจัดกลุ่ม ส่วน HAVING กรองกลุ่มหลังจัดกลุ่ม"]}'::jsonb,
    '{"required_columns":["grade_level","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"having_clause","sequence":13}'::jsonb ),

  -- ── 014 WHERE AND ─────────────────────────────────────────────────────────
  ( 'SQL_TEXT_014',
    'WHERE ที่มีเงื่อนไข AND',
    'ใช้ WHERE ร่วมกับ AND เพื่อกรองนักเรียนที่อยู่ในชั้น 6 และห้อง A',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถรวมเงื่อนไขสองข้อโดยใช้ AND ใน WHERE clause',
    'ครูประจำห้อง Grade 6 Section A ต้องการรายชื่อนักเรียนในห้องของตน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จาก students โดย grade_level เป็น 6 และ class_section เป็น ''A''',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students WHERE grade_level = 6 AND class_section = ''A'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["AND กำหนดให้เงื่อนไขทั้งสองต้องเป็นจริงพร้อมกัน","รวม grade_level = 6 AND class_section = ''A''"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_and","sequence":14}'::jsonb ),

  -- ── 015 WHERE OR ──────────────────────────────────────────────────────────
  ( 'SQL_TEXT_015',
    'WHERE ที่มีเงื่อนไข OR',
    'ใช้ WHERE ร่วมกับ OR เพื่อค้นหานักเรียนที่อยู่ในชั้น 5 หรือห้อง B',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถรวมเงื่อนไขสองข้อโดยใช้ OR ใน WHERE clause',
    'ผู้ประสานงานกีฬาต้องการเชิญนักเรียนชั้น 5 ทุกคนและนักเรียนห้อง B ทุกคนเข้าร่วมกิจกรรมพิเศษ',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จาก students โดย grade_level เป็น 5 หรือ class_section เป็น ''B''',
    '[{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students WHERE grade_level = 5 OR class_section = ''B'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["OR คืนแถวที่เงื่อนไขใดข้อหนึ่งเป็นจริง","Diana (ชั้น 6 ห้อง B) ปรากฏเพราะอยู่ห้อง B","Eve (ชั้น 5 ห้อง A) ปรากฏเพราะอยู่ชั้น 5"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_or","sequence":15}'::jsonb ),

  -- ── 016 DISTINCT ──────────────────────────────────────────────────────────
  ( 'SQL_TEXT_016',
    'ค้นหาระดับชั้นที่ไม่ซ้ำกัน (DISTINCT)',
    'ใช้ DISTINCT เพื่อดึงรายการระดับชั้นที่ไม่ซ้ำกันจากตาราง students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ DISTINCT เพื่อตัดค่าซ้ำออกจากผลลัพธ์',
    'เจ้าหน้าที่ทะเบียนต้องการทราบว่ามีระดับชั้นใดบ้างในโรงเรียน โดยไม่แสดงซ้ำ',
    'เขียนคำสั่ง SQL เพื่อเลือกค่า grade_level ที่ไม่ซ้ำกันทั้งหมดจากตาราง students',
    '[{"grade_level":5},{"grade_level":6}]'::jsonb,
    'SELECT DISTINCT grade_level FROM students;',
    '{"full_credit":{"score":10,"condition":"output shows exactly two distinct grade levels"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["DISTINCT ตัดค่าซ้ำออกจากผลลัพธ์","วาง DISTINCT ทันทีหลัง SELECT"]}'::jsonb,
    '{"required_columns":["grade_level"]}'::jsonb,
    '{"bloom_level":"understand","topic":"distinct","sequence":16}'::jsonb ),

  -- ── 017 LIMIT ────────────────────────────────────────────────────────────
  ( 'SQL_TEXT_017',
    'จำกัดจำนวนแถวด้วย LIMIT',
    'ใช้ LIMIT เพื่อดึงเฉพาะ 3 แถวแรกจากตาราง students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ LIMIT เพื่อควบคุมจำนวนแถวสูงสุดที่ผลลัพธ์จะแสดง',
    'ระบบต้องการแสดงตัวอย่างข้อมูลตาราง students เพียง 3 แถวแรก',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง students แต่แสดงเฉพาะ 3 แถวแรก',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"}]'::jsonb,
    'SELECT * FROM students LIMIT 3;',
    '{"full_credit":{"score":10,"condition":"output contains exactly 3 rows"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"row_count","expected_count":3}'::jsonb,
    '{"hints":["LIMIT n จำกัดผลลัพธ์ให้มีไม่เกิน n แถว","วาง LIMIT ไว้ที่ท้ายคำสั่ง"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"remember","topic":"limit","sequence":17}'::jsonb ),

  -- ── 018 SUM per assignment ────────────────────────────────────────────────
  ( 'SQL_TEXT_018',
    'รวมคะแนนแต่ละงาน (SUM)',
    'คำนวณคะแนนรวมที่นักเรียนทุกคนได้รับในแต่ละงาน',
    'medium', 2::smallint, 11::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ SUM ร่วมกับ GROUP BY เพื่อรวมค่าตัวเลขรายกลุ่ม',
    'ครูต้องการทราบคะแนนรวมของนักเรียนทั้งหมดในแต่ละงาน เพื่อประเมินผลการเรียนโดยรวมของชั้นเรียน',
    'เขียนคำสั่ง SQL เพื่อแสดง assignment_id และผลรวมคะแนน (total_score) สำหรับแต่ละงานในตาราง submissions',
    '[{"assignment_id":1,"total_score":173},{"assignment_id":2,"total_score":162},{"assignment_id":3,"total_score":153}]'::jsonb,
    'SELECT assignment_id, SUM(score) AS total_score FROM submissions GROUP BY assignment_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["SUM() บวกค่าทุกค่าในคอลัมน์ตามกลุ่ม","GROUP BY assignment_id สร้างกลุ่มสำหรับแต่ละงาน"]}'::jsonb,
    '{"required_columns":["assignment_id","total_score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"sum_group_by","sequence":18}'::jsonb ),

  -- ── 019 LEFT JOIN students without submissions ────────────────────────────
  ( 'SQL_TEXT_019',
    'LEFT JOIN เพื่อค้นหานักเรียนที่ยังไม่ส่งงาน',
    'ใช้ LEFT JOIN เพื่อรวมนักเรียนทุกคนแม้ไม่มีการส่งงาน',
    'medium', 2::smallint, 13::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ LEFT JOIN เพื่อเก็บทุกแถวจากตารางซ้ายรวมถึงแถวที่ไม่มีคู่ตรงกัน',
    'ครูต้องการรายชื่อนักเรียนทั้งหมดพร้อมคะแนน โดยนักเรียนที่ยังไม่ส่งงานควรปรากฏในรายการด้วย แต่แสดง NULL ในช่องคะแนน',
    'เขียนคำสั่ง SQL โดยใช้ LEFT JOIN เพื่อแสดง student_name และ score ของนักเรียนทุกคน โดยนักเรียนที่ไม่มีการส่งงานให้แสดง NULL สำหรับ score',
    '[{"student_name":"Alice","score":95},{"student_name":"Alice","score":88},{"student_name":"Bob","score":78},{"student_name":"Bob","score":65},{"student_name":"Charlie","score":null},{"student_name":"Diana","score":90},{"student_name":"Eve","score":72}]'::jsonb,
    'SELECT s.student_name, sub.score FROM students s LEFT JOIN submissions sub ON s.student_id = sub.student_id;',
    '{"full_credit":{"score":15,"condition":"output includes Charlie with NULL score"},"zero_credit":{"condition":"output does not match or Charlie is missing"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","score"]}'::jsonb,
    '{"hints":["LEFT JOIN เก็บทุกแถวจากตารางซ้าย (students)","ถ้านักเรียนไม่มีการส่งงานที่ตรงกัน score จะเป็น NULL","INNER JOIN จะตัด Charlie ออกไปเลย"]}'::jsonb,
    '{"required_columns":["student_name","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"left_join","sequence":19}'::jsonb ),

  -- ── 020 Subquery above-average ────────────────────────────────────────────
  ( 'SQL_TEXT_020',
    'Subquery: นักเรียนที่ได้คะแนนสูงกว่าค่าเฉลี่ย',
    'ใช้ subquery เพื่อค้นหานักเรียนที่มีคะแนนสูงกว่าค่าเฉลี่ยโดยรวม',
    'medium', 2::smallint, 8::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถเขียน subquery โดยใช้ IN และ AVG เพื่อกรองข้อมูล',
    'ครูต้องการมอบรางวัลให้นักเรียนที่ทำคะแนนสูงกว่าค่าเฉลี่ยของชั้นเรียนในงานใดงานหนึ่ง',
    'เขียนคำสั่ง SQL เพื่อค้นหา student_name ของนักเรียนที่มีการส่งงานอย่างน้อยหนึ่งครั้งที่มีคะแนนสูงกว่าค่าเฉลี่ยโดยรวม โดยใช้ subquery',
    '[{"student_name":"Alice"},{"student_name":"Diana"}]'::jsonb,
    'SELECT s.student_name FROM students s WHERE s.student_id IN (SELECT student_id FROM submissions WHERE score > (SELECT AVG(score) FROM submissions));',
    '{"full_credit":{"score":15,"condition":"output shows Alice and Diana only"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name"]}'::jsonb,
    '{"hints":["subquery คือ SELECT ที่อยู่ภายใน SELECT อีกตัว","AVG(score) ด้านในคำนวณค่าเฉลี่ยโดยรวม: (95+78+90+72+88+65)/6 = 81.33","ใช้ IN(...) เพื่อตรวจสอบว่านักเรียนมีการส่งงานที่ผ่านเกณฑ์"]}'::jsonb,
    '{"required_columns":["student_name"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"subquery_in","sequence":20}'::jsonb ),

  -- ── 021 CASE WHEN grade label ─────────────────────────────────────────────
  ( 'SQL_TEXT_021',
    'CASE WHEN สำหรับเกรดคะแนน',
    'ใช้ CASE WHEN เพื่อกำหนดเกรด A/B/C ให้แต่ละการส่งงานตามคะแนน',
    'hard', 3::smallint, 9::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถใช้ CASE WHEN เพื่อสร้างคอลัมน์ที่คำนวณจากเงื่อนไข',
    'ครูต้องการเพิ่มคอลัมน์เกรดในผลลัพธ์: A สำหรับคะแนน >= 90, B สำหรับ >= 75, และ C สำหรับที่เหลือ',
    'เขียนคำสั่ง SQL เพื่อแสดง submission_id, score และคอลัมน์ grade ที่คำนวณ: ''A'' ถ้า score >= 90, ''B'' ถ้า score >= 75, ในกรณีอื่น ''C''',
    '[{"submission_id":1,"score":95,"grade":"A"},{"submission_id":2,"score":78,"grade":"B"},{"submission_id":3,"score":90,"grade":"A"},{"submission_id":4,"score":72,"grade":"C"},{"submission_id":5,"score":88,"grade":"B"},{"submission_id":6,"score":65,"grade":"C"}]'::jsonb,
    'SELECT submission_id, score, CASE WHEN score >= 90 THEN ''A'' WHEN score >= 75 THEN ''B'' ELSE ''C'' END AS grade FROM submissions;',
    '{"full_credit":{"score":20,"condition":"all grades match expected values"},"partial_credit":{"score":10,"condition":"CASE WHEN structure is correct but threshold is slightly off"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["CASE WHEN เงื่อนไข THEN ผลลัพธ์ ... ELSE ค่าเริ่มต้น END","เงื่อนไขถูกตรวจสอบจากบนลงล่าง — WHEN แรกที่ตรงเงื่อนไขจะถูกใช้","ELSE รองรับทุกกรณีที่เหลือ"]}'::jsonb,
    '{"required_columns":["submission_id","score","grade"]}'::jsonb,
    '{"bloom_level":"apply","topic":"case_when","sequence":21}'::jsonb ),

  -- ── 022 COUNT per class section ───────────────────────────────────────────
  ( 'SQL_TEXT_022',
    'นับจำนวนนักเรียนในแต่ละห้องเรียน',
    'นับจำนวนนักเรียนในแต่ละห้องเรียน',
    'easy', 1::smallint, 6::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ GROUP BY ร่วมกับ COUNT เพื่อสรุปข้อมูลตามหมวดข้อความ',
    'โรงเรียนต้องการรายงานจำนวนนักเรียนแยกตามห้องเรียน เพื่อวางแผนการรับนักเรียน',
    'เขียนคำสั่ง SQL เพื่อแสดง class_section และจำนวนนักเรียน (student_count) ในแต่ละห้อง',
    '[{"class_section":"A","student_count":3},{"class_section":"B","student_count":2}]'::jsonb,
    'SELECT class_section, COUNT(*) AS student_count FROM students GROUP BY class_section;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["GROUP BY class_section จัดกลุ่มนักเรียนตามห้อง","COUNT(*) นับจำนวนนักเรียนในแต่ละกลุ่ม"]}'::jsonb,
    '{"required_columns":["class_section","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"group_by_text","sequence":22}'::jsonb ),

  -- ── 023 ORDER BY multiple columns ────────────────────────────────────────
  ( 'SQL_TEXT_023',
    'เรียงลำดับด้วยหลายคอลัมน์',
    'เรียงนักเรียนตามระดับชั้นจากมากไปน้อย จากนั้นเรียงตามชื่อจาก A–Z ภายในระดับชั้นเดียวกัน',
    'medium', 2::smallint, 3::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถระบุคอลัมน์เรียงลำดับหลายคอลัมน์ใน ORDER BY เพื่อให้ได้ผลลัพธ์ที่เป็นระเบียบ',
    'โรงเรียนต้องการรายชื่อที่เรียงตามระดับชั้นก่อน (ชั้นสูงอยู่บน) จากนั้นเรียงตามตัวอักษรภายในระดับชั้นเดียวกัน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จาก students โดยเรียงตาม grade_level แบบ descending จากนั้นตาม student_name แบบ ascending',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM students ORDER BY grade_level DESC, student_name ASC;',
    '{"full_credit":{"score":15,"condition":"output matches expected order exactly"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false}'::jsonb,
    '{"hints":["คั่นคอลัมน์เรียงลำดับหลายคอลัมน์ด้วยเครื่องหมายจุลภาค","แต่ละคอลัมน์สามารถมี ASC หรือ DESC ของตัวเอง","grade_level DESC เรียงชั้น 6 ก่อนชั้น 5 ภายในชั้น 6 student_name ASC เรียงตามตัวอักษร"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"apply","topic":"order_by_multi","sequence":23}'::jsonb ),

  -- ── 024 JOIN + GROUP BY submission count ──────────────────────────────────
  ( 'SQL_TEXT_024',
    'JOIN + GROUP BY: จำนวนงานที่ส่งของแต่ละนักเรียน',
    'แสดงนักเรียนทุกคนและจำนวนงานที่ส่ง รวมถึงนักเรียนที่ส่งงานเป็นศูนย์',
    'hard', 3::smallint, 5::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถรวม LEFT JOIN กับ GROUP BY และ COUNT เพื่อสร้างรายงานจำนวนรายนักเรียนที่รวมค่าศูนย์ด้วย',
    'ครูต้องการตรวจสอบการมีส่วนร่วมของนักเรียน โดยนักเรียนที่ยังไม่ส่งงานควรแสดงจำนวนเป็น 0',
    'เขียนคำสั่ง SQL โดยใช้ LEFT JOIN เพื่อแสดง student_name และ submission_count สำหรับนักเรียนทุกคน โดยนักเรียนที่ไม่มีการส่งงานให้แสดงเป็น 0',
    '[{"student_name":"Alice","submission_count":2},{"student_name":"Bob","submission_count":2},{"student_name":"Charlie","submission_count":0},{"student_name":"Diana","submission_count":1},{"student_name":"Eve","submission_count":1}]'::jsonb,
    'SELECT s.student_name, COUNT(sub.submission_id) AS submission_count FROM students s LEFT JOIN submissions sub ON s.student_id = sub.student_id GROUP BY s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"Charlie shows 0; all counts are correct"},"partial_credit":{"score":10,"condition":"counts are correct but Charlie is missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(sub.submission_id) นับเฉพาะค่าที่ไม่ใช่ NULL — นักเรียนที่ไม่มีการส่งงานจะได้ 0","ต้องใช้ LEFT JOIN เพื่อให้ Charlie ปรากฏแม้ไม่มีการส่งงาน","GROUP BY ทั้ง student_id และ student_name เพื่อหลีกเลี่ยงข้อผิดพลาดในการจัดกลุ่ม"]}'::jsonb,
    '{"required_columns":["student_name","submission_count"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"left_join_group_by","sequence":24}'::jsonb ),

  -- ── 025 Top scorers per course ────────────────────────────────────────────
  ( 'SQL_TEXT_025',
    'รายงานนักเรียนที่ได้คะแนนสูงสุดในแต่ละวิชา',
    'เชื่อมสี่ตารางเพื่อค้นหาคะแนนสูงสุดของแต่ละนักเรียนรายวิชา',
    'hard', 3::smallint, 5::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมหลายตารางและรวม GROUP BY กับ MAX เพื่อสร้างรายงานจากหลายตาราง',
    'คณะกรรมการวิชาการต้องการยกย่องนักเรียนที่ทำคะแนนสูงสุดในแต่ละวิชา โดยแสดงชื่อวิชา ชื่อนักเรียน และคะแนนสูงสุดรายวิชา',
    'เขียนคำสั่ง SQL เพื่อแสดง course_name, student_name และ max_score โดยเชื่อมตาราง courses, assignments, submissions และ students จากนั้นจัดกลุ่มตามวิชาและนักเรียน',
    '[{"course_name":"Database Basics","student_name":"Alice","max_score":95},{"course_name":"Database Basics","student_name":"Bob","max_score":78},{"course_name":"Database Basics","student_name":"Diana","max_score":90},{"course_name":"Database Basics","student_name":"Eve","max_score":72},{"course_name":"Mathematics","student_name":"Alice","max_score":88},{"course_name":"Mathematics","student_name":"Bob","max_score":65}]'::jsonb,
    'SELECT c.course_name, s.student_name, MAX(sub.score) AS max_score FROM courses c INNER JOIN assignments a ON c.course_id = a.course_id INNER JOIN submissions sub ON a.assignment_id = sub.assignment_id INNER JOIN students s ON sub.student_id = s.student_id GROUP BY c.course_id, c.course_name, s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"output matches expected result"},"partial_credit":{"score":10,"condition":"joins are correct but grouping is incomplete"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true,"required_columns":["course_name","student_name","max_score"]}'::jsonb,
    '{"hints":["เชื่อม 4 ตารางทีละขั้น: courses → assignments → submissions → students","GROUP BY ต้องครอบคลุมทั้ง course และ student","MAX(score) ต่อกลุ่ม (วิชา, นักเรียน) ให้คะแนนสูงสุดของนักเรียนในแต่ละวิชา"]}'::jsonb,
    '{"required_columns":["course_name","student_name","max_score"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_join_max","sequence":25}'::jsonb ),

  -- ── 026 Assignments with no submissions ───────────────────────────────────
  ( 'SQL_TEXT_026',
    'ค้นหางานที่ยังไม่มีนักเรียนส่ง',
    'ใช้ LEFT JOIN และ IS NULL เพื่อค้นหางานที่ไม่มีนักเรียนส่งเลย',
    'medium', 2::smallint, 13::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ LEFT JOIN กับ IS NULL เพื่อระบุแถวที่ไม่มีคู่ตรงกัน (anti-join pattern)',
    'ครูต้องการระบุงานที่ยังไม่มีนักเรียนทำ เพื่อประกาศใหม่อีกครั้ง',
    'เขียนคำสั่ง SQL เพื่อค้นหา assignment_id และ assignment_title สำหรับงานที่ไม่มีข้อมูลในตาราง submissions',
    '[{"assignment_id":4,"assignment_title":"Reading Comprehension"}]'::jsonb,
    'SELECT a.assignment_id, a.assignment_title FROM assignments a LEFT JOIN submissions sub ON a.assignment_id = sub.assignment_id WHERE sub.submission_id IS NULL;',
    '{"full_credit":{"score":15,"condition":"output shows only assignment 4"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["assignment_id","assignment_title"]}'::jsonb,
    '{"hints":["LEFT JOIN เก็บงานทุกชิ้นแม้ไม่มีการส่ง","WHERE sub.submission_id IS NULL กรองเฉพาะแถวที่ไม่มีคู่ตรงกัน","รูปแบบนี้เรียกว่า anti-join pattern"]}'::jsonb,
    '{"required_columns":["assignment_id","assignment_title"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"anti_join","sequence":26}'::jsonb ),

  -- ── 027 Course-level average score report ────────────────────────────────
  ( 'SQL_TEXT_027',
    'รายงานคะแนนเฉลี่ยระดับวิชา',
    'เชื่อมตาราง courses, assignments และ submissions เพื่อแสดงคะแนนเฉลี่ยรายวิชา',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมสามตารางและรวมข้อมูลในระดับวิชาได้ โดยรองรับวิชาที่ไม่มีการส่งงานผ่าน LEFT JOIN',
    'คณะกรรมการวิชาการต้องการเปรียบเทียบความยากของวิชาโดยดูจากคะแนนเฉลี่ยจากการส่งงานทุกชิ้นในแต่ละวิชา',
    'เขียนคำสั่ง SQL เพื่อแสดง course_name และคะแนนเฉลี่ย (avg_score ปัดเศษ 2 ตำแหน่ง) ของแต่ละวิชา โดยวิชาที่ไม่มีการส่งงานให้แสดง NULL',
    '[{"course_name":"Database Basics","avg_score":83.75},{"course_name":"Mathematics","avg_score":76.50},{"course_name":"English","avg_score":null}]'::jsonb,
    'SELECT c.course_name, ROUND(AVG(sub.score), 2) AS avg_score FROM courses c LEFT JOIN assignments a ON c.course_id = a.course_id LEFT JOIN submissions sub ON a.assignment_id = sub.assignment_id GROUP BY c.course_id, c.course_name;',
    '{"full_credit":{"score":20,"condition":"all three courses appear; English shows NULL avg"},"partial_credit":{"score":10,"condition":"averages are correct but English is missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["ใช้ LEFT JOIN เพื่อให้ English (ไม่มีการส่งงาน) ยังปรากฏในผลลัพธ์","GROUP BY วิชาเพื่อให้ได้หนึ่งแถวต่อวิชา","AVG คำนวณจากการส่งงานทั้งหมดในวิชานั้น รวมทุก assignment"]}'::jsonb,
    '{"required_columns":["course_name","avg_score"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_join_avg","sequence":27}'::jsonb ),

  -- ── 028 Student pass/fail summary ────────────────────────────────────────
  ( 'SQL_TEXT_028',
    'สรุปผลผ่าน/ไม่ผ่านของนักเรียน',
    'รวม AVG กับ CASE WHEN เพื่อสรุปผลผ่านหรือไม่ผ่านของแต่ละนักเรียน',
    'hard', 3::smallint, 9::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถรวมฟังก์ชัน aggregate กับ conditional logic เพื่อจำแนกแถวข้อมูล',
    'ครูต้องการรายงานสรุป: คะแนนเฉลี่ยและผลผ่าน/ไม่ผ่านของนักเรียนแต่ละคน (เฉลี่ย >= 75 ถือว่าผ่าน)',
    'เขียนคำสั่ง SQL เพื่อแสดง student_name, avg_score (ปัดเศษ 2 ตำแหน่ง) และ result (''PASS'' ถ้า avg_score >= 75, ''FAIL'' ในกรณีอื่น) สำหรับนักเรียนทุกคนรวมถึงผู้ที่ยังไม่ส่งงาน',
    '[{"student_name":"Alice","avg_score":91.50,"result":"PASS"},{"student_name":"Bob","avg_score":71.50,"result":"FAIL"},{"student_name":"Charlie","avg_score":null,"result":"FAIL"},{"student_name":"Diana","avg_score":90.00,"result":"PASS"},{"student_name":"Eve","avg_score":72.00,"result":"FAIL"}]'::jsonb,
    'SELECT s.student_name, ROUND(AVG(sub.score), 2) AS avg_score, CASE WHEN AVG(sub.score) >= 75 THEN ''PASS'' ELSE ''FAIL'' END AS result FROM students s LEFT JOIN submissions sub ON s.student_id = sub.student_id GROUP BY s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"all students appear with correct pass/fail; Charlie is FAIL with null avg"},"partial_credit":{"score":10,"condition":"CASE WHEN logic is correct but some students are missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["ใช้ LEFT JOIN เพื่อให้ Charlie (ไม่มีการส่งงาน) ปรากฏในผลลัพธ์","CASE WHEN AVG(score) >= 75 ใช้งานได้ใน SELECT หลัง GROUP BY","นักเรียนที่ avg เป็น NULL จะได้ FAIL เพราะ NULL >= 75 ประเมินเป็น NULL (ไม่ใช่ true)"]}'::jsonb,
    '{"required_columns":["student_name","avg_score","result"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"aggregate_case_when","sequence":28}'::jsonb ),

  -- ── 029 Teacher workload summary ──────────────────────────────────────────
  ( 'SQL_TEXT_029',
    'สรุปภาระงานของครูแต่ละคน',
    'สรุปจำนวนวิชาและจำนวนงานที่ครูแต่ละคนรับผิดชอบ',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมตารางและใช้ฟังก์ชัน aggregate หลายตัวในคำสั่ง GROUP BY เดียว',
    'ผู้อำนวยการต้องการทบทวนภาระงานของครู โดยเฉพาะจำนวนวิชาที่สอนและจำนวนงานทั้งหมดของแต่ละคน',
    'เขียนคำสั่ง SQL เพื่อแสดง teacher_name, จำนวนวิชาที่สอน (course_count) และจำนวนงานทั้งหมดในทุกวิชา (assignment_count)',
    '[{"teacher_name":"Teacher Somsak","course_count":1,"assignment_count":2},{"teacher_name":"Teacher Wanna","course_count":1,"assignment_count":1},{"teacher_name":"Teacher Nok","course_count":1,"assignment_count":1}]'::jsonb,
    'SELECT c.teacher_name, COUNT(DISTINCT c.course_id) AS course_count, COUNT(a.assignment_id) AS assignment_count FROM courses c LEFT JOIN assignments a ON c.course_id = a.course_id GROUP BY c.teacher_name;',
    '{"full_credit":{"score":20,"condition":"output matches expected result"},"partial_credit":{"score":10,"condition":"teacher_name and assignment_count are correct but course_count is wrong"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(DISTINCT c.course_id) นับวิชาที่ไม่ซ้ำกันต่อครู","COUNT(a.assignment_id) นับงานทั้งหมดที่เชื่อมกับวิชาเหล่านั้น","LEFT JOIN ทำให้ครูที่ไม่มีงานยังปรากฏในผลลัพธ์"]}'::jsonb,
    '{"required_columns":["teacher_name","course_count","assignment_count"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_aggregate","sequence":29}'::jsonb ),

  -- ── 030 Final mixed report ────────────────────────────────────────────────
  ( 'SQL_TEXT_030',
    'รายงานผลการเรียนฉบับสมบูรณ์',
    'เชื่อมทั้งสี่ตารางเพื่อสร้างรายงานคะแนนฉบับสมบูรณ์พร้อมสถานะผ่าน/ไม่ผ่าน',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมสี่ตารางและเพิ่มคอลัมน์คำนวณด้วย CASE WHEN ได้',
    'โรงเรียนต้องการรายงานคะแนนฉบับสมบูรณ์: สำหรับทุกการส่งงาน ให้แสดงชื่อนักเรียน ชื่อวิชา ชื่องาน คะแนน และสถานะผ่านงาน (score >= 75)',
    'เขียนคำสั่ง SQL เพื่อแสดง student_name, course_name, assignment_title, score และ status (''PASS'' ถ้า score >= 75, ''FAIL'' ในกรณีอื่น) โดยเชื่อมทั้งสี่ตาราง',
    '[{"student_name":"Alice","course_name":"Database Basics","assignment_title":"SELECT Query Basics","score":95,"status":"PASS"},{"student_name":"Bob","course_name":"Database Basics","assignment_title":"SELECT Query Basics","score":78,"status":"PASS"},{"student_name":"Diana","course_name":"Database Basics","assignment_title":"WHERE and Filtering","score":90,"status":"PASS"},{"student_name":"Eve","course_name":"Database Basics","assignment_title":"WHERE and Filtering","score":72,"status":"FAIL"},{"student_name":"Alice","course_name":"Mathematics","assignment_title":"Algebra Practice","score":88,"status":"PASS"},{"student_name":"Bob","course_name":"Mathematics","assignment_title":"Algebra Practice","score":65,"status":"FAIL"}]'::jsonb,
    'SELECT s.student_name, c.course_name, a.assignment_title, sub.score, CASE WHEN sub.score >= 75 THEN ''PASS'' ELSE ''FAIL'' END AS status FROM students s INNER JOIN submissions sub ON s.student_id = sub.student_id INNER JOIN assignments a ON sub.assignment_id = a.assignment_id INNER JOIN courses c ON a.course_id = c.course_id;',
    '{"full_credit":{"score":20,"condition":"all 6 rows appear with correct status values"},"partial_credit":{"score":10,"condition":"joins are correct but CASE WHEN status is missing or wrong"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true,"required_columns":["student_name","course_name","assignment_title","score","status"]}'::jsonb,
    '{"hints":["เชื่อม 4 ตาราง: students → submissions → assignments → courses","CASE WHEN score >= 75 THEN ''PASS'' ELSE ''FAIL'' END สร้างคอลัมน์ status","INNER JOIN ถูกต้องในที่นี้ — เฉพาะนักเรียนที่ส่งงานเท่านั้นที่ปรากฏ"]}'::jsonb,
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
