/**
 * IncidentReportScreen — Accident & incident reporting
 * Photos, type, description, GPS auto-fill, submit to Supabase.
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { supabase } from "../lib/supabase";
import { useDriverAuth } from "../hooks/useDriverAuth";

const INCIDENT_TYPES = [
  { key: "accident",       label: "Traffic Accident",   icon: "car-sport",      color: "#EF4444" },
  { key: "near_miss",      label: "Near Miss",          icon: "warning",        color: "#F59E0B" },
  { key: "vehicle_damage", label: "Vehicle Damage",     icon: "construct",      color: "#F59E0B" },
  { key: "load_damage",    label: "Load / Cargo Damage",icon: "cube",           color: "#8B5CF6" },
  { key: "theft",          label: "Theft / Break-in",   icon: "lock-open",      color: "#EF4444" },
  { key: "other",          label: "Other",              icon: "ellipsis-horizontal", color: "#666" },
];

interface Photo { uri: string; uploaded: boolean }

export default function IncidentReportScreen({ navigation }: any) {
  const { profile } = useDriverAuth();
  const [incidentType, setIncidentType] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [thirdParty, setThirdParty] = useState(false);
  const [policeReported, setPoliceReported] = useState(false);
  const [policeRef, setPoliceRef] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [locationAddr, setLocationAddr] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocationLat(loc.coords.latitude);
      setLocationLng(loc.coords.longitude);
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo) {
        setLocationAddr(`${geo.street || ""} ${geo.city || ""} ${geo.postalCode || ""}`.trim());
      }
    })();
  }, []);

  const addPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
    if (!result.canceled && result.assets[0]) {
      const photo: Photo = { uri: result.assets[0].uri, uploaded: false };
      try {
        const path = `incidents/${profile?.id}-${Date.now()}.jpg`;
        const base64Data = result.assets[0].base64 || "";
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        await supabase.storage.from("pod-photos").upload(path, bytes, { contentType: "image/jpeg" });
        photo.uploaded = true;
      } catch {}
      setPhotos((prev) => [...prev, photo]);
    }
  };

  const handleSubmit = async () => {
    if (!incidentType) { Alert.alert("Select type", "Please select the incident type"); return; }
    if (!description.trim()) { Alert.alert("Add description", "Please describe what happened"); return; }

    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      await supabase.from("incidents").insert({
        driver_id: profile?.id,
        vehicle_id: profile?.vehicle_id,
        incident_type: incidentType,
        description: description.trim(),
        location_lat: locationLat,
        location_lng: locationLng,
        location_address: locationAddr,
        photos: photos.map((p) => p.uri),
        third_party_involved: thirdParty,
        reported_to_police: policeReported,
        police_reference: policeRef.trim() || null,
        status: "reported",
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Incident Reported",
        "Your incident report has been sent to dispatch. Stay safe.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Report Incident</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* Incident Type */}
        <Text style={s.sectionLabel}>INCIDENT TYPE</Text>
        <View style={s.typeGrid}>
          {INCIDENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.typeCard, incidentType === t.key && { borderColor: t.color, backgroundColor: t.color + "15" }]}
              onPress={() => setIncidentType(t.key)}
            >
              <Ionicons name={t.icon as any} size={22} color={incidentType === t.key ? t.color : "#555"} />
              <Text style={[s.typeLabel, incidentType === t.key && { color: t.color }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Location */}
        <Text style={s.sectionLabel}>LOCATION</Text>
        <View style={s.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="location" size={16} color={locationAddr ? "#00FFD4" : "#555"} />
            <Text style={{ color: locationAddr ? "#ccc" : "#555", flex: 1, fontSize: 13 }}>
              {locationAddr || "Getting location…"}
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={s.sectionLabel}>DESCRIPTION</Text>
        <TextInput
          style={s.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what happened — include time, road, vehicles involved…"
          placeholderTextColor="#444"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        {/* Photos */}
        <Text style={s.sectionLabel}>PHOTOS ({photos.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={s.addPhotoBtn} onPress={addPhoto}>
              <Ionicons name="camera" size={24} color="#00FFD4" />
              <Text style={s.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
            {photos.map((p, i) => (
              <View key={i} style={s.photoThumbWrapper}>
                <Image source={{ uri: p.uri }} style={s.photoThumb} />
                <View style={[s.uploadDot, { backgroundColor: p.uploaded ? "#22C55E" : "#F59E0B" }]} />
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Toggles */}
        <Text style={s.sectionLabel}>DETAILS</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.toggleRow} onPress={() => setThirdParty(!thirdParty)}>
            <Text style={s.toggleLabel}>Third party involved?</Text>
            <View style={[s.toggle, thirdParty && s.toggleOn]}>
              <View style={[s.toggleThumb, thirdParty && s.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.toggleRow} onPress={() => setPoliceReported(!policeReported)}>
            <Text style={s.toggleLabel}>Reported to police?</Text>
            <View style={[s.toggle, policeReported && s.toggleOn]}>
              <View style={[s.toggleThumb, policeReported && s.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          {policeReported && (
            <TextInput
              style={[s.input, { marginTop: 12 }]}
              value={policeRef}
              onChangeText={setPoliceRef}
              placeholder="Police reference number"
              placeholderTextColor="#444"
            />
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, (!incidentType || !description.trim()) && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!incidentType || !description.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="warning" size={20} color="#fff" />
              <Text style={s.submitText}>Submit Incident Report</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.footerNote}>
          This report will be immediately sent to dispatch and logged on your account.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
  sectionLabel: { fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 10, marginTop: 16 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  typeCard: {
    width: "48%", alignItems: "center", paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#111118", borderWidth: 1, borderColor: "#1a1a24", gap: 6,
  },
  typeLabel: { fontSize: 11, color: "#555", textAlign: "center" },
  card: { backgroundColor: "#111118", borderRadius: 12, padding: 16, marginBottom: 4, borderWidth: 1, borderColor: "#1a1a24" },
  textArea: {
    backgroundColor: "#111118", borderRadius: 12, padding: 16, color: "#fff",
    fontSize: 14, borderWidth: 1, borderColor: "#1a1a24", minHeight: 120,
  },
  input: {
    backgroundColor: "#1a1a24", borderRadius: 8, padding: 12,
    color: "#fff", fontSize: 14,
  },
  addPhotoBtn: {
    width: 80, height: 80, borderRadius: 10, backgroundColor: "#111118",
    borderWidth: 1, borderColor: "#00FFD440", borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  addPhotoText: { fontSize: 10, color: "#00FFD4" },
  photoThumbWrapper: { position: "relative" },
  photoThumb: { width: 80, height: 80, borderRadius: 10 },
  uploadDot: { position: "absolute", top: 4, right: 4, width: 10, height: 10, borderRadius: 5 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: 14, color: "#ccc" },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: "#333", padding: 2 },
  toggleOn: { backgroundColor: "#00FFD440" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#555" },
  toggleThumbOn: { backgroundColor: "#00FFD4", transform: [{ translateX: 20 }] },
  divider: { height: 1, backgroundColor: "#1a1a24", marginVertical: 12 },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "#EF4444", borderRadius: 12, paddingVertical: 16, marginTop: 20,
  },
  submitText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  footerNote: { fontSize: 11, color: "#444", textAlign: "center", marginTop: 12 },
});
