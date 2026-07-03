-- =============================================================================
-- Script 007: Seed clean SQL_TEXT task bank (30 tasks) + Assignment/Exam Sets
--
-- Scenario: School learning management database
-- Tables used in every task:
--   tb_students(student_id, student_name, grade_level, class_section)
--   tb_courses(course_id, course_name, teacher_name)
--   tb_assignments(assignment_id, course_id, assignment_title, max_score)
--   tb_submissions(submission_id, student_id, assignment_id, score, submitted_at)
--
-- Consistent sample data across all tasks:
--   5 students: Alice(1,gr6,A), Bob(2,gr6,A), Charlie(3,gr5,B), Diana(4,gr6,B), Eve(5,gr5,A)
--   3 courses:  Database Basics(1,Somsak), Mathematics(2,Wanna), English(3,Nok)
--   4 assignments: SELECT Query Basics(1,c1,100), WHERE and Filtering(2,c1,100),
--                  Algebra Practice(3,c2,50), Reading Comprehension(4,c3,80)
--   6 submissions: Alice->a1=95, Bob->a1=78, Diana->a2=90, Eve->a2=72,
--                  Alice->a3=88, Bob->a3=65  (Charlie has NO submissions)
--
-- Code conventions (migration 009 / structured code design):
--   batch_code  AQT0001  =  Assignment Set, Query Text, number 0001
--   batch_code  EQT0001  =  Exam Set,       Query Text, number 0001
--   task_code   QT0001   =  Query Text task, number 0001  (reusable bank code)
--   set_task_code AQT0001_0001 = task 1 inside AQT0001
--
-- Run order:
--   Part 1  Upsert Assignment Set and Exam Set batch headers
--   Part 2  Upsert 30 SQL_TEXT tasks (shared schema/sample JSON via CTE)
--   Part 3  Map all 30 tasks into Assignment Set (order 1-30, all required)
--   Part 4  Map 10 selected tasks into Exam Set
--
-- Prerequisites: script 006 must be run first (expands batch_type constraint,
--               clears old prototype tasks and their set mappings).
--               Migration 009 must be run first (adds task_family_code,
--               batch_running_no, set_task_code columns).
-- =============================================================================


-- =============================================================================
-- PART 1: Upsert batch headers (Assignment Set + Exam Set)
-- =============================================================================

insert into public.mst_experiment_batches (
  batch_code, batch_name, batch_description,
  batch_type, status,
  task_family_code, batch_running_no,
  set_type_id, feedback_policy_id, attempt_policy_id, visibility_policy_id, status_id,
  allow_run, allow_multiple_attempts, show_expected_result, show_score_to_student, show_hint,
  metadata_json
)
values (
  'AQT0001',
  'ชุดแบบฝึกหัด SQL แบบเขียนคำสั่ง ชุดที่ 1',
  'ชุดแบบฝึกหัดสำหรับฝึกเขียนคำสั่ง SQL พื้นฐาน โดยครอบคลุมการเลือกข้อมูล การกรองข้อมูล การจัดเรียง การรวมตาราง การจัดกลุ่มข้อมูล และการสรุปผลจากตารางตัวอย่าง',
  'assignment_set',
  'active',
  'QT', 1,
  1, 1, 1, 1, 7,
  true, true, true, true, true,
  '{"set_category":"sql_text","level":"basic","target_audience":"beginner","task_count":30}'
)
on conflict (batch_code) do update set
  batch_name              = excluded.batch_name,
  batch_description       = excluded.batch_description,
  batch_type              = excluded.batch_type,
  status                  = excluded.status,
  task_family_code        = excluded.task_family_code,
  batch_running_no        = excluded.batch_running_no,
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


insert into public.mst_experiment_batches (
  batch_code, batch_name, batch_description,
  batch_type, status,
  task_family_code, batch_running_no,
  set_type_id, feedback_policy_id, attempt_policy_id, visibility_policy_id, status_id,
  allow_run, allow_multiple_attempts, show_expected_result, show_score_to_student, show_hint,
  metadata_json
)
values (
  'EQT0001',
  'ชุดแบบทดสอบ SQL แบบเขียนคำสั่ง ชุดที่ 1',
  'ชุดแบบทดสอบสำหรับประเมินความสามารถในการเขียนคำสั่ง SQL พื้นฐาน ผู้เรียนต้องเขียนคำตอบด้วยตนเองจากโจทย์ที่กำหนด โดยไม่แสดงเฉลยหรือคำใบ้ระหว่างทำแบบทดสอบ',
  'exam_set',
  'active',
  'QT', 1,
  2, 2, 2, 2, 7,
  true, false, false, false, false,
  '{"set_category":"sql_text","level":"basic","exam_type":"summative","target_audience":"beginner","task_count":10}'
)
on conflict (batch_code) do update set
  batch_name              = excluded.batch_name,
  batch_description       = excluded.batch_description,
  batch_type              = excluded.batch_type,
  status                  = excluded.status,
  task_family_code        = excluded.task_family_code,
  batch_running_no        = excluded.batch_running_no,
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
-- =============================================================================

