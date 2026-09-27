-- Status/type/timestamp columns all have defaults and hold no NULLs, but were
-- declared nullable, so every consumer had to handle a state that can't occur.
alter table public.jobs
  alter column status set not null, alter column priority set not null,
  alter column pod_status set not null, alter column created_at set not null,
  alter column updated_at set not null;
alter table public.vehicles
  alter column status set not null, alter column type set not null,
  alter column created_at set not null, alter column updated_at set not null;
alter table public.drivers
  alter column status set not null, alter column created_at set not null,
  alter column updated_at set not null;
alter table public.fleet_maintenance
  alter column status set not null, alter column created_at set not null;
alter table public.messages
  alter column channel set not null, alter column read set not null,
  alter column created_at set not null;
alter table public.incidents
  alter column photos set not null, alter column created_at set not null;
alter table public.fuel_logs
  alter column created_at set not null;
