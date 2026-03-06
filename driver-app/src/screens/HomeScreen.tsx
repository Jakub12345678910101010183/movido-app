/**
 * Driver Home Screen — i18n support (EN/PL/RO)
 * + Drive time compliance timer (WTD)
 * + Offline queue badge
 * + Incident report shortcut
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDriverAuth } from "../hooks/useDriverAuth";
import { useGPSTracking } from "../hooks/useGPSTracking";
import { useDriverJobs } from "../hooks/useDriverJobs";
import { useDriverGeofencing } from "../hooks/useDriverGeofencing";
import { useDriveTimer } from "../hooks/useDriveTimer";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { t } from "../lib/i18n";

const statusConfig: Record<string, { color: string; key: string; icon: string }> = {
  on_duty:    { color: "#22C55E", key: "home_status_on_duty",    icon: "radio-button-on" },
  available:  { color: "#00FFD4", key: "home_status_available",  icon: "checkmark-circle" },
  off_duty:   { color: "#666",    key: "home_status_off_duty",   icon: "moon" },
  on_break:   { color: "#F59E0B", key: "home_status_on_break",   icon: "cafe" },
};

const priorityColors: Record<string, string> = {
  low: "#666", medium: "#3B82F6", high: "#F59E0B", urgent: "#EF4444",
};

const timerStatusColor: Record<string, string> = {
  idle: "#666", driving: "#22C55E", warning: "#F59E0B",
  break_required: "#EF4444", on_break: "#3B82F6",
};

export default function HomeScreen({ navigation }: any) {
  const { profile, updateStatus, signOut } = useDriverAuth();
  const { gps, startTracking, stopTracking } = useGPSTracking(profile?.id);
  const { jobs } = useDriverJobs(profile?.id);
  const driveTimer = useDriveTimer(profile?.status || "off_duty");
  const { getQueueSize } = useOfflineQueue();
  const [offlineCount, setOfflineCount] = useState(0);

  useDriverGeofencing(gps.latitude, gps.longitude, jobs, () => {});
  usePushNotifications(profile?.id);

  useEffect(() => {
    if (profile?.status === "on_duty" && !gps.isTracking) startTracking();
    else if (profile?.status === "off_duty" && gps.isTracking) stopTracking();
  }, [profile?.status]);

  // Poll offline queue size every 30s
  useEffect(() => {
    const check = async () => setOfflineCount(await getQueueSize());
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [getQueueSize]);

  const activeJob = jobs.find((j) => j.status === "in_progress");
  const pendingJobs = jobs.filter((j) => j.status === "assigned" || j.status === "pending");
  const cfg = statusConfig[profile?.status || "off_duty"] || statusConfig.off_duty;

  const cycleStatus = () => {
    const order = ["off_duty", "available", "on_duty", "on_break"];
    const current = order.indexOf(profile?.status || "off_duty");
    updateStatus(order[(current + 1) % order.length]);
  };

  const timerColor = timerStatusColor[driveTimer.status] || "#666";

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{t("home_greeting")}, {profile?.name || "Driver"}</Text>
          <Text style={s.sub}>{profile?.license_type || "HGV Driver"}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          {offlineCount > 0 && (
            <View style={s.offlineBadge}>
              <Ionicons name="cloud-offline" size={14} color="#F59E0B" />
              <Text style={s.offlineBadgeText}>{offlineCount}</Text>
            </View>
          )}
          <TouchableOpacity onPress={signOut}>
            <Ionicons name="log-out-outline" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <TouchableOpacity style={[s.card, { borderColor: cfg.color + "40" }]} onPress={cycleStatus}>
          <View style={s.row}><View style={[s.statusDot, { backgroundColor: cfg.color }]} /><Text style={[s.statusText, { color: cfg.color }]}>{t(cfg.key as any)}</Text></View>
          <Text style={s.hint}>{t("home_tap_status")}</Text>
        </TouchableOpacity>

        {/* Drive Time Compliance Timer */}
        {(profile?.status === "on_duty" || profile?.status === "on_break" || driveTimer.continuousMins > 0) && (
          <View style={[s.card, driveTimer.status === "break_required" && { borderColor: "#EF444440" }]}>
            <View style={s.row}>
              <Ionicons name="timer-outline" size={20} color={timerColor} />
              <Text style={[s.cardTitle, { color: timerColor }]}>
                {driveTimer.status === "break_required" ? "⚠️ BREAK REQUIRED NOW" :
                 driveTimer.status === "warning" ? "Break Soon" :
                 driveTimer.status === "on_break" ? "On Break" : "Drive Timer"}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={[s.timerValue, { color: timerColor }]}>
                {driveTimer.formatTime(driveTimer.continuousMins)}
              </Text>
            </View>

            {/* Continuous driving bar */}
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: driveTimer.continuousPercent + "%", backgroundColor: timerColor }]} />
            </View>
            <View style={s.row}>
              <Text style={s.progressLabel}>Continuous driving</Text>
              <Text style={[s.progressLabel, { color: timerColor }]}>
                {driveTimer.formatTime(driveTimer.continuousRemaining)} remaining
              </Text>
            </View>

            {driveTimer.status === "on_break" && (
              <Text style={{ color: "#3B82F6", fontSize: 12, marginTop: 8 }}>
                Break: {driveTimer.formatTime(driveTimer.breakMins)} / 45m needed to reset
              </Text>
            )}
          </View>
        )}

        {/* GPS */}
        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="navigate" size={20} color={gps.isTracking ? "#00FFD4" : "#666"} />
            <Text style={s.cardTitle}>{t("home_gps_tracking")}</Text>
            <View style={{ flex: 1 }} />
            <View style={[s.badge, { backgroundColor: gps.isTracking ? "#00FFD420" : "#66660020" }]}>
              <Text style={{ color: gps.isTracking ? "#00FFD4" : "#666", fontSize: 11 }}>{gps.isTracking ? t("home_gps_live") : t("home_gps_off")}</Text>
            </View>
          </View>
          {gps.isTracking && gps.latitude && (
            <Text style={s.gpsCoords}>{gps.latitude.toFixed(5)}, {gps.longitude?.toFixed(5)} • {gps.speed ? Math.round(gps.speed * 2.237) + " mph" : "0 mph"}</Text>
          )}
          <TouchableOpacity style={[s.btn, { backgroundColor: gps.isTracking ? "#EF444420" : "#00FFD420" }]} onPress={gps.isTracking ? stopTracking : startTracking}>
            <Text style={{ color: gps.isTracking ? "#EF4444" : "#00FFD4", fontWeight: "600" }}>{gps.isTracking ? t("home_stop_tracking") : t("home_start_tracking")}</Text>
          </TouchableOpacity>
        </View>

        {/* Active Job */}
        {activeJob && (
          <TouchableOpacity style={[s.card, { borderColor: "#3B82F640" }]} onPress={() => navigation.navigate("JobDetail", { jobId: activeJob.id })}>
            <View style={s.row}><Ionicons name="cube" size={20} color="#3B82F6" /><Text style={[s.cardTitle, { color: "#3B82F6" }]}>{t("home_active_job")}</Text></View>
            <Text style={s.jobRef}>{activeJob.reference}</Text>
            <Text style={s.jobCustomer}>{activeJob.customer}</Text>
            {activeJob.delivery_address && (<View style={[s.row, { marginTop: 8 }]}><Ionicons name="location" size={14} color="#666" /><Text style={s.jobAddr} numberOfLines={1}>{activeJob.delivery_address}</Text></View>)}
            <View style={[s.row, { marginTop: 8 }]}>
              <View style={[s.badge, { backgroundColor: "#3B82F620" }]}><Text style={{ color: "#3B82F6", fontSize: 11 }}>{t("home_in_progress")}</Text></View>
              <View style={{ flex: 1 }} /><Text style={s.tapHint}>{t("home_tap_open")}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Quick Actions — 3 rows */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <TouchableOpacity style={[s.card, { flex: 1, alignItems: "center", paddingVertical: 14 }]} onPress={() => navigation.navigate("DocumentScanner")}>
            <Ionicons name="scan" size={20} color="#8B5CF6" />
            <Text style={{ color: "#8B5CF6", fontSize: 12, fontWeight: "600", marginTop: 4 }}>{t("home_scan_doc")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.card, { flex: 1, alignItems: "center", paddingVertical: 14 }]} onPress={() => navigation.navigate("Main", { screen: "TruckCheck" })}>
            <Ionicons name="shield-checkmark" size={20} color="#F59E0B" />
            <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "600", marginTop: 4 }}>{t("home_truck_check")}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TouchableOpacity style={[s.card, { flex: 1, alignItems: "center", paddingVertical: 14 }]} onPress={() => navigation.navigate("IncidentReport")}>
            <Ionicons name="warning" size={20} color="#EF4444" />
            <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "600", marginTop: 4 }}>Report Incident</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.card, { flex: 1, alignItems: "center", paddingVertical: 14 }]} onPress={() => navigation.navigate("FuelLog")}>
            <Ionicons name="water" size={20} color="#3B82F6" />
            <Text style={{ color: "#3B82F6", fontSize: 12, fontWeight: "600", marginTop: 4 }}>Fuel Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.card, { flex: 1, alignItems: "center", paddingVertical: 14 }]} onPress={() => navigation.navigate("WTD")}>
            <Ionicons name="shield-checkmark" size={20} color={driveTimer.status === "break_required" ? "#EF4444" : driveTimer.status === "warning" ? "#F59E0B" : "#00FFD4"} />
            <Text style={{ color: driveTimer.status === "break_required" ? "#EF4444" : "#00FFD4", fontSize: 12, fontWeight: "600", marginTop: 4 }}>WTD Hours</Text>
          </TouchableOpacity>
        </View>

        {/* Pending Jobs */}
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>{t("home_assigned_jobs")} ({pendingJobs.length})</Text></View>
        {pendingJobs.length === 0 ? (
          <View style={s.empty}><Ionicons name="checkmark-done" size={32} color="#333" /><Text style={s.emptyText}>{t("home_no_pending")}</Text></View>
        ) : (
          pendingJobs.map((job) => (
            <TouchableOpacity key={job.id} style={s.jobCard} onPress={() => navigation.navigate("JobDetail", { jobId: job.id })}>
              <View style={s.row}><Text style={s.jobRef}>{job.reference}</Text><View style={{ flex: 1 }} />
                <View style={[s.badge, { backgroundColor: (priorityColors[job.priority] || "#666") + "20" }]}><Text style={{ color: priorityColors[job.priority] || "#666", fontSize: 10, textTransform: "uppercase" }}>{job.priority}</Text></View>
              </View>
              <Text style={s.jobCustomer}>{job.customer}</Text>
              {job.delivery_address && (<View style={[s.row, { marginTop: 4 }]}><Ionicons name="location-outline" size={12} color="#555" /><Text style={s.jobAddr} numberOfLines={1}>{job.delivery_address}</Text></View>)}
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  greeting: { fontSize: 22, fontWeight: "700", color: "#fff" },
  sub: { fontSize: 13, color: "#666", marginTop: 2 },
  offlineBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F59E0B20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#F59E0B40" },
  offlineBadgeText: { fontSize: 11, color: "#F59E0B", fontWeight: "700" },
  content: { flex: 1, paddingHorizontal: 20 },
  card: { backgroundColor: "#111118", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#222" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 18, fontWeight: "700" },
  hint: { fontSize: 11, color: "#555", marginTop: 4 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#fff" },
  timerValue: { fontSize: 18, fontWeight: "700", fontFamily: "monospace" },
  progressBg: { height: 6, backgroundColor: "#1a1a24", borderRadius: 3, marginTop: 10, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 10, color: "#555", marginTop: 4, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  gpsCoords: { fontSize: 11, color: "#555", fontFamily: "monospace", marginTop: 8 },
  btn: { borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  jobRef: { fontSize: 16, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  jobCustomer: { fontSize: 14, color: "#aaa", marginTop: 2 },
  jobAddr: { fontSize: 12, color: "#555", flex: 1 },
  tapHint: { fontSize: 11, color: "#555" },
  sectionHeader: { marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  jobCard: { backgroundColor: "#111118", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#1a1a24" },
  empty: { alignItems: "center", paddingVertical: 32 },
  emptyText: { color: "#444", marginTop: 8, fontSize: 13 },
});
