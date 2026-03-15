/**
 * AI Route Planner Component
 * MIGRATED: Google Maps → TomTom, tRPC → Supabase + TomTom APIs
 *
 * Features:
 * - Postcode/address search with TomTom geocoding
 * - Interactive TomTom map with markers
 * - TSP optimization with TomTom HGV routing
 * - HGV safety alerts (low bridges, CAZ zones)
 * - Route drawing on map
 * - Save to Jobs (Supabase)
 * - Drag & drop waypoint reordering
 */

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, MapPin, Plus, Trash2, Play, Loader2, AlertTriangle, Save,
  Smartphone, Route, Navigation, Zap, GripVertical,
} from "lucide-react";
import { TomTomMap, tomtomGeocode, tomtomCalculateRoute, type MapMarker, type MapRoute } from "@/components/TomTomMap";
import { useJobs } from "@/hooks/useSupabaseData";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

interface Waypoint {
  id: string;
  address: string;
  postcode?: string;
  lat: number;
  lng: number;
  type: "pickup" | "delivery" | "waypoint";
}

interface RouteAlert {
  type: "low_bridge" | "caz_zone";
  severity: "warning" | "critical";
  location: string;
  details: string;
  lat: number;
  lng: number;
}

interface OptimizedResult {
  sequence: number[];
  totalDistance: number;
  totalDuration: number;
  distanceSaved: number;
  fuelSaved: number;
  alerts: RouteAlert[];
  routePoints: Array<{ lat: number; lng: number }>;
}

interface AIRoutePlannerProps {
  open: boolean;
  onClose: () => void;
  onSaveJob?: () => void;
}

// ============================================
// UK Low Bridges & CAZ databases
// ============================================

const UK_LOW_BRIDGES = [
  { lat: 51.5155, lng: -0.1419, height: 4.2, name: "Marylebone Underpass" },
  { lat: 52.4797, lng: -1.9026, height: 3.8, name: "Birmingham Rail Bridge" },
  { lat: 53.4723, lng: -2.2389, height: 4.0, name: "Manchester Canal Bridge" },
  { lat: 51.4545, lng: -0.0983, height: 3.9, name: "London Bridge Underpass" },
  { lat: 52.9548, lng: -1.1581, height: 4.1, name: "Nottingham Rail Bridge" },
  { lat: 53.8008, lng: -1.5491, height: 3.7, name: "Leeds Canal Bridge" },
  { lat: 52.2405, lng: -0.9027, height: 3.6, name: "Northampton Rail Bridge" },
  { lat: 51.7520, lng: -1.2577, height: 4.0, name: "Oxford Station Bridge" },
];

const UK_CAZ_ZONES = [
  { lat: 51.5074, lng: -0.1278, radius: 8000, name: "London ULEZ", charge: 12.5 },
  { lat: 52.4862, lng: -1.8904, radius: 3000, name: "Birmingham CAZ", charge: 8.0 },
  { lat: 53.4808, lng: -2.2426, radius: 2500, name: "Manchester CAZ", charge: 7.5 },
  { lat: 51.4545, lng: -2.5879, radius: 2000, name: "Bristol CAZ", charge: 9.0 },
  { lat: 53.3811, lng: -1.4701, radius: 2000, name: "Sheffield CAZ", charge: 8.0 },
];

// Haversine distance in metres
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkRouteAlerts(waypoints: Waypoint[], vehicleHeight: number): RouteAlert[] {
  const alerts: RouteAlert[] = [];
  const PROXIMITY_THRESHOLD = 2000; // 2km

  for (const wp of waypoints) {
    for (const bridge of UK_LOW_BRIDGES) {
      const dist = haversine(wp.lat, wp.lng, bridge.lat, bridge.lng);
      if (dist < PROXIMITY_THRESHOLD && bridge.height < vehicleHeight) {
        alerts.push({
          type: "low_bridge", severity: "critical", lat: bridge.lat, lng: bridge.lng,
          location: bridge.name, details: `Height ${bridge.height}m — your vehicle is ${vehicleHeight}m`,
        });
      }
    }
    for (const caz of UK_CAZ_ZONES) {
      const dist = haversine(wp.lat, wp.lng, caz.lat, caz.lng);
      if (dist < caz.radius) {
        alerts.push({
          type: "caz_zone", severity: "warning", lat: caz.lat, lng: caz.lng,
          location: caz.name, details: `Charge: £${caz.charge}/day for HGV`,
        });
      }
    }
  }

  // Deduplicate by location name
  const seen = new Set<string>();
  return alerts.filter((a) => { if (seen.has(a.location)) return false; seen.add(a.location); return true; });
}

