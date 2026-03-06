/**
 * Routes Page — Live route tracking from Supabase jobs
 * Active routes = in_progress jobs with coordinates
 * Shows progress, driver, vehicle, distance/stops
 * Opens AI Route Planner for new route planning
 */

import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Route, MapPin, Clock, Truck, Navigation, Users,
  RefreshCw, Filter, Loader2, Brain, Eye,
} from "lucide-react";
import { useJobs, useDrivers, useVehicles } from "@/hooks/useSupabaseData";
import { AIRoutePlanner } from "@/components/AIRoutePlanner";

const statusColors: Record<string, string> = {
  in_progress: "bg-green-500/20 text-green-500 border-green-500/30",
  assigned: "bg-amber-500/20 text-amber-500 border-amber-500/30",
  completed: "bg-blue-500/20 text-blue-500 border-blue-500/30",
  pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function Routes() {
  const { jobs, isLoading, refetch } = useJobs();
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();
  const [statusFilter, setStatusFilter] = useState("active");
  const [showPlanner, setShowPlanner] = useState(false);

  // Enrich jobs with driver/vehicle names
  const routes = useMemo(() => {
    return jobs
      .filter((j) => {
        if (statusFilter === "active") return j.status === "in_progress" || j.status === "assigned";
        if (statusFilter === "completed") return j.status === "completed";
        if (statusFilter === "pending") return j.status === "pending";
        return true;
      })
      .map((j) => {
        const driver = drivers.find((d) => d.id === j.driver_id);
        const vehicle = vehicles.find((v) => v.id === j.vehicle_id);

        // Estimate progress based on status
        let progress = 0;
        if (j.status === "pending") progress = 0;
        if (j.status === "assigned") progress = 15;
        if (j.status === "in_progress") {
          // If ETA exists, estimate progress
          if (j.eta) {
            const created = new Date(j.created_at).getTime();
            const eta = new Date(j.eta).getTime();
            const now = Date.now();
            const total = eta - created;
            const elapsed = now - created;
            progress = total > 0 ? Math.min(Math.round((elapsed / total) * 100), 95) : 50;
          } else {
            progress = 50;
          }
        }
        if (j.status === "completed") progress = 100;

        return {
          ...j,
          driverName: driver?.name || "Unassigned",
          vehicleId: vehicle?.vehicle_id || "No vehicle",
          vehicleMake: vehicle ? `${vehicle.make} ${vehicle.model}` : "",
          progress,
        };
      });
  }, [jobs, drivers, vehicles, statusFilter]);

  // Stats
  const activeCount = jobs.filter((j) => j.status === "in_progress").length;
  const assignedCount = jobs.filter((j) => j.status === "assigned").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const hasCoords = jobs.filter((j) => j.pickup_lat || j.delivery_lat).length;

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Route Management</h1><p className="text-sm text-muted-foreground mt-1">Live delivery routes from Supabase</p></div>
          <Button className="glow-cyan-sm" onClick={() => setShowPlanner(true)}>
            <Brain className="w-4 h-4 mr-2" />Plan New Route
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">Active Routes</p>
            <p className="text-2xl font-mono font-bold text-green-500">{activeCount}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">Assigned</p>
            <p className="text-2xl font-mono font-bold text-amber-500">{assignedCount}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">Completed</p>
            <p className="text-2xl font-mono font-bold text-blue-500">{completedCount}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">With GPS Coords</p>
            <p className="text-2xl font-mono font-bold text-cyan">{hasCoords}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Routes</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {/* Loading */}
        {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}

        {/* Routes List */}
        {!isLoading && routes.length === 0 && (
          <div className="card-terminal p-12 text-center">
            <Route className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No routes found</h3>
            <p className="text-muted-foreground mb-4">Create jobs with coordinates to see them as routes</p>
            <Button onClick={() => setShowPlanner(true)}><Brain className="w-4 h-4 mr-2" />Plan AI Route</Button>
          </div>
        )}

        {!isLoading && routes.length > 0 && (
          <div className="space-y-3">
            {routes.map((route) => (
              <div key={route.id} className="card-terminal p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <Route className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-mono font-bold text-primary">{route.reference}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[route.status] || statusColors.pending}`}>
                        {route.status.replace("_", " ")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground">{route.priority}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{route.customer}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{route.driverName}</span>
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{route.vehicleId}</span>
                      {route.eta && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />ETA: {new Date(route.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                  </div>

                  {/* Addresses */}
                  <div className="hidden lg:block max-w-[200px]">
                    {route.pickup_address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="truncate">{route.pickup_address}</span>
                      </div>
                    )}
                    {route.delivery_address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate">{route.delivery_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="w-28">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-mono text-primary">{route.progress}%</span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${route.progress === 100 ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${route.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Tracking link */}
                  {route.tracking_token && (
                    <Button variant="outline" size="icon" title="Copy tracking link"
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/track/${route.tracking_token}`); import("sonner").then(m => m.toast.success("Tracking link copied!")); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Route Planner */}
        <AIRoutePlanner open={showPlanner} onClose={() => setShowPlanner(false)} onSaveJob={() => refetch()} />
      </div>
    </DashboardLayout>
  );
}
