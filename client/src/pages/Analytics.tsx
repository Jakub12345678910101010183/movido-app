/**
 * Analytics Page — Fleet Analytics with Recharts
 * Computes stats from Supabase data (vehicles, drivers, jobs)
 * Bloomberg Terminal Noir style
 */

import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3, TrendingUp, Clock, Calendar, Download, RefreshCw,
  ArrowUpRight, ArrowDownRight, Loader2,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart,
} from "recharts";
import { useVehicles, useDrivers, useJobs, useMaintenance } from "@/hooks/useSupabaseData";

const COLORS = ["#00FFD4", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("week");
  const { vehicles, isLoading: vLoading } = useVehicles();
  const { drivers, isLoading: dLoading } = useDrivers();
  const { jobs, isLoading: jLoading, refetch } = useJobs();
  const { maintenance } = useMaintenance();

  const isLoading = vLoading || dLoading || jLoading;

  // ============================================
  // Computed KPIs
  // ============================================

  const kpis = useMemo(() => {
    const activeVehicles = vehicles.filter((v) => v.status === "active").length;
    const utilization = vehicles.length > 0 ? Math.round((activeVehicles / vehicles.length) * 100) : 0;
    const avgFuel = vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + (v.fuel_level || 0), 0) / vehicles.length) : 0;
    const completedJobs = jobs.filter((j) => j.status === "completed").length;
    const totalJobs = jobs.length;
    const onTimeRate = totalJobs > 0 ? Math.round((completedJobs / Math.max(totalJobs, 1)) * 100) : 0;
    const totalMileage = vehicles.reduce((s, v) => s + (v.mileage || 0), 0);

    return { utilization, avgFuel, onTimeRate, totalMileage, completedJobs, totalJobs, activeVehicles };
  }, [vehicles, jobs]);

  // ============================================
  // Chart Data (computed from real data)
  // ============================================

  // Vehicle type distribution
  const vehicleDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    vehicles.forEach((v) => { const t = v.type || "other"; counts[t] = (counts[t] || 0) + 1; });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.toUpperCase(), value, color: COLORS[i % COLORS.length],
    }));
  }, [vehicles]);

  // Job status distribution
  const jobStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({ status: status.replace("_", " "), count }));
  }, [jobs]);

  // Driver performance
  const driverPerformance = useMemo(() => {
    return drivers
      .map((d) => {
        const driverJobs = jobs.filter((j) => j.driver_id === d.id);
        const completed = driverJobs.filter((j) => j.status === "completed").length;
        return {
          name: d.name, deliveries: completed,
          rating: d.rating || 0, hoursToday: d.hours_today || 0,
          status: d.status,
        };
      })
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 8);
  }, [drivers, jobs]);

  // Jobs by priority
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => { counts[j.priority] = (counts[j.priority] || 0) + 1; });
    return Object.entries(counts).map(([priority, count]) => ({ priority, count }));
  }, [jobs]);

  // Fuel levels per vehicle
  const fuelLevels = useMemo(() => {
    return vehicles
      .filter((v) => v.fuel_level != null)
      .map((v) => ({ vehicle: v.vehicle_id, fuel: v.fuel_level || 0, mileage: Math.round((v.mileage || 0) / 1000) }))
      .slice(0, 10);
  }, [vehicles]);

  // Maintenance by type
  const maintenanceByType = useMemo(() => {
    const counts: Record<string, number> = {};
    maintenance.forEach((m) => { counts[m.type] = (counts[m.type] || 0) + 1; });
    return Object.entries(counts).map(([type, count], i) => ({
      type: type.replace("_", " "), count, color: COLORS[i % COLORS.length],
    }));
  }, [maintenance]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-semibold mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-xs" style={{ color: entry.color }}>{entry.name}: {entry.value}</p>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Fleet Analytics</h1><p className="text-sm text-muted-foreground mt-1">Live metrics from Supabase</p></div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36 bg-muted/30"><Calendar className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="day">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">Fleet Utilization</span>
              <div className="flex items-center gap-1 text-green-500 text-xs"><ArrowUpRight className="w-3 h-3" />{kpis.activeVehicles} active</div>
            </div>
            <p className="text-2xl font-mono font-bold text-cyan">{kpis.utilization}%</p>
            <p className="text-xs text-muted-foreground mt-1">{kpis.activeVehicles}/{vehicles.length} vehicles</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">Avg Fuel Level</span></div>
            <p className={`text-2xl font-mono font-bold ${kpis.avgFuel < 30 ? "text-red-500" : "text-cyan"}`}>{kpis.avgFuel}%</p>
            <p className="text-xs text-muted-foreground mt-1">Fleet average</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">Completed Jobs</span></div>
            <p className="text-2xl font-mono font-bold text-cyan">{kpis.completedJobs}</p>
            <p className="text-xs text-muted-foreground mt-1">of {kpis.totalJobs} total</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">Total Mileage</span></div>
            <p className="text-2xl font-mono font-bold text-cyan">{(kpis.totalMileage / 1000).toFixed(1)}k</p>
            <p className="text-xs text-muted-foreground mt-1">miles across fleet</p>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Job Status */}
          <div className="card-terminal p-4">
            <h3 className="font-semibold mb-4">Job Status Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobStatusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="status" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#00FFD4" radius={[4, 4, 0, 0]} name="Jobs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fuel Levels per Vehicle */}
          <div className="card-terminal p-4">
            <h3 className="font-semibold mb-4">Vehicle Fuel Levels</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fuelLevels}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="vehicle" stroke="#666" fontSize={10} angle={-30} textAnchor="end" height={50} />
                  <YAxis stroke="#666" fontSize={11} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="fuel" name="Fuel %" radius={[4, 4, 0, 0]}>
                    {fuelLevels.map((entry, i) => (
                      <Cell key={i} fill={entry.fuel < 20 ? "#EF4444" : entry.fuel < 50 ? "#F59E0B" : "#00FFD4"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Vehicle Distribution Pie */}
          <div className="card-terminal p-4">
            <h3 className="font-semibold mb-4">Vehicle Types</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vehicleDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value">
                    {vehicleDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {vehicleDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-xs text-muted-foreground">{item.name} ({item.value})</span></div>
              ))}
            </div>
          </div>

          {/* Priority Distribution */}
          <div className="card-terminal p-4">
            <h3 className="font-semibold mb-4">Jobs by Priority</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="priority" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Jobs" radius={[4, 4, 0, 0]}>
                    {priorityData.map((_, i) => <Cell key={i} fill={["#666", "#3B82F6", "#F59E0B", "#EF4444"][i] || "#00FFD4"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Maintenance Types */}
          <div className="card-terminal p-4">
            <h3 className="font-semibold mb-4">Maintenance Types</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={maintenanceByType} cx="50%" cy="50%" outerRadius={65} dataKey="count">
                    {maintenanceByType.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {maintenanceByType.map((item) => (
                <div key={item.type} className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-xs text-muted-foreground">{item.type}</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* Driver Performance Table */}
        <div className="card-terminal p-4">
          <h3 className="font-semibold mb-4">Driver Performance</h3>
          {driverPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No driver data available</p>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground">#</th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Driver</th>
                <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Deliveries</th>
                <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Rating</th>
                <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Hours Today</th>
                <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Performance</th>
              </tr></thead>
              <tbody>
                {driverPerformance.map((d, i) => (
                  <tr key={d.name} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3"><span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{i + 1}</span></td>
                    <td className="p-3 font-medium">{d.name}</td>
                    <td className="p-3 text-center font-mono">{d.deliveries}</td>
                    <td className="p-3 text-center text-amber-500">★ {d.rating.toFixed(1)}</td>
                    <td className="p-3 text-center font-mono">{d.hoursToday}h</td>
                    <td className="p-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${
                      d.status === "on_duty" ? "bg-green-500/20 text-green-400" :
                      d.status === "available" ? "bg-cyan-500/20 text-cyan-400" : "bg-gray-500/20 text-gray-400"
                    }`}>{d.status?.replace("_", " ")}</span></td>
                    <td className="p-3 text-right"><div className="w-full bg-muted/30 rounded-full h-2"><div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min((d.deliveries / 20) * 100, 100)}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
