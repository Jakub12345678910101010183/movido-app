/**
 * Supabase Database Types
 * Auto-generated types for the Movido database schema
 * Mirrors the existing Drizzle MySQL schema, adapted for PostgreSQL
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          name: string | null;
          role: "user" | "admin" | "dispatcher" | "driver";
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          last_signed_in: string;
        };
        Insert: {
          id?: string;
          email?: string | null;
          name?: string | null;
          role?: "user" | "admin" | "dispatcher" | "driver";
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          last_signed_in?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          name?: string | null;
          role?: "user" | "admin" | "dispatcher" | "driver";
          avatar_url?: string | null;
          updated_at?: string;
          last_signed_in?: string;
        };
      };
      vehicles: {
        Row: {
          id: number;
          vehicle_id: string;
          type: "hgv" | "lgv" | "van";
          make: string | null;
          model: string | null;
          registration: string | null;
          status: "active" | "idle" | "maintenance" | "offline";
          height: number | null;
          width: number | null;
          weight: number | null;
          current_location: string | null;
          location_lat: number | null;
          location_lng: number | null;
          fuel_level: number;
          mileage: number;
          next_service_date: string | null;
          driver_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          vehicle_id: string;
          type?: "hgv" | "lgv" | "van";
          make?: string | null;
          model?: string | null;
          registration?: string | null;
          status?: "active" | "idle" | "maintenance" | "offline";
          height?: number | null;
          width?: number | null;
          weight?: number | null;
          current_location?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          fuel_level?: number;
          mileage?: number;
          next_service_date?: string | null;
          driver_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vehicle_id?: string;
          type?: "hgv" | "lgv" | "van";
          make?: string | null;
          model?: string | null;
          registration?: string | null;
          status?: "active" | "idle" | "maintenance" | "offline";
          height?: number | null;
          width?: number | null;
          weight?: number | null;
          current_location?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          fuel_level?: number;
          mileage?: number;
          next_service_date?: string | null;
          driver_id?: number | null;
          updated_at?: string;
        };
      };
      drivers: {
        Row: {
          id: number;
          user_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          status: "on_duty" | "available" | "off_duty" | "on_break";
          license_type: string | null;
          license_expiry: string | null;
          hours_today: number;
          hours_week: number;
          rating: number;
          total_deliveries: number;
          vehicle_id: number | null;
          location_lat: number | null;
          location_lng: number | null;
          location_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          status?: "on_duty" | "available" | "off_duty" | "on_break";
          license_type?: string | null;
          license_expiry?: string | null;
          hours_today?: number;
          hours_week?: number;
          rating?: number;
          total_deliveries?: number;
          vehicle_id?: number | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string | null;
          name?: string;
          email?: string | null;
          phone?: string | null;
          status?: "on_duty" | "available" | "off_duty" | "on_break";
          license_type?: string | null;
          license_expiry?: string | null;
          hours_today?: number;
          hours_week?: number;
          rating?: number;
          total_deliveries?: number;
          vehicle_id?: number | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_updated_at?: string | null;
          updated_at?: string;
        };
      };
      jobs: {
        Row: {
          id: number;
          reference: string;
          customer: string;
          status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
          priority: "low" | "medium" | "high" | "urgent";
          pickup_address: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          delivery_address: string | null;
          delivery_lat: number | null;
          delivery_lng: number | null;
          scheduled_date: string | null;
          eta: string | null;
          completed_at: string | null;
          pod_status: "pending" | "signed" | "photo" | "na";
          pod_signature: string | null;
          pod_photo_url: string | null;
          pod_notes: string | null;
          vehicle_id: number | null;
          driver_id: number | null;
          tracking_token: string | null;
          driver_notes: string | null;
          stops: any | null;
          customer_phone: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          reference: string;
          customer: string;
          status?: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
          priority?: "low" | "medium" | "high" | "urgent";
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          delivery_address?: string | null;
          delivery_lat?: number | null;
          delivery_lng?: number | null;
          scheduled_date?: string | null;
          eta?: string | null;
          completed_at?: string | null;
          pod_status?: "pending" | "signed" | "photo" | "na";
          pod_signature?: string | null;
          pod_photo_url?: string | null;
          pod_notes?: string | null;
          vehicle_id?: number | null;
          driver_id?: number | null;
          tracking_token?: string | null;
          driver_notes?: string | null;
          stops?: any | null;
          customer_phone?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          reference?: string;
          customer?: string;
          status?: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
          priority?: "low" | "medium" | "high" | "urgent";
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          delivery_address?: string | null;
          delivery_lat?: number | null;
          delivery_lng?: number | null;
          scheduled_date?: string | null;
          eta?: string | null;
          completed_at?: string | null;
          pod_status?: "pending" | "signed" | "photo" | "na";
          pod_signature?: string | null;
          pod_photo_url?: string | null;
          pod_notes?: string | null;
          vehicle_id?: number | null;
          driver_id?: number | null;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: number;
          sender_id: string;
          recipient_id: string | null;
          channel: "dispatch" | "driver" | "alert" | "system";
          content: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          sender_id: string;
          recipient_id?: string | null;
          channel?: "dispatch" | "driver" | "alert" | "system";
          content: string;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          read?: boolean;
        };
      };
      fleet_maintenance: {
        Row: {
          id: number;
          vehicle_id: number;
          type: "service" | "mot" | "repair" | "inspection" | "tyre";
          description: string | null;
          scheduled_date: string;
          completed_date: string | null;
          cost: number | null;
          status: "scheduled" | "overdue" | "completed" | "cancelled";
          mileage_at_service: number | null;
          next_due_mileage: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          vehicle_id: number;
          type: "service" | "mot" | "repair" | "inspection" | "tyre";
          description?: string | null;
          scheduled_date: string;
          completed_date?: string | null;
          cost?: number | null;
          status?: "scheduled" | "overdue" | "completed" | "cancelled";
          mileage_at_service?: number | null;
          next_due_mileage?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          type?: "service" | "mot" | "repair" | "inspection" | "tyre";
          description?: string | null;
          scheduled_date?: string;
          completed_date?: string | null;
          cost?: number | null;
          status?: "scheduled" | "overdue" | "completed" | "cancelled";
          mileage_at_service?: number | null;
          next_due_mileage?: number | null;
          updated_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      user_role: "user" | "admin" | "dispatcher" | "driver";
      vehicle_type: "hgv" | "lgv" | "van";
      vehicle_status: "active" | "idle" | "maintenance" | "offline";
      driver_status: "on_duty" | "available" | "off_duty" | "on_break";
      job_status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
      job_priority: "low" | "medium" | "high" | "urgent";
      pod_status: "pending" | "signed" | "photo" | "na";
      message_channel: "dispatch" | "driver" | "alert" | "system";
      maintenance_type: "service" | "mot" | "repair" | "inspection" | "tyre";
      maintenance_status: "scheduled" | "overdue" | "completed" | "cancelled";
    };
  };
}

// Convenience types
export type User = Database["public"]["Tables"]["users"]["Row"];
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type Driver = Database["public"]["Tables"]["drivers"]["Row"] & {
  push_token?: string | null;
  heading?: number | null;
  speed?: number | null;
};
export type Job = Database["public"]["Tables"]["jobs"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type FleetMaintenance = Database["public"]["Tables"]["fleet_maintenance"]["Row"];

export type InsertVehicle = Database["public"]["Tables"]["vehicles"]["Insert"];
export type InsertDriver = Database["public"]["Tables"]["drivers"]["Insert"];
export type InsertJob = Database["public"]["Tables"]["jobs"]["Insert"] & {
  tracking_token?: string | null;
};
export type InsertMessage = Database["public"]["Tables"]["messages"]["Insert"];
export type InsertFleetMaintenance = Database["public"]["Tables"]["fleet_maintenance"]["Insert"];

// ============================================
// NEW TYPES — Migration 006
// ============================================

export interface Incident {
  id: number;
  driver_id: number | null;
  vehicle_id: number | null;
  job_id: number | null;
  incident_type: "accident" | "near_miss" | "theft" | "vehicle_damage" | "load_damage" | "other";
  description: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  photos: string[];
  third_party_involved: boolean;
  reported_to_police: boolean;
  police_reference: string | null;
  status: "reported" | "investigating" | "closed";
  created_at: string;
  updated_at: string;
}

export interface FuelLog {
  id: number;
  driver_id: number | null;
  vehicle_id: number | null;
  fuel_amount: number;
  fuel_cost: number | null;
  fuel_type: "diesel" | "adblue" | "petrol" | "hvo";
  mileage: number | null;
  station_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
}
