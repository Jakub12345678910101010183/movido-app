-- MOViDO Driver app (native) — backend.
--
-- The native app is a second client of the same backend as the web /driver
-- workspace. Everything here is additive: existing tables, RPCs and the web
-- app keep working unchanged.
--
--   * Idempotency: offline actions carry a client_request_id (uuid). Replaying
--     the same action after a lost response returns the existing row instead of
--     creating a duplicate.
--   * Driver writes that need validation go through SECURITY DEFINER RPCs that
--     derive driver, organisation and vehicle from the caller's session; the
--     client never supplies them.
--   * vehicle_checks: new table (no equivalent existed).
--   * driver-uploads: private bucket for incident, fuel-receipt and vehicle-check
--     photos, stored under <organisation>/<driver>/...
--   * Push: jobs/messages triggers send Expo push notifications through pg_net
--     to drivers that registered a device token. Failures never block a write.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.incidents add column if not exists client_request_id uuid;
create unique index if not exists incidents_client_request_id_key on public.incidents (client_request_id);

alter table public.fuel_logs add column if not exists client_request_id uuid;
alter table public.fuel_logs add column if not exists price_per_litre numeric(8,3);
alter table public.fuel_logs add column if not exists receipt_path text;
create unique index if not exists fuel_logs_client_request_id_key on public.fuel_logs (client_request_id);

alter table public.messages add column if not exists client_request_id uuid;
create unique index if not exists messages_client_request_id_key on public.messages (client_request_id);

alter table public.jobs add column if not exists pod_captured_at timestamptz;
alter table public.jobs add column if not exists pod_lat double precision;
alter table public.jobs add column if not exists pod_lng double precision;

-- Driver-facing incident types (office types kept).
alter table public.incidents drop constraint if exists incidents_incident_type_check;
alter table public.incidents add constraint incidents_incident_type_check check (incident_type = any (array[
  'accident', 'near_miss', 'theft', 'vehicle_damage', 'load_damage', 'other',
  'breakdown', 'traffic_delay', 'customer_issue', 'delivery_issue', 'road_closure'
]));

alter table public.drivers drop constraint if exists drivers_push_token_format;
alter table public.drivers add constraint drivers_push_token_format
  check (push_token is null or push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_\-]+\]$');

-- ---------------------------------------------------------------------------
-- Vehicle checks
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_checks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  driver_id         integer references public.drivers(id) on delete set null,
  vehicle_id        integer references public.vehicles(id) on delete set null,
  client_request_id uuid not null unique,
  result            text not null check (result in ('pass', 'fail')),
  items             jsonb not null check (jsonb_typeof(items) = 'array'),
  defects_count     integer not null default 0 check (defects_count >= 0),
  critical_defect   boolean not null default false,
  odometer          integer check (odometer >= 0),
  notes             text check (char_length(notes) <= 2000),
  photos            text[] not null default '{}',
  location_lat      double precision,
  location_lng      double precision,
  checked_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists vehicle_checks_org_checked_idx on public.vehicle_checks (organization_id, checked_at desc);
create index if not exists vehicle_checks_vehicle_checked_idx on public.vehicle_checks (vehicle_id, checked_at desc);
create index if not exists vehicle_checks_driver_checked_idx on public.vehicle_checks (driver_id, checked_at desc);

alter table public.vehicle_checks enable row level security;

drop policy if exists vehicle_checks_driver_select on public.vehicle_checks;
create policy vehicle_checks_driver_select on public.vehicle_checks for select to authenticated
  using (public.auth_role() = 'driver' and driver_id = public.auth_driver_id() and organization_id = public.auth_org_id());
drop policy if exists vehicle_checks_office_select on public.vehicle_checks;
create policy vehicle_checks_office_select on public.vehicle_checks for select to authenticated
  using (public.auth_role() = any (array['admin', 'dispatcher']) and organization_id = public.auth_org_id());
-- No insert/update/delete policies: drivers submit through driver_submit_vehicle_check().

revoke all on table public.vehicle_checks from anon, authenticated;
grant select on table public.vehicle_checks to authenticated;
grant all on table public.vehicle_checks to service_role;

-- ---------------------------------------------------------------------------
-- Storage: driver-uploads (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-uploads', 'driver-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists driver_uploads_driver_insert on storage.objects;
create policy driver_uploads_driver_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'driver-uploads'
    and public.auth_role() = 'driver'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = public.auth_driver_id()::text);
