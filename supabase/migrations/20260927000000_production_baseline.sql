-- MOViDO production schema baseline (Supabase, Postgres 17).
--
-- Generated from the production catalog on 2026-09-27. Applying this file to
-- a new, empty Supabase project gives the same public schema as production:
-- enums, sequences, tables, constraints, indexes, functions (including every
-- SECURITY DEFINER function with its search_path), triggers (including
-- on_auth_user_created on auth.users), row level security, policies, grants,
-- the private storage buckets and their policies, and the realtime publication.
--
-- It replaces the numbered files now in supabase/migrations_archive/, which
-- no longer matched production (51 migrations were applied directly there).
--
-- Production already has all of this and must never run it. Record it as
-- applied instead (see MOViDO_PROGRESS.md, "Database baseline"). The guard
-- below makes an accidental run fail before it changes anything.

do $$
begin
  if to_regclass('public.organizations') is not null then
    raise exception 'Schema already present: this baseline is only for an empty project.';
  end if;
end
$$;

-- Extensions

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Enums

create type public.driver_status as enum ('on_duty', 'available', 'off_duty', 'on_break');
create type public.job_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.job_status as enum ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
create type public.maintenance_status as enum ('scheduled', 'overdue', 'completed', 'cancelled');
create type public.maintenance_type as enum ('service', 'mot', 'repair', 'inspection', 'tyre');
create type public.message_channel as enum ('dispatch', 'driver', 'alert', 'system');
create type public.pod_status as enum ('pending', 'signed', 'photo', 'na');
create type public.vehicle_status as enum ('active', 'idle', 'maintenance', 'offline');
create type public.vehicle_type as enum ('hgv', 'lgv', 'van');

-- Sequences

create sequence public.drivers_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;
create sequence public.fleet_maintenance_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;
create sequence public.fuel_logs_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;
create sequence public.incidents_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;
create sequence public.jobs_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;
create sequence public.messages_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;
create sequence public.vehicles_id_seq as integer start 1 increment 1 minvalue 1 maxvalue 2147483647 cache 1;

-- Tables

create table public.app_settings (
  key text not null,
  value text not null,
  updated_at timestamp with time zone default now(),
  organization_id uuid
);

create table public.audit_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  changes jsonb,
  created_at timestamp with time zone default now()
);

create table public.documents (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  uploaded_by uuid,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_path text not null,
  ocr_text text,
  ocr_confidence integer,
  fields jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.driver_invitations (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  driver_id integer not null,
  email text not null,
  token_hash text not null,
  status text default 'pending'::text not null,
  expires_at timestamp with time zone not null,
  created_by uuid,
  accepted_by uuid,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.driver_positions (
  id bigint generated always as identity not null,
  organization_id uuid not null,
  driver_id integer not null,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed_mph double precision,
  accuracy_m double precision,
  recorded_at timestamp with time zone default now() not null,
  vehicle_id integer,
  job_id integer
);

create table public.drivers (
  id integer default nextval('drivers_id_seq'::regclass) not null,
  user_id uuid,
  name text not null,
  email text,
  phone text,
  status driver_status default 'available'::driver_status not null,
  license_type text default 'C+E'::text,
  license_expiry date,
  hours_today numeric(4,1) default 0,
  hours_week numeric(5,1) default 0,
  rating numeric(2,1) default 5.0,
  total_deliveries integer default 0,
  vehicle_id integer,
  location_lat double precision,
  location_lng double precision,
  location_updated_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  organization_id uuid,
  heading double precision,
  speed integer,
  push_token text
);

create table public.fleet_maintenance (
  id integer default nextval('fleet_maintenance_id_seq'::regclass) not null,
  vehicle_id integer not null,
  type maintenance_type not null,
  description text,
  scheduled_date date not null,
  completed_date date,
  cost numeric(10,2),
  status maintenance_status default 'scheduled'::maintenance_status not null,
  mileage_at_service integer,
  next_due_mileage integer,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now(),
  organization_id uuid
);

create table public.fuel_logs (
  id integer default nextval('fuel_logs_id_seq'::regclass) not null,
  driver_id integer,
  vehicle_id integer,
  fuel_amount numeric(8,2) not null,
  fuel_cost numeric(8,2),
  fuel_type text default 'diesel'::text not null,
  mileage integer,
  station_name text,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  created_at timestamp with time zone default now() not null
);

create table public.geofence_events (
  id bigint generated always as identity not null,
  organization_id uuid not null,
  job_id integer not null,
  driver_id integer not null,
  target text not null,
  event_type text not null,
  lat double precision not null,
  lng double precision not null,
  distance_m integer not null,
  occurred_at timestamp with time zone default now() not null
);

create table public.incidents (
  id integer default nextval('incidents_id_seq'::regclass) not null,
  driver_id integer,
  vehicle_id integer,
  job_id integer,
  incident_type text default 'other'::text not null,
  description text,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  location_address text,
  photos text[] default '{}'::text[] not null,
  third_party_involved boolean default false,
  reported_to_police boolean default false,
  police_reference text,
  status text default 'reported'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now()
);

create table public.jobs (
  id integer default nextval('jobs_id_seq'::regclass) not null,
  reference text not null,
  customer text not null,
  status job_status default 'pending'::job_status not null,
  priority job_priority default 'medium'::job_priority not null,
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  delivery_address text,
  delivery_lat double precision,
  delivery_lng double precision,
  scheduled_date date,
  eta timestamp with time zone,
  completed_at timestamp with time zone,
  pod_status pod_status default 'pending'::pod_status not null,
  pod_signature text,
  pod_photo_url text,
  pod_notes text,
  tracking_token text default encode(extensions.gen_random_bytes(16), 'hex'::text),
  vehicle_id integer,
  driver_id integer,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  organization_id uuid,
  driver_notes text,
  stops jsonb default '[]'::jsonb,
  customer_phone text
);

create table public.messages (
  id integer default nextval('messages_id_seq'::regclass) not null,
  sender_id text not null,
  recipient_id text,
  channel message_channel default 'dispatch'::message_channel not null,
  content text not null,
  read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  organization_id uuid
);

create table public.organizations (
  id uuid default extensions.uuid_generate_v4() not null,
  name character varying(255) not null,
  slug character varying(128),
  owner_id uuid,
  email character varying(320),
  phone character varying(32),
  address text,
  stripe_customer_id character varying(255),
  plan character varying(32) default 'starter'::character varying not null,
  plan_status character varying(32) default 'trial'::character varying not null,
  trial_ends_at timestamp with time zone default (now() + '14 days'::interval),
  max_vehicles integer default 5 not null,
  max_drivers integer default 5 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.permissions (
  id uuid default gen_random_uuid() not null,
  code text not null,
  description text,
  created_at timestamp with time zone default now()
);

create table public.role_permissions (
  id uuid default gen_random_uuid() not null,
  role text not null,
  permission_id uuid not null,
  created_at timestamp with time zone default now()
);

create table public.users (
  id uuid not null,
  email text,
  name text,
  role text default 'pending'::text,
  avatar_url text,
  subscription_plan text default 'starter'::text,
  subscription_status text default 'trial'::text,
  stripe_customer_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  last_signed_in timestamp with time zone default now(),
  organization_id uuid,
  stripe_subscription_id character varying(255),
  onboarding_completed boolean default false
);

create table public.vehicles (
  id integer default nextval('vehicles_id_seq'::regclass) not null,
  vehicle_id text not null,
  type vehicle_type default 'hgv'::vehicle_type not null,
  make text,
  model text,
  registration text,
  status vehicle_status default 'active'::vehicle_status not null,
  height numeric(4,2),
  width numeric(4,2),
  weight numeric(6,2),
  length numeric(4,2),
  current_location text,
  location_lat double precision,
  location_lng double precision,
  fuel_level integer default 100,
  mileage integer default 0,
  next_service_date date,
  driver_id integer,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  organization_id uuid
);

alter sequence public.drivers_id_seq owned by public.drivers.id;
alter sequence public.fleet_maintenance_id_seq owned by public.fleet_maintenance.id;
alter sequence public.fuel_logs_id_seq owned by public.fuel_logs.id;
alter sequence public.incidents_id_seq owned by public.incidents.id;
alter sequence public.jobs_id_seq owned by public.jobs.id;
alter sequence public.messages_id_seq owned by public.messages.id;
alter sequence public.vehicles_id_seq owned by public.vehicles.id;

-- Primary keys, unique and check constraints

alter table public.app_settings add constraint app_settings_org_key_unique UNIQUE NULLS NOT DISTINCT (organization_id, key);
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.documents add constraint documents_pkey PRIMARY KEY (id);
alter table public.documents add constraint documents_storage_path_key UNIQUE (storage_path);
alter table public.documents add constraint documents_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 20971520)));
alter table public.driver_invitations add constraint driver_invitations_pkey PRIMARY KEY (id);
alter table public.driver_invitations add constraint driver_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
alter table public.driver_positions add constraint driver_positions_pkey PRIMARY KEY (id);
alter table public.drivers add constraint drivers_pkey PRIMARY KEY (id);
alter table public.fleet_maintenance add constraint fleet_maintenance_pkey PRIMARY KEY (id);
alter table public.fuel_logs add constraint fuel_logs_pkey PRIMARY KEY (id);
alter table public.fuel_logs add constraint fuel_logs_fuel_type_check CHECK ((fuel_type = ANY (ARRAY['diesel'::text, 'adblue'::text, 'petrol'::text, 'hvo'::text])));
alter table public.geofence_events add constraint geofence_events_pkey PRIMARY KEY (id);
alter table public.geofence_events add constraint geofence_events_job_id_target_event_type_key UNIQUE (job_id, target, event_type);
alter table public.geofence_events add constraint geofence_events_event_type_check CHECK ((event_type = ANY (ARRAY['arrival'::text, 'departure'::text])));
alter table public.geofence_events add constraint geofence_events_target_check CHECK ((target ~ '^(pickup|delivery|stop:[0-9]+)$'::text));
alter table public.incidents add constraint incidents_pkey PRIMARY KEY (id);
alter table public.incidents add constraint incidents_incident_type_check CHECK ((incident_type = ANY (ARRAY['accident'::text, 'near_miss'::text, 'theft'::text, 'vehicle_damage'::text, 'load_damage'::text, 'other'::text])));
alter table public.incidents add constraint incidents_status_check CHECK ((status = ANY (ARRAY['reported'::text, 'investigating'::text, 'closed'::text])));
alter table public.jobs add constraint jobs_pkey PRIMARY KEY (id);
alter table public.jobs add constraint jobs_tracking_token_key UNIQUE (tracking_token);
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table public.organizations add constraint organizations_slug_key UNIQUE (slug);
alter table public.permissions add constraint permissions_pkey PRIMARY KEY (id);
alter table public.permissions add constraint permissions_code_key UNIQUE (code);
alter table public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (id);
alter table public.role_permissions add constraint role_permissions_role_permission_id_key UNIQUE (role, permission_id);
alter table public.users add constraint users_pkey PRIMARY KEY (id);
alter table public.users add constraint users_email_key UNIQUE (email);
alter table public.users add constraint users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'dispatcher'::text, 'driver'::text, 'pending'::text, 'disabled'::text])));
alter table public.vehicles add constraint vehicles_pkey PRIMARY KEY (id);

