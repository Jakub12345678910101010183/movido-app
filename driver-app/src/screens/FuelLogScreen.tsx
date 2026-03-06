/**
 * FuelLogScreen — Fuel purchase logging
 * Records fuel stops for expense claims and fleet management.
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { supabase } from "../lib/supabase";
import { useDriverAuth } from "../hooks/useDriverAuth";

interface FuelEntry {
  id: number;
  fuel_amount: number;
  fuel_cost: number;
  fuel_type: string;
  mileage: number | null;
  station_name: string | null;
  created_at: string;
}

const FUEL_TYPES = ["diesel", "adblue", "petrol", "hvo"];

export default function FuelLogScreen({ navigation }: any) {
  const { profile } = useDriverAuth();
  const [history, setHistory] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [fuelType, setFuelType] = useState("diesel");
  const [mileage, setMileage] = useState("");
  const [station, setStation] = useState("");

  // Auto-fill station from GPS
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo?.name) setStation(geo.name);
    })();
  }, []);

  // Load history
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("fuel_logs")
      .select("*")
      .eq("driver_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setHistory((data || []) as FuelEntry[]);
        setLoading(false);
      });
  }, [profile?.id]);

  const handleSave = async () => {
    if (!litres || parseFloat(litres) <= 0) {
      Alert.alert("Enter litres", "Please enter the amount of fuel");
      return;
    }

    setSaving(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {}

      const { data, error } = await supabase
        .from("fuel_logs")
        .insert({
          driver_id: profile?.id,
          vehicle_id: profile?.vehicle_id,
          fuel_amount: parseFloat(litres),
          fuel_cost: cost ? parseFloat(cost) : null,
          fuel_type: fuelType,
          mileage: mileage ? parseInt(mileage) : null,
          station_name: station.trim() || null,
          location_lat: lat,
          location_lng: lng,
        })
        .select()
        .single();

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHistory((prev) => [data as FuelEntry, ...prev]);

      // Reset form
      setLitres("");
      setCost("");
      setMileage("");
      Alert.alert("Saved", `${litres}L ${fuelType} logged successfully`);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalLitres = history.reduce((sum, e) => sum + (e.fuel_amount || 0), 0);
  const totalCost = history.reduce((sum, e) => sum + (e.fuel_cost || 0), 0);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Fuel Log</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryVal}>{totalLitres.toFixed(0)}L</Text>
            <Text style={s.summaryLabel}>Total Fuel</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryVal}>£{totalCost.toFixed(2)}</Text>
            <Text style={s.summaryLabel}>Total Cost</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryVal}>{history.length}</Text>
            <Text style={s.summaryLabel}>Entries</Text>
          </View>
        </View>

        {/* New Entry Form */}
        <Text style={s.sectionLabel}>NEW ENTRY</Text>
        <View style={s.card}>
          {/* Fuel Type */}
          <View style={s.row}>
            {FUEL_TYPES.map((ft) => (
              <TouchableOpacity
                key={ft}
                style={[s.typeChip, fuelType === ft && s.typeChipActive]}
                onPress={() => setFuelType(ft)}
              >
                <Text style={[s.typeChipText, fuelType === ft && s.typeChipTextActive]}>
                  {ft.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Litres + Cost */}
          <View style={[s.row, { marginTop: 14, gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.inputLabel}>Litres *</Text>
              <TextInput
                style={s.input}
                value={litres}
                onChangeText={setLitres}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inputLabel}>Cost (£)</Text>
              <TextInput
                style={s.input}
                value={cost}
                onChangeText={setCost}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Mileage */}
          <Text style={[s.inputLabel, { marginTop: 12 }]}>Mileage (odometer)</Text>
          <TextInput
            style={s.input}
            value={mileage}
            onChangeText={setMileage}
            placeholder="e.g. 125400"
            placeholderTextColor="#444"
            keyboardType="number-pad"
          />

          {/* Station */}
          <Text style={[s.inputLabel, { marginTop: 12 }]}>Fuel Station</Text>
          <TextInput
            style={s.input}
            value={station}
            onChangeText={setStation}
            placeholder="e.g. Moto Northampton"
            placeholderTextColor="#444"
          />

          <TouchableOpacity
            style={[s.saveBtn, (!litres || saving) && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!litres || saving}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="save" size={18} color="#000" />
                <Text style={s.saveBtnText}>Log Fuel Stop</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* History */}
        <Text style={s.sectionLabel}>HISTORY</Text>
        {loading ? (
          <ActivityIndicator color="#00FFD4" style={{ marginTop: 20 }} />
        ) : history.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="water-outline" size={36} color="#333" />
            <Text style={s.emptyText}>No fuel entries yet</Text>
          </View>
        ) : (
          history.map((entry) => (
            <View key={entry.id} style={s.entryCard}>
              <View style={s.entryLeft}>
                <Text style={s.entryLitres}>{entry.fuel_amount}L</Text>
                <View style={s.fuelTypeBadge}>
                  <Text style={s.fuelTypeText}>{entry.fuel_type.toUpperCase()}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.entryStation}>{entry.station_name || "Unknown station"}</Text>
                {entry.mileage && (
                  <Text style={s.entryMeta}>{entry.mileage.toLocaleString()} mi</Text>
                )}
                <Text style={s.entryDate}>
                  {new Date(entry.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </Text>
              </View>
              {entry.fuel_cost && (
                <Text style={s.entryCost}>£{entry.fuel_cost.toFixed(2)}</Text>
              )}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#fff" },
  content: { flex: 1, paddingHorizontal: 20 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  summaryCard: {
    flex: 1, backgroundColor: "#111118", borderRadius: 10, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: "#1a1a24",
  },
  summaryVal: { fontSize: 20, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  summaryLabel: { fontSize: 10, color: "#666", marginTop: 4, textTransform: "uppercase" },
  sectionLabel: { fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 10, marginTop: 16 },
  card: { backgroundColor: "#111118", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#1a1a24" },
  row: { flexDirection: "row", gap: 8 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: "#1a1a24", borderWidth: 1, borderColor: "#333",
  },
  typeChipActive: { borderColor: "#00FFD4", backgroundColor: "#00FFD415" },
  typeChipText: { fontSize: 11, fontWeight: "600", color: "#555" },
  typeChipTextActive: { color: "#00FFD4" },
  inputLabel: { fontSize: 11, color: "#666", marginBottom: 6 },
  input: {
    backgroundColor: "#1a1a24", borderRadius: 8, padding: 12,
    color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "#2a2a2a",
  },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "#00FFD4", borderRadius: 10, paddingVertical: 14, marginTop: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#000" },
  empty: { alignItems: "center", paddingVertical: 32 },
  emptyText: { color: "#444", marginTop: 8, fontSize: 13 },
  entryCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#111118", borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: "#1a1a24",
  },
  entryLeft: { alignItems: "center", gap: 4 },
  entryLitres: { fontSize: 18, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  fuelTypeBadge: { backgroundColor: "#1a1a24", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  fuelTypeText: { fontSize: 9, color: "#666" },
  entryStation: { fontSize: 13, fontWeight: "600", color: "#ddd" },
  entryMeta: { fontSize: 11, color: "#555", marginTop: 2, fontFamily: "monospace" },
  entryDate: { fontSize: 10, color: "#444", marginTop: 2 },
  entryCost: { fontSize: 16, fontWeight: "700", color: "#22C55E", fontFamily: "monospace" },
});
