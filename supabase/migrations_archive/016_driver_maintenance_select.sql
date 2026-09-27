-- Drivers could report maintenance for their vehicle (INSERT) but not read it
-- back, so an insert that returns the row failed and the driver never saw
-- their own reports. Allow reading maintenance for the driver's own vehicle.
create policy fleet_maintenance_driver_select on public.fleet_maintenance
  for select to authenticated
  using (
    public.auth_role() = 'driver'
    and organization_id = public.auth_org_id()
    and vehicle_id = (select d.vehicle_id from public.drivers d where d.id = public.auth_driver_id())
  );
