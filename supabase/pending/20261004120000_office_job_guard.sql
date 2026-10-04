-- Office job rules, POD read-only for the Office, job audit. PREPARED, NOT APPLIED.
--
-- Found in the Office/Dispatch audit:
--  1. Editing a job in the Office rebuilt every stop from a few fields, which
--     erased arrival times and the arrival/delivery location evidence.
--  2. The Office could set any status (complete without POD, reopen closed jobs).
--  3. The Office could rewrite POD on any job and delete POD photos.
--
-- Decisions (product, final):
--  - Office: pending <-> assigned; pending/assigned/in_progress -> cancelled with
--    a reason. Never -> in_progress or -> completed (drivers only). Completed and
--    cancelled jobs are read-only. Assigned needs a driver.
--  - In progress: driver, vehicle and reference are fixed; started stops (and
--    the order up to the last started stop) cannot change. Pending stops after
--    them may be edited, added or removed.
--  - POD and completed_at: drivers only (driver_complete_job). The Office reads.
--  - Every successful Office write to a job is written to audit_log.
--
-- Applies only to signed-in Office users (admin, dispatcher) writing directly.
-- Driver functions and the geofence evaluator run as their owner (postgres) and
-- service_role is not a signed-in user, so none of them is affected. The driver
-- guard (jobs_driver_field_guard) and every driver function are unchanged.

-- 1. Cancellation reason (only for cancelled jobs; existing rows stay NULL).
alter table public.jobs add column cancellation_reason text;

-- 2. Office guard.
create or replace function public.jobs_office_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_started integer := 0;
  v_i       integer;
  v_s       jsonb;
begin
  -- SECURITY INVOKER: current_user is the real caller.
  if current_user <> 'authenticated' or coalesce(public.auth_role(), '') not in ('admin', 'dispatcher') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'assigned') then
      raise exception 'INVALID_TRANSITION' using errcode = 'MV409';
    end if;
    if new.completed_at is not null or new.pod_status is distinct from 'pending' or new.pod_photo_url is not null
       or new.pod_signature is not null or new.pod_notes is not null or new.pod_captured_at is not null
       or new.pod_lat is not null or new.pod_lng is not null then
      raise exception 'POD_READ_ONLY' using errcode = 'MV409';
    end if;
    if new.cancellation_reason is not null then
      raise exception 'INVALID_TRANSITION' using errcode = 'MV409';
    end if;
    if new.status = 'assigned' and new.driver_id is null then
      raise exception 'ASSIGNED_REQUIRES_DRIVER' using errcode = 'MV400';
    end if;
    v_started := 0;
  else
    -- Completed and cancelled jobs are read-only.
    if old.status in ('completed', 'cancelled') then
      if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
        raise exception 'JOB_CLOSED' using errcode = 'MV409';
      end if;
      return new;
    end if;

    -- Proof of delivery and completion time: drivers only.
    if new.completed_at is distinct from old.completed_at or new.pod_status is distinct from old.pod_status
       or new.pod_photo_url is distinct from old.pod_photo_url or new.pod_signature is distinct from old.pod_signature
       or new.pod_notes is distinct from old.pod_notes or new.pod_captured_at is distinct from old.pod_captured_at
       or new.pod_lat is distinct from old.pod_lat or new.pod_lng is distinct from old.pod_lng then
      raise exception 'POD_READ_ONLY' using errcode = 'MV409';
    end if;

    -- Status.
    if new.status is distinct from old.status then
      if new.status = 'cancelled' then
        new.cancellation_reason := nullif(trim(coalesce(new.cancellation_reason, '')), '');
        if new.cancellation_reason is null then
          raise exception 'CANCELLATION_REASON_REQUIRED' using errcode = 'MV400';
        end if;
      elsif not (new.status in ('pending', 'assigned') and old.status in ('pending', 'assigned')) then
        raise exception 'INVALID_TRANSITION' using errcode = 'MV409';
      end if;
    end if;
    if new.status <> 'cancelled' and new.cancellation_reason is distinct from old.cancellation_reason then
      raise exception 'INVALID_TRANSITION' using errcode = 'MV409';
    end if;
    if new.status = 'assigned' and new.driver_id is null then
      raise exception 'ASSIGNED_REQUIRES_DRIVER' using errcode = 'MV400';
    end if;

    -- In progress: driver, vehicle and reference are fixed.
    if old.status = 'in_progress' and (new.driver_id is distinct from old.driver_id
       or new.vehicle_id is distinct from old.vehicle_id or new.reference is distinct from old.reference) then
      raise exception 'JOB_FIELD_LOCKED' using errcode = 'MV409';
    end if;

    if new.stops is not distinct from old.stops then
      return new;
    end if;
    -- Started stops: everything up to the last stop that is not pending.
    v_old := coalesce(old.stops, '[]'::jsonb);
    if jsonb_typeof(v_old) = 'array' then
      select coalesce(max(e.ord), 0) into v_started
        from jsonb_array_elements(v_old) with ordinality e(s, ord)
       where coalesce(e.s->>'status', 'pending') <> 'pending';
    end if;
  end if;

  v_new := coalesce(new.stops, '[]'::jsonb);
  if jsonb_typeof(v_new) <> 'array' or jsonb_array_length(v_new) < v_started then
    raise exception 'STOP_HISTORY_LOCKED' using errcode = 'MV409';
  end if;
  -- Started stops unchanged, in the same place.
  for v_i in 0 .. v_started - 1 loop
    if v_new -> v_i is distinct from v_old -> v_i then
      raise exception 'STOP_HISTORY_LOCKED' using errcode = 'MV409';
    end if;
  end loop;
  -- Every later stop is pending and carries no arrival/delivery history.
  for v_s in select e.s from jsonb_array_elements(v_new) with ordinality e(s, ord) where e.ord > v_started loop
    if jsonb_typeof(v_s) <> 'object' or coalesce(v_s->>'status', 'pending') <> 'pending'
       or exists (select 1 from jsonb_each(v_s) k
                   where k.key ~ '^(arrived|completed)_' and k.value <> 'null'::jsonb) then
      raise exception 'STOP_HISTORY_LOCKED' using errcode = 'MV409';
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.jobs_office_guard() from public, anon, authenticated;

