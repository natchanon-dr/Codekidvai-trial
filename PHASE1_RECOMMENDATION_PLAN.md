# Phase 1 Recommendation Plan

Status: recommendation only. Do not treat this document as implementation approval.

This document consolidates the Phase 1 audit gaps and the clarified product requirements for CKV / CodeKidVai Trial. The next Codex task should inspect the current implementation, compare it with this recommendation, and propose or implement only the approved scope.

## 1. Current Implementation Findings

The latest Phase 1 audit found that the main teacher/student learning flow is mostly present:

- Teacher login: pass.
- Teacher dashboard: pass.
- Create class: pass.
- Create assignment set: pass.
- Assign task: pass.
- Student login: pass.
- Student dashboard: pass.
- Open task: pass.
- Run answer: pass.
- Submit answer: pass.

The two original Phase 1 gaps were:

1. Student/class membership flow was incomplete or unclear.
2. Teacher review persistence was incomplete or unclear.

The requirement has since been clarified: student membership should not be mainly based on the teacher manually adding students. Students should register, request academy access, wait for Admin approval, then join a class themselves using a class code or enrollment code.

### Live inspection notes

- `tb_academy`, `tb_classes`, and `tb_class_students` already exist.
- `tb_academy` is minimal and currently uses `is_active`, not a full academy status workflow.
- `tb_classes` already has `academy_id`, but class creation currently creates or reuses a `DEFAULT` academy automatically.
- `tb_classes` does not currently expose `enrollment_code`, `is_open_for_enrollment`, or a distinct `target_level` field.
- `mst_profiles` currently stores `display_name`, `grade_level`, and `school_type`, but not `first_name`, `last_name`, `student_code`, or stored `email`.
- Current academy access is single-profile-oriented through nullable `mst_profiles.academy_id`; no multi-academy membership/request table was found.
- Student dashboard currently reads direct `trn_task_assignments`, not academy/class-scoped enrollment context.
- Teacher review UI and `/api/teacher/submissions` exist, but the API is read-only and review status/score changes are client-side only.
- `trn_submissions` currently stores score/pass/run stats but not `review_status`, `teacher_feedback`, `reviewed_by`, or `reviewed_at`.
- Student dashboard references `trn_batch_submissions`, but no matching migration was found during inspection.

## 2. Student Self-Enrollment Plan

### Intended behavior

Teacher side:

- Teacher creates a class.
- Class belongs to an academy.
- Class has `class_code` or `enrollment_code`.
- Class has `target_level` or `grade_level`.
- Teacher shares the class code or enrollment code with students.
- Teacher can view students enrolled in classes under the current academy context.

Student side:

- Student registers or logs in.
- Student completes required profile information.
- Student requests access to an academy.
- Admin approves the student academy membership.
- Student selects or enters the current academy context.
- Student opens a Join Class page within the selected academy.
- Student enters `class_code` or `enrollment_code`.
- System validates the class and academy scope.
- System inserts or reactivates membership in `tb_class_students`.
- Student dashboard shows tasks/sets from enrolled classes only.

### Rules

- Prevent duplicate class membership.
- Do not allow students to join inactive classes.
- Do not allow students to join classes outside the selected academy.
- Do not allow students to join unauthorized or closed classes.
- Do not expose unsafe direct `class_id` enrollment if an enrollment code exists.
- Teacher/Admin can view class members only within authorized academy scope.
- Student can only view their own class enrollment.

### Likely implementation targets later

- Student Join Class page.
- Student Join Class API.
- Class detail/member list updates.
- Student dashboard query update.
- Academy-scoped authorization helper.

## 3. Student Profile Registration Plan

Supabase Auth should only handle authentication. Student-owned identity data should be stored in the application profile table, preferably `mst_profiles` or the existing profile-related table.

### Required student-owned fields

- `first_name`
- `last_name`
- `display_name`
- `student_code` or student ID
- `email`

### Important clarification

Do not require the student to manually enter year level / grade level during registration.

Year level / grade level should belong to the class because students enroll into classes, and each class can specify its target audience.