drop policy if exists driver_uploads_select on storage.objects;
create policy driver_uploads_select on storage.objects for select to authenticated
  using (bucket_id = 'driver-uploads'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (public.auth_role() = any (array['admin', 'dispatcher'])
         or (public.auth_role() = 'driver' and (storage.foldername(name))[2] = public.auth_driver_id()::text)));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller as a driver, or an error. Used by every driver RPC.
create or replace function public.driver_require()
returns table (driver_id integer, organization_id uuid, vehicle_id integer)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if public.auth_role() is distinct from 'driver' then
    raise exception 'NOT_A_DRIVER' using errcode = 'MV403';
  end if;
  return query
    select d.id, d.organization_id, d.vehicle_id
      from public.drivers d
     where d.user_id = auth.uid() and d.organization_id = public.auth_org_id();
  if not found then
    raise exception 'NOT_A_DRIVER' using errcode = 'MV403';
  end if;
end;
$function$;

-- A client-supplied event time, clamped to the plausible window.
create or replace function public.driver_event_time(p_at timestamptz, p_max_age interval)
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_at is null then now()
    when p_at > now() + interval '2 minutes' then now()
    when p_at < now() - p_max_age then now() - p_max_age
    else p_at
  end;
$function$;

-- Every path must sit in the caller's own driver-uploads folder.
create or replace function public.driver_paths_ok(p_paths text[], p_org uuid, p_driver integer)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(bool_and(p like p_org::text || '/' || p_driver::text || '/%' and p !~ '\.\.'), true)
    from unnest(coalesce(p_paths, '{}')) p;
$function$;

-- ---------------------------------------------------------------------------
-- Driver profile and settings
-- ---------------------------------------------------------------------------

create or replace function public.driver_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me record;
  v jsonb;
begin
  select * into me from public.driver_require();
  select jsonb_build_object(
      'driver', jsonb_build_object('id', d.id, 'name', d.name, 'email', d.email, 'phone', d.phone, 'status', d.status),
      'organization', jsonb_build_object('id', o.id, 'name', o.name),
      'vehicle', case when ve.id is null then null else jsonb_build_object(
          'id', ve.id, 'vehicle_id', ve.vehicle_id, 'registration', ve.registration,
          'make', ve.make, 'model', ve.model, 'type', ve.type,
          'height', ve.height, 'width', ve.width, 'weight', ve.weight, 'length', ve.length) end,
      'settings', jsonb_build_object(
          'gps_interval_seconds', coalesce((select value::integer from public.app_settings
              where organization_id = o.id and key = 'driver_gps_interval_seconds' and value ~ '^\d+$'), 60),
          'gps_distance_metres', coalesce((select value::integer from public.app_settings
              where organization_id = o.id and key = 'driver_gps_distance_metres' and value ~ '^\d+$'), 100)))
    into v
    from public.drivers d
    join public.organizations o on o.id = d.organization_id
    left join public.vehicles ve on ve.id = d.vehicle_id and ve.organization_id = d.organization_id
   where d.id = me.driver_id;
  return v;
end;
$function$;

-- ---------------------------------------------------------------------------
-- GPS: batch upload (online = one point, after a signal gap = the backlog)
-- ---------------------------------------------------------------------------

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
       set location_lat = (v_latest->>'lat')::double precision,
           location_lng = (v_latest->>'lng')::double precision,
           updated_at = now()
     where organization_id = me.organization_id
       and (id = v_vehicle or driver_id = me.driver_id);
  end if;

  return jsonb_build_object('stored', v_n, 'latest_at', v_latest_at, 'job_id', v_job);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Jobs: stops with the time the driver acted (offline-safe, first time wins)
-- ---------------------------------------------------------------------------

