/**
 * SignatureScreen — Digital signature capture for POD
 * Uses react-native-svg + PanResponder for smooth drawing.
 * Returns base64 PNG signature to parent screen.
 */

import React, { useRef, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, PanResponder,
  Alert, Dimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get("window");
const PAD_WIDTH = width - 40;
const PAD_HEIGHT = 260;

interface Point { x: number; y: number }

export default function SignatureScreen({ route, navigation }: any) {
  const { jobRef, onSave } = route.params as {
    jobRef: string;
    onSave: (svgData: string) => void;
  };

  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef<string>("");
  const isDrawing = useRef(false);

  const pointToPath = (points: Point[]): string => {
    if (points.length < 2) return "";
    const [start, ...rest] = points;
    let d = `M ${start.x} ${start.y}`;
    for (const p of rest) {
      d += ` L ${p.x} ${p.y}`;
    }
    return d;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        isDrawing.current = true;
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        Haptics.selectionAsync();
      },
      onPanResponderMove: (evt) => {
        if (!isDrawing.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        // Force re-render by updating paths with current in-progress path
        setPaths((prev) => {
          const updated = [...prev];
          updated[updated.length] = currentPath.current; // add as last
          return updated;
        });
      },
      onPanResponderRelease: () => {
        isDrawing.current = false;
        if (currentPath.current) {
          setPaths((prev) => [...prev.slice(0, -1), currentPath.current]);
          currentPath.current = "";
        }
      },
    })
  ).current;

  const clearSignature = () => {
    setPaths([]);
    currentPath.current = "";
  };

  const saveSignature = useCallback(() => {
    if (paths.length === 0) {
      Alert.alert("No signature", "Please sign before saving");
      return;
    }

    // Build SVG string — this is what we store
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAD_WIDTH}" height="${PAD_HEIGHT}" style="background:#fff">
      ${paths.map((d) => `<path d="${d}" stroke="#000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}
    </svg>`;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(svgString);
    navigation.goBack();
  }, [paths, onSave, navigation]);

  const hasSig = paths.length > 0;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Customer Signature</Text>
          <Text style={s.sub}>Job {jobRef}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.content}>
        <Text style={s.label}>Ask the customer to sign below:</Text>

        {/* Signature pad */}
        <View style={s.padWrapper}>
          <View style={s.padBg} {...panResponder.panHandlers}>
            <Svg width={PAD_WIDTH} height={PAD_HEIGHT}>
              {paths.map((d, i) => (
                <Path
                  key={i}
                  d={d}
                  stroke="#111"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
            {!hasSig && (
              <View style={s.placeholder} pointerEvents="none">
                <Text style={s.placeholderText}>Sign here</Text>
              </View>
            )}
          </View>
          <View style={s.padLine} />
          <Text style={s.padNote}>Customer signature</Text>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, s.btnClear]}
            onPress={clearSignature}
            disabled={!hasSig}
          >
            <Ionicons name="refresh" size={18} color={hasSig ? "#EF4444" : "#444"} />
            <Text style={[s.btnText, { color: hasSig ? "#EF4444" : "#444" }]}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnSave, !hasSig && { opacity: 0.4 }]}
            onPress={saveSignature}
            disabled={!hasSig}
          >
            <Ionicons name="checkmark-circle" size={18} color="#000" />
            <Text style={[s.btnText, { color: "#000" }]}>Confirm & Save</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.legal}>
          By signing, the customer confirms receipt of goods in the stated condition.
          This signature is legally binding as proof of delivery.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#fff", textAlign: "center" },
  sub: { fontSize: 12, color: "#00FFD4", textAlign: "center", fontFamily: "monospace" },
  content: { flex: 1, paddingHorizontal: 20 },
  label: { fontSize: 14, color: "#aaa", marginBottom: 16 },
  padWrapper: { alignItems: "center" },
  padBg: {
    width: PAD_WIDTH,
    height: PAD_HEIGHT,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { fontSize: 16, color: "#ccc", fontStyle: "italic" },
  padLine: {
    width: PAD_WIDTH - 40,
    height: 1,
    backgroundColor: "#ccc",
    marginTop: -30,
  },
  padNote: { fontSize: 11, color: "#888", marginTop: 6, marginBottom: 24 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  btnClear: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  btnSave: { backgroundColor: "#00FFD4" },
  btnText: { fontSize: 15, fontWeight: "600" },
  legal: {
    fontSize: 11, color: "#444", textAlign: "center",
    marginTop: 20, lineHeight: 16,
  },
});