Class-level fields should include or eventually support:

- `target_level` or `grade_level`
- `enrollment_code`
- `is_open_for_enrollment`
- `is_active`
- `academy_id`

### Display expectations

Student dashboard and teacher-facing pages should be able to show:

- student name
- student code
- email
- enrolled academy
- enrolled class
- class target level

Exports should derive year level / grade level from the class, not from the student profile, unless a future requirement explicitly adds student-level year.

## 4. Multi-Academy Access and Admin Approval Plan

The system must support one login user belonging to more than one academy.

Supabase Auth remains one login identity.

Application access must be scoped by selected academy.

### Critical rule

Only Admin users can create or initialize a new Academy in the academy master table.

Teacher and Student users must not create new academies.

Teacher and Student users can only request to join/register under an existing active academy from the academy master list.

Academy membership must require Admin approval before teacher/student can access academy-scoped features.

Use these product terms:

- Join Academy
- Request Academy Access
- Register under Academy
- Select Academy

Do not describe teacher/student flow as Create Academy.

### Expected login routing

After login, the system checks active academy memberships.

- If zero academy memberships: show Join Academy / Request Academy Access.
- If only pending memberships: show Pending Approval.
- If exactly one active academy: auto-select that academy and route to the relevant dashboard.
- If more than one active academy: show academy selection page or popup before entering dashboard.
- Rejected/inactive memberships must not grant access.

### Current academy context

All academy-scoped pages and APIs must validate `current_academy_id` against the user’s active academy memberships.

Applies to:

- teacher dashboard
- student dashboard
- classes
- students
- assignment sets
- assignments
- labs
- exams
- submissions
- templates
- uploads
- exports

## 5. Admin Academy Dashboard Plan

Admin should have an Academy Dashboard.

Suggested route later:

- `/admin/academies`

The dashboard should list all academies currently in the system.

Suggested list columns:

- academy code
- academy name
- academy status
- pending student count
- pending teacher count
- active student count
- active teacher count
- created date
- actions

Admin actions:

1. Add Academy.
2. Inactive Academy.
3. Open Academy detail.

### Add Academy

Admin creates a new academy master record.

Teacher/student cannot do this.

Suggested fields:

- academy_code
- academy_name
- academy_type
- description
- status

New academy should normally start with `status = active`, unless a later admin workflow says otherwise.

### Inactive Academy

Admin can mark an academy inactive.

Rules:

- Do not physically delete academy data.
- Inactive academies should not appear in teacher/student Join Academy list.
- New join requests should not be allowed for inactive academies.
- Existing access to inactive academy should be blocked or handled by a documented read-only/blocking plan.

### Academy Detail

When Admin opens an academy detail page, show menus:

- Approve Student
- Approve Teacher

Suggested routes later:

- `/admin/academies/[academyId]/students`
- `/admin/academies/[academyId]/teachers`

## 6. Academy Approval Workflow

### Student Approval

Admin can open Approve Student under an Academy.

List pending student membership requests for that academy.

Suggested fields:

- first name
- last name
- student code
- email
- requested_at
- membership_status
- actions: approve / reject

Approve action:

- `membership_status = active`
- `approved_by = current admin profile id`
- `approved_at = current timestamp`

Reject action:

- `membership_status = rejected`
- `rejected_by = current admin profile id`
- `rejected_at = current timestamp`

### Teacher Approval

Admin can open Approve Teacher under an Academy.

List pending teacher membership requests for that academy.

Suggested fields:

- first name
- last name
- email
- requested_at
- membership_status
- actions: approve / reject

Approve action:

- `membership_status = active`
- `approved_by = current admin profile id`
- `approved_at = current timestamp`

Reject action:

- `membership_status = rejected`
- `rejected_by = current admin profile id`
- `rejected_at = current timestamp`

## 7. Teacher Review Persistence Plan

Teacher should be able to review submitted answers and persist review changes.

The current audit suggested that review pages and submission API exist, but review status/score changes may be client-side only.

Expected behavior:

