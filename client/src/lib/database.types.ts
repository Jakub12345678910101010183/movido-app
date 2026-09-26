/**
 * Supabase Database Types
 *
 * Mirrors the production schema (project zjvozjnbvrtrrpehqdpf) as reported by
 * `supabase gen types`. Row shapes are written out once; Insert/Update are
 * derived from them so the three can never drift apart. Regenerate from the
 * live schema when a migration changes a table.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Enums = {
  driver_status: "on_duty" | "available" | "off_duty" | "on_break";
  job_priority: "low" | "medium" | "high" | "urgent";
  job_status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  maintenance_status: "scheduled" | "overdue" | "completed" | "cancelled";
  maintenance_type: "service" | "mot" | "repair" | "inspection" | "tyre";
  message_channel: "dispatch" | "driver" | "alert" | "system";
  pod_status: "pending" | "signed" | "photo" | "na";
  vehicle_status: "active" | "idle" | "maintenance" | "offline";
  vehicle_type: "hgv" | "lgv" | "van";
};

/**
 * Insert: every column optional except `Required`. Update: every column
 * optional. `Relationships` is left empty — the app does no embedded joins.
 */
type TableDef<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type AppSettingsRow = {
  key: string;
  value: string;
  organization_id: string | null;
  updated_at: string | null;
};

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: Json | null;
  created_at: string | null;
};