-- Foreign keys

alter table public.app_settings add constraint app_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.audit_log add constraint audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);
alter table public.documents add constraint documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.documents add constraint documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
alter table public.driver_invitations add constraint driver_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.driver_invitations add constraint driver_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.driver_invitations add constraint driver_invitations_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table public.driver_invitations add constraint driver_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.driver_positions add constraint driver_positions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table public.driver_positions add constraint driver_positions_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
alter table public.driver_positions add constraint driver_positions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.driver_positions add constraint driver_positions_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
alter table public.drivers add constraint drivers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.drivers add constraint drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.drivers add constraint drivers_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
alter table public.fleet_maintenance add constraint fleet_maintenance_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.fleet_maintenance add constraint fleet_maintenance_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
alter table public.fuel_logs add constraint fuel_logs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
alter table public.fuel_logs add constraint fuel_logs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
alter table public.geofence_events add constraint geofence_events_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table public.geofence_events add constraint geofence_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
alter table public.geofence_events add constraint geofence_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.incidents add constraint incidents_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
alter table public.incidents add constraint incidents_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
alter table public.incidents add constraint incidents_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
alter table public.jobs add constraint jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.jobs add constraint jobs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
alter table public.jobs add constraint jobs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.jobs add constraint jobs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
alter table public.messages add constraint messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.organizations add constraint organizations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.role_permissions add constraint role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id);
alter table public.users add constraint users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users add constraint users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.vehicles add constraint vehicles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Indexes

CREATE INDEX documents_org_time_idx ON public.documents USING btree (organization_id, created_at DESC);
CREATE INDEX driver_invitations_driver_id_idx ON public.driver_invitations USING btree (driver_id);
CREATE UNIQUE INDEX driver_invitations_one_pending_per_driver_idx ON public.driver_invitations USING btree (driver_id) WHERE (status = 'pending'::text);
CREATE INDEX driver_invitations_organization_id_idx ON public.driver_invitations USING btree (organization_id);
CREATE UNIQUE INDEX driver_invitations_token_hash_key ON public.driver_invitations USING btree (token_hash);
CREATE INDEX driver_positions_driver_time_idx ON public.driver_positions USING btree (driver_id, recorded_at DESC);
CREATE INDEX driver_positions_org_time_idx ON public.driver_positions USING btree (organization_id, recorded_at DESC);
CREATE UNIQUE INDEX drivers_org_email_key ON public.drivers USING btree (organization_id, lower(email)) WHERE (email IS NOT NULL);
CREATE UNIQUE INDEX drivers_user_id_unique ON public.drivers USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX geofence_events_org_time_idx ON public.geofence_events USING btree (organization_id, occurred_at DESC);
CREATE UNIQUE INDEX jobs_org_reference_key ON public.jobs USING btree (organization_id, reference);
CREATE UNIQUE INDEX vehicles_org_vehicle_id_key ON public.vehicles USING btree (organization_id, vehicle_id);

