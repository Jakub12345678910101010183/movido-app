/**
 * Fleet Maintenance Page — Service Tracking & Predictive Alerts
 * Terminal Noir style, Supabase data
 */

import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Search, Filter, Wrench, Calendar, Truck, AlertTriangle,
  Check, Clock, RefreshCw, Loader2, ChevronRight, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useVehicles, useMaintenance } from "@/hooks/useSupabaseData";
import { supabase } from "@/lib/supabase";
import type { FleetMaintenance } from "@/lib/database.types";

const typeColors: Record<string, string> = {
  oil_change: "bg-amber-500/20 text-amber-400",
  tyre_check: "bg-blue-500/20 text-blue-400",
  brake_inspection: "bg-red-500/20 text-red-400",
  mot: "bg-green-500/20 text-green-400",
  full_service: "bg-purple-500/20 text-purple-400",
  tachograph: "bg-cyan-500/20 text-cyan-400",
  other: "bg-gray-500/20 text-gray-400",
};

const typeLabels: Record<string, string> = {
  oil_change: "Oil Change", tyre_check: "Tyre Check", brake_inspection: "Brake Inspection",
  mot: "MOT Test", full_service: "Full Service", tachograph: "Tachograph Calibration", other: "Other",
};

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  overdue: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface MaintenanceFormData {
  vehicle_id: string;
  type: string;
  description: string;
  scheduled_date: string;
  cost: string;
}

const defaultForm: MaintenanceFormData = {
  vehicle_id: "", type: "full_service", description: "", scheduled_date: "", cost: "",
};

export default function Maintenance() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState<MaintenanceFormData>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { vehicles } = useVehicles();
  const { maintenance, isLoading, refetch } = useMaintenance();

  // Enrich maintenance with vehicle info and overdue status
  const enriched = useMemo(() => {
    return maintenance.map((m) => {
      const vehicle = vehicles.find((v) => v.id === m.vehicle_id);
      const isOverdue = !m.completed_date && new Date(m.scheduled_date) < new Date();
      return { ...m, vehicle, computedStatus: m.status === "scheduled" && isOverdue ? "overdue" : m.status };
    });
  }, [maintenance, vehicles]);

  const filtered = enriched.filter((m) => {
    const matchesStatus = statusFilter === "all" || m.computedStatus === statusFilter;
    const matchesSearch = !searchTerm ||
      m.vehicle?.vehicle_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.type.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Stats
  const overdueCount = enriched.filter((m) => m.computedStatus === "overdue").length;
  const scheduledCount = enriched.filter((m) => m.computedStatus === "scheduled").length;
  const completedCount = enriched.filter((m) => m.status === "completed").length;
  const upcomingWeek = enriched.filter((m) => {
    if (m.status === "completed") return false;
    const d = new Date(m.scheduled_date);
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d >= now && d <= week;
  }).length;

  const handleAdd = async () => {
    if (!formData.vehicle_id || !formData.scheduled_date) {
      toast.error("Vehicle and date are required"); return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from("fleet_maintenance").insert({
        vehicle_id: parseInt(formData.vehicle_id),
        type: formData.type,
        description: formData.description || null,
        scheduled_date: new Date(formData.scheduled_date).toISOString(),
        cost: formData.cost ? parseFloat(formData.cost) : null,
        status: "scheduled",
      });
      if (error) throw error;
      setShowAddModal(false); setFormData(defaultForm); refetch();
      toast.success("Maintenance scheduled");
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
    finally { setIsSaving(false); }
  };

  const markComplete = async (id: number) => {
    const { error } = await supabase.from("fleet_maintenance")
      .update({ status: "completed", completed_date: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Failed"); return; }
    refetch(); toast.success("Marked as complete");
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Fleet Maintenance</h1>
            <p className="text-sm text-muted-foreground mt-1">Service scheduling & predictive alerts</p>
          </div>
          <Button className="glow-cyan-sm" onClick={() => { setFormData(defaultForm); setShowAddModal(true); }}>
            <Plus className="w-4 h-4 mr-2" />Schedule Service
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-blue-500" /><span className="text-xs text-muted-foreground">Scheduled</span></div>
            <p className="text-2xl font-mono font-bold text-blue-500">{scheduledCount}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-amber-500" /><span className="text-xs text-muted-foreground">Due This Week</span></div>
            <p className="text-2xl font-mono font-bold text-amber-500">{upcomingWeek}</p>
          </div>
          <div className={`card-terminal p-4 ${overdueCount > 0 ? "border-red-500/30" : ""}`}>
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-500">Overdue</span></div>
            <p className="text-2xl font-mono font-bold text-red-500">{overdueCount}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Check className="w-4 h-4 text-green-500" /><span className="text-xs text-muted-foreground">Completed</span></div>
            <p className="text-2xl font-mono font-bold text-green-500">{completedCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search vehicle, type..." className="pl-9 bg-muted/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {/* Loading */}
        {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}

        {/* Empty */}
        {!isLoading && maintenance.length === 0 && (
          <div className="card-terminal p-12 text-center"><Wrench className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-2">No maintenance records</h3><p className="text-muted-foreground mb-4">Schedule your first service to start tracking</p><Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4 mr-2" />Schedule Service</Button></div>
        )}

        {/* Table */}
        {!isLoading && filtered.length > 0 && (
          <div className="card-terminal overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Vehicle</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Scheduled</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Cost</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-primary" />
                        <span className="font-mono text-sm text-primary">{m.vehicle?.vehicle_id || `#${m.vehicle_id}`}</span>
                      </div>
                    </td>
                    <td className="p-4"><span className={`text-xs px-2 py-1 rounded ${typeColors[m.type] || typeColors.other}`}>{typeLabels[m.type] || m.type}</span></td>
                    <td className="p-4"><span className="text-sm text-muted-foreground truncate max-w-[200px] block">{m.description || "—"}</span></td>
                    <td className="p-4"><span className="font-mono text-sm">{new Date(m.scheduled_date).toLocaleDateString("en-GB")}</span></td>
                    <td className="p-4"><span className={`text-xs px-2 py-1 rounded-full border ${statusColors[m.computedStatus] || statusColors.scheduled}`}>{m.computedStatus}</span></td>
                    <td className="p-4"><span className="font-mono text-sm">{m.cost ? `£${m.cost}` : "—"}</span></td>
                    <td className="p-4 text-right">
                      {m.status !== "completed" && (
                        <Button variant="outline" size="sm" onClick={() => markComplete(m.id)}>
                          <Check className="w-3 h-3 mr-1" />Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader><DialogTitle>Schedule Maintenance</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div><Label>Vehicle *</Label>
                <Select value={formData.vehicle_id} onValueChange={(v) => setFormData({ ...formData, vehicle_id: v })}>
                  <SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id.toString()}>{v.vehicle_id} — {v.make} {v.model}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Service Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oil_change">Oil Change</SelectItem>
                    <SelectItem value="tyre_check">Tyre Check</SelectItem>
                    <SelectItem value="brake_inspection">Brake Inspection</SelectItem>
                    <SelectItem value="mot">MOT Test</SelectItem>
                    <SelectItem value="full_service">Full Service</SelectItem>
                    <SelectItem value="tachograph">Tachograph Calibration</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Scheduled Date *</Label><Input className="mt-1.5 bg-muted/30" type="date" value={formData.scheduled_date} onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })} /></div>
              <div><Label>Estimated Cost (£)</Label><Input className="mt-1.5 bg-muted/30" type="number" step="0.01" placeholder="e.g., 450" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea className="mt-1.5 bg-muted/30" placeholder="Service notes..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Schedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
