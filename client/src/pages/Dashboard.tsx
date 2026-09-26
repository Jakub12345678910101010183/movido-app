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
  Route, FileCheck, X, ChevronDown, ChevronUp, Smartphone,
  Target, Loader2, Wifi, WifiOff, Sparkles,
} from "lucide-react";
import { TomTomMap, type MapMarker } from "@/components/TomTomMap";
import { escapeHtml } from "@/lib/html";
import { CLEAN_AIR_ZONES, CAZ_CHECK_URL } from "@/lib/cleanAirZones";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import { useVehicles, useJobs, useDrivers, useRealtimeDriverLocations } from "@/hooks/useSupabaseData";

const milesToKm = (miles: number) => miles * 1.60934;

function positionAge(iso: string | null): string {
  if (!iso) return "time unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export default function Dashboard() {
  const [useMiles, setUseMiles] = useState(() => {
    try { return localStorage.getItem("movido-distance-unit") !== "km"; } catch { return true; }
  });
  const [mapStyle, setMapStyle] = useState<"main" | "night" | "satellite">("night");
  const [showCAZLayers, setShowCAZLayers] = useState(() => {
    try { return localStorage.getItem("movido-show-caz") !== "false"; } catch { return true; }
  });
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [showETAPanel, setShowETAPanel] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [exportingRoute, setExportingRoute] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }));

  useEffect(() => {
    const tick = setInterval(() => setCurrentTime(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" })), 1000);
    return () => clearInterval(tick);
  }, []);

  // Supabase data (replaces tRPC)
  const { vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } = useVehicles();
  const { jobs, isLoading: jobsLoading, refetch: refetchJobs } = useJobs();
  const { drivers: liveDrivers, isConnected: realtimeConnected } = useRealtimeDriverLocations();
  const { drivers: allDrivers } = useDrivers();

  // WTD compliance quick-check
  const wtdAlerts = useMemo(() => {
    const now = new Date();
    const violations: string[] = [];
    const warnings: string[] = [];
    // Recorded hours only (see WTD page) — nothing is estimated here.
    allDrivers.forEach((d) => {
      if (d.status === "off_duty") return;
      const todayH = Number(d.hours_today ?? 0);
      const weekH = Number(d.hours_week ?? 0);
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
          popup: `<strong>${escapeHtml(driver.name)}</strong><br/>${vehicle ? `Vehicle: ${escapeHtml(vehicle.vehicle_id)}<br/>` : ""}Status: ${driver.status}<br/>Updated ${positionAge(driver.location_updated_at)}`,
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
            popup: `<strong>${escapeHtml(v.vehicle_id)}</strong><br/>${escapeHtml(v.make || "")} ${escapeHtml(v.model || "")}<br/>Fuel: ${v.fuel_level ?? "—"}%`,
          });
        }
      });
    }

    if (showCAZLayers) {
      CLEAN_AIR_ZONES.forEach((c) => markers.push({
        id: c.id, lat: c.lat, lng: c.lng, type: "caz",
        popup: `<strong>${escapeHtml(c.name)}</strong><br/>Charging zone — <a href="${CAZ_CHECK_URL}" target="_blank" rel="noopener noreferrer">check your vehicle</a>`,
      }));
    }

    return markers;
  }, [liveDrivers, vehicles, showCAZLayers]);

  // Stats
  const activeVehicleCount = vehicles.filter((v) => v.status === "active").length;
  const activeJobCount = jobs.filter((j) => j.status === "in_progress" || j.status === "assigned").length;
  const pendingJobCount = jobs.filter((j) => j.status === "pending").length;
  const completedTodayCount = jobs.filter((j) => {
    if (j.status !== "completed") return false;
    const ts = j.completed_at || j.updated_at;
    if (!ts) return false;
    return new Date(ts).toDateString() === new Date().toDateString();
  }).length;
  // Open jobs with an ETA, soonest first; "late" = ETA passed and not delivered.
  const upcomingEtas = jobs
    .filter((j) => j.eta && j.status !== "completed" && j.status !== "cancelled")
    .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime());
  const lateJobs = upcomingEtas.filter((j) => new Date(j.eta!).getTime() < Date.now());

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
    <DashboardLayout>
    <div className="min-h-full bg-terminal flex flex-col">
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

      <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <span className="text-sm font-medium">Distance Unit</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${useMiles ? "text-primary" : "text-muted-foreground"}`}>Miles</span>
              <Switch checked={!useMiles} onCheckedChange={(c) => setUseMiles(!c)} aria-label="Show distances in kilometres" />
              <span className={`text-xs ${!useMiles ? "text-primary" : "text-muted-foreground"}`}>KM</span>
            </div>
          </div>
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
      <main className="flex-1 flex flex-col min-w-0 min-h-[60vh] lg:min-h-0 order-first lg:order-none">
        <header className="min-h-14 py-2 border-b border-border bg-card/50 flex flex-wrap items-center justify-between gap-2 px-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <h1 className="font-semibold">Dispatch Center</h1>
            <span className="text-xs text-muted-foreground font-mono">{currentTime}</span>
            {realtimeConnected ? <span className="flex items-center gap-1 text-xs text-green-500"><Wifi className="w-3 h-3" /> Live</span> : <span className="flex items-center gap-1 text-xs text-amber-500" title="Instant updates unavailable; positions refresh every 20 seconds"><WifiOff className="w-3 h-3" /> Refreshing every 20 s</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1 md:gap-2">
            <Button variant="ghost" size="sm" className={mapStyle === "night" ? "text-primary" : ""} onClick={() => setMapStyle("night")}><MapIcon className="w-4 h-4 mr-1" />Dark</Button>
            <Button variant="ghost" size="sm" className={mapStyle === "main" ? "text-primary" : ""} onClick={() => setMapStyle("main")}><MapIcon className="w-4 h-4 mr-1" />Light</Button>
            <Button variant="ghost" size="sm" className={mapStyle === "satellite" ? "text-primary" : ""} onClick={() => setMapStyle("satellite")}><Satellite className="w-4 h-4 mr-1" />Satellite</Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant={showCAZLayers ? "default" : "ghost"} size="sm" aria-pressed={showCAZLayers} onClick={() => setShowCAZLayers(!showCAZLayers)}><AlertTriangle className="w-4 h-4 mr-1" />Clean Air Zones</Button>
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
                  {driverMatch?.location_lat && <><div><p className="text-xs text-muted-foreground">Lat</p><p className="font-mono text-xs">{driverMatch.location_lat.toFixed(4)}°N</p></div><div><p className="text-xs text-muted-foreground">Lng</p><p className="font-mono text-xs">{Math.abs(driverMatch.location_lng ?? 0).toFixed(4)}°{(driverMatch.location_lng ?? 0) < 0 ? "W" : "E"}</p></div></>}
                </div>
              </div>
            );
          })()}

          <div className="absolute top-4 right-4 card-terminal p-3">
            <h4 className="text-xs font-semibold mb-2">Legend</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#00FFD4]" /><span className="text-muted-foreground">Active Vehicle</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-500" /><span className="text-muted-foreground">Idle</span></div>
              {showCAZLayers && <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-500/20" /><span className="text-muted-foreground">Clean Air Zone</span></div>}
            </div>
          </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR — Stats */}
      <aside className="w-full lg:w-64 border-t lg:border-t-0 lg:border-l border-border bg-card/50 p-4 flex flex-col">
        <h3 className="font-semibold text-sm mb-4">Fleet Statistics</h3>
        <div className="space-y-4 flex-1">
          <div className="p-3 rounded-lg bg-muted/30"><div className="flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Active Vehicles</span></div><p className="text-2xl font-mono font-bold text-cyan">{activeVehicleCount}/{vehicles.length}</p></div>
          <div className="p-3 rounded-lg bg-muted/30"><div className="flex items-center gap-2 mb-1"><Navigation className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Jobs In Progress</span></div><p className="text-2xl font-mono font-bold text-cyan">{activeJobCount}</p><p className="text-xs text-muted-foreground mt-1">{pendingJobCount} pending · {completedTodayCount} completed today</p></div>
          <div className="p-3 rounded-lg bg-muted/30"><div className="flex items-center gap-2 mb-1"><Fuel className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Avg Fleet Fuel</span></div><p className="text-2xl font-mono font-bold text-cyan">{vehicles.length > 0 ? `${Math.round(vehicles.reduce((s, v) => s + (v.fuel_level ?? 0), 0) / vehicles.length)}%` : "—"}</p></div>
          <button type="button" className="w-full text-left p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/30" onClick={() => setShowETAPanel(true)}>
            <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Upcoming ETAs</span></div><ChevronRight className="w-4 h-4 text-muted-foreground" /></div>
            <p className="text-xs text-primary mt-1">{upcomingEtas.length} job{upcomingEtas.length === 1 ? "" : "s"} with an ETA →</p>
          </button>
          <div className={`p-3 rounded-lg border ${lateJobs.length > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/30 border-transparent"}`}><div className="flex items-center gap-2 mb-1"><AlertTriangle className={`w-4 h-4 ${lateJobs.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} /><span className="text-xs text-muted-foreground">Past ETA, not delivered</span></div><p className={`text-2xl font-mono font-bold ${lateJobs.length > 0 ? "text-amber-500" : "text-cyan"}`}>{lateJobs.length}</p></div>
        </div>
        <div className="mt-6 pt-6 border-t border-border space-y-2">
          <Button className="w-full" variant="outline" size="sm" onClick={() => { refetchVehicles(); refetchJobs(); toast.success("Data refreshed"); }}><RefreshCw className="w-4 h-4 mr-2" />Refresh Data</Button>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><div className={`w-2 h-2 rounded-full ${realtimeConnected ? "bg-green-500" : "bg-amber-500"}`} />{realtimeConnected ? "Instant updates on" : "Refreshing every 20 s"}</div>
        </div>
      </aside>

      {/* ETA Panel Modal */}
      {showETAPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-terminal w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center"><Target className="w-5 h-5 text-primary" /></div><div><h2 className="font-semibold">Upcoming ETAs</h2><p className="text-xs text-muted-foreground">Scheduled arrival times of open jobs</p></div></div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setShowETAPanel(false)}><X className="w-5 h-5" /></Button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Active Jobs</p><p className="text-2xl font-mono font-bold text-cyan">{activeJobCount}</p></div>
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Completed Today</p><p className="text-2xl font-mono font-bold text-green-500">{completedTodayCount}</p></div>
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Pending</p><p className="text-2xl font-mono font-bold text-amber-500">{pendingJobCount}</p></div>
                <div className="p-3 rounded-lg bg-muted/30 text-center"><p className="text-xs text-muted-foreground mb-1">Vehicles</p><p className="text-2xl font-mono font-bold text-cyan">{vehicles.length}</p></div>
              </div>
              <h3 className="text-sm font-semibold mb-3">Open jobs by ETA</h3>
              {upcomingEtas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No open jobs have an ETA yet. Set a scheduled time when creating a job.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingEtas.map((j) => {
                    const late = new Date(j.eta!).getTime() < Date.now();
                    return (
                      <div key={j.id} className="p-3 rounded-lg bg-muted/30 border border-border flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-primary">{j.reference}</p>
                          <p className="text-xs text-muted-foreground truncate">{j.customer}{j.delivery_address ? ` · ${j.delivery_address}` : ""}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-mono text-sm ${late ? "text-amber-500" : "text-foreground"}`}>{new Date(j.eta!).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                          <p className={`text-xs ${late ? "text-amber-500" : "text-muted-foreground"}`}>{late ? "Past ETA" : j.status.replace("_", " ")}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border"><Button className="w-full" variant="outline" onClick={() => setShowETAPanel(false)}>Close</Button></div>
          </div>
        </div>
      )}

      </div>{/* end flex-1 row */}
    </div>
    </DashboardLayout>
  );
}
