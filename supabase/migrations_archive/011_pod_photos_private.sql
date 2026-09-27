-- pod-photos was a PUBLIC bucket with no storage policies: uploads through the
-- API were rejected (the app silently stored base64 in jobs instead) and any
-- stored object would have been world-readable. Make it private and scope
-- every object to "<organization_id>/<job_id>/<file>".
update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic']
 where id = 'pod-photos';

drop policy if exists pod_photos_select on storage.objects;
drop policy if exists pod_photos_insert on storage.objects;
drop policy if exists pod_photos_delete on storage.objects;

create policy pod_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pod-photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (
      public.auth_role() in ('admin','dispatcher')
      or (public.auth_role() = 'driver' and exists (
            select 1 from public.jobs j
             where j.id::text = (storage.foldername(name))[2]
               and j.organization_id = public.auth_org_id()
               and j.driver_id = public.auth_driver_id()))
    )
  );

create policy pod_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pod-photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.jobs j
       where j.id::text = (storage.foldername(name))[2]
         and j.organization_id = public.auth_org_id()
         and (public.auth_role() in ('admin','dispatcher')
              or (public.auth_role() = 'driver' and j.driver_id = public.auth_driver_id())))
  );

create policy pod_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pod-photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and public.auth_role() in ('admin','dispatcher')
  );
