-- 021 — Pre-launch safety.
--
-- 1. Public tracking links reveal only what the customer needs:
--    the driver's first name, and the driver's position only while that job
--    is actually in progress (previously a delivered job's link kept showing
--    wherever the driver went afterwards).
-- 2. Drivers can be deleted only when nothing depends on them: no jobs and
--    no login account (remove the login from Team first). There was no
--    delete policy at all, so the UI's "Delete" silently did nothing.
-- 3. Deleting a driver keeps their fuel records (driver set to NULL) instead
--    of cascading them away.
-- 4. Jobs that carry proof of delivery cannot be deleted: the photo and
--    signature are the delivery record (and deleting the row orphaned the
--    photo in storage).

create or replace function public.get_tracking(p_token text)
returns table(
  reference text, customer text, status text, delivery_address text,
  delivery_lat double precision, delivery_lng double precision, eta timestamptz,
  pod_status text, driver_name text, driver_heading double precision,
  driver_location_lat double precision, driver_location_lng double precision,
  driver_location_updated_at timestamptz, vehicle_id text, vehicle_make text,
  vehicle_model text, vehicle_registration text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    j.reference,
    j.customer,
    j.status::text,
    j.delivery_address,
    j.delivery_lat,
    j.delivery_lng,
    j.eta,
    j.pod_status::text,
    nullif(split_part(trim(d.name), ' ', 1), ''),
    case when j.status = 'in_progress' then d.heading end,
    case when j.status = 'in_progress' then d.location_lat end,
    case when j.status = 'in_progress' then d.location_lng end,
    case when j.status = 'in_progress' then d.location_updated_at end,
    v.vehicle_id,
    v.make,
    v.model,
    v.registration
  from public.jobs j
  left join public.drivers  d on d.id = j.driver_id
  left join public.vehicles v on v.id = j.vehicle_id
  where j.tracking_token = p_token
    and p_token is not null
    and length(p_token) >= 32
$$;

revoke all on function public.get_tracking(text) from public;
grant execute on function public.get_tracking(text) to anon, authenticated;

drop policy if exists drivers_dispatcher_admin_delete on public.drivers;
create policy drivers_dispatcher_admin_delete on public.drivers
  for delete to authenticated
  using (
    auth_role() in ('admin', 'dispatcher')
    and organization_id = auth_org_id()
    and user_id is null
    and not exists (select 1 from public.jobs j where j.driver_id = drivers.id)
  );

alter table public.fuel_logs drop constraint if exists fuel_logs_driver_id_fkey;
alter table public.fuel_logs
  add constraint fuel_logs_driver_id_fkey foreign key (driver_id)
  references public.drivers(id) on delete set null;

drop policy if exists jobs_dispatcher_admin_delete on public.jobs;
create policy jobs_dispatcher_admin_delete on public.jobs
  for delete to authenticated
  using (
    auth_role() in ('admin', 'dispatcher')
    and organization_id = auth_org_id()
    and pod_photo_url is null
    and pod_signature is null
  );
