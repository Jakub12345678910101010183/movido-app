-- Self-service onboarding + organisation profile.
--
-- handle_new_user() creates every new account as role 'pending' with no
-- organisation, and nothing in the product could ever create one, so a new
-- customer could sign up but never use MOViDO. create_organization() lets a
-- signed-in account that has no organisation yet create its company and
-- become its admin. Members can read their own organisation; admins can edit
-- its contact details, never its plan, limits or billing fields.

create policy organizations_member_select on public.organizations
  for select to authenticated
  using (id = public.auth_org_id());

create policy organizations_admin_update on public.organizations
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (id = public.auth_org_id() and public.auth_role() = 'admin');

create or replace function public.organizations_preserve_billing_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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
$$;

drop trigger if exists organizations_billing_guard on public.organizations;
create trigger organizations_billing_guard
  before update on public.organizations
  for each row execute function public.organizations_preserve_billing_fields();

create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- Lock the caller's profile so two concurrent calls cannot create two orgs.
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
$$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
