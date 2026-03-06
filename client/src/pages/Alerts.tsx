/**
 * Alerts Page — Live safety & operational alerts from Supabase data
 * Computed from: vehicles (fuel), maintenance (overdue), jobs (delayed), drivers (hours)
 */

import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Fuel, Wrench, Clock, Shield, Users, Truck,
  RefreshCw, Check, X, Bell, Filter, ShieldAlert, ExternalLink,
} from "lucide-react";
import { useVehicles, useDrivers, useJobs, useMaintenance, useIncidents } from "@/hooks/useSupabaseData";
import { useLocation } from "wouter";

interface Alert {
  id: string;
  type: "fuel" | "maintenance" | "delay" | "hours" | "safety" | "incident";
  severity: "critical" | "warning" | "info";
  title: string;
  details: string;
  entity: string;
  timestamp: Date;
  dismissed: boolean;
  link?: string;
}

const severityConfig = {
  critical: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle, dot: "bg-red-500" },
  warning: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: AlertTriangle, dot: "bg-amber-500" },
  info: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Bell, dot: "bg-blue-500" },
};

const typeIcons: Record<string, typeof Fuel> = {
  fuel: Fuel, maintenance: Wrench, delay: Clock, hours: Users, safety: Shield, incident: ShieldAlert,
};

