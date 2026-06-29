insert into public.mst_courses (course_code, course_title, course_description, is_active)
values ('SQL101', 'Basic SQL Learning Dataset Course', 'ชุดโจทย์พื้นฐานสำหรับเก็บข้อมูลพฤติกรรมการเรียนรู้ SQL', true)
on conflict (course_code) do update set course_title = excluded.course_title, course_description = excluded.course_description, is_active = excluded.is_active;

insert into public.mst_lessons (course_id, lesson_code, lesson_title, lesson_description, display_order, is_active)
select course_id, 'L001', 'Basic SELECT Statement', 'บทเรียนพื้นฐานเกี่ยวกับ SELECT และ FROM', 1, true
from public.mst_courses where course_code = 'SQL101'
on conflict (course_id, lesson_code) do update set lesson_title = excluded.lesson_title, lesson_description = excluded.lesson_description;

insert into public.mst_tasks (lesson_id, task_code, task_title, task_description, task_type, difficulty_level, learning_objective, problem_statement, database_schema_json, sample_data_json, expected_answer, expected_concept, max_score, estimated_time_seconds, task_status, is_active, published_at)
select l.lesson_id, 'SQL_TEXT_001', 'Select all students', 'เขียน SQL เพื่อแสดงข้อมูลนักเรียนทั้งหมดจากตาราง students', 'sql_text', 'easy',
'ผู้เรียนสามารถใช้ SELECT และ FROM เพื่อเรียกข้อมูลจากตารางได้', 'จงเขียนคำสั่ง SQL เพื่อแสดงข้อมูลทั้งหมดจากตาราง students',
'{"tables":[{"table_name":"students","columns":[{"name":"student_id","type":"int"},{"name":"name","type":"varchar"},{"name":"grade_level","type":"varchar"}]}]}'::jsonb,
'{"students":[{"student_id":1,"name":"Alice","grade_level":"M1"},{"student_id":2,"name":"Bob","grade_level":"M1"}]}'::jsonb,
'SELECT * FROM students;', 'select_from', 100, 180, 'published', true, now()
from public.mst_lessons l join public.mst_courses c on l.course_id = c.course_id where c.course_code = 'SQL101' and l.lesson_code = 'L001'
on conflict (task_code) do update set expected_answer = excluded.expected_answer, task_status = excluded.task_status, is_active = excluded.is_active;

insert into public.mst_tasks (lesson_id, task_code, task_title, task_description, task_type, difficulty_level, learning_objective, problem_statement, database_schema_json, sample_data_json, expected_answer, expected_concept, max_score, estimated_time_seconds, task_status, is_active, published_at)
select l.lesson_id, 'SQL_BLOCK_001', 'Select student names', 'เรียง block ให้เป็น SQL เพื่อแสดงเฉพาะชื่อของนักเรียนจากตาราง students', 'sql_block', 'easy',
'ผู้เรียนสามารถเรียง block เพื่อสร้างคำสั่ง SELECT column FROM table ได้', 'จงเรียง block ให้เป็นคำสั่ง SQL เพื่อแสดงเฉพาะคอลัมน์ name จากตาราง students',
'{"tables":[{"table_name":"students","columns":[{"name":"student_id","type":"int"},{"name":"name","type":"varchar"},{"name":"grade_level","type":"varchar"}]}]}'::jsonb,
'{"students":[{"student_id":1,"name":"Alice","grade_level":"M1"},{"student_id":2,"name":"Bob","grade_level":"M1"}]}'::jsonb,
'SELECT name FROM students;', 'select_column_from', 100, 180, 'published', true, now()
from public.mst_lessons l join public.mst_courses c on l.course_id = c.course_id where c.course_code = 'SQL101' and l.lesson_code = 'L001'
on conflict (task_code) do update set expected_answer = excluded.expected_answer, task_status = excluded.task_status, is_active = excluded.is_active;

insert into public.mst_blocks (task_id, block_code, block_label, block_value, block_type, display_order, correct_order, is_correct_part, metadata_json)
select t.task_id, x.block_code, x.block_label, x.block_value, x.block_type, x.display_order, x.correct_order, x.is_correct_part, x.metadata_json
from public.mst_tasks t cross join (values
 ('B_SELECT','SELECT','SELECT','keyword',1,1,true,'{"role":"required"}'::jsonb),
 ('B_NAME','name','name','column',2,2,true,'{"role":"required"}'::jsonb),
 ('B_FROM','FROM','FROM','keyword',3,3,true,'{"role":"required"}'::jsonb),
 ('B_STUDENTS','students','students','table',4,4,true,'{"role":"required"}'::jsonb),
 ('B_DELETE','DELETE','DELETE','keyword',5,null,false,'{"role":"distractor"}'::jsonb)
) as x(block_code, block_label, block_value, block_type, display_order, correct_order, is_correct_part, metadata_json)
where t.task_code = 'SQL_BLOCK_001'
on conflict (task_id, block_code) do update set block_label = excluded.block_label, block_value = excluded.block_value, display_order = excluded.display_order;

insert into public.mst_experiment_batches (batch_code, batch_name, batch_description, batch_type, status, start_at)
values ('PILOT_001', 'Pilot Study Round 1', 'รอบทดลองนำร่องสำหรับตรวจสอบระบบเก็บ Dataset', 'pilot', 'active', now())
on conflict (batch_code) do update set batch_name = excluded.batch_name, status = excluded.status;
