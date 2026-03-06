/**
 * Document Scanner Screen — Photograph and store transport documents
 * CMR notes, delivery tickets, customs paperwork etc.
 * Saves to Supabase Storage with job reference tagging
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { t } from "../lib/i18n";
import { useDriverAuth } from "../hooks/useDriverAuth";
import { useDriverJobs, type DriverJob } from "../hooks/useDriverJobs";

interface ScannedDoc {
  id: string;
  jobRef: string;
  type: string;
  imageUri: string;
  timestamp: Date;
  uploaded: boolean;
}

const DOC_TYPES = [
  { key: "cmr", label: "CMR Note", icon: "document-text" },
  { key: "delivery_note", label: "Delivery Note", icon: "receipt" },
  { key: "customs", label: "Customs Document", icon: "globe" },
  { key: "damage_report", label: "Damage Report", icon: "alert-circle" },
  { key: "other", label: "Other", icon: "attach" },
];

export default function DocumentScannerScreen({ navigation }: any) {
  const { profile } = useDriverAuth();
  const { jobs } = useDriverJobs(profile?.id);
  const [docs, setDocs] = useState<ScannedDoc[]>([]);
  const [selectedJob, setSelectedJob] = useState<DriverJob | null>(null);
  const [selectedType, setSelectedType] = useState("cmr");
  const [scanning, setScanning] = useState(false);

  const activeJobs = jobs.filter((j) => j.status === "assigned" || j.status === "in_progress");

  const scanDocument = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access required to scan documents");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setScanning(true);
      const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const jobRef = selectedJob?.reference || "UNLINKED";

      const doc: ScannedDoc = {
        id: `doc-${Date.now()}`,
        jobRef,
        type: selectedType,
        imageUri: base64,
        timestamp: new Date(),
        uploaded: false,
      };

      // Try to upload to Supabase Storage
      try {
        const path = `documents/${jobRef}/${selectedType}-${Date.now()}.jpg`;

        // React Native: convert base64 string → Uint8Array (fetch(dataURI) is unreliable in RN)
        const base64Data = result.assets[0].base64 || "";
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        await supabase.storage.from("pod-photos").upload(path, bytes, { contentType: "image/jpeg" });
        doc.uploaded = true;
      } catch {
        // Fallback: save locally only
        doc.uploaded = false;
      }

      setDocs((prev) => [doc, ...prev]);
      setScanning(false);
      Alert.alert("Scanned", `${DOC_TYPES.find((t) => t.key === selectedType)?.label} saved for ${jobRef}`);
    }
  };

  const renderDoc = ({ item }: { item: ScannedDoc }) => {
    const typeInfo = DOC_TYPES.find((t) => t.key === item.type);
    return (
      <View style={s.docCard}>
        <Image source={{ uri: item.imageUri }} style={s.docThumb} />
        <View style={{ flex: 1 }}>
          <Text style={s.docType}>{typeInfo?.label || item.type}</Text>
          <Text style={s.docRef}>{item.jobRef}</Text>
          <Text style={s.docTime}>{item.timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
        <View style={[s.uploadBadge, { backgroundColor: item.uploaded ? "#22C55E20" : "#F59E0B20" }]}>
          <Ionicons name={item.uploaded ? "cloud-done" : "cloud-offline"} size={14} color={item.uploaded ? "#22C55E" : "#F59E0B"} />
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Document Scanner</Text>
        <Text style={s.count}>{docs.length}</Text>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* Job Selector */}
        <Text style={s.sectionLabel}>LINK TO JOB</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={s.chipRow}>
            <TouchableOpacity
              style={[s.chip, !selectedJob && s.chipActive]}
              onPress={() => setSelectedJob(null)}
            >
              <Text style={[s.chipText, !selectedJob && s.chipTextActive]}>No Job</Text>
            </TouchableOpacity>
            {activeJobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                style={[s.chip, selectedJob?.id === job.id && s.chipActive]}
                onPress={() => setSelectedJob(job)}
              >
                <Text style={[s.chipText, selectedJob?.id === job.id && s.chipTextActive]}>{job.reference}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Document Type */}
        <Text style={s.sectionLabel}>DOCUMENT TYPE</Text>
        <View style={s.typeGrid}>
          {DOC_TYPES.map((dt) => (
            <TouchableOpacity
              key={dt.key}
              style={[s.typeCard, selectedType === dt.key && s.typeCardActive]}
              onPress={() => setSelectedType(dt.key)}
            >
              <Ionicons
                name={dt.icon as any}
                size={20}
                color={selectedType === dt.key ? "#00FFD4" : "#666"}
              />
              <Text style={[s.typeLabel, selectedType === dt.key && { color: "#00FFD4" }]}>
                {dt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Scan Button */}
        <TouchableOpacity style={s.scanBtn} onPress={scanDocument} disabled={scanning}>
          {scanning ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="scan" size={24} color="#000" />
              <Text style={s.scanText}>Scan Document</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Scanned Documents */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>SCANNED TODAY ({docs.length})</Text>
        {docs.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-outline" size={40} color="#333" />
            <Text style={s.emptyText}>No documents scanned</Text>
          </View>
        ) : (
          docs.map((doc) => <View key={doc.id}>{renderDoc({ item: doc })}</View>)
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: "700", color: "#fff" },
  count: { fontSize: 14, color: "#00FFD4", fontFamily: "monospace" },
  content: { flex: 1, paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, color: "#666", letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#111118", borderWidth: 1, borderColor: "#1a1a24" },
  chipActive: { borderColor: "#00FFD4", backgroundColor: "#00FFD410" },
  chipText: { fontSize: 12, color: "#666", fontFamily: "monospace" },
  chipTextActive: { color: "#00FFD4" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeCard: { width: "30%", alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: "#111118", borderWidth: 1, borderColor: "#1a1a24" },
  typeCardActive: { borderColor: "#00FFD4", backgroundColor: "#00FFD410" },
  typeLabel: { fontSize: 10, color: "#666", marginTop: 4, textAlign: "center" },
  scanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#00FFD4", borderRadius: 12, paddingVertical: 16 },
  scanText: { fontSize: 16, fontWeight: "700", color: "#000" },
  docCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#111118", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#1a1a24" },
  docThumb: { width: 50, height: 50, borderRadius: 8 },
  docType: { fontSize: 13, fontWeight: "600", color: "#fff" },
  docRef: { fontSize: 11, color: "#00FFD4", fontFamily: "monospace", marginTop: 2 },
  docTime: { fontSize: 10, color: "#555", marginTop: 2 },
  uploadBadge: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 32 },
  emptyText: { color: "#444", marginTop: 8, fontSize: 13 },
});