create or replace function public.driver_mark_stop(p_job_id integer, p_stop_index integer, p_status text, p_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me       record;
  v_stops  jsonb;
  v_status public.job_status;
  v_stop   jsonb;
  v_cur    text;
  v_at     timestamptz := public.driver_event_time(p_at, interval '3 days');
begin
  select * into me from public.driver_require();
  if p_status not in ('arrived', 'completed') then
    raise exception 'INVALID_STATUS' using errcode = 'MV400';
  end if;

  select coalesce(j.stops, '[]'::jsonb), j.status into v_stops, v_status
    from public.jobs j
   where j.id = p_job_id and j.driver_id = me.driver_id and j.organization_id = me.organization_id
   for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'MV404';
  end if;
  if p_stop_index is null or p_stop_index < 0 or p_stop_index >= jsonb_array_length(v_stops) then
    raise exception 'STOP_NOT_FOUND' using errcode = 'MV404';
  end if;

  v_stop := v_stops -> p_stop_index;
  v_cur := coalesce(v_stop->>'status', 'pending');
  -- Replays and late syncs never move a stop backwards or change its time.
  if (p_status = 'arrived' and v_cur in ('arrived', 'completed'))
     or (p_status = 'completed' and v_cur = 'completed') then
    return v_stops;
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'JOB_CLOSED' using errcode = 'MV409';
  end if;

  if p_status = 'arrived' then
    v_stop := v_stop || jsonb_build_object('status', 'arrived', 'arrived_at', v_at);
  else
    v_stop := v_stop || jsonb_build_object('status', 'completed', 'completed_at', v_at)
            || case when v_stop ? 'arrived_at' then '{}'::jsonb else jsonb_build_object('arrived_at', v_at) end;
  end if;
  v_stops := jsonb_set(v_stops, array[p_stop_index::text], v_stop);

  update public.jobs
     set stops = v_stops,
         status = case when status in ('pending', 'assigned') then 'in_progress'::public.job_status else status end,
         updated_at = now()
   where id = p_job_id;
  return v_stops;
end;
$function$;

create or replace function public.driver_start_job(p_job_id integer)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me record;
  v_status public.job_status;
begin
  select * into me from public.driver_require();
  select status into v_status from public.jobs
   where id = p_job_id and driver_id = me.driver_id and organization_id = me.organization_id
   for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'MV404';
  end if;
  if v_status in ('pending', 'assigned') then
    update public.jobs set status = 'in_progress', updated_at = now() where id = p_job_id;
    return 'in_progress';
  end if;
  return v_status::text; -- already started, completed or cancelled: unchanged
end;
$function$;

-- Proof of delivery + completion in one step. Replaying it is harmless.
create or replace function public.driver_complete_job(
  p_job_id integer,
  p_photo_path text default null,
  p_signature text default null,
  p_recipient text default null,
  p_notes text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_captured_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me       record;
  j        record;
  v_notes  text;
  v_at     timestamptz := public.driver_event_time(p_captured_at, interval '3 days');
begin
  select * into me from public.driver_require();
  select id, status, organization_id, pod_photo_url into j from public.jobs
   where id = p_job_id and driver_id = me.driver_id and organization_id = me.organization_id
   for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'MV404';
  end if;
  if j.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'replayed', true);
  end if;
  if j.status = 'cancelled' then
    raise exception 'JOB_CLOSED' using errcode = 'MV409';
  end if;
  if nullif(p_photo_path, '') is null and nullif(p_signature, '') is null then
    raise exception 'POD_REQUIRED' using errcode = 'MV400';
  end if;
  if p_photo_path is not null then
    if p_photo_path not like j.organization_id::text || '/' || j.id::text || '/%' or p_photo_path ~ '\.\.' then
      raise exception 'INVALID_PHOTO_PATH' using errcode = 'MV400';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'pod-photos' and o.name = p_photo_path) then
      raise exception 'PHOTO_NOT_UPLOADED' using errcode = 'MV409';
    end if;
  end if;
  if p_signature is not null and (p_signature !~ '^data:image/(png|jpeg|svg\+xml);base64,' or length(p_signature) > 400000) then
    raise exception 'INVALID_SIGNATURE' using errcode = 'MV400';
  end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180) then
    raise exception 'INVALID_POSITION' using errcode = 'MV400';
  end if;

  v_notes := nullif(concat_ws(E'\n',
    case when nullif(trim(p_recipient), '') is not null then 'Received by: ' || left(trim(p_recipient), 120) end,
    nullif(left(trim(p_notes), 2000), '')), '');

  update public.jobs
     set status          = 'completed',
         completed_at    = v_at,
         pod_status      = case when p_photo_path is not null then 'photo'::public.pod_status else 'signed'::public.pod_status end,
         pod_photo_url   = p_photo_path,
         pod_signature   = p_signature,
         pod_notes       = v_notes,
         pod_captured_at = v_at,
         pod_lat         = p_lat,
         pod_lng         = p_lng,
         updated_at      = now()
   where id = p_job_id;
  return jsonb_build_object('status', 'completed', 'replayed', false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Incidents, fuel, vehicle checks, messages
-- ---------------------------------------------------------------------------

create or replace function public.driver_report_incident(
  p_request_id uuid,
  p_type text,
  p_description text,
  p_job_id integer default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_photos text[] default '{}',
  p_occurred_at timestamptz default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me   record;
  v_id integer;
begin
  select * into me from public.driver_require();
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = 'MV400';
  end if;
  select id into v_id from public.incidents where client_request_id = p_request_id and driver_id = me.driver_id;
  if found then
    return v_id;
  end if;
  if p_type not in ('accident', 'near_miss', 'theft', 'vehicle_damage', 'load_damage', 'other',
                    'breakdown', 'traffic_delay', 'customer_issue', 'delivery_issue', 'road_closure') then
    raise exception 'INVALID_TYPE' using errcode = 'MV400';
  end if;
  if nullif(trim(p_description), '') is null or length(p_description) > 4000 then
    raise exception 'DESCRIPTION_REQUIRED' using errcode = 'MV400';
  end if;
  if p_job_id is not null and not exists (
       select 1 from public.jobs where id = p_job_id and driver_id = me.driver_id and organization_id = me.organization_id) then
    raise exception 'JOB_NOT_FOUND' using errcode = 'MV404';
  end if;
  if coalesce(array_length(p_photos, 1), 0) > 6 or not public.driver_paths_ok(p_photos, me.organization_id, me.driver_id) then
    raise exception 'INVALID_PHOTOS' using errcode = 'MV400';
  end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180) then
    raise exception 'INVALID_POSITION' using errcode = 'MV400';
  end if;

  insert into public.incidents
    (driver_id, vehicle_id, job_id, incident_type, description, location_lat, location_lng, photos,
     status, client_request_id, created_at, updated_at)
  values (me.driver_id, coalesce((select vehicle_id from public.jobs where id = p_job_id), me.vehicle_id), p_job_id,
          p_type, trim(p_description), p_lat, p_lng, coalesce(p_photos, '{}'),
          'reported', p_request_id, public.driver_event_time(p_occurred_at, interval '7 days'), now())
  on conflict (client_request_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.incidents where client_request_id = p_request_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.driver_log_fuel(
  p_request_id uuid,
  p_fuel_type text,
  p_litres numeric,
  p_price_per_litre numeric default null,
  p_total_cost numeric default null,
  p_mileage integer default null,
  p_station text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_receipt_path text default null,
  p_filled_at timestamptz default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me     record;
  v_id   integer;
  v_cost numeric;
  v_ppl  numeric;
begin
  select * into me from public.driver_require();
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = 'MV400';
  end if;
  select id into v_id from public.fuel_logs where client_request_id = p_request_id and driver_id = me.driver_id;
  if found then
    return v_id;
  end if;
  if p_fuel_type not in ('diesel', 'adblue', 'petrol', 'hvo') then
    raise exception 'INVALID_FUEL_TYPE' using errcode = 'MV400';
  end if;
  if p_litres is null or p_litres <= 0 or p_litres > 2000 then
    raise exception 'INVALID_LITRES' using errcode = 'MV400';
  end if;
  if (p_price_per_litre is not null and (p_price_per_litre <= 0 or p_price_per_litre > 10))
     or (p_total_cost is not null and (p_total_cost < 0 or p_total_cost > 20000)) then
    raise exception 'INVALID_PRICE' using errcode = 'MV400';
  end if;
  if p_mileage is not null and (p_mileage < 0 or p_mileage > 5000000) then
    raise exception 'INVALID_MILEAGE' using errcode = 'MV400';
  end if;
  if p_receipt_path is not null and not public.driver_paths_ok(array[p_receipt_path], me.organization_id, me.driver_id) then
    raise exception 'INVALID_RECEIPT' using errcode = 'MV400';
  end if;

  -- The receipt total is authoritative; otherwise it is litres x price.
  v_cost := coalesce(round(p_total_cost, 2), round(p_litres * p_price_per_litre, 2));
  v_ppl := coalesce(round(p_price_per_litre, 3), case when v_cost is not null then round(v_cost / p_litres, 3) end);

  insert into public.fuel_logs
    (driver_id, vehicle_id, fuel_type, fuel_amount, fuel_cost, price_per_litre, mileage, station_name,
     location_lat, location_lng, receipt_path, client_request_id, created_at)
  values (me.driver_id, me.vehicle_id, p_fuel_type, round(p_litres, 2), v_cost, v_ppl, p_mileage,
          nullif(left(trim(p_station), 120), ''), p_lat, p_lng, p_receipt_path, p_request_id,
          public.driver_event_time(p_filled_at, interval '7 days'))
  on conflict (client_request_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.fuel_logs where client_request_id = p_request_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.driver_submit_vehicle_check(
  p_request_id uuid,
  p_items jsonb,
  p_vehicle_id integer default null,
  p_odometer integer default null,
  p_notes text default null,
  p_photos text[] default '{}',
  p_lat double precision default null,
  p_lng double precision default null,
  p_checked_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me         record;
  v_vehicle  integer;
  v_items    jsonb := '[]'::jsonb;
  it         jsonb;
  v_key      text;
  v_status   text;
  v_fail     integer := 0;
  v_critical boolean := false;
  v_row      public.vehicle_checks;
  c_allowed  constant text[] := array['tyres', 'lights', 'brakes', 'mirrors', 'body', 'trailer', 'coupling',
                                      'fluids', 'safety_equipment', 'damage', 'other'];
  c_critical constant text[] := array['tyres', 'lights', 'brakes', 'coupling'];
begin
  select * into me from public.driver_require();
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = 'MV400';
  end if;
  select * into v_row from public.vehicle_checks where client_request_id = p_request_id and driver_id = me.driver_id;
  if found then
    return jsonb_build_object('id', v_row.id, 'result', v_row.result, 'critical_defect', v_row.critical_defect, 'replayed', true);
  end if;

  v_vehicle := coalesce(p_vehicle_id, me.vehicle_id);
  if v_vehicle is null then
    raise exception 'NO_VEHICLE' using errcode = 'MV409';
  end if;
  if not exists (select 1 from public.vehicles where id = v_vehicle and organization_id = me.organization_id) then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'MV404';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = 'MV400';
  end if;

  -- The result is computed here, never taken from the client.
  for it in select value from jsonb_array_elements(p_items) loop
    v_key := it->>'key';
    v_status := it->>'status';
    if v_key is null or not (v_key = any (c_allowed)) or v_status not in ('pass', 'fail', 'na') then
      raise exception 'INVALID_ITEM' using errcode = 'MV400';
    end if;
    if v_status = 'fail' then
      v_fail := v_fail + 1;
      if v_key = any (c_critical) then v_critical := true; end if;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'key', v_key, 'status', v_status, 'critical', v_key = any (c_critical),
      'note', nullif(left(trim(coalesce(it->>'note', '')), 500), '')));
  end loop;
  if coalesce(array_length(p_photos, 1), 0) > 8 or not public.driver_paths_ok(p_photos, me.organization_id, me.driver_id) then
    raise exception 'INVALID_PHOTOS' using errcode = 'MV400';
  end if;

  insert into public.vehicle_checks
    (organization_id, driver_id, vehicle_id, client_request_id, result, items, defects_count, critical_defect,
     odometer, notes, photos, location_lat, location_lng, checked_at)
  values (me.organization_id, me.driver_id, v_vehicle, p_request_id,
          case when v_fail > 0 then 'fail' else 'pass' end, v_items, v_fail, v_critical,
          p_odometer, nullif(left(trim(p_notes), 2000), ''), coalesce(p_photos, '{}'), p_lat, p_lng,
          public.driver_event_time(p_checked_at, interval '7 days'))
  on conflict (client_request_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.vehicle_checks where client_request_id = p_request_id;
  end if;
  return jsonb_build_object('id', v_row.id, 'result', v_row.result, 'critical_defect', v_row.critical_defect, 'replayed', false);
end;
$function$;

create or replace function public.driver_mark_messages_read(p_ids integer[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me record;
  n  integer;
begin
  select * into me from public.driver_require();
  update public.messages
     set read = true
   where id = any (p_ids)
     and organization_id = me.organization_id
     and recipient_id = auth.uid()::text
     and read = false;
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Push notifications (Expo push service via pg_net)
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.push_to_drivers(p_org uuid, p_driver_ids integer[], p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', d.push_token, 'title', left(p_title, 120), 'body', left(p_body, 240),
           'data', coalesce(p_data, '{}'::jsonb), 'sound', 'default', 'priority', 'high',
           'channelId', 'default'))
    into v_msgs
    from public.drivers d
   where d.organization_id = p_org
     and d.push_token is not null
     and (p_driver_ids is null or d.id = any (p_driver_ids));
  if v_msgs is null then
    return;
  end if;
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := v_msgs,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
exception when others then
  -- Notifications are best effort: never block the write that triggered them.
  raise warning 'push_to_drivers: %', sqlerrm;
end;
$function$;

create or replace function public.jobs_push_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.driver_id is null or new.organization_id is null then
    return new;
  end if;
  -- Drivers' own changes (start, stops, POD) do not notify themselves.
  if coalesce(public.auth_role(), '') = 'driver' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id then
    perform public.push_to_drivers(new.organization_id, array[new.driver_id],
      'New job ' || coalesce(new.reference, ''), coalesce(new.customer, '') ||
        coalesce(' · ' || new.delivery_address, ''),
      jsonb_build_object('type', 'job_assigned', 'job_id', new.id));
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.push_to_drivers(new.organization_id, array[new.driver_id],
      'Job cancelled ' || coalesce(new.reference, ''), coalesce(new.customer, ''),
      jsonb_build_object('type', 'job_changed', 'job_id', new.id));
  elsif new.stops is distinct from old.stops
     or new.delivery_address is distinct from old.delivery_address
     or new.pickup_address is distinct from old.pickup_address
     or new.scheduled_date is distinct from old.scheduled_date then
    perform public.push_to_drivers(new.organization_id, array[new.driver_id],
      'Job updated ' || coalesce(new.reference, ''), 'Open the job to see the changes.',
      jsonb_build_object('type', 'job_changed', 'job_id', new.id));
  end if;
  return new;
end;
$function$;

create or replace function public.messages_push_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_driver integer;
begin
  if new.organization_id is null or new.recipient_id is null or new.recipient_id = 'dispatch' then
    return new;
  end if;
  if new.recipient_id = 'broadcast' then
    perform public.push_to_drivers(new.organization_id, null,
      case when new.channel = 'alert' then 'Urgent message' else 'Message from the office' end,
      new.content, jsonb_build_object('type', 'message', 'message_id', new.id));
    return new;
  end if;
  select d.id into v_driver from public.drivers d
   where d.user_id::text = new.recipient_id and d.organization_id = new.organization_id;
  if v_driver is not null then
    perform public.push_to_drivers(new.organization_id, array[v_driver],
      case when new.channel = 'alert' then 'Urgent message' else 'Message from the office' end,
      new.content, jsonb_build_object('type', 'message', 'message_id', new.id));
  end if;
  return new;
end;
$function$;

drop trigger if exists jobs_push_notify on public.jobs;
create trigger jobs_push_notify after insert or update on public.jobs
  for each row execute function public.jobs_push_notify();
drop trigger if exists messages_push_notify on public.messages;
create trigger messages_push_notify after insert on public.messages
  for each row execute function public.messages_push_notify();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.driver_require() from public, anon;
revoke all on function public.driver_event_time(timestamptz, interval) from public, anon;
revoke all on function public.driver_paths_ok(text[], uuid, integer) from public, anon;
revoke all on function public.push_to_drivers(uuid, integer[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public.jobs_push_notify() from public, anon, authenticated;
revoke all on function public.messages_push_notify() from public, anon, authenticated;
grant execute on function public.driver_require() to authenticated, service_role;
grant execute on function public.driver_event_time(timestamptz, interval) to authenticated, service_role;
grant execute on function public.driver_paths_ok(text[], uuid, integer) to authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.driver_profile()',
    'public.driver_report_locations(jsonb)',
    'public.driver_mark_stop(integer, integer, text, timestamptz)',
    'public.driver_start_job(integer)',
    'public.driver_complete_job(integer, text, text, text, text, double precision, double precision, timestamptz)',
    'public.driver_report_incident(uuid, text, text, integer, double precision, double precision, text[], timestamptz)',
    'public.driver_log_fuel(uuid, text, numeric, numeric, numeric, integer, text, double precision, double precision, text, timestamptz)',
    'public.driver_submit_vehicle_check(uuid, jsonb, integer, integer, text, text[], double precision, double precision, timestamptz)',
    'public.driver_mark_messages_read(integer[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
