-- F1: a stop reached before the previous one was delivered arrives automatically
-- on a fresh point once it is next. Rolled back.
-- Needs a database built from supabase/migrations + Stage 2 + this fix, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/pending/geofence_next_stop_arrival_test.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000f3', 'F1 A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000f4', 'F1 B', 'starter', 'trial', now() + interval '14 days');
-- Users 1..6 are drivers (6 is in company B), 7 = admin A, 8 = admin B.
create temp table ppl as
  select n, ('00000000-0000-4000-b000-0000000007' || lpad(n::text, 2, '0'))::uuid uid,
         case when n in (6, 8) then '00000000-0000-4000-a000-0000000000f4' else '00000000-0000-4000-a000-0000000000f3' end::uuid org,
         case when n >= 7 then 'admin' else 'driver' end role
    from generate_series(1, 8) n;
insert into auth.users (id, email) select uid, 'f1-' || n || '@f1.test' from ppl;
insert into public.users (id, email, name, role, organization_id) select uid, 'f1-' || n || '@f1.test', 'F1 ' || n, role, org from ppl
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) select 690000 + n, 'F1 ' || n, uid, org from ppl where role = 'driver';
-- One open job per driver: stop 1 at (52.10, -0.80), stop 2 at (52.30, -0.80).
-- Driver 5 also has a pickup (52.50) and a delivery (52.70) and starts assigned.
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, pickup_lat, pickup_lng, delivery_lat, delivery_lng, stops)
  select 690000 + n, 'F1-' || n, 'F', case when n = 5 then 'assigned' else 'in_progress' end::public.job_status, org, 690000 + n,
         case when n = 5 then 52.50 end, case when n = 5 then -0.80 end, case when n = 5 then 52.70 end, case when n = 5 then -0.80 end,
         '[{"label":"S1","lat":52.10,"lng":-0.80,"status":"pending"},{"label":"S2","lat":52.30,"lng":-0.80,"status":"pending"}]'::jsonb
    from ppl where role = 'driver';

create temp table f1_result (name text, pass boolean, detail text) on commit drop;
create temp table t0 as select now() as now;   -- transaction time = upload time of every call
create function pg_temp.pt(lat double precision, lng double precision, acc double precision, ago interval) returns jsonb language sql as
  $$ select jsonb_build_object('lat', lat, 'lng', lng, 'accuracy_m', acc, 'recorded_at', now() - ago) $$;
create function pg_temp.sub(n integer) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000007' || lpad(n::text, 2, '0'), true) $$;
create function pg_temp.rep(n integer, pts jsonb) returns void language plpgsql as
  $$ begin perform pg_temp.sub(n); set local role authenticated; perform public.driver_report_locations(pts); reset role; end $$;
create function pg_temp.confirm(n integer, i integer, st text, ago interval, lat double precision, lng double precision) returns void language plpgsql as
  $$ begin perform pg_temp.sub(n); set local role authenticated;
       perform public.driver_confirm_stop(690000 + n, i, st, now() - ago, lat, lng, 10); reset role; end $$;
create function pg_temp.s(n integer, i integer) returns jsonb language sql as $$ select stops -> i from public.jobs where id = 690000 + n $$;
create function pg_temp.nev(n integer, tgt text, typ text) returns bigint language sql as
  $$ select count(*) from public.geofence_events where job_id = 690000 + n and target = tgt and event_type = typ $$;
create function pg_temp.ago(i interval) returns timestamptz language sql as $$ select (select now from t0) - i $$;
grant execute on function pg_temp.sub(integer) to authenticated;
grant insert, select on f1_result to authenticated;