-- Functions

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.accept_driver_invitation(p_caller_id uuid, p_token_hash text)
 RETURNS TABLE(driver_id integer, organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_auth_email text;
  v_driver_id  integer;
  v_org_id     uuid;
  v_inv_email  text;
  v_name       text;
begin
  -- 1. Arguments. The raw token never reaches this function; only its SHA-256
  --    hex digest, which is exactly 64 lowercase hex characters.
  if p_caller_id is null
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_ARGUMENTS' using errcode = 'MV400';
  end if;

  -- 2. The caller's verified address, from auth.users — never from a parameter.
  select lower(trim(a.email)) into v_auth_email
    from auth.users a
   where a.id = p_caller_id;

  if v_auth_email is null or v_auth_email = '' then
    raise exception 'CALLER_UNKNOWN' using errcode = 'MV401';
  end if;

  -- 3. Consume the token in a single statement. The WHERE clause is the guard:
  --    a token that is unknown, already accepted, revoked or expired matches no
  --    row, and a concurrent second request loses the row lock race. Replay is
  --    prevented by the database, not by a prior SELECT.
  update public.driver_invitations
     set status      = 'accepted',
         accepted_at = now(),
         accepted_by = p_caller_id
   where token_hash  = p_token_hash
     and status      = 'pending'
     and accepted_at is null
     and expires_at  > now()
  returning driver_invitations.driver_id,
            driver_invitations.organization_id,
            driver_invitations.email
       into v_driver_id, v_org_id, v_inv_email;

  if not found then
    -- One answer for four causes, so a caller cannot probe which one applies.
    raise exception 'INVITATION_NOT_REDEEMABLE' using errcode = 'MV404';
  end if;

  -- 4. The account accepting must be the account invited. Raising here aborts
  --    the transaction, so the UPDATE above is undone and the invitation stays
  --    pending — a wrong account cannot burn someone else's invitation.
  if v_auth_email <> lower(trim(coalesce(v_inv_email, ''))) then
    raise exception 'EMAIL_MISMATCH' using errcode = 'MV403';
  end if;

  -- 5. Bind the driver. The id comes from the invitation row alone. The
  --    user_id IS NULL condition, together with drivers_user_id_unique, makes a
  --    second binding impossible.
  update public.drivers
     set user_id    = p_caller_id,
         updated_at = now()
   where id         = v_driver_id
     and user_id is null
  returning drivers.name into v_name;

  if not found then
    raise exception 'DRIVER_ALREADY_BOUND' using errcode = 'MV409';
  end if;

  -- 6. Promote the profile. UPSERT rather than UPDATE: handle_new_user swallows
  --    its errors, so the row may be missing even though the account exists.
  --    role and organization_id are set from the invitation and from this
  --    function; the client has no way to supply either. The display name comes
  --    from the driver record entered by the office, never from user metadata.
  insert into public.users (id, email, name, role, organization_id)
  values (p_caller_id, v_auth_email, v_name, 'driver', v_org_id)
  on conflict (id) do update
     set email           = excluded.email,
         role            = 'driver',
         organization_id = excluded.organization_id,
         updated_at      = now();

  -- 7. Nothing else is disclosed: no token, no hash, no email, no org details.
  return query select v_driver_id, v_org_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_user(p_email text, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_target public.users;
begin
  if auth.uid() is null or v_org is null or public.auth_role() is distinct from 'admin' then
    raise exception 'ADMIN_ONLY' using errcode = 'MV403';
  end if;
  if p_role not in ('admin', 'dispatcher') then
    raise exception 'INVALID_ROLE' using errcode = 'MV400';
  end if;
  select * into v_target from public.users
   where lower(email) = lower(trim(p_email)) for update;
  if not found or v_target.organization_id is not null
     or coalesce(v_target.role, 'pending') not in ('pending', 'user') then
    raise exception 'ACCOUNT_NOT_AVAILABLE' using errcode = 'MV404';
  end if;
  update public.users
     set organization_id = v_org, role = p_role, onboarding_completed = true, updated_at = now()
   where id = v_target.id;
  insert into public.audit_log (actor_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'user.added', 'user', v_target.id, jsonb_build_object('role', p_role, 'organization_id', v_org));
  return v_target.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_remove_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_target public.users := public.team_guard(p_user);
  v_org    uuid := public.auth_org_id();
begin
  if v_target.role = 'admin' and
     (select count(*) from public.users u where u.organization_id = v_org and u.role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'MV409';
  end if;
  update public.drivers set user_id = null, updated_at = now()
   where user_id = p_user and organization_id = v_org;
  update public.users set role = 'pending', organization_id = null, updated_at = now() where id = p_user;
  insert into public.audit_log (actor_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'user.removed', 'user', p_user,
          jsonb_build_object('role', v_target.role, 'organization_id', v_org));
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_target public.users := public.team_guard(p_user);
  v_org    uuid := public.auth_org_id();
  v_is_driver boolean := exists (select 1 from public.drivers d where d.user_id = p_user and d.organization_id = v_org);
begin
  if p_role not in ('admin', 'dispatcher', 'driver', 'disabled') then
    raise exception 'INVALID_ROLE' using errcode = 'MV400';
  end if;
  if p_role = 'driver' and not v_is_driver then
    raise exception 'NOT_A_DRIVER_ACCOUNT' using errcode = 'MV409';
  end if;
  if v_is_driver and p_role in ('admin', 'dispatcher') then
    raise exception 'DRIVER_ACCOUNT' using errcode = 'MV409';
  end if;
  if v_target.role = 'admin' and p_role <> 'admin' and
     (select count(*) from public.users u where u.organization_id = v_org and u.role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'MV409';
  end if;

  update public.users set role = p_role, updated_at = now() where id = p_user;
  insert into public.audit_log (actor_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'user.role_changed', 'user', p_user,
          jsonb_build_object('from', v_target.role, 'to', p_role, 'organization_id', v_org));
end;
$function$;

CREATE OR REPLACE FUNCTION public.auth_driver_id()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id
  from public.drivers d
  where d.user_id = auth.uid()
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.auth_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id from public.users where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.users where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.create_driver_invitation(p_caller_id uuid, p_driver_id integer, p_email text, p_token_hash text, p_expires_at timestamp with time zone)
 RETURNS TABLE(invitation_id uuid, driver_id integer, organization_id uuid, email text, expires_at timestamp with time zone, auth_account_exists boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role        text;
  v_org         uuid;
  v_driver_org  uuid;
  v_driver_user uuid;
  v_driver_mail text;
  v_max         integer;
  v_count       integer;
  v_id          uuid;
begin
  -- Argument sanity. These are programming errors, not user input errors.
  if p_caller_id is null or p_driver_id is null
     or p_token_hash is null or length(p_token_hash) <> 64
     or p_expires_at is null or p_expires_at <= now() then
    raise exception 'INVALID_ARGUMENTS' using errcode = 'MV412';
  end if;

  -- 1. Caller authority — read from the table, never from a parameter.
  select u.role, u.organization_id into v_role, v_org
    from public.users u
   where u.id = p_caller_id;

  if v_role is null
     or v_role not in ('admin', 'dispatcher')
     or v_org is null then
    raise exception 'FORBIDDEN' using errcode = 'MV403';
  end if;

  -- 2. Driver must exist AND belong to the caller's organization. Both
  --    conditions collapse into one "not found" so a caller cannot probe for
  --    the existence of another organization's driver.
  select d.organization_id, d.user_id, lower(trim(d.email))
    into v_driver_org, v_driver_user, v_driver_mail
    from public.drivers d
   where d.id = p_driver_id
   for update;

  if v_driver_org is null or v_driver_org <> v_org then
    raise exception 'DRIVER_NOT_FOUND' using errcode = 'MV404';
  end if;

  -- 3. Already linked to an auth account.
  if v_driver_user is not null then
    raise exception 'DRIVER_ALREADY_LINKED' using errcode = 'MV409';
  end if;

  -- 4. Email is taken from the driver record. The caller's value must match it
  --    exactly after normalisation, so a stale client cannot invite a different
  --    address than the one stored.
  if v_driver_mail is null or v_driver_mail = ''
     or position('@' in v_driver_mail) < 2
     or v_driver_mail <> lower(trim(coalesce(p_email, ''))) then
    raise exception 'INVALID_EMAIL' using errcode = 'MV412';
  end if;

  -- 5. Plan limit. Inviting an EXISTING driver does not create one, so the
  --    driver count is unchanged and the limit cannot be exceeded by this
  --    operation. The guard is written as "would this exceed the limit" rather
  --    than "is the organization at the limit" on purpose: the latter would
  --    block inviting the last driver of a full plan, and would block this
  --    organization outright (it currently holds 6 drivers against
  --    max_drivers = 5). A future path that CREATES a driver must add +1 here.
  select o.max_drivers into v_max
    from public.organizations o
   where o.id = v_org;

  select count(*) into v_count
    from public.drivers d
   where d.organization_id = v_org;

  if v_max is not null and v_count > v_max then
    -- Reached only by a path that adds a driver; kept for that future use.
    if false then
      raise exception 'PLAN_LIMIT_REACHED' using errcode = 'MV411';
    end if;
  end if;

  -- 6. One open invitation per driver. The partial unique index is the real
  --    guard; this check exists to return a clean 409 in the common case.
  if exists (select 1 from public.driver_invitations i
              where i.driver_id = p_driver_id and i.status = 'pending') then
    raise exception 'ACTIVE_INVITATION_EXISTS' using errcode = 'MV410';
  end if;

  -- 7. Insert. A concurrent transaction that got past step 6 loses here.
  begin
    insert into public.driver_invitations
      (organization_id, driver_id, email, token_hash, status, expires_at, created_by)
    values
      (v_org, p_driver_id, v_driver_mail, p_token_hash, 'pending', p_expires_at, p_caller_id)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'ACTIVE_INVITATION_EXISTS' using errcode = 'MV410';
  end;

  return query
    select v_id, p_driver_id, v_org, v_driver_mail, p_expires_at,
           exists (select 1 from auth.users a where lower(a.email) = v_driver_mail);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_organization(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_name  text := trim(coalesce(p_name, ''));
  v_email text;
  v_org   uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'MV401';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'INVALID_NAME' using errcode = 'MV400';
  end if;

  select lower(trim(a.email)) into v_email from auth.users a where a.id = v_uid;

  perform 1 from public.users u where u.id = v_uid for update;
  if not found then
    insert into public.users (id, email, role, organization_id)
    values (v_uid, v_email, 'pending', null);
  end if;

  if exists (select 1 from public.users u
              where u.id = v_uid
                and (u.organization_id is not null
                     or coalesce(u.role, 'pending') not in ('pending', 'user'))) then
    raise exception 'ALREADY_IN_ORGANIZATION' using errcode = 'MV409';
  end if;

  insert into public.organizations (name, owner_id, email)
  values (v_name, v_uid, v_email)
  returning id into v_org;

  update public.users
     set organization_id      = v_org,
         role                 = 'admin',
         onboarding_completed = true,
         updated_at           = now()
   where id = v_uid;

  insert into public.audit_log (actor_id, action, resource_type, resource_id)
  values (v_uid, 'organization.created', 'organization', v_org);

  return v_org;
end;
$function$;

CREATE OR REPLACE FUNCTION public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$function$;

CREATE OR REPLACE FUNCTION public.driver_report_location(p_lat double precision, p_lng double precision, p_heading double precision DEFAULT NULL::double precision, p_speed_mps double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_driver  integer := public.auth_driver_id();
  v_org     uuid := public.auth_org_id();
  v_vehicle integer;
  v_job     integer;
  v_speed   double precision;
  v_last    timestamptz;
begin
  if v_driver is null or v_org is null or public.auth_role() is distinct from 'driver' then
    raise exception 'NOT_A_DRIVER' using errcode = 'MV403';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (p_lat = 0 and p_lng = 0) then
    raise exception 'INVALID_POSITION' using errcode = 'MV400';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 5000) then
    raise exception 'INACCURATE_POSITION' using errcode = 'MV400';
  end if;

  v_speed := case when p_speed_mps is null or p_speed_mps < 0 then null
                  else round((p_speed_mps * 2.236936)::numeric, 1)::double precision end;

  update public.drivers
     set location_lat        = p_lat,
         location_lng        = p_lng,
         heading             = case when p_heading between 0 and 360 then p_heading else heading end,
         speed               = coalesce(round(v_speed)::integer, speed),
         location_updated_at = now()
   where id = v_driver and organization_id = v_org
  returning vehicle_id into v_vehicle;

  select id into v_job from public.jobs
   where driver_id = v_driver and organization_id = v_org
     and status in ('in_progress', 'assigned', 'pending')
   order by (status = 'in_progress') desc, scheduled_date nulls last, updated_at desc
   limit 1;
  if v_vehicle is null and v_job is not null then
    select vehicle_id into v_vehicle from public.jobs where id = v_job;
  end if;

  update public.vehicles
     set location_lat = p_lat, location_lng = p_lng, updated_at = now()
   where organization_id = v_org
     and (id = v_vehicle or driver_id = v_driver);

  select max(recorded_at) into v_last from public.driver_positions where driver_id = v_driver;
  if v_last is null or v_last < now() - interval '10 seconds' then
    insert into public.driver_positions
      (organization_id, driver_id, vehicle_id, job_id, lat, lng, heading, speed_mph, accuracy_m)
    values (v_org, v_driver, v_vehicle, v_job, p_lat, p_lng,
            case when p_heading between 0 and 360 then p_heading end, v_speed, p_accuracy_m);
  end if;

  if p_accuracy_m is null or p_accuracy_m <= 100 then
    perform public.evaluate_geofences(v_driver, v_org, p_lat, p_lng);
  end if;

  return now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.driver_update_stop(p_job_id integer, p_stop_index integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_driver integer := public.auth_driver_id();
  v_stops  jsonb;
  v_status public.job_status;
  v_stop   jsonb;
begin
  if v_driver is null or public.auth_role() is distinct from 'driver' then
    raise exception 'NOT_A_DRIVER' using errcode = 'MV403';
  end if;
  if p_status not in ('arrived', 'completed') then
    raise exception 'INVALID_STATUS' using errcode = 'MV400';
  end if;

  select coalesce(j.stops, '[]'::jsonb), j.status into v_stops, v_status
    from public.jobs j
   where j.id = p_job_id
     and j.driver_id = v_driver
     and j.organization_id = public.auth_org_id()
   for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'MV404';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'JOB_CLOSED' using errcode = 'MV409';
  end if;
  if p_stop_index < 0 or p_stop_index >= jsonb_array_length(v_stops) then
    raise exception 'STOP_NOT_FOUND' using errcode = 'MV404';
  end if;

  v_stop := v_stops -> p_stop_index;
  if p_status = 'arrived' then
    v_stop := v_stop || jsonb_build_object('status', 'arrived', 'arrived_at', now());
  else
    v_stop := v_stop || jsonb_build_object('status', 'completed', 'completed_at', now());
  end if;
  v_stops := jsonb_set(v_stops, array[p_stop_index::text], v_stop);

  update public.jobs
     set stops      = v_stops,
         status     = case when status in ('pending', 'assigned') then 'in_progress'::public.job_status else status end,
         updated_at = now()
   where id = p_job_id;

  return v_stops;
end;
$function$;

CREATE OR REPLACE FUNCTION public.drivers_preserve_driver_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user = 'authenticated' then
    new.id              := old.id;
    new.user_id         := old.user_id;
    new.organization_id := old.organization_id;

    if public.auth_role() = 'driver' then
      new.name             := old.name;
      new.email            := old.email;
      new.phone            := old.phone;
      new.license_type     := old.license_type;
      new.license_expiry   := old.license_expiry;
      new.hours_today      := old.hours_today;
      new.hours_week       := old.hours_week;
      new.rating           := old.rating;
      new.total_deliveries := old.total_deliveries;
      new.vehicle_id       := old.vehicle_id;
      new.created_at       := old.created_at;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.evaluate_geofences(p_driver integer, p_org uuid, p_lat double precision, p_lng double precision)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        record;
  t        record;
  v_dist   double precision;
  v_events integer := 0;
  v_stops  jsonb;
  v_idx    integer;
begin
  for j in
    select id, status, pickup_lat, pickup_lng, delivery_lat, delivery_lng, coalesce(stops, '[]'::jsonb) stops
      from public.jobs
     where driver_id = p_driver and organization_id = p_org
       and status in ('pending', 'assigned', 'in_progress')
     for update
  loop
    v_stops := j.stops;
    for t in
      select 'pickup' as target, j.pickup_lat as lat, j.pickup_lng as lng
      union all
      select 'stop:' || (e.ord - 1), (e.s->>'lat')::double precision, (e.s->>'lng')::double precision
        from jsonb_array_elements(j.stops) with ordinality as e(s, ord)
      union all
      select 'delivery', j.delivery_lat, j.delivery_lng
    loop
      continue when t.lat is null or t.lng is null;
      v_dist := public.distance_m(p_lat, p_lng, t.lat, t.lng);

      if v_dist <= 150 then
        insert into public.geofence_events (organization_id, job_id, driver_id, target, event_type, lat, lng, distance_m)
        values (p_org, j.id, p_driver, t.target, 'arrival', p_lat, p_lng, round(v_dist))
        on conflict (job_id, target, event_type) do nothing;
        if found then
          v_events := v_events + 1;
          if t.target like 'stop:%' then
            v_idx := substr(t.target, 6)::integer;
            if coalesce(v_stops -> v_idx ->> 'status', 'pending') = 'pending' then
              v_stops := jsonb_set(v_stops, array[v_idx::text],
                (v_stops -> v_idx) || jsonb_build_object('status', 'arrived', 'arrived_at', now()));
            end if;
          end if;
        end if;
      elsif v_dist > 300 and exists (
          select 1 from public.geofence_events g
           where g.job_id = j.id and g.target = t.target and g.event_type = 'arrival') then
        insert into public.geofence_events (organization_id, job_id, driver_id, target, event_type, lat, lng, distance_m)
        values (p_org, j.id, p_driver, t.target, 'departure', p_lat, p_lng, round(v_dist))
        on conflict (job_id, target, event_type) do nothing;
        if found then v_events := v_events + 1; end if;
      end if;
    end loop;

    if v_stops is distinct from j.stops
       or (j.status in ('pending', 'assigned') and exists (
             select 1 from public.geofence_events g
              where g.job_id = j.id and g.target = 'pickup' and g.event_type = 'arrival')) then
      update public.jobs
         set stops = v_stops,
             status = case when status in ('pending', 'assigned')
                             and exists (select 1 from public.geofence_events g
                                          where g.job_id = j.id and g.target = 'pickup' and g.event_type = 'arrival')
                           then 'in_progress'::public.job_status else status end,
             updated_at = now()
       where id = j.id;
    end if;
  end loop;
  return v_events;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(reference text, customer text, status text, delivery_address text, delivery_lat double precision, delivery_lng double precision, eta timestamp with time zone, pod_status text, driver_name text, driver_heading double precision, driver_location_lat double precision, driver_location_lng double precision, driver_location_updated_at timestamp with time zone, vehicle_id text, vehicle_make text, vehicle_model text, vehicle_registration text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.users (id, email, name, role, organization_id)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    'pending',
    null
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Never break the signup. Surfaced in the Postgres logs instead.
    raise warning 'handle_new_user: profile not created for % (%)', new.id, sqlerrm;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jobs_driver_field_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    if new.status is distinct from old.status
       and new.status not in ('in_progress', 'completed') then
      new.status := old.status;
    end if;
    if old.status = 'completed' then
      new.status := old.status;
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_vehicle_allowance()
 RETURNS TABLE(plan text, max_vehicles integer, used integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_plan  text;
  v_limit integer;
  v_used  integer;
begin
  if v_org is null then
    return;
  end if;

  select o.plan::text, o.max_vehicles into v_plan, v_limit
    from public.organizations o
   where o.id = v_org;

  select count(*)::int into v_used
    from public.vehicles v
   where v.organization_id = v_org;

  return query select v_plan, v_limit, v_used;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_vehicle_allowance_locked()
 RETURNS TABLE(plan text, max_vehicles integer, used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_plan  text;
  v_limit integer;
  v_used  integer;
begin
  if v_org is null then
    return;
  end if;

  -- Locking this tenant's own organisation row serialises its vehicle inserts,
  -- so two concurrent requests cannot both read the same count and both pass.
  select o.plan::text, o.max_vehicles into v_plan, v_limit
    from public.organizations o
   where o.id = v_org
     for update;

  if not found then
    return;
  end if;

  select count(*)::int into v_used
    from public.vehicles v
   where v.organization_id = v_org;

  return query select v_plan, v_limit, v_used;
end;
$function$;

CREATE OR REPLACE FUNCTION public.organizations_preserve_billing_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.id                 := old.id;
    new.slug               := old.slug;
    new.owner_id           := old.owner_id;
    new.stripe_customer_id := old.stripe_customer_id;
    new.plan               := old.plan;
    new.plan_status        := old.plan_status;
    new.trial_ends_at      := old.trial_ends_at;
    new.max_vehicles       := old.max_vehicles;
    new.max_drivers        := old.max_drivers;
    new.created_at         := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.same_org_refs(p_driver integer, p_vehicle integer, p_job integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.drivers d where d.id = p_driver and d.organization_id = public.auth_org_id())
     and (p_vehicle is null or exists (select 1 from public.vehicles v where v.id = p_vehicle and v.organization_id = public.auth_org_id()))
     and (p_job is null or exists (select 1 from public.jobs j where j.id = p_job and j.organization_id = public.auth_org_id()));
$function$;

CREATE OR REPLACE FUNCTION public.set_org_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.organization_id := public.auth_org_id();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_guard(p_target uuid)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_org    uuid := public.auth_org_id();
  v_target public.users;
begin
  if v_caller is null or v_org is null or public.auth_role() is distinct from 'admin' then
    raise exception 'ADMIN_ONLY' using errcode = 'MV403';
  end if;
  select * into v_target from public.users where id = p_target and organization_id = v_org for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'MV404';
  end if;
  if p_target = v_caller then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'MV409';
  end if;
  if exists (select 1 from public.organizations o where o.id = v_org and o.owner_id = p_target) then
    raise exception 'OWNER_PROTECTED' using errcode = 'MV409';
  end if;
  return v_target;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_incidents_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.users_preserve_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role                   := OLD.role;
    NEW.organization_id        := OLD.organization_id;
    NEW.subscription_plan      := OLD.subscription_plan;
    NEW.subscription_status    := OLD.subscription_status;
    NEW.stripe_customer_id     := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vehicles_enforce_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a record;
begin
  -- SECURITY INVOKER on purpose: current_user is the real caller. service_role
  -- and postgres stay exempt, the same exemption set_org_on_insert and
  -- organizations_preserve_billing_fields already use, so Edge Functions,
  -- support tooling and migrations keep working.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if current_user = 'anon' then
    raise exception 'Sign in to add a vehicle.'
      using errcode = 'MV422';
  end if;

  if new.organization_id is null or new.organization_id is distinct from public.auth_org_id() then
    raise exception 'This vehicle is not linked to your organisation, so it cannot be added.'
      using errcode = 'MV422';
  end if;

  select * into a from public.my_vehicle_allowance_locked();

  if a.max_vehicles is null then
    raise exception 'This organisation has no plan, so vehicles cannot be added.'
      using errcode = 'MV422';
  end if;

  if a.used >= a.max_vehicles then
    raise exception
      'Your % plan covers % vehicle(s) and you already have %. Increase the vehicle quantity on your subscription to add more.',
      coalesce(a.plan, 'current'), a.max_vehicles, a.used
      using errcode = 'MV409';
  end if;

  return new;
end;
$function$;

-- Triggers

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER drivers_driver_guard BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION drivers_preserve_driver_fields();
CREATE TRIGGER drivers_set_org_on_insert BEFORE INSERT ON public.drivers FOR EACH ROW EXECUTE FUNCTION set_org_on_insert();
CREATE TRIGGER fleet_maintenance_set_org_on_insert BEFORE INSERT ON public.fleet_maintenance FOR EACH ROW EXECUTE FUNCTION set_org_on_insert();
CREATE TRIGGER incidents_updated_at BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION update_incidents_updated_at();
CREATE TRIGGER jobs_driver_field_guard BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION jobs_driver_field_guard();
CREATE TRIGGER jobs_set_org_on_insert BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION set_org_on_insert();
CREATE TRIGGER messages_set_org_on_insert BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION set_org_on_insert();
CREATE TRIGGER organizations_billing_guard BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION organizations_preserve_billing_fields();
CREATE TRIGGER users_preserve_privileged_fields BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION users_preserve_privileged_fields();
CREATE TRIGGER vehicles_set_org_on_insert BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION set_org_on_insert();
CREATE TRIGGER vehicles_within_plan_limit BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION vehicles_enforce_plan_limit();

-- Row level security

alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.documents enable row level security;
alter table public.driver_invitations enable row level security;
alter table public.driver_positions enable row level security;
alter table public.drivers enable row level security;
alter table public.fleet_maintenance enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.geofence_events enable row level security;
alter table public.incidents enable row level security;
alter table public.jobs enable row level security;
alter table public.messages enable row level security;
alter table public.organizations enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.users enable row level security;
alter table public.vehicles enable row level security;

-- Policies (public)

create policy app_settings_insert on public.app_settings as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id IS NOT NULL) AND (organization_id = auth_org_id())));
create policy app_settings_select on public.app_settings as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND ((organization_id IS NULL) OR (organization_id = auth_org_id()))));
create policy app_settings_update on public.app_settings as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id IS NOT NULL) AND (organization_id = auth_org_id())));
create policy audit_log_admin_select on public.audit_log as permissive for select to authenticated
  using (((auth_role() = 'admin'::text) AND (((changes ->> 'organization_id'::text) = (auth_org_id())::text) OR ((resource_type = 'organization'::text) AND (resource_id = auth_org_id())))));
create policy documents_delete on public.documents as permissive for delete to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy documents_insert on public.documents as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (uploaded_by = auth.uid()) AND (storage_path ~~ ((auth_org_id())::text || '/%'::text))));
create policy documents_select on public.documents as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy driver_positions_dispatch_select on public.driver_positions as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy driver_positions_driver_select on public.driver_positions as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id())));
create policy drivers_dispatcher_admin_delete on public.drivers as permissive for delete to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (user_id IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (j.driver_id = drivers.id))))));
create policy drivers_dispatcher_admin_insert on public.drivers as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL) AND (user_id IS NULL)));
create policy drivers_dispatcher_admin_select on public.drivers as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy drivers_dispatcher_admin_update on public.drivers as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy drivers_driver_select on public.drivers as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (id = auth_driver_id()) AND (organization_id = auth_org_id())));
create policy drivers_driver_update on public.drivers as permissive for update to authenticated
  using (((auth_role() = 'driver'::text) AND (id = auth_driver_id()) AND (organization_id = auth_org_id())))
  with check (((auth_role() = 'driver'::text) AND (id = auth_driver_id()) AND (organization_id = auth_org_id())));
