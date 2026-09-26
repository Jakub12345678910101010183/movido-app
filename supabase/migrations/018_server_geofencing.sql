-- Server-side geofencing.
--
-- Geofencing used to run inside the dispatcher's browser tab: nothing happened
-- unless a Dashboard was open, duplicates were only suppressed in memory and
-- no event was stored. It now runs in the database on every position a driver
-- reports, so it works with no dispatch screen open. (It still depends on the
-- driver's device reporting positions — a browser tab cannot do that in the
-- background.)
--
-- Targets are the job's pickup, each stop and the delivery point, using the
-- coordinates saved on the job. Arrival: within 150 m. Departure: after an
-- arrival, more than 300 m away (hysteresis avoids flapping). One event per
-- (job, target, type), enforced by a unique index.

alter table public.driver_positions
  add column if not exists vehicle_id integer references public.vehicles(id) on delete set null,
  add column if not exists job_id integer references public.jobs(id) on delete set null;

create table if not exists public.geofence_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id integer not null references public.jobs(id) on delete cascade,
  driver_id integer not null references public.drivers(id) on delete cascade,
  target text not null check (target ~ '^(pickup|delivery|stop:[0-9]+)$'),
  event_type text not null check (event_type in ('arrival', 'departure')),
  lat double precision not null,
  lng double precision not null,
  distance_m integer not null,
  occurred_at timestamptz not null default now(),
  unique (job_id, target, event_type)
);
create index if not exists geofence_events_org_time_idx on public.geofence_events (organization_id, occurred_at desc);

alter table public.geofence_events enable row level security;
create policy geofence_events_dispatch_select on public.geofence_events
  for select to authenticated
  using (public.auth_role() in ('admin', 'dispatcher') and organization_id = public.auth_org_id());
create policy geofence_events_driver_select on public.geofence_events
  for select to authenticated
  using (public.auth_role() = 'driver' and driver_id = public.auth_driver_id());
revoke insert, update, delete on public.geofence_events from anon, authenticated;

create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
set search_path = pg_catalog
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create or replace function public.evaluate_geofences(
  p_driver integer, p_org uuid, p_lat double precision, p_lng double precision)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j        record;
  t        record;
  v_dist   double precision;
  v_events integer := 0;
  v_stops  jsonb;
  v_idx    integer;
begin
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
        insert into public.geofence_events (organization_id, job_id, driver_id, target, event_type, lat, lng, distance_m)
        values (p_org, j.id, p_driver, t.target, 'arrival', p_lat, p_lng, round(v_dist))
        on conflict (job_id, target, event_type) do nothing;
        if found then
          v_events := v_events + 1;
          if t.target like 'stop:%' then
            v_idx := substr(t.target, 6)::integer;
            if coalesce(v_stops -> v_idx ->> 'status', 'pending') = 'pending' then
              v_stops := jsonb_set(v_stops, array[v_idx::text],
                (v_stops -> v_idx) || jsonb_build_object('status', 'arrived', 'arrived_at', now()));
            end if;
          end if;
        end if;
      elsif v_dist > 300 and exists (
          select 1 from public.geofence_events g
           where g.job_id = j.id and g.target = t.target and g.event_type = 'arrival') then
        insert into public.geofence_events (organization_id, job_id, driver_id, target, event_type, lat, lng, distance_m)
        values (p_org, j.id, p_driver, t.target, 'departure', p_lat, p_lng, round(v_dist))
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
$$;
revoke all on function public.evaluate_geofences(integer, uuid, double precision, double precision) from public, anon, authenticated;

create or replace function public.driver_report_location(
  p_lat double precision,
  p_lng double precision,
  p_heading double precision default null,
  p_speed_mps double precision default null,
  p_accuracy_m double precision default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- Only reasonably accurate fixes may trigger arrivals/departures.
  if p_accuracy_m is null or p_accuracy_m <= 100 then
    perform public.evaluate_geofences(v_driver, v_org, p_lat, p_lng);
  end if;

  return now();
end;
$$;
