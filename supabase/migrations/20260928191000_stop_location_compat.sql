-- Location-aware stop actions, STAGE 1 of 2 (compatibility; record, do not enforce).
--
-- Manual Arrive / Delivered can be sent from anywhere, and a stop's time can be
-- set up to 3 days back. The fix needs new app versions that send the
-- driver's position with each stop action, so it is rolled out in two stages:
--
-- Stage 1 (this migration) adds, without changing anything existing:
--   * driver_confirm_stop(job, stop, status, at, lat, lng, accuracy_m): the entry
--     point for the new Web Driver and native app. Same state machine and
--     tenant checks as driver_mark_stop. The driver time is limited to 12 h back
--     (2 min ahead; missing = server time). It records on the stop the location
--     evidence and the result Stage 2 will enforce, but does NOT refuse on it.
--   * driver_stop_location_check(): the single location rule (<= 150 m from the
--     stop, accuracy known and <= 100 m; evidence = the position sent with the
--     action, else the driver's own latest GPS point at most 10 min old).
--     Server-only.
-- driver_mark_stop(4 args) and driver_update_stop, used by the Web Driver and
-- native builds in production today, are NOT changed.
-- Stage 2 (supabase/pending, applied only after the new clients are live and
-- verified) enforces the rule and removes the old entry points.
-- No existing data is modified.

-- The location rule. Returns {check, source, lat, lng, accuracy_m, distance_m};
-- check is 'ok' or the refusal Stage 2 raises.
create or replace function public.driver_stop_location_check(p_driver integer, p_org uuid, p_stop jsonb, p_at timestamptz,
                                                             p_lat double precision, p_lng double precision, p_accuracy_m double precision)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_slat   double precision := nullif(p_stop->>'lat', '')::double precision;
  v_slng   double precision := nullif(p_stop->>'lng', '')::double precision;
  v_lat    double precision;
  v_lng    double precision;
  v_acc    double precision;
  v_fix_at timestamptz;
  v_src    text;
  v_dist   double precision;
begin
  if p_lat is not null and p_lng is not null then
    v_lat := p_lat; v_lng := p_lng; v_acc := p_accuracy_m; v_src := 'device';
  else
    -- The driver's own latest stored point at the action time, if recent enough.
    select dp.lat, dp.lng, dp.accuracy_m, dp.recorded_at into v_lat, v_lng, v_acc, v_fix_at
      from public.driver_positions dp
     where dp.driver_id = p_driver and dp.organization_id = p_org
       and dp.recorded_at <= p_at + interval '2 minutes'
     order by dp.recorded_at desc
     limit 1;
    if found and v_fix_at >= p_at - interval '10 minutes' then
      v_src := 'gps_track';
    else
      v_lat := null; v_lng := null; v_acc := null; v_src := 'none';
    end if;
  end if;
  if v_lat is not null and v_slat is not null and v_slng is not null then
    v_dist := public.distance_m(v_lat, v_lng, v_slat, v_slng);
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'check', case
               when v_slat is null or v_slng is null then 'STOP_NOT_LOCATED'
               when v_src = 'none' then 'LOCATION_REQUIRED'
               when v_acc is null or v_acc < 0 or v_acc > 100 then 'LOCATION_INACCURATE'
               when v_dist > 150 then 'NOT_AT_STOP'
               else 'ok'
             end,
    'source', v_src, 'lat', v_lat, 'lng', v_lng, 'accuracy_m', v_acc, 'distance_m', round(v_dist::numeric)));
end;
$function$;

revoke all on function public.driver_stop_location_check(integer, uuid, jsonb, timestamptz, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.driver_stop_location_check(integer, uuid, jsonb, timestamptz, double precision, double precision, double precision) to service_role;

-- New clients' stop action. Stage 1: evidence recorded, not enforced.
create or replace function public.driver_confirm_stop(p_job_id integer, p_stop_index integer, p_status text, p_at timestamptz default null,
                                                      p_lat double precision default null, p_lng double precision default null,
                                                      p_accuracy_m double precision default null)
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
  v_at     timestamptz := public.driver_event_time(p_at, interval '12 hours');
  v_ev     jsonb;
  v_pre    text;
begin
  select * into me from public.driver_require();
  if p_status is null or p_status not in ('arrived', 'completed') then
    raise exception 'INVALID_STATUS' using errcode = 'MV400';
  end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (p_lat = 0 and p_lng = 0) or p_accuracy_m < 0 then
    raise exception 'INVALID_POSITION' using errcode = 'MV400';
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
  -- Replayed arrival: keep the first time and evidence.
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

  -- Location evidence: recorded with the result Stage 2 will enforce.
  v_ev := public.driver_stop_location_check(me.driver_id, me.organization_id, v_stop, v_at, p_lat, p_lng, p_accuracy_m);
  v_pre := case when p_status = 'arrived' then 'arrived_' else 'completed_' end;
  v_ev := (select jsonb_object_agg(v_pre || case key when 'check' then 'location_check' when 'source' then 'location_source' else key end, value)
             from jsonb_each(v_ev));

  if p_status = 'arrived' then
    v_stop := v_stop || jsonb_build_object('status', 'arrived', 'arrived_at', v_at) || v_ev;
  else
    v_stop := v_stop || jsonb_build_object('status', 'completed', 'completed_at', v_at) || v_ev
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

revoke all on function public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision) from public, anon;
grant execute on function public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision) to authenticated, service_role;
