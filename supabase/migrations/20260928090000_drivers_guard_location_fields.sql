-- Drivers could move themselves on the office map by updating their own
-- drivers row directly (drivers_driver_update allows it and the guard trigger
-- did not cover the location fields). A future location_updated_at also froze
-- the map, because driver_report_locations only overwrites older positions.
--
-- Current location is server-controlled: for a signed-in driver the guard now
-- keeps location_lat/lng, location_updated_at, heading and speed. GPS still
-- updates them through driver_report_locations / driver_report_location, which
-- run as SECURITY DEFINER (current_user is the owner, not 'authenticated').
-- Office admins/dispatchers and push_token registration are unchanged.

create or replace function public.drivers_preserve_driver_fields()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user = 'authenticated' then
    new.id              := old.id;
    new.user_id         := old.user_id;
    new.organization_id := old.organization_id;

    if public.auth_role() = 'driver' then
      new.name                := old.name;
      new.email               := old.email;
      new.phone               := old.phone;
      new.license_type        := old.license_type;
      new.license_expiry      := old.license_expiry;
      new.hours_today         := old.hours_today;
      new.hours_week          := old.hours_week;
      new.rating              := old.rating;
      new.total_deliveries    := old.total_deliveries;
      new.vehicle_id          := old.vehicle_id;
      new.created_at          := old.created_at;
      new.location_lat        := old.location_lat;
      new.location_lng        := old.location_lng;
      new.location_updated_at := old.location_updated_at;
      new.heading             := old.heading;
      new.speed               := old.speed;
    end if;
  end if;
  return new;
end;
$function$;
