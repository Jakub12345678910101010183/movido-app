-- 022 — Vehicle plan limit.
--
-- Already applied to production as five migrations (2026-09-27):
--   phase_e1_vehicle_plan_limit, _fix_role_gate, _close_tenant_leak,
--   _tighten_grants, _revoke_anon.
-- This file is their consolidated end state, so a fresh database built from
-- the repo matches production. It is idempotent.
--
-- The vehicle count is what a customer pays for: organizations.max_vehicles is
-- written by the Stripe webhook from the subscription item quantity (new
-- organisations start with the column default, 5, during the trial).
--
-- Enforcement is an INSERT guard only:
--   * existing vehicles are never removed or altered; an organisation over its
--     limit keeps its fleet and simply cannot add another vehicle;
--   * raising the quantity in Stripe lifts max_vehicles via the webhook and the
--     next insert is allowed;
--   * service_role and postgres are exempt (Edge Functions, support, migrations),
--     like set_org_on_insert and organizations_preserve_billing_fields.
--
-- Both helpers derive the organisation from auth_org_id() and take no
-- argument, so a caller can only ever read (and lock) their own tenant.

-- Read-only view of the caller's own allowance, for the UI.
create or replace function public.my_vehicle_allowance()
returns table (plan text, max_vehicles integer, used integer)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

-- Same read, locking the caller's organisation row so two concurrent inserts
-- cannot both read the same count and both pass. Used by the trigger.
create or replace function public.my_vehicle_allowance_locked()
returns table (plan text, max_vehicles integer, used integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

-- An earlier step exposed a variant taking any organisation id (cross-tenant
-- read and lock); it must not exist.
drop function if exists public.organization_vehicle_allowance_locked(uuid);

create or replace function public.vehicles_enforce_plan_limit()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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

revoke all on function public.my_vehicle_allowance() from public, anon;
grant execute on function public.my_vehicle_allowance() to authenticated, service_role;
revoke all on function public.my_vehicle_allowance_locked() from public, anon;
grant execute on function public.my_vehicle_allowance_locked() to authenticated, service_role;
revoke all on function public.vehicles_enforce_plan_limit() from public;

-- BEFORE ROW triggers fire in alphabetical order; this one must run after
-- vehicles_set_org_on_insert has stamped organization_id ('within' > 'set_…').
drop trigger if exists vehicles_within_plan_limit on public.vehicles;
create trigger vehicles_within_plan_limit
  before insert on public.vehicles
  for each row execute function public.vehicles_enforce_plan_limit();
