/**
 * TomTom Map Component
 * Replaces the Google Maps MapView with TomTom Maps SDK
 * Features: HGV routing, satellite view, low bridge/CAZ layers, driver markers
 */

import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// TomTom types
declare global {
  interface Window {
    tt: any;
  }
}

const TOMTOM_API_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
const TOMTOM_SDK_VERSION = "6.25.0";
const TOMTOM_BASE = `https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/${TOMTOM_SDK_VERSION}`;

let sdkLoaded = false;
let sdkLoading: Promise<void> | null = null;

/**
 * Load TomTom SDK scripts and CSS
 */
function loadTomTomSDK(): Promise<void> {
  if (sdkLoaded) return Promise.resolve();
  if (sdkLoading) return sdkLoading;

  sdkLoading = new Promise((resolve, reject) => {
    // Load CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${TOMTOM_BASE}/maps/maps.css`;
    document.head.appendChild(css);

    // Load Maps JS
    const mapsScript = document.createElement("script");
    mapsScript.src = `${TOMTOM_BASE}/maps/maps-web.min.js`;
    mapsScript.async = true;
    mapsScript.onload = () => {
      // Load Services JS (routing, search, etc.)
      const servicesScript = document.createElement("script");
      servicesScript.src = `${TOMTOM_BASE}/services/services-web.min.js`;
      servicesScript.async = true;
      servicesScript.onload = () => {
        sdkLoaded = true;
        resolve();
      };
      servicesScript.onerror = () => reject(new Error("Failed to load TomTom services"));
      document.head.appendChild(servicesScript);
    };
    mapsScript.onerror = () => reject(new Error("Failed to load TomTom maps"));
    document.head.appendChild(mapsScript);
  });

  return sdkLoading;
}

// ============================================
// Types
// ============================================

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  type?: "vehicle" | "pickup" | "delivery" | "waypoint" | "alert" | "bridge" | "caz";
  status?: string;
  popup?: string;
  heading?: number;
}

export interface MapRoute {
  points: Array<{ lat: number; lng: number }>;
  color?: string;
  width?: number;
}