drop trigger if exists jobs_office_guard on public.jobs;
create trigger jobs_office_guard before insert or update on public.jobs
  for each row execute function public.jobs_office_guard();

-- 3. Audit of successful Office job writes. SECURITY DEFINER to write
-- audit_log (no client may insert into it); runs only after the write
-- succeeded, so refused writes leave nothing. The caller is read from the
-- request role (SET ROLE), which SECURITY DEFINER does not change.
create or replace function public.jobs_office_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' - 'pod_signature' end;
  v_new    jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' - 'pod_signature' end;
  v_from   jsonb := '{}'::jsonb;
  v_to     jsonb := '{}'::jsonb;
  v_action text;
  v_row    jsonb := coalesce(v_new, v_old);
begin
  if coalesce(current_setting('role', true), '') <> 'authenticated'
     or coalesce(public.auth_role(), '') not in ('admin', 'dispatcher') then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k.key, v_old -> k.key), '{}'::jsonb), coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
      into v_from, v_to
      from jsonb_each(v_new) k
     where k.value is distinct from v_old -> k.key;
    if v_to = '{}'::jsonb then
      return null;
    end if;
    v_action := case
      when v_to ? 'status' and new.status = 'cancelled' then 'job.cancelled'
      when v_to ? 'status' then 'job.status_changed'
      when v_to ? 'driver_id' or v_to ? 'vehicle_id' then 'job.reassigned'
      when v_to ? 'stops' then 'job.stops_changed'
      else 'job.updated' end;
  elsif tg_op = 'INSERT' then
    v_action := 'job.created';
    v_to := v_new;
  else
    v_action := 'job.deleted';
    v_from := v_old;
  end if;

  insert into public.audit_log (actor_id, action, resource_type, resource_id, changes)
  values (auth.uid(), v_action, 'job', null,
          jsonb_build_object('organization_id', v_row ->> 'organization_id', 'job_id', (v_row ->> 'id')::integer,
                             'reference', v_row ->> 'reference', 'old', v_from, 'new', v_to));
  return null;
end;
$function$;

revoke all on function public.jobs_office_audit() from public, anon, authenticated;

drop trigger if exists jobs_office_audit on public.jobs;
create trigger jobs_office_audit after insert or update or delete on public.jobs
  for each row execute function public.jobs_office_audit();

-- 4. POD photos cannot be deleted by any signed-in user (Office or driver).
-- Uploads (driver_complete_job checks the file) and reads are unchanged.
drop policy if exists pod_photos_delete on storage.objects;
