/**
 * Driver Profile Screen — Personal stats, hours, delivery history
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDriverAuth } from "../hooks/useDriverAuth";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../hooks/useLanguage";
import { t } from "../lib/i18n";

interface DeliveryRecord {
  id: number;
  reference: string;
  customer: string;
  status: string;
  created_at: string;
}

export default function ProfileScreen({ navigation }: any) {
  const { profile, signOut } = useDriverAuth();
  const { lang, changeLanguage, LANGUAGES } = useLanguage();

  const confirmSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: signOut },
      ]
    );
  };
  const [history, setHistory] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("jobs")
      .select("id, reference, customer, status, created_at")
      .eq("driver_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setHistory((data || []) as DeliveryRecord[]);
        setLoading(false);
      });
  }, [profile?.id]);

  const completed = history.filter((h) => h.status === "completed").length;
  const hoursPercent = Math.min(((profile?.hours_today || 0) / 9) * 100, 100);
  const weekPercent = Math.min(((profile?.hours_week || 0) / 56) * 100, 100);

  return (
    <View style={s.container}>
      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{profile?.name?.charAt(0) || "D"}</Text>
          </View>
          <Text style={s.name}>{profile?.name || "Driver"}</Text>
          <Text style={s.sub}>{profile?.license_type || "HGV"} Driver</Text>
          <View style={s.ratingRow}>
            <Ionicons name="star" size={16} color="#F59E0B" />
            <Text style={s.rating}>{profile?.rating?.toFixed(1) || "0.0"}</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={s.grid}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{profile?.total_deliveries || 0}</Text>
            <Text style={s.statLabel}>Total Deliveries</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{completed}</Text>
            <Text style={s.statLabel}>This Period</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: hoursPercent > 90 ? "#EF4444" : "#00FFD4" }]}>{profile?.hours_today || 0}h</Text>
            <Text style={s.statLabel}>Today</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: weekPercent > 90 ? "#EF4444" : "#00FFD4" }]}>{profile?.hours_week || 0}h</Text>
            <Text style={s.statLabel}>This Week</Text>
          </View>
        </View>

        {/* Hours Compliance */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Driving Hours Compliance</Text>
          <View style={s.barRow}>
            <Text style={s.barLabel}>Daily (9h max)</Text>
            <View style={s.barBg}><View style={[s.barFill, { width: `${hoursPercent}%`, backgroundColor: hoursPercent > 90 ? "#EF4444" : "#00FFD4" }]} /></View>
            <Text style={s.barValue}>{profile?.hours_today || 0}/9h</Text>
          </View>
          <View style={[s.barRow, { marginTop: 12 }]}>
            <Text style={s.barLabel}>Weekly (56h max)</Text>
            <View style={s.barBg}><View style={[s.barFill, { width: `${weekPercent}%`, backgroundColor: weekPercent > 90 ? "#EF4444" : "#00FFD4" }]} /></View>
            <Text style={s.barValue}>{profile?.hours_week || 0}/56h</Text>
          </View>
        </View>

        {/* Contact */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Contact</Text>
          <View style={s.infoRow}>
            <Ionicons name="mail-outline" size={16} color="#666" />
            <Text style={s.infoText}>{profile?.email || "—"}</Text>
          </View>
          <View style={s.infoRow}>
            <Ionicons name="call-outline" size={16} color="#666" />
            <Text style={s.infoText}>{profile?.phone || "—"}</Text>
          </View>
        </View>

        {/* Recent Deliveries */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Recent Deliveries</Text>
          {history.length === 0 ? (
            <Text style={s.empty}>No delivery history</Text>
          ) : (
            history.slice(0, 10).map((h) => (
              <View key={h.id} style={s.historyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={s.histRef}>{h.reference}</Text>
                  <Text style={s.histCustomer}>{h.customer}</Text>
                </View>
                <View style={[s.histBadge, {
                  backgroundColor: h.status === "completed" ? "#22C55E20" : h.status === "in_progress" ? "#3B82F620" : "#66660020",
                }]}>
                  <Text style={{
                    fontSize: 10, color: h.status === "completed" ? "#22C55E" : h.status === "in_progress" ? "#3B82F6" : "#666",
                  }}>{h.status.replace("_", " ")}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Language Selector */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("profile_title")} — Language</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[s.langBtn, lang === l.code && s.langBtnActive]}
                onPress={() => changeLanguage(l.code)}
              >
                <Text style={{ fontSize: 20 }}>{l.flag}</Text>
                <Text style={[s.langLabel, lang === l.code && { color: "#00FFD4" }]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={s.signOutBtn} onPress={confirmSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={s.signOutText}>{t("profile_sign_out")}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  content: { flex: 1, paddingHorizontal: 20 },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#00FFD420", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#00FFD4" },
  avatarText: { fontSize: 28, fontWeight: "700", color: "#00FFD4" },
  name: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12 },
  sub: { fontSize: 13, color: "#666", marginTop: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  rating: { fontSize: 16, fontWeight: "700", color: "#F59E0B" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: "#111118", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#1a1a24" },
  statValue: { fontSize: 22, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  statLabel: { fontSize: 10, color: "#666", marginTop: 4, textTransform: "uppercase" },
  card: { backgroundColor: "#111118", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#1a1a24" },
  cardTitle: { fontSize: 13, fontWeight: "600", color: "#fff", marginBottom: 12 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { fontSize: 11, color: "#666", width: 90 },
  barBg: { flex: 1, height: 8, backgroundColor: "#1a1a24", borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { fontSize: 11, color: "#888", width: 45, textAlign: "right", fontFamily: "monospace" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  infoText: { fontSize: 14, color: "#aaa" },
  historyItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a24" },
  histRef: { fontSize: 13, fontWeight: "600", color: "#00FFD4", fontFamily: "monospace" },
  histCustomer: { fontSize: 12, color: "#666", marginTop: 1 },
  histBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  empty: { color: "#444", fontSize: 13, textAlign: "center", paddingVertical: 16 },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF444410", borderRadius: 10, paddingVertical: 14, marginTop: 8 },
  signOutText: { color: "#EF4444", fontWeight: "600", fontSize: 15 },
  langBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: "#1a1a24", borderWidth: 1, borderColor: "#222" },
  langBtnActive: { borderColor: "#00FFD4", backgroundColor: "#00FFD410" },
  langLabel: { fontSize: 11, color: "#666", marginTop: 4 },
});
