-- Regression: drivers cannot complete jobs or write proof of delivery by
-- updating jobs directly; driver_start_job / driver_complete_job still work;
-- other companies stay isolated; the Office is unaffected. Rolled back.
-- Needs a database built from supabase/migrations, never production.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/jobs_driver_pod_lock.sql
begin;

insert into public.organizations (id, name, plan, plan_status, trial_ends_at) values
  ('00000000-0000-4000-a000-0000000000d1', 'Lock A', 'starter', 'trial', now() + interval '14 days'),
  ('00000000-0000-4000-a000-0000000000d2', 'Lock B', 'starter', 'trial', now() + interval '14 days');
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-0000000000d1', 'driver-a@lock.test'),
  ('00000000-0000-4000-b000-0000000000d2', 'admin-a@lock.test'),
  ('00000000-0000-4000-b000-0000000000d3', 'driver-b@lock.test');
insert into public.users (id, email, name, role, organization_id) values
  ('00000000-0000-4000-b000-0000000000d1', 'driver-a@lock.test', 'Driver A', 'driver', '00000000-0000-4000-a000-0000000000d1'),
  ('00000000-0000-4000-b000-0000000000d2', 'admin-a@lock.test',  'Admin A',  'admin',  '00000000-0000-4000-a000-0000000000d1'),
  ('00000000-0000-4000-b000-0000000000d3', 'driver-b@lock.test', 'Driver B', 'driver', '00000000-0000-4000-a000-0000000000d2')
on conflict (id) do update set role = excluded.role, organization_id = excluded.organization_id;
insert into public.drivers (id, name, user_id, organization_id) values
  (660001, 'Driver A', '00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-a000-0000000000d1'),
  (660002, 'Driver B', '00000000-0000-4000-b000-0000000000d3', '00000000-0000-4000-a000-0000000000d2');
insert into public.jobs (id, reference, customer, status, organization_id, driver_id, driver_notes) values
  (660001, 'LOCK-A1', 'A', 'assigned',  '00000000-0000-4000-a000-0000000000d1', 660001, 'Gate 4'),
  (660002, 'LOCK-A2', 'A', 'in_progress','00000000-0000-4000-a000-0000000000d1', 660001, null),
  (660003, 'LOCK-A3', 'A', 'in_progress','00000000-0000-4000-a000-0000000000d1', 660001, null),
  (660004, 'LOCK-A4', 'A', 'cancelled', '00000000-0000-4000-a000-0000000000d1', 660001, null),
  (660005, 'LOCK-B1', 'B', 'in_progress','00000000-0000-4000-a000-0000000000d2', 660002, null);
insert into storage.objects (bucket_id, name) values
  ('pod-photos', '00000000-0000-4000-a000-0000000000d1/660003/proof.jpg');

create temp table lock_result (name text, pass boolean, detail text) on commit drop;
grant insert, select on lock_result to authenticated;

-- Layer 1: no driver UPDATE policy — direct updates reach no row.
insert into lock_result select 'jobs_driver_update policy removed',
  not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'jobs_driver_update'), '';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000d1', true);
insert into lock_result select 'driver can still read own jobs', count(*) = 4, count(*)::text from public.jobs;
with u as (update public.jobs set status = 'completed' where id = 660002 returning id)
insert into lock_result select 'direct complete updates no row', count(*) = 0, count(*)::text || ' rows' from u;
with u as (update public.jobs set pod_status = 'photo', pod_photo_url = '00000000-0000-4000-a000-0000000000d2/660005/x.jpg',
                                 pod_signature = 'data:image/png;base64,AA==', pod_notes = 'Received by: nobody',
                                 pod_captured_at = now(), pod_lat = 51.5, pod_lng = -0.12, completed_at = now(),
                                 driver_notes = 'changed', status = 'in_progress'
            where id in (660001, 660002) returning id)
insert into lock_result select 'direct POD/status/notes update updates no row', count(*) = 0, count(*)::text || ' rows' from u;
reset role;

-- Layer 2: the guard alone (as if a driver UPDATE policy existed again).
create policy lock_test_driver_update on public.jobs for update to authenticated
  using (auth_role() = 'driver' and driver_id = auth_driver_id()) with check (auth_role() = 'driver' and driver_id = auth_driver_id());
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000d1', true);
update public.jobs set status = 'completed', completed_at = now(), pod_status = 'photo',
       pod_photo_url = '00000000-0000-4000-a000-0000000000d2/660005/x.jpg', pod_signature = 'data:image/png;base64,AA==',
       pod_notes = 'Received by: nobody', pod_captured_at = now(), pod_lat = 51.5, pod_lng = -0.12, driver_notes = 'changed'
 where id = 660001;
