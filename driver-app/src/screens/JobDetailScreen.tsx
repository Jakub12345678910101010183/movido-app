/**
 * Job Detail Screen — Full job view with all actions
 * - View pickup/delivery addresses + multi-stop list
 * - Navigate in-app (TomTom HGV map) or external
 * - Click-to-call customer
 * - Start/Complete delivery with status flow
 * - Capture POD photo
 * - Digital signature from customer
 * - Driver notes
 */

import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Linking, ActivityIndicator, Image, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useDriverJobs, type DriverJob } from "../hooks/useDriverJobs";
import { t } from "../lib/i18n";
import { supabase } from "../lib/supabase";

const statusFlow = ["assigned", "in_progress", "completed"];

interface Stop {
  label: string;
  address: string;
  lat?: number;
  lng?: number;
  completed?: boolean;
}

export default function JobDetailScreen({ route, navigation }: any) {
  const { jobId } = route.params;
  const { jobs, updateJobStatus, savePOD } = useDriverJobs(undefined);
  const [loading, setLoading] = useState(false);
  const [podPhoto, setPodPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [driverNotes, setDriverNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [job, setJob] = useState<DriverJob | null>(null);

  React.useEffect(() => {
    const found = jobs.find((j) => j.id === jobId);
    if (found) {
      setJob(found);
      setDriverNotes((found as any).driver_notes || "");
      return;
    }
    supabase.from("jobs").select("*").eq("id", jobId).single().then(({ data }) => {
      if (data) {
        setJob(data as DriverJob);
        setDriverNotes((data as any).driver_notes || "");
      }
    });
  }, [jobId, jobs]);

  if (!job) {
    return (
      <View style={s.container}>
        <View style={s.center}><ActivityIndicator color="#00FFD4" /></View>
      </View>
    );
  }

  const stops: Stop[] = (job as any).stops || [];
  const hasStops = stops.length > 0;
  const customerPhone = (job as any).customer_phone;

  const nextStatus = (() => {
    const idx = statusFlow.indexOf(job.status);
    return idx < statusFlow.length - 1 ? statusFlow[idx + 1] : null;
  })();

  const handleAdvanceStatus = async () => {
    if (!nextStatus) return;
    if (nextStatus === "completed" && job.pod_status === "pending") {
      Alert.alert(
        "Complete Delivery",
        "How would you like to confirm delivery?",
        [
          { text: "Skip", onPress: () => completeJob() },
          { text: "Take Photo", onPress: () => capturePhoto() },
          { text: "Get Signature", onPress: () => openSignature() },
        ]
      );
      return;
    }
    setLoading(true);
    try {
      await updateJobStatus(job.id, nextStatus);
      setJob((prev) => prev ? { ...prev, status: nextStatus } : null);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setLoading(false); }
  };

  const completeJob = async () => {
    setLoading(true);
    try {
      await updateJobStatus(job.id, "completed");
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setLoading(false); }
  };

  const capturePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Camera access required"); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
    if (!result.canceled && result.assets[0]) {
      const base64 = "data:image/jpeg;base64," + result.assets[0].base64;
      setPodPhoto(base64);
      setLoading(true);
      try {
        await savePOD(job.id, { pod_status: "photo", pod_photo_url: base64, pod_notes: "Photo taken at " + new Date().toLocaleString("en-GB") });
        await updateJobStatus(job.id, "completed");
        Alert.alert("Success", "POD photo saved!");
        navigation.goBack();
      } catch (err: any) { Alert.alert("Error", err.message); }
      finally { setLoading(false); }
    }
  };

  const openSignature = () => {
    navigation.navigate("Signature", {
      jobRef: job.reference,
      onSave: async (svgData: string) => {
        setSignature(svgData);
        setLoading(true);
        try {
          await savePOD(job.id, { pod_status: "signature", pod_notes: "Signature at " + new Date().toLocaleString("en-GB") });
          await updateJobStatus(job.id, "completed");
          Alert.alert("Signed!", "Delivery confirmed with signature");
          navigation.goBack();
        } catch (err: any) { Alert.alert("Error", err.message); }
        finally { setLoading(false); }
      },
    });
  };

  const openInAppMap = () => {
    if (job.delivery_lat && job.delivery_lng) {
      navigation.navigate("Map", {
        destLat: job.delivery_lat, destLng: job.delivery_lng,
        destLabel: job.delivery_address || job.customer,
        jobRef: job.reference,
      });
    } else {
      Alert.alert("No coordinates", "GPS coordinates not available for this job");
    }
  };

  const openExternalNav = () => {
    const lat = job.delivery_lat; const lng = job.delivery_lng; const addr = job.delivery_address;
    if (lat && lng) {
      Linking.openURL("https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng + "&travelmode=driving");
    } else if (addr) {
      Linking.openURL("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr));
    }
  };

  const callCustomer = () => {
    if (!customerPhone) return;
    Alert.alert("Call Customer", customerPhone, [
      { text: "Cancel", style: "cancel" },
      { text: "Call", onPress: () => Linking.openURL("tel:" + customerPhone) },
    ]);
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await supabase.from("jobs").update({ driver_notes: driverNotes }).eq("id", job.id);
      Alert.alert("Saved", "Notes saved");
    } catch (err: any) { Alert.alert("Error", err.message); }
    finally { setSavingNotes(false); }
  };

  const statusLabel = { pending: "Pending", assigned: "Assigned", in_progress: "In Progress", completed: "Completed" }[job.status] || job.status;
  const nextLabel = { in_progress: t("job_start_delivery"), completed: t("job_complete_delivery") }[nextStatus || ""] || "";

  return (
    <View style={s.container}>
      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={s.title}>{job.reference}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={s.statusBar}>
          <Text style={s.statusLabel}>{statusLabel}</Text>
          <Text style={s.customer}>{job.customer}</Text>
          {customerPhone && (
            <TouchableOpacity style={s.callBtn} onPress={callCustomer}>
              <Ionicons name="call" size={14} color="#22C55E" />
              <Text style={s.callText}>{customerPhone}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.card}>
          <View style={s.addrRow}>
            <View style={[s.dot, { backgroundColor: "#22C55E" }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.addrLabel}>PICKUP</Text>
              <Text style={s.addrText}>{job.pickup_address || "No address"}</Text>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.addrRow}>
            <View style={[s.dot, { backgroundColor: "#F59E0B" }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.addrLabel}>DELIVERY</Text>
              <Text style={s.addrText}>{job.delivery_address || "No address"}</Text>
            </View>
          </View>
        </View>

        {hasStops && (
          <View style={s.card}>
            <Text style={s.addrLabel}>STOPS ({stops.length})</Text>
            {stops.map((stop, i) => (
              <View key={i} style={[s.stopRow, i < stops.length - 1 && { borderBottomWidth: 1, borderBottomColor: "#1a1a24" }]}>
                <View style={[s.stopNum, stop.completed && { backgroundColor: "#22C55E" }]}>
                  <Text style={s.stopNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stopLabel}>{stop.label}</Text>
                  <Text style={s.stopAddr}>{stop.address}</Text>
                </View>
                {stop.completed && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
              </View>
            ))}
          </View>
        )}

        {job.eta && (
          <View style={s.card}>
            <View style={s.row}>
              <Ionicons name="time-outline" size={18} color="#00FFD4" />
              <Text style={{ color: "#fff", marginLeft: 8, fontWeight: "600" }}>ETA</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.etaText}>{new Date(job.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
          </View>
        )}

        {(job.pod_photo_url || podPhoto) && (
          <View style={s.card}>
            <Text style={s.addrLabel}>PROOF OF DELIVERY</Text>
            <Image source={{ uri: podPhoto || job.pod_photo_url || "" }} style={s.podImage} resizeMode="cover" />
          </View>
        )}

        {signature && (
          <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
            <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
            <Text style={{ color: "#22C55E", fontWeight: "600" }}>Customer signature captured</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.addrLabel}>DRIVER NOTES</Text>
          <TextInput
            style={s.notesInput}
            value={driverNotes}
            onChangeText={setDriverNotes}
            placeholder="Gate code, access info, special instructions…"
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          {driverNotes !== ((job as any).driver_notes || "") && (
            <TouchableOpacity style={s.saveNotesBtn} onPress={saveNotes} disabled={savingNotes}>
              {savingNotes ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.saveNotesBtnText}>Save Notes</Text>}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ gap: 10, marginTop: 4 }}>
          {job.delivery_lat && job.status !== "completed" && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#00FFD420" }]} onPress={openInAppMap}>
              <Ionicons name="map" size={20} color="#00FFD4" />
              <Text style={[s.actionText, { color: "#00FFD4" }]}>HGV Navigation (TomTom)</Text>
            </TouchableOpacity>
          )}
          {(job.delivery_lat || job.delivery_address) && job.status !== "completed" && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#3B82F620" }]} onPress={openExternalNav}>
              <Ionicons name="navigate-outline" size={20} color="#3B82F6" />
              <Text style={[s.actionText, { color: "#3B82F6" }]}>Open in Google Maps</Text>
            </TouchableOpacity>
          )}
          {job.status === "in_progress" && job.pod_status === "pending" && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#8B5CF620" }]} onPress={capturePhoto}>
              <Ionicons name="camera" size={20} color="#8B5CF6" />
              <Text style={[s.actionText, { color: "#8B5CF6" }]}>Capture POD Photo</Text>
            </TouchableOpacity>
          )}
          {job.status === "in_progress" && !signature && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#F59E0B20" }]} onPress={openSignature}>
              <Ionicons name="pencil" size={20} color="#F59E0B" />
              <Text style={[s.actionText, { color: "#F59E0B" }]}>Get Customer Signature</Text>
            </TouchableOpacity>
          )}
          {nextStatus && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#22C55E20" }]} onPress={handleAdvanceStatus} disabled={loading}>
              {loading ? <ActivityIndicator color="#22C55E" /> : (
                <>
                  <Ionicons name={nextStatus === "completed" ? "checkmark-circle" : "play"} size={20} color="#22C55E" />
                  <Text style={[s.actionText, { color: "#22C55E" }]}>{nextLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  content: { flex: 1, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  statusBar: { alignItems: "center", marginBottom: 20 },
  statusLabel: { fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 2 },
  customer: { fontSize: 20, fontWeight: "700", color: "#fff", marginTop: 4 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#22C55E15", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#22C55E30" },
  callText: { color: "#22C55E", fontSize: 13, fontWeight: "600" },
  card: { backgroundColor: "#111118", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#1a1a24" },
  addrRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  addrLabel: { fontSize: 10, color: "#666", letterSpacing: 1, marginBottom: 4 },
  addrText: { fontSize: 14, color: "#ccc" },
  divider: { height: 1, backgroundColor: "#222", marginVertical: 12, marginLeft: 22 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  stopNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center" },
  stopNumText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  stopLabel: { fontSize: 13, fontWeight: "600", color: "#ccc" },
  stopAddr: { fontSize: 11, color: "#555", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  etaText: { fontSize: 22, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  podImage: { width: "100%", height: 160, borderRadius: 8, marginTop: 8 },
  notesInput: { backgroundColor: "#1a1a24", borderRadius: 8, padding: 12, color: "#fff", fontSize: 13, minHeight: 80, borderWidth: 1, borderColor: "#2a2a2a" },
  saveNotesBtn: { backgroundColor: "#00FFD4", borderRadius: 8, padding: 10, alignItems: "center", marginTop: 10 },
  saveNotesBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 14 },
  actionText: { fontSize: 15, fontWeight: "600" },
});
