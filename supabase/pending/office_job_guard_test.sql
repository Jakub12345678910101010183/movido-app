-- Office job rules, POD read-only for the Office, job audit, POD photo delete. Rolled back.
-- Needs a database built from supabase/migrations + pending Stage 2 + F1 + office_job_guard, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/pending/office_job_guard_test.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000c1', 'Office A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000c2', 'Office B', 'starter', 'trial', now() + interval '14 days');
-- 1 = admin A, 2 = dispatcher A, 3 = driver A, 4 = admin B, 5 = driver B.
create temp table ppl as
  select n, ('00000000-0000-4000-b000-0000000009' || lpad(n::text, 2, '0'))::uuid uid,
         case when n in (4, 5) then '00000000-0000-4000-a000-0000000000c2' else '00000000-0000-4000-a000-0000000000c1' end::uuid org,
         case n when 1 then 'admin' when 2 then 'dispatcher' when 4 then 'admin' else 'driver' end role
    from generate_series(1, 5) n;
insert into auth.users (id, email) select uid, 'og' || n || '@og.test' from ppl;
insert into public.users (id, email, name, role, organization_id) select uid, 'og' || n || '@og.test', 'OG ' || n, role, org from ppl
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) values
  (700003, 'OG driver A', '00000000-0000-4000-b000-000000000903', '00000000-0000-4000-a000-0000000000c1'),
  (700005, 'OG driver B', '00000000-0000-4000-b000-000000000905', '00000000-0000-4000-a000-0000000000c2');
insert into public.vehicles (id, vehicle_id, type, organization_id) values
  (700201, 'OG-V1', 'hgv', '00000000-0000-4000-a000-0000000000c1'),
  (700202, 'OG-V2', 'hgv', '00000000-0000-4000-a000-0000000000c1');

create temp table t0 as select now() as now;
-- Stops: started = completed + arrived (with evidence), then pending.
create temp table st as select
  '{"label":"S1","address":"1 A St","lat":51.10,"lng":-1.0,"status":"completed","arrived_at":"2026-10-04T08:00:00Z","completed_at":"2026-10-04T08:10:00Z",
    "completed_lat":51.1,"completed_lng":-1.0,"completed_accuracy_m":5,"completed_distance_m":3,"completed_location_check":"ok","completed_location_source":"device"}'::jsonb s0,
  '{"label":"S2","address":"2 A St","lat":51.20,"lng":-1.0,"status":"arrived","arrived_at":"2026-10-04T09:00:00Z",
    "arrived_lat":51.2,"arrived_lng":-1.0,"arrived_accuracy_m":6,"arrived_distance_m":4,"arrived_location_check":"ok","arrived_location_source":"geofence"}'::jsonb s1,
  '{"label":"S3","address":"3 A St","lat":51.30,"lng":-1.0,"status":"pending","completed_at":null}'::jsonb s2;

insert into public.jobs (id, reference, customer, status, organization_id, driver_id, vehicle_id, stops, completed_at, pod_status, pod_photo_url, pod_signature, cancellation_reason) values
  (700101, 'OG-1', 'C', 'pending',     '00000000-0000-4000-a000-0000000000c1', null,   null,   '[{"label":"P1","address":"x","lat":51.5,"lng":-1.0,"status":"pending"}]', null, 'pending', null, null, null),
  (700102, 'OG-2', 'C', 'assigned',    '00000000-0000-4000-a000-0000000000c1', 700003, 700201, '[{"label":"G1","address":"g1","lat":53.0,"lng":-1.0,"status":"pending"},{"label":"G2","address":"g2","lat":53.1,"lng":-1.0,"status":"pending"}]', null, 'pending', null, null, null),
  (700103, 'OG-3', 'C', 'in_progress', '00000000-0000-4000-a000-0000000000c1', 700003, 700201, (select jsonb_build_array(s0, s1, s2) from st), null, 'pending', null, null, null),
  (700104, 'OG-4', 'C', 'completed',   '00000000-0000-4000-a000-0000000000c1', 700003, 700201, (select jsonb_build_array(s0) from st), now() - interval '1 day', 'photo', '00000000-0000-4000-a000-0000000000c1/700104/p.jpg', null, null),
  (700105, 'OG-5', 'C', 'cancelled',   '00000000-0000-4000-a000-0000000000c1', null,   null,   null, null, 'pending', null, null, null),
  (700106, 'OG-6', 'C', 'in_progress', '00000000-0000-4000-a000-0000000000c1', 700003, null,   null, null, 'pending', null, null, null),
  (700107, 'OG-7', 'C', 'assigned',    '00000000-0000-4000-a000-0000000000c1', 700003, null,   null, null, 'pending', null, null, null),
  (700108, 'OG-8', 'C', 'pending',     '00000000-0000-4000-a000-0000000000c1', null,   null,   null, null, 'pending', null, null, null),
  (700109, 'OG-9', 'C', 'assigned',    '00000000-0000-4000-a000-0000000000c1', 700003, null,   '[{"label":"D1","address":"d1","lat":52.0,"lng":-1.5,"status":"pending"}]', null, 'pending', null, null, null),
  (700110, 'OG-10','C', 'pending',     '00000000-0000-4000-a000-0000000000c1', null,   null,   null, null, 'pending', null, null, null),
  (700151, 'OGB-1','C', 'assigned',    '00000000-0000-4000-a000-0000000000c2', 700005, null,   null, null, 'pending', null, null, null);
