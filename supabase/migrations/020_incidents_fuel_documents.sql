-- Incidents, fuel logs and documents.
--
-- Incidents and fuel logs could only be inserted by drivers and nothing in the
-- deployed product did so, so both modules were permanently empty. Dispatch
-- can now log them too. Every insert must reference a driver of the caller's
-- organisation, and any vehicle/job it names must belong to the same
-- organisation (previously a driver could attach another tenant's ids).
-- Documents: the scanner kept results in memory only; scans are now stored in
-- a private bucket with a metadata row per document.

create or replace function public.same_org_refs(p_driver integer, p_vehicle integer, p_job integer)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.drivers d where d.id = p_driver and d.organization_id = public.auth_org_id())
     and (p_vehicle is null or exists (select 1 from public.vehicles v where v.id = p_vehicle and v.organization_id = public.auth_org_id()))
     and (p_job is null or exists (select 1 from public.jobs j where j.id = p_job and j.organization_id = public.auth_org_id()));
$$;
revoke all on function public.same_org_refs(integer, integer, integer) from public, anon;
grant execute on function public.same_org_refs(integer, integer, integer) to authenticated;

drop policy if exists incidents_driver_insert on public.incidents;
create policy incidents_driver_insert on public.incidents
  for insert to authenticated
  with check (public.auth_role() = 'driver' and driver_id = public.auth_driver_id()
              and public.same_org_refs(driver_id, vehicle_id, job_id));
create policy incidents_dispatcher_admin_insert on public.incidents
  for insert to authenticated
  with check (public.auth_role() in ('admin', 'dispatcher') and driver_id is not null
              and public.same_org_refs(driver_id, vehicle_id, job_id));

drop policy if exists fuel_logs_driver_insert on public.fuel_logs;
create policy fuel_logs_driver_insert on public.fuel_logs
  for insert to authenticated
  with check (public.auth_role() = 'driver' and driver_id = public.auth_driver_id()
              and public.same_org_refs(driver_id, vehicle_id, null));
create policy fuel_logs_dispatcher_admin_insert on public.fuel_logs
  for insert to authenticated
  with check (public.auth_role() in ('admin', 'dispatcher') and driver_id is not null
              and public.same_org_refs(driver_id, vehicle_id, null));
create policy fuel_logs_dispatcher_admin_delete on public.fuel_logs
  for delete to authenticated
  using (public.auth_role() in ('admin', 'dispatcher')
         and exists (select 1 from public.drivers d where d.id = fuel_logs.driver_id and d.organization_id = public.auth_org_id()));

-- Documents ---------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  storage_path text not null unique,
  ocr_text text,
  ocr_confidence integer,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists documents_org_time_idx on public.documents (organization_id, created_at desc);
alter table public.documents enable row level security;

create policy documents_select on public.documents
  for select to authenticated
  using (public.auth_role() in ('admin', 'dispatcher') and organization_id = public.auth_org_id());
create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.auth_role() in ('admin', 'dispatcher') and organization_id = public.auth_org_id()
              and uploaded_by = auth.uid()
              and storage_path like public.auth_org_id()::text || '/%');
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.auth_role() in ('admin', 'dispatcher') and organization_id = public.auth_org_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['image/jpeg','image/png','image/webp','image/tiff'])
on conflict (id) do update set public = false;

create policy documents_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.auth_role() in ('admin', 'dispatcher')
         and (storage.foldername(name))[1] = public.auth_org_id()::text);
create policy documents_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.auth_role() in ('admin', 'dispatcher')
              and (storage.foldername(name))[1] = public.auth_org_id()::text);
create policy documents_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.auth_role() in ('admin', 'dispatcher')
         and (storage.foldername(name))[1] = public.auth_org_id()::text);
