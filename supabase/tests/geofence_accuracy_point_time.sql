-- Regression: automatic geofence actions need a known accuracy <= 100 m, and
-- use the time the GPS point was recorded (offline backlog included), clamped
-- by driver_event_time. Positions are still stored. Rolled back.
-- Needs a database built from supabase/migrations, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/geofence_accuracy_point_time.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000f1', 'Geo A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000f2', 'Geo B', 'starter', 'trial', now() + interval '14 days');
-- Users 1..13 are drivers (10 is in company B), 14 = admin B, 15 = admin A.
create temp table ppl as
  select n, ('00000000-0000-4000-b000-0000000006' || lpad(n::text, 2, '0'))::uuid uid,
         case when n in (10, 14) then '00000000-0000-4000-a000-0000000000f2' else '00000000-0000-4000-a000-0000000000f1' end::uuid org,
         case when n >= 14 then 'admin' else 'driver' end role
    from generate_series(1, 15) n;
insert into auth.users (id, email) select uid, 'geo' || n || '@geo.test' from ppl;
insert into public.users (id, email, name, role, organization_id) select uid, 'geo' || n || '@geo.test', 'Geo ' || n, role, org from ppl
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) select 680000 + n, 'Geo ' || n, uid, org from ppl where role = 'driver';
-- One open job per driver: stop 1 at (52.10, -0.80), stop 2 at (52.30, -0.80).
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, pickup_lat, pickup_lng, stops)
  select 680000 + n, 'GEO-' || n, 'G', case when n = 9 then 'assigned' else 'in_progress' end::public.job_status, org, 680000 + n,
         case when n = 9 then 52.50 end, case when n = 9 then -0.80 end,
         '[{"label":"S1","lat":52.10,"lng":-0.80,"status":"pending"},{"label":"S2","lat":52.30,"lng":-0.80,"status":"pending"}]'::jsonb
    from ppl where role = 'driver';

create temp table geo_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on geo_result to authenticated;
create function pg_temp.pt(lat double precision, lng double precision, acc double precision, at timestamptz) returns jsonb language sql as
  $$ select jsonb_strip_nulls(jsonb_build_object('lat', lat, 'lng', lng, 'recorded_at', at)) || jsonb_build_object('accuracy_m', acc) $$;
create function pg_temp.sub(n integer) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000006' || lpad(n::text, 2, '0'), true) $$;
grant execute on function pg_temp.pt(double precision, double precision, double precision, timestamptz), pg_temp.sub(integer) to authenticated;
create temp table t0 as select now() as now;   -- transaction time = "upload time" of every call below

-- Grants: only the server can run the geofence check; the old signature is gone.
insert into geo_result select 'evaluate_geofences: drivers/anon cannot call, service_role can',
  not has_function_privilege('authenticated', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute'), '';
insert into geo_result select 'old 4-argument evaluate_geofences removed',
  not exists (select 1 from pg_proc where proname = 'evaluate_geofences' and pronargs = 4), '';
insert into geo_result select 'driver report functions still callable by drivers only',
  has_function_privilege('authenticated', 'public.driver_report_locations(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.driver_report_locations(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.driver_report_location(double precision, double precision, double precision, double precision, double precision)', 'execute')
  and not has_function_privilege('anon', 'public.driver_report_location(double precision, double precision, double precision, double precision, double precision)', 'execute'), '';

set local role authenticated;
select pg_temp.sub(1);  -- A + E: live point, accuracy 20 m
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 20, now() - interval '5 seconds')));
select pg_temp.sub(2);  -- B: accuracy 150 m
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 150, now() - interval '5 seconds')));
select pg_temp.sub(3);  -- C: accuracy null, and accuracy missing
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, null, now() - interval '40 seconds'),
  jsonb_build_object('lat', 52.10, 'lng', -0.80, 'recorded_at', now() - interval '20 seconds')));
select pg_temp.sub(4);  -- D: no coordinates
select public.driver_report_locations(jsonb_build_array(jsonb_build_object('lng', -0.80, 'accuracy_m', 10, 'recorded_at', now() - interval '30 seconds'),
  jsonb_build_object('lat', 52.10, 'accuracy_m', 10, 'recorded_at', now() - interval '20 seconds'),
  pg_temp.pt(0, 0, 10, now() - interval '10 seconds')));