insert into storage.objects (bucket_id, name) values
  ('pod-photos', '00000000-0000-4000-a000-0000000000c1/700104/p.jpg'),
  ('pod-photos', '00000000-0000-4000-a000-0000000000c1/700109/pod.jpg');
-- As on Supabase: signed-in users hold table privileges on storage.objects; policies decide.
grant select, insert, update, delete on storage.objects to authenticated;

create temp table r (name text, pass boolean, detail text) on commit drop;
grant insert, select on r to authenticated;
create temp table snap as select id, to_jsonb(j) - 'updated_at' row from public.jobs j where id between 700101 and 700151;

-- Run one statement as person n; returns 'ok' or the error text (a refused statement changes nothing).
create function pg_temp.t(n integer, q text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select uid::text from ppl where ppl.n = t.n), true);
  set local role authenticated;
  begin
    execute q;
    reset role;
    return 'ok';
  exception when others then
    reset role;
    return sqlerrm;
  end;
end $$;
create function pg_temp.rows(n integer, q text) returns integer language plpgsql as $$
declare c integer;
begin
  perform set_config('request.jwt.claim.sub', (select uid::text from ppl where ppl.n = rows.n), true);
  set local role authenticated;
  execute q; get diagnostics c = row_count;
  reset role;
  return c;
end $$;
create function pg_temp.j(i integer) returns jsonb language sql as $$ select to_jsonb(j) - 'updated_at' from public.jobs j where id = i $$;
create function pg_temp.unchanged(i integer) returns boolean language sql as $$ select pg_temp.j(i) = (select row from snap where id = i) $$;
create function pg_temp.naudit() returns bigint language sql as $$ select count(*) from public.audit_log where resource_type = 'job' $$;

-- Objects and grants.
insert into r select 'guard + audit triggers exist; jobs_driver_field_guard still present',
  (select count(*) from pg_trigger where tgrelid = 'public.jobs'::regclass and tgname in ('jobs_office_guard', 'jobs_office_audit', 'jobs_driver_field_guard')) = 3, '';
insert into r select 'guard/audit functions not callable by clients',
  not has_function_privilege('authenticated', 'public.jobs_office_guard()', 'execute') and not has_function_privilege('anon', 'public.jobs_office_audit()', 'execute')
  and not has_function_privilege('authenticated', 'public.jobs_office_audit()', 'execute'), '';
insert into r select 'no delete policy on pod-photos', not exists (select 1 from pg_policies where schemaname = 'storage' and cmd = 'DELETE' and qual like '%pod-photos%'), '';
insert into r select 'cancellation_reason column: text, nullable, existing rows NULL',
  (select data_type = 'text' and is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name = 'cancellation_reason'), '';

-- Stops (job 700103 in progress: S1 completed, S2 arrived, S3 pending).
create temp table a0 as select pg_temp.naudit() n;
insert into r select 'started stop edit rejected', x like 'STOP_HISTORY_LOCKED%' and pg_temp.unchanged(700103), x
  from (select pg_temp.t(1, $q$update public.jobs set stops = jsonb_set(stops, '{0,address}', '"moved"') where id = 700103$q$) x) q;
