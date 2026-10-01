-- ROLLBACK for 20261001120000_geofence_next_stop_arrival. PREPARED, NOT APPLIED.
-- Restores evaluate_geofences exactly as in production before F1 (hash 1edabe6e,
-- identical to 20260928180000_geofence_accuracy_point_time). No schema or data change;
-- stops already auto-arrived by F1 keep their arrived status and evidence. Idempotent.

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
