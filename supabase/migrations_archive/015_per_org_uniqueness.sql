-- Business identifiers were unique across ALL organisations, so a new
-- customer's first job reference (JOB-2026-001) collided with another
-- tenant's and failed with 409, two fleets could not both own "HGV-001", and
-- the conflict itself revealed that another tenant used the value. They are
-- now unique within an organisation only.
alter table public.jobs drop constraint if exists jobs_reference_key;
create unique index if not exists jobs_org_reference_key on public.jobs (organization_id, reference);

alter table public.vehicles drop constraint if exists vehicles_vehicle_id_key;
create unique index if not exists vehicles_org_vehicle_id_key on public.vehicles (organization_id, vehicle_id);

alter table public.drivers drop constraint if exists drivers_email_key;
create unique index if not exists drivers_org_email_key on public.drivers (organization_id, lower(email)) where email is not null;

-- Duplicate of jobs_tracking_token_key.
drop index if exists public.jobs_tracking_token_idx;