insert into r select 'started stop evidence removal rejected', x like 'STOP_HISTORY_LOCKED%' and pg_temp.unchanged(700103), x
  from (select pg_temp.t(2, $q$update public.jobs set stops = jsonb_set(stops, '{1}', (stops->1) - 'arrived_at' - 'arrived_lat') where id = 700103$q$) x) q;
insert into r select 'started stop coordinates change rejected', x like 'STOP_HISTORY_LOCKED%', x
  from (select pg_temp.t(1, $q$update public.jobs set stops = jsonb_set(stops, '{1,lat}', '51.9') where id = 700103$q$) x) q;
insert into r select 'started stop removal rejected', x like 'STOP_HISTORY_LOCKED%' and pg_temp.unchanged(700103), x
  from (select pg_temp.t(1, $q$update public.jobs set stops = stops - 0 where id = 700103$q$) x) q;
insert into r select 'started stop reorder rejected', x like 'STOP_HISTORY_LOCKED%' and pg_temp.unchanged(700103), x
  from (select pg_temp.t(1, $q$update public.jobs set stops = jsonb_build_array(stops->0, stops->2, stops->1) where id = 700103$q$) x) q;
insert into r select 'all stops removed rejected', x like 'STOP_HISTORY_LOCKED%', x
  from (select pg_temp.t(1, $q$update public.jobs set stops = null where id = 700103$q$) x) q;
insert into r select 'pending stop given history rejected', x like 'STOP_HISTORY_LOCKED%', x
  from (select pg_temp.t(1, $q$update public.jobs set stops = jsonb_set(stops, '{2}', (stops->2) || '{"status":"arrived","arrived_at":"2026-10-04T10:00:00Z"}') where id = 700103$q$) x) q;
insert into r select 'pending stop given evidence keys rejected', x like 'STOP_HISTORY_LOCKED%', x
  from (select pg_temp.t(1, $q$update public.jobs set stops = jsonb_set(stops, '{2}', (stops->2) || '{"completed_location_check":"ok"}') where id = 700103$q$) x) q;
insert into r select 'refused writes leave no audit entry', pg_temp.naudit() = (select n from a0), '';
insert into r select 'pending stop edit allowed (started stops intact)',
  x = 'ok' and pg_temp.j(700103) #>> '{stops,2,address}' = '3B A St' and (pg_temp.j(700103) -> 'stops' -> 0) = (select s0 from st) and (pg_temp.j(700103) -> 'stops' -> 1) = (select s1 from st), x
  from (select pg_temp.t(2, $q$update public.jobs set stops = jsonb_set(jsonb_set(stops, '{2,address}', '"3B A St"'), '{2,lat}', '51.31') where id = 700103$q$) x) q;
insert into r select 'pending stop addition allowed', x = 'ok' and jsonb_array_length(pg_temp.j(700103) -> 'stops') = 4, x
  from (select pg_temp.t(1, $q$update public.jobs set stops = stops || '[{"label":"S4","address":"4 A St","lat":51.4,"lng":-1.0,"status":"pending","completed_at":null}]' where id = 700103$q$) x) q;
insert into r select 'pending stop removal (after started) allowed', x = 'ok' and jsonb_array_length(pg_temp.j(700103) -> 'stops') = 3, x
  from (select pg_temp.t(1, $q$update public.jobs set stops = stops - 3 where id = 700103$q$) x) q;
insert into r select 'completed job stops change rejected', x like 'JOB_CLOSED%' and pg_temp.unchanged(700104), x
  from (select pg_temp.t(1, $q$update public.jobs set stops = '[]' where id = 700104$q$) x) q;
insert into r select 'cancelled job stops change rejected', x like 'JOB_CLOSED%' and pg_temp.unchanged(700105), x
  from (select pg_temp.t(1, $q$update public.jobs set stops = '[{"label":"N","address":"n","status":"pending"}]' where id = 700105$q$) x) q;

