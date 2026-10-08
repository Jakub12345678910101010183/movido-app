-- Regression for 20261008150000_one_in_progress_job.sql (run on a local
-- database with that migration applied; never production). Rolled back.
--   psql -v ON_ERROR_STOP=1 -f supabase/pending/one_in_progress_job_test.sql
-- Concurrency (two sessions) and the fail-closed precheck are rehearsed
-- separately (they need committed data / a failing migration run).
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000c1', 'One A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000c2', 'One B', 'starter', 'trial', now() + interval '14 days');
-- Users 1, 2, 5 drivers (company A), 3 driver (company B), 4 admin (company A).
create temp table ppl as
  select n, ('00000000-0000-4000-b000-0000000009' || lpad(n::text, 2, '0'))::uuid uid,
         case when n = 3 then '00000000-0000-4000-a000-0000000000c2' else '00000000-0000-4000-a000-0000000000c1' end::uuid org,
         case when n = 4 then 'admin' else 'driver' end role
    from generate_series(1, 5) n;
insert into auth.users (id, email) select uid, 'one' || n || '@one.test' from ppl;
insert into public.users (id, email, name, role, organization_id) select uid, 'one' || n || '@one.test', 'One ' || n, role, org from ppl
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) select 720000 + n, 'One ' || n, uid, org from ppl where role = 'driver';

