-- STAGE 2 regression (run on a database with Stage 1 + supabase/pending/
-- 20260928200000_stop_location_enforce.sql): manual Arrive / Delivered need
-- location evidence at the stop
-- (a device fix sent with the action, or the driver's latest recent GPS point):
-- <= 150 m, accuracy known and <= 100 m. Driver-supplied times for stop actions
-- and proof of delivery are limited to 12 h back; GPS point times keep 7 days.
-- State machine, POD and tenant rules unchanged. Rolled back.
-- Needs a local database, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/pending/stop_location_enforce_test.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000a7', 'Loc A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000a8', 'Loc B', 'starter', 'trial', now() + interval '14 days');
-- Users 1..6 drivers (company A), 7 driver (company B), 8 admin (company A).
create temp table ppl as
  select n, ('00000000-0000-4000-b000-0000000007' || lpad(n::text, 2, '0'))::uuid uid,
         case when n = 7 then '00000000-0000-4000-a000-0000000000a8' else '00000000-0000-4000-a000-0000000000a7' end::uuid org,
         case when n = 8 then 'admin' else 'driver' end role
    from generate_series(1, 8) n;
insert into auth.users (id, email) select uid, 'loc' || n || '@loc.test' from ppl;
insert into public.users (id, email, name, role, organization_id) select uid, 'loc' || n || '@loc.test', 'Loc ' || n, role, org from ppl
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) select 710000 + n, 'Loc ' || n, uid, org from ppl where role = 'driver';