export default function Alerts() {
  const { vehicles, isLoading: vL } = useVehicles();
  const { drivers, isLoading: dL } = useDrivers();
  const { jobs, isLoading: jL } = useJobs();
  const { maintenance } = useMaintenance();
  const { incidents } = useIncidents();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const isLoading = vL || dL || jL;
  const now = new Date();

  // Generate alerts from real data
  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = [];

    // OPEN INCIDENTS (reported/investigating)
    incidents.filter((i) => i.status !== "closed").forEach((inc) => {
      const driverRow = drivers.find((d) => d.id === inc.driver_id);
      const incidentLabels: Record<string, string> = {
        accident: "Accident", near_miss: "Near Miss", vehicle_damage: "Vehicle Damage",
        load_damage: "Load Damage", theft: "Theft", other: "Incident",
      };
      result.push({
        id: `incident-${inc.id}`, type: "incident",
        severity: inc.incident_type === "accident" || inc.incident_type === "theft" ? "critical" : "warning",
        title: `${incidentLabels[inc.incident_type] || "Incident"}: ${driverRow?.name || "Unknown driver"}`,
        details: `Status: ${inc.status} — ${inc.description?.slice(0, 80) || (inc.location_address || "No description")}${inc.reported_to_police ? " · Police reported" : ""}`,
        entity: driverRow?.name || `Driver #${inc.driver_id}`,
        timestamp: new Date(inc.created_at),
        dismissed: false,
        link: "/incidents",
      });
    });

    // LOW FUEL (< 20%)
    vehicles.filter((v) => v.status === "active" && (v.fuel_level || 0) < 20).forEach((v) => {
      result.push({
        id: `fuel-${v.id}`, type: "fuel",
        severity: (v.fuel_level || 0) < 10 ? "critical" : "warning",
        title: `Low Fuel: ${v.vehicle_id}`,
        details: `${v.make} ${v.model} has ${v.fuel_level}% fuel remaining`,
        entity: v.vehicle_id, timestamp: now, dismissed: false,
      });
    });

    // OVERDUE MAINTENANCE
    maintenance.filter((m) => m.status !== "completed" && new Date(m.scheduled_date) < now).forEach((m) => {
      const vehicle = vehicles.find((v) => v.id === m.vehicle_id);
      const daysOverdue = Math.floor((now.getTime() - new Date(m.scheduled_date).getTime()) / 86400000);
      result.push({
        id: `maint-${m.id}`, type: "maintenance",
        severity: daysOverdue > 7 ? "critical" : "warning",
        title: `Overdue: ${m.type.replace("_", " ")}`,
        details: `${vehicle?.vehicle_id || `Vehicle #${m.vehicle_id}`} — ${daysOverdue} days overdue`,
        entity: vehicle?.vehicle_id || "", timestamp: new Date(m.scheduled_date), dismissed: false,
      });
    });

    // DELAYED JOBS
    jobs.filter((j) => j.status === "in_progress" && j.eta && new Date(j.eta) < now).forEach((j) => {
      const minsLate = Math.round((now.getTime() - new Date(j.eta!).getTime()) / 60000);
      result.push({
        id: `delay-${j.id}`, type: "delay",
        severity: minsLate > 60 ? "critical" : "warning",
        title: `Delayed: ${j.reference}`,
        details: `${j.customer} — ${minsLate} minutes late (ETA was ${new Date(j.eta!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })})`,
        entity: j.reference, timestamp: new Date(j.eta!), dismissed: false,
      });
    });

    // DRIVER HOURS VIOLATIONS (> 9h today = EU driving time limit)
    drivers.filter((d) => (d.hours_today || 0) > 9).forEach((d) => {
      result.push({
        id: `hours-${d.id}`, type: "hours",
        severity: (d.hours_today || 0) > 10 ? "critical" : "warning",
        title: `Hours Limit: ${d.name}`,
        details: `${d.hours_today}h today — EU daily driving limit is 9h (max 10h twice/week)`,
        entity: d.name, timestamp: now, dismissed: false,
      });
    });

    // VEHICLES IN MAINTENANCE (info)
    vehicles.filter((v) => v.status === "maintenance").forEach((v) => {
      result.push({
        id: `safety-${v.id}`, type: "safety", severity: "info",
        title: `In Maintenance: ${v.vehicle_id}`,
        details: `${v.make} ${v.model} is currently unavailable`,
        entity: v.vehicle_id, timestamp: now, dismissed: false,
      });
    });

    return result.sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return (sev[a.severity] || 2) - (sev[b.severity] || 2);
    });
  }, [vehicles, drivers, jobs, maintenance, incidents, now]);

  // Filter
  const filtered = alerts.filter((a) => {
    if (dismissed.has(a.id)) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    return true;
  });

  const criticalCount = alerts.filter((a) => a.severity === "critical" && !dismissed.has(a.id)).length;
  const warningCount = alerts.filter((a) => a.severity === "warning" && !dismissed.has(a.id)).length;
  const infoCount = alerts.filter((a) => a.severity === "info" && !dismissed.has(a.id)).length;

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Alerts</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time safety & operational alerts</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDismissed(new Set())}>
            <RefreshCw className="w-4 h-4 mr-2" />Reset All
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className={`card-terminal p-4 ${criticalCount > 0 ? "border-red-500/30" : ""}`}>
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-500">Critical</span></div>
            <p className="text-2xl font-mono font-bold text-red-500">{criticalCount}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-xs text-muted-foreground">Warnings</span></div>
            <p className="text-2xl font-mono font-bold text-amber-500">{warningCount}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Bell className="w-4 h-4 text-blue-500" /><span className="text-xs text-muted-foreground">Info</span></div>
            <p className="text-2xl font-mono font-bold text-blue-500">{infoCount}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Check className="w-4 h-4 text-green-500" /><span className="text-xs text-muted-foreground">Dismissed</span></div>
            <p className="text-2xl font-mono font-bold text-green-500">{dismissed.size}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-36 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Severity</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="info">Info</SelectItem></SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 bg-muted/30"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="incident">Incidents</SelectItem><SelectItem value="fuel">Fuel</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="delay">Delays</SelectItem><SelectItem value="hours">Driver Hours</SelectItem><SelectItem value="safety">Safety</SelectItem></SelectContent>
          </Select>
        </div>

        {/* Alerts List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="card-terminal p-12 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-green-500/50" />
            <h3 className="text-lg font-semibold text-green-500 mb-2">All Clear</h3>
            <p className="text-muted-foreground">No active alerts. Your fleet is operating normally.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((alert) => {
              const cfg = severityConfig[alert.severity];
              const TypeIcon = typeIcons[alert.type] || AlertTriangle;
              return (
                <div key={alert.id} className={`card-terminal p-4 border ${cfg.color} flex items-start gap-4`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                    <TypeIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <h4 className="font-semibold text-sm">{alert.title}</h4>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.color}`}>{alert.severity}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.details}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {alert.link && (
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate(alert.link!)}>
                        <ExternalLink className="w-3 h-3 mr-1" />View
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