do $$ begin perform public.driver_report_location(null, -0.80, null, null, 10); insert into geo_result values ('D: web report without latitude refused', false, 'accepted');
exception when others then insert into geo_result values ('D: web report without latitude refused', sqlerrm = 'INVALID_POSITION', sqlerrm); end $$;
select pg_temp.sub(5);  -- F: captured offline 2 h ago at stop 1, then live 5 s ago far away, uploaded together now
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.20, -0.80, 10, now() - interval '5 seconds'),
  pg_temp.pt(52.10, -0.80, 15, now() - interval '2 hours')));
select pg_temp.sub(6);  -- G: point dated tomorrow
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 10, now() + interval '1 day')));
select pg_temp.sub(11); -- G: point dated 30 days ago
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 10, now() - interval '30 days')));
select pg_temp.sub(12); -- G: point without a time
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 10, null)));
select pg_temp.sub(7);  -- J: a newer point is stored, then an older one at the stop arrives late
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.20, -0.80, 20, now() - interval '1 minute')));
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 20, now() - interval '10 minutes')));
select pg_temp.sub(8);  -- web live report, accuracy 20 m
select public.driver_report_location(52.10, -0.80, null, null, 20);
select pg_temp.sub(13); -- web live report, accuracy unknown
select public.driver_report_location(52.10, -0.80, null, null, null);
select pg_temp.sub(9);  -- I: pickup arrival then departure
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.50, -0.80, 30, now() - interval '60 seconds'),
  pg_temp.pt(52.60, -0.80, 30, now() - interval '30 seconds')));
select pg_temp.sub(10); -- H: company B driver at company A's stop coordinates
select public.driver_report_locations(jsonb_build_array(pg_temp.pt(52.10, -0.80, 10, now() - interval '5 seconds')));
do $$ begin perform public.evaluate_geofences(680001, '00000000-0000-4000-a000-0000000000f1', 52.30, -0.80, 5, now()); insert into geo_result values ('H: driver cannot call evaluate_geofences', false, 'accepted');
exception when others then insert into geo_result values ('H: driver cannot call evaluate_geofences', sqlerrm like 'permission denied%', sqlerrm); end $$;
reset role;

create function pg_temp.ev(d integer, tgt text, typ text) returns timestamptz language sql as
  $$ select occurred_at from public.geofence_events where driver_id = 680000 + d and target = tgt and event_type = typ $$;
create function pg_temp.nev(d integer) returns bigint language sql as $$ select count(*) from public.geofence_events where driver_id = 680000 + d $$;
create function pg_temp.npos(d integer) returns bigint language sql as $$ select count(*) from public.driver_positions where driver_id = 680000 + d $$;
create function pg_temp.stop(d integer, i integer, k text) returns text language sql as $$ select stops -> i ->> k from public.jobs where id = 680000 + d $$;

