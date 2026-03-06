/**
 * Driver App Geofencing — Auto-arrive logic
 * Checks distance between current GPS and active job coords
 * Auto-transitions: assigned→in_progress at pickup, notifies at delivery
 */

import { useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import type { DriverJob } from "./useDriverJobs";

const RADIUS_METRES = 200;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useDriverGeofencing(
  lat: number | null,
  lng: number | null,
  jobs: DriverJob[],
  onJobUpdate: () => void,
) {
  const processedRef = useRef<Set<string>>(new Set());

  const check = useCallback(async () => {
    if (!lat || !lng) return;

    for (const job of jobs) {
      // Auto-arrive at pickup
      if (job.status === "assigned" && job.pickup_lat && job.pickup_lng) {
        const dist = haversine(lat, lng, job.pickup_lat, job.pickup_lng);
        const key = `pickup-${job.id}`;
        if (dist <= RADIUS_METRES && !processedRef.current.has(key)) {
          processedRef.current.add(key);
          await supabase.from("jobs").update({ status: "in_progress" }).eq("id", job.id);
          Alert.alert("Auto-Arrive", `You've arrived at pickup for ${job.reference}. Job started automatically.`);
          onJobUpdate();
        }
      }

      // Notify at delivery
      if (job.status === "in_progress" && job.delivery_lat && job.delivery_lng) {
        const dist = haversine(lat, lng, job.delivery_lat, job.delivery_lng);
        const key = `delivery-${job.id}`;
        if (dist <= RADIUS_METRES && !processedRef.current.has(key)) {
          processedRef.current.add(key);
          Alert.alert("At Delivery", `You've arrived at the delivery point for ${job.reference}. Please capture POD.`);
        }
      }
    }
  }, [lat, lng, jobs, onJobUpdate]);

  useEffect(() => {
    check();
  }, [lat, lng, check]);

  return { checkNow: check };
}
