-- Driver workflow.
--
-- 1. jobs_driver_field_guard silently reverted pod_signature and completed_at
--    for drivers, so a signature captured by the driver was discarded and a
--    completed job never got its completion time. Drivers may now write the
--    signature; completed_at is stamped by the database when the driver moves
--    the job to completed. Drivers may only move a job to in_progress or
--    completed — never cancel, un-assign or reopen it.
-- 2. Stops live in jobs.stops (jsonb), which drivers cannot write directly.
--    driver_update_stop() marks one stop arrived/completed on a job assigned
--    to the calling driver.

create or replace function public.jobs_driver_field_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and public.auth_role() = 'driver' then
    new.id               := old.id;
    new.reference        := old.reference;
    new.customer         := old.customer;
    new.customer_phone   := old.customer_phone;
    new.priority         := old.priority;
    new.pickup_address   := old.pickup_address;
    new.pickup_lat       := old.pickup_lat;
    new.pickup_lng       := old.pickup_lng;
    new.delivery_address := old.delivery_address;
    new.delivery_lat     := old.delivery_lat;
    new.delivery_lng     := old.delivery_lng;
    new.scheduled_date   := old.scheduled_date;
    new.eta              := old.eta;
    new.tracking_token   := old.tracking_token;
    new.vehicle_id       := old.vehicle_id;
    new.driver_id        := old.driver_id;
    new.created_by       := old.created_by;
    new.created_at       := old.created_at;
    new.organization_id  := old.organization_id;
    new.stops            := old.stops;

    if new.status is distinct from old.status
       and new.status not in ('in_progress', 'completed') then
      new.status := old.status;
    end if;
    if old.status = 'completed' then
      new.status := old.status;
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.driver_update_stop(
  p_job_id integer, p_stop_index integer, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver integer := public.auth_driver_id();
  v_stops  jsonb;
  v_status public.job_status;
  v_stop   jsonb;
begin
  if v_driver is null or public.auth_role() is distinct from 'driver' then
    raise exception 'NOT_A_DRIVER' using errcode = 'MV403';
  end if;
  if p_status not in ('arrived', 'completed') then
    raise exception 'INVALID_STATUS' using errcode = 'MV400';
  end if;

  select coalesce(j.stops, '[]'::jsonb), j.status into v_stops, v_status
    from public.jobs j
   where j.id = p_job_id
     and j.driver_id = v_driver
     and j.organization_id = public.auth_org_id()
   for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'MV404';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'JOB_CLOSED' using errcode = 'MV409';
  end if;
  if p_stop_index < 0 or p_stop_index >= jsonb_array_length(v_stops) then
    raise exception 'STOP_NOT_FOUND' using errcode = 'MV404';
  end if;

  v_stop := v_stops -> p_stop_index;
  if p_status = 'arrived' then
    v_stop := v_stop || jsonb_build_object('status', 'arrived', 'arrived_at', now());
  else
    v_stop := v_stop || jsonb_build_object('status', 'completed', 'completed_at', now());
  end if;
  v_stops := jsonb_set(v_stops, array[p_stop_index::text], v_stop);

  update public.jobs
     set stops      = v_stops,
         status     = case when status in ('pending', 'assigned') then 'in_progress'::public.job_status else status end,
         updated_at = now()
   where id = p_job_id;

  return v_stops;
end;
$$;

revoke all on function public.driver_update_stop(integer, integer, text) from public, anon;
grant execute on function public.driver_update_stop(integer, integer, text) to authenticated;
