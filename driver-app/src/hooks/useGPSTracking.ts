/**
 * GPS Tracking Hook — Live location updates to Supabase
 * - Requests foreground + background location permissions
 * - Sends lat/lng/heading/speed every 10 seconds
 * - Updates driver record in Supabase for dispatch to see in realtime
 */

import { useState, useEffect, useCallback, useRef } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";

interface GPSState {
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  timestamp: number | null;
  isTracking: boolean;
  permissionGranted: boolean;
}

const UPDATE_INTERVAL = 10000; // 10 seconds

export function useGPSTracking(driverId: number | undefined) {
  const [gps, setGps] = useState<GPSState>({
    latitude: null, longitude: null, heading: null,
    speed: null, accuracy: null, timestamp: null,
    isTracking: false, permissionGranted: false,
  });

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Request permissions
  const requestPermissions = useCallback(async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== "granted") return false;

    // Try background too (for when app is minimised)
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // Background permission is optional
    }

    setGps((prev) => ({ ...prev, permissionGranted: true }));
    return true;
  }, []);

  // Push location to Supabase
  const pushLocation = useCallback(async (location: Location.LocationObject) => {
    if (!driverId) return;

    const update = {
      location_lat: location.coords.latitude,
      location_lng: location.coords.longitude,
      heading: location.coords.heading ?? null,           // added by migration 005
      speed: location.coords.speed ? Math.round(location.coords.speed * 2.237) : null, // added by migration 005 (m/s → mph)
      location_updated_at: new Date().toISOString(),      // FIX: was "last_location_update"
    };

    setGps((prev) => ({
      ...prev,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    }));

    await supabase.from("drivers").update(update).eq("id", driverId);
  }, [driverId]);

  // Start tracking
  const startTracking = useCallback(async () => {
    const ok = await requestPermissions();
    if (!ok) return;

    // Get initial position
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    pushLocation(loc);

    // Watch position changes
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 20, // metres
        timeInterval: UPDATE_INTERVAL,
      },
      (location) => pushLocation(location)
    );

    setGps((prev) => ({ ...prev, isTracking: true }));
  }, [requestPermissions, pushLocation]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setGps((prev) => ({ ...prev, isTracking: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  return { gps, startTracking, stopTracking };
}