- Teacher can update review status.
- Teacher can update final score if supported.
- Teacher can update pass/fail if supported.
- Teacher can add teacher feedback if supported.
- System records reviewed_by and reviewed_at if supported.
- After refresh, saved review data still appears.
- Teacher cannot update submissions outside owned classes/sets/academy unless Admin.

Inspect before implementation:

- `trn_submissions`
- existing review columns
- submission review page
- submission API
- whether review update currently persists
- whether submission queries are academy-scoped

If required review columns do not exist, propose a migration first. Do not change schema without approval.

## 8. Template / Upload Design

Design only at this stage. Do not implement before scope approval.

Template/upload should be academy-scoped and role-restricted.

### Templates to design

1. Academies template for Admin only.
2. Classes template.
3. Student profile template.
4. Academy membership request / approval template, if needed.
5. Student enrollment template.
6. Assignment set template.
7. Task / Assignment template.
8. Lab template, if different from assignment.
9. Exam template, if different from assignment.

For each template, define:

- sheet name
- required columns
- optional columns
- example rows
- validation rules
- target database tables
- import behavior
- duplicate handling
- error handling/reporting
- security rule
- whether Admin-only or Teacher-allowed

### Suggested template principles

- Prefer existing tables and columns.
- Do not create new tables unless necessary.
- Template download should reflect system-supported import format.
- Upload should validate before writing.
- Upload should report row-level errors.
- Upload should not partially corrupt data.
- Upload should respect current academy context.

## 9. Export Design

Export should respect current page, current filters, and current academy context.

### Admin exports

- Academies.
- Academy pending students.
- Academy pending teachers.

### Teacher exports

- Classes.
- Students.
- Assignment Sets.
- Assignments.
- Labs.
- Exams.
- Submissions.

### Submission Export: Student Mode

If teacher is viewing submission results by student, export student-oriented format.

Expected structure: one row per student per set.

Suggested columns:

- academy
- class
- set
- student name
- student code
- email
- submitted count
- pending count
- total score
- max score
- average score
- status
- last submitted time

### Submission Export: Task Mode

If teacher is viewing submission results by task, export task-oriented format.

Expected structure: one row per task per set.

Suggested columns:

- academy
- class
- set
- task code
- task title
- task type
- assigned count
- submitted count
- pending count
- min score
- max score
- average score
- standard deviation score
- pass rate
- delivered count
- reviewed count
- completed count

For each export type, define:

- filename convention
- columns
- filters included
- CSV or XLSX
- how current UI filters/mode affect export
- data source/API endpoint
- security rules
- academy scoping rules

## 10. Files Likely to Change Later

Do not change these files until implementation is explicitly approved.

Likely areas:

- `app/auth/register/*`
- `app/auth/login/*`
- `app/student/*`
- `app/teacher/*`
- `app/admin/*`
- `app/api/student/*`
- `app/api/teacher/*`
- `app/api/admin/*`
- `lib/api-auth.ts`
- `lib/*supabase*`
- `database/migrations/*`
- template/export utilities if created later

## 11. API Endpoints Likely to Add or Update Later

Possible future endpoints:

- `GET /api/academy/memberships`
- `POST /api/academy/request-access`
- `POST /api/academy/select`
- `GET /api/student/classes/available`
- `POST /api/student/classes/join`
- `GET /api/admin/academies`
- `POST /api/admin/academies`
- `PATCH /api/admin/academies/[academyId]`
- `GET /api/admin/academies/[academyId]/pending-students`
- `GET /api/admin/academies/[academyId]/pending-teachers`
- `PATCH /api/admin/academy-members/[memberId]`
- `PATCH /api/teacher/submissions/[submissionId]/review`
- export endpoints for admin/teacher pages
- template download endpoints
- upload validation/import endpoints

Endpoint names should be adjusted to match the existing route style after inspection.

## 12. Database Tables / Columns Involved

Inspect before implementation.

### Academy master

Possible table: `mst_academies` or current equivalent.

Suggested fields:

