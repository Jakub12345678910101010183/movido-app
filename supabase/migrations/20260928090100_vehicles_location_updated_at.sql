-- Vehicle markers on the office map had no freshness rule: vehicles stored a
-- position but not when it was recorded (updated_at also changes on ordinary
-- edits), so a months-old position looked live. Drivers already carry
-- location_updated_at and the map hides drivers older than 12 hours.
--
--  * vehicles.location_updated_at: when the stored position was recorded.
--  * driver_report_locations stamps it with the GPS point time (not upload
--    time) and, like drivers, never replaces a newer position with an older one.
--  * A trigger covers every other writer: server-side writers (e.g. the web
--    driver's driver_report_location) get now(); a manual lat/lng edit by a
--    signed-in office user clears it, because a typed-in position is not live.
--  * Existing rows stay NULL (age unknown) and are not shown as live until the
--    next GPS report. No existing data is rewritten.

alter table public.vehicles add column if not exists location_updated_at timestamptz;

create or replace function public.vehicles_stamp_location_time()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' or new.location_lat is null then
      new.location_updated_at := null;
    elsif new.location_updated_at is null then
      new.location_updated_at := now();
    end if;
    return new;
  end if;

  if current_user = 'authenticated' then
    -- Office users cannot set freshness; moving the position makes it non-live.
    if (new.location_lat, new.location_lng) is distinct from (old.location_lat, old.location_lng) then
      new.location_updated_at := null;
    else
      new.location_updated_at := old.location_updated_at;
    end if;
  elsif (new.location_lat, new.location_lng) is distinct from (old.location_lat, old.location_lng)
        and new.location_updated_at is not distinct from old.location_updated_at then
    new.location_updated_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists vehicles_stamp_location_time on public.vehicles;
create trigger vehicles_stamp_location_time
  before insert or update on public.vehicles
  for each row execute function public.vehicles_stamp_location_time();

-- GPS batch upload: unchanged except the vehicles update (location time + no
-- regression to an older point).
create or replace function public.driver_report_locations(p_points jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me        record;
  v_job     integer;
  v_vehicle integer;
  v_last    timestamptz;
  v_prev    timestamptz;
  v_latest  jsonb;
  v_latest_at timestamptz;
  v_n       integer := 0;
  p         jsonb;
  v_at      timestamptz;
  v_lat     double precision;
  v_lng     double precision;
  v_acc     double precision;
  v_speed   double precision;
  v_heading double precision;
begin
  select * into me from public.driver_require();
  if p_points is null or jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) = 0 then
    raise exception 'NO_POINTS' using errcode = 'MV400';
  end if;
  if jsonb_array_length(p_points) > 500 then
    raise exception 'TOO_MANY_POINTS' using errcode = 'MV400';
  end if;

  select id into v_job from public.jobs
   where driver_id = me.driver_id and organization_id = me.organization_id
     and status in ('in_progress', 'assigned', 'pending')
   order by (status = 'in_progress') desc, scheduled_date nulls last, updated_at desc
   limit 1;
  v_vehicle := coalesce(me.vehicle_id, (select vehicle_id from public.jobs where id = v_job));

  -- Points already stored (a retried batch) are skipped by time.
  select max(recorded_at) into v_last from public.driver_positions where driver_id = me.driver_id;
  v_prev := v_last;

  for p in select value from jsonb_array_elements(p_points)
            order by (value->>'recorded_at')::timestamptz nulls last
  loop
    v_lat := (p->>'lat')::double precision;
    v_lng := (p->>'lng')::double precision;
    v_acc := nullif(p->>'accuracy_m', '')::double precision;
    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180
       or (v_lat = 0 and v_lng = 0) or (v_acc is not null and (v_acc < 0 or v_acc > 5000)) then
      continue;
    end if;
    v_at := public.driver_event_time(nullif(p->>'recorded_at', '')::timestamptz, interval '7 days');
    if v_last is not null and v_at <= v_last then
      continue;
    end if;
    v_speed := nullif(p->>'speed_mps', '')::double precision;
    v_speed := case when v_speed is null or v_speed < 0 then null else round((v_speed * 2.236936)::numeric, 1)::double precision end;
    v_heading := nullif(p->>'heading', '')::double precision;

    if v_prev is null or v_at >= v_prev + interval '10 seconds' then
      insert into public.driver_positions
        (organization_id, driver_id, vehicle_id, job_id, lat, lng, heading, speed_mph, accuracy_m, recorded_at)
      values (me.organization_id, me.driver_id, v_vehicle, v_job, v_lat, v_lng,
              case when v_heading between 0 and 360 then v_heading end, v_speed, v_acc, v_at);
      v_prev := v_at;
      v_n := v_n + 1;
    end if;

    -- Arrivals passed while offline are still detected, once, in order.
    if v_acc is null or v_acc <= 100 then
      perform public.evaluate_geofences(me.driver_id, me.organization_id, v_lat, v_lng);
    end if;

    if v_latest_at is null or v_at >= v_latest_at then
      v_latest := p || jsonb_build_object('speed_mph', v_speed, 'heading_ok', v_heading);
      v_latest_at := v_at;
    end if;
  end loop;

  if v_latest is not null then
    update public.drivers
       set location_lat        = (v_latest->>'lat')::double precision,
           location_lng        = (v_latest->>'lng')::double precision,
           heading             = case when (v_latest->>'heading_ok')::double precision between 0 and 360
                                      then (v_latest->>'heading_ok')::double precision else heading end,
           speed               = coalesce(round((v_latest->>'speed_mph')::double precision)::integer, speed),
           location_updated_at = v_latest_at
     where id = me.driver_id
       and (location_updated_at is null or location_updated_at <= v_latest_at);

    update public.vehicles
       set location_lat        = (v_latest->>'lat')::double precision,
           location_lng        = (v_latest->>'lng')::double precision,
           location_updated_at = v_latest_at,
           updated_at          = now()
     where organization_id = me.organization_id
       and (id = v_vehicle or driver_id = me.driver_id)
       and (location_updated_at is null or location_updated_at <= v_latest_at);
  end if;

  return jsonb_build_object('stored', v_n, 'latest_at', v_latest_at, 'job_id', v_job);
end;
$function$;