create policy fleet_maintenance_dispatcher_admin_insert on public.fleet_maintenance as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy fleet_maintenance_dispatcher_admin_select on public.fleet_maintenance as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy fleet_maintenance_dispatcher_admin_update on public.fleet_maintenance as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy fleet_maintenance_driver_insert on public.fleet_maintenance as permissive for insert to authenticated
  with check (((auth_role() = 'driver'::text) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL) AND (vehicle_id = ( SELECT d.vehicle_id
   FROM drivers d
  WHERE (d.id = auth_driver_id())))));
create policy fleet_maintenance_driver_select on public.fleet_maintenance as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (organization_id = auth_org_id()) AND (vehicle_id = ( SELECT d.vehicle_id
   FROM drivers d
  WHERE (d.id = auth_driver_id())))));
create policy fuel_logs_dispatcher_admin_delete on public.fuel_logs as permissive for delete to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = fuel_logs.driver_id) AND (d.organization_id = auth_org_id()))))));
create policy fuel_logs_dispatcher_admin_insert on public.fuel_logs as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (driver_id IS NOT NULL) AND same_org_refs(driver_id, vehicle_id, NULL::integer)));
create policy fuel_logs_dispatcher_admin_select on public.fuel_logs as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = fuel_logs.driver_id) AND (d.organization_id = auth_org_id()))))));
create policy fuel_logs_driver_insert on public.fuel_logs as permissive for insert to authenticated
  with check (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id()) AND same_org_refs(driver_id, vehicle_id, NULL::integer)));