-- In progress: fixed fields; normal fields editable.
insert into r select 'in_progress driver change rejected', x like 'JOB_FIELD_LOCKED%', x from (select pg_temp.t(1, $q$update public.jobs set driver_id = null where id = 700103$q$) x) q;
insert into r select 'in_progress vehicle change rejected', x like 'JOB_FIELD_LOCKED%', x from (select pg_temp.t(1, $q$update public.jobs set vehicle_id = 700202 where id = 700103$q$) x) q;
insert into r select 'in_progress reference change rejected', x like 'JOB_FIELD_LOCKED%', x from (select pg_temp.t(1, $q$update public.jobs set reference = 'OG-3X' where id = 700103$q$) x) q;
insert into r select 'in_progress priority/notes/eta edit allowed', x = 'ok' and pg_temp.j(700103) ->> 'priority' = 'urgent', x
  from (select pg_temp.t(2, $q$update public.jobs set priority = 'urgent', driver_notes = 'Gate 4', eta = now() + interval '1 hour', customer_phone = '0700' where id = 700103$q$) x) q;

-- Status.
insert into r select 'pending -> assigned with driver allowed', x = 'ok' and pg_temp.j(700101) ->> 'status' = 'assigned', x
  from (select pg_temp.t(1, $q$update public.jobs set status = 'assigned', driver_id = 700003 where id = 700101$q$) x) q;
insert into r select 'assigned -> pending allowed', x = 'ok' and pg_temp.j(700101) ->> 'status' = 'pending', x
  from (select pg_temp.t(2, $q$update public.jobs set status = 'pending' where id = 700101$q$) x) q;
insert into r select 'assigned without driver rejected', x like 'ASSIGNED_REQUIRES_DRIVER%', x
  from (select pg_temp.t(1, $q$update public.jobs set status = 'assigned', driver_id = null where id = 700101$q$) x) q;
insert into r select 'removing the driver of an assigned job rejected', x like 'ASSIGNED_REQUIRES_DRIVER%', x
  from (select pg_temp.t(1, $q$update public.jobs set driver_id = null where id = 700102$q$) x) q;
insert into r select 'assigned job reassignment allowed', x = 'ok' and (pg_temp.j(700107) ->> 'vehicle_id')::int = 700202, x
  from (select pg_temp.t(1, $q$update public.jobs set vehicle_id = 700202 where id = 700107$q$) x) q;
insert into r select 'cancel without reason rejected', x like 'CANCELLATION_REASON_REQUIRED%' and pg_temp.j(700102) ->> 'status' = 'assigned', x
  from (select pg_temp.t(1, $q$update public.jobs set status = 'cancelled' where id = 700102$q$) x) q;
insert into r select 'cancel with blank reason rejected', x like 'CANCELLATION_REASON_REQUIRED%', x
  from (select pg_temp.t(1, $q$update public.jobs set status = 'cancelled', cancellation_reason = '   ' where id = 700102$q$) x) q;
insert into r select 'pending -> cancelled with reason allowed (trimmed)', x = 'ok' and pg_temp.j(700108) ->> 'cancellation_reason' = 'Customer cancelled', x
  from (select pg_temp.t(1, $q$update public.jobs set status = 'cancelled', cancellation_reason = '  Customer cancelled ' where id = 700108$q$) x) q;
insert into r select 'assigned -> cancelled with reason allowed', x = 'ok' and pg_temp.j(700107) ->> 'status' = 'cancelled', x
  from (select pg_temp.t(2, $q$update public.jobs set status = 'cancelled', cancellation_reason = 'Duplicate order' where id = 700107$q$) x) q;
insert into r select 'in_progress -> cancelled with reason allowed', x = 'ok' and pg_temp.j(700106) ->> 'status' = 'cancelled', x
  from (select pg_temp.t(1, $q$update public.jobs set status = 'cancelled', cancellation_reason = 'Vehicle breakdown' where id = 700106$q$) x) q;
insert into r select 'reason without cancelling rejected', x like 'INVALID_TRANSITION%', x
  from (select pg_temp.t(1, $q$update public.jobs set cancellation_reason = 'x' where id = 700102$q$) x) q;
