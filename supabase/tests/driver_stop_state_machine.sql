-- Regression: stops move in order (pending -> arrived -> completed), a
-- completed stop is final, a job completes only when every stop is completed,
-- through both entry points (driver_mark_stop, driver_update_stop). Other
-- companies and non-drivers are refused; completed jobs are untouched. Rolled back.
-- Needs a database built from supabase/migrations, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/driver_stop_state_machine.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000e1', 'Stops A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000e2', 'Stops B', 'starter', 'trial', now() + interval '14 days');
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-0000000000e1', 'driver-a@stops.test'),
  ('00000000-0000-4000-b000-0000000000e2', 'admin-a@stops.test'),
  ('00000000-0000-4000-b000-0000000000e3', 'driver-b@stops.test');
insert into public.users (id, email, name, role, organization_id) values
  ('00000000-0000-4000-b000-0000000000e1', 'driver-a@stops.test', 'Driver A', 'driver', '00000000-0000-4000-a000-0000000000e1'),
  ('00000000-0000-4000-b000-0000000000e2', 'admin-a@stops.test',  'Admin A',  'admin',  '00000000-0000-4000-a000-0000000000e1'),
  ('00000000-0000-4000-b000-0000000000e3', 'driver-b@stops.test', 'Driver B', 'driver', '00000000-0000-4000-a000-0000000000e2')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) values
  (670001, 'Driver A', '00000000-0000-4000-b000-0000000000e1', '00000000-0000-4000-a000-0000000000e1'),
  (670002, 'Driver B', '00000000-0000-4000-b000-0000000000e3', '00000000-0000-4000-a000-0000000000e2');

create temp table three_stops as select
  '[{"label":"S1","address":"1 A St","status":"pending"},
    {"label":"S2","address":"2 A St","status":"pending"},
    {"label":"S3","address":"3 A St","status":"pending"}]'::jsonb as v;
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, stops) values
  (670001, 'STOP-A1', 'A', 'assigned',    '00000000-0000-4000-a000-0000000000e1', 670001, (select v from three_stops)),
  (670002, 'STOP-A2', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000e1', 670001, (select v from three_stops)),
  (670003, 'STOP-B1', 'B', 'in_progress', '00000000-0000-4000-a000-0000000000e2', 670002, (select v from three_stops)),
  (670005, 'STOP-A5', 'A', 'in_progress', '00000000-0000-4000-a000-0000000000e1', 670001,
   '[{"label":"G1","lat":51.50,"lng":-0.10,"status":"pending"},{"label":"G2","lat":51.60,"lng":-0.20,"status":"pending"}]');
-- An existing delivered job (as in production): must stay readable and unchanged.
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, stops, completed_at,
                         pod_status, pod_signature, pod_notes, pod_captured_at) values
  (670004, 'STOP-A4', 'A', 'completed', '00000000-0000-4000-a000-0000000000e1', 670001,
   '[{"label":"D1","status":"completed","arrived_at":"2026-09-01T10:00:00Z","completed_at":"2026-09-01T10:05:00Z"},
     {"label":"D2","status":"completed","arrived_at":"2026-09-01T11:00:00Z","completed_at":"2026-09-01T11:05:00Z"}]',
   '2026-09-01T12:00:00Z', 'signed', 'data:image/png;base64,AA==', 'Received by: Jo', '2026-09-01T12:00:00Z');
create temp table before_m as select md5(row(j.*)::text) h from public.jobs j where id = 670004;

create temp table sm_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on sm_result to authenticated, anon;