insert into geo_result select 'A: accuracy 20 m arrives at stop 1', pg_temp.stop(1, 0, 'status') = 'arrived' and pg_temp.nev(1) = 1, pg_temp.stop(1, 0, 'status');
insert into geo_result select 'E: live event time = point time', pg_temp.ev(1, 'stop:0', 'arrival') = (select now from t0) - interval '5 seconds'
  and pg_temp.stop(1, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '5 seconds', pg_temp.ev(1, 'stop:0', 'arrival')::text;
insert into geo_result select 'B: accuracy 150 m stored, no arrival', pg_temp.npos(2) = 1 and pg_temp.nev(2) = 0 and pg_temp.stop(2, 0, 'status') = 'pending',
  format('pos=%s ev=%s', pg_temp.npos(2), pg_temp.nev(2));
insert into geo_result select 'C: null/missing accuracy stored, no arrival', pg_temp.npos(3) = 2 and pg_temp.nev(3) = 0 and pg_temp.stop(3, 0, 'status') = 'pending'
  and (select bool_and(accuracy_m is null) from public.driver_positions where driver_id = 680003), format('pos=%s ev=%s', pg_temp.npos(3), pg_temp.nev(3));
insert into geo_result select 'C: web report with unknown accuracy stored, no arrival', pg_temp.npos(13) = 1 and pg_temp.nev(13) = 0 and pg_temp.stop(13, 0, 'status') = 'pending',
  format('pos=%s ev=%s', pg_temp.npos(13), pg_temp.nev(13));
insert into geo_result select 'D: points without coordinates: nothing stored, no action', pg_temp.npos(4) = 0 and pg_temp.nev(4) = 0 and pg_temp.stop(4, 0, 'status') = 'pending',
  format('pos=%s ev=%s', pg_temp.npos(4), pg_temp.nev(4));
insert into geo_result select 'F: offline arrival time = captured time (2 h ago), not upload time',
  pg_temp.ev(5, 'stop:0', 'arrival') = (select now from t0) - interval '2 hours'
  and pg_temp.stop(5, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '2 hours', pg_temp.stop(5, 0, 'arrived_at');
insert into geo_result select 'F: later departure at its own point time', pg_temp.ev(5, 'stop:0', 'departure') = (select now from t0) - interval '5 seconds',
  pg_temp.ev(5, 'stop:0', 'departure')::text;
insert into geo_result select 'F: both offline points stored with their own times',
  (select array_agg(recorded_at order by recorded_at) from public.driver_positions where driver_id = 680005)
    = array[(select now from t0) - interval '2 hours', (select now from t0) - interval '5 seconds'], '';
insert into geo_result select 'G: future point clamped to receipt time', pg_temp.ev(6, 'stop:0', 'arrival') = (select now from t0)
  and pg_temp.stop(6, 0, 'arrived_at')::timestamptz = (select now from t0), pg_temp.ev(6, 'stop:0', 'arrival')::text;
insert into geo_result select 'G: 30-day-old point clamped to 7 days', pg_temp.ev(11, 'stop:0', 'arrival') = (select now from t0) - interval '7 days',
  pg_temp.ev(11, 'stop:0', 'arrival')::text;
insert into geo_result select 'G: point without a time uses receipt time', pg_temp.ev(12, 'stop:0', 'arrival') = (select now from t0), pg_temp.ev(12, 'stop:0', 'arrival')::text;
insert into geo_result select 'J: older point after a newer one is ignored (no position, no arrival)',
  pg_temp.npos(7) = 1 and pg_temp.nev(7) = 0 and pg_temp.stop(7, 0, 'status') = 'pending', format('pos=%s ev=%s', pg_temp.npos(7), pg_temp.nev(7));
insert into geo_result select 'web live report: arrival at report time', pg_temp.ev(8, 'stop:0', 'arrival') = (select now from t0)
  and pg_temp.stop(8, 0, 'status') = 'arrived', pg_temp.ev(8, 'stop:0', 'arrival')::text;
insert into geo_result select 'I: pickup arrival starts the job, departure recorded',
  (select status = 'in_progress' from public.jobs where id = 680009)
  and pg_temp.ev(9, 'pickup', 'arrival') = (select now from t0) - interval '60 seconds'
  and pg_temp.ev(9, 'pickup', 'departure') = (select now from t0) - interval '30 seconds', '';
insert into geo_result select 'I: stop order still respected (stop 2 not auto-arrived)',
  (select bool_and(coalesce(stops -> 1 ->> 'status', 'pending') = 'pending') from public.jobs where id between 680001 and 680013), '';
insert into geo_result select 'H: company B driver affects only its own job',
  pg_temp.stop(10, 0, 'status') = 'arrived'
  and not exists (select 1 from public.geofence_events where driver_id = 680010 and organization_id <> '00000000-0000-4000-a000-0000000000f2')
  and not exists (select 1 from public.geofence_events where organization_id = '00000000-0000-4000-a000-0000000000f1' and driver_id = 680010), '';
insert into geo_result select 'H: company A jobs not moved by company B', pg_temp.stop(2, 0, 'status') = 'pending' and pg_temp.stop(3, 0, 'status') = 'pending', '';

-- H: Office visibility of events stays per company.
set local role authenticated;
select pg_temp.sub(14);
insert into geo_result select 'H: company B admin sees no company A events',
  count(*) filter (where organization_id = '00000000-0000-4000-a000-0000000000f1') = 0 and count(*) >= 1, count(*)::text from public.geofence_events;
select pg_temp.sub(15);
insert into geo_result select 'H: company A admin sees only company A events',
  count(*) filter (where organization_id <> '00000000-0000-4000-a000-0000000000f1') = 0 and count(*) >= 1, count(*)::text from public.geofence_events;
reset role;

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from geo_result;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from geo_result;
do $$ begin
  if exists (select 1 from geo_result where not pass) then raise exception 'geofence_accuracy_point_time: FAILED'; end if;
end $$;
rollback;
