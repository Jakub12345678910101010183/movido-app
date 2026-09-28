-- Regression: a driver must not be able to set their own current location by
-- updating public.drivers directly; only driver_report_locations may move it.
-- Runs in a transaction that is rolled back. Needs a database built from
-- supabase/migrations (e.g. a local Postgres), never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/driver_location_guard.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at)
values ('00000000-0000-4000-a000-00000000000a', 'Guard Org A', 'starter', 'trialing', now() + interval '14 days'),
       ('00000000-0000-4000-a000-00000000000b', 'Guard Org B', 'starter', 'trialing', now() + interval '14 days');
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-000000000001', 'driver-a@guard.test'),
  ('00000000-0000-4000-b000-000000000002', 'admin-a@guard.test'),
  ('00000000-0000-4000-b000-000000000003', 'admin-b@guard.test');
insert into public.users (id, email, name, role, organization_id) values
  ('00000000-0000-4000-b000-000000000001', 'driver-a@guard.test', 'Driver A', 'driver', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-000000000002', 'admin-a@guard.test',  'Admin A',  'admin',  '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-000000000003', 'admin-b@guard.test',  'Admin B',  'admin',  '00000000-0000-4000-a000-00000000000b')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.vehicles (id, vehicle_id, organization_id) values (990001, 'GUARD-01', '00000000-0000-4000-a000-00000000000a');
insert into public.drivers (id, name, user_id, vehicle_id, organization_id, location_lat, location_lng, location_updated_at, heading, speed)
values (990001, 'Driver A', '00000000-0000-4000-b000-000000000001', 990001, '00000000-0000-4000-a000-00000000000a',
        52.2, -0.9, now() - interval '1 hour', 10, 5);

create temp table guard_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on guard_result to authenticated;

-- 1. Driver tries to move themselves to Westminster by a direct table update.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000001', true);
update public.drivers set location_lat = 51.5007, location_lng = -0.1246, location_updated_at = now() + interval '1 day',
       heading = 270, speed = 99 where id = 990001;
insert into guard_result
select 'driver direct location update is ignored',
       location_lat = 52.2 and location_lng = -0.9 and location_updated_at < now() and heading = 10 and speed = 5,
       format('%s,%s at %s heading %s speed %s', location_lat, location_lng, location_updated_at, heading, speed)
  from public.drivers where id = 990001;

-- 2. Driver can still register a push token (native app does this directly).
update public.drivers set push_token = 'ExponentPushToken[guard-test]' where id = 990001;
insert into guard_result
select 'driver can still set push_token', push_token = 'ExponentPushToken[guard-test]', push_token
  from public.drivers where id = 990001;

-- 3. Legitimate GPS report moves the driver and the vehicle.
insert into guard_result
select 'driver_report_locations still works', (r->>'stored')::int = 1, r::text
  from (select public.driver_report_locations(jsonb_build_array(jsonb_build_object(
          'lat', 52.25, 'lng', -0.88, 'accuracy_m', 8, 'recorded_at', now() - interval '1 minute'))) r) x;
insert into guard_result
select 'reported position is the current location', location_lat = 52.25 and location_lng = -0.88,
       format('%s,%s', location_lat, location_lng)
  from public.drivers where id = 990001;

-- 4. Office admin of the same company can still edit the driver.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000002', true);
update public.drivers set phone = '+44 7700 900000' where id = 990001;
insert into guard_result
select 'office admin can still edit driver', phone = '+44 7700 900000', phone from public.drivers where id = 990001;

-- 5. Another company's admin can neither see nor change the driver.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000003', true);
update public.drivers set location_lat = 1, location_lng = 1 where id = 990001;
insert into guard_result
select 'other company admin cannot see driver', count(*) = 0, count(*)::text from public.drivers where id = 990001;
reset role;
insert into guard_result
select 'other company admin cannot move driver', location_lat = 52.25, format('%s,%s', location_lat, location_lng)
  from public.drivers where id = 990001;
insert into guard_result
select 'vehicle position follows the report', location_lat = 52.25 and location_lng = -0.88,
       format('%s,%s', location_lat, location_lng)
  from public.vehicles where id = 990001;

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from guard_result;
do $$ begin
  if exists (select 1 from guard_result where not pass) then raise exception 'driver_location_guard: FAILED'; end if;
end $$;
rollback;
