/**
 * Jobs hook for driver app — fetch assigned jobs + realtime updates
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export interface DriverJob {
  id: number;
  reference: string;
  customer: string;
  status: string;
  priority: string;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  eta: string | null;
  pod_status: string;
  pod_photo_url: string | null;
  pod_notes: string | null;
  tracking_token: string | null;
  created_at: string;
}

export function useDriverJobs(driverId: number | undefined) {
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!driverId) { setIsLoading(false); return; }
    setIsLoading(true);
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", ["assigned", "in_progress", "pending"])
      .order("created_at", { ascending: false });
    setJobs((data || []) as DriverJob[]);
    setIsLoading(false);
  }, [driverId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime
  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel("driver-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `driver_id=eq.${driverId}` }, () => {
        fetch(); // Refetch on any change
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driverId, fetch]);

  const updateJobStatus = useCallback(async (jobId: number, status: string) => {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
    if (error) throw error;
    fetch();
  }, [fetch]);

  const savePOD = useCallback(async (jobId: number, data: {
    pod_status: string;
    pod_photo_url?: string | null;
    pod_notes?: string | null;
  }) => {
    const { error } = await supabase.from("jobs").update(data).eq("id", jobId);
    if (error) throw error;
    fetch();
  }, [fetch]);

  return { jobs, isLoading, refetch: fetch, updateJobStatus, savePOD };
}