insert into r select 'Office -> in_progress rejected', x like 'INVALID_TRANSITION%', x from (select pg_temp.t(1, $q$update public.jobs set status = 'in_progress' where id = 700102$q$) x) q;
insert into r select 'Office -> completed rejected (assigned)', x like 'INVALID_TRANSITION%', x from (select pg_temp.t(1, $q$update public.jobs set status = 'completed' where id = 700102$q$) x) q;
insert into r select 'Office -> completed rejected (in_progress)', x like 'INVALID_TRANSITION%', x from (select pg_temp.t(2, $q$update public.jobs set status = 'completed' where id = 700103$q$) x) q;
insert into r select 'Office in_progress -> assigned rejected', x like 'INVALID_TRANSITION%', x from (select pg_temp.t(1, $q$update public.jobs set status = 'assigned' where id = 700103$q$) x) q;
insert into r select 'completed -> anything rejected', x like 'JOB_CLOSED%' and y like 'JOB_CLOSED%' and pg_temp.unchanged(700104), x || ' / ' || y
  from (select pg_temp.t(1, $q$update public.jobs set status = 'pending' where id = 700104$q$) x,
               pg_temp.t(1, $q$update public.jobs set driver_notes = 'late note' where id = 700104$q$) y) q;
insert into r select 'cancelled -> anything rejected', x like 'JOB_CLOSED%' and y like 'JOB_CLOSED%' and z like 'JOB_CLOSED%', x || ' / ' || y || ' / ' || z
  from (select pg_temp.t(1, $q$update public.jobs set status = 'pending' where id = 700105$q$) x,
               pg_temp.t(1, $q$update public.jobs set status = 'in_progress' where id = 700108$q$) y,
               pg_temp.t(2, $q$update public.jobs set cancellation_reason = 'changed' where id = 700108$q$) z) q;

-- POD and completion time.
insert into r select 'POD fields immutable for Office', bool_and(x like 'POD_READ_ONLY%'), string_agg(x, ' / ')
  from (select pg_temp.t(1, q) x from unnest(array[
    $q$update public.jobs set pod_status = 'signed' where id = 700102$q$,
    $q$update public.jobs set pod_signature = 'data:image/png;base64,AA==' where id = 700102$q$,
    $q$update public.jobs set pod_photo_url = '00000000-0000-4000-a000-0000000000c1/700102/x.jpg' where id = 700102$q$,
    $q$update public.jobs set pod_notes = 'Received by: X' where id = 700103$q$,
    $q$update public.jobs set pod_captured_at = now(), pod_lat = 51.0, pod_lng = -1.0 where id = 700103$q$]) q) q;
insert into r select 'completed_at immutable for Office', x like 'POD_READ_ONLY%', x from (select pg_temp.t(2, $q$update public.jobs set completed_at = now() where id = 700102$q$) x) q;
insert into r select 'completed job POD immutable for Office', x like 'JOB_CLOSED%' and pg_temp.unchanged(700104), x
  from (select pg_temp.t(1, $q$update public.jobs set pod_photo_url = null, pod_status = 'pending' where id = 700104$q$) x) q;

-- Creation.
insert into r select 'create pending job allowed', x = 'ok', x
  from (select pg_temp.t(1, $q$insert into public.jobs (reference, customer, status, organization_id, stops) values ('OG-NEW', 'C', 'pending', '00000000-0000-4000-a000-0000000000c1', '[{"label":"N1","address":"n1","status":"pending","completed_at":null}]')$q$) x) q;
insert into r select 'create assigned without driver rejected', x like 'ASSIGNED_REQUIRES_DRIVER%', x
  from (select pg_temp.t(1, $q$insert into public.jobs (reference, customer, status, organization_id) values ('OG-NEW2', 'C', 'assigned', '00000000-0000-4000-a000-0000000000c1')$q$) x) q;
insert into r select 'create completed/in_progress/cancelled rejected', bool_and(x like 'INVALID_TRANSITION%'), string_agg(x, ' / ')
  from (select pg_temp.t(1, format($q$insert into public.jobs (reference, customer, status, organization_id, driver_id) values ('OG-X%s', 'C', %L, '00000000-0000-4000-a000-0000000000c1', 700003)$q$, s, s)) x
          from unnest(array['completed', 'in_progress', 'cancelled']) s) q;
insert into r select 'create with POD rejected', x like 'POD_READ_ONLY%', x
  from (select pg_temp.t(1, $q$insert into public.jobs (reference, customer, status, organization_id, pod_status, pod_signature) values ('OG-NEW3', 'C', 'pending', '00000000-0000-4000-a000-0000000000c1', 'signed', 'data:image/png;base64,AA==')$q$) x) q;
insert into r select 'create with stop history rejected', x like 'STOP_HISTORY_LOCKED%', x
  from (select pg_temp.t(1, $q$insert into public.jobs (reference, customer, status, organization_id, stops) values ('OG-NEW4', 'C', 'pending', '00000000-0000-4000-a000-0000000000c1', '[{"label":"F","address":"f","status":"completed","completed_at":"2026-10-04T08:00:00Z"}]')$q$) x) q;

