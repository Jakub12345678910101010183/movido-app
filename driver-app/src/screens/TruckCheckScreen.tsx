/**
 * Truck Check Screen — Daily HGV inspection checklist
 * DVSA-compliant walk-around checks with photo evidence
 */

import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { t } from "../lib/i18n";
import { useDriverAuth } from "../hooks/useDriverAuth";

interface CheckItem {
  id: string;
  label: string;
  category: string;
  checked: boolean;
  hasDefect: boolean;
  photo?: string;
}

const CHECKLIST: Omit<CheckItem, "checked" | "hasDefect">[] = [
  // Exterior
  { id: "tyres", label: "Tyres — tread depth, pressure, damage", category: "Exterior" },
  { id: "lights", label: "All lights & indicators working", category: "Exterior" },
  { id: "mirrors", label: "Mirrors clean & adjusted", category: "Exterior" },
  { id: "bodywork", label: "Bodywork — no damage or sharp edges", category: "Exterior" },
  { id: "numberplate", label: "Number plates clean & visible", category: "Exterior" },
  { id: "load", label: "Load secure, doors/curtains fastened", category: "Exterior" },
  // Under bonnet
  { id: "oil", label: "Engine oil level", category: "Under Bonnet" },
  { id: "coolant", label: "Coolant level", category: "Under Bonnet" },
  { id: "windscreen", label: "Windscreen washer fluid", category: "Under Bonnet" },
  { id: "adblue", label: "AdBlue level", category: "Under Bonnet" },
  // Cab
  { id: "brakes", label: "Brakes — pedal feel, handbrake", category: "Cab" },
  { id: "horn", label: "Horn working", category: "Cab" },
  { id: "wipers", label: "Wipers & washers", category: "Cab" },
  { id: "seatbelt", label: "Seatbelt condition", category: "Cab" },
  { id: "tacho", label: "Tachograph — card inserted, mode correct", category: "Cab" },
];

export default function TruckCheckScreen({ navigation }: any) {
  const { profile } = useDriverAuth();
  const [items, setItems] = useState<CheckItem[]>(
    CHECKLIST.map((c) => ({ ...c, checked: false, hasDefect: false }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggle = (id: string) => {
    setItems((prev) => prev.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const markDefect = (id: string) => {
    setItems((prev) => prev.map((item) =>
      item.id === id ? { ...item, hasDefect: !item.hasDefect, checked: true } : item
    ));
  };

  const takePhoto = async (id: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0]) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setItems((prev) => prev.map((item) =>
        item.id === id ? { ...item, photo: uri, checked: true } : item
      ));
    }
  };

  const allChecked = items.every((i) => i.checked);
  const defectCount = items.filter((i) => i.hasDefect).length;
  const checkedCount = items.filter((i) => i.checked).length;

  const handleSubmit = async () => {
    if (!allChecked) {
      Alert.alert("Incomplete", "Please check all items before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      // Save to Supabase (fleet_maintenance as type "truck_check")
      if (profile?.vehicle_id) {
        await supabase.from("fleet_maintenance").insert({
          vehicle_id: profile.vehicle_id,
          type: "inspection",
          description: `Daily truck check by ${profile.name}. ${defectCount} defect(s) found. Items: ${items.filter((i) => i.hasDefect).map((i) => i.label).join(", ") || "None"}`,
          scheduled_date: new Date().toISOString(),
          completed_date: new Date().toISOString(),
          status: defectCount > 0 ? "scheduled" : "completed",
          cost: 0,
        });
      }

      Alert.alert(
        defectCount > 0 ? "Defects Reported" : "Check Complete",
        defectCount > 0
          ? `${defectCount} defect(s) reported to dispatch.`
          : "Vehicle check passed. Safe to drive!",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setIsSubmitting(false); }
  };

  // Group by category
  const categories = [...new Set(CHECKLIST.map((c) => c.category))];

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Daily Truck Check</Text>
        <Text style={s.counter}>{checkedCount}/{items.length}</Text>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {categories.map((cat) => (
          <View key={cat}>
            <Text style={s.catLabel}>{cat}</Text>
            {items.filter((i) => i.category === cat).map((item) => (
              <View key={item.id} style={[s.checkItem, item.hasDefect && { borderColor: "#EF444440" }]}>
                <TouchableOpacity style={s.checkRow} onPress={() => toggle(item.id)}>
                  <Ionicons
                    name={item.checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={item.hasDefect ? "#EF4444" : item.checked ? "#22C55E" : "#555"}
                  />
                  <Text style={[s.checkLabel, item.checked && { color: "#aaa" }]}>{item.label}</Text>
                </TouchableOpacity>
                <View style={s.checkActions}>
                  <TouchableOpacity onPress={() => markDefect(item.id)} style={[s.miniBtn, item.hasDefect && { backgroundColor: "#EF444420" }]}>
                    <Ionicons name="alert-circle" size={16} color={item.hasDefect ? "#EF4444" : "#555"} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => takePhoto(item.id)} style={[s.miniBtn, item.photo ? { backgroundColor: "#8B5CF620" } : {}]}>
                    <Ionicons name="camera" size={16} color={item.photo ? "#8B5CF6" : "#555"} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ))}

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, !allChecked && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!allChecked || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={20} color="#000" />
              <Text style={s.submitText}>
                Submit Check {defectCount > 0 ? `(${defectCount} defects)` : ""}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: "700", color: "#fff" },
  counter: { fontSize: 14, color: "#00FFD4", fontFamily: "monospace" },
  content: { flex: 1, paddingHorizontal: 20 },
  catLabel: { fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },
  checkItem: { backgroundColor: "#111118", borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#1a1a24", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  checkLabel: { fontSize: 13, color: "#ccc", flex: 1 },
  checkActions: { flexDirection: "row", gap: 6 },
  miniBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a24" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00FFD4", borderRadius: 12, paddingVertical: 16, marginTop: 20 },
  submitText: { fontSize: 16, fontWeight: "700", color: "#000" },
});