interface TomTomMapProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  markers?: MapMarker[];
  routes?: MapRoute[];
  showTraffic?: boolean;
  mapStyle?: "main" | "night" | "satellite";
  onMapReady?: (map: any) => void;
  onMarkerClick?: (markerId: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

// Marker colors by type
const MARKER_COLORS: Record<string, string> = {
  vehicle: "#00FFD4",   // Cyan - active vehicles
  pickup: "#22C55E",    // Green - pickup points
  delivery: "#3B82F6",  // Blue - delivery points
  waypoint: "#A855F7",  // Purple - waypoints
  alert: "#EF4444",     // Red - alerts
  bridge: "#F59E0B",    // Amber - low bridges
  caz: "#F97316",       // Orange - CAZ zones
};

/**
 * Create a custom HTML marker element
 */
function createMarkerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement("div");
  const color = MARKER_COLORS[marker.type || "waypoint"] || "#00FFD4";

  if (marker.type === "vehicle") {
    el.innerHTML = `
      <div style="
        width: 36px; height: 36px;
        background: ${color}20;
        border: 2px solid ${color};
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 12px ${color}40;
        cursor: pointer;
        transition: transform 0.2s;
        ${marker.heading ? `transform: rotate(${marker.heading}deg);` : ""}
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
          <path d="M5 17h14M5 17a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2M5 17l-1 3M19 17l1 3M8 21h8"/>
          <circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/>
        </svg>
      </div>
      ${marker.label ? `<div style="
        position: absolute; top: -24px; left: 50%; transform: translateX(-50%);
        background: #0A0A0A; border: 1px solid ${color}40;
        padding: 2px 8px; border-radius: 4px;
        font-size: 10px; color: ${color};
        font-family: 'JetBrains Mono', monospace;
        white-space: nowrap;
      ">${marker.label}</div>` : ""}
    `;
  } else if (marker.type === "bridge" || marker.type === "caz") {
    el.innerHTML = `
      <div style="
        width: 28px; height: 28px;
        background: ${color}30;
        border: 2px solid ${color};
        border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
      </div>
    `;
  } else {
    // Numbered waypoint marker
    const number = marker.label || "•";
    el.innerHTML = `
      <div style="
        width: 30px; height: 30px;
        background: ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px ${color}60;
        cursor: pointer;
      ">
        <span style="
          transform: rotate(45deg);
          font-size: 12px; font-weight: 700;
          color: #000;
          font-family: 'JetBrains Mono', monospace;
        ">${number}</span>
      </div>
    `;
  }

  el.style.cursor = "pointer";
  return el;
}

/**
 * TomTom Map Component
 */
export function TomTomMap({
  className,
  initialCenter = { lat: 52.2405, lng: -0.9027 }, // Northampton, UK
  initialZoom = 7,
  markers = [],
  routes = [],
  showTraffic = false,
  mapStyle = "night",
  onMapReady,
  onMarkerClick,
  onMapClick,
}: TomTomMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routeLayersRef = useRef<string[]>([]);

  // Initialize map
  useEffect(() => {
    let destroyed = false;

    const init = async () => {
      await loadTomTomSDK();
      if (destroyed || !containerRef.current || !window.tt) return;

      const tt = window.tt;

      // Determine style based on mapStyle
      let style = `https://api.tomtom.com/style/2/custom/style/dG9tdG9tQEBAeTNNNW0zSDVXdjBNWVZCVDs0OWJmMzMwZi00YWI2LTRjZjUtOWI4NC1kOTYxMjNjMjg4NTk=.json?key=${TOMTOM_API_KEY}`;
      if (mapStyle === "satellite") {
        style = `https://api.tomtom.com/map/1/style/20.3.2-4/2/basic_night-satellite.json?key=${TOMTOM_API_KEY}`;
      } else if (mapStyle === "main") {
        style = undefined as any; // default TomTom style
      }

      const mapOptions: any = {
        key: TOMTOM_API_KEY,
        container: containerRef.current,
        center: [initialCenter.lng, initialCenter.lat],
        zoom: initialZoom,
        language: "en-GB",
      };

      if (style && mapStyle === "night") {
        // Use dark style for Terminal Noir aesthetic
        mapOptions.style = `https://api.tomtom.com/style/2/custom/style/dG9tdG9tQEBAeTNNNW0zSDVXdjBNWVZCVDs0OWJmMzMwZi00YWI2LTRjZjUtOWI4NC1kOTYxMjNjMjg4NTk=.json?key=${TOMTOM_API_KEY}`;
      }

      try {
        mapRef.current = tt.map(mapOptions);

        // Add navigation controls
        mapRef.current.addControl(new tt.NavigationControl(), "top-right");
        mapRef.current.addControl(new tt.FullscreenControl(), "top-right");

        // Traffic layer
        if (showTraffic) {
          mapRef.current.addTier(new tt.TrafficFlowTilesTier());
        }

        // Click handler
        if (onMapClick) {
          mapRef.current.on("click", (e: any) => {
            onMapClick(e.lngLat.lat, e.lngLat.lng);
          });
        }

        if (onMapReady) {
          mapRef.current.on("load", () => {
            onMapReady(mapRef.current);
          });
        }
      } catch (err) {
        console.error("[TomTomMap] Init error:", err);
        // Fallback: basic map without custom style
        mapRef.current = tt.map({
          key: TOMTOM_API_KEY,
          container: containerRef.current,
          center: [initialCenter.lng, initialCenter.lat],
          zoom: initialZoom,
          language: "en-GB",
        });
        mapRef.current.addControl(new tt.NavigationControl(), "top-right");
        if (onMapReady) {
          mapRef.current.on("load", () => onMapReady(mapRef.current));
        }
      }
    };

    init();

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !window.tt) return;

    const tt = window.tt;
    const currentMarkerIds = new Set(markers.map(m => m.id));

    // Remove old markers
    markersRef.current.forEach((marker, id) => {
      if (!currentMarkerIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/update markers
    markers.forEach((m) => {
      const existing = markersRef.current.get(m.id);
      if (existing) {
        // Update position
        existing.setLngLat([m.lng, m.lat]);
      } else {
        // Create new marker
        const el = createMarkerElement(m);
        const marker = new tt.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .addTo(mapRef.current);

        // Add popup if provided
        if (m.popup) {
          const popup = new tt.Popup({ offset: 30, className: "movido-popup" })
            .setHTML(`
              <div style="
                background: #0A0A0A; color: #E5E5E5;
                padding: 12px; border-radius: 8px;
                font-family: 'Inter', sans-serif; font-size: 13px;
                border: 1px solid #333; max-width: 240px;
              ">${m.popup}</div>
            `);
          marker.setPopup(popup);
        }

        // Click handler
        if (onMarkerClick) {
          el.addEventListener("click", () => onMarkerClick(m.id));
        }

        markersRef.current.set(m.id, marker);
      }
    });
  }, [markers, onMarkerClick]);

  // Update routes
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old route layers
    routeLayersRef.current.forEach((layerId) => {
      try {
        if (mapRef.current.getLayer(layerId)) {
          mapRef.current.removeLayer(layerId);
        }
        if (mapRef.current.getSource(layerId)) {
          mapRef.current.removeSource(layerId);
        }
      } catch { /* ignore */ }
    });
    routeLayersRef.current = [];

    // Add new routes
    routes.forEach((route, idx) => {
      const sourceId = `route-source-${idx}`;
      const layerId = `route-layer-${idx}`;

      const geojson = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: route.points.map(p => [p.lng, p.lat]),
        },
      };

      try {
        mapRef.current.addSource(sourceId, {
          type: "geojson",
          data: geojson,
        });

        mapRef.current.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": route.color || "#00FFD4",
            "line-width": route.width || 4,
            "line-opacity": 0.8,
          },
        });

        routeLayersRef.current.push(sourceId, layerId);
      } catch (err) {
        console.error("[TomTomMap] Route layer error:", err);
      }
    });
  }, [routes]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full h-[500px] rounded-lg overflow-hidden", className)}
    />
  );
}

