/**
 * MapScreen — In-app TomTom HGV Navigation
 * Shows live driver position + job destination on TomTom map tiles.
 * HGV-aware: uses TomTom Routing API with truck parameters.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import MapView, { Marker, Polyline, UrlTile, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY || "";

interface RoutePoint { latitude: number; longitude: number }

interface MapScreenProps {
  route: {
    params: {
      destLat: number;
      destLng: number;
      destLabel: string;
      jobRef: string;
    };
  };
  navigation: any;
}

export default function MapScreen({ route, navigation }: MapScreenProps) {
  const { destLat, destLng, destLabel, jobRef } = route.params;

  const mapRef = useRef<MapView>(null);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [routeCoords, setRouteCoords] = useState<RoutePoint[]>([]);
  const [eta, setEta] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  // Start GPS watch
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Location access required for navigation");
        navigation.goBack();
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setMyLat(loc.coords.latitude);
      setMyLng(loc.coords.longitude);
      setLoading(false);

      // Fetch HGV route from TomTom
      fetchRoute(loc.coords.latitude, loc.coords.longitude);

      // Watch for position updates
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 20 },
        (position) => {
          setMyLat(position.coords.latitude);
          setMyLng(position.coords.longitude);
        }
      );
    })();

    return () => { watchRef.current?.remove(); };
  }, []);

  const fetchRoute = async (fromLat: number, fromLng: number) => {
    try {
      // TomTom Routing API — truck profile with HGV parameters
      const url = [
        `https://api.tomtom.com/routing/1/calculateRoute`,
        `/${fromLat},${fromLng}:${destLat},${destLng}`,
        `/json?key=${TOMTOM_KEY}`,
        `&vehicleHeading=0`,
        `&travelMode=truck`,
        `&vehicleWeight=26000`,      // 26 tonne HGV
        `&vehicleAxleWeight=11500`,
        `&vehicleHeight=4.1`,        // metres
        `&vehicleWidth=2.55`,
        `&vehicleLength=16.5`,
        `&routeType=fastest`,
        `&traffic=true`,
      ].join("");

      const resp = await fetch(url);
      const data = await resp.json();

      const route = data?.routes?.[0];
      if (!route) return;

      // Extract route polyline points
      const points: RoutePoint[] = route.legs
        .flatMap((leg: any) => leg.points)
        .map((p: any) => ({ latitude: p.latitude, longitude: p.longitude }));
      setRouteCoords(points);

      // ETA + distance
      const summary = route.summary;
      const mins = Math.round(summary.travelTimeInSeconds / 60);
      const km = (summary.lengthInMeters / 1000).toFixed(1);
      setDistanceKm(parseFloat(km));

      const etaTime = new Date(Date.now() + summary.travelTimeInSeconds * 1000);
      setEta(etaTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));

      // Fit map to route
      if (mapRef.current && points.length > 0) {
        mapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        });
      }
    } catch {}
  };

  const centreOnMe = () => {
    if (myLat && myLng && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: myLat, longitude: myLng,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 500);
    }
  };

  if (loading || !myLat || !myLng) {
    return (
      <View style={[s.container, s.centre]}>
        <ActivityIndicator size="large" color="#00FFD4" />
        <Text style={s.loadingText}>Getting your location…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: myLat, longitude: myLng,
          latitudeDelta: 0.05, longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsCompass
        rotateEnabled
      >
        {/* TomTom map tiles */}
        <UrlTile
          urlTemplate={`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}&language=en-GB`}
          maximumZ={19}
          flipY={false}
          zIndex={-1}
        />

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#00FFD4"
            strokeWidth={4}
            lineDashPattern={[]}
          />
        )}

        {/* Destination marker */}
        <Marker
          coordinate={{ latitude: destLat, longitude: destLng }}
          title={destLabel}
          description={jobRef}
          pinColor="#EF4444"
        />
      </MapView>

      {/* Back button */}
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Map type toggle */}
      <TouchableOpacity
        style={s.mapTypeBtn}
        onPress={() => setMapType((t) => t === "standard" ? "satellite" : "standard")}
      >
        <Ionicons name="layers-outline" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Centre button */}
      <TouchableOpacity style={s.centreBtn} onPress={centreOnMe}>
        <Ionicons name="navigate" size={20} color="#00FFD4" />
      </TouchableOpacity>

      {/* Bottom info panel */}
      <View style={s.infoPanel}>
        <View style={s.infoPanelTop}>
          <View>
            <Text style={s.destLabel} numberOfLines={1}>{destLabel}</Text>
            <Text style={s.jobRef}>{jobRef}</Text>
          </View>
          {eta && (
            <View style={s.etaBlock}>
              <Text style={s.etaTime}>{eta}</Text>
              <Text style={s.etaLabel}>ETA</Text>
            </View>
          )}
        </View>

        {distanceKm && (
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Ionicons name="navigate-outline" size={14} color="#666" />
              <Text style={s.statText}>{distanceKm} km remaining</Text>
            </View>
            <View style={s.hgvBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#00FFD4" />
              <Text style={s.hgvText}>HGV Route</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  centre: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#666", marginTop: 12 },
  backBtn: {
    position: "absolute", top: 56, left: 16,
    backgroundColor: "#0a0a0fcc", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#1a1a24",
  },
  mapTypeBtn: {
    position: "absolute", top: 56, right: 16,
    backgroundColor: "#0a0a0fcc", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#1a1a24",
  },
  centreBtn: {
    position: "absolute", bottom: 220, right: 16,
    backgroundColor: "#0a0a0fcc", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#00FFD440",
  },
  infoPanel: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#0f0f16f0",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1, borderColor: "#1a1a24",
  },
  infoPanelTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  destLabel: { fontSize: 16, fontWeight: "700", color: "#fff", maxWidth: 220 },
  jobRef: { fontSize: 12, color: "#00FFD4", fontFamily: "monospace", marginTop: 2 },
  etaBlock: { alignItems: "center" },
  etaTime: { fontSize: 26, fontWeight: "700", color: "#00FFD4", fontFamily: "monospace" },
  etaLabel: { fontSize: 10, color: "#666", letterSpacing: 1 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 13, color: "#666" },
  hgvBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#00FFD415", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: "#00FFD430",
  },
  hgvText: { fontSize: 11, color: "#00FFD4", fontWeight: "600" },
});
