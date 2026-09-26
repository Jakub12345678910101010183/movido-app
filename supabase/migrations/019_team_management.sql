-- Team management for organisation admins.
--
-- users RLS only ever exposed a caller's own row, so an admin could not see or
-- manage who has access to their company. All changes go through
-- SECURITY DEFINER functions that re-check, in the database:
--   * the caller is an admin of an organisation,
--   * the target belongs to the same organisation,
--   * nobody changes their own role or removes themselves,
--   * the organisation always keeps at least one active admin,
--   * the organisation owner cannot be demoted or removed by another admin.
-- Every change is written to audit_log.

-- Admins and dispatchers can read their own organisation's members.
create policy users_org_select on public.users
  for select to authenticated
  using (public.auth_role() in ('admin', 'dispatcher') and organization_id = public.auth_org_id());

create or replace function public.team_guard(p_target uuid)
returns public.users
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.team_guard(uuid) from public, anon, authenticated;

create or replace function public.admin_set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.users := public.team_guard(p_user);
  v_org    uuid := public.auth_org_id();
  v_is_driver boolean := exists (select 1 from public.drivers d where d.user_id = p_user and d.organization_id = v_org);
begin
  if p_role not in ('admin', 'dispatcher', 'driver', 'disabled') then
    raise exception 'INVALID_ROLE' using errcode = 'MV400';
  end if;
  -- Driver access needs a linked driver record (created by the invitation).
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
$$;

create or replace function public.admin_remove_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.users := public.team_guard(p_user);
  v_org    uuid := public.auth_org_id();
begin
  if v_target.role = 'admin' and
     (select count(*) from public.users u where u.organization_id = v_org and u.role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'MV409';
  end if;
  -- Unlink the driver record (kept for job history) and detach the account.
  update public.drivers set user_id = null, updated_at = now()
   where user_id = p_user and organization_id = v_org;
  update public.users set role = 'pending', organization_id = null, updated_at = now() where id = p_user;
  insert into public.audit_log (actor_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'user.removed', 'user', p_user,
          jsonb_build_object('role', v_target.role, 'organization_id', v_org));
end;
$$;

-- Add a colleague who already has a MOViDO login but no organisation.
create or replace function public.admin_add_user(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  -- One answer for "no such account" and "belongs to another company", so
  -- this cannot be used to discover other tenants' users.
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
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_remove_user(uuid) from public, anon;
revoke all on function public.admin_add_user(text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_remove_user(uuid) to authenticated;
grant execute on function public.admin_add_user(text, text) to authenticated;

-- Admins can review their organisation's audit trail.
create policy audit_log_admin_select on public.audit_log
  for select to authenticated
  using (
    public.auth_role() = 'admin'
    and (changes ->> 'organization_id' = public.auth_org_id()::text
         or (resource_type = 'organization' and resource_id = public.auth_org_id()))
  );

-- "disabled" keeps the account in the organisation with no access at all.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['admin', 'dispatcher', 'driver', 'pending', 'disabled']));
