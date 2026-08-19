-- 027_block_event_infrastructure.sql
-- M5.1A: Atomic block-event insert RPC + get_blocks_for_student_task hardening
--
-- Problem (Phase 5 audit finding):
--   Both services/event-service.ts and lib/server-dataset-utils.ts use a
--   non-atomic count+1 pattern (getNextEventOrder) to allocate event_order.
--   Rapid block interactions (add/delete/move) from the same session can emit
--   events concurrently on the client, causing race conditions that produce
--   duplicate event_order values and violate the UNIQUE(session_id, event_order)
--   constraint.
--
-- Solution — insert_block_event:
--   A SECURITY DEFINER function that acquires a session-scoped advisory lock,
--   computes max(event_order)+1 within the lock, inserts the event, and updates
--   last_event_at — all in a single DB transaction. This is the only supported
--   path for emitting block_add / block_delete / block_move events.
--
-- get_blocks_for_student_task hardening:
--   Previously any authenticated user could retrieve blocks for any published
--   active task ("authorization by publication status only"). This revision adds
--   a check that the caller has a learning session for the target task, matching
--   the defense-in-depth principle from the Phase 5 contract.
--
-- Block-event vocabulary (Phase 5 contract v1):
--   token 6 = block_add   (emitted on drag-in or click-add)
--   token 7 = block_delete (emitted on remove from workspace)
--   token 8 = block_move   (emitted on reorder within workspace)
--   token 9 = block_submit  RESERVED — not activated; submission captured by
--                           the existing submit_answer event pair (Phase 4 contract)
--
-- Run order: after 026_mock_config_metadata.sql

-- ─── 1. Atomic block-event insert ────────────────────────────────────────────

create or replace function public.insert_block_event(
  p_session_id          uuid,
  p_profile_id          uuid,
  p_task_id             uuid,
  p_event_type          varchar,
  p_event_value         text          default null,
  p_duration_from_start int           default null,
  p_metadata_json       jsonb         default null
)
returns table (event_id uuid, event_order int)
language plpgsql security definer set search_path = public
as $$
declare
  v_lock_key    bigint;
  v_event_order int;
  v_event_id    uuid;
  v_now         timestamptz := clock_timestamp();
begin
  -- 1. Verify the caller owns the session.
  --    p_profile_id must match the session AND resolve to auth.uid() via mst_profiles.
  --    Both checks are required: p_profile_id prevents spoofing the profile;
  --    auth.uid() ensures the JWT identity matches the profile record.
  if not exists (
    select 1
    from   public.trn_learning_sessions s
    join   public.mst_profiles          pr on s.profile_id = pr.profile_id
    where  s.session_id  = p_session_id
      and  s.profile_id  = p_profile_id
      and  pr.auth_user_id = auth.uid()
  ) then
    raise exception 'Session not found or not owned by current user'
      using errcode = 'insufficient_privilege';
  end if;

  -- 2. Accept only the three active block-manipulation event types.
  --    block_submit (token 9) is reserved and must not be emitted via this path.
  if p_event_type not in ('block_add', 'block_delete', 'block_move') then
    raise exception 'Invalid block event type: %. Accepted: block_add, block_delete, block_move', p_event_type
      using errcode = 'invalid_parameter_value';
  end if;

  -- 3. Acquire an exclusive advisory lock scoped to this session.
  --    The lock is transaction-scoped (pg_advisory_xact_lock), so it is held
  --    until this function's implicit transaction commits or rolls back.
  --    Concurrent inserts for the same session_id queue behind the lock,
  --    making count+1 serialised and therefore safe.
  --
  --    Lock key derivation: take the first 16 hex digits of the session UUID
  --    (after stripping hyphens) and cast to bigint. Collisions between
  --    distinct sessions are astronomically unlikely and are safe (they only
  --    cause unnecessary serialisation, not data corruption).
  v_lock_key := ('x' || substr(replace(p_session_id::text, '-', ''), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- 4. Compute next event_order inside the lock.
  --    max+1 is used instead of count+1 to remain correct even if rows were
  --    deleted (which would create gaps that count+1 would re-use).
  select coalesce(max(el.event_order), 0) + 1
  into   v_event_order
  from   public.trn_event_logs el
  where  el.session_id = p_session_id;

  -- 5. Insert the event row. The UNIQUE(session_id, event_order) constraint
  --    provides a final safety net; a violation here indicates a logic bug.
  insert into public.trn_event_logs (
    session_id, profile_id, task_id,
    event_order, event_type, event_value,
    duration_from_start, metadata_json, event_time
  ) values (
    p_session_id, p_profile_id, p_task_id,
    v_event_order, p_event_type, p_event_value,
    p_duration_from_start, p_metadata_json, v_now
  )
  returning trn_event_logs.event_id into v_event_id;

  -- 6. Touch the session so last_event_at stays current.
  update public.trn_learning_sessions
  set    last_event_at = v_now
  where  session_id    = p_session_id;

  return query select v_event_id, v_event_order;
end;
$$;

grant execute on function public.insert_block_event(uuid, uuid, uuid, varchar, text, int, jsonb) to authenticated;

-- ─── 2. Harden get_blocks_for_student_task ───────────────────────────────────
--
-- Previous version: any authenticated user could fetch blocks for any published
-- active task (no session or assignment check). The query is replaced in-place
-- so the function signature and grant are preserved.

create or replace function public.get_blocks_for_student_task(p_task_id uuid)
returns table (
  block_id uuid, task_id uuid, block_code varchar, block_label varchar,
  block_value text, block_type varchar, display_order int, metadata_json jsonb
)
language sql security definer set search_path = public stable as $$
  select b.block_id, b.task_id, b.block_code, b.block_label,
         b.block_value, b.block_type, b.display_order, b.metadata_json
  from   public.mst_blocks b
  join   public.mst_tasks  t  on b.task_id = t.task_id
  where  b.task_id     = p_task_id
    and  t.task_status = 'published'
    and  t.is_active   = true
    -- Caller must have at least one learning session for this task.
    -- This enforces defense-in-depth: publication status is necessary but not
    -- sufficient; the student must also have been assigned and started the task.
    and  exists (
      select 1
      from   public.trn_learning_sessions s
      join   public.mst_profiles          pr on s.profile_id = pr.profile_id
      where  s.task_id       = p_task_id
        and  pr.auth_user_id = auth.uid()
    )
  order by b.display_order asc, b.created_at asc;
$$;

grant execute on function public.get_blocks_for_student_task(uuid) to authenticated;