-- Deletion (job without POD).
insert into r select 'delete job without POD allowed', x = 'ok' and pg_temp.j(700110) is null, x
  from (select pg_temp.t(1, $q$delete from public.jobs where id = 700110$q$) x) q;

-- POD photo files.
insert into r select 'POD photo delete refused (admin, dispatcher, driver)',
  pg_temp.rows(1, $q$delete from storage.objects where bucket_id = 'pod-photos' and name like '00000000-0000-4000-a000-0000000000c1/%'$q$) = 0
  and pg_temp.rows(2, $q$delete from storage.objects where bucket_id = 'pod-photos' and name like '00000000-0000-4000-a000-0000000000c1/%'$q$) = 0
  and pg_temp.rows(3, $q$delete from storage.objects where bucket_id = 'pod-photos' and name like '00000000-0000-4000-a000-0000000000c1/%'$q$) = 0
  and (select count(*) from storage.objects where bucket_id = 'pod-photos' and name like '00000000-0000-4000-a000-0000000000c1/%') = 2, '';

-- Tenant isolation of writes.
insert into r select 'admin A cannot change company B job', pg_temp.rows(1, $q$update public.jobs set priority = 'urgent' where id = 700151$q$) = 0, '';
insert into r select 'admin B cannot change company A job', pg_temp.rows(4, $q$update public.jobs set priority = 'urgent' where id = 700102$q$) = 0, '';

-- Driver workflow unchanged (runs through the driver functions; not Office, not audited).
create temp table a1 as select pg_temp.naudit() n;
insert into r select 'driver_start_job works', x = 'ok' and pg_temp.j(700109) ->> 'status' = 'in_progress', x
  from (select pg_temp.t(3, $q$select public.driver_start_job(700109)$q$) x) q;
insert into r select 'driver_confirm_stop works', x = 'ok' and pg_temp.j(700109) #>> '{stops,0,status}' = 'completed'
  and pg_temp.j(700109) #>> '{stops,0,completed_location_check}' = 'ok', x
  from (select pg_temp.t(3, $q$select public.driver_confirm_stop(700109, 0, 'completed', null, 52.0, -1.5, 10)$q$) x) q;
insert into r select 'driver_complete_job works (POD stored)', x = 'ok' and pg_temp.j(700109) ->> 'status' = 'completed'
  and pg_temp.j(700109) ->> 'pod_photo_url' = '00000000-0000-4000-a000-0000000000c1/700109/pod.jpg', x
  from (select pg_temp.t(3, $q$select public.driver_complete_job(700109, '00000000-0000-4000-a000-0000000000c1/700109/pod.jpg', null, 'Jo', null, 52.0, -1.5, null)$q$) x) q;
insert into r select 'geofence arrival works', x = 'ok' and pg_temp.j(700102) #>> '{stops,0,status}' = 'arrived'
  and pg_temp.j(700102) #>> '{stops,0,arrived_location_source}' = 'geofence', x
  from (select pg_temp.t(3, $q$select public.driver_report_locations(jsonb_build_array(jsonb_build_object('lat', 53.0, 'lng', -1.0, 'accuracy_m', 8, 'recorded_at', now())))$q$) x) q;
insert into r select 'driver actions write no Office audit entry', pg_temp.naudit() = (select n from a1), '';
insert into r select 'Office cannot edit the started stop the geofence just arrived', x like 'STOP_HISTORY_LOCKED%', x
  from (select pg_temp.t(1, $q$update public.jobs set stops = jsonb_set(stops, '{0,address}', '"g1 moved"') where id = 700102$q$) x) q;

-- Audit entries.
create function pg_temp.au(act text, job integer) returns jsonb language sql as
  $$ select to_jsonb(a) from public.audit_log a where action = act and (changes ->> 'job_id')::int = job order by created_at desc limit 1 $$;