- academy_id
- academy_code
- academy_name
- academy_type
- description
- status
- created_by
- created_at
- updated_at

### Academy membership

Possible table: `tb_academy_members` or current equivalent.

Suggested fields:

- academy_member_id
- academy_id
- profile_id
- role_in_academy
- membership_status
- requested_at
- approved_by
- approved_at
- rejected_by
- rejected_at
- inactive_at

### Class

Possible table: `tb_classes`.

Suggested fields to inspect:

- academy_id
- class_code
- class_name
- target_level
- grade_level
- enrollment_code
- is_open_for_enrollment
- is_active

### Class student membership

Possible table: `tb_class_students`.

Suggested fields to inspect:

- class_id
- profile_id
- status
- joined_at

### Profile

Possible table: `mst_profiles`.

Suggested fields to inspect:

- profile_id
- auth_user_id
- role
- email
- first_name
- last_name
- display_name
- student_code

### Submissions

Possible table: `trn_submissions`.

Suggested fields to inspect:

- submission_id
- profile_id
- batch_id
- task_id
- final_score
- is_passed
- review_status
- teacher_feedback
- reviewed_by
- reviewed_at
- delivered_at
- completed_at

## 13. Migrations Required

Do not create migrations until approved.

Likely migrations may be required for:

- profile fields: first_name, last_name, student_code, display_name behavior
- academy master table if not already sufficient
- academy membership request/approval table if not already sufficient
- class academy scope / enrollment code / target level fields
- review persistence fields in submissions

Important: current accepted schema may include naming like `tb_academy`, `tb_classes`, `tb_class_students`, while governance prefers `mst_*` / `trn_*`. Do not rename existing tables during Phase 1 gap fixes. Propose naming carefully and avoid destructive schema changes.

## 14. Risks and Assumptions

- Academy scoping touches many files and APIs; it must be planned and approved as a larger change.
- Existing accepted schema may conflict with later naming conventions.
- Auto-assigning class sets to newly enrolled students must be defined carefully to avoid duplicate or stale assignments.
- Review persistence must not overwrite original auto-scoring unless intended.
- Inactive academy behavior must be defined carefully: block access vs read-only.
- Upload/import must validate data before write.
- Exports must never leak cross-academy data.
- Migrations with deletion logic must be treated carefully in real environments.
- Existing `trn_batch_submissions` usage should be resolved before relying on submit-to-teacher behavior.

## 15. Recommended Implementation Order

### Phase 1 gap fixes

1. Teacher review persistence migration and API/UI save behavior.
2. Minimal student self-enrollment into existing `tb_class_students`.
3. Preserve existing teacher/student/labs/exams/submissions features.

### Phase 1.5 / early Phase 2

4. Profile registration fields and profile-completion guard.
5. Academy membership request/approval model.
6. Academy context enforcement across APIs.
7. Admin academy dashboard and approval workflows.
8. Full academy-scoped exports, templates, and uploads.

## 16. Scope Separation

### Phase 1 gap fixes

- Student self-enrollment into class.
- Teacher review persistence.
- Preserve existing teacher/student/labs/exams/submissions features.

### Phase 1.5 / early Phase 2 enhancements

- Multi-academy membership and academy selection.
- Admin academy dashboard and approval workflows.
- Full academy-scoped exports/templates/uploads.
- Registration profile enrichment beyond current display-name flow.

## 17. Next Codex Instruction

Recommended next Codex prompt:

```text
Read PHASE1_RECOMMENDATION_PLAN.md from the repository root.

Do not implement yet.

Inspect the current code and schema, then produce a concrete implementation proposal for only Phase 1 gap fixes:

1. Teacher review persistence.
2. Minimal student self-enrollment into existing class membership flow.

Do not implement multi-academy, admin academy approval, templates, uploads, or exports yet. Treat those as Phase 1.5 / early Phase 2.

Your proposal must list:
- exact files to change
- exact API endpoints to add/update
- exact database columns/tables to use
- whether migration is required
- risks
- manual test steps

Stop after the proposal and wait for approval.
```
