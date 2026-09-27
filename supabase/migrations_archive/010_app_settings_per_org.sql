-- app_settings was a single global table writable by admin/dispatcher of ANY
-- organisation (cross-tenant write). Rows with organization_id NULL become
-- read-only platform defaults; each organisation writes its own overrides.
alter table public.app_settings
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings
  add constraint app_settings_org_key_unique unique nulls not distinct (organization_id, key);

drop policy if exists app_settings_dispatcher_admin_select on public.app_settings;
drop policy if exists app_settings_dispatcher_admin_insert on public.app_settings;
drop policy if exists app_settings_dispatcher_admin_update on public.app_settings;

create policy app_settings_select on public.app_settings
  for select to authenticated
  using (public.auth_role() in ('admin','dispatcher')
         and (organization_id is null or organization_id = public.auth_org_id()));

create policy app_settings_insert on public.app_settings
  for insert to authenticated
  with check (public.auth_role() in ('admin','dispatcher')
              and organization_id is not null
              and organization_id = public.auth_org_id());

create policy app_settings_update on public.app_settings
  for update to authenticated
  using (public.auth_role() in ('admin','dispatcher')
         and organization_id = public.auth_org_id())
  with check (public.auth_role() in ('admin','dispatcher')
              and organization_id is not null
              and organization_id = public.auth_org_id());
