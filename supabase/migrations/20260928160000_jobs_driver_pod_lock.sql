-- Drivers could complete a job, or write any proof-of-delivery field, by
-- updating their own jobs row directly (policy jobs_driver_update; the guard
-- let status become 'completed' and did not cover the POD fields). A job could
-- therefore show as delivered with no photo or signature, or with a forged
-- photo path, location or recipient.
--
-- After this migration a driver changes jobs only through the checked
-- functions (SECURITY DEFINER, owner rights, unaffected by RLS or this guard):
--   driver_start_job, driver_mark_stop, driver_update_stop, driver_complete_job.
-- The web Driver workspace and the native app both use them; no driver client
-- updates the table directly. Office (admin/dispatcher) access is unchanged.
-- No data is modified.

-- 1. No direct UPDATE on jobs for drivers.
drop policy if exists jobs_driver_update on public.jobs;

-- 2. Second layer, in case a driver UPDATE policy is ever added again: a
--    signed-in driver cannot change status, completion or proof of delivery
--    (nor any field that was already protected).
create or replace function public.jobs_driver_field_guard()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated', 'anon')
     and public.auth_role() = 'driver' then
    new.id               := old.id;
    new.reference        := old.reference;
    new.customer         := old.customer;
    new.customer_phone   := old.customer_phone;
    new.priority         := old.priority;
    new.pickup_address   := old.pickup_address;
    new.pickup_lat       := old.pickup_lat;
    new.pickup_lng       := old.pickup_lng;
    new.delivery_address := old.delivery_address;
    new.delivery_lat     := old.delivery_lat;
    new.delivery_lng     := old.delivery_lng;
    new.scheduled_date   := old.scheduled_date;
    new.eta              := old.eta;
    new.tracking_token   := old.tracking_token;
    new.vehicle_id       := old.vehicle_id;
    new.driver_id        := old.driver_id;
    new.created_by       := old.created_by;
    new.created_at       := old.created_at;
    new.organization_id  := old.organization_id;
    new.stops            := old.stops;
    new.driver_notes     := old.driver_notes;

    -- Status and completion: only driver_start_job / driver_complete_job.
    new.status           := old.status;
    new.completed_at     := old.completed_at;

    -- Proof of delivery: only driver_complete_job (which validates it).
    new.pod_status       := old.pod_status;
    new.pod_photo_url    := old.pod_photo_url;
    new.pod_signature    := old.pod_signature;
    new.pod_notes        := old.pod_notes;
    new.pod_captured_at  := old.pod_captured_at;
    new.pod_lat          := old.pod_lat;
    new.pod_lng          := old.pod_lng;

    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;