insert into r select 'audit: cancellation (actor, org, job, old/new status, reason)',
  a ->> 'actor_id' = '00000000-0000-4000-b000-000000000901' and a #>> '{changes,organization_id}' = '00000000-0000-4000-a000-0000000000c1'
  and a #>> '{changes,old,status}' = 'in_progress' and a #>> '{changes,new,status}' = 'cancelled' and a #>> '{changes,new,cancellation_reason}' = 'Vehicle breakdown'
  and a ->> 'resource_type' = 'job' and a ->> 'created_at' is not null, coalesce(a::text, 'missing')
  from (select pg_temp.au('job.cancelled', 700106) a) q;
insert into r select 'audit: status changes (pending -> assigned by admin, assigned -> pending by dispatcher)',
  count(*) filter (where changes #>> '{old,status}' = 'pending' and changes #>> '{new,status}' = 'assigned' and actor_id = '00000000-0000-4000-b000-000000000901') = 1
  and count(*) filter (where changes #>> '{old,status}' = 'assigned' and changes #>> '{new,status}' = 'pending' and actor_id = '00000000-0000-4000-b000-000000000902') = 1, count(*)::text
  from public.audit_log where action = 'job.status_changed' and (changes ->> 'job_id')::int = 700101;
insert into r select 'audit: reassignment', (a #>> '{changes,new,vehicle_id}')::int = 700202 and a #>> '{changes,old,vehicle_id}' is null,
  coalesce(a::text, 'missing') from (select pg_temp.au('job.reassigned', 700107) a) q;
insert into r select 'audit: stop change (old and new stops)', jsonb_array_length(a #> '{changes,new,stops}') = 3 and a #> '{changes,old,stops}' is not null,
  coalesce(left(a::text, 120), 'missing') from (select pg_temp.au('job.stops_changed', 700103) a) q;
insert into r select 'audit: update (priority etc.)', a #>> '{changes,new,priority}' = 'urgent' and a #>> '{changes,old,priority}' = 'medium',
  coalesce(a::text, 'missing') from (select pg_temp.au('job.updated', 700103) a) q;
insert into r select 'audit: creation', a #>> '{changes,new,reference}' = 'OG-NEW' and a #>> '{changes,organization_id}' = '00000000-0000-4000-a000-0000000000c1',
  coalesce(left(a::text, 120), 'missing')
  from (select to_jsonb(x) a from public.audit_log x where action = 'job.created' and changes ->> 'reference' = 'OG-NEW') q;
insert into r select 'audit: deletion', a #>> '{changes,old,reference}' = 'OG-10', coalesce(left(a::text, 120), 'missing') from (select pg_temp.au('job.deleted', 700110) a) q;
insert into r select 'audit: no POD signature copied into audit', not exists (select 1 from public.audit_log where changes::text like '%pod_signature%'), '';

-- Audit visibility (existing policy: admins of the same company only).
insert into r select 'audit visible to admin A', x = 'ok', x
  from (select pg_temp.t(1, $q$do $d$ begin if (select count(*) from public.audit_log where resource_type = 'job') < 7 then raise exception 'too few'; end if; end $d$$q$) x) q;
insert into r select 'audit hidden from dispatcher A', x = 'ok', x
  from (select pg_temp.t(2, $q$do $d$ begin if (select count(*) from public.audit_log where resource_type = 'job') <> 0 then raise exception 'visible'; end if; end $d$$q$) x) q;
insert into r select 'audit hidden from admin B (other company)', x = 'ok', x
  from (select pg_temp.t(4, $q$do $d$ begin if (select count(*) from public.audit_log where changes ->> 'organization_id' = '00000000-0000-4000-a000-0000000000c1') <> 0 then raise exception 'visible'; end if; end $d$$q$) x) q;
insert into r select 'audit hidden from driver A', x = 'ok', x
  from (select pg_temp.t(3, $q$do $d$ begin if (select count(*) from public.audit_log) <> 0 then raise exception 'visible'; end if; end $d$$q$) x) q;
insert into r select 'audit cannot be written or erased by admin', x <> 'ok' or y = 0, x || ' / ' || y
  from (select pg_temp.t(1, $q$insert into public.audit_log (action, resource_type, changes) values ('job.fake', 'job', '{"organization_id":"00000000-0000-4000-a000-0000000000c1"}')$q$) x,
               pg_temp.rows(1, $q$delete from public.audit_log where resource_type = 'job'$q$) y) q;

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from r;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from r;
do $$ begin
  if exists (select 1 from r where not pass) then raise exception 'office_job_guard: FAILED'; end if;
end $$;
rollback;
