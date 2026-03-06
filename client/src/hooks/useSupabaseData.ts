/**
 * Supabase Data Hooks
 * Real-time CRUD hooks for vehicles, drivers, jobs
 * Replaces tRPC queries with direct Supabase calls + realtime subscriptions
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type {
  Vehicle, Driver, Job, FleetMaintenance, Incident, FuelLog,
  InsertVehicle, InsertDriver, InsertJob,
} from "@/lib/database.types";

// ============================================
// Generic realtime hook
// ============================================

function useRealtimeTable<T extends { id: number | string }>(
  table: string,
  orderBy: string = "created_at"
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const { data: rows, error: err } = await supabase
        .from(table)
        .select("*")
        .order(orderBy, { ascending: false });

      if (err) throw err;
      setData((rows || []) as T[]);
      setError(null);
    } catch (err: any) {
      console.error(`[${table}] Fetch error:`, err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [table, orderBy]);

  useEffect(() => {
    fetch();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setData(prev => [payload.new as T, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setData(prev =>
              prev.map(item =>
                item.id === (payload.new as T).id ? (payload.new as T) : item
              )
            );
          } else if (payload.eventType === "DELETE") {
            setData(prev =>
              prev.filter(item => item.id !== (payload.old as T).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, fetch]);

  return { data, isLoading, error, refetch: fetch };
}

// ============================================
// VEHICLES
// ============================================

export function useVehicles() {
  const { data, isLoading, error, refetch } = useRealtimeTable<Vehicle>("vehicles");

  const create = useCallback(async (vehicle: InsertVehicle) => {
    const { data: row, error: err } = await supabase
      .from("vehicles")
      .insert(vehicle)
      .select()
      .single();
    if (err) throw err;
    return row as Vehicle;
  }, []);

  const update = useCallback(async (id: number, updates: Partial<Vehicle>) => {
    const { data: row, error: err } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (err) throw err;
    return row as Vehicle;
  }, []);

  const remove = useCallback(async (id: number) => {
    const { error: err } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id);
    if (err) throw err;
  }, []);

  return { vehicles: data, isLoading, error, refetch, create, update, remove };
}

// ============================================
// DRIVERS
// ============================================

export function useDrivers() {
  const { data, isLoading, error, refetch } = useRealtimeTable<Driver>("drivers");

  const create = useCallback(async (driver: InsertDriver) => {
    const { data: row, error: err } = await supabase
      .from("drivers")
      .insert(driver)
      .select()
      .single();
    if (err) throw err;
    return row as Driver;
  }, []);

  const update = useCallback(async (id: number, updates: Partial<Driver>) => {
    const { data: row, error: err } = await supabase
      .from("drivers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (err) throw err;
    return row as Driver;
  }, []);

  const remove = useCallback(async (id: number) => {
    const { error: err } = await supabase
      .from("drivers")
      .delete()
      .eq("id", id);
    if (err) throw err;
  }, []);

  return { drivers: data, isLoading, error, refetch, create, update, remove };
}

// ============================================
// REALTIME DRIVER LOCATIONS (for Dispatch Map)
// ============================================

export function useRealtimeDriverLocations() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initial fetch of all active drivers with locations
    const fetchDrivers = async () => {
      const { data } = await supabase
        .from("drivers")
        .select("*")
        .not("location_lat", "is", null)
        .in("status", ["on_duty", "available"]);

      if (data) setDrivers(data as Driver[]);
    };

    fetchDrivers();

    // Subscribe to location updates only
    const channel = supabase
      .channel("driver-locations")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drivers",
          filter: "location_lat=neq.null",
        },
        (payload) => {
          setDrivers(prev =>
            prev.map(d =>
              d.id === (payload.new as Driver).id ? (payload.new as Driver) : d
            )
          );
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { drivers, isConnected };
}

// ============================================
// JOBS
// ============================================

export function useJobs() {
  const { data, isLoading, error, refetch } = useRealtimeTable<Job>("jobs");

  const create = useCallback(async (job: InsertJob) => {
    const { data: row, error: err } = await supabase
      .from("jobs")
      .insert(job)
      .select()
      .single();
    if (err) throw err;
    return row as Job;
  }, []);

  const update = useCallback(async (id: number, updates: Partial<Job>) => {
    const { data: row, error: err } = await supabase
      .from("jobs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (err) throw err;
    return row as Job;
  }, []);

  const remove = useCallback(async (id: number) => {
    const { error: err } = await supabase
      .from("jobs")
      .delete()
      .eq("id", id);
    if (err) throw err;
  }, []);

  const generateReference = useCallback(async () => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true });
    const nextNum = (count || 0) + 1;
    return `JOB-${year}-${String(nextNum).padStart(3, "0")}`;
  }, []);

  return { jobs: data, isLoading, error, refetch, create, update, remove, generateReference };
}

// ============================================
// FLEET MAINTENANCE
// ============================================

export function useMaintenance(vehicleId?: number) {
  const [data, setData] = useState<FleetMaintenance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    let query = supabase
      .from("fleet_maintenance")
      .select("*")
      .order("scheduled_date", { ascending: true });

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    const { data: rows } = await query;
    setData((rows || []) as FleetMaintenance[]);
    setIsLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { maintenance: data, isLoading, refetch: fetch };
}

// ============================================
// MESSAGES (realtime)
// ============================================

export function useMessages(currentUserId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!currentUserId) { setIsLoading(false); return; }
    setIsLoading(true);
    const { data: rows } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order("created_at", { ascending: true })
      .limit(500);
    setMessages((rows || []) as Message[]);
    setIsLoading(false);
  }, [currentUserId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime subscription
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id === currentUserId || msg.recipient_id === currentUserId) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  const send = useCallback(async (data: {
    recipient_id: string | null;
    content: string;
    channel?: string;
  }) => {
    if (!currentUserId) throw new Error("Not authenticated");
    const { error } = await supabase.from("messages").insert({
      sender_id: currentUserId,
      recipient_id: data.recipient_id,
      content: data.content,
      channel: data.channel || "dispatch",
    });
    if (error) throw error;
  }, [currentUserId]);

  const markAsRead = useCallback(async (messageId: number) => {
    await supabase.from("messages").update({ read: true }).eq("id", messageId);
  }, []);

  return { messages, isLoading, refetch: fetch, send, markAsRead };
}

// ============================================
// INCIDENTS (realtime) — Migration 006
// ============================================

export function useIncidents() {
  const { data, isLoading, error, refetch } = useRealtimeTable<Incident>("incidents");

  const updateStatus = useCallback(async (id: number, status: Incident["status"]) => {
    const { error: err } = await supabase
      .from("incidents")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) throw err;
  }, []);

  const remove = useCallback(async (id: number) => {
    const { error: err } = await supabase.from("incidents").delete().eq("id", id);
    if (err) throw err;
  }, []);

  return { incidents: data, isLoading, error, refetch, updateStatus, remove };
}

// ============================================
// FUEL LOGS (realtime) — Migration 006
// ============================================

export function useFuelLogs(driverId?: number) {
  const [data, setData] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      let query = supabase
        .from("fuel_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (driverId) {
        query = query.eq("driver_id", driverId);
      }

      const { data: rows, error: err } = await query;
      if (err) throw err;
      setData((rows || []) as FuelLog[]);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    fetch();

    const channel = supabase
      .channel("fuel-logs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_logs" }, () => {
        fetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  // Aggregates
  const totalLitres = data.reduce((sum, l) => sum + (l.fuel_amount || 0), 0);
  const totalCost = data.reduce((sum, l) => sum + (l.fuel_cost || 0), 0);

  return { fuelLogs: data, isLoading, error, refetch: fetch, totalLitres, totalCost };
}
