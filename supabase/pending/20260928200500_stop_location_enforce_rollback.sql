-- ROLLBACK for supabase/pending/20260928200000_stop_location_enforce.sql (Stage 2).
-- Restores the exact Stage 1 production state (migration 20260928175146
-- stop_location_compat):
--   driver_mark_stop(4 args)  md5(pg_get_functiondef) fa5f952d5e85c942ae9d3c68b0606693  (re-created)
--   driver_update_stop        6221ea9a671f11a48f0e52d47fac95a5  (re-created)
--   driver_confirm_stop       387bd2672cf72e4c87604ddf62b8d2c6  (record location evidence, no refusal)
--   driver_complete_job       bf9ba390338cf4263ffc46526d29cec4  (POD time 3 days)
-- driver_stop_location_check (23c5de2d4e71711dbc739bc21d9128c0) is not touched.
-- Definitions are the verbatim pg_get_functiondef output of the Stage 1 state
-- (hashes verified equal to production). Permissions restored to the Stage 1
-- production ACL: owner postgres, authenticated, service_role (no PUBLIC, no anon).
-- Idempotent (create or replace); safe to run when Stage 2 is not applied.
-- No data is modified. Apply only on explicit approval.

-- driver_mark_stop (Stage 1, md5 fa5f952d5e85c942ae9d3c68b0606693)
CREATE OR REPLACE FUNCTION public.driver_mark_stop(p_job_id integer, p_stop_index integer, p_status text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- driver_update_stop (Stage 1, md5 6221ea9a671f11a48f0e52d47fac95a5)
CREATE OR REPLACE FUNCTION public.driver_update_stop(p_job_id integer, p_stop_index integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return public.driver_mark_stop(p_job_id, p_stop_index, p_status, null);
end;
$function$
;

-- driver_confirm_stop (Stage 1, md5 387bd2672cf72e4c87604ddf62b8d2c6)
CREATE OR REPLACE FUNCTION public.driver_confirm_stop(p_job_id integer, p_stop_index integer, p_status text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- driver_complete_job (Stage 1, md5 bf9ba390338cf4263ffc46526d29cec4)
CREATE OR REPLACE FUNCTION public.driver_complete_job(p_job_id integer, p_photo_path text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_recipient text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Stage 1 production permissions.
revoke all on function public.driver_mark_stop(integer, integer, text, timestamptz) from public, anon;
grant execute on function public.driver_mark_stop(integer, integer, text, timestamptz) to authenticated, service_role;
revoke all on function public.driver_update_stop(integer, integer, text) from public, anon;
grant execute on function public.driver_update_stop(integer, integer, text) to authenticated, service_role;
revoke all on function public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision) from public, anon;
grant execute on function public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision) to authenticated, service_role;
revoke all on function public.driver_complete_job(integer, text, text, text, text, double precision, double precision, timestamptz) from public, anon;
grant execute on function public.driver_complete_job(integer, text, text, text, text, double precision, double precision, timestamptz) to authenticated, service_role;
