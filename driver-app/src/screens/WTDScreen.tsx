/**
 * WTD (Working Time Directive) Screen — Driver view
 * Shows driver's own driving hours, break requirements, weekly totals
 * EU Regulation 561/2006 + AETR
 */

import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDriveTimer } from "../hooks/useDriveTimer";
import { useDriverAuth } from "../hooks/useDriverAuth";

const COLORS = {
  bg: "#0a0a0f",
  card: "#111118",
  border: "#1a1a24",
  primary: "#00FFD4",
  text: "#ffffff",
  muted: "#888",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
  blue: "#3B82F6",
};

const WTD_LIMITS = {
  DAILY_MAX: 9,
  DAILY_EXTENDED: 10,
  BREAK_AFTER: 4.5,
  WEEKLY_MAX: 56,
  FORTNIGHTLY_MAX: 90,
};

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function HoursBar({ value, max, warn, danger }: { value: number; max: number; warn: number; danger: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value >= danger ? COLORS.red : value >= warn ? COLORS.amber : COLORS.primary;
  return (
    <View style={s.barBg}>
      <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, { color: color || COLORS.text }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub && <Text style={s.statSub}>{sub}</Text>}
    </View>
  );
}

export default function WTDScreen({ navigation }: any) {
  const { profile } = useDriverAuth();
  const driveTimer = useDriveTimer(profile?.status || "off_duty");

  // Compute remaining times (hook fields: continuousMins, todayMins, weekMins)
  const todayDriveH = (driveTimer.todayMins || 0) / 60;
  const weekDriveH = (driveTimer.weekMins || 0) / 60;
  const continuousH = (driveTimer.continuousMins || 0) / 60;
  const remainingDaily = Math.max(0, WTD_LIMITS.DAILY_MAX - todayDriveH);
  const remainingWeekly = Math.max(0, WTD_LIMITS.WEEKLY_MAX - weekDriveH);
  const remainingContinuous = Math.max(0, WTD_LIMITS.BREAK_AFTER - continuousH);
  const breakNeeded = continuousH >= WTD_LIMITS.BREAK_AFTER;

  // Status
  const violations: string[] = [];
  const warnings: string[] = [];
  if (todayDriveH > WTD_LIMITS.DAILY_EXTENDED) violations.push("Daily drive limit exceeded");
  if (weekDriveH > WTD_LIMITS.WEEKLY_MAX) violations.push("Weekly limit exceeded");
  if (continuousH > WTD_LIMITS.BREAK_AFTER) violations.push("Break overdue — take 45 min break now");
  if (violations.length === 0) {
    if (remainingDaily < 1) warnings.push(`Only ${(remainingDaily * 60).toFixed(0)} min of daily drive left`);
    if (remainingContinuous < 0.75 && profile?.status === "on_duty") warnings.push(`Break needed in ${(remainingContinuous * 60).toFixed(0)} min`);
    if (remainingWeekly < 5) warnings.push(`Only ${remainingWeekly.toFixed(1)}h weekly remaining`);
  }

  const statusColor = violations.length > 0 ? COLORS.red : warnings.length > 0 ? COLORS.amber : COLORS.green;
  const statusLabel = violations.length > 0 ? "VIOLATION" : warnings.length > 0 ? "WARNING" : "COMPLIANT";
  const statusIcon = violations.length > 0 ? "close-circle" : warnings.length > 0 ? "warning" : "checkmark-circle";

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>WTD Hours</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Compliance Status */}
        <View style={[s.statusCard, { borderColor: statusColor + "50", backgroundColor: statusColor + "15" }]}>
          <Ionicons name={statusIcon as any} size={32} color={statusColor} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          <Text style={s.statusSub}>{profile?.name || "Driver"} · {new Date().toLocaleDateString("en-GB")}</Text>
        </View>

        {/* Violations */}
        {violations.map((v, i) => (
          <View key={i} style={[s.alertRow, { backgroundColor: COLORS.red + "20", borderColor: COLORS.red + "40" }]}>
            <Ionicons name="close-circle" size={16} color={COLORS.red} />
            <Text style={[s.alertText, { color: COLORS.red }]}>{v}</Text>
          </View>
        ))}

        {/* Warnings */}
        {warnings.map((w, i) => (
          <View key={i} style={[s.alertRow, { backgroundColor: COLORS.amber + "20", borderColor: COLORS.amber + "40" }]}>
            <Ionicons name="warning" size={16} color={COLORS.amber} />
            <Text style={[s.alertText, { color: COLORS.amber }]}>{w}</Text>
          </View>
        ))}

        {/* Break due banner */}
        {breakNeeded && (
          <View style={[s.breakBanner]}>
            <Ionicons name="cafe" size={20} color={COLORS.red} />
            <Text style={s.breakText}>BREAK REQUIRED — Take a 45-minute break now</Text>
          </View>
        )}

        {/* Quick stats */}
        <Text style={s.sectionTitle}>Today's Hours</Text>
        <View style={s.statsRow}>
          <StatCard label="Driven" value={formatHours(todayDriveH)} color={todayDriveH > 8 ? COLORS.amber : COLORS.text} />
          <StatCard label="Remaining" value={formatHours(remainingDaily)} color={remainingDaily < 1 ? COLORS.red : COLORS.green} />
          <StatCard label="Continuous" value={formatHours(continuousH)} color={continuousH > 4 ? COLORS.amber : COLORS.primary} />
        </View>

        {/* Daily progress bar */}
        <View style={s.card}>
          <View style={s.barRow}>
            <Text style={s.barLabel}>Today's drive</Text>
            <Text style={[s.barValue, { color: todayDriveH > 8 ? COLORS.amber : COLORS.text }]}>
              {formatHours(todayDriveH)} / 9h
            </Text>
          </View>
          <HoursBar value={todayDriveH} max={9} warn={7} danger={9} />

          <View style={[s.barRow, { marginTop: 16 }]}>
            <Text style={s.barLabel}>Continuous drive</Text>
            <Text style={[s.barValue, { color: continuousH > 4 ? COLORS.amber : COLORS.text }]}>
              {formatHours(continuousH)} / 4.5h
            </Text>
          </View>
          <HoursBar value={continuousH} max={4.5} warn={3.75} danger={4.5} />

          {!breakNeeded && continuousH > 0 && (
            <Text style={s.timerHint}>
              Next break in {formatHours(remainingContinuous)}
            </Text>
          )}
        </View>

        {/* Weekly */}
        <Text style={s.sectionTitle}>This Week</Text>
        <View style={s.statsRow}>
          <StatCard label="Week total" value={formatHours(weekDriveH)} color={weekDriveH > 50 ? COLORS.amber : COLORS.text} />
          <StatCard label="Remaining" value={formatHours(remainingWeekly)} color={remainingWeekly < 5 ? COLORS.red : COLORS.green} />
          <StatCard label="Fortnightly" value={formatHours(weekDriveH * 1.6)} color={COLORS.text} />
        </View>

        <View style={s.card}>
          <View style={s.barRow}>
            <Text style={s.barLabel}>Weekly drive</Text>
            <Text style={s.barValue}>{formatHours(weekDriveH)} / 56h</Text>
          </View>
          <HoursBar value={weekDriveH} max={56} warn={48} danger={56} />

          <View style={[s.barRow, { marginTop: 16 }]}>
            <Text style={s.barLabel}>Fortnightly drive</Text>
            <Text style={s.barValue}>{formatHours(weekDriveH * 1.6)} / 90h</Text>
          </View>
          <HoursBar value={weekDriveH * 1.6} max={90} warn={80} danger={90} />
        </View>

        {/* EU Rules reference */}
        <Text style={s.sectionTitle}>EU Regulation 561/2006</Text>
        <View style={s.card}>
          {[
            ["Daily drive", "9h (10h max × 2/wk)"],
            ["Break after", "45 min break after 4.5h continuous"],
            ["Weekly max", "56 hours"],
            ["Fortnightly", "90 hours total"],
            ["Daily rest", "11h (9h reduced × 3/wk)"],
            ["Weekly rest", "45h (24h reduced)"],
          ].map(([rule, value]) => (
            <View key={rule} style={s.ruleRow}>
              <Text style={s.ruleKey}>{rule}</Text>
              <Text style={s.ruleValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  scroll: { flex: 1, padding: 16 },

  statusCard: { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: "center", marginBottom: 16 },
  statusLabel: { fontSize: 22, fontWeight: "800", marginTop: 8 },
  statusSub: { fontSize: 12, color: COLORS.muted, marginTop: 4 },

  alertRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  alertText: { fontSize: 13, fontWeight: "600", flex: 1 },

  breakBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.red + "25", borderWidth: 1, borderColor: COLORS.red + "50", borderRadius: 8, padding: 14, marginBottom: 16 },
  breakText: { color: COLORS.red, fontWeight: "700", fontSize: 13, flex: 1 },

  sectionTitle: { fontSize: 11, fontWeight: "600", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 8 },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  statSub: { fontSize: 10, color: COLORS.muted, marginTop: 1 },

  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 16, marginBottom: 16 },

  barRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  barLabel: { fontSize: 13, color: COLORS.muted },
  barValue: { fontSize: 13, color: COLORS.text, fontWeight: "600" },
  barBg: { height: 6, backgroundColor: "#1a1a2e", borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  timerHint: { fontSize: 11, color: COLORS.muted, marginTop: 8, textAlign: "right" },

  ruleRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border + "60" },
  ruleKey: { fontSize: 13, color: COLORS.muted },
  ruleValue: { fontSize: 13, color: COLORS.text, fontWeight: "500", textAlign: "right", flex: 1, marginLeft: 16 },
});