-- 13: permissions unchanged (server only).
insert into f1_result select '13: evaluate_geofences callable by service_role only',
  not has_function_privilege('authenticated', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute')
  and not has_function_privilege('public', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute'), '';
insert into f1_result select '13: security definer, search_path public, pg_temp',
  (select prosecdef and proconfig = array['search_path=public, pg_temp'] from pg_proc where proname = 'evaluate_geofences'),
  (select proconfig::text from pg_proc where proname = 'evaluate_geofences');

-- Driver 1: the Job 57 sequence.
select pg_temp.rep(1, jsonb_build_array(pg_temp.pt(52.10, -0.80, 10, '40 minutes')));          -- at stop 1: auto-arrived
select pg_temp.rep(1, jsonb_build_array(pg_temp.pt(52.3002, -0.80, 5, '30 minutes')));         -- at stop 2 (22 m), stop 1 not delivered
select pg_temp.rep(1, jsonb_build_array(pg_temp.pt(52.33, -0.80, 5, '28 minutes')));           -- leaves stop 2 (3.3 km)
insert into f1_result select '1: early arrival at stop 2 recorded as event', pg_temp.nev(1, 'stop:1', 'arrival') = 1, '';
insert into f1_result select '1: stop 2 stays pending while stop 1 is not delivered',
  pg_temp.s(1, 1) ->> 'status' = 'pending' and not (pg_temp.s(1, 1) ? 'arrived_at'), pg_temp.s(1, 1)::text;
insert into f1_result select '10: departure from stop 2 recorded', pg_temp.nev(1, 'stop:1', 'departure') = 1, '';
insert into f1_result select '10: departure from stop 1 recorded', pg_temp.nev(1, 'stop:0', 'departure') = 1, '';
insert into f1_result select 'stop 1 (first stop) auto-arrival records evidence',
  pg_temp.s(1, 0) ->> 'status' = 'arrived' and (pg_temp.s(1, 0) ->> 'arrived_at')::timestamptz = pg_temp.ago('40 minutes')
  and pg_temp.s(1, 0) ->> 'arrived_location_check' = 'ok' and pg_temp.s(1, 0) ->> 'arrived_location_source' = 'geofence'
  and (pg_temp.s(1, 0) ->> 'arrived_distance_m')::numeric = 0 and (pg_temp.s(1, 0) ->> 'arrived_accuracy_m')::numeric = 10, pg_temp.s(1, 0)::text;

-- Stop 1 delivered 10 minutes ago (device fix at stop 1), uploaded now.
select pg_temp.confirm(1, 0, 'completed', '10 minutes', 52.10, -0.80);
-- 3: a point queued offline at stop 2, captured before that delivery, uploaded after it.
select pg_temp.rep(1, jsonb_build_array(pg_temp.pt(52.3002, -0.80, 5, '12 minutes')));
insert into f1_result select '3: queued point from before the delivery does not arrive stop 2',
  pg_temp.s(1, 1) ->> 'status' = 'pending' and not (pg_temp.s(1, 1) ? 'arrived_at'), pg_temp.s(1, 1)::text;
-- 2: a fresh point at stop 2 after the delivery.
select pg_temp.rep(1, jsonb_build_array(pg_temp.pt(52.3001, -0.80, 4, '5 minutes')));
insert into f1_result select '2: fresh point after the delivery arrives stop 2',
  pg_temp.s(1, 1) ->> 'status' = 'arrived', pg_temp.s(1, 1)::text;
insert into f1_result select '2: arrived_at = the fresh point''s recorded time',
  (pg_temp.s(1, 1) ->> 'arrived_at')::timestamptz = pg_temp.ago('5 minutes'), pg_temp.s(1, 1) ->> 'arrived_at';
insert into f1_result select '2: evidence = the fresh point (ok, geofence, lat, lng, accuracy, distance)',
  pg_temp.s(1, 1) ->> 'arrived_location_check' = 'ok' and pg_temp.s(1, 1) ->> 'arrived_location_source' = 'geofence'
  and (pg_temp.s(1, 1) ->> 'arrived_lat')::float8 = 52.3001 and (pg_temp.s(1, 1) ->> 'arrived_lng')::float8 = -0.80
  and (pg_temp.s(1, 1) ->> 'arrived_accuracy_m')::numeric = 4 and (pg_temp.s(1, 1) ->> 'arrived_distance_m')::numeric = 11, pg_temp.s(1, 1)::text;
insert into f1_result select '2: no duplicate event; first arrival event kept',
  pg_temp.nev(1, 'stop:1', 'arrival') = 1
  and (select occurred_at from public.geofence_events where job_id = 690001 and target = 'stop:1' and event_type = 'arrival') = pg_temp.ago('30 minutes'), '';
insert into f1_result select '2: stop 1 delivery untouched',
  pg_temp.s(1, 0) ->> 'status' = 'completed' and (pg_temp.s(1, 0) ->> 'completed_at')::timestamptz = pg_temp.ago('10 minutes'), pg_temp.s(1, 0)::text;
-- 7: later points at stop 2 never change the arrival.
select pg_temp.rep(1, jsonb_build_array(pg_temp.pt(52.3005, -0.80, 3, '2 minutes')));
insert into f1_result select '7: arrived stop keeps arrived_at and evidence on later points',
  (pg_temp.s(1, 1) ->> 'arrived_at')::timestamptz = pg_temp.ago('5 minutes') and (pg_temp.s(1, 1) ->> 'arrived_distance_m')::numeric = 11
  and (pg_temp.s(1, 1) ->> 'arrived_accuracy_m')::numeric = 4, pg_temp.s(1, 1)::text;

-- Driver 2: stop 1 delivered 20 min ago, then points near stop 2 that must not qualify, then one that does.
select pg_temp.confirm(2, 0, 'completed', '20 minutes', 52.10, -0.80);
select pg_temp.rep(2, jsonb_build_array(pg_temp.pt(52.3018, -0.80, 10, '15 minutes')));          -- 200 m
insert into f1_result select '4: point 200 m away: no arrival', pg_temp.s(2, 1) ->> 'status' = 'pending' and pg_temp.nev(2, 'stop:1', 'arrival') = 0, '';
select pg_temp.rep(2, jsonb_build_array(pg_temp.pt(52.30, -0.80, 101, '14 minutes')));           -- accuracy 101 m
insert into f1_result select '5: accuracy 101 m: no arrival', pg_temp.s(2, 1) ->> 'status' = 'pending' and pg_temp.nev(2, 'stop:1', 'arrival') = 0, '';
select pg_temp.rep(2, jsonb_build_array(pg_temp.pt(52.30, -0.80, null, '13 minutes')));          -- accuracy null
select pg_temp.rep(2, jsonb_build_array(jsonb_build_object('lat', 52.30, 'lng', -0.80, 'recorded_at', now() - interval '12 minutes')));  -- accuracy missing
insert into f1_result select '6: accuracy null / missing: no arrival', pg_temp.s(2, 1) ->> 'status' = 'pending' and pg_temp.nev(2, 'stop:1', 'arrival') = 0, '';
select pg_temp.rep(2, jsonb_build_array(pg_temp.pt(52.3013, -0.80, 100, '11 minutes')));         -- 145 m, accuracy 100 m
insert into f1_result select '4/5: 145 m with accuracy 100 m arrives (limits unchanged)',
  pg_temp.s(2, 1) ->> 'status' = 'arrived' and (pg_temp.s(2, 1) ->> 'arrived_distance_m')::numeric = 145, pg_temp.s(2, 1)::text;

-- Driver 3: stop 1 arrived (not delivered); driver sits at stop 2 for a long time: stays pending.
select pg_temp.confirm(3, 0, 'arrived', '50 minutes', 52.10, -0.80);
select pg_temp.rep(3, jsonb_build_array(pg_temp.pt(52.30, -0.80, 5, '30 minutes'), pg_temp.pt(52.30, -0.80, 5, '20 minutes'),
  pg_temp.pt(52.30, -0.80, 5, '1 minute')));
insert into f1_result select 'order: repeated points at stop 2 with stop 1 only arrived: stays pending',
  pg_temp.s(3, 1) ->> 'status' = 'pending' and pg_temp.nev(3, 'stop:1', 'arrival') = 1, pg_temp.s(3, 1)::text;
insert into f1_result select '7: manual arrival evidence at stop 1 not overwritten by geofence',
  pg_temp.s(3, 0) ->> 'arrived_location_source' = 'device' and (pg_temp.s(3, 0) ->> 'arrived_at')::timestamptz = pg_temp.ago('50 minutes'), pg_temp.s(3, 0)::text;

-- Driver 4: 8: a delivered stop never changes.
select pg_temp.confirm(4, 0, 'completed', '30 minutes', 52.10, -0.80);
create temp table d4 as select pg_temp.s(4, 0) s;
select pg_temp.rep(4, jsonb_build_array(pg_temp.pt(52.10, -0.80, 3, '10 minutes')));
insert into f1_result select '8: delivered stop unchanged by a later point at it', pg_temp.s(4, 0) = (select s from d4), pg_temp.s(4, 0)::text;

-- Driver 5: 11: pickup / delivery behaviour unchanged.
select pg_temp.rep(5, jsonb_build_array(pg_temp.pt(52.50, -0.80, 20, '20 minutes'), pg_temp.pt(52.70, -0.80, 20, '10 minutes')));
insert into f1_result select '11: pickup arrival starts the job; departure; delivery arrival',
  (select status = 'in_progress' from public.jobs where id = 690005)
  and pg_temp.nev(5, 'pickup', 'arrival') = 1 and pg_temp.nev(5, 'pickup', 'departure') = 1 and pg_temp.nev(5, 'delivery', 'arrival') = 1
  and pg_temp.s(5, 0) ->> 'status' = 'pending' and pg_temp.s(5, 1) ->> 'status' = 'pending', '';

-- Driver 6 (company B) at company A's stop coordinates: 14: tenant isolation.
create temp table a_before as select id, stops, status from public.jobs where organization_id = '00000000-0000-4000-a000-0000000000f3';
select pg_temp.rep(6, jsonb_build_array(pg_temp.pt(52.10, -0.80, 5, '3 minutes')));
insert into f1_result select '14: company B driver moves only its own job',
  pg_temp.s(6, 0) ->> 'status' = 'arrived'
  and not exists (select 1 from public.geofence_events where driver_id = 690006 and organization_id <> '00000000-0000-4000-a000-0000000000f4')
  and not exists (select 1 from a_before b join public.jobs j using (id) where j.stops is distinct from b.stops or j.status <> b.status), '';
set local role authenticated;
select pg_temp.sub(8);
insert into f1_result select '14: company B admin sees no company A events',
  count(*) filter (where organization_id <> '00000000-0000-4000-a000-0000000000f4') = 0 and count(*) >= 1, count(*)::text from public.geofence_events;
select pg_temp.sub(7);
insert into f1_result select '14: company A admin sees only company A events',
  count(*) filter (where organization_id <> '00000000-0000-4000-a000-0000000000f3') = 0 and count(*) >= 1, count(*)::text from public.geofence_events;
select pg_temp.sub(1);
do $$ begin perform public.evaluate_geofences(690001, '00000000-0000-4000-a000-0000000000f3', 52.30, -0.80, 5, now());
  insert into f1_result values ('13: driver cannot call evaluate_geofences', false, 'accepted');
exception when others then insert into f1_result values ('13: driver cannot call evaluate_geofences', sqlerrm like 'permission denied%', sqlerrm); end $$;
reset role;

-- Unreadable earlier delivery time: no automatic arrival, and the GPS upload still succeeds.
update public.jobs set stops = jsonb_set(stops, '{0}', stops -> 0 || '{"status":"completed","completed_at":"not a time"}') where id = 690004;
select pg_temp.rep(4, jsonb_build_array(pg_temp.pt(52.30, -0.80, 5, '1 minute')));
insert into f1_result select 'unreadable delivery time: upload stored, stop 2 not arrived',
  pg_temp.s(4, 1) ->> 'status' = 'pending' and pg_temp.nev(4, 'stop:1', 'arrival') = 1
  and exists (select 1 from public.driver_positions where driver_id = 690004 and recorded_at = pg_temp.ago('1 minute')), pg_temp.s(4, 1)::text;

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from f1_result;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from f1_result;
do $$ begin
  if exists (select 1 from f1_result where not pass) then raise exception 'geofence_next_stop_arrival: FAILED'; end if;
end $$;
rollback;