// ============================================
// TomTom Services (Geocoding, Routing)
// ============================================

/**
 * Geocode an address using TomTom Search API
 */
export async function tomtomGeocode(query: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
  postcode?: string;
} | null> {
  if (!TOMTOM_API_KEY) return null;

  try {
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${TOMTOM_API_KEY}&countrySet=GB&limit=1`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        lat: result.position.lat,
        lng: result.position.lon,
        formattedAddress: result.address.freeformAddress,
        postcode: result.address.postalCode,
      };
    }
    return null;
  } catch (err) {
    console.error("[TomTom] Geocode error:", err);
    return null;
  }
}

/**
 * Calculate route using TomTom Routing API with HGV support
 */
export async function tomtomCalculateRoute(
  waypoints: Array<{ lat: number; lng: number }>,
  options?: {
    vehicleHeight?: number; // metres
    vehicleWeight?: number; // kg
    vehicleWidth?: number;  // metres
    travelMode?: "car" | "truck";
    traffic?: boolean;
    avoid?: string[];
  }
): Promise<{
  distance: number; // metres
  duration: number; // seconds
  points: Array<{ lat: number; lng: number }>;
  legs: Array<{
    distance: number;
    duration: number;
    summary: string;
  }>;
} | null> {
  if (!TOMTOM_API_KEY || waypoints.length < 2) return null;

  try {
    const locations = waypoints.map(w => `${w.lat},${w.lng}`).join(":");
    let url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${TOMTOM_API_KEY}&routeType=fastest&traffic=${options?.traffic !== false}`;

    // HGV-specific parameters
    if (options?.travelMode === "truck" || options?.vehicleHeight || options?.vehicleWeight) {
      url += `&travelMode=truck`;
      if (options?.vehicleHeight) url += `&vehicleHeightInMeters=${options.vehicleHeight}`;
      if (options?.vehicleWeight) url += `&vehicleWeightInKg=${options.vehicleWeight}`;
      if (options?.vehicleWidth) url += `&vehicleWidthInMeters=${options.vehicleWidth}`;
    }

    if (options?.avoid?.length) {
      url += `&avoid=${options.avoid.join(",")}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const summary = route.summary;

      // Extract all route points
      const points: Array<{ lat: number; lng: number }> = [];
      route.legs.forEach((leg: any) => {
        leg.points.forEach((p: any) => {
          points.push({ lat: p.latitude, lng: p.longitude });
        });
      });

      return {
        distance: summary.lengthInMeters,
        duration: summary.travelTimeInSeconds,
        points,
        legs: route.legs.map((leg: any) => ({
          distance: leg.summary.lengthInMeters,
          duration: leg.summary.travelTimeInSeconds,
          summary: `${(leg.summary.lengthInMeters / 1609.34).toFixed(1)} mi`,
        })),
      };
    }
    return null;
  } catch (err) {
    console.error("[TomTom] Route error:", err);
    return null;
  }
}

/**
 * TomTom Distance Matrix (batch routing)
 */
export async function tomtomDistanceMatrix(
  origins: Array<{ lat: number; lng: number }>,
  destinations: Array<{ lat: number; lng: number }>,
  options?: { travelMode?: "car" | "truck"; vehicleHeight?: number; vehicleWeight?: number }
): Promise<{
  distances: number[][];
  durations: number[][];
} | null> {
  if (!TOMTOM_API_KEY) return null;

  try {
    const body = {
      origins: origins.map(o => ({ point: { latitude: o.lat, longitude: o.lng } })),
      destinations: destinations.map(d => ({ point: { latitude: d.lat, longitude: d.lng } })),
    };

    let url = `https://api.tomtom.com/routing/1/matrix/sync/json?key=${TOMTOM_API_KEY}&routeType=fastest&traffic=true`;

    if (options?.travelMode === "truck") {
      url += `&travelMode=truck`;
      if (options.vehicleHeight) url += `&vehicleHeightInMeters=${options.vehicleHeight}`;
      if (options.vehicleWeight) url += `&vehicleWeightInKg=${options.vehicleWeight}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.matrix) {
      const distances: number[][] = [];
      const durations: number[][] = [];

      data.matrix.forEach((row: any) => {
        const distRow: number[] = [];
        const durRow: number[] = [];
        row.forEach((cell: any) => {
          if (cell.response?.routeSummary) {
            distRow.push(cell.response.routeSummary.lengthInMeters);
            durRow.push(cell.response.routeSummary.travelTimeInSeconds);
          } else {
            distRow.push(Infinity);
            durRow.push(Infinity);
          }
        });
        distances.push(distRow);
        durations.push(durRow);
      });

      return { distances, durations };
    }
    return null;
  } catch (err) {
    console.error("[TomTom] Matrix error:", err);
    return null;
  }
}

/**
 * Search for address/postcode with TomTom Fuzzy Search
 */
export async function tomtomSearch(query: string, options?: {
  limit?: number;
  countrySet?: string;
  lat?: number;
  lng?: number;
}): Promise<Array<{
  id: string;
  address: string;
  postcode?: string;
  lat: number;
  lng: number;
  type: string;
}>> {
  if (!TOMTOM_API_KEY) return [];

  try {
    let url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${TOMTOM_API_KEY}&limit=${options?.limit || 5}&countrySet=${options?.countrySet || "GB"}`;

    if (options?.lat && options?.lng) {
      url += `&lat=${options.lat}&lon=${options.lng}&radius=50000`;
    }

    const res = await fetch(url);
    const data = await res.json();

    return (data.results || []).map((r: any) => ({
      id: r.id,
      address: r.address?.freeformAddress || r.poi?.name || "",
      postcode: r.address?.postalCode,
      lat: r.position.lat,
      lng: r.position.lon,
      type: r.type,
    }));
  } catch {
    return [];
  }
}