create policy fuel_logs_driver_select on public.fuel_logs as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id())));
create policy geofence_events_dispatch_select on public.geofence_events as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy geofence_events_driver_select on public.geofence_events as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id())));
create policy incidents_dispatcher_admin_delete on public.incidents as permissive for delete to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = incidents.driver_id) AND (d.organization_id = auth_org_id()))))));
create policy incidents_dispatcher_admin_insert on public.incidents as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (driver_id IS NOT NULL) AND same_org_refs(driver_id, vehicle_id, job_id)));
create policy incidents_dispatcher_admin_select on public.incidents as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = incidents.driver_id) AND (d.organization_id = auth_org_id()))))));
create policy incidents_dispatcher_admin_update on public.incidents as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = incidents.driver_id) AND (d.organization_id = auth_org_id()))))))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = incidents.driver_id) AND (d.organization_id = auth_org_id()))))));
create policy incidents_driver_insert on public.incidents as permissive for insert to authenticated
  with check (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id()) AND same_org_refs(driver_id, vehicle_id, job_id)));
create policy incidents_driver_select on public.incidents as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id())));
create policy jobs_dispatcher_admin_delete on public.jobs as permissive for delete to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (pod_photo_url IS NULL) AND (pod_signature IS NULL)));
create policy jobs_dispatcher_admin_insert on public.jobs as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy jobs_dispatcher_admin_select on public.jobs as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy jobs_dispatcher_admin_update on public.jobs as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy jobs_driver_select on public.jobs as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id()) AND (organization_id = auth_org_id())));
create policy jobs_driver_update on public.jobs as permissive for update to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id()) AND (organization_id = auth_org_id())))
  with check (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id()) AND (organization_id = auth_org_id())));
