/**
 * Realtime Notifications Hook
 * Subscribes to Supabase Realtime and shows toast alerts for:
 * - New job created
 * - Job status changes (assigned, in_progress, completed)
 * - POD captured
 * - Driver status changes
 * - New messages
 * - Low fuel alerts
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export function useRealtimeNotifications(enabled: boolean = true) {
  const channelsRef = useRef<any[]>([]);

  useEffect(() => {
    if (!enabled) return;

    // Jobs channel
    const jobsChannel = supabase
      .channel("notify-jobs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jobs" }, (payload) => {
        const job = payload.new as any;
        toast.info(`📦 New Job: ${job.reference}`, {
          description: `${job.customer} — ${job.priority} priority`,
          duration: 5000,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, (payload) => {
        const job = payload.new as any;
        const old = payload.old as any;

        // Status changed
        if (old.status !== job.status) {
          if (job.status === "in_progress") {
            toast.success(`🚛 ${job.reference} started`, { description: "Driver picked up the load", duration: 4000 });
          } else if (job.status === "completed") {
            toast.success(`✅ ${job.reference} delivered`, { description: `${job.customer} — delivery complete`, duration: 5000 });
          } else if (job.status === "assigned") {
            toast.info(`👤 ${job.reference} assigned`, { duration: 3000 });
          }
        }

        // POD captured
        if (old.pod_status === "pending" && (job.pod_status === "photo" || job.pod_status === "signed")) {
          toast.success(`📸 POD captured for ${job.reference}`, { duration: 4000 });
        }
      })
      .subscribe();

    // Drivers channel
    const driversChannel = supabase
      .channel("notify-drivers")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers" }, (payload) => {
        const driver = payload.new as any;
        const old = payload.old as any;

        if (old.status !== driver.status) {
          const emoji = driver.status === "on_duty" ? "🟢" :
            driver.status === "available" ? "🔵" :
            driver.status === "on_break" ? "🟡" : "⚫";
          toast.info(`${emoji} ${driver.name} → ${driver.status.replace("_", " ")}`, { duration: 3000 });
        }
      })
      .subscribe();

    // Messages channel
    const messagesChannel = supabase
      .channel("notify-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.channel === "driver") {
          toast.info(`💬 New message from driver`, {
            description: msg.content?.slice(0, 60) + (msg.content?.length > 60 ? "..." : ""),
            duration: 4000,
          });
        }
      })
      .subscribe();

    // Vehicles channel (fuel alerts)
    const vehiclesChannel = supabase
      .channel("notify-vehicles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vehicles" }, (payload) => {
        const vehicle = payload.new as any;
        const old = payload.old as any;

        // Fuel dropped below 15%
        if ((old.fuel_level || 100) >= 15 && (vehicle.fuel_level || 100) < 15) {
          toast.warning(`⛽ Low fuel: ${vehicle.vehicle_id}`, {
            description: `${vehicle.fuel_level}% remaining`,
            duration: 8000,
          });
        }
      })
      .subscribe();

    channelsRef.current = [jobsChannel, driversChannel, messagesChannel, vehiclesChannel];

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [enabled]);
}
