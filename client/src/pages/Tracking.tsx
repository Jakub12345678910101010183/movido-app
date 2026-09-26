/**
 * Live ETA Tracking Page — Public shareable link
 * URL: /track/:trackingToken
 * No auth required — customers get a secure link
 *
 * Shows:
 * - Map with driver location + delivery point
 * - Live ETA countdown
 * - Job status timeline
 * - Delivery details (address, driver name, vehicle)
 * - Auto-refreshes every 15 seconds
 */

import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import {
  MapPin, Truck, Clock, CheckCircle, Package, Navigation,
  Loader2, AlertCircle, RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TomTomMap, type MapMarker, type MapRoute } from "@/components/TomTomMap";
import { escapeHtml } from "@/lib/html";

interface TrackingData {
  job: {
    reference: string;
    customer: string;
    status: string;
    delivery_address: string | null;
    delivery_lat: number | null;
    delivery_lng: number | null;
    eta: string | null;
    pod_status: string;
  };
  // No phone number: the public payload deliberately omits the driver's
  // personal contact details (see public.get_tracking).
  driver: {
    name: string;
    location_lat: number | null;
    location_lng: number | null;
    heading: number | null;
  } | null;
  vehicle: {
    vehicle_id: string;
    make: string | null;
    model: string | null;
    registration: string | null;
  } | null;
}

const statusSteps = [
  { key: "pending", label: "Order Received", icon: Package },
  { key: "assigned", label: "Driver Assigned", icon: Truck },
  { key: "in_progress", label: "On the Way", icon: Navigation },
  { key: "completed", label: "Delivered", icon: CheckCircle },
];

