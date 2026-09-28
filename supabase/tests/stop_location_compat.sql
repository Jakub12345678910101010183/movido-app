-- Regression, Stage 1 (compatibility): the old stop entry points used by the
-- deployed Web Driver / native builds work exactly as before; the new
-- driver_confirm_stop records location evidence (and the Stage 2 result)
-- without refusing on it, limits the driver time to 12 h, and keeps the stop
-- state machine and tenant rules. Rolled back.
-- Needs a database built from supabase/migrations, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/stop_location_compat.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000b5', 'Compat A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000b6', 'Compat B', 'starter', 'trial', now() + interval '14 days');
-- Users 1,2,3,4,5,8 drivers (company A), 6 driver (company B), 7 admin (company A).
create temp table ppl as
  select n, ('00000000-0000-4000-b000-0000000008' || lpad(n::text, 2, '0'))::uuid uid,
         case when n = 6 then '00000000-0000-4000-a000-0000000000b6' else '00000000-0000-4000-a000-0000000000b5' end::uuid org,
         case when n = 7 then 'admin' else 'driver' end role
    from generate_series(1, 8) n;
insert into auth.users (id, email) select uid, 'cmp' || n || '@cmp.test' from ppl;
insert into public.users (id, email, name, role, organization_id) select uid, 'cmp' || n || '@cmp.test', 'Cmp ' || n, role, org from ppl
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) select 720000 + n, 'Cmp ' || n, uid, org from ppl where role = 'driver';

