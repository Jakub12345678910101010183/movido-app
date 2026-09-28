-- Automatic geofence arrivals/departures had two gaps:
--  #6 A GPS point with no accuracy was treated as accurate (the callers ran the
--     geofence check when accuracy was null or <= 100 m).
--  #7 Events used the time the point reached the server: a point captured
--     offline and uploaded later stamped geofence_events.occurred_at and the
--     stop's arrived_at with the upload time.
--
-- evaluate_geofences now takes the point's accuracy and time and is the single
-- place that decides:
--   * no action unless accuracy is known and <= 100 m (points are still stored);
--   * occurred_at / arrived_at = the point's recorded time. Callers pass a time
--     already clamped by driver_event_time (native batch: the GPS fix time;
--     web live report: now()).
-- The old 4-argument version is removed; its only callers (driver_report_location,
-- driver_report_locations) are updated here. Not callable by drivers or anon.
-- No data is modified.

drop function if exists public.evaluate_geofences(integer, uuid, double precision, double precision);

create or replace function public.evaluate_geofences(p_driver integer, p_org uuid, p_lat double precision, p_lng double precision,
                                                     p_accuracy_m double precision, p_at timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  j        record;
  t        record;
  v_dist   double precision;
  v_events integer := 0;
  v_stops  jsonb;
  v_idx    integer;
  v_at     timestamptz := coalesce(p_at, now());
begin
  -- Only a position with a known, good accuracy can arrive or depart.
  if p_lat is null or p_lng is null or p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 100 then
    return 0;
  end if;

  for j in
    select id, status, pickup_lat, pickup_lng, delivery_lat, delivery_lng, coalesce(stops, '[]'::jsonb) stops
      from public.jobs
     where driver_id = p_driver and organization_id = p_org
       and status in ('pending', 'assigned', 'in_progress')
     for update
  loop
    v_stops := j.stops;
    for t in
      select 'pickup' as target, j.pickup_lat as lat, j.pickup_lng as lng
      union all
      select 'stop:' || (e.ord - 1), (e.s->>'lat')::double precision, (e.s->>'lng')::double precision
        from jsonb_array_elements(j.stops) with ordinality as e(s, ord)
      union all
      select 'delivery', j.delivery_lat, j.delivery_lng
    loop
      continue when t.lat is null or t.lng is null;
      v_dist := public.distance_m(p_lat, p_lng, t.lat, t.lng);

      if v_dist <= 150 then
        insert into public.geofence_events (organization_id, job_id, driver_id, target, event_type, lat, lng, distance_m, occurred_at)
        values (p_org, j.id, p_driver, t.target, 'arrival', p_lat, p_lng, round(v_dist), v_at)
        on conflict (job_id, target, event_type) do nothing;
        if found then
          v_events := v_events + 1;
          if t.target like 'stop:%' then
            v_idx := substr(t.target, 6)::integer;
            if coalesce(v_stops -> v_idx ->> 'status', 'pending') = 'pending'
               and not exists (select 1 from jsonb_array_elements(v_stops) with ordinality e(s, ord)
                                where e.ord - 1 < v_idx and coalesce(e.s->>'status', 'pending') <> 'completed') then
              v_stops := jsonb_set(v_stops, array[v_idx::text],
                (v_stops -> v_idx) || jsonb_build_object('status', 'arrived', 'arrived_at', v_at));
            end if;
          end if;
        end if;
      elsif v_dist > 300 and exists (
          select 1 from public.geofence_events g
           where g.job_id = j.id and g.target = t.target and g.event_type = 'arrival') then
        insert into public.geofence_events (organization_id, job_id, driver_id, target, event_type, lat, lng, distance_m, occurred_at)
        values (p_org, j.id, p_driver, t.target, 'departure', p_lat, p_lng, round(v_dist), v_at)
        on conflict (job_id, target, event_type) do nothing;
        if found then v_events := v_events + 1; end if;
      end if;
    end loop;

    if v_stops is distinct from j.stops
       or (j.status in ('pending', 'assigned') and exists (
             select 1 from public.geofence_events g
              where g.job_id = j.id and g.target = 'pickup' and g.event_type = 'arrival')) then
      update public.jobs
         set stops = v_stops,
             status = case when status in ('pending', 'assigned')
                             and exists (select 1 from public.geofence_events g
                                          where g.job_id = j.id and g.target = 'pickup' and g.event_type = 'arrival')
                           then 'in_progress'::public.job_status else status end,
             updated_at = now()
       where id = j.id;
    end if;
  end loop;
  return v_events;
end;
$function$;

revoke all on function public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz) from public, anon, authenticated;
grant execute on function public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz) to service_role;

-- Web Driver live report: unchanged except the geofence call (accuracy decided
-- by evaluate_geofences; a live report happens now).
create or replace function public.driver_report_location(p_lat double precision, p_lng double precision, p_heading double precision default null,
                                                         p_speed_mps double precision default null, p_accuracy_m double precision default null)
returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_driver  integer := public.auth_driver_id();
  v_org     uuid := public.auth_org_id();
  v_vehicle integer;
  v_job     integer;
  v_speed   double precision;
  v_last    timestamptz;
begin
  if v_driver is null or v_org is null or public.auth_role() is distinct from 'driver' then
    raise exception 'NOT_A_DRIVER' using errcode = 'MV403';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (p_lat = 0 and p_lng = 0) then
    raise exception 'INVALID_POSITION' using errcode = 'MV400';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 5000) then
    raise exception 'INACCURATE_POSITION' using errcode = 'MV400';
  end if;

  v_speed := case when p_speed_mps is null or p_speed_mps < 0 then null
                  else round((p_speed_mps * 2.236936)::numeric, 1)::double precision end;

  update public.drivers
     set location_lat        = p_lat,
         location_lng        = p_lng,
         heading             = case when p_heading between 0 and 360 then p_heading else heading end,
         speed               = coalesce(round(v_speed)::integer, speed),
         location_updated_at = now()
   where id = v_driver and organization_id = v_org
  returning vehicle_id into v_vehicle;

  select id into v_job from public.jobs
   where driver_id = v_driver and organization_id = v_org
     and status in ('in_progress', 'assigned', 'pending')
   order by (status = 'in_progress') desc, scheduled_date nulls last, updated_at desc
   limit 1;
  if v_vehicle is null and v_job is not null then
    select vehicle_id into v_vehicle from public.jobs where id = v_job;
  end if;

  update public.vehicles
     set location_lat = p_lat, location_lng = p_lng, updated_at = now()
   where organization_id = v_org
     and (id = v_vehicle or driver_id = v_driver);

  select max(recorded_at) into v_last from public.driver_positions where driver_id = v_driver;
  if v_last is null or v_last < now() - interval '10 seconds' then
    insert into public.driver_positions
      (organization_id, driver_id, vehicle_id, job_id, lat, lng, heading, speed_mph, accuracy_m)
    values (v_org, v_driver, v_vehicle, v_job, p_lat, p_lng,
            case when p_heading between 0 and 360 then p_heading end, v_speed, p_accuracy_m);
  end if;

  perform public.evaluate_geofences(v_driver, v_org, p_lat, p_lng, p_accuracy_m, now());

  return now();
end;
$function$;

-- Native GPS batch: unchanged except the geofence call (the point's own
-- accuracy and its recorded time, already clamped by driver_event_time).
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

    -- Arrivals passed while offline are still detected, once, in order, at the
    -- time the point was recorded.
    perform public.evaluate_geofences(me.driver_id, me.organization_id, v_lat, v_lng, v_acc, v_at);

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