-- Stop sites: P (51.50, -0.10), Q (51.60, -0.20), R (51.70, -0.30). Far = 5+ km away.
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, stops) values
  (710001, 'LOC-1', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710001,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"},{"label":"Q","lat":51.60,"lng":-0.20,"status":"pending"},{"label":"No map position","status":"pending"}]'),
  (710002, 'LOC-2', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710001,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (710003, 'LOC-3', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710002,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"},{"label":"R","lat":51.70,"lng":-0.30,"status":"pending"}]'),
  (710004, 'LOC-4', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710003,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (710005, 'LOC-5', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710004,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (710006, 'LOC-6', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710005,
   '[{"label":"Q","lat":51.60,"lng":-0.20,"status":"pending"}]'),
  (710007, 'LOC-7', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000a7', 710006,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (710008, 'LOC-B', 'B', 'in_progress', '00000000-0000-4000-a000-0000000000a8', 710007,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]');
-- Stored GPS (as the report functions would have stored it).
insert into public.driver_positions (organization_id, driver_id, lat, lng, accuracy_m, recorded_at) values
  ('00000000-0000-4000-a000-0000000000a7', 710002, 51.5002, -0.1002, 10, now() - interval '1 minute'),   -- at P, fresh
  ('00000000-0000-4000-a000-0000000000a7', 710003, 51.5002, -0.1002, 10, now() - interval '20 minutes'),  -- at P, stale
  ('00000000-0000-4000-a000-0000000000a7', 710004, 51.5002, -0.1002, 10, now() - interval '2 hours'),     -- at P while offline
  ('00000000-0000-4000-a000-0000000000a7', 710004, 51.9000, -0.9000, 10, now() - interval '1 minute'),    -- now, far away
  ('00000000-0000-4000-a000-0000000000a7', 710005, 51.6001, -0.2001, null, now() - interval '30 seconds'),-- at Q, accuracy unknown
  ('00000000-0000-4000-a000-0000000000a8', 710007, 51.5000, -0.1000, 5, now() - interval '30 seconds');   -- company B driver at P

create temp table loc_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on loc_result to authenticated, anon;
create function pg_temp.chk(p_name text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into loc_result values (p_name, p_expect is null, case when p_expect is null then 'ok' else 'accepted' end);
exception when others then
  insert into loc_result values (p_name, sqlerrm = p_expect, sqlerrm);
end $$;
create function pg_temp.sub(n integer) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000007' || lpad(n::text, 2, '0'), true) $$;
grant execute on function pg_temp.chk(text, text, text), pg_temp.sub(integer) to authenticated, anon;
create function pg_temp.stop(j integer, i integer, k text) returns text language sql as $$ select stops -> i ->> k from public.jobs where id = j $$;
create temp table t0 as select now() as now;

insert into loc_result select 'grants: drivers can call driver_confirm_stop, anon cannot; old entry points removed',
  has_function_privilege('authenticated', 'public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision)', 'execute')
  and not has_function_privilege('anon', 'public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision)', 'execute')
  and not exists (select 1 from pg_proc where proname in ('driver_mark_stop', 'driver_update_stop')), '';

set local role authenticated;
select pg_temp.sub(1);
-- 1 / 3: Arrive needs a good fix at the stop.
select pg_temp.chk('1 arrive with fix 5 km away',              'select public.driver_confirm_stop(710001, 0, ''arrived'', null, 51.55, -0.10, 10)', 'NOT_AT_STOP');
select pg_temp.chk('3 arrive with accuracy unknown',           'select public.driver_confirm_stop(710001, 0, ''arrived'', null, 51.50, -0.10, null)', 'LOCATION_INACCURATE');
select pg_temp.chk('3 arrive with accuracy 150 m',             'select public.driver_confirm_stop(710001, 0, ''arrived'', null, 51.50, -0.10, 150)', 'LOCATION_INACCURATE');
select pg_temp.chk('3 arrive without any location',            'select public.driver_confirm_stop(710001, 0, ''arrived'', null)', 'LOCATION_REQUIRED');
select pg_temp.chk('3 arrive without location (no fix argument)', 'select public.driver_confirm_stop(710001, 0, ''arrived'')', 'LOCATION_REQUIRED');
select pg_temp.chk('arrive with latitude but no longitude',    'select public.driver_confirm_stop(710001, 0, ''arrived'', null, 51.50, null, 10)', 'INVALID_POSITION');
select pg_temp.chk('arrive with a good fix 30 m from the stop', 'select public.driver_confirm_stop(710001, 0, ''arrived'', null, 51.5002, -0.1002, 20)', null);
-- 2 / 4: Delivered needs the same evidence, also after a valid arrival.
select pg_temp.chk('2 deliver with fix 5 km away',             'select public.driver_confirm_stop(710001, 0, ''completed'', null, 51.55, -0.10, 10)', 'NOT_AT_STOP');
select pg_temp.chk('4 deliver without location',               'select public.driver_confirm_stop(710001, 0, ''completed'', null)', 'LOCATION_REQUIRED');
select pg_temp.chk('4 deliver with accuracy unknown',          'select public.driver_confirm_stop(710001, 0, ''completed'', null, 51.50, -0.10, null)', 'LOCATION_INACCURATE');
select pg_temp.chk('deliver at the stop',                      'select public.driver_confirm_stop(710001, 0, ''completed'', null, 51.5001, -0.1001, 15)', null);
-- 5 / 6 / 7: Phase 2A rules still apply (and come first).
select pg_temp.chk('5 deliver stop 3 before stop 2 (even at the site)', 'select public.driver_confirm_stop(710001, 2, ''completed'', null, 51.60, -0.20, 10)', 'STOP_ORDER');
select pg_temp.chk('6 complete job with stops pending',        'select public.driver_complete_job(710001, null, ''data:image/png;base64,AA=='', null, null, null, null, null)', 'STOPS_PENDING');
select pg_temp.chk('7 delivered stop back to arrived (at the stop)', 'select public.driver_confirm_stop(710001, 0, ''arrived'', null, 51.50, -0.10, 10)', 'STOP_ALREADY_COMPLETED');
select pg_temp.chk('7 delivered stop delivered again',         'select public.driver_confirm_stop(710001, 0, ''completed'', null, 51.50, -0.10, 10)', 'STOP_ALREADY_COMPLETED');
select pg_temp.chk('stop 2 delivered directly at its site',    'select public.driver_confirm_stop(710001, 1, ''completed'', null, 51.6003, -0.2003, 30)', null);
select pg_temp.chk('stop with no map position cannot be confirmed', 'select public.driver_confirm_stop(710001, 2, ''arrived'', null, 51.60, -0.20, 10)', 'STOP_NOT_LOCATED');
select pg_temp.chk('6 complete job still blocked by the unconfirmable stop', 'select public.driver_complete_job(710001, null, ''data:image/png;base64,AA=='', null, null, null, null, null)', 'STOPS_PENDING');
-- 8: driver-supplied times.
select pg_temp.chk('8 arrive dated 3 days ago (accepted, time clamped)', format('select public.driver_confirm_stop(710002, 0, ''arrived'', %L, 51.50, -0.10, 10)', now() - interval '3 days'), null);
select pg_temp.chk('8 deliver dated tomorrow (accepted, time clamped)', format('select public.driver_confirm_stop(710002, 0, ''completed'', %L, 51.50, -0.10, 10)', now() + interval '1 day'), null);
select pg_temp.chk('8 proof of delivery dated 3 days ago (accepted, time clamped)',
  format('select public.driver_complete_job(710002, null, ''data:image/png;base64,AA=='', null, null, null, null, %L)', now() - interval '3 days'), null);

-- Evidence from the stored GPS track (older apps / old entry point).
select pg_temp.sub(2);
select pg_temp.chk('track: latest point 1 min ago at the stop', 'select public.driver_confirm_stop(710003, 0, ''arrived'')', null);
select pg_temp.chk('track: deliver stop 1 with the same fresh point', 'select public.driver_confirm_stop(710003, 0, ''completed'')', null);
select pg_temp.chk('track: stop 2 is far from the latest point',  'select public.driver_confirm_stop(710003, 1, ''arrived'')', 'NOT_AT_STOP');
select pg_temp.sub(3);
select pg_temp.chk('track: latest point 20 min old is not evidence', 'select public.driver_confirm_stop(710004, 0, ''arrived'', null)', 'LOCATION_REQUIRED');
select pg_temp.sub(4);
select pg_temp.chk('track: now far away -> refused',            'select public.driver_confirm_stop(710005, 0, ''arrived'', null)', 'NOT_AT_STOP');
select pg_temp.chk('track: offline action 2 h ago matched to the point at that time',
  format('select public.driver_confirm_stop(710005, 0, ''arrived'', %L)', now() - interval '2 hours'), null);
select pg_temp.chk('8 track: action dated 3 days ago has no evidence at the clamped time',
  format('select public.driver_confirm_stop(710005, 0, ''completed'', %L)', now() - interval '3 days'), 'LOCATION_REQUIRED');
select pg_temp.sub(5);
select pg_temp.chk('3 track: latest point with unknown accuracy', 'select public.driver_confirm_stop(710006, 0, ''arrived'', null)', 'LOCATION_INACCURATE');
-- 10: another company's driver's GPS at the stop is not this driver's evidence.
select pg_temp.sub(6);
select pg_temp.chk('10 no own GPS (other company driver is at the stop)', 'select public.driver_confirm_stop(710007, 0, ''arrived'')', 'LOCATION_REQUIRED');
select pg_temp.sub(7);
select pg_temp.chk('10 other company: mark stop on company A job',  'select public.driver_confirm_stop(710001, 1, ''arrived'', null, 51.60, -0.20, 5)', 'JOB_NOT_FOUND');
select pg_temp.chk('10 other company: without a fix',            'select public.driver_confirm_stop(710002, 0, ''arrived'')', 'JOB_NOT_FOUND');
select pg_temp.chk('10 other company: own job at its stop works',  'select public.driver_confirm_stop(710008, 0, ''arrived'', null, 51.50, -0.10, 5)', null);
select pg_temp.sub(8);
select pg_temp.chk('10 office admin is not a driver',              'select public.driver_confirm_stop(710007, 0, ''arrived'', null, 51.50, -0.10, 5)', 'NOT_A_DRIVER');
-- 9: GPS recorded time from Phase 2B (7 days) unchanged; automatic arrival still works.
select pg_temp.sub(6);
select public.driver_report_locations(jsonb_build_array(jsonb_build_object('lat', 51.50, 'lng', -0.10, 'accuracy_m', 10, 'recorded_at', now() - interval '3 days')));
reset role;
set local role anon;
select pg_temp.chk('10 anonymous caller refused', 'select public.driver_confirm_stop(710001, 1, ''arrived'', null, 51.60, -0.20, 5)', 'permission denied for function driver_confirm_stop');
reset role;

-- Stored results.
insert into loc_result select 'arrival keeps the device evidence',
  pg_temp.stop(710001, 0, 'arrived_location_source') = 'device' and pg_temp.stop(710001, 0, 'arrived_accuracy_m')::numeric = 20
  and pg_temp.stop(710001, 0, 'arrived_lat')::numeric = 51.5002, pg_temp.stop(710001, 0, 'arrived_lat');
insert into loc_result select 'refused attempts changed nothing on job 1',
  pg_temp.stop(710001, 0, 'status') = 'completed' and pg_temp.stop(710001, 1, 'status') = 'completed' and pg_temp.stop(710001, 2, 'status') = 'pending'
  and (select status = 'in_progress' from public.jobs where id = 710001), '';
insert into loc_result select '8 stop time 3 days back clamped to 12 h',
  pg_temp.stop(710002, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '12 hours', pg_temp.stop(710002, 0, 'arrived_at');
insert into loc_result select '8 future stop time clamped to now',
  pg_temp.stop(710002, 0, 'completed_at')::timestamptz = (select now from t0), pg_temp.stop(710002, 0, 'completed_at');
insert into loc_result select '8 proof of delivery time 3 days back clamped to 12 h',
  completed_at = (select now from t0) - interval '12 hours' and pod_captured_at = completed_at, completed_at::text from public.jobs where id = 710002;
insert into loc_result select 'track evidence recorded as gps_track, server time',
  pg_temp.stop(710003, 0, 'arrived_location_source') = 'gps_track' and pg_temp.stop(710003, 0, 'arrived_at')::timestamptz = (select now from t0), '';
insert into loc_result select 'offline track action keeps its (clamped) time',
  pg_temp.stop(710005, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '2 hours', pg_temp.stop(710005, 0, 'arrived_at');
insert into loc_result select '9 GPS point 3 days old stored with its own time (7-day rule)',
  exists (select 1 from public.driver_positions where driver_id = 710006 and recorded_at = (select now from t0) - interval '3 days'), '';
insert into loc_result select '9 automatic geofence arrival still works, at the GPS point time',
  pg_temp.stop(710007, 0, 'status') = 'arrived' and pg_temp.stop(710007, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '3 days',
  pg_temp.stop(710007, 0, 'arrived_at');
insert into loc_result select '10 company A jobs untouched by company B', pg_temp.stop(710002, 0, 'status') = 'completed'
  and not exists (select 1 from public.jobs where organization_id = '00000000-0000-4000-a000-0000000000a7' and stops::text like '%710007%'), '';

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from loc_result;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from loc_result;
do $$ begin
  if exists (select 1 from loc_result where not pass) then raise exception 'stop_location_evidence: FAILED'; end if;
end $$;
rollback;