-- Sites: P (51.50, -0.10), Q (51.60, -0.20); R has no map position.
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, stops) values
  (720001, 'CMP-1', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720001,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"},{"label":"Q","lat":51.60,"lng":-0.20,"status":"pending"}]'),
  (720009, 'CMP-9', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720001, '[{"label":"R","status":"pending"}]'),
  (720002, 'CMP-2', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720002,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720003, 'CMP-3', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720003,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"},{"label":"Q","lat":51.60,"lng":-0.20,"status":"pending"},{"label":"R","status":"pending"}]'),
  (720010, 'CMP-10', 'A', 'cancelled', '00000000-0000-4000-a000-0000000000b5', 720003, '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720004, 'CMP-4', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720004,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720005, 'CMP-5', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720005,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"},{"label":"P2","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720008, 'CMP-8', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000b5', 720008,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720006, 'CMP-B', 'B', 'in_progress', '00000000-0000-4000-a000-0000000000b6', 720006,
   '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]');
insert into public.driver_positions (organization_id, driver_id, lat, lng, accuracy_m, recorded_at) values
  ('00000000-0000-4000-a000-0000000000b5', 720005, 51.5002, -0.1002, 10, now() - interval '1 minute'),  -- driver 5 at P, fresh
  ('00000000-0000-4000-a000-0000000000b6', 720006, 51.5000, -0.1000, 5, now() - interval '30 seconds'); -- company B driver at P

create temp table cmp_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on cmp_result to authenticated, anon;
create function pg_temp.chk(p_name text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into cmp_result values (p_name, p_expect is null, case when p_expect is null then 'ok' else 'accepted' end);
exception when others then
  insert into cmp_result values (p_name, sqlerrm = p_expect, sqlerrm);
end $$;
create function pg_temp.sub(n integer) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000008' || lpad(n::text, 2, '0'), true) $$;
grant execute on function pg_temp.chk(text, text, text), pg_temp.sub(integer) to authenticated, anon;
create function pg_temp.s(j integer, i integer, k text) returns text language sql as $$ select stops -> i ->> k from public.jobs where id = j $$;
create temp table t0 as select now() as now;

-- Permissions.
insert into cmp_result select 'driver_confirm_stop: drivers yes, anon no',
  has_function_privilege('authenticated', 'public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision)', 'execute')
  and not has_function_privilege('anon', 'public.driver_confirm_stop(integer, integer, text, timestamptz, double precision, double precision, double precision)', 'execute'), '';
insert into cmp_result select 'driver_stop_location_check: not callable by drivers or anon',
  not has_function_privilege('authenticated', 'public.driver_stop_location_check(integer, uuid, jsonb, timestamptz, double precision, double precision, double precision)', 'execute')
  and not has_function_privilege('anon', 'public.driver_stop_location_check(integer, uuid, jsonb, timestamptz, double precision, double precision, double precision)', 'execute'), '';
insert into cmp_result select 'old entry points still there for deployed clients (drivers yes, anon no)',
  has_function_privilege('authenticated', 'public.driver_mark_stop(integer, integer, text, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.driver_update_stop(integer, integer, text)', 'execute')
  and not has_function_privilege('anon', 'public.driver_mark_stop(integer, integer, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.driver_update_stop(integer, integer, text)', 'execute'), '';

set local role authenticated;
-- OLD WEB CLIENT (production 871af86): driver_mark_stop with named args and p_at null, no location.
select pg_temp.sub(1);
select pg_temp.chk('old Web: Arrive (no location)',      'select public.driver_mark_stop(p_job_id => 720001, p_stop_index => 0, p_status => ''arrived'', p_at => null)', null);
select pg_temp.chk('old Web: stop order still enforced',   'select public.driver_mark_stop(p_job_id => 720001, p_stop_index => 1, p_status => ''arrived'', p_at => null)', 'STOP_ORDER');
select pg_temp.chk('old Web: Delivered (no location)',   'select public.driver_mark_stop(p_job_id => 720001, p_stop_index => 0, p_status => ''completed'', p_at => null)', null);
select pg_temp.chk('old Web: stop without map position still works (unchanged)', 'select public.driver_mark_stop(p_job_id => 720009, p_stop_index => 0, p_status => ''arrived'', p_at => null)', null);
select pg_temp.chk('old entry point driver_update_stop: Delivered', 'select public.driver_update_stop(720001, 1, ''completed'')', null);
select pg_temp.chk('old Web: delivered stop stays final', 'select public.driver_mark_stop(p_job_id => 720001, p_stop_index => 0, p_status => ''arrived'', p_at => null)', 'STOP_ALREADY_COMPLETED');
-- OLD NATIVE BUILD: driver_mark_stop with the tap time (offline replay), no location.
select pg_temp.sub(2);
select pg_temp.chk('old native: Arrive, tapped 2 days ago offline', format('select public.driver_mark_stop(p_job_id => 720002, p_stop_index => 0, p_status => ''arrived'', p_at => %L)', now() - interval '2 days'), null);
select pg_temp.chk('old native: Delivered, tapped 1 h ago',        format('select public.driver_mark_stop(p_job_id => 720002, p_stop_index => 0, p_status => ''completed'', p_at => %L)', now() - interval '1 hour'), null);

-- NEW WEB CLIENT: driver_confirm_stop with a browser fix, server time.
select pg_temp.sub(3);
select pg_temp.chk('new: stop order (R before Q)',          'select public.driver_confirm_stop(720003, 2, ''arrived'', null, 51.60, -0.20, 10)', 'STOP_ORDER');
select pg_temp.chk('new Web: Arrive at P with fix',         'select public.driver_confirm_stop(720003, 0, ''arrived'', null, 51.5002, -0.1002, 12)', null);
select pg_temp.chk('new: job completion with stops pending', 'select public.driver_complete_job(720003, null, ''data:image/png;base64,AA=='', null, null, null, null, null)', 'STOPS_PENDING');
select pg_temp.chk('new Web: Delivered at P with fix',      'select public.driver_confirm_stop(720003, 0, ''completed'', null, 51.5001, -0.1001, 15)', null);
select pg_temp.chk('new: delivered stop back to arrived',   'select public.driver_confirm_stop(720003, 0, ''arrived'', null, 51.50, -0.10, 10)', 'STOP_ALREADY_COMPLETED');
select pg_temp.chk('new: delivered stop delivered again',   'select public.driver_confirm_stop(720003, 0, ''completed'', null, 51.50, -0.10, 10)', 'STOP_ALREADY_COMPLETED');
select pg_temp.chk('new: Delivered 5 km away (recorded, not refused in Stage 1)', 'select public.driver_confirm_stop(720003, 1, ''completed'', null, 51.65, -0.20, 10)', null);
select pg_temp.chk('new: stop without map position (recorded, not refused)', 'select public.driver_confirm_stop(720003, 2, ''arrived'', null, 51.60, -0.20, 10)', null);
select pg_temp.chk('new: Delivered without any location (recorded, not refused)', 'select public.driver_confirm_stop(720003, 2, ''completed'', null)', null);
select pg_temp.chk('new: job completion with proof of delivery', 'select public.driver_complete_job(720003, null, ''data:image/png;base64,AA=='', ''Jo'', null, null, null, null)', null);
select pg_temp.chk('new: cancelled job',                    'select public.driver_confirm_stop(720010, 0, ''arrived'', null, 51.50, -0.10, 10)', 'JOB_CLOSED');
select pg_temp.chk('new: stop index out of range',          'select public.driver_confirm_stop(720003, 3, ''arrived'', null, 51.50, -0.10, 10)', 'STOP_NOT_FOUND');
select pg_temp.chk('new: invalid status',                   'select public.driver_confirm_stop(720003, 0, ''pending'', null, 51.50, -0.10, 10)', 'INVALID_STATUS');
-- NEW NATIVE BUILD: fix time as the action time.
select pg_temp.sub(4);
select pg_temp.chk('new native: Arrive with fix taken 30 s ago', format('select public.driver_confirm_stop(720004, 0, ''arrived'', %L, 51.5001, -0.1001, 8)', now() - interval '30 seconds'), null);
select pg_temp.chk('new native: Delivered dated 3 days ago (accepted, clamped to 12 h)', format('select public.driver_confirm_stop(720004, 0, ''completed'', %L, 51.5001, -0.1001, 8)', now() - interval '3 days'), null);
-- Evidence variants.
select pg_temp.sub(5);
select pg_temp.chk('new: no fix, own fresh GPS point at the stop', 'select public.driver_confirm_stop(720005, 0, ''arrived'', null)', null);
select pg_temp.chk('new: fix with unknown accuracy (recorded)', 'select public.driver_confirm_stop(720005, 0, ''completed'', null, 51.50, -0.10, null)', null);
select pg_temp.chk('new: latitude without longitude',          'select public.driver_confirm_stop(720005, 1, ''arrived'', null, 51.50, null, 10)', 'INVALID_POSITION');
select pg_temp.chk('new: negative accuracy',                   'select public.driver_confirm_stop(720005, 1, ''arrived'', null, 51.50, -0.10, -1)', 'INVALID_POSITION');
select pg_temp.chk('new: Arrive dated tomorrow (clamped to now)', format('select public.driver_confirm_stop(720005, 1, ''arrived'', %L, 51.50, -0.10, 10)', now() + interval '1 day'), null);
select pg_temp.chk('new: repeated Arrive is a no-op (keeps first evidence)', 'select public.driver_confirm_stop(720005, 1, ''arrived'', null, 51.90, -0.90, 99)', null);
select pg_temp.sub(8);
select pg_temp.chk('new: no fix and no own GPS (company B driver is at P)', 'select public.driver_confirm_stop(720008, 0, ''arrived'', null)', null);
-- Tenant isolation / roles.
select pg_temp.sub(6);
select pg_temp.chk('other company: new entry point on company A job', 'select public.driver_confirm_stop(720004, 0, ''arrived'', null, 51.50, -0.10, 5)', 'JOB_NOT_FOUND');
select pg_temp.chk('other company: old entry point on company A job', 'select public.driver_mark_stop(p_job_id => 720001, p_stop_index => 1, p_status => ''arrived'', p_at => null)', 'JOB_NOT_FOUND');
select pg_temp.chk('other company: own job works',                   'select public.driver_confirm_stop(720006, 0, ''arrived'', null, 51.50, -0.10, 5)', null);
select pg_temp.chk('driver cannot call the location rule directly',
  'select public.driver_stop_location_check(720006, ''00000000-0000-4000-a000-0000000000b6'', ''{}'', now(), null, null, null)', 'permission denied for function driver_stop_location_check');
select pg_temp.sub(7);
select pg_temp.chk('office admin is not a driver',                   'select public.driver_confirm_stop(720006, 0, ''arrived'', null, 51.50, -0.10, 5)', 'NOT_A_DRIVER');
reset role;
set local role anon;
select pg_temp.chk('anonymous caller refused', 'select public.driver_confirm_stop(720006, 0, ''arrived'', null, 51.50, -0.10, 5)', 'permission denied for function driver_confirm_stop');
reset role;

-- Stored results.
create function pg_temp.st(j integer) returns text language sql as $$ select stops::text from public.jobs where id = j $$;
insert into cmp_result select 'old Web: stored exactly as before (server time, no evidence keys)',
  pg_temp.s(720001, 0, 'status') = 'completed' and pg_temp.s(720001, 1, 'status') = 'completed'
  and pg_temp.s(720001, 0, 'arrived_at')::timestamptz = (select now from t0)
  and pg_temp.st(720001) not like '%location%', pg_temp.st(720001);
insert into cmp_result select 'old native: tap time kept (legacy 3-day rule unchanged)',
  pg_temp.s(720002, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '2 days'
  and pg_temp.s(720002, 0, 'completed_at')::timestamptz = (select now from t0) - interval '1 hour', pg_temp.st(720002);
insert into cmp_result select 'new Web: arrival evidence stored (device, ok, distance, accuracy)',
  pg_temp.s(720003, 0, 'arrived_location_check') = 'ok' and pg_temp.s(720003, 0, 'arrived_location_source') = 'device'
  and pg_temp.s(720003, 0, 'arrived_lat')::numeric = 51.5002 and pg_temp.s(720003, 0, 'arrived_accuracy_m')::numeric = 12
  and pg_temp.s(720003, 0, 'arrived_distance_m')::numeric between 20 and 30
  and pg_temp.s(720003, 0, 'arrived_at')::timestamptz = (select now from t0), pg_temp.st(720003);
insert into cmp_result select 'new Web: delivery evidence stored (ok)',
  pg_temp.s(720003, 0, 'completed_location_check') = 'ok' and pg_temp.s(720003, 0, 'completed_accuracy_m')::numeric = 15, '';
insert into cmp_result select 'new: far delivery recorded as NOT_AT_STOP with distance',
  pg_temp.s(720003, 1, 'status') = 'completed' and pg_temp.s(720003, 1, 'completed_location_check') = 'NOT_AT_STOP'
  and pg_temp.s(720003, 1, 'completed_distance_m')::numeric between 5000 and 6000, pg_temp.s(720003, 1, 'completed_distance_m');
insert into cmp_result select 'new: stop without map position recorded as STOP_NOT_LOCATED (arrive and deliver)',
  pg_temp.s(720003, 2, 'arrived_location_check') = 'STOP_NOT_LOCATED' and pg_temp.s(720003, 2, 'completed_location_check') = 'STOP_NOT_LOCATED'
  and pg_temp.s(720003, 2, 'completed_location_source') = 'none', '';
insert into cmp_result select 'new: job completed with POD after all stops',
  status = 'completed' and pod_status = 'signed', status::text from public.jobs where id = 720003;
insert into cmp_result select 'new native: fix time used as action time',
  pg_temp.s(720004, 0, 'arrived_at')::timestamptz = (select now from t0) - interval '30 seconds'
  and pg_temp.s(720004, 0, 'arrived_location_check') = 'ok', pg_temp.s(720004, 0, 'arrived_at');
insert into cmp_result select 'new client: 3-day-old time no longer allowed (clamped to 12 h)',
  pg_temp.s(720004, 0, 'completed_at')::timestamptz = (select now from t0) - interval '12 hours', pg_temp.s(720004, 0, 'completed_at');
insert into cmp_result select 'new: own GPS track used when no fix is sent',
  pg_temp.s(720005, 0, 'arrived_location_source') = 'gps_track' and pg_temp.s(720005, 0, 'arrived_location_check') = 'ok', '';
insert into cmp_result select 'new: unknown accuracy recorded as LOCATION_INACCURATE',
  pg_temp.s(720005, 0, 'completed_location_check') = 'LOCATION_INACCURATE' and pg_temp.s(720005, 0, 'completed_accuracy_m') is null, '';
insert into cmp_result select 'new: future time clamped; repeated Arrive kept first evidence',
  pg_temp.s(720005, 1, 'arrived_at')::timestamptz = (select now from t0) and pg_temp.s(720005, 1, 'arrived_lat')::numeric = 51.50
  and pg_temp.s(720005, 1, 'arrived_accuracy_m')::numeric = 10, pg_temp.st(720005);
insert into cmp_result select 'new: another driver''s GPS is not evidence (LOCATION_REQUIRED recorded)',
  pg_temp.s(720008, 0, 'arrived_location_check') = 'LOCATION_REQUIRED' and pg_temp.s(720008, 0, 'arrived_location_source') = 'none', pg_temp.st(720008);
insert into cmp_result select 'other company job untouched by company A calls; company A jobs untouched by company B',
  pg_temp.s(720006, 0, 'status') = 'arrived' and pg_temp.s(720004, 0, 'status') = 'completed' and pg_temp.s(720001, 1, 'status') = 'completed', '';
insert into cmp_result select 'refused calls changed nothing (cancelled job still pending)', pg_temp.s(720010, 0, 'status') = 'pending', '';

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from cmp_result;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from cmp_result;
do $$ begin
  if exists (select 1 from cmp_result where not pass) then raise exception 'stop_location_compat: FAILED'; end if;
end $$;
rollback;