type DriverInvitationRow = {
  id: string;
  organization_id: string;
  driver_id: number;
  email: string;
  token_hash: string;
  status: string;
  expires_at: string;
  created_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

type DriverRow = {
  id: number;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: Enums["driver_status"];
  license_type: string | null;
  license_expiry: string | null;
  hours_today: number | null;
  hours_week: number | null;
  rating: number | null;
  total_deliveries: number | null;
  vehicle_id: number | null;
  location_lat: number | null;
  location_lng: number | null;
  location_updated_at: string | null;
  heading: number | null;
  speed: number | null;
  push_token: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
};

type FleetMaintenanceRow = {
  id: number;
  vehicle_id: number;
  type: Enums["maintenance_type"];
  description: string | null;
  scheduled_date: string;
  completed_date: string | null;
  cost: number | null;
  status: Enums["maintenance_status"];
  mileage_at_service: number | null;
  next_due_mileage: number | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type FuelLogRow = {
  id: number;
  driver_id: number | null;
  vehicle_id: number | null;
  fuel_amount: number;
  fuel_cost: number | null;
  fuel_type: string;
  mileage: number | null;
  station_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
};

type IncidentRow = {
  id: number;
  driver_id: number | null;
  vehicle_id: number | null;
  job_id: number | null;
  incident_type: string;
  description: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  photos: string[];
  third_party_involved: boolean | null;
  reported_to_police: boolean | null;
  police_reference: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
};

type JobRow = {
  id: number;
  reference: string;
  customer: string;
  customer_phone: string | null;
  status: Enums["job_status"];
  priority: Enums["job_priority"];
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  /** Ordered intermediate stops: [{ label, address, status, completed_at }]. */
  stops: Json | null;
  scheduled_date: string | null;
  eta: string | null;
  completed_at: string | null;
  pod_status: Enums["pod_status"];
  pod_signature: string | null;
  /** Storage path in the private pod-photos bucket (legacy rows: data: URL). */
  pod_photo_url: string | null;
  pod_notes: string | null;
  driver_notes: string | null;
  tracking_token: string | null;
  vehicle_id: number | null;
  driver_id: number | null;
  created_by: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: number;
  sender_id: string;
  recipient_id: string | null;
  channel: Enums["message_channel"];
  content: string;
  read: boolean;
  organization_id: string | null;
  created_at: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  stripe_customer_id: string | null;
  plan: string;
  plan_status: string;
  trial_ends_at: string | null;
  max_vehicles: number;
  max_drivers: number;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  avatar_url: string | null;
  organization_id: string | null;
  onboarding_completed: boolean | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  last_signed_in: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type VehicleRow = {
  id: number;
  vehicle_id: string;
  type: Enums["vehicle_type"];
  make: string | null;
  model: string | null;
  registration: string | null;
  status: Enums["vehicle_status"];
  height: number | null;
  width: number | null;
  weight: number | null;
  length: number | null;
  current_location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  fuel_level: number | null;
  mileage: number | null;
  next_service_date: string | null;
  driver_id: number | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
};

type DriverPositionRow = {
  id: number;
  organization_id: string;
  driver_id: number;
  vehicle_id: number | null;
  job_id: number | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed_mph: number | null;
  accuracy_m: number | null;
  recorded_at: string;
};

type GeofenceEventRow = {
  id: number;
  organization_id: string;
  job_id: number;
  driver_id: number;
  target: string;
  event_type: "arrival" | "departure";
  lat: number;
  lng: number;
  distance_m: number;
  occurred_at: string;
};

type TrackingRow = {
  reference: string;
  customer: string;
  status: string;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  eta: string | null;
  pod_status: string;
  driver_name: string | null;
  driver_heading: number | null;
  driver_location_lat: number | null;
  driver_location_lng: number | null;
  driver_location_updated_at: string | null;
  vehicle_id: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_registration: string | null;
};

export type Database = {
  public: {
    Tables: {
      app_settings: TableDef<AppSettingsRow, "key" | "value">;
      audit_log: TableDef<AuditLogRow, "action" | "resource_type">;
      driver_invitations: TableDef<DriverInvitationRow, "organization_id" | "driver_id" | "email" | "token_hash" | "expires_at">;
      drivers: TableDef<DriverRow, "name">;
      geofence_events: TableDef<GeofenceEventRow, "organization_id" | "job_id" | "driver_id" | "target" | "event_type" | "lat" | "lng" | "distance_m">;
      driver_positions: TableDef<DriverPositionRow, "organization_id" | "driver_id" | "lat" | "lng">;
      fleet_maintenance: TableDef<FleetMaintenanceRow, "vehicle_id" | "type" | "scheduled_date">;
      fuel_logs: TableDef<FuelLogRow, "fuel_amount">;
      incidents: TableDef<IncidentRow, never>;
      jobs: TableDef<JobRow, "reference" | "customer">;
      messages: TableDef<MessageRow, "sender_id" | "content">;
      organizations: TableDef<OrganizationRow, "name">;
      users: TableDef<UserRow, "id">;
      vehicles: TableDef<VehicleRow, "vehicle_id">;
    };
    Views: { [_ in never]: never };
    Functions: {
      auth_driver_id: { Args: never; Returns: number };
      auth_org_id: { Args: never; Returns: string };
      auth_role: { Args: never; Returns: string };
      create_organization: { Args: { p_name: string }; Returns: string };
      /**
       * Public tracking. The tables behind it are closed to anonymous callers,
       * so this SECURITY DEFINER function is the only public channel. It
       * returns exactly these columns and deliberately omits phone numbers.
       */
      get_tracking: { Args: { p_token: string }; Returns: TrackingRow[] };
      driver_report_location: {
        Args: { p_lat: number; p_lng: number; p_heading?: number; p_speed_mps?: number; p_accuracy_m?: number };
        Returns: string;
      };
      driver_update_stop: {
        Args: { p_job_id: number; p_stop_index: number; p_status: string };
        Returns: Json;
      };
    };
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
};

// Convenience types
export type User = UserRow;
export type Organization = OrganizationRow;
export type Vehicle = VehicleRow;
export type Driver = DriverRow;
export type Job = JobRow;
export type Message = MessageRow;
export type FleetMaintenance = FleetMaintenanceRow;
export type MaintenanceRecord = FleetMaintenanceRow;
export type Incident = IncidentRow;
export type FuelLog = FuelLogRow;
export type TrackingInfo = TrackingRow;
export type DriverPosition = DriverPositionRow;
export type GeofenceEvent = GeofenceEventRow;

export type InsertVehicle = Database["public"]["Tables"]["vehicles"]["Insert"];
export type InsertDriver = Database["public"]["Tables"]["drivers"]["Insert"];
export type InsertJob = Database["public"]["Tables"]["jobs"]["Insert"];
export type InsertMessage = Database["public"]["Tables"]["messages"]["Insert"];
export type InsertFleetMaintenance = Database["public"]["Tables"]["fleet_maintenance"]["Insert"];
