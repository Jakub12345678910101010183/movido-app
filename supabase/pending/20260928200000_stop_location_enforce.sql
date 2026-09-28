-- Location-aware stop actions, STAGE 2 of 2 (enforcement). PREPARED, NOT APPLIED.
--
-- Apply only after, in production: Stage 1 (20260928191000_stop_location_compat)
-- is live, the Web Driver calling driver_confirm_stop is deployed, the native
-- build calling it is installed by every driver, and a QA-tenant run confirmed
-- that real stop actions record location_check = 'ok'. Move this file into
-- supabase/migrations (same content) only when approved.
--
--  1. driver_confirm_stop refuses a stop action without valid location evidence
--     (rule: driver_stop_location_check, unchanged from Stage 1):
--       STOP_NOT_LOCATED, LOCATION_REQUIRED, LOCATION_INACCURATE, NOT_AT_STOP.
--     State machine, 12 h driver time and tenant checks unchanged.
--  2. The old entry points driver_mark_stop(4 args) and driver_update_stop are
--     removed: they accept stop actions without location evidence.
--  3. Proof-of-delivery time limited to 12 hours back (was 3 days).
-- GPS point times (Phase 2B: 2 min ahead, 7 days back) are unchanged.
-- No existing data is modified.

-- 1. Enforce.
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

  -- Location evidence: required (Stage 2), and recorded.
  v_ev := public.driver_stop_location_check(me.driver_id, me.organization_id, v_stop, v_at, p_lat, p_lng, p_accuracy_m);
  if v_ev->>'check' <> 'ok' then
    raise exception '%', v_ev->>'check' using errcode = 'MV409';
  end if;
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

-- 2. Remove the old entry points (no location evidence).
drop function if exists public.driver_update_stop(integer, integer, text);
drop function if exists public.driver_mark_stop(integer, integer, text, timestamptz);

-- 3. Proof-of-delivery time.
-- Unchanged except the proof-of-delivery time limit (12 hours, was 3 days).
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
  v_at     timestamptz := public.driver_event_time(p_captured_at, interval '12 hours');
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