export default function TrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<TrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch tracking data
  const fetchTracking = async () => {
    if (!token) { setError("No tracking token"); setIsLoading(false); return; }

    try {
      // The tables themselves are closed to anonymous callers (D2/D3). This RPC
      // is the only public channel, and it returns just the columns below —
      // never a whole job, driver or vehicle row. There is deliberately no
      // fallback to a direct SELECT: if the RPC fails, tracking fails.
      const { data: rows, error: rpcErr } = await supabase.rpc("get_tracking", {
        p_token: token,
      });

      const row = rows?.[0];
      if (rpcErr || !row) {
        setError("Tracking link not found or expired");
        setIsLoading(false);
        return;
      }

      setData({
        job: {
          reference: row.reference,
          customer: row.customer,
          status: row.status ?? "pending",
          delivery_address: row.delivery_address,
          delivery_lat: row.delivery_lat,
          delivery_lng: row.delivery_lng,
          eta: row.eta,
          pod_status: row.pod_status ?? "pending",
        },
        driver: row.driver_name
          ? {
              name: row.driver_name,
              location_lat: row.driver_location_lat,
              location_lng: row.driver_location_lng,
              heading: row.driver_heading,
            }
          : null,
        vehicle: row.vehicle_id
          ? {
              vehicle_id: row.vehicle_id,
              make: row.vehicle_make,
              model: row.vehicle_model,
              registration: row.vehicle_registration,
            }
          : null,
      });
      setLastUpdate(new Date());
      setError(null);
    } catch {
      // Never surface a raw error: it can carry table and column names, and the
      // token must not appear in the UI.
      setError("Tracking is unavailable right now. Please try again shortly.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTracking(); }, [token]);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(fetchTracking, 15000);
    return () => clearInterval(interval);
  }, [token]);

  // Map markers
  const mapMarkers = useMemo<MapMarker[]>(() => {
    if (!data) return [];
    const markers: MapMarker[] = [];

    // Delivery point
    if (data.job.delivery_lat && data.job.delivery_lng) {
      markers.push({
        id: "delivery", lat: data.job.delivery_lat, lng: data.job.delivery_lng,
        type: "delivery", popup: `<strong>Delivery</strong><br/>${escapeHtml(data.job.delivery_address)}`,
      });
    }

    // Driver location
    if (data.driver?.location_lat && data.driver?.location_lng) {
      markers.push({
        id: "driver", lat: data.driver.location_lat, lng: data.driver.location_lng,
        type: "vehicle", heading: data.driver.heading || 0,
        popup: `<strong>${escapeHtml(data.driver.name)}</strong><br/>${escapeHtml(data.vehicle?.registration)}`,
      });
    }

    return markers;
  }, [data]);

  // ETA countdown
  const etaDisplay = useMemo(() => {
    if (!data?.job.eta) return null;
    const eta = new Date(data.job.eta);
    const now = new Date();
    const diffMs = eta.getTime() - now.getTime();
    // A long-passed ETA is stale data, not an imminent arrival.
    if (diffMs < -30 * 60000) return "Awaiting update";
    if (diffMs <= 0) return "Arriving now";
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins} min`;
  }, [data]);

  // Current step index
  const currentStep = statusSteps.findIndex((s) => s.key === data?.job.status);

  // ============================================
  // Loading / Error states
  // ============================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-3" /><p className="text-gray-400">Loading tracking info...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center max-w-md"><AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" /><h2 className="text-xl font-bold text-white mb-2">Tracking Unavailable</h2><p className="text-gray-400">{error}</p></div>
      </div>
    );
  }

  if (!data) return null;

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="bg-[#111118] border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Truck className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="font-bold text-sm">MOVIDO Tracking</h1>
              <p className="text-xs text-gray-500">{data.job.reference}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <RefreshCw className="w-3 h-3" />
            Updated {lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* ETA Banner */}
        {data.job.status !== "completed" && etaDisplay && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-6 text-center">
            <p className="text-xs text-cyan-400 uppercase tracking-wider mb-1">Estimated Arrival</p>
            <p className="text-4xl font-mono font-bold text-cyan-400">{etaDisplay}</p>
            {data.job.eta && (
              <p className="text-sm text-gray-400 mt-1">
                ETA: {new Date(data.job.eta).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        )}

        {data.job.status === "completed" && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-xl font-bold text-green-400">Delivered</p>
            <p className="text-sm text-gray-400 mt-1">Your delivery has been completed</p>
          </div>
        )}

        {/* Map */}
        {mapMarkers.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-gray-800 h-64">
            <TomTomMap
              className="w-full h-full"
              markers={mapMarkers}
              mapStyle="night"
              initialZoom={12}
              initialCenter={
                data.driver?.location_lat
                  ? { lat: data.driver.location_lat, lng: data.driver.location_lng! }
                  : data.job.delivery_lat
                  ? { lat: data.job.delivery_lat, lng: data.job.delivery_lng! }
                  : { lat: 52.24, lng: -0.90 }
              }
            />
          </div>
        )}

        {/* Status Timeline */}
        <div className="bg-[#111118] rounded-xl border border-gray-800 p-6">
          <h3 className="text-sm font-semibold mb-4">Delivery Status</h3>
          <div className="space-y-4">
            {statusSteps.map((step, idx) => {
              const isCompleted = idx <= currentStep;
              const isCurrent = idx === currentStep;
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    isCompleted ? "bg-cyan-500/20 border-cyan-500 text-cyan-400" :
                    "bg-gray-800 border-gray-700 text-gray-600"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isCompleted ? "text-white" : "text-gray-600"}`}>{step.label}</p>
                  </div>
                  {isCurrent && data.job.status !== "completed" && (
                    <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">Current</span>
                  )}
                  {isCompleted && (idx < currentStep || data.job.status === "completed") && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Delivery info */}
          <div className="bg-[#111118] rounded-xl border border-gray-800 p-4">
            <h4 className="text-xs text-gray-500 uppercase mb-3">Delivery Details</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-cyan-400 mt-0.5" />
                <p className="text-sm">{data.job.delivery_address || "Address not available"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <p className="text-sm text-gray-400">Ref: {data.job.reference}</p>
              </div>
            </div>
          </div>

          {/* Driver info */}
          {data.driver && (
            <div className="bg-[#111118] rounded-xl border border-gray-800 p-4">
              <h4 className="text-xs text-gray-500 uppercase mb-3">Your Driver</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Truck className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{data.driver.name}</p>
                    {data.vehicle && (
                      <p className="text-xs text-gray-500">{[[data.vehicle.make, data.vehicle.model].filter(Boolean).join(" "), data.vehicle.registration].filter(Boolean).join(" • ")}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-600">Live tracking powered by MOViDO</p>
        </div>
      </div>
    </div>
  );
}
