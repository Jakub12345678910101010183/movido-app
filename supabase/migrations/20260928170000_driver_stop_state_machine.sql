-- Stops had no server-side order: a driver could mark any stop arrived or
-- delivered in any order, move a delivered stop back to arrived (or re-deliver
-- it with a new time) through driver_update_stop, and complete a job while
-- stops were still pending.
--
-- One state machine for every driver stop change, in driver_mark_stop:
--   pending -> arrived -> completed, or pending -> completed (arrival stamped).
--   * A stop can move only when every earlier stop is completed (STOP_ORDER).
--   * A completed stop is final (STOP_ALREADY_COMPLETED).
--   * Arrived again on an arrived stop is a harmless replay (first time wins).
-- driver_update_stop (old web Driver entry point) now calls driver_mark_stop,
-- so both entry points follow the same rules.
-- driver_complete_job refuses while any stop is not completed (STOPS_PENDING).
-- evaluate_geofences only auto-arrives the next stop in order.
-- Tenant/role checks are unchanged (driver_require + job's driver and org).
-- No data is modified.

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
  if p_status is null or p_status not in ('arrived', 'completed') then
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
  -- A delivered stop is final: never back to arrived, never a new time.
  if v_cur = 'completed' then
    raise exception 'STOP_ALREADY_COMPLETED' using errcode = 'MV409';
  end if;
  -- Replayed arrival: keep the first time.
  if p_status = 'arrived' and v_cur = 'arrived' then
    return v_stops;
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'JOB_CLOSED' using errcode = 'MV409';
  end if;
  if exists (select 1 from jsonb_array_elements(v_stops) with ordinality e(s, ord)
              where e.ord - 1 < p_stop_index and coalesce(e.s->>'status', 'pending') <> 'completed') then
    raise exception 'STOP_ORDER' using errcode = 'MV409';
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

-- Old web entry point: same rules, server time.
create or replace function public.driver_update_stop(p_job_id integer, p_stop_index integer, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return public.driver_mark_stop(p_job_id, p_stop_index, p_status, null);
end;
$function$;

-- Unchanged except STOPS_PENDING.
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
  select id, status, organization_id, pod_photo_url, stops into j from public.jobs
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
  if exists (select 1 from jsonb_array_elements(coalesce(j.stops, '[]'::jsonb)) e(s)
              where coalesce(e.s->>'status', 'pending') <> 'completed') then
    raise exception 'STOPS_PENDING' using errcode = 'MV409';
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

-- Unchanged except: a geofence arrival marks a stop arrived only when every
-- earlier stop is completed (the event itself is still recorded).
create or replace function public.evaluate_geofences(p_driver integer, p_org uuid, p_lat double precision, p_lng double precision)
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
            if coalesce(v_stops -> v_idx ->> 'status', 'pending') = 'pending'
               and not exists (select 1 from jsonb_array_elements(v_stops) with ordinality e(s, ord)
                                where e.ord - 1 < v_idx and coalesce(e.s->>'status', 'pending') <> 'completed') then
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
$function$;
