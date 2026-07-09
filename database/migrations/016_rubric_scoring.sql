-- Migration 016: Rubric scoring — criterion-level breakdown and submission version tracking

-- 1. Track which rubric version scored each submission
alter table public.trn_submissions
  add column if not exists rubric_applied_version int;

-- 2. Per-criterion score breakdown table
create table if not exists public.trn_submission_rubric_scores (
  rubric_score_id   uuid          primary key default gen_random_uuid(),
  submission_id     uuid          not null references public.trn_submissions(submission_id) on delete cascade,
  criterion_key     varchar(100)  not null,
  criterion_label   varchar(255)  not null,
  criterion_score   numeric(10,2) not null default 0,
  max_criterion_score numeric(10,2) not null,
  created_at        timestamptz   not null default now(),
  constraint trn_submission_rubric_scores_unique unique (submission_id, criterion_key)
);

alter table public.trn_submission_rubric_scores enable row level security;

drop policy if exists "students_read_own_rubric_scores" on public.trn_submission_rubric_scores;
drop policy if exists "staff_read_rubric_scores" on public.trn_submission_rubric_scores;

-- Students read their own criterion scores
create policy "students_read_own_rubric_scores"
  on public.trn_submission_rubric_scores
  for select to authenticated
  using (
    exists (
      select 1
        from public.trn_submissions s
        join public.mst_profiles p on p.profile_id = s.profile_id
       where s.submission_id = trn_submission_rubric_scores.submission_id
         and p.auth_user_id = auth.uid()
    )
  );

-- Teachers, admins, researchers read all
create policy "staff_read_rubric_scores"
  on public.trn_submission_rubric_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.mst_profiles
       where auth_user_id = auth.uid()
         and role in ('teacher', 'admin', 'researcher')
    )
  );