-- Runs one statement as the current role; expect = null means it must succeed,
-- otherwise it must be refused with exactly that error.
create function pg_temp.chk(p_name text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into sm_result values (p_name, p_expect is null, case when p_expect is null then 'ok' else 'accepted' end);
exception when others then
  insert into sm_result values (p_name, sqlerrm = p_expect, sqlerrm);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated;

create function pg_temp.stop_status(p_job integer, p_idx integer) returns text language sql as
  $$ select stops -> p_idx ->> 'status' from public.jobs where id = p_job $$;

-- Grants unchanged.
insert into sm_result select 'anon cannot call driver_mark_stop',
  not has_function_privilege('anon', 'public.driver_mark_stop(integer, integer, text, timestamptz)', 'execute'), '';
insert into sm_result select 'anon cannot call driver_update_stop',
  not has_function_privilege('anon', 'public.driver_update_stop(integer, integer, text)', 'execute'), '';
insert into sm_result select 'authenticated can call both',
  has_function_privilege('authenticated', 'public.driver_mark_stop(integer, integer, text, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.driver_update_stop(integer, integer, text)', 'execute'), '';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000e1', true);

-- Same sequence through each entry point: job 670001 via driver_mark_stop,
-- job 670002 via driver_update_stop. Stop N in the test list = index N-1.
do $$
declare
  e record;
  sig constant text := $s$'data:image/png;base64,AA=='$s$;
begin
  for e in select * from (values
      ('mark',   670001, 'select public.driver_mark_stop(%s, %s, %L, null)'),
      ('update', 670002, 'select public.driver_update_stop(%s, %s, %L)')) v(tag, job, tpl)
  loop
    perform pg_temp.chk(e.tag || ' E: stop 2 arrived before stop 1 completed',   format(e.tpl, e.job, 1, 'arrived'),   'STOP_ORDER');
    perform pg_temp.chk(e.tag || ' E: stop 2 completed before stop 1 completed', format(e.tpl, e.job, 1, 'completed'), 'STOP_ORDER');
    perform pg_temp.chk(e.tag || ' A: stop 1 arrived',                           format(e.tpl, e.job, 0, 'arrived'),   null);
    perform pg_temp.chk(e.tag || ' A2: stop 1 arrived again (replay) is a no-op', format(e.tpl, e.job, 0, 'arrived'),  null);
    perform pg_temp.chk(e.tag || ' E: stop 2 arrived while stop 1 only arrived', format(e.tpl, e.job, 1, 'arrived'),   'STOP_ORDER');
    perform pg_temp.chk(e.tag || ' I: complete job with stops pending',
      format('select public.driver_complete_job(%s, null, %s, null, null, null, null, null)', e.job, sig), 'STOPS_PENDING');
    perform pg_temp.chk(e.tag || ' B: stop 1 completed',                         format(e.tpl, e.job, 0, 'completed'), null);
    perform pg_temp.chk(e.tag || ' G: completed stop 1 back to arrived',         format(e.tpl, e.job, 0, 'arrived'),   'STOP_ALREADY_COMPLETED');
    perform pg_temp.chk(e.tag || ' H: completed stop 1 completed again',         format(e.tpl, e.job, 0, 'completed'), 'STOP_ALREADY_COMPLETED');
    perform pg_temp.chk(e.tag || ' F: stop 3 arrived before stop 2 completed',   format(e.tpl, e.job, 2, 'arrived'),   'STOP_ORDER');
    perform pg_temp.chk(e.tag || ' C: stop 2 arrived after stop 1 completed',    format(e.tpl, e.job, 1, 'arrived'),   null);
    perform pg_temp.chk(e.tag || ' F: stop 3 completed before stop 2 completed', format(e.tpl, e.job, 2, 'completed'), 'STOP_ORDER');
    perform pg_temp.chk(e.tag || ' D: stop 2 completed after stop 1 completed',  format(e.tpl, e.job, 1, 'completed'), null);
    perform pg_temp.chk(e.tag || ' I: complete job with stop 3 pending',
      format('select public.driver_complete_job(%s, null, %s, null, null, null, null, null)', e.job, sig), 'STOPS_PENDING');
    perform pg_temp.chk(e.tag || ' stop 3 delivered directly from pending',      format(e.tpl, e.job, 2, 'completed'), null);
    perform pg_temp.chk(e.tag || ' invalid status refused',                      format(e.tpl, e.job, 2, 'pending'),   'INVALID_STATUS');
    perform pg_temp.chk(e.tag || ' stop index out of range refused',             format(e.tpl, e.job, 3, 'arrived'),   'STOP_NOT_FOUND');
    perform pg_temp.chk(e.tag || ' J: complete job with all stops completed',
      format('select public.driver_complete_job(%s, null, %s, %L, null, null, null, null)', e.job, sig, 'Jo'), null);
    perform pg_temp.chk(e.tag || ' J2: completion replay is a no-op',
      format('select public.driver_complete_job(%s, null, %s, null, null, null, null, null)', e.job, sig), null);
    perform pg_temp.chk(e.tag || ' completed stop on completed job still final', format(e.tpl, e.job, 0, 'arrived'),   'STOP_ALREADY_COMPLETED');
    -- K: another company's job, both entry points and completion.
    perform pg_temp.chk(e.tag || ' K: other company job refused',                format(e.tpl, 670003, 0, 'arrived'),  'JOB_NOT_FOUND');
  end loop;
end $$;
select pg_temp.chk('K: other company job completion refused',
  'select public.driver_complete_job(670003, null, ''data:image/png;base64,AA=='', null, null, null, null, null)', 'JOB_NOT_FOUND');
select pg_temp.chk('M: completed job stop cannot be reopened', 'select public.driver_mark_stop(670004, 1, ''arrived'', null)', 'STOP_ALREADY_COMPLETED');
select pg_temp.chk('M: completed job completion replay', 'select public.driver_complete_job(670004, null, ''data:image/png;base64,BB=='', ''X'', null, null, null, null)', null);
insert into sm_result select 'M: driver can still read the completed job and POD',
  count(*) = 1 and bool_and(pod_signature = 'data:image/png;base64,AA=='), count(*)::text from public.jobs where id = 670004;
reset role;

-- K: the other company's driver cannot touch company A's job either.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000e3', true);
select pg_temp.chk('K: driver B mark_stop on company A job',   'select public.driver_mark_stop(670002, 0, ''arrived'', null)', 'JOB_NOT_FOUND');
select pg_temp.chk('K: driver B update_stop on company A job', 'select public.driver_update_stop(670002, 0, ''arrived'')', 'JOB_NOT_FOUND');
reset role;

-- L: a signed-in non-driver (office admin) is refused by every entry point.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000e2', true);
select pg_temp.chk('L: admin driver_mark_stop refused',    'select public.driver_mark_stop(670005, 0, ''arrived'', null)', 'NOT_A_DRIVER');
select pg_temp.chk('L: admin driver_update_stop refused',  'select public.driver_update_stop(670005, 0, ''arrived'')', 'NOT_A_DRIVER');
select pg_temp.chk('L: admin driver_complete_job refused', 'select public.driver_complete_job(670005, null, ''data:image/png;base64,AA=='', null, null, null, null, null)', 'NOT_A_DRIVER');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.chk('L: anon driver_mark_stop refused', 'select public.driver_mark_stop(670005, 0, ''arrived'', null)', 'permission denied for function driver_mark_stop');
reset role;

-- Stored results.
do $$
declare j integer;
begin
  foreach j in array array[670001, 670002] loop
    insert into sm_result select format('job %s: completed with all stops completed', j),
      status = 'completed' and pod_status = 'signed'
      and (select bool_and(s->>'status' = 'completed' and s ? 'arrived_at' and s ? 'completed_at') from jsonb_array_elements(stops) s),
      format('%s %s', status, stops::text) from public.jobs where id = j;
  end loop;
end $$;
insert into sm_result select 'G/H: stop 1 kept its first delivery time',
  (select (stops->0->>'completed_at')::timestamptz <= (stops->1->>'arrived_at')::timestamptz from public.jobs where id = 670001), '';
insert into sm_result select 'K: other company job untouched', status = 'in_progress' and stops = (select v from three_stops), status::text
  from public.jobs where id = 670003;
insert into sm_result select 'L: admin/anon calls changed nothing', stops -> 0 ->> 'status' = 'pending', stops::text from public.jobs where id = 670005;
insert into sm_result select 'M: completed job row unchanged', md5(row(j.*)::text) = (select h from before_m), '' from public.jobs j where id = 670004;

-- Geofence arrival respects the order.
select public.evaluate_geofences(670001, '00000000-0000-4000-a000-0000000000e1', 51.60, -0.20, 10, now());
insert into sm_result select 'geofence at stop 2 while stop 1 pending: no auto-arrival',
  pg_temp.stop_status(670005, 1) = 'pending', pg_temp.stop_status(670005, 1);
select public.evaluate_geofences(670001, '00000000-0000-4000-a000-0000000000e1', 51.50, -0.10, 10, now());
insert into sm_result select 'geofence at stop 1 (next stop): auto-arrival',
  pg_temp.stop_status(670005, 0) = 'arrived', pg_temp.stop_status(670005, 0);

-- Office admin can still edit stops directly (unchanged).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000e2', true);
update public.jobs set stops = jsonb_set(stops, '{1,status}', '"completed"') where id = 670005;
reset role;
insert into sm_result select 'office admin stop edit unchanged', pg_temp.stop_status(670005, 1) = 'completed', '';

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from sm_result;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from sm_result;
do $$ begin
  if exists (select 1 from sm_result where not pass) then raise exception 'driver_stop_state_machine: FAILED'; end if;
end $$;
rollback;
