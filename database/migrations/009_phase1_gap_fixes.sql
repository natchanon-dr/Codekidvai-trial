-- Migration 009: Phase 1 gap fixes
-- Adds durable teacher review fields and minimal class self-enrollment controls.

alter table public.trn_submissions
add column if not exists auto_score numeric(10,2),
add column if not exists review_score numeric(10,2),
add column if not exists review_status varchar(30) not null default 'submitted',
add column if not exists teacher_feedback text,
add column if not exists reviewed_by uuid references public.mst_profiles(profile_id) on delete set null,
add column if not exists reviewed_at timestamptz;

update public.trn_submissions
set auto_score = final_score
where auto_score is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_trn_submissions_review_status'
  ) then
    alter table public.trn_submissions
    add constraint chk_trn_submissions_review_status
    check (review_status in ('submitted', 'reviewed', 'completed'));
  end if;
end $$;

alter table public.tb_classes
add column if not exists enrollment_code varchar(100),
add column if not exists is_open_for_enrollment boolean not null default true;

with class_code_counts as (
  select class_code, count(*) as class_count
  from public.tb_classes
  group by class_code
)
update public.tb_classes c
set enrollment_code = case
  when counts.class_count = 1 then c.class_code
  else c.class_code || '-' || left(c.class_id::text, 8)
end
from class_code_counts counts
where c.class_code = counts.class_code
  and c.enrollment_code is null;

create unique index if not exists idx_tb_classes_enrollment_code_unique
on public.tb_classes(enrollment_code)
where enrollment_code is not null;