-- Sites: P (51.50,-0.10) Q (51.60,-0.20) X (51.80,-0.50) Y (51.90,-0.60) W (52.10,-0.80) V (52.20,-0.90)
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, pickup_lat, pickup_lng, stops) values
  (720001, 'ONE-1', 'A', 'assigned', '00000000-0000-4000-a000-0000000000c1', 720001, 51.80, -0.50, '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720002, 'ONE-2', 'A', 'assigned', '00000000-0000-4000-a000-0000000000c1', 720001, 51.90, -0.60, '[{"label":"Q","lat":51.60,"lng":-0.20,"status":"pending"}]'),
  (720010, 'ONE-10', 'A', 'assigned', '00000000-0000-4000-a000-0000000000c1', 720002, 52.10, -0.80, '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720020, 'ONE-20', 'B', 'assigned', '00000000-0000-4000-a000-0000000000c2', 720003, null, null, '[{"label":"P","lat":51.50,"lng":-0.10,"status":"pending"}]'),
  (720030, 'ONE-30', 'A', 'assigned', '00000000-0000-4000-a000-0000000000c1', 720005, 52.20, -0.90, '[]'),
  (720031, 'ONE-31', 'A', 'assigned', '00000000-0000-4000-a000-0000000000c1', 720005, 52.20, -0.90, '[]');

create temp table one_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on one_result to authenticated, anon;
create function pg_temp.chk(p_name text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into one_result values (p_name, p_expect is null, case when p_expect is null then 'ok' else 'accepted' end);
exception when others then
  insert into one_result values (p_name, sqlerrm = p_expect, sqlerrm);
end $$;
-- Refused with any error (records the message).
create function pg_temp.refused(p_name text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into one_result values (p_name, false, 'accepted');
exception when others then
  insert into one_result values (p_name, true, sqlerrm);
end $$;
create function pg_temp.sub(n integer) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000009' || lpad(n::text, 2, '0'), true) $$;
create function pg_temp.pt(lat double precision, lng double precision, mins integer) returns jsonb language sql as
  $$ select jsonb_build_array(jsonb_build_object('lat', lat, 'lng', lng, 'accuracy_m', 5, 'recorded_at', now() - make_interval(mins => mins))) $$;
grant execute on function pg_temp.chk(text, text, text), pg_temp.refused(text, text), pg_temp.sub(integer), pg_temp.pt(double precision, double precision, integer) to authenticated, anon;

insert into one_result select 'index exists: one in-progress job per driver',
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'jobs_one_in_progress_per_driver'
          and indexdef ilike '%unique%(driver_id)%status = ''in_progress''%driver_id is not null%'), '';

set local role authenticated;
select pg_temp.sub(1);
select pg_temp.chk('start job 1', 'select public.driver_start_job(720001)', null);
select pg_temp.chk('start job 1 again (idempotent)', 'select public.driver_start_job(720001)', null);
select pg_temp.chk('start job 2 while job 1 in progress', 'select public.driver_start_job(720002)', 'ANOTHER_JOB_IN_PROGRESS');
select pg_temp.chk('confirm a stop on job 2 (would start it)', 'select public.driver_confirm_stop(720002, 0, ''arrived'', null, 51.60, -0.20, 5)', 'ANOTHER_JOB_IN_PROGRESS');
-- GPS at job 2's pickup (would auto-start it), then at job 2's stop, then at job 1's stop.
select pg_temp.chk('GPS at job 2 pickup: batch stored, no error', 'select public.driver_report_locations(pg_temp.pt(51.90, -0.60, 30))', null);
select pg_temp.chk('GPS at job 2 stop: batch stored', 'select public.driver_report_locations(pg_temp.pt(51.60, -0.20, 25))', null);
select pg_temp.chk('GPS at job 1 stop: batch stored', 'select public.driver_report_locations(pg_temp.pt(51.50, -0.10, 20))', null);
select pg_temp.chk('single-point report while job 1 in progress', 'select public.driver_report_location(51.70, -0.30, null, null, 5)', null);
select pg_temp.sub(2);
select pg_temp.chk('driver 2 (no job in progress): GPS away from pickup', 'select public.driver_report_locations(pg_temp.pt(51.40, -0.40, 30))', null);
select pg_temp.chk('driver 2: GPS at job 10 pickup (auto-start allowed)', 'select public.driver_report_locations(pg_temp.pt(52.10, -0.80, 20))', null);
select pg_temp.chk('driver 2: next GPS point', 'select public.driver_report_locations(pg_temp.pt(52.11, -0.81, 10))', null);
select pg_temp.sub(5);
select pg_temp.chk('driver 5: GPS at a pickup shared by two jobs', 'select public.driver_report_locations(pg_temp.pt(52.20, -0.90, 10))', null);
select pg_temp.sub(3);
select pg_temp.chk('other company driver starts own job', 'select public.driver_start_job(720020)', null);
select pg_temp.chk('other company driver cannot start company A job', 'select public.driver_start_job(720002)', 'JOB_NOT_FOUND');
select pg_temp.sub(4);
select pg_temp.refused('Office edit: second job in progress for driver 1', 'update public.jobs set status = ''in_progress'' where id = 720002');
reset role;

-- Stored results.
insert into one_result select 'job 2 still assigned (pickup GPS did not start it)', (select status = 'assigned' from public.jobs where id = 720002), (select status::text from public.jobs where id = 720002);
insert into one_result select 'job 2 stop not marked (job not started)', (select stops->0->>'status' = 'pending' from public.jobs where id = 720002), (select stops->0->>'status' from public.jobs where id = 720002);
insert into one_result select 'job 1 stop arrived by geofence (job in progress)', (select stops->0->>'status' = 'arrived' and stops->0->>'arrived_location_source' = 'geofence' from public.jobs where id = 720001), (select stops->0->>'status' from public.jobs where id = 720001);
insert into one_result select 'driver 1 GPS points all tagged to job 1',
  (select count(*) = 4 and bool_and(job_id = 720001) from public.driver_positions where driver_id = 720001),
  (select string_agg(coalesce(job_id::text, 'null'), ',' order by recorded_at) from public.driver_positions where driver_id = 720001);
insert into one_result select 'driver 2 GPS before start: job NULL (no fallback to assigned job)',
  (select job_id is null from public.driver_positions where driver_id = 720002 order by recorded_at limit 1),
  (select string_agg(coalesce(job_id::text, 'null'), ',' order by recorded_at) from public.driver_positions where driver_id = 720002);
insert into one_result select 'driver 2 pickup arrival started job 10; following point tagged to it',
  (select status = 'in_progress' from public.jobs where id = 720010)
  and (select job_id = 720010 from public.driver_positions where driver_id = 720002 order by recorded_at desc limit 1),
  (select status::text from public.jobs where id = 720010);
insert into one_result select 'driver 5: shared pickup started exactly one job, no error',
  (select count(*) = 1 from public.jobs where driver_id = 720005 and status = 'in_progress'),
  (select string_agg(id || ':' || status, ',' order by id) from public.jobs where driver_id = 720005);
insert into one_result select 'no geofence events for driver 1 job 2 (not started, another in progress)',
  not exists (select 1 from public.geofence_events where job_id = 720002), '';
insert into one_result select 'job 1 still the only in-progress job of driver 1',
  (select count(*) = 1 and min(id) = 720001 from public.jobs where driver_id = 720001 and status = 'in_progress'), '';
-- After the job in progress is finished, the next one starts.
update public.jobs set status = 'completed', completed_at = now() where id = 720001;
set local role authenticated;
select pg_temp.sub(1);
select pg_temp.chk('after job 1 completed, job 2 starts', 'select public.driver_start_job(720002)', null);
reset role;
insert into one_result select 'grants unchanged',
  has_function_privilege('authenticated', 'public.driver_start_job(integer)', 'execute')
  and not has_function_privilege('anon', 'public.driver_start_job(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.evaluate_geofences(integer, uuid, double precision, double precision, double precision, timestamptz)', 'execute')
  and (select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('driver_start_job', 'driver_confirm_stop', 'evaluate_geofences', 'driver_report_location', 'driver_report_locations')), '';

select case when pass then ' PASS ' else ' FAIL ' end || name || ' — ' || coalesce(detail, '') from one_result;
rollback;