with shared_json as (
  select
    '{
      "tables": [
        {"name":"tb_students",    "columns":["student_id INT PK","student_name VARCHAR","grade_level INT","class_section VARCHAR"]},
        {"name":"tb_courses",     "columns":["course_id INT PK","course_name VARCHAR","teacher_name VARCHAR"]},
        {"name":"tb_assignments", "columns":["assignment_id INT PK","course_id INT FK->tb_courses","assignment_title VARCHAR","max_score INT"]},
        {"name":"tb_submissions", "columns":["submission_id INT PK","student_id INT FK->tb_students","assignment_id INT FK->tb_assignments","score INT","submitted_at DATE"]}
      ]
    }'::jsonb as schema_json,

    '{
      "tb_students":[
        {"student_id":1,"student_name":"Alice",  "grade_level":6,"class_section":"A"},
        {"student_id":2,"student_name":"Bob",    "grade_level":6,"class_section":"A"},
        {"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},
        {"student_id":4,"student_name":"Diana",  "grade_level":6,"class_section":"B"},
        {"student_id":5,"student_name":"Eve",    "grade_level":5,"class_section":"A"}
      ],
      "tb_courses":[
        {"course_id":1,"course_name":"Database Basics","teacher_name":"Teacher Somsak"},
        {"course_id":2,"course_name":"Mathematics",    "teacher_name":"Teacher Wanna"},
        {"course_id":3,"course_name":"English",        "teacher_name":"Teacher Nok"}
      ],
      "tb_assignments":[
        {"assignment_id":1,"course_id":1,"assignment_title":"SELECT Query Basics","max_score":100},
        {"assignment_id":2,"course_id":1,"assignment_title":"WHERE and Filtering", "max_score":100},
        {"assignment_id":3,"course_id":2,"assignment_title":"Algebra Practice",    "max_score":50},
        {"assignment_id":4,"course_id":3,"assignment_title":"Reading Comprehension","max_score":80}
      ],
      "tb_submissions":[
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

  -- ── QT0001 ────────────────────────────────────────────────────────────────
  ( 'QT0001',
    'แสดงข้อมูลนักเรียนทั้งหมด',
    'ดึงข้อมูลทุกแถวและทุกคอลัมน์จากตาราง tb_students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถดึงข้อมูลทุกแถวและทุกคอลัมน์จากตารางเดียวได้โดยใช้ SELECT *',
    'ผู้ดูแลระบบของโรงเรียนต้องการดูรายชื่อนักเรียนทั้งหมด ซึ่งประกอบด้วยรหัสนักเรียน ชื่อ ระดับชั้น และห้องเรียน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง tb_students',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM tb_students;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["ใช้ SELECT * เพื่อเลือกทุกคอลัมน์","ชื่อตารางระบุหลัง FROM — ใช้ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"remember","topic":"basic_select","sequence":1}'::jsonb ),

  -- ── QT0002 ────────────────────────────────────────────────────────────────
  ( 'QT0002',
    'เลือกเฉพาะบางคอลัมน์จากตาราง tb_students',
    'ดึงเฉพาะคอลัมน์ student_id และ student_name จากตาราง tb_students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถระบุคอลัมน์ที่ต้องการแสดงผลได้ แทนที่จะเลือกทุกคอลัมน์',
    'ผู้ดูแลต้องการเพียงรายชื่อนักเรียน ได้แก่ รหัสนักเรียนและชื่อ โดยไม่ต้องการข้อมูลระดับชั้นและห้องเรียน',
    'เขียนคำสั่ง SQL เพื่อเลือกเฉพาะคอลัมน์ student_id และ student_name จากตาราง tb_students',
    '[{"student_id":1,"student_name":"Alice"},{"student_id":2,"student_name":"Bob"},{"student_id":3,"student_name":"Charlie"},{"student_id":4,"student_name":"Diana"},{"student_id":5,"student_name":"Eve"}]'::jsonb,
    'SELECT student_id, student_name FROM tb_students;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_id","student_name"]}'::jsonb,
    '{"hints":["ระบุชื่อคอลัมน์คั่นด้วยเครื่องหมายจุลภาค (,) หลัง SELECT","ไม่ต้องใช้ * เมื่อต้องการเฉพาะบางคอลัมน์","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name"]}'::jsonb,
    '{"bloom_level":"remember","topic":"column_selection","sequence":2}'::jsonb ),

  -- ── QT0003 ────────────────────────────────────────────────────────────────
  ( 'QT0003',
    'กรองนักเรียนตามระดับชั้น',
    'ใช้ WHERE เพื่อดึงเฉพาะนักเรียนที่อยู่ในระดับชั้น 6 จากตาราง tb_students',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถกรองแถวข้อมูลโดยใช้ WHERE ร่วมกับเงื่อนไขเปรียบเทียบค่าตัวเลข',
    'ครูต้องการดูเฉพาะนักเรียนชั้น 6 สำหรับกิจกรรมที่กำลังจะมาถึง',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง tb_students โดยกรองเฉพาะแถวที่ grade_level เท่ากับ 6',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"}]'::jsonb,
    'SELECT * FROM tb_students WHERE grade_level = 6;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["ใช้ WHERE เพื่อกรองแถวข้อมูล","grade_level = 6 เปรียบเทียบตัวเลข ไม่ต้องใส่เครื่องหมายคำพูด","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_filter","sequence":3}'::jsonb ),

  -- ── QT0004 ────────────────────────────────────────────────────────────────
  ( 'QT0004',
    'กรองนักเรียนตามห้องเรียน',
    'ใช้ WHERE เพื่อดึงเฉพาะนักเรียนที่อยู่ในห้องเรียน A จากตาราง tb_students',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถกรองแถวข้อมูลโดยใช้ WHERE ร่วมกับเงื่อนไขเปรียบเทียบค่าข้อความ',
    'ครูประจำห้อง Section A ต้องการรายชื่อนักเรียนในห้องของตน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง tb_students โดยกรองเฉพาะแถวที่ class_section เท่ากับ ''A''',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM tb_students WHERE class_section = ''A'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["ค่าข้อความต้องครอบด้วยเครื่องหมายคำพูดเดี่ยว (single quotes)","class_section = ''A'' เปรียบเทียบกับสตริง A","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_string_filter","sequence":4}'::jsonb ),

  -- ── QT0005 ────────────────────────────────────────────────────────────────
  ( 'QT0005',
    'เรียงชื่อนักเรียนจาก ก-ฮ (A-Z)',
    'ดึงข้อมูลนักเรียนทั้งหมดจากตาราง tb_students โดยเรียงลำดับตามชื่อจาก A ถึง Z',
    'easy', 1::smallint, 3::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถเรียงลำดับผลลัพธ์โดยใช้ ORDER BY แบบน้อยไปมาก (ascending)',
    'โรงเรียนต้องการพิมพ์รายชื่อเข้าห้องเรียนโดยเรียงตามชื่อตัวอักษร',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง tb_students โดยเรียงลำดับตาม student_name แบบ ascending',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM tb_students ORDER BY student_name ASC;',
    '{"full_credit":{"score":10,"condition":"output matches expected result in correct order"},"zero_credit":{"condition":"output does not match or wrong order"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false}'::jsonb,
    '{"hints":["ใช้ ORDER BY ตามด้วยชื่อคอลัมน์","ASC หมายถึงเรียงจากน้อยไปมาก — A อยู่ก่อน Z","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"order_by_asc","sequence":5}'::jsonb ),

  -- ── QT0006 ────────────────────────────────────────────────────────────────
  ( 'QT0006',
    'เรียงนักเรียนตามระดับชั้นจากมากไปน้อย',
    'ดึง student_name และ grade_level จากตาราง tb_students โดยเรียงลำดับจากระดับชั้นสูงสุดไปต่ำสุด',
    'easy', 1::smallint, 3::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถเรียงลำดับผลลัพธ์โดยใช้ ORDER BY แบบมากไปน้อย (descending)',
    'ผู้อำนวยการต้องการดูรายชื่อนักเรียนโดยเรียงจากระดับชั้นสูงสุดไปต่ำสุด',
    'เขียนคำสั่ง SQL เพื่อเลือก student_name และ grade_level จากตาราง tb_students โดยเรียงตาม grade_level แบบ descending',
    '[{"student_name":"Alice","grade_level":6},{"student_name":"Bob","grade_level":6},{"student_name":"Diana","grade_level":6},{"student_name":"Charlie","grade_level":5},{"student_name":"Eve","grade_level":5}]'::jsonb,
    'SELECT student_name, grade_level FROM tb_students ORDER BY grade_level DESC;',
    '{"full_credit":{"score":10,"condition":"grade_level column is sorted descending"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false,"required_columns":["student_name","grade_level"]}'::jsonb,
    '{"hints":["DESC หมายถึงเรียงจากมากไปน้อย — ค่าสูงสุดอยู่บนสุด","เลือกเฉพาะสองคอลัมน์ที่ต้องการ","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_name","grade_level"]}'::jsonb,
    '{"bloom_level":"understand","topic":"order_by_desc","sequence":6}'::jsonb ),

  -- ── QT0007 ────────────────────────────────────────────────────────────────
  ( 'QT0007',
    'นับจำนวนนักเรียนทั้งหมด',
    'นับจำนวนนักเรียนทั้งหมดที่ลงทะเบียนในโรงเรียนจากตาราง tb_students',
    'easy', 1::smallint, 11::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ฟังก์ชัน COUNT เพื่อนับจำนวนแถวทั้งหมดในตาราง',
    'เจ้าหน้าที่ทะเบียนต้องการทราบจำนวนนักเรียนที่ลงทะเบียนทั้งหมด',
    'เขียนคำสั่ง SQL เพื่อนับจำนวนแถวทั้งหมดในตาราง tb_students โดยตั้งชื่อคอลัมน์ผลลัพธ์ว่า total_students',
    '[{"total_students":5}]'::jsonb,
    'SELECT COUNT(*) AS total_students FROM tb_students;',
    '{"full_credit":{"score":10,"condition":"output shows count of 5"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(*) นับทุกแถวในตาราง","ใช้ AS เพื่อตั้งชื่อให้คอลัมน์ผลลัพธ์","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["total_students"]}'::jsonb,
    '{"bloom_level":"understand","topic":"count_all","sequence":7}'::jsonb ),

  -- ── QT0008 ────────────────────────────────────────────────────────────────
  ( 'QT0008',
    'นับจำนวนนักเรียนในแต่ละระดับชั้น',
    'นับจำนวนนักเรียนในแต่ละระดับชั้นโดยใช้ GROUP BY จากตาราง tb_students',
    'easy', 1::smallint, 6::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ GROUP BY ร่วมกับ COUNT เพื่อสรุปความถี่ตามกลุ่ม',
    'เจ้าหน้าที่ทะเบียนต้องการทราบว่าแต่ละระดับชั้นมีนักเรียนกี่คน',
    'เขียนคำสั่ง SQL เพื่อแสดง grade_level และจำนวนนักเรียนในแต่ละระดับชั้น โดยตั้งชื่อคอลัมน์จำนวนว่า student_count จากตาราง tb_students',
    '[{"grade_level":5,"student_count":2},{"grade_level":6,"student_count":3}]'::jsonb,
    'SELECT grade_level, COUNT(*) AS student_count FROM tb_students GROUP BY grade_level;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["GROUP BY จะรวมแถวที่มีค่า grade_level เดียวกันเข้าเป็นกลุ่ม","COUNT(*) นับจำนวนแถวในแต่ละกลุ่ม","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["grade_level","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"group_by_count","sequence":8}'::jsonb ),

  -- ── QT0009 ────────────────────────────────────────────────────────────────
  ( 'QT0009',
    'JOIN ตาราง tb_students กับ tb_submissions',
    'เชื่อมตาราง tb_students และ tb_submissions เพื่อแสดงชื่อนักเรียนพร้อมคะแนนที่ได้รับ',
    'medium', 2::smallint, 4::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถเชื่อมสองตารางโดยใช้ INNER JOIN บน key column ที่ใช้ร่วมกัน',
    'ครูต้องการดูชื่อนักเรียนพร้อมกับคะแนนที่ได้รับจากการส่งงาน',
    'เขียนคำสั่ง SQL โดยใช้ INNER JOIN เพื่อแสดง student_name และ score สำหรับทุกการส่งงาน โดยเชื่อม tb_students และ tb_submissions บน student_id',
    '[{"student_name":"Alice","score":95},{"student_name":"Bob","score":78},{"student_name":"Diana","score":90},{"student_name":"Eve","score":72},{"student_name":"Alice","score":88},{"student_name":"Bob","score":65}]'::jsonb,
    'SELECT s.student_name, sub.score FROM tb_students s INNER JOIN tb_submissions sub ON s.student_id = sub.student_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","score"]}'::jsonb,
    '{"hints":["INNER JOIN เก็บเฉพาะแถวที่มีข้อมูลตรงกันในทั้งสองตาราง","ON ระบุคอลัมน์ที่เชื่อมตาราง — student_id ปรากฏในทั้ง tb_students และ tb_submissions"]}'::jsonb,
    '{"required_columns":["student_name","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"inner_join_two_tables","sequence":9}'::jsonb ),

  -- ── QT0010 ────────────────────────────────────────────────────────────────
  ( 'QT0010',
    'JOIN สามตาราง: tb_students, tb_submissions, tb_assignments',
    'เชื่อม INNER JOIN สองครั้งเพื่อแสดงชื่อนักเรียน ชื่องาน และคะแนน',
    'medium', 2::smallint, 5::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถเชื่อมตารางหลายตารางต่อเนื่องกันได้โดยใช้ JOIN หลายครั้ง',
    'ครูต้องการรายงานคะแนนที่แสดงว่านักเรียนคนใดส่งงานชื่ออะไร และได้คะแนนเท่าใด',
    'เขียนคำสั่ง SQL เพื่อแสดง student_name, assignment_title และ score โดยเชื่อมตาราง tb_students, tb_submissions และ tb_assignments',
    '[{"student_name":"Alice","assignment_title":"SELECT Query Basics","score":95},{"student_name":"Bob","assignment_title":"SELECT Query Basics","score":78},{"student_name":"Diana","assignment_title":"WHERE and Filtering","score":90},{"student_name":"Eve","assignment_title":"WHERE and Filtering","score":72},{"student_name":"Alice","assignment_title":"Algebra Practice","score":88},{"student_name":"Bob","assignment_title":"Algebra Practice","score":65}]'::jsonb,
    'SELECT s.student_name, a.assignment_title, sub.score FROM tb_students s INNER JOIN tb_submissions sub ON s.student_id = sub.student_id INNER JOIN tb_assignments a ON sub.assignment_id = a.assignment_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","assignment_title","score"]}'::jsonb,
    '{"hints":["เขียน JOIN ต่อเนื่องกันทีละครั้ง","แต่ละ JOIN ต้องมี ON ของตัวเอง","tb_submissions เชื่อมกับ tb_students (ผ่าน student_id) และ tb_assignments (ผ่าน assignment_id)"]}'::jsonb,
    '{"required_columns":["student_name","assignment_title","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"multi_join","sequence":10}'::jsonb ),

  -- ── QT0011 ────────────────────────────────────────────────────────────────
  ( 'QT0011',
    'คะแนนเฉลี่ยของแต่ละนักเรียน',
    'คำนวณคะแนนเฉลี่ยของแต่ละนักเรียนจากทุกการส่งงานในตาราง tb_submissions',
    'medium', 2::smallint, 11::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ AVG ร่วมกับ GROUP BY เพื่อคำนวณค่าเฉลี่ยรายกลุ่ม',
    'ครูต้องการทราบผลการเรียนเฉลี่ยของนักเรียนแต่ละคนจากทุกงานที่ส่ง',
    'เขียนคำสั่ง SQL เพื่อแสดง student_id และคะแนนเฉลี่ย (ปัดเศษ 2 ตำแหน่ง) ของแต่ละนักเรียน โดยตั้งชื่อคอลัมน์เฉลี่ยว่า avg_score จากตาราง tb_submissions',
    '[{"student_id":1,"avg_score":91.50},{"student_id":2,"avg_score":71.50},{"student_id":4,"avg_score":90.00},{"student_id":5,"avg_score":72.00}]'::jsonb,
    'SELECT student_id, ROUND(AVG(score), 2) AS avg_score FROM tb_submissions GROUP BY student_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["AVG(score) คำนวณค่าเฉลี่ยคะแนนในแต่ละกลุ่ม","GROUP BY student_id สร้างกลุ่มสำหรับนักเรียนแต่ละคน","ROUND(value, 2) ปัดเศษให้เหลือ 2 ตำแหน่งทศนิยม","ตารางชื่อ tb_submissions"]}'::jsonb,
    '{"required_columns":["student_id","avg_score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"avg_group_by","sequence":11}'::jsonb ),

  -- ── QT0012 ────────────────────────────────────────────────────────────────
  ( 'QT0012',
    'ค้นหาคะแนนสูงสุดและต่ำสุด',
    'ค้นหาคะแนนสูงสุดและต่ำสุดที่บันทึกไว้ในตาราง tb_submissions',
    'easy', 1::smallint, 11::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ฟังก์ชัน MAX และ MIN ในคำสั่งเดียวกันได้',
    'ผู้ประสานงานการสอบต้องการทราบช่วงคะแนนที่นักเรียนทำได้',
    'เขียนคำสั่ง SQL เพื่อค้นหาคะแนนสูงสุด (max_score) และคะแนนต่ำสุด (min_score) จากตาราง tb_submissions',
    '[{"max_score":95,"min_score":65}]'::jsonb,
    'SELECT MAX(score) AS max_score, MIN(score) AS min_score FROM tb_submissions;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_column_alias":true}'::jsonb,
    '{"hints":["MAX() คืนค่าที่มากที่สุดในคอลัมน์","MIN() คืนค่าที่น้อยที่สุดในคอลัมน์","ใช้ทั้งสองฟังก์ชันใน SELECT เดียวกันได้","ตารางชื่อ tb_submissions"]}'::jsonb,
    '{"required_columns":["max_score","min_score"]}'::jsonb,
    '{"bloom_level":"understand","topic":"max_min_aggregate","sequence":12}'::jsonb ),

  -- ── QT0013 ────────────────────────────────────────────────────────────────
  ( 'QT0013',
    'กรองกลุ่มด้วย HAVING',
    'ใช้ HAVING เพื่อกรองเฉพาะระดับชั้นที่มีนักเรียนมากกว่า 2 คน จากตาราง tb_students',
    'medium', 2::smallint, 7::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ HAVING เพื่อกรองกลุ่มที่รวมแล้วด้วย GROUP BY',
    'โรงเรียนต้องการระบุระดับชั้นที่มีนักเรียนมากพอสำหรับการแข่งขัน โดยเฉพาะระดับชั้นที่มีนักเรียนมากกว่า 2 คน',
    'เขียนคำสั่ง SQL เพื่อแสดง grade_level และ student_count สำหรับระดับชั้นที่มีนักเรียนมากกว่า 2 คน จากตาราง tb_students',
    '[{"grade_level":6,"student_count":3}]'::jsonb,
    'SELECT grade_level, COUNT(*) AS student_count FROM tb_students GROUP BY grade_level HAVING COUNT(*) > 2;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["HAVING กรองกลุ่มหลังจาก GROUP BY","ใช้ HAVING COUNT(*) > 2 ไม่ใช่ WHERE","WHERE กรองแถวก่อนจัดกลุ่ม ส่วน HAVING กรองกลุ่มหลังจัดกลุ่ม","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["grade_level","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"having_clause","sequence":13}'::jsonb ),

  -- ── QT0014 ────────────────────────────────────────────────────────────────
  ( 'QT0014',
    'WHERE ที่มีเงื่อนไข AND',
    'ใช้ WHERE ร่วมกับ AND เพื่อกรองนักเรียนที่อยู่ในชั้น 6 และห้อง A จากตาราง tb_students',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถรวมเงื่อนไขสองข้อโดยใช้ AND ใน WHERE clause',
    'ครูประจำห้อง Grade 6 Section A ต้องการรายชื่อนักเรียนในห้องของตน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จาก tb_students โดย grade_level เป็น 6 และ class_section เป็น ''A''',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"}]'::jsonb,
    'SELECT * FROM tb_students WHERE grade_level = 6 AND class_section = ''A'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["AND กำหนดให้เงื่อนไขทั้งสองต้องเป็นจริงพร้อมกัน","รวม grade_level = 6 AND class_section = ''A''","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_and","sequence":14}'::jsonb ),

  -- ── QT0015 ────────────────────────────────────────────────────────────────
  ( 'QT0015',
    'WHERE ที่มีเงื่อนไข OR',
    'ใช้ WHERE ร่วมกับ OR เพื่อค้นหานักเรียนที่อยู่ในชั้น 5 หรือห้อง B จากตาราง tb_students',
    'easy', 1::smallint, 2::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถรวมเงื่อนไขสองข้อโดยใช้ OR ใน WHERE clause',
    'ผู้ประสานงานกีฬาต้องการเชิญนักเรียนชั้น 5 ทุกคนและนักเรียนห้อง B ทุกคนเข้าร่วมกิจกรรมพิเศษ',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จาก tb_students โดย grade_level เป็น 5 หรือ class_section เป็น ''B''',
    '[{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM tb_students WHERE grade_level = 5 OR class_section = ''B'';',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["OR คืนแถวที่เงื่อนไขใดข้อหนึ่งเป็นจริง","Diana (ชั้น 6 ห้อง B) ปรากฏเพราะอยู่ห้อง B","Eve (ชั้น 5 ห้อง A) ปรากฏเพราะอยู่ชั้น 5","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"understand","topic":"where_or","sequence":15}'::jsonb ),

  -- ── QT0016 ────────────────────────────────────────────────────────────────
  ( 'QT0016',
    'ค้นหาระดับชั้นที่ไม่ซ้ำกัน (DISTINCT)',
    'ใช้ DISTINCT เพื่อดึงรายการระดับชั้นที่ไม่ซ้ำกันจากตาราง tb_students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ DISTINCT เพื่อตัดค่าซ้ำออกจากผลลัพธ์',
    'เจ้าหน้าที่ทะเบียนต้องการทราบว่ามีระดับชั้นใดบ้างในโรงเรียน โดยไม่แสดงซ้ำ',
    'เขียนคำสั่ง SQL เพื่อเลือกค่า grade_level ที่ไม่ซ้ำกันทั้งหมดจากตาราง tb_students',
    '[{"grade_level":5},{"grade_level":6}]'::jsonb,
    'SELECT DISTINCT grade_level FROM tb_students;',
    '{"full_credit":{"score":10,"condition":"output shows exactly two distinct grade levels"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true}'::jsonb,
    '{"hints":["DISTINCT ตัดค่าซ้ำออกจากผลลัพธ์","วาง DISTINCT ทันทีหลัง SELECT","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["grade_level"]}'::jsonb,
    '{"bloom_level":"understand","topic":"distinct","sequence":16}'::jsonb ),

  -- ── QT0017 ────────────────────────────────────────────────────────────────
  ( 'QT0017',
    'จำกัดจำนวนแถวด้วย LIMIT',
    'ใช้ LIMIT เพื่อดึงเฉพาะ 3 แถวแรกจากตาราง tb_students',
    'easy', 1::smallint, 1::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ LIMIT เพื่อควบคุมจำนวนแถวสูงสุดที่ผลลัพธ์จะแสดง',
    'ระบบต้องการแสดงตัวอย่างข้อมูลตาราง tb_students เพียง 3 แถวแรก',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จากตาราง tb_students แต่แสดงเฉพาะ 3 แถวแรก',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"}]'::jsonb,
    'SELECT * FROM tb_students LIMIT 3;',
    '{"full_credit":{"score":10,"condition":"output contains exactly 3 rows"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"row_count","expected_count":3}'::jsonb,
    '{"hints":["LIMIT n จำกัดผลลัพธ์ให้มีไม่เกิน n แถว","วาง LIMIT ไว้ที่ท้ายคำสั่ง","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"remember","topic":"limit","sequence":17}'::jsonb ),

  -- ── QT0018 ────────────────────────────────────────────────────────────────
  ( 'QT0018',
    'รวมคะแนนแต่ละงาน (SUM)',
    'คำนวณคะแนนรวมที่นักเรียนทุกคนได้รับในแต่ละงานจากตาราง tb_submissions',
    'medium', 2::smallint, 11::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ SUM ร่วมกับ GROUP BY เพื่อรวมค่าตัวเลขรายกลุ่ม',
    'ครูต้องการทราบคะแนนรวมของนักเรียนทั้งหมดในแต่ละงาน เพื่อประเมินผลการเรียนโดยรวมของชั้นเรียน',
    'เขียนคำสั่ง SQL เพื่อแสดง assignment_id และผลรวมคะแนน (total_score) สำหรับแต่ละงานในตาราง tb_submissions',
    '[{"assignment_id":1,"total_score":173},{"assignment_id":2,"total_score":162},{"assignment_id":3,"total_score":153}]'::jsonb,
    'SELECT assignment_id, SUM(score) AS total_score FROM tb_submissions GROUP BY assignment_id;',
    '{"full_credit":{"score":15,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["SUM() บวกค่าทุกค่าในคอลัมน์ตามกลุ่ม","GROUP BY assignment_id สร้างกลุ่มสำหรับแต่ละงาน","ตารางชื่อ tb_submissions"]}'::jsonb,
    '{"required_columns":["assignment_id","total_score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"sum_group_by","sequence":18}'::jsonb ),

  -- ── QT0019 ────────────────────────────────────────────────────────────────
  ( 'QT0019',
    'LEFT JOIN เพื่อค้นหานักเรียนที่ยังไม่ส่งงาน',
    'ใช้ LEFT JOIN เพื่อรวมนักเรียนทุกคนจาก tb_students แม้ไม่มีการส่งงานใน tb_submissions',
    'medium', 2::smallint, 13::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ LEFT JOIN เพื่อเก็บทุกแถวจากตารางซ้ายรวมถึงแถวที่ไม่มีคู่ตรงกัน',
    'ครูต้องการรายชื่อนักเรียนทั้งหมดพร้อมคะแนน โดยนักเรียนที่ยังไม่ส่งงานควรปรากฏในรายการด้วย แต่แสดง NULL ในช่องคะแนน',
    'เขียนคำสั่ง SQL โดยใช้ LEFT JOIN เพื่อแสดง student_name และ score ของนักเรียนทุกคน โดยนักเรียนที่ไม่มีการส่งงานให้แสดง NULL สำหรับ score',
    '[{"student_name":"Alice","score":95},{"student_name":"Alice","score":88},{"student_name":"Bob","score":78},{"student_name":"Bob","score":65},{"student_name":"Charlie","score":null},{"student_name":"Diana","score":90},{"student_name":"Eve","score":72}]'::jsonb,
    'SELECT s.student_name, sub.score FROM tb_students s LEFT JOIN tb_submissions sub ON s.student_id = sub.student_id;',
    '{"full_credit":{"score":15,"condition":"output includes Charlie with NULL score"},"zero_credit":{"condition":"output does not match or Charlie is missing"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name","score"]}'::jsonb,
    '{"hints":["LEFT JOIN เก็บทุกแถวจากตารางซ้าย (tb_students)","ถ้านักเรียนไม่มีการส่งงานที่ตรงกัน score จะเป็น NULL","INNER JOIN จะตัด Charlie ออกไปเลย"]}'::jsonb,
    '{"required_columns":["student_name","score"]}'::jsonb,
    '{"bloom_level":"apply","topic":"left_join","sequence":19}'::jsonb ),

  -- ── QT0020 ────────────────────────────────────────────────────────────────
  ( 'QT0020',
    'Subquery: นักเรียนที่ได้คะแนนสูงกว่าค่าเฉลี่ย',
    'ใช้ subquery เพื่อค้นหานักเรียนจาก tb_students ที่มีคะแนนสูงกว่าค่าเฉลี่ยโดยรวมใน tb_submissions',
    'medium', 2::smallint, 8::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถเขียน subquery โดยใช้ IN และ AVG เพื่อกรองข้อมูล',
    'ครูต้องการมอบรางวัลให้นักเรียนที่ทำคะแนนสูงกว่าค่าเฉลี่ยของชั้นเรียนในงานใดงานหนึ่ง',
    'เขียนคำสั่ง SQL เพื่อค้นหา student_name ของนักเรียนที่มีการส่งงานอย่างน้อยหนึ่งครั้งที่มีคะแนนสูงกว่าค่าเฉลี่ยโดยรวม โดยใช้ subquery จากตาราง tb_students และ tb_submissions',
    '[{"student_name":"Alice"},{"student_name":"Diana"}]'::jsonb,
    'SELECT s.student_name FROM tb_students s WHERE s.student_id IN (SELECT student_id FROM tb_submissions WHERE score > (SELECT AVG(score) FROM tb_submissions));',
    '{"full_credit":{"score":15,"condition":"output shows Alice and Diana only"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["student_name"]}'::jsonb,
    '{"hints":["subquery คือ SELECT ที่อยู่ภายใน SELECT อีกตัว","AVG(score) ด้านในคำนวณค่าเฉลี่ยโดยรวมจาก tb_submissions: (95+78+90+72+88+65)/6 = 81.33","ใช้ IN(...) เพื่อตรวจสอบว่านักเรียนมีการส่งงานที่ผ่านเกณฑ์"]}'::jsonb,
    '{"required_columns":["student_name"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"subquery_in","sequence":20}'::jsonb ),

  -- ── QT0021 ────────────────────────────────────────────────────────────────
  ( 'QT0021',
    'CASE WHEN สำหรับเกรดคะแนน',
    'ใช้ CASE WHEN เพื่อกำหนดเกรด A/B/C ให้แต่ละการส่งงานจากตาราง tb_submissions ตามคะแนน',
    'hard', 3::smallint, 9::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถใช้ CASE WHEN เพื่อสร้างคอลัมน์ที่คำนวณจากเงื่อนไข',
    'ครูต้องการเพิ่มคอลัมน์เกรดในผลลัพธ์: A สำหรับคะแนน >= 90, B สำหรับ >= 75, และ C สำหรับที่เหลือ',
    'เขียนคำสั่ง SQL เพื่อแสดง submission_id, score และคอลัมน์ grade ที่คำนวณ: ''A'' ถ้า score >= 90, ''B'' ถ้า score >= 75, ในกรณีอื่น ''C'' จากตาราง tb_submissions',
    '[{"submission_id":1,"score":95,"grade":"A"},{"submission_id":2,"score":78,"grade":"B"},{"submission_id":3,"score":90,"grade":"A"},{"submission_id":4,"score":72,"grade":"C"},{"submission_id":5,"score":88,"grade":"B"},{"submission_id":6,"score":65,"grade":"C"}]'::jsonb,
    'SELECT submission_id, score, CASE WHEN score >= 90 THEN ''A'' WHEN score >= 75 THEN ''B'' ELSE ''C'' END AS grade FROM tb_submissions;',
    '{"full_credit":{"score":20,"condition":"all grades match expected values"},"partial_credit":{"score":10,"condition":"CASE WHEN structure is correct but threshold is slightly off"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["CASE WHEN เงื่อนไข THEN ผลลัพธ์ ... ELSE ค่าเริ่มต้น END","เงื่อนไขถูกตรวจสอบจากบนลงล่าง — WHEN แรกที่ตรงเงื่อนไขจะถูกใช้","ELSE รองรับทุกกรณีที่เหลือ","ตารางชื่อ tb_submissions"]}'::jsonb,
    '{"required_columns":["submission_id","score","grade"]}'::jsonb,
    '{"bloom_level":"apply","topic":"case_when","sequence":21}'::jsonb ),

  -- ── QT0022 ────────────────────────────────────────────────────────────────
  ( 'QT0022',
    'นับจำนวนนักเรียนในแต่ละห้องเรียน',
    'นับจำนวนนักเรียนในแต่ละห้องเรียนจากตาราง tb_students',
    'easy', 1::smallint, 6::smallint, 120, 10.00::numeric,
    'นักเรียนสามารถใช้ GROUP BY ร่วมกับ COUNT เพื่อสรุปข้อมูลตามหมวดข้อความ',
    'โรงเรียนต้องการรายงานจำนวนนักเรียนแยกตามห้องเรียน เพื่อวางแผนการรับนักเรียน',
    'เขียนคำสั่ง SQL เพื่อแสดง class_section และจำนวนนักเรียน (student_count) ในแต่ละห้องจากตาราง tb_students',
    '[{"class_section":"A","student_count":3},{"class_section":"B","student_count":2}]'::jsonb,
    'SELECT class_section, COUNT(*) AS student_count FROM tb_students GROUP BY class_section;',
    '{"full_credit":{"score":10,"condition":"output matches expected result"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["GROUP BY class_section จัดกลุ่มนักเรียนตามห้อง","COUNT(*) นับจำนวนนักเรียนในแต่ละกลุ่ม","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["class_section","student_count"]}'::jsonb,
    '{"bloom_level":"apply","topic":"group_by_text","sequence":22}'::jsonb ),

  -- ── QT0023 ────────────────────────────────────────────────────────────────
  ( 'QT0023',
    'เรียงลำดับด้วยหลายคอลัมน์',
    'เรียงนักเรียนจาก tb_students ตามระดับชั้นจากมากไปน้อย จากนั้นเรียงตามชื่อจาก A-Z ภายในระดับชั้นเดียวกัน',
    'medium', 2::smallint, 3::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถระบุคอลัมน์เรียงลำดับหลายคอลัมน์ใน ORDER BY เพื่อให้ได้ผลลัพธ์ที่เป็นระเบียบ',
    'โรงเรียนต้องการรายชื่อที่เรียงตามระดับชั้นก่อน (ชั้นสูงอยู่บน) จากนั้นเรียงตามตัวอักษรภายในระดับชั้นเดียวกัน',
    'เขียนคำสั่ง SQL เพื่อเลือกทุกคอลัมน์จาก tb_students โดยเรียงตาม grade_level แบบ descending จากนั้นตาม student_name แบบ ascending',
    '[{"student_id":1,"student_name":"Alice","grade_level":6,"class_section":"A"},{"student_id":2,"student_name":"Bob","grade_level":6,"class_section":"A"},{"student_id":4,"student_name":"Diana","grade_level":6,"class_section":"B"},{"student_id":3,"student_name":"Charlie","grade_level":5,"class_section":"B"},{"student_id":5,"student_name":"Eve","grade_level":5,"class_section":"A"}]'::jsonb,
    'SELECT * FROM tb_students ORDER BY grade_level DESC, student_name ASC;',
    '{"full_credit":{"score":15,"condition":"output matches expected order exactly"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":false}'::jsonb,
    '{"hints":["คั่นคอลัมน์เรียงลำดับหลายคอลัมน์ด้วยเครื่องหมายจุลภาค","แต่ละคอลัมน์สามารถมี ASC หรือ DESC ของตัวเอง","grade_level DESC เรียงชั้น 6 ก่อนชั้น 5 ภายในชั้น 6 student_name ASC เรียงตามตัวอักษร","ตารางชื่อ tb_students"]}'::jsonb,
    '{"required_columns":["student_id","student_name","grade_level","class_section"]}'::jsonb,
    '{"bloom_level":"apply","topic":"order_by_multi","sequence":23}'::jsonb ),

  -- ── QT0024 ────────────────────────────────────────────────────────────────
  ( 'QT0024',
    'JOIN + GROUP BY: จำนวนงานที่ส่งของแต่ละนักเรียน',
    'แสดงนักเรียนทุกคนจาก tb_students และจำนวนงานที่ส่งใน tb_submissions รวมถึงนักเรียนที่ส่งงานเป็นศูนย์',
    'hard', 3::smallint, 5::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถรวม LEFT JOIN กับ GROUP BY และ COUNT เพื่อสร้างรายงานจำนวนรายนักเรียนที่รวมค่าศูนย์ด้วย',
    'ครูต้องการตรวจสอบการมีส่วนร่วมของนักเรียน โดยนักเรียนที่ยังไม่ส่งงานควรแสดงจำนวนเป็น 0',
    'เขียนคำสั่ง SQL โดยใช้ LEFT JOIN เพื่อแสดง student_name และ submission_count สำหรับนักเรียนทุกคน โดยนักเรียนที่ไม่มีการส่งงานให้แสดงเป็น 0',
    '[{"student_name":"Alice","submission_count":2},{"student_name":"Bob","submission_count":2},{"student_name":"Charlie","submission_count":0},{"student_name":"Diana","submission_count":1},{"student_name":"Eve","submission_count":1}]'::jsonb,
    'SELECT s.student_name, COUNT(sub.submission_id) AS submission_count FROM tb_students s LEFT JOIN tb_submissions sub ON s.student_id = sub.student_id GROUP BY s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"Charlie shows 0; all counts are correct"},"partial_credit":{"score":10,"condition":"counts are correct but Charlie is missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(sub.submission_id) นับเฉพาะค่าที่ไม่ใช่ NULL — นักเรียนที่ไม่มีการส่งงานจะได้ 0","ต้องใช้ LEFT JOIN เพื่อให้ Charlie ปรากฏแม้ไม่มีการส่งงาน","GROUP BY ทั้ง student_id และ student_name เพื่อหลีกเลี่ยงข้อผิดพลาดในการจัดกลุ่ม","ตาราง tb_students LEFT JOIN tb_submissions"]}'::jsonb,
    '{"required_columns":["student_name","submission_count"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"left_join_group_by","sequence":24}'::jsonb ),

  -- ── QT0025 ────────────────────────────────────────────────────────────────
  ( 'QT0025',
    'รายงานนักเรียนที่ได้คะแนนสูงสุดในแต่ละวิชา',
    'เชื่อมสี่ตาราง (tb_courses, tb_assignments, tb_submissions, tb_students) เพื่อค้นหาคะแนนสูงสุดของแต่ละนักเรียนรายวิชา',
    'hard', 3::smallint, 5::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมหลายตารางและรวม GROUP BY กับ MAX เพื่อสร้างรายงานจากหลายตาราง',
    'คณะกรรมการวิชาการต้องการยกย่องนักเรียนที่ทำคะแนนสูงสุดในแต่ละวิชา โดยแสดงชื่อวิชา ชื่อนักเรียน และคะแนนสูงสุดรายวิชา',
    'เขียนคำสั่ง SQL เพื่อแสดง course_name, student_name และ max_score โดยเชื่อมตาราง tb_courses, tb_assignments, tb_submissions และ tb_students จากนั้นจัดกลุ่มตามวิชาและนักเรียน',
    '[{"course_name":"Database Basics","student_name":"Alice","max_score":95},{"course_name":"Database Basics","student_name":"Bob","max_score":78},{"course_name":"Database Basics","student_name":"Diana","max_score":90},{"course_name":"Database Basics","student_name":"Eve","max_score":72},{"course_name":"Mathematics","student_name":"Alice","max_score":88},{"course_name":"Mathematics","student_name":"Bob","max_score":65}]'::jsonb,
    'SELECT c.course_name, s.student_name, MAX(sub.score) AS max_score FROM tb_courses c INNER JOIN tb_assignments a ON c.course_id = a.course_id INNER JOIN tb_submissions sub ON a.assignment_id = sub.assignment_id INNER JOIN tb_students s ON sub.student_id = s.student_id GROUP BY c.course_id, c.course_name, s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"output matches expected result"},"partial_credit":{"score":10,"condition":"joins are correct but grouping is incomplete"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true,"required_columns":["course_name","student_name","max_score"]}'::jsonb,
    '{"hints":["เชื่อม 4 ตารางทีละขั้น: tb_courses -> tb_assignments -> tb_submissions -> tb_students","GROUP BY ต้องครอบคลุมทั้ง course และ student","MAX(score) ต่อกลุ่ม (วิชา, นักเรียน) ให้คะแนนสูงสุดของนักเรียนในแต่ละวิชา"]}'::jsonb,
    '{"required_columns":["course_name","student_name","max_score"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_join_max","sequence":25}'::jsonb ),

  -- ── QT0026 ────────────────────────────────────────────────────────────────
  ( 'QT0026',
    'ค้นหางานที่ยังไม่มีนักเรียนส่ง',
    'ใช้ LEFT JOIN และ IS NULL เพื่อค้นหางานจาก tb_assignments ที่ไม่มีนักเรียนส่งเลย',
    'medium', 2::smallint, 13::smallint, 180, 15.00::numeric,
    'นักเรียนสามารถใช้ LEFT JOIN กับ IS NULL เพื่อระบุแถวที่ไม่มีคู่ตรงกัน (anti-join pattern)',
    'ครูต้องการระบุงานที่ยังไม่มีนักเรียนทำ เพื่อประกาศใหม่อีกครั้ง',
    'เขียนคำสั่ง SQL เพื่อค้นหา assignment_id และ assignment_title สำหรับงานที่ไม่มีข้อมูลในตาราง tb_submissions',
    '[{"assignment_id":4,"assignment_title":"Reading Comprehension"}]'::jsonb,
    'SELECT a.assignment_id, a.assignment_title FROM tb_assignments a LEFT JOIN tb_submissions sub ON a.assignment_id = sub.assignment_id WHERE sub.submission_id IS NULL;',
    '{"full_credit":{"score":15,"condition":"output shows only assignment 4"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"required_columns":["assignment_id","assignment_title"]}'::jsonb,
    '{"hints":["LEFT JOIN เก็บงานทุกชิ้นแม้ไม่มีการส่ง","WHERE sub.submission_id IS NULL กรองเฉพาะแถวที่ไม่มีคู่ตรงกัน","รูปแบบนี้เรียกว่า anti-join pattern","ตาราง tb_assignments LEFT JOIN tb_submissions"]}'::jsonb,
    '{"required_columns":["assignment_id","assignment_title"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"anti_join","sequence":26}'::jsonb ),

  -- ── QT0027 ────────────────────────────────────────────────────────────────
  ( 'QT0027',
    'รายงานคะแนนเฉลี่ยระดับวิชา',
    'เชื่อมตาราง tb_courses, tb_assignments และ tb_submissions เพื่อแสดงคะแนนเฉลี่ยรายวิชา',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมสามตารางและรวมข้อมูลในระดับวิชาได้ โดยรองรับวิชาที่ไม่มีการส่งงานผ่าน LEFT JOIN',
    'คณะกรรมการวิชาการต้องการเปรียบเทียบความยากของวิชาโดยดูจากคะแนนเฉลี่ยจากการส่งงานทุกชิ้นในแต่ละวิชา',
    'เขียนคำสั่ง SQL เพื่อแสดง course_name และคะแนนเฉลี่ย (avg_score ปัดเศษ 2 ตำแหน่ง) ของแต่ละวิชา โดยวิชาที่ไม่มีการส่งงานให้แสดง NULL',
    '[{"course_name":"Database Basics","avg_score":83.75},{"course_name":"Mathematics","avg_score":76.50},{"course_name":"English","avg_score":null}]'::jsonb,
    'SELECT c.course_name, ROUND(AVG(sub.score), 2) AS avg_score FROM tb_courses c LEFT JOIN tb_assignments a ON c.course_id = a.course_id LEFT JOIN tb_submissions sub ON a.assignment_id = sub.assignment_id GROUP BY c.course_id, c.course_name;',
    '{"full_credit":{"score":20,"condition":"all three courses appear; English shows NULL avg"},"partial_credit":{"score":10,"condition":"averages are correct but English is missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["ใช้ LEFT JOIN เพื่อให้ English (ไม่มีการส่งงาน) ยังปรากฏในผลลัพธ์","GROUP BY วิชาเพื่อให้ได้หนึ่งแถวต่อวิชา","AVG คำนวณจากการส่งงานทั้งหมดในวิชานั้น รวมทุก assignment","เชื่อม tb_courses -> tb_assignments -> tb_submissions"]}'::jsonb,
    '{"required_columns":["course_name","avg_score"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_join_avg","sequence":27}'::jsonb ),

  -- ── QT0028 ────────────────────────────────────────────────────────────────
  ( 'QT0028',
    'สรุปผลผ่าน/ไม่ผ่านของนักเรียน',
    'รวม AVG กับ CASE WHEN เพื่อสรุปผลผ่านหรือไม่ผ่านของแต่ละนักเรียนจาก tb_students และ tb_submissions',
    'hard', 3::smallint, 9::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถรวมฟังก์ชัน aggregate กับ conditional logic เพื่อจำแนกแถวข้อมูล',
    'ครูต้องการรายงานสรุป: คะแนนเฉลี่ยและผลผ่าน/ไม่ผ่านของนักเรียนแต่ละคน (เฉลี่ย >= 75 ถือว่าผ่าน)',
    'เขียนคำสั่ง SQL เพื่อแสดง student_name, avg_score (ปัดเศษ 2 ตำแหน่ง) และ result (''PASS'' ถ้า avg_score >= 75, ''FAIL'' ในกรณีอื่น) สำหรับนักเรียนทุกคนรวมถึงผู้ที่ยังไม่ส่งงาน โดยเชื่อม tb_students กับ tb_submissions',
    '[{"student_name":"Alice","avg_score":91.50,"result":"PASS"},{"student_name":"Bob","avg_score":71.50,"result":"FAIL"},{"student_name":"Charlie","avg_score":null,"result":"FAIL"},{"student_name":"Diana","avg_score":90.00,"result":"PASS"},{"student_name":"Eve","avg_score":72.00,"result":"FAIL"}]'::jsonb,
    'SELECT s.student_name, ROUND(AVG(sub.score), 2) AS avg_score, CASE WHEN AVG(sub.score) >= 75 THEN ''PASS'' ELSE ''FAIL'' END AS result FROM tb_students s LEFT JOIN tb_submissions sub ON s.student_id = sub.student_id GROUP BY s.student_id, s.student_name;',
    '{"full_credit":{"score":20,"condition":"all students appear with correct pass/fail; Charlie is FAIL with null avg"},"partial_credit":{"score":10,"condition":"CASE WHEN logic is correct but some students are missing"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["ใช้ LEFT JOIN เพื่อให้ Charlie (ไม่มีการส่งงาน) ปรากฏในผลลัพธ์","CASE WHEN AVG(score) >= 75 ใช้งานได้ใน SELECT หลัง GROUP BY","นักเรียนที่ avg เป็น NULL จะได้ FAIL เพราะ NULL >= 75 ประเมินเป็น NULL (ไม่ใช่ true)","เชื่อม tb_students LEFT JOIN tb_submissions"]}'::jsonb,
    '{"required_columns":["student_name","avg_score","result"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"aggregate_case_when","sequence":28}'::jsonb ),

  -- ── QT0029 ────────────────────────────────────────────────────────────────
  ( 'QT0029',
    'สรุปภาระงานของครูแต่ละคน',
    'สรุปจำนวนวิชาและจำนวนงานที่ครูแต่ละคนรับผิดชอบจากตาราง tb_courses และ tb_assignments',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมตารางและใช้ฟังก์ชัน aggregate หลายตัวในคำสั่ง GROUP BY เดียว',
    'ผู้อำนวยการต้องการทบทวนภาระงานของครู โดยเฉพาะจำนวนวิชาที่สอนและจำนวนงานทั้งหมดของแต่ละคน',
    'เขียนคำสั่ง SQL เพื่อแสดง teacher_name, จำนวนวิชาที่สอน (course_count) และจำนวนงานทั้งหมดในทุกวิชา (assignment_count) โดยเชื่อม tb_courses กับ tb_assignments',
    '[{"teacher_name":"Teacher Somsak","course_count":1,"assignment_count":2},{"teacher_name":"Teacher Wanna","course_count":1,"assignment_count":1},{"teacher_name":"Teacher Nok","course_count":1,"assignment_count":1}]'::jsonb,
    'SELECT c.teacher_name, COUNT(DISTINCT c.course_id) AS course_count, COUNT(a.assignment_id) AS assignment_count FROM tb_courses c LEFT JOIN tb_assignments a ON c.course_id = a.course_id GROUP BY c.teacher_name;',
    '{"full_credit":{"score":20,"condition":"output matches expected result"},"partial_credit":{"score":10,"condition":"teacher_name and assignment_count are correct but course_count is wrong"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true}'::jsonb,
    '{"hints":["COUNT(DISTINCT c.course_id) นับวิชาที่ไม่ซ้ำกันต่อครู","COUNT(a.assignment_id) นับงานทั้งหมดที่เชื่อมกับวิชาเหล่านั้น","LEFT JOIN ทำให้ครูที่ไม่มีงานยังปรากฏในผลลัพธ์","เชื่อม tb_courses LEFT JOIN tb_assignments"]}'::jsonb,
    '{"required_columns":["teacher_name","course_count","assignment_count"]}'::jsonb,
    '{"bloom_level":"analyze","topic":"multi_aggregate","sequence":29}'::jsonb ),

  -- ── QT0030 ────────────────────────────────────────────────────────────────
  ( 'QT0030',
    'รายงานผลการเรียนฉบับสมบูรณ์',
    'เชื่อมทั้งสี่ตาราง (tb_students, tb_submissions, tb_assignments, tb_courses) เพื่อสร้างรายงานคะแนนฉบับสมบูรณ์พร้อมสถานะผ่าน/ไม่ผ่าน',
    'hard', 3::smallint, 14::smallint, 300, 20.00::numeric,
    'นักเรียนสามารถเชื่อมสี่ตารางและเพิ่มคอลัมน์คำนวณด้วย CASE WHEN ได้',
    'โรงเรียนต้องการรายงานคะแนนฉบับสมบูรณ์: สำหรับทุกการส่งงาน ให้แสดงชื่อนักเรียน ชื่อวิชา ชื่องาน คะแนน และสถานะผ่านงาน (score >= 75)',
    'เขียนคำสั่ง SQL เพื่อแสดง student_name, course_name, assignment_title, score และ status (''PASS'' ถ้า score >= 75, ''FAIL'' ในกรณีอื่น) โดยเชื่อมทั้งสี่ตาราง tb_students, tb_submissions, tb_assignments, tb_courses',
    '[{"student_name":"Alice","course_name":"Database Basics","assignment_title":"SELECT Query Basics","score":95,"status":"PASS"},{"student_name":"Bob","course_name":"Database Basics","assignment_title":"SELECT Query Basics","score":78,"status":"PASS"},{"student_name":"Diana","course_name":"Database Basics","assignment_title":"WHERE and Filtering","score":90,"status":"PASS"},{"student_name":"Eve","course_name":"Database Basics","assignment_title":"WHERE and Filtering","score":72,"status":"FAIL"},{"student_name":"Alice","course_name":"Mathematics","assignment_title":"Algebra Practice","score":88,"status":"PASS"},{"student_name":"Bob","course_name":"Mathematics","assignment_title":"Algebra Practice","score":65,"status":"FAIL"}]'::jsonb,
    'SELECT s.student_name, c.course_name, a.assignment_title, sub.score, CASE WHEN sub.score >= 75 THEN ''PASS'' ELSE ''FAIL'' END AS status FROM tb_students s INNER JOIN tb_submissions sub ON s.student_id = sub.student_id INNER JOIN tb_assignments a ON sub.assignment_id = a.assignment_id INNER JOIN tb_courses c ON a.course_id = c.course_id;',
    '{"full_credit":{"score":20,"condition":"all 6 rows appear with correct status values"},"partial_credit":{"score":10,"condition":"joins are correct but CASE WHEN status is missing or wrong"},"zero_credit":{"condition":"output does not match"}}'::jsonb,
    '{"check_type":"exact_match","ignore_row_order":true,"ignore_column_alias":true,"required_columns":["student_name","course_name","assignment_title","score","status"]}'::jsonb,
    '{"hints":["เชื่อม 4 ตาราง: tb_students -> tb_submissions -> tb_assignments -> tb_courses","CASE WHEN score >= 75 THEN ''PASS'' ELSE ''FAIL'' END สร้างคอลัมน์ status","INNER JOIN ถูกต้องในที่นี้ — เฉพาะนักเรียนที่ส่งงานเท่านั้นที่ปรากฏ"]}'::jsonb,
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
-- PART 3: Map all 30 tasks into Assignment Set AQT0001 (order 1-30)
-- =============================================================================

insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required, is_active, set_task_code)
select
  b.batch_id,
  t.task_id,
  m.task_order,
  true,
  true,
  b.batch_code || '_' || lpad(m.task_order::text, 4, '0')
from (
  values
    ('QT0001',  1), ('QT0002',  2), ('QT0003',  3),
    ('QT0004',  4), ('QT0005',  5), ('QT0006',  6),
    ('QT0007',  7), ('QT0008',  8), ('QT0009',  9),
    ('QT0010', 10), ('QT0011', 11), ('QT0012', 12),
    ('QT0013', 13), ('QT0014', 14), ('QT0015', 15),
    ('QT0016', 16), ('QT0017', 17), ('QT0018', 18),
    ('QT0019', 19), ('QT0020', 20), ('QT0021', 21),
    ('QT0022', 22), ('QT0023', 23), ('QT0024', 24),
    ('QT0025', 25), ('QT0026', 26), ('QT0027', 27),
    ('QT0028', 28), ('QT0029', 29), ('QT0030', 30)
) as m(task_code, task_order)
inner join public.mst_tasks              t on t.task_code  = m.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'AQT0001'
on conflict (batch_id, task_id) do update set
  task_order    = excluded.task_order,
  is_required   = excluded.is_required,
  is_active     = excluded.is_active,
  set_task_code = excluded.set_task_code,
  updated_at    = now();


-- =============================================================================
-- PART 4: Map 10 selected tasks into Exam Set EQT0001 (order 1-10)
-- =============================================================================

insert into public.mst_assignment_set_tasks (batch_id, task_id, task_order, is_required, is_active, set_task_code)
select
  b.batch_id,
  t.task_id,
  m.task_order,
  true,
  true,
  b.batch_code || '_' || lpad(m.task_order::text, 4, '0')
from (
  values
    ('QT0001',  1),
    ('QT0003',  2),
    ('QT0005',  3),
    ('QT0010',  4),
    ('QT0013',  5),
    ('QT0015',  6),
    ('QT0018',  7),
    ('QT0020',  8),
    ('QT0025',  9),
    ('QT0030', 10)
) as m(task_code, task_order)
inner join public.mst_tasks              t on t.task_code  = m.task_code
inner join public.mst_experiment_batches b on b.batch_code = 'EQT0001'
on conflict (batch_id, task_id) do update set
  task_order    = excluded.task_order,
  is_required   = excluded.is_required,
  is_active     = excluded.is_active,
  set_task_code = excluded.set_task_code,
  updated_at    = now();