reset role;
insert into lock_result select 'guard keeps status/completion/POD/notes', status = 'assigned' and completed_at is null
  and pod_photo_url is null and pod_signature is null and pod_notes is null and pod_captured_at is null
  and pod_lat is null and pod_lng is null and driver_notes = 'Gate 4' and pod_status is not distinct from 'pending',
  format('status=%s pod=%s photo=%s notes=%s', status, pod_status, pod_photo_url, driver_notes) from public.jobs where id = 660001;
drop policy lock_test_driver_update on public.jobs;

-- Legitimate driver flow through the checked functions.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000d1', true);
insert into lock_result select 'driver_start_job starts the job', public.driver_start_job(660001) = 'in_progress', '';
insert into lock_result select 'driver_complete_job with signature',
  (public.driver_complete_job(660002, null, 'data:image/png;base64,AA==', 'Jo Bloggs', 'Left at gate', 52.1, -0.8, now() - interval '2 minutes')->>'status') = 'completed', '';
insert into lock_result select 'driver_complete_job with uploaded photo',
  (public.driver_complete_job(660003, '00000000-0000-4000-a000-0000000000d1/660003/proof.jpg', null, 'Sam', null, null, null, null)->>'status') = 'completed', '';
insert into lock_result select 'replayed completion is a no-op',
  (public.driver_complete_job(660002, null, 'data:image/png;base64,AA==', 'Other', null, null, null, null)->>'replayed') = 'true', '';
do $$ begin perform public.driver_complete_job(660001, null, null, null, null, null, null, null); insert into lock_result values ('POD required', false, 'accepted');
exception when others then insert into lock_result values ('POD required', sqlerrm = 'POD_REQUIRED', sqlerrm); end $$;
do $$ begin perform public.driver_complete_job(660001, '00000000-0000-4000-a000-0000000000d2/660005/x.jpg', null, null, null, null, null, null); insert into lock_result values ('other company photo path refused', false, 'accepted');
exception when others then insert into lock_result values ('other company photo path refused', sqlerrm = 'INVALID_PHOTO_PATH', sqlerrm); end $$;
do $$ begin perform public.driver_complete_job(660001, '00000000-0000-4000-a000-0000000000d1/660001/missing.jpg', null, null, null, null, null, null); insert into lock_result values ('photo must be uploaded', false, 'accepted');
exception when others then insert into lock_result values ('photo must be uploaded', sqlerrm = 'PHOTO_NOT_UPLOADED', sqlerrm); end $$;
do $$ begin perform public.driver_complete_job(660004, null, 'data:image/png;base64,AA==', null, null, null, null, null); insert into lock_result values ('cancelled job refused', false, 'accepted');
exception when others then insert into lock_result values ('cancelled job refused', sqlerrm = 'JOB_CLOSED', sqlerrm); end $$;
-- Cross-company.
do $$ begin perform public.driver_complete_job(660005, null, 'data:image/png;base64,AA==', null, null, null, null, null); insert into lock_result values ('other company job: complete refused', false, 'accepted');
exception when others then insert into lock_result values ('other company job: complete refused', sqlerrm = 'JOB_NOT_FOUND', sqlerrm); end $$;
do $$ begin perform public.driver_start_job(660005); insert into lock_result values ('other company job: start refused', false, 'accepted');
exception when others then insert into lock_result values ('other company job: start refused', sqlerrm = 'JOB_NOT_FOUND', sqlerrm); end $$;
insert into lock_result select 'other company job not visible', count(*) = 0, count(*)::text from public.jobs where id = 660005;
reset role;

insert into lock_result select 'completed job stores validated POD',
  status = 'completed' and completed_at is not null and pod_status = 'signed' and pod_signature like 'data:image/png%'
  and pod_notes = E'Received by: Jo Bloggs\nLeft at gate' and pod_lat = 52.1,
  format('%s %s %s', status, pod_status, replace(pod_notes, E'\n', ' | ')) from public.jobs where id = 660002;
insert into lock_result select 'photo completion stores the path',
  pod_status = 'photo' and pod_photo_url = '00000000-0000-4000-a000-0000000000d1/660003/proof.jpg',
  format('%s %s', pod_status, pod_photo_url) from public.jobs where id = 660003;
insert into lock_result select 'other company job untouched', status = 'in_progress' and pod_signature is null, status::text from public.jobs where id = 660005;

-- Office admin workflows unchanged.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-0000000000d2', true);
update public.jobs set status = 'completed', pod_status = 'signed', pod_signature = 'data:image/png;base64,BB==',
       pod_notes = 'Office captured', driver_notes = 'Office edit' where id = 660001;
reset role;
insert into lock_result select 'office admin can complete and edit POD', status = 'completed' and pod_notes = 'Office captured'
  and driver_notes = 'Office edit', format('%s %s', status, pod_notes) from public.jobs where id = 660001;

select case when pass then 'PASS' else 'FAIL' end as result, name, detail from lock_result;
do $$ begin
  if exists (select 1 from lock_result where not pass) then raise exception 'jobs_driver_pod_lock: FAILED'; end if;
end $$;
rollback;