create policy messages_dispatcher_admin_insert on public.messages as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL) AND (sender_id = (auth.uid())::text)));
create policy messages_dispatcher_admin_select on public.messages as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy messages_dispatcher_admin_update on public.messages as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy messages_driver_insert on public.messages as permissive for insert to authenticated
  with check (((auth_role() = 'driver'::text) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL) AND (sender_id = (auth.uid())::text)));
create policy messages_driver_select on public.messages as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (organization_id = auth_org_id()) AND ((sender_id = (auth.uid())::text) OR (recipient_id = (auth.uid())::text) OR (recipient_id = 'broadcast'::text))));
create policy organizations_admin_update on public.organizations as permissive for update to authenticated
  using (((id = auth_org_id()) AND (auth_role() = 'admin'::text)))
  with check (((id = auth_org_id()) AND (auth_role() = 'admin'::text)));
create policy organizations_member_select on public.organizations as permissive for select to authenticated
  using ((id = auth_org_id()));
create policy users_org_select on public.users as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy users_select_own on public.users as permissive for select to authenticated
  using ((id = auth.uid()));
create policy users_update_own on public.users as permissive for update to authenticated
  using ((id = auth.uid()))
  with check ((id = auth.uid()));
create policy vehicles_dispatcher_admin_delete on public.vehicles as permissive for delete to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy vehicles_dispatcher_admin_insert on public.vehicles as permissive for insert to authenticated
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy vehicles_dispatcher_admin_select on public.vehicles as permissive for select to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())));
create policy vehicles_dispatcher_admin_update on public.vehicles as permissive for update to authenticated
  using (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id())))
  with check (((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND (organization_id = auth_org_id()) AND (organization_id IS NOT NULL)));
create policy vehicles_driver_select on public.vehicles as permissive for select to authenticated
  using (((auth_role() = 'driver'::text) AND (driver_id = auth_driver_id()) AND (organization_id = auth_org_id())));

-- Table grants

revoke all on table public.app_settings from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.app_settings to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.app_settings to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.app_settings to service_role;
revoke all on table public.audit_log from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.audit_log to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.audit_log to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.audit_log to service_role;
revoke all on table public.documents from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.documents to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.documents to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.documents to service_role;
revoke all on table public.driver_invitations from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.driver_invitations to service_role;
revoke all on table public.driver_positions from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.driver_positions to service_role;
grant maintain, references, select, trigger, truncate on table public.driver_positions to anon;
grant maintain, references, select, trigger, truncate on table public.driver_positions to authenticated;
revoke all on table public.drivers from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.drivers to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.drivers to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.drivers to service_role;
revoke all on table public.fleet_maintenance from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fleet_maintenance to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fleet_maintenance to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fleet_maintenance to service_role;
revoke all on table public.fuel_logs from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fuel_logs to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fuel_logs to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fuel_logs to service_role;
revoke all on table public.geofence_events from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.geofence_events to service_role;
grant maintain, references, select, trigger, truncate on table public.geofence_events to anon;
grant maintain, references, select, trigger, truncate on table public.geofence_events to authenticated;
revoke all on table public.incidents from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.incidents to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.incidents to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.incidents to service_role;
revoke all on table public.jobs from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.jobs to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.jobs to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.jobs to service_role;
revoke all on table public.messages from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.messages to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.messages to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.messages to service_role;
revoke all on table public.organizations from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.organizations to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.organizations to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.organizations to service_role;
revoke all on table public.permissions from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.permissions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.permissions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.permissions to service_role;
revoke all on table public.role_permissions from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.role_permissions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.role_permissions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.role_permissions to service_role;
revoke all on table public.users from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.users to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.users to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.users to service_role;
revoke all on table public.vehicles from anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.vehicles to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.vehicles to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.vehicles to service_role;

-- Sequence grants

grant select, update, usage on sequence public.driver_positions_id_seq to anon;
grant select, update, usage on sequence public.driver_positions_id_seq to authenticated;
grant select, update, usage on sequence public.driver_positions_id_seq to service_role;
grant select, update, usage on sequence public.drivers_id_seq to anon;
grant select, update, usage on sequence public.drivers_id_seq to authenticated;
grant select, update, usage on sequence public.drivers_id_seq to service_role;
grant select, update, usage on sequence public.fleet_maintenance_id_seq to anon;
grant select, update, usage on sequence public.fleet_maintenance_id_seq to authenticated;
grant select, update, usage on sequence public.fleet_maintenance_id_seq to service_role;
grant select, update, usage on sequence public.fuel_logs_id_seq to anon;
grant select, update, usage on sequence public.fuel_logs_id_seq to authenticated;
grant select, update, usage on sequence public.fuel_logs_id_seq to service_role;
grant select, update, usage on sequence public.geofence_events_id_seq to anon;
grant select, update, usage on sequence public.geofence_events_id_seq to authenticated;
grant select, update, usage on sequence public.geofence_events_id_seq to service_role;
grant select, update, usage on sequence public.incidents_id_seq to anon;
grant select, update, usage on sequence public.incidents_id_seq to authenticated;
grant select, update, usage on sequence public.incidents_id_seq to service_role;
grant select, update, usage on sequence public.jobs_id_seq to anon;
grant select, update, usage on sequence public.jobs_id_seq to authenticated;
grant select, update, usage on sequence public.jobs_id_seq to service_role;
grant select, update, usage on sequence public.messages_id_seq to anon;
grant select, update, usage on sequence public.messages_id_seq to authenticated;
grant select, update, usage on sequence public.messages_id_seq to service_role;
grant select, update, usage on sequence public.vehicles_id_seq to anon;
grant select, update, usage on sequence public.vehicles_id_seq to authenticated;
grant select, update, usage on sequence public.vehicles_id_seq to service_role;

-- Function grants

revoke all on function public.accept_driver_invitation(p_caller_id uuid, p_token_hash text) from public, anon, authenticated, service_role;
grant execute on function public.accept_driver_invitation(p_caller_id uuid, p_token_hash text) to service_role;
revoke all on function public.admin_add_user(p_email text, p_role text) from public, anon, authenticated, service_role;
grant execute on function public.admin_add_user(p_email text, p_role text) to authenticated;
grant execute on function public.admin_add_user(p_email text, p_role text) to service_role;
revoke all on function public.admin_remove_user(p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_remove_user(p_user uuid) to authenticated;
grant execute on function public.admin_remove_user(p_user uuid) to service_role;
revoke all on function public.admin_set_user_role(p_user uuid, p_role text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_user_role(p_user uuid, p_role text) to authenticated;
grant execute on function public.admin_set_user_role(p_user uuid, p_role text) to service_role;
revoke all on function public.auth_driver_id() from public, anon, authenticated, service_role;
grant execute on function public.auth_driver_id() to authenticated;
grant execute on function public.auth_driver_id() to service_role;
revoke all on function public.auth_org_id() from public, anon, authenticated, service_role;
grant execute on function public.auth_org_id() to authenticated;
grant execute on function public.auth_org_id() to service_role;
revoke all on function public.auth_role() from public, anon, authenticated, service_role;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_role() to service_role;
revoke all on function public.create_driver_invitation(p_caller_id uuid, p_driver_id integer, p_email text, p_token_hash text, p_expires_at timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.create_driver_invitation(p_caller_id uuid, p_driver_id integer, p_email text, p_token_hash text, p_expires_at timestamp with time zone) to service_role;
revoke all on function public.create_organization(p_name text) from public, anon, authenticated, service_role;
grant execute on function public.create_organization(p_name text) to authenticated;
grant execute on function public.create_organization(p_name text) to service_role;
revoke all on function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) from public, anon, authenticated, service_role;
grant execute on function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) to anon;
grant execute on function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) to authenticated;
grant execute on function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) to public;
grant execute on function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) to service_role;
revoke all on function public.driver_report_location(p_lat double precision, p_lng double precision, p_heading double precision, p_speed_mps double precision, p_accuracy_m double precision) from public, anon, authenticated, service_role;
grant execute on function public.driver_report_location(p_lat double precision, p_lng double precision, p_heading double precision, p_speed_mps double precision, p_accuracy_m double precision) to authenticated;
grant execute on function public.driver_report_location(p_lat double precision, p_lng double precision, p_heading double precision, p_speed_mps double precision, p_accuracy_m double precision) to service_role;
revoke all on function public.driver_update_stop(p_job_id integer, p_stop_index integer, p_status text) from public, anon, authenticated, service_role;
grant execute on function public.driver_update_stop(p_job_id integer, p_stop_index integer, p_status text) to authenticated;
grant execute on function public.driver_update_stop(p_job_id integer, p_stop_index integer, p_status text) to service_role;
revoke all on function public.drivers_preserve_driver_fields() from public, anon, authenticated, service_role;
grant execute on function public.drivers_preserve_driver_fields() to anon;
grant execute on function public.drivers_preserve_driver_fields() to authenticated;
grant execute on function public.drivers_preserve_driver_fields() to public;
grant execute on function public.drivers_preserve_driver_fields() to service_role;
revoke all on function public.evaluate_geofences(p_driver integer, p_org uuid, p_lat double precision, p_lng double precision) from public, anon, authenticated, service_role;
grant execute on function public.evaluate_geofences(p_driver integer, p_org uuid, p_lat double precision, p_lng double precision) to service_role;
revoke all on function public.get_tracking(p_token text) from public, anon, authenticated, service_role;
grant execute on function public.get_tracking(p_token text) to anon;
grant execute on function public.get_tracking(p_token text) to authenticated;
grant execute on function public.get_tracking(p_token text) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
revoke all on function public.jobs_driver_field_guard() from public, anon, authenticated, service_role;
grant execute on function public.jobs_driver_field_guard() to anon;
grant execute on function public.jobs_driver_field_guard() to authenticated;
grant execute on function public.jobs_driver_field_guard() to public;
grant execute on function public.jobs_driver_field_guard() to service_role;
revoke all on function public.my_vehicle_allowance() from public, anon, authenticated, service_role;
grant execute on function public.my_vehicle_allowance() to authenticated;
grant execute on function public.my_vehicle_allowance() to service_role;
revoke all on function public.my_vehicle_allowance_locked() from public, anon, authenticated, service_role;
grant execute on function public.my_vehicle_allowance_locked() to authenticated;
grant execute on function public.my_vehicle_allowance_locked() to service_role;
revoke all on function public.organizations_preserve_billing_fields() from public, anon, authenticated, service_role;
grant execute on function public.organizations_preserve_billing_fields() to anon;
grant execute on function public.organizations_preserve_billing_fields() to authenticated;
grant execute on function public.organizations_preserve_billing_fields() to public;
grant execute on function public.organizations_preserve_billing_fields() to service_role;
revoke all on function public.same_org_refs(p_driver integer, p_vehicle integer, p_job integer) from public, anon, authenticated, service_role;
grant execute on function public.same_org_refs(p_driver integer, p_vehicle integer, p_job integer) to authenticated;
grant execute on function public.same_org_refs(p_driver integer, p_vehicle integer, p_job integer) to service_role;
revoke all on function public.set_org_on_insert() from public, anon, authenticated, service_role;
grant execute on function public.set_org_on_insert() to anon;
grant execute on function public.set_org_on_insert() to authenticated;
grant execute on function public.set_org_on_insert() to public;
grant execute on function public.set_org_on_insert() to service_role;
revoke all on function public.team_guard(p_target uuid) from public, anon, authenticated, service_role;
grant execute on function public.team_guard(p_target uuid) to service_role;
revoke all on function public.update_incidents_updated_at() from public, anon, authenticated, service_role;
grant execute on function public.update_incidents_updated_at() to anon;
grant execute on function public.update_incidents_updated_at() to authenticated;
grant execute on function public.update_incidents_updated_at() to public;
grant execute on function public.update_incidents_updated_at() to service_role;
revoke all on function public.users_preserve_privileged_fields() from public, anon, authenticated, service_role;
grant execute on function public.users_preserve_privileged_fields() to anon;
grant execute on function public.users_preserve_privileged_fields() to authenticated;
grant execute on function public.users_preserve_privileged_fields() to public;
grant execute on function public.users_preserve_privileged_fields() to service_role;
revoke all on function public.vehicles_enforce_plan_limit() from public, anon, authenticated, service_role;
grant execute on function public.vehicles_enforce_plan_limit() to anon;
grant execute on function public.vehicles_enforce_plan_limit() to authenticated;
grant execute on function public.vehicles_enforce_plan_limit() to service_role;

