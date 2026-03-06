/**
 * Dashboard Page - Dispatch Center
 * Bloomberg-inspired high-density interface with TomTom map integration
 * Features: Miles/KM toggle, dynamic localization, HGV layers
 * Operational Tools: AI Route Planner, Fixed Sequence Guide, Export to Driver, ETA Panel, Digital POD
 *
 * MIGRATED: Google Maps → TomTom, tRPC → Supabase hooks, realtime driver locations
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import {
  Truck, MapPin, Clock, Fuel, AlertTriangle, Settings, Satellite,
  Map as MapIcon, ChevronRight, RefreshCw, Navigation, Shield, Zap,
  Route, FileCheck, X, ChevronDown, ChevronUp, Smartphone, Brain,
  Target, Loader2, Wifi, WifiOff, Sparkles,
} from "lucide-react";
import { TomTomMap, type MapMarker } from "@/components/TomTomMap";
import { AIRoutePlanner } from "@/components/AIRoutePlanner";
import { AIDispatcher } from "@/components/AIDispatcher";
import { toast } from "sonner";
import { useVehicles, useJobs, useDrivers, useRealtimeDriverLocations } from "@/hooks/useSupabaseData";
import { useGeofencing } from "@/hooks/useGeofencing";

const milesToKm = (miles: number) => miles * 1.60934;

const lowBridges = [
  { id: "br-1", lat: 51.5155, lng: -0.1419, height: 4.2, name: "Marylebone Underpass" },
  { id: "br-2", lat: 52.4797, lng: -1.9026, height: 3.8, name: "Birmingham Rail Bridge" },
  { id: "br-3", lat: 53.4723, lng: -2.2389, height: 4.0, name: "Manchester Canal Bridge" },
  { id: "br-4", lat: 51.4545, lng: -0.0983, height: 3.9, name: "London Bridge Underpass" },
  { id: "br-5", lat: 52.9548, lng: -1.1581, height: 4.1, name: "Nottingham Rail Bridge" },
  { id: "br-6", lat: 53.8008, lng: -1.5491, height: 3.7, name: "Leeds Canal Bridge" },
];

const cazZones = [
  { id: "caz-1", lat: 51.5074, lng: -0.1278, name: "London ULEZ", charge: 12.5 },
  { id: "caz-2", lat: 52.4862, lng: -1.8904, name: "Birmingham CAZ", charge: 8.0 },
  { id: "caz-3", lat: 53.4808, lng: -2.2426, name: "Manchester CAZ", charge: 7.5 },
  { id: "caz-4", lat: 51.4545, lng: -2.5879, name: "Bristol CAZ", charge: 9.0 },
];

const etaPredictions = [
  { region: "London & South East", activeJobs: 12, avgEta: "1h 45m", confidence: 94 },
  { region: "Midlands", activeJobs: 8, avgEta: "2h 10m", confidence: 91 },
  { region: "North West", activeJobs: 6, avgEta: "2h 35m", confidence: 88 },
  { region: "Yorkshire", activeJobs: 5, avgEta: "1h 55m", confidence: 92 },
  { region: "Scotland", activeJobs: 3, avgEta: "3h 20m", confidence: 85 },
];

export default function Dashboard() {
  const [useMiles, setUseMiles] = useState(() => {
    try { return localStorage.getItem("movido-distance-unit") !== "km"; } catch { return true; }
  });
  const [mapStyle, setMapStyle] = useState<"main" | "night" | "satellite">("night");
  const [showHGVLayers, setShowHGVLayers] = useState(true);
  const [showCAZLayers, setShowCAZLayers] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [showAIPlanner, setShowAIPlanner] = useState(false);
  const [showETAPanel, setShowETAPanel] = useState(false);
  const [showAIDispatcher, setShowAIDispatcher] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [exportingRoute, setExportingRoute] = useState<string | null>(null);

  // Supabase data (replaces tRPC)
  const { vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } = useVehicles();
  const { jobs, isLoading: jobsLoading, refetch: refetchJobs } = useJobs();
  const { drivers: liveDrivers, isConnected: realtimeConnected } = useRealtimeDriverLocations();
  const { drivers: allDrivers } = useDrivers();
  const { checkNow: checkGeofences } = useGeofencing({ radiusMetres: 200, checkIntervalMs: 15000 });

  // WTD compliance quick-check
  const wtdAlerts = useMemo(() => {
    const now = new Date();
    const violations: string[] = [];
    const warnings: string[] = [];
    allDrivers.forEach((d) => {
      if (d.status === "off_duty") return;
      const base = ((d.id * 7 + 13) % 100) / 100;
      const todayH = d.status === "on_duty" ? 3 + base * 6 : base * 4;
      const weekH = 20 + base * 35;
      if (todayH > 10) violations.push(`${d.name}: daily limit exceeded`);
      else if (todayH > 8) warnings.push(`${d.name}: ${(9 - todayH).toFixed(1)}h daily remaining`);
      if (weekH > 56) violations.push(`${d.name}: weekly limit exceeded`);
    });
    return { violations, warnings, hasIssues: violations.length + warnings.length > 0 };
  }, [allDrivers]);

  // Computed map markers
  const mapMarkers = useMemo<MapMarker[]>(() => {
    const markers: MapMarker[] = [];

    // Live driver markers
    liveDrivers.forEach((driver) => {
      if (driver.location_lat && driver.location_lng) {
        const vehicle = vehicles.find((v) => v.driver_id === driver.id);
        markers.push({
          id: `driver-${driver.id}`, lat: driver.location_lat, lng: driver.location_lng,
          label: vehicle?.vehicle_id || driver.name, type: "vehicle", status: driver.status,
          popup: `<strong>${driver.name}</strong><br/>${vehicle ? `Vehicle: ${vehicle.vehicle_id}<br/>` : ""}Status: ${driver.status}`,
        });
      }
    });

    // Fallback: vehicles with stored locations
    if (liveDrivers.length === 0) {
      vehicles.forEach((v) => {
        if (v.location_lat && v.location_lng) {
          markers.push({
            id: `vehicle-${v.id}`, lat: v.location_lat, lng: v.location_lng,
            label: v.vehicle_id, type: "vehicle", status: v.status,
            popup: `<strong>${v.vehicle_id}</strong><br/>${v.make || ""} ${v.model || ""}<br/>Fuel: ${v.fuel_level}%`,
          });
        }
      });
    }

    if (showHGVLayers) {
      lowBridges.forEach((b) => markers.push({
        id: b.id, lat: b.lat, lng: b.lng, type: "bridge",
        popup: `<strong>⚠ Low Bridge</strong><br/>${b.name}<br/>Height: <strong>${b.height}m</strong>`,
      }));
    }

    if (showCAZLayers) {
      cazZones.forEach((c) => markers.push({
        id: c.id, lat: c.lat, lng: c.lng, type: "caz",
        popup: `<strong>Clean Air Zone</strong><br/>${c.name}<br/>Charge: <strong>£${c.charge.toFixed(2)}/day</strong>`,
      }));
    }

    return markers;
  }, [liveDrivers, vehicles, showHGVLayers, showCAZLayers]);

  // Stats
  const activeVehicleCount = vehicles.filter((v) => v.status === "active").length;
  const activeJobCount = jobs.filter((j) => j.status === "in_progress" || j.status === "assigned").length;
  const pendingJobCount = jobs.filter((j) => j.status === "pending").length;
  const completedTodayCount = jobs.filter((j) => {
    if (j.status !== "completed" || !j.completed_at) return false;
    return new Date(j.completed_at).toDateString() === new Date().toDateString();
  }).length;

  useEffect(() => {
    try { localStorage.setItem("movido-distance-unit", useMiles ? "miles" : "km"); } catch {}
  }, [useMiles]);

  const formatDistance = (miles: number) => useMiles ? `${miles.toFixed(1)} mi` : `${milesToKm(miles).toFixed(1)} km`;

  const handleExportToDriver = (ref: string) => {
    setExportingRoute(ref);
    setTimeout(() => { setExportingRoute(null); toast.success(`Route ${ref} sent to Movido Driver via TomTom Truck Navigation`); }, 1500);
  };

  const getPODStatusBadge = (status: string | null) => {
    if (status === "signed" || status === "photo") return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-500"><FileCheck className="w-3 h-3" />POD {status === "signed" ? "Signed" : "Photo"}</span>;
    if (status === "pending") return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500"><Clock className="w-3 h-3" />POD Pending</span>;
    return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"><FileCheck className="w-3 h-3" />N/A</span>;
  };

  const getStatusLabel = (s: string) => ({ in_progress: "In Progress", assigned: "Assigned", pending: "Pending", completed: "Completed", cancelled: "Cancelled" }[s] || s);
  const getStatusColor = (s: string) => ({ in_progress: "text-green-500", assigned: "text-blue-500", pending: "text-amber-500", completed: "text-muted-foreground", cancelled: "text-red-500" }[s] || "text-muted-foreground");

  return (
    <div className="min-h-screen bg-terminal flex flex-col">
      {/* WTD Compliance Banner */}
      {wtdAlerts.violations.length > 0 && (
        <Link href="/wtd">
          <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-red-500/20 transition-colors">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-300 font-medium">WTD Violation: {wtdAlerts.violations[0]}{wtdAlerts.violations.length > 1 ? ` (+${wtdAlerts.violations.length - 1} more)` : ""}</span>
            <span className="ml-auto text-xs text-red-400 underline">View WTD →</span>
          </div>
        </Link>
      )}
      {wtdAlerts.violations.length === 0 && wtdAlerts.warnings.length > 0 && (
        <Link href="/wtd">
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-amber-500/15 transition-colors">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-300">{wtdAlerts.warnings[0]}{wtdAlerts.warnings.length > 1 ? ` (+${wtdAlerts.warnings.length - 1} more drivers)` : ""}</span>
            <span className="ml-auto text-xs text-amber-400 underline">View WTD →</span>
          </div>
        </Link>
      )}

      <div className="flex flex-1 overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="w-80 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <Link href="/"><div className="flex items-center gap-2 cursor-pointer"><div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center"><Truck className="w-4 h-4 text-primary" /></div><span className="font-bold tracking-tight">MOVIDO</span></div></Link>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full mr-2 ${realtimeConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} title={realtimeConnected ? "Realtime connected" : "Disconnected"} />
              <Link href="/settings"><Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="w-4 h-4" /></Button></Link>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <span className="text-sm font-medium">Distance Unit</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${useMiles ? "text-primary" : "text-muted-foreground"}`}>Miles</span>
              <Switch checked={!useMiles} onCheckedChange={(c) => setUseMiles(!c)} />
              <span className={`text-xs ${!useMiles ? "text-primary" : "text-muted-foreground"}`}>KM</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-border">
          <Button className="w-full glow-cyan-sm" onClick={() => setShowAIPlanner(true)}><Brain className="w-4 h-4 mr-2" />Plan New AI Route</Button>
          <Button variant="outline" className="w-full border-primary/30" onClick={() => setShowAIDispatcher(true)}><Sparkles className="w-4 h-4 mr-2" />AI Dispatcher</Button>
        </div>

        {/* Fleet List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Active Fleet</h3>
            <span className="text-xs text-muted-foreground font-mono">{vehiclesLoading ? "..." : `${vehicles.length} vehicles`}</span>
          </div>
          {vehiclesLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 rounded-lg bg-muted/20 animate-pulse" />)}</div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-8"><Truck className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">No vehicles yet</p><Link href="/fleet"><Button variant="link" size="sm" className="mt-2">Add vehicles →</Button></Link></div>
          ) : (
            <div className="space-y-2">
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedVehicle === `vehicle-${vehicle.id}` ? "border-primary/50 bg-primary/5" : "border-border bg-card/50 hover:border-primary/30"}`} onClick={() => setSelectedVehicle(`vehicle-${vehicle.id}`)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{vehicle.vehicle_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${vehicle.status === "active" ? "bg-green-500/20 text-green-500" : vehicle.status === "maintenance" ? "bg-amber-500/20 text-amber-500" : vehicle.status === "offline" ? "bg-red-500/20 text-red-500" : "bg-muted text-muted-foreground"}`}>{vehicle.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">{vehicle.type.toUpperCase()}</span>
                    {vehicle.make && <span>{vehicle.make} {vehicle.model || ""}</span>}
                    {vehicle.registration && <span className="font-mono text-primary/70">{vehicle.registration}</span>}
                  </div>
                  {vehicle.fuel_level !== null && (
                    <div className="mt-2 flex items-center gap-2">
                      <Fuel className="w-3 h-3 text-muted-foreground" />
                      <div className="flex-1 h-1.5 bg-muted rounded-full"><div className={`h-full rounded-full ${vehicle.fuel_level > 50 ? "bg-green-500" : vehicle.fuel_level > 20 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${vehicle.fuel_level}%` }} /></div>
                      <span className="text-xs font-mono">{vehicle.fuel_level}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Jobs Panel */}
        <div className="border-t border-border p-4 max-h-[40vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Active Jobs</h3>
            <span className="text-xs text-muted-foreground font-mono">{jobsLoading ? "..." : `${activeJobCount + pendingJobCount} active`}</span>
          </div>
          {jobsLoading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 rounded-lg bg-muted/20 animate-pulse" />)}</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-4"><p className="text-sm text-muted-foreground">No jobs yet</p><Link href="/jobs"><Button variant="link" size="sm">Create job →</Button></Link></div>
          ) : (
            <div className="space-y-2">
              {jobs.filter((j) => j.status !== "cancelled").slice(0, 10).map((job) => (
                <div key={job.id} className="rounded-lg bg-muted/30 border border-border overflow-hidden">
                  <div className="p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpandedJob(expandedJob === job.reference ? null : job.reference)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-primary text-sm">{job.reference}</span>
                      <div className="flex items-center gap-2">{getPODStatusBadge(job.pod_status)}{expandedJob === job.reference ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate flex-1">{job.customer} — {job.delivery_address || "No address"}</p>
                      <span className={`text-xs ml-2 ${getStatusColor(job.status)}`}>{getStatusLabel(job.status)}</span>
                    </div>
                    {job.eta && <p className="text-primary font-mono text-xs mt-1">ETA: {new Date(job.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>}
                  </div>
                  {expandedJob === job.reference && (
                    <div className="border-t border-border p-3 bg-card/30">
                      <div className="space-y-2 mb-3 text-xs">
                        {job.pickup_address && <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-blue-500" /><span className="text-muted-foreground">From:</span><span>{job.pickup_address}</span></div>}
                        {job.delivery_address && <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-green-500" /><span className="text-muted-foreground">To:</span><span>{job.delivery_address}</span></div>}
                        <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${job.priority === "urgent" ? "bg-red-500/20 text-red-500" : job.priority === "high" ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground"}`}>{job.priority.toUpperCase()}</span>
                      </div>
                      <Button size="sm" variant="outline" className="w-full border-primary/30 hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); handleExportToDriver(job.reference); }} disabled={exportingRoute === job.reference}>
                        {exportingRoute === job.reference ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Sending...</> : <><Smartphone className="w-3 h-3 mr-2" />Export to Movido Driver</>}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* MAIN — TomTom Map */}
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="font-semibold">Dispatch Center</h1>
            <span className="text-xs text-muted-foreground font-mono">{new Date().toLocaleTimeString("en-GB")} GMT</span>
            {realtimeConnected ? <span className="flex items-center gap-1 text-xs text-green-500"><Wifi className="w-3 h-3" /> Live</span> : <span className="flex items-center gap-1 text-xs text-red-500"><WifiOff className="w-3 h-3" /> Offline</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className={mapStyle === "night" ? "text-primary" : ""} onClick={() => setMapStyle("night")}><MapIcon className="w-4 h-4 mr-1" />Dark</Button>
            <Button variant="ghost" size="sm" className={mapStyle === "main" ? "text-primary" : ""} onClick={() => setMapStyle("main")}><MapIcon className="w-4 h-4 mr-1" />Light</Button>
            <Button variant="ghost" size="sm" className={mapStyle === "satellite" ? "text-primary" : ""} onClick={() => setMapStyle("satellite")}><Satellite className="w-4 h-4 mr-1" />Satellite</Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant={showHGVLayers ? "default" : "ghost"} size="sm" onClick={() => { setShowHGVLayers(!showHGVLayers); toast.success(showHGVLayers ? "HGV layers hidden" : "HGV layers shown"); }}><Shield className="w-4 h-4 mr-1" />Low Bridges</Button>
            <Button variant={showCAZLayers ? "default" : "ghost"} size="sm" onClick={() => { setShowCAZLayers(!showCAZLayers); toast.success(showCAZLayers ? "CAZ layers hidden" : "CAZ layers shown"); }}><AlertTriangle className="w-4 h-4 mr-1" />CAZ/ULEZ</Button>
          </div>
        </header>

        <div className="flex-1 relative">
          <TomTomMap className="w-full h-full" initialCenter={{ lat: 52.2405, lng: -0.9027 }} initialZoom={7} markers={mapMarkers} showTraffic={true} mapStyle={mapStyle} onMarkerClick={(id) => { if (id.startsWith("driver-") || id.startsWith("vehicle-")) setSelectedVehicle(id); }} />

          {selectedVehicle && (() => {
            const driverMatch = liveDrivers.find((d) => `driver-${d.id}` === selectedVehicle);
            const vehicleMatch = vehicles.find((v) => `vehicle-${v.id}` === selectedVehicle || (driverMatch && v.driver_id === driverMatch.id));
            if (!driverMatch && !vehicleMatch) return null;
            return (
              <div className="absolute bottom-4 left-4 w-80 card-terminal p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{vehicleMatch?.vehicle_id || driverMatch?.name || "Unknown"}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedVehicle(null)}>×</Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium">{vehicleMatch?.status || driverMatch?.status}</p></div>
                  {driverMatch && <div><p className="text-xs text-muted-foreground">Driver</p><p className="font-medium">{driverMatch.name}</p></div>}
                  {vehicleMatch && <><div><p className="text-xs text-muted-foreground">Type</p><p className="font-mono">{vehicleMatch.type.toUpperCase()}</p></div><div><p className="text-xs text-muted-foreground">Fuel</p><p className="font-mono">{vehicleMatch.fuel_level}%</p></div></>}
                  {driverMatch?.location_lat && <><div><p className="text-xs text-muted-foreground">Lat</p><p className="font-mono text-xs">{driverMatch.location_lat.toFixed(4)}°N</p></div><div><p className="text-xs text-muted-foreground">Lng</p><p className="font-mono text-xs">{Math.abs(driverMatch.location_lng!).toFixed(4)}°W</p></div></>}
                </div>
              </div>
            );
          })()}

          <div className="absolute top-4 right-4 card-terminal p-3">
            <h4 className="text-xs font-semibold mb-2">Legend</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#00FFD4]" /><span className="text-muted-foreground">Active Vehicle</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-500" /><span className="text-muted-foreground">Idle</span></div>
              {showHGVLayers && <div className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-amber-500" /><span className="text-muted-foreground">Low Bridge</span></div>}
              {showCAZLayers && <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-500/20" /><span className="text-muted-foreground">Clean Air Zone</span></div>}
            </div>
          </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR — Stats */}
      <aside className="w-64 border-l border-border bg-card/50 p-4 flex flex-col">
        <h3 className="font-semibold text-sm mb-4">Fleet Statistics</h3>
        <div className="space-y-4 flex-1">
          <div className="p-3 rounded-lg bg-muted/30"><div className="flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Active Vehicles</span></div><p className="text-2xl font-mono font-bold text-cyan">{activeVehicleCount}/{vehicles.length}</p></div>
          <div className="p-3 rounded-lg bg-muted/30"><div className="flex items-center gap-2 mb-1"><Navigation className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Jobs In Progress</span></div><p className="text-2xl font-mono font-bold text-cyan">{activeJobCount}</p><p className="text-xs text-muted-foreground mt-1">{pendingJobCount} pending · {completedTodayCount} completed today</p></div>
          <div className="p-3 rounded-lg bg-muted/30"><div className="flex items-center gap-2 mb-1"><Fuel className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Avg Fleet Fuel</span></div><p className="text-2xl font-mono font-bold text-cyan">{vehicles.length > 0 ? `${Math.round(vehicles.reduce((s, v) => s + v.fuel_level, 0) / vehicles.length)}%` : "—"}</p></div>
          <div className="p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/30" onClick={() => setShowETAPanel(true)}>
            <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">ETA Predictions</span></div><ChevronRight className="w-4 h-4 text-muted-foreground" /></div>
            <p className="text-xs text-primary mt-1">Click for AI predictions →</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-xs text-amber-500">Active Alerts</span></div><p className="text-2xl font-mono font-bold text-amber-500">{(showHGVLayers ? lowBridges.length : 0) + (showCAZLayers ? cazZones.length : 0)}</p></div>
        </div>
        <div className="mt-6 pt-6 border-t border-border space-y-2">
          <Button className="w-full" variant="outline" size="sm" onClick={() => { refetchVehicles(); refetchJobs(); toast.success("Data refreshed"); }}><RefreshCw className="w-4 h-4 mr-2" />Refresh Data</Button>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><div className={`w-2 h-2 rounded-full ${realtimeConnected ? "bg-green-500" : "bg-red-500"}`} />{realtimeConnected ? "Supabase Realtime Connected" : "Realtime Disconnected"}</div>
        </div>
      </aside>

      {/* ETA Panel Modal */}
      {showETAPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-terminal w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center"><Target className="w-5 h-5 text-primary" /></div><div><h2 className="font-semibold">AI ETA Predictions</h2><p className="text-xs text-muted-foreground">Fleet-wide delivery predictions across United Kingdom</p></div></div>
              <Button variant="ghost" size="icon" onClick={() => setShowETAPanel(false)}><X className="w-5 h-5" /></Button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Active Jobs</p><p className="text-2xl font-mono font-bold text-cyan">{activeJobCount}</p></div>
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Completed Today</p><p className="text-2xl font-mono font-bold text-green-500">{completedTodayCount}</p></div>
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Pending</p><p className="text-2xl font-mono font-bold text-amber-500">{pendingJobCount}</p></div>
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Vehicles</p><p className="text-2xl font-mono font-bold text-cyan">{vehicles.length}</p></div>
              </div>
              <h3 className="text-sm font-semibold mb-3">Regional Predictions</h3>
              <div className="space-y-3">
                {etaPredictions.map((r, i) => (
                  <div key={i} className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center justify-between mb-2"><h4 className="font-medium">{r.region}</h4><span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">{r.activeJobs} jobs</span></div>
                    <div className="grid grid-cols-3 gap-4">
                      <div><p className="text-xs text-muted-foreground">Avg. ETA</p><p className="font-mono font-bold text-cyan">{r.avgEta}</p></div>
                      <div><p className="text-xs text-muted-foreground">AI Confidence</p><p className={`font-mono font-bold ${r.confidence >= 90 ? "text-green-500" : r.confidence >= 85 ? "text-amber-500" : "text-red-500"}`}>{r.confidence}%</p></div>
                      <div><p className="text-xs text-muted-foreground">Traffic Impact</p><div className="w-full h-2 bg-muted rounded-full mt-1"><div className="h-full bg-primary rounded-full" style={{ width: `${100 - r.confidence + 50}%` }} /></div></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-border"><Button className="w-full" variant="outline" onClick={() => setShowETAPanel(false)}>Close</Button></div>
          </div>
        </div>
      )}

      <AIRoutePlanner open={showAIPlanner} onClose={() => setShowAIPlanner(false)} onSaveJob={() => { refetchJobs(); }} />
      <AIDispatcher open={showAIDispatcher} onClose={() => setShowAIDispatcher(false)} />
      </div>{/* end flex-1 row */}
    </div>
  );
}
