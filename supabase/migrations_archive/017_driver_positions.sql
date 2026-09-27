-- Live driver positions.
--
-- No client in production ever wrote a position, so the dispatch map could
-- only show whatever coordinates had been seeded. driver_report_location() is
-- the single write path: it validates the fix, stamps the calling driver's
-- row and their assigned vehicle, and appends to driver_positions (the trail
-- dispatch can review). Dispatch/admin read positions of their organisation
-- only; drivers read their own; nobody writes the history table directly.

create table if not exists public.driver_positions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id integer not null references public.drivers(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed_mph double precision,
  accuracy_m double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists driver_positions_driver_time_idx
  on public.driver_positions (driver_id, recorded_at desc);
create index if not exists driver_positions_org_time_idx
  on public.driver_positions (organization_id, recorded_at desc);

alter table public.driver_positions enable row level security;

create policy driver_positions_dispatch_select on public.driver_positions
  for select to authenticated
  using (public.auth_role() in ('admin', 'dispatcher') and organization_id = public.auth_org_id());

create policy driver_positions_driver_select on public.driver_positions
  for select to authenticated
  using (public.auth_role() = 'driver' and driver_id = public.auth_driver_id());

revoke insert, update, delete on public.driver_positions from anon, authenticated;

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

  update public.vehicles
     set location_lat = p_lat, location_lng = p_lng, updated_at = now()
   where organization_id = v_org
     and (id = v_vehicle or driver_id = v_driver);

  -- Keep the trail compact: at most one history point every 10 seconds.
  select max(recorded_at) into v_last from public.driver_positions where driver_id = v_driver;
  if v_last is null or v_last < now() - interval '10 seconds' then
    insert into public.driver_positions (organization_id, driver_id, lat, lng, heading, speed_mph, accuracy_m)
    values (v_org, v_driver, p_lat, p_lng,
            case when p_heading between 0 and 360 then p_heading end, v_speed, p_accuracy_m);
  end if;

  return now();
end;
$$;

revoke all on function public.driver_report_location(double precision, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.driver_report_location(double precision, double precision, double precision, double precision, double precision) to authenticated;
