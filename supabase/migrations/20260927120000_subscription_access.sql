-- Subscription access: what an organisation can do in each billing state.
--
--   active                  full access
--   past_due                full access while Stripe retries the payment
--                           (Stripe cancels after its retries -> cancelled)
--   trial, trial_ends_at in the future
--                           full access
--   trial ended, cancelled, anything else
--                           restricted: users still sign in, see and export
--                           all their data and finish existing jobs, but
--                           cannot add jobs, vehicles or drivers until a plan
--                           is chosen. Nothing is deleted.
--
-- Checkout runs in an Edge Function with service_role, which is exempt, so a
-- restricted organisation can always subscribe. The webhook then sets
-- plan_status = active and access returns immediately.

create or replace function public.my_org_has_access()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((
    select o.plan_status in ('active', 'past_due')
        or (o.plan_status = 'trial' and o.trial_ends_at > now())
      from public.organizations o
     where o.id = public.auth_org_id()
  ), false);
$function$;

revoke all on function public.my_org_has_access() from public, anon;
grant execute on function public.my_org_has_access() to authenticated, service_role;

create or replace function public.enforce_subscription_access()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- SECURITY INVOKER: current_user is the real caller. Only signed-in users
  -- are checked; service_role and postgres (Edge Functions, support,
  -- migrations) are exempt, and anon is refused by RLS.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if not public.my_org_has_access() then
    raise exception 'Your MOViDO free trial has ended or your subscription is not active, so new jobs, vehicles and drivers cannot be added. Your data is safe. Choose a plan on the Pricing page to continue.'
      using errcode = 'MV402';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_subscription_access() from public;

-- Named *_require_active_plan so they fire before the *_set_org_on_insert and
-- *_within_plan_limit triggers (BEFORE triggers run in name order).
drop trigger if exists jobs_require_active_plan on public.jobs;
create trigger jobs_require_active_plan
  before insert on public.jobs
  for each row execute function public.enforce_subscription_access();

drop trigger if exists vehicles_require_active_plan on public.vehicles;
create trigger vehicles_require_active_plan
  before insert on public.vehicles
  for each row execute function public.enforce_subscription_access();

drop trigger if exists drivers_require_active_plan on public.drivers;
create trigger drivers_require_active_plan
  before insert on public.drivers
  for each row execute function public.enforce_subscription_access();