-- Storage buckets

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('documents', 'documents', false, 20971520, '{image/jpeg,image/png,image/webp,image/tiff}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('pod-photos', 'pod-photos', false, 10485760, '{image/jpeg,image/png,image/webp,image/heic}'::text[]) on conflict (id) do nothing;

-- Storage policies

create policy documents_objects_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'documents'::text) AND (auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND ((storage.foldername(name))[1] = (auth_org_id())::text)));
create policy documents_objects_insert on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'documents'::text) AND (auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND ((storage.foldername(name))[1] = (auth_org_id())::text)));
create policy documents_objects_select on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'documents'::text) AND (auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) AND ((storage.foldername(name))[1] = (auth_org_id())::text)));
create policy pod_photos_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'pod-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND (auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text]))));
create policy pod_photos_insert on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'pod-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (((j.id)::text = (storage.foldername(objects.name))[2]) AND (j.organization_id = auth_org_id()) AND ((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) OR ((auth_role() = 'driver'::text) AND (j.driver_id = auth_driver_id()))))))));
create policy pod_photos_select on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'pod-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text])) OR ((auth_role() = 'driver'::text) AND (EXISTS ( SELECT 1
   FROM jobs j
  WHERE (((j.id)::text = (storage.foldername(objects.name))[2]) AND (j.organization_id = auth_org_id()) AND (j.driver_id = auth_driver_id()))))))));

-- Realtime

alter publication supabase_realtime add table public.drivers;
alter publication supabase_realtime add table public.fleet_maintenance;
alter publication supabase_realtime add table public.fuel_logs;
alter publication supabase_realtime add table public.incidents;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.vehicles;