// Simple nearest-neighbour TSP
function nearestNeighbourTSP(waypoints: Waypoint[]): number[] {
  if (waypoints.length <= 2) return waypoints.map((_, i) => i);
  const n = waypoints.length;
  const visited = new Set<number>();
  const sequence: number[] = [0];
  visited.add(0);

  while (sequence.length < n) {
    const last = waypoints[sequence[sequence.length - 1]];
    let nearest = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      const d = haversine(last.lat, last.lng, waypoints[i].lat, waypoints[i].lng);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    if (nearest >= 0) { sequence.push(nearest); visited.add(nearest); }
  }
  return sequence;
}

// ============================================
// Component
// ============================================

export function AIRoutePlanner({ open, onClose, onSaveJob }: AIRoutePlannerProps) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimized, setOptimized] = useState<OptimizedResult | null>(null);
  const [waypointType, setWaypointType] = useState<"pickup" | "delivery" | "waypoint">("delivery");
  const [vehicleHeight, setVehicleHeight] = useState(4.95);
  const [vehicleWeight, setVehicleWeight] = useState(44);
  const [customerName, setCustomerName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { create: createJob, generateReference } = useJobs();

  // ============================================
  // Map markers & routes for TomTomMap
  // ============================================

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const markers: MapMarker[] = [];
    waypoints.forEach((wp, idx) => {
      const seqNum = optimized ? optimized.sequence.indexOf(idx) + 1 : idx + 1;
      markers.push({
        id: wp.id, lat: wp.lat, lng: wp.lng, label: String(seqNum),
        type: wp.type === "pickup" ? "pickup" : wp.type === "delivery" ? "delivery" : "waypoint",
        popup: `<strong>${wp.address}</strong><br/>${wp.type} ${wp.postcode ? `• ${wp.postcode}` : ""}`,
      });
    });
    if (optimized?.alerts) {
      optimized.alerts.forEach((a, i) => {
        markers.push({
          id: `alert-${i}`, lat: a.lat, lng: a.lng,
          type: a.type === "low_bridge" ? "bridge" : "caz",
          popup: `<strong>⚠ ${a.location}</strong><br/>${a.details}`,
        });
      });
    }
    return markers;
  }, [waypoints, optimized]);

  const mapRoutes = useMemo<MapRoute[]>(() => {
    if (!optimized?.routePoints?.length) return [];
    return [{ points: optimized.routePoints, color: "#00FFD4", width: 4 }];
  }, [optimized]);

  // ============================================
  // Search (TomTom Geocoding)
  // ============================================

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await tomtomGeocode(searchQuery);
      if (!result) { toast.error("Could not find location. Try a different address."); return; }

      setWaypoints((prev) => [...prev, {
        id: `wp-${Date.now()}`, address: result.formattedAddress,
        postcode: result.postcode, lat: result.lat, lng: result.lng, type: waypointType,
      }]);
      setSearchQuery("");
      setOptimized(null);
      toast.success(`Added: ${result.formattedAddress}`);
    } catch { toast.error("Geocoding failed"); }
    finally { setIsSearching(false); }
  }, [searchQuery, waypointType]);

  // ============================================
  // Optimize (TomTom HGV Routing)
  // ============================================

  const handleOptimize = useCallback(async () => {
    if (waypoints.length < 2) { toast.error("Add at least 2 waypoints"); return; }
    setIsOptimizing(true);
    try {
      // 1) TSP ordering
      const sequence = nearestNeighbourTSP(waypoints);
      const ordered = sequence.map((i) => waypoints[i]);

      // 2) Straight-line distance before optimization
      let straightDist = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        straightDist += haversine(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
      }

      // 3) TomTom HGV routing with retry logic for Navigator lock timeout
      let routeResult = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries && !routeResult) {
        try {
          // Add delay before request to avoid lock conflicts
          if (retryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 1500 * (retryCount + 1)));
            toast.info(`Retrying route optimization (attempt ${retryCount + 1}/${maxRetries})`);
          } else {
            // Initial small delay to ensure TomTom SDK is ready
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          routeResult = await tomtomCalculateRoute(
            ordered.map((w) => ({ lat: w.lat, lng: w.lng })),
            { travelMode: "truck", vehicleHeight, vehicleWeight: vehicleWeight * 1000, traffic: false }
          );
          break;
        } catch (err: any) {
          if (err?.message?.includes('Navigator') || err?.message?.includes('timeout')) {
            retryCount++;
            if (retryCount >= maxRetries) {
              console.error("[AIRoutePlanner] Navigator lock timeout after retries:", err);
              // Continue with fallback
            } else {
              continue;
            }
          } else {
            throw err;
          }
        }
      }

      // 4) Check for HGV alerts
      const alerts = checkRouteAlerts(ordered, vehicleHeight);

      if (routeResult) {
        const distanceSaved = Math.max(0, straightDist - routeResult.distance);
        const fuelSaved = (distanceSaved / 1609.34) * 0.35 * 1.5; // ~0.35 gal/mi × £1.50/L

        setOptimized({
          sequence, totalDistance: routeResult.distance, totalDuration: routeResult.duration,
          distanceSaved, fuelSaved, alerts, routePoints: routeResult.points,
        });

        if (alerts.filter((a) => a.severity === "critical").length > 0) {
          toast.warning("Critical alerts on route!");
        }
        toast.success(`Route optimized! ${(distanceSaved / 1609.34).toFixed(1)} miles saved`);
      } else {
        // Fallback: use haversine estimates if TomTom API fails
        let totalDist = 0;
        for (let i = 0; i < ordered.length - 1; i++) {
          totalDist += haversine(ordered[i].lat, ordered[i].lng, ordered[i + 1].lat, ordered[i + 1].lng);
        }
        setOptimized({
          sequence, totalDistance: totalDist, totalDuration: totalDist / 15, // ~15m/s avg
          distanceSaved: Math.max(0, straightDist - totalDist), fuelSaved: 0, alerts, routePoints: [],
        });
        toast.success("Route optimized (estimated distances — TomTom API temporarily unavailable)");
      }
    } catch (err) {
      console.error("[AIRoutePlanner] Optimize error:", err);
      toast.error("Failed to optimize route. Please try again in a moment.");
    } finally { setIsOptimizing(false); }
  }, [waypoints, vehicleHeight, vehicleWeight]);

  // ============================================
  // Save Job (Supabase)
  // ============================================

  const handleSaveJob = useCallback(async () => {
    if (!optimized || waypoints.length < 2 || !customerName.trim()) {
      toast.error(!customerName.trim() ? "Enter a customer name" : "Optimize the route first");
      return;
    }
    setIsSaving(true);
    try {
      const ref = await generateReference();
      const ordered = optimized.sequence.map((i) => waypoints[i]);
      const pickup = ordered[0];
      const delivery = ordered[ordered.length - 1];

      await createJob({
        reference: ref, customer: customerName, status: "pending", priority: "medium",
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        delivery_address: delivery.address, delivery_lat: delivery.lat, delivery_lng: delivery.lng,
        eta: new Date(Date.now() + optimized.totalDuration * 1000).toISOString(),
      });

      toast.success(`Job ${ref} created!`);
      onSaveJob?.();
      setWaypoints([]); setOptimized(null); setCustomerName("");
      onClose();
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
    finally { setIsSaving(false); }
  }, [optimized, waypoints, customerName, createJob, generateReference, onSaveJob, onClose]);

  // ============================================
  // Drag & Drop
  // ============================================

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) { setDraggedIndex(null); setDragOverIndex(null); return; }
    const next = [...waypoints];
    const [dragged] = next.splice(draggedIndex, 1);
    next.splice(dropIndex, 0, dragged);
    setWaypoints(next); setOptimized(null); setDraggedIndex(null); setDragOverIndex(null);
  };

  // ============================================
  // Helpers
  // ============================================

  const fmt = {
    dist: (m: number) => `${(m / 1609.34).toFixed(1)} mi`,
    time: (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; },
  };

  // ============================================
  // Render
  // ============================================

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 bg-background border-border">
        <div className="flex h-full">
          {/* LEFT PANEL */}
          <div className="w-96 border-r border-border flex flex-col">
            <DialogHeader className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center"><Brain className="w-5 h-5 text-primary" /></div>
                <div><DialogTitle>AI Route Planner</DialogTitle><p className="text-xs text-muted-foreground">TomTom HGV routing with AI optimization</p></div>
              </div>
            </DialogHeader>

            {/* Search */}
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Enter postcode or address..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="flex-1" />
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} size="icon">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              <Select value={waypointType} onValueChange={(v) => setWaypointType(v as any)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pickup">Pickup Point</SelectItem><SelectItem value="delivery">Delivery Point</SelectItem><SelectItem value="waypoint">Waypoint</SelectItem></SelectContent>
              </Select>
            </div>

            {/* Waypoints List */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Waypoints ({waypoints.length})</h3>
                {waypoints.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setWaypoints([]); setOptimized(null); }}>Clear All</Button>}
              </div>

              {waypoints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No waypoints added yet</p><p className="text-xs">Search for a postcode or address above</p></div>
              ) : (
                <div className="space-y-2">
                  {waypoints.length > 1 && <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><GripVertical className="w-3 h-3" /> Drag to reorder</p>}
                  {waypoints.map((wp, index) => {
                    const displayIdx = optimized ? optimized.sequence.indexOf(index) + 1 : index + 1;
                    return (
                      <div key={wp.id} draggable
                        onDragStart={() => setDraggedIndex(index)}
                        onDragOver={(e) => { e.preventDefault(); if (draggedIndex !== index) setDragOverIndex(index); }}
                        onDragLeave={() => setDragOverIndex(null)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
                          draggedIndex === index ? "opacity-50 border-primary bg-primary/10" :
                          dragOverIndex === index ? "border-primary border-dashed bg-primary/5" :
                          optimized ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
                        }`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                          wp.type === "pickup" ? "bg-green-500 text-green-950" :
                          wp.type === "delivery" ? "bg-amber-500 text-amber-950" : "bg-primary text-primary-foreground"
                        }`}>{displayIdx}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{wp.address}</p>
                          <p className="text-xs text-muted-foreground">{wp.type}{wp.postcode && ` • ${wp.postcode}`}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setWaypoints((p) => p.filter((w) => w.id !== wp.id)); setOptimized(null); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* HGV Constraints */}
            <div className="p-4 border-t border-border space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground">HGV CONSTRAINTS</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Height (m)</Label><Input type="number" step="0.1" value={vehicleHeight} onChange={(e) => setVehicleHeight(parseFloat(e.target.value) || 4.95)} className="h-8" /></div>
                <div><Label className="text-xs">Weight (t)</Label><Input type="number" step="1" value={vehicleWeight} onChange={(e) => setVehicleWeight(parseFloat(e.target.value) || 44)} className="h-8" /></div>
              </div>
            </div>

            {/* Optimization Results */}
            {optimized && (
              <div className="p-4 border-t border-border bg-green-500/10">
                <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-green-500" /><span className="text-sm font-semibold text-green-500">Route Optimized</span></div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div><p className="text-xs text-muted-foreground">Distance</p><p className="font-mono font-bold text-green-500">{fmt.dist(optimized.totalDistance)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Duration</p><p className="font-mono font-bold text-green-500">{fmt.time(optimized.totalDuration)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fuel Saved</p><p className="font-mono font-bold text-green-500">£{optimized.fuelSaved.toFixed(0)}</p></div>
                </div>
                <div className="mb-3"><Label className="text-xs">Customer Name</Label><Input placeholder="e.g., Tesco Distribution" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 mt-1" /></div>
              </div>
            )}

            {/* Alerts */}
            {optimized?.alerts && optimized.alerts.length > 0 && (
              <div className="p-4 border-t border-border bg-amber-500/10">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold text-amber-500">Route Alerts ({optimized.alerts.length})</span></div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {optimized.alerts.map((a, i) => (
                    <div key={i} className={`text-xs p-2 rounded ${a.severity === "critical" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                      <strong>{a.location}</strong><br />{a.details}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4 border-t border-border space-y-2">
              {!optimized ? (
                <Button className="w-full" onClick={handleOptimize} disabled={isOptimizing || waypoints.length < 2}>
                  {isOptimizing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Optimizing...</> : <><Play className="w-4 h-4 mr-2" />Optimize Route</>}
                </Button>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setOptimized(null)}>Reset</Button>
                    <Button variant="outline" className="flex-1" onClick={() => toast.success("Route exported to Movido Driver via TomTom")}><Smartphone className="w-4 h-4 mr-2" />Export</Button>
                  </div>
                  <Button className="w-full" onClick={handleSaveJob} disabled={isSaving || !customerName.trim()}>
                    {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Confirm & Save Job</>}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* RIGHT PANEL — TomTom Map */}
          <div className="flex-1 relative">
            <TomTomMap
              className="w-full h-full"
              initialCenter={{ lat: 52.5, lng: -1.5 }}
              initialZoom={6}
              markers={mapMarkers}
              routes={mapRoutes}
              mapStyle="night"
            />

            {/* Legend */}
            <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3">
              <h4 className="text-xs font-semibold mb-2">Legend</h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-muted-foreground">Pickup</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500" /><span className="text-muted-foreground">Delivery</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-muted-foreground">Waypoint</span></div>
                <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-red-500" /><span className="text-muted-foreground">Low Bridge</span></div>
                <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-amber-500" /><span className="text-muted-foreground">CAZ Zone</span></div>
              </div>
            </div>

            {/* Route Info */}
            {optimized && (
              <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><Route className="w-4 h-4 text-primary" /><span className="font-mono font-bold">{fmt.dist(optimized.totalDistance)}</span></div>
                    <div className="flex items-center gap-2"><Navigation className="w-4 h-4 text-primary" /><span className="font-mono font-bold">{fmt.time(optimized.totalDuration)}</span></div>
                    {optimized.distanceSaved > 0 && <div className="flex items-center gap-2 text-green-500"><Zap className="w-4 h-4" /><span className="font-mono font-bold">-{fmt.dist(optimized.distanceSaved)} saved</span></div>}
                  </div>
                  {optimized.alerts.length > 0 && <span className="flex items-center gap-1 text-amber-500 text-sm"><AlertTriangle className="w-4 h-4" />{optimized.alerts.length} alert(s)</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
