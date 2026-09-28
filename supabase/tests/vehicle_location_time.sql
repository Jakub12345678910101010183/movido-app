-- Regression: vehicles.location_updated_at records when the vehicle's position
-- was recorded, so the office map can tell live from stale. Rolled back.
-- Needs a database built from supabase/migrations, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/vehicle_location_time.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at)
values ('00000000-0000-4000-a000-00000000001a', 'Fresh Org', 'starter', 'trialing', now() + interval '14 days');
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-000000000011', 'driver@fresh.test'),
  ('00000000-0000-4000-b000-000000000012', 'admin@fresh.test');
insert into public.users (id, email, name, role, organization_id) values
  ('00000000-0000-4000-b000-000000000011', 'driver@fresh.test', 'Fresh Driver', 'driver', '00000000-0000-4000-a000-00000000001a'),
  ('00000000-0000-4000-b000-000000000012', 'admin@fresh.test',  'Fresh Admin',  'admin',  '00000000-0000-4000-a000-00000000001a')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.vehicles (id, vehicle_id, organization_id)
values (990011, 'FRESH-01', '00000000-0000-4000-a000-00000000001a');
insert into public.drivers (id, name, user_id, vehicle_id, organization_id)
values (990011, 'Fresh Driver', '00000000-0000-4000-b000-000000000011', 990011, '00000000-0000-4000-a000-00000000001a');

create temp table fresh_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on fresh_result to authenticated;

insert into fresh_result
select 'vehicle without a position has no position time', location_updated_at is null, coalesce(location_updated_at::text, 'null')
  from public.vehicles where id = 990011;

-- GPS report stamps the vehicle with the point's own time.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000011', true);
select public.driver_report_locations(jsonb_build_array(jsonb_build_object(
  'lat', 52.3, 'lng', -0.9, 'accuracy_m', 10, 'recorded_at', now() - interval '30 minutes')));
reset role;
insert into fresh_result
select 'report sets vehicle position and point time',
       location_lat = 52.3 and abs(extract(epoch from (location_updated_at - (now() - interval '30 minutes')))) < 1,
       format('%s,%s at %s', location_lat, location_lng, location_updated_at)
  from public.vehicles where id = 990011;

-- An older backlog point does not move the vehicle back in time.
delete from public.driver_positions where driver_id = 990011;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000011', true);
select public.driver_report_locations(jsonb_build_array(jsonb_build_object(
  'lat', 51.0, 'lng', -2.0, 'accuracy_m', 10, 'recorded_at', now() - interval '3 hours')));
reset role;
insert into fresh_result
select 'older point does not replace newer vehicle position', location_lat = 52.3, format('%s,%s', location_lat, location_lng)
  from public.vehicles where id = 990011;

-- Office admin cannot fake freshness, and a manual position is not live.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000012', true);
update public.vehicles set location_updated_at = now() + interval '1 day' where id = 990011;
reset role;
insert into fresh_result
select 'admin cannot set location_updated_at', location_updated_at <= now(), location_updated_at::text
  from public.vehicles where id = 990011;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000012', true);
update public.vehicles set make = 'Volvo' where id = 990011;
reset role;
insert into fresh_result
select 'unrelated admin edit keeps the position time', location_updated_at is not null and make = 'Volvo', coalesce(location_updated_at::text, 'null')
  from public.vehicles where id = 990011;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000012', true);
update public.vehicles set location_lat = 53.0, location_lng = -1.5 where id = 990011;
reset role;
insert into fresh_result
select 'manual position edit is marked not live', location_updated_at is null, coalesce(location_updated_at::text, 'null')
  from public.vehicles where id = 990011;

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from fresh_result;
do $$ begin
  if exists (select 1 from fresh_result where not pass) then raise exception 'vehicle_location_time: FAILED'; end if;
end $$;
rollback;
