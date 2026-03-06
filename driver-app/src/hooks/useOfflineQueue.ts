/**
 * useOfflineQueue — Offline GPS update queue
 * Queues GPS updates in AsyncStorage when offline,
 * auto-syncs to Supabase when connection is restored.
 */

import { useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { supabase } from "../lib/supabase";

const QUEUE_KEY = "movido_gps_queue";
const SYNC_INTERVAL = 15000; // 15s

interface QueuedUpdate {
  driver_id: number;
  location_lat: number;
  location_lng: number;
  heading: number | null;
  speed: number | null;
  location_updated_at: string;
}

export function useOfflineQueue() {
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add a GPS update to the queue
  const enqueue = useCallback(async (update: QueuedUpdate) => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: QueuedUpdate[] = raw ? JSON.parse(raw) : [];
      // Keep max 100 items to avoid bloat
      queue.push(update);
      if (queue.length > 100) queue.splice(0, queue.length - 100);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }, []);

  // Sync queued updates to Supabase
  const syncQueue = useCallback(async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return;

      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const queue: QueuedUpdate[] = JSON.parse(raw);
      if (queue.length === 0) return;

      // Deduplicate — keep only the latest update per driver
      const latest = new Map<number, QueuedUpdate>();
      for (const item of queue) {
        const existing = latest.get(item.driver_id);
        if (!existing || item.location_updated_at > existing.location_updated_at) {
          latest.set(item.driver_id, item);
        }
      }

      for (const update of latest.values()) {
        await supabase
          .from("drivers")
          .update({
            location_lat: update.location_lat,
            location_lng: update.location_lng,
            heading: update.heading,
            speed: update.speed,
            location_updated_at: update.location_updated_at,
          })
          .eq("id", update.driver_id);
      }

      // Clear queue after successful sync
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {}
  }, []);

  // Get current queue size (for UI badge)
  const getQueueSize = useCallback(async (): Promise<number> => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw).length : 0;
    } catch {
      return 0;
    }
  }, []);

  // Auto-sync every 15s
  useEffect(() => {
    syncQueue();
    syncTimerRef.current = setInterval(syncQueue, SYNC_INTERVAL);
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [syncQueue]);

  return { enqueue, syncQueue, getQueueSize };
}
