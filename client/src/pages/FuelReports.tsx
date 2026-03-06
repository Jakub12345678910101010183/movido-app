/**
 * Fuel Reports Page — Fleet Fuel Cost Overview
 * Bloomberg/Terminal Noir style
 * Features:
 * - All driver fuel logs with cost/litres/type
 * - Filter by driver, fuel type, date range
 * - Aggregated totals per driver
 * - Cost per km metrics
 * - Export-ready table
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Fuel, Search, Filter, RefreshCw, Loader2,
  TrendingDown, Pound, Droplets, User, Truck,
  MapPin, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useFuelLogs } from "@/hooks/useSupabaseData";
import { useDrivers, useVehicles } from "@/hooks/useSupabaseData";
import type { FuelLog } from "@/lib/database.types";

// ============================================
// Fuel type config
// ============================================

const fuelTypeConfig: Record<string, { label: string; color: string }> = {
  diesel:  { label: "Diesel",  color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  adblue:  { label: "AdBlue",  color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  petrol:  { label: "Petrol",  color: "bg-green-500/20 text-green-400 border-green-500/30" },
  hvo:     { label: "HVO",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

// ============================================
// Component
// ============================================

export default function FuelReports() {
  const { fuelLogs, isLoading, refetch, totalLitres, totalCost } = useFuelLogs();
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();

  const [searchTerm, setSearchTerm] = useState("");
  const [driverFilter, setDriverFilter] = useState("all");
  const [fuelTypeFilter, setFuelTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"logs" | "summary">("logs");

  // ---- Helpers ----
  const getDriverName = (id: number | null) => drivers.find((d) => d.id === id)?.name || "Unknown";
  const getVehicleId = (id: number | null) => vehicles.find((v) => v.id === id)?.vehicle_id || "—";

  // ---- Filter ----
  const filtered = fuelLogs.filter((log) => {
    const s = searchTerm.toLowerCase();
    const matchSearch =
      !s ||
      getDriverName(log.driver_id).toLowerCase().includes(s) ||
      (log.station_name?.toLowerCase() || "").includes(s) ||
      getVehicleId(log.vehicle_id).toLowerCase().includes(s);
    const matchDriver = driverFilter === "all" || String(log.driver_id) === driverFilter;
    const matchType = fuelTypeFilter === "all" || log.fuel_type === fuelTypeFilter;
    return matchSearch && matchDriver && matchType;
  });

  const filteredTotal = filtered.reduce((s, l) => s + (l.fuel_amount || 0), 0);
  const filteredCost = filtered.reduce((s, l) => s + (l.fuel_cost || 0), 0);

  // ---- Per-driver summary ----
  const driverSummary = drivers
    .map((driver) => {
      const logs = fuelLogs.filter((l) => l.driver_id === driver.id);
      const litres = logs.reduce((s, l) => s + (l.fuel_amount || 0), 0);
      const cost = logs.reduce((s, l) => s + (l.fuel_cost || 0), 0);
      const fills = logs.length;
      return { driver, litres, cost, fills, avgCostPerFill: fills > 0 ? cost / fills : 0 };
    })
    .filter((d) => d.fills > 0)
    .sort((a, b) => b.cost - a.cost);

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Fuel className="w-6 h-6 text-cyan" />
              Fuel Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Fleet fuel consumption &amp; cost analysis
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1">
              <Droplets className="w-4 h-4 text-cyan" />
              <span className="text-xs text-muted-foreground">Total Litres</span>
            </div>
            <p className="text-2xl font-mono font-bold text-cyan">{totalLitres.toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">L</span></p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">Total Cost</span>
            </div>
            <p className="text-2xl font-mono font-bold text-amber-400">£{totalCost.toFixed(2)}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">Fill-ups</span>
            </div>
            <p className="text-2xl font-mono font-bold text-green-500">{fuelLogs.length}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Avg Cost/Fill</span>
            </div>
            <p className="text-2xl font-mono font-bold text-purple-400">
              £{fuelLogs.length > 0 ? (totalCost / fuelLogs.length).toFixed(2) : "0.00"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "logs" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("logs")}
          >
            <Fuel className="w-4 h-4 mr-2" />All Logs
          </Button>
          <Button
            variant={activeTab === "summary" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("summary")}
          >
            <User className="w-4 h-4 mr-2" />By Driver
          </Button>
        </div>

        {/* Filters (logs tab) */}
        {activeTab === "logs" && (
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search driver, station, vehicle..."
                className="pl-9 bg-muted/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-44 bg-muted/30">
                <User className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fuelTypeFilter} onValueChange={setFuelTypeFilter}>
              <SelectTrigger className="w-36 bg-muted/30">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Fuel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="diesel">Diesel</SelectItem>
                <SelectItem value="adblue">AdBlue</SelectItem>
                <SelectItem value="petrol">Petrol</SelectItem>
                <SelectItem value="hvo">HVO</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading fuel logs...</span>
          </div>
        )}

        {/* ========== LOGS TAB ========== */}
        {!isLoading && activeTab === "logs" && (
          <>
            {filtered.length === 0 ? (
              <div className="card-terminal p-12 text-center">
                <Fuel className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                <h3 className="text-lg font-semibold mb-2">No fuel logs</h3>
                <p className="text-sm text-muted-foreground">
                  Driver fuel logs will appear here in real-time from the Movido Driver App.
                </p>
              </div>
            ) : (
              <>
                {/* Filtered totals bar */}
                {(driverFilter !== "all" || fuelTypeFilter !== "all" || searchTerm) && (
                  <div className="flex items-center gap-6 mb-4 px-4 py-2 bg-muted/20 rounded-lg text-sm">
                    <span className="text-muted-foreground">Filtered:</span>
                    <span className="text-cyan font-mono">{filteredTotal.toFixed(0)}L</span>
                    <span className="text-amber-400 font-mono">£{filteredCost.toFixed(2)}</span>
                    <span className="text-muted-foreground">{filtered.length} records</span>
                  </div>
                )}

                <div className="card-terminal overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Date/Time</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Driver</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Vehicle</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Type</th>
                        <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Litres</th>
                        <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Cost</th>
                        <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Mileage</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Station</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((log) => {
                        const ft = fuelTypeConfig[log.fuel_type] || fuelTypeConfig.diesel;
                        return (
                          <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                <span className="font-mono">
                                  {new Date(log.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                  {" "}
                                  {new Date(log.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">{getDriverName(log.driver_id)}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-sm font-mono text-muted-foreground">{getVehicleId(log.vehicle_id)}</span>
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${ft.color}`}>
                                {ft.label}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-sm font-mono text-cyan">{log.fuel_amount?.toFixed(1)}L</span>
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-sm font-mono text-amber-400">
                                {log.fuel_cost ? `£${log.fuel_cost.toFixed(2)}` : "—"}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-sm font-mono text-muted-foreground">
                                {log.mileage ? `${log.mileage.toLocaleString()} mi` : "—"}
                              </span>
                            </td>
                            <td className="p-4">
                              {log.station_name ? (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate max-w-[140px]">{log.station_name}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Totals footer */}
                    <tfoot>
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={4} className="p-4 text-xs text-muted-foreground font-medium">
                          TOTAL ({filtered.length} records)
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-mono font-bold text-cyan">{filteredTotal.toFixed(1)}L</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-mono font-bold text-amber-400">£{filteredCost.toFixed(2)}</span>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ========== SUMMARY TAB ========== */}
        {!isLoading && activeTab === "summary" && (
          <>
            {driverSummary.length === 0 ? (
              <div className="card-terminal p-12 text-center">
                <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                <h3 className="text-lg font-semibold mb-2">No driver data yet</h3>
                <p className="text-sm text-muted-foreground">Fuel logs from drivers will appear here.</p>
              </div>
            ) : (
              <div className="card-terminal overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Driver</th>
                      <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Fill-ups</th>
                      <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Total Litres</th>
                      <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Total Cost</th>
                      <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Avg/Fill</th>
                      <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Cost Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverSummary.map(({ driver, litres, cost, fills, avgCostPerFill }) => {
                      const maxCost = driverSummary[0]?.cost || 1;
                      const barPct = Math.round((cost / maxCost) * 100);
                      return (
                        <tr key={driver.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center">
                                <User className="w-3 h-3" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{driver.name}</p>
                                <p className="text-xs text-muted-foreground">{driver.status.replace("_", " ")}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-sm font-mono">{fills}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-sm font-mono text-cyan">{litres.toFixed(1)}L</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-sm font-mono font-bold text-amber-400">£{cost.toFixed(2)}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-sm font-mono text-muted-foreground">£{avgCostPerFill.toFixed(2)}</span>
                          </td>
                          <td className="p-4">
                            <div className="w-full bg-muted/30 rounded-full h-2 max-w-[120px]">
                              <div
                                className="h-2 rounded-full bg-amber-500/70"
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td className="p-4 text-xs text-muted-foreground font-medium">
                        FLEET TOTAL ({driverSummary.length} drivers)
                      </td>
                      <td className="p-4 text-right text-sm font-mono">
                        {driverSummary.reduce((s, d) => s + d.fills, 0)}
                      </td>
                      <td className="p-4 text-right text-sm font-mono font-bold text-cyan">
                        {totalLitres.toFixed(1)}L
                      </td>
                      <td className="p-4 text-right text-sm font-mono font-bold text-amber-400">
                        £{totalCost.toFixed(2)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
