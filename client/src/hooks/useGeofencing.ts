/**
 * Geofencing & Auto-Arrive Hook
 * Monitors realtime driver locations against job coordinates.
 * When a driver enters a geofence radius around pickup/delivery:
 * - Auto-updates job status (pickup → in_progress, delivery → completed)
 * - Logs arrival event
 * - Triggers toast notification for dispatcher
 *
 * Used in Dashboard for passive monitoring.
 */

import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface GeofenceConfig {
  radiusMetres: number;       // Default 200m
  checkIntervalMs: number;    // Default 15000 (15s)
  enabled: boolean;
}

interface DriverLocation {
  driver_id: number;
  driver_name: string;
  lat: number;
  lng: number;
}

interface JobGeofence {
  job_id: number;
  reference: string;
  customer: string;
  status: string;
  driver_id: number | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
}

// Haversine distance in metres
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_CONFIG: GeofenceConfig = {
  radiusMetres: 200,
  checkIntervalMs: 15000,
  enabled: true,
};

export function useGeofencing(config: Partial<GeofenceConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedRef = useRef<Set<string>>(new Set()); // Prevent duplicate events

  const checkGeofences = useCallback(async () => {
    if (!cfg.enabled) return;

    try {
      // 1. Get all active drivers with locations
      const { data: driverRows } = await supabase
        .from("drivers")
        .select("id, name, location_lat, location_lng")
        .in("status", ["on_duty", "available"])
        .not("location_lat", "is", null);

      if (!driverRows || driverRows.length === 0) return;

      const drivers: DriverLocation[] = driverRows.map((d: any) => ({
        driver_id: d.id, driver_name: d.name,
        lat: d.location_lat, lng: d.location_lng,
      }));

      // 2. Get active jobs with coordinates
      const { data: jobRows } = await supabase
        .from("jobs")
        .select("id, reference, customer, status, driver_id, pickup_lat, pickup_lng, delivery_lat, delivery_lng")
        .in("status", ["assigned", "in_progress"])
        .not("driver_id", "is", null);

      if (!jobRows || jobRows.length === 0) return;

      const jobs: JobGeofence[] = jobRows as JobGeofence[];

      // 3. Check each driver against their assigned jobs
      for (const driver of drivers) {
        const driverJobs = jobs.filter((j) => j.driver_id === driver.driver_id);

        for (const job of driverJobs) {
          // Check pickup arrival (assigned → in_progress)
          if (job.status === "assigned" && job.pickup_lat && job.pickup_lng) {
            const dist = haversineMetres(driver.lat, driver.lng, job.pickup_lat, job.pickup_lng);
            const eventKey = `pickup-${job.job_id}`;

            if (dist <= cfg.radiusMetres && !processedRef.current.has(eventKey)) {
              processedRef.current.add(eventKey);

              // Auto-arrive at pickup
              await supabase.from("jobs").update({ status: "in_progress" }).eq("id", job.job_id);

              toast.success(
                `🚛 Auto-Arrive: ${driver.driver_name} arrived at pickup for ${job.reference}`,
                { duration: 6000 }
              );

              console.log(`[Geofence] ${driver.driver_name} arrived at pickup for ${job.reference} (${Math.round(dist)}m)`);
            }
          }

          // Check delivery arrival (in_progress → prompt completion)
          if (job.status === "in_progress" && job.delivery_lat && job.delivery_lng) {
            const dist = haversineMetres(driver.lat, driver.lng, job.delivery_lat, job.delivery_lng);
            const eventKey = `delivery-${job.job_id}`;

            if (dist <= cfg.radiusMetres && !processedRef.current.has(eventKey)) {
              processedRef.current.add(eventKey);

              toast.info(
                `📍 ${driver.driver_name} is at delivery point for ${job.reference}. Awaiting POD.`,
                { duration: 8000 }
              );

              console.log(`[Geofence] ${driver.driver_name} at delivery for ${job.reference} (${Math.round(dist)}m)`);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Geofence] Check failed:", err);
    }
  }, [cfg.enabled, cfg.radiusMetres]);

  // Start interval checking
  useEffect(() => {
    if (!cfg.enabled) return;

    // Initial check
    checkGeofences();

    // Periodic checks
    intervalRef.current = setInterval(checkGeofences, cfg.checkIntervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cfg.enabled, cfg.checkIntervalMs, checkGeofences]);

  // Reset processed events when config changes
  useEffect(() => {
    processedRef.current.clear();
  }, [cfg.radiusMetres]);

  return {
    checkNow: checkGeofences,
    clearProcessed: () => processedRef.current.clear(),
  };
}
