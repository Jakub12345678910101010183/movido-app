/**
 * Fleet Page - Vehicle Management with Cards
 * Bloomberg/Fintech style with Supabase CRUD + realtime
 * MIGRATED: tRPC → useVehicles() Supabase hook
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, Edit, Trash2, MapPin, Gauge, Weight, Ruler, ArrowUpRight, Fuel, Calendar, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVehicles } from "@/hooks/useSupabaseData";
import type { Vehicle } from "@/lib/database.types";

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-500 border-green-500/30",
  idle: "bg-amber-500/20 text-amber-500 border-amber-500/30",
  maintenance: "bg-blue-500/20 text-blue-500 border-blue-500/30",
  offline: "bg-red-500/20 text-red-500 border-red-500/30",
};

interface VehicleFormData {
  vehicle_id: string;
  type: "hgv" | "lgv" | "van";
  make: string;
  model: string;
  registration: string;
  status: "active" | "idle" | "maintenance" | "offline";
  height: string;
  width: string;
  weight: string;
  current_location: string;
  fuel_level: number;
  mileage: number;
}

const defaultFormData: VehicleFormData = {
  vehicle_id: "", type: "hgv", make: "", model: "", registration: "",
  status: "idle", height: "4.0", width: "2.55", weight: "15",
  current_location: "Depot", fuel_level: 100, mileage: 0,
};

export default function Fleet() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [formData, setFormData] = useState<VehicleFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);

  // Supabase hook (replaces tRPC)
  const { vehicles, isLoading, refetch, create, update, remove } = useVehicles();

  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.vehicle_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.make?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (v.registration?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    const matchesType = typeFilter === "all" || v.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleAddVehicle = async () => {
    if (!formData.vehicle_id) { toast.error("Vehicle ID is required"); return; }
    setIsSaving(true);
    try {
      await create({
        vehicle_id: formData.vehicle_id, type: formData.type,
        make: formData.make || null, model: formData.model || null,
        registration: formData.registration || null, status: formData.status,
        height: formData.height ? parseFloat(formData.height) : null,
        width: formData.width ? parseFloat(formData.width) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        current_location: formData.current_location || null,
        fuel_level: formData.fuel_level, mileage: formData.mileage,
      });
      setShowAddModal(false);
      setFormData(defaultFormData);
      toast.success("Vehicle added successfully");
    } catch (err: any) {
      toast.error(`Failed to add vehicle: ${err.message}`);
    } finally { setIsSaving(false); }
  };

  const handleEditVehicle = async () => {
    if (!selectedVehicleId) return;
    setIsSaving(true);
    try {
      await update(selectedVehicleId, {
        vehicle_id: formData.vehicle_id, type: formData.type,
        make: formData.make || null, model: formData.model || null,
        registration: formData.registration || null, status: formData.status,
        height: formData.height ? parseFloat(formData.height) : null,
        width: formData.width ? parseFloat(formData.width) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        current_location: formData.current_location || null,
        fuel_level: formData.fuel_level, mileage: formData.mileage,
      });
      setShowEditModal(false); setSelectedVehicleId(null); setFormData(defaultFormData);
      toast.success("Vehicle updated successfully");
    } catch (err: any) {
      toast.error(`Failed to update vehicle: ${err.message}`);
    } finally { setIsSaving(false); }
  };

  const handleDeleteVehicle = async () => {
    if (!selectedVehicleId) return;
    setIsSaving(true);
    try {
      await remove(selectedVehicleId);
      setShowDeleteModal(false); setSelectedVehicleId(null);
      toast.success("Vehicle removed successfully");
    } catch (err: any) {
      toast.error(`Failed to delete vehicle: ${err.message}`);
    } finally { setIsSaving(false); }
  };

  const openEditModal = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setFormData({
      vehicle_id: vehicle.vehicle_id, type: vehicle.type, make: vehicle.make || "",
      model: vehicle.model || "", registration: vehicle.registration || "", status: vehicle.status,
      height: vehicle.height?.toString() || "4.0", width: vehicle.width?.toString() || "2.55",
      weight: vehicle.weight?.toString() || "15", current_location: vehicle.current_location || "",
      fuel_level: vehicle.fuel_level ?? 100, mileage: vehicle.mileage ?? 0,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (vehicle: Vehicle) => { setSelectedVehicleId(vehicle.id); setShowDeleteModal(true); };
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  // Shared form JSX
  const renderForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Vehicle ID *</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., HGV-007" value={formData.vehicle_id} onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })} /></div>
        <div><Label>Type</Label><Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as any })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hgv">HGV</SelectItem><SelectItem value="lgv">LGV</SelectItem><SelectItem value="van">Van</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Make</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., Volvo" value={formData.make} onChange={(e) => setFormData({ ...formData, make: e.target.value })} /></div>
        <div><Label>Model</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., FH16" value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Registration</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., AB21 XYZ" value={formData.registration} onChange={(e) => setFormData({ ...formData, registration: e.target.value })} /></div>
        <div><Label>Status</Label><Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as any })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="idle">Idle</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="offline">Offline</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Height (m)</Label><Input className="mt-1.5 bg-muted/30" type="number" step="0.1" value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} /></div>
        <div><Label>Width (m)</Label><Input className="mt-1.5 bg-muted/30" type="number" step="0.1" value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} /></div>
        <div><Label>Weight (t)</Label><Input className="mt-1.5 bg-muted/30" type="number" step="0.5" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} /></div>
      </div>
      <div><Label>Current Location</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., London Depot" value={formData.current_location} onChange={(e) => setFormData({ ...formData, current_location: e.target.value })} /></div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Fleet Management</h1><p className="text-sm text-muted-foreground mt-1">Monitor and manage your vehicle fleet</p></div>
          <Button className="glow-cyan-sm" onClick={() => { setFormData(defaultFormData); setShowAddModal(true); }}><Plus className="w-4 h-4 mr-2" />Add Vehicle</Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search by ID, make, registration..." className="pl-9 bg-muted/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="idle">Idle</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="offline">Offline</SelectItem></SelectContent></Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-40 bg-muted/30"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="hgv">HGV</SelectItem><SelectItem value="lgv">LGV</SelectItem><SelectItem value="van">Van</SelectItem></SelectContent></Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Total Vehicles</p><p className="text-2xl font-mono font-bold text-cyan">{vehicles.length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Active</p><p className="text-2xl font-mono font-bold text-green-500">{vehicles.filter(v => v.status === "active").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">In Maintenance</p><p className="text-2xl font-mono font-bold text-blue-500">{vehicles.filter(v => v.status === "maintenance").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Avg. Fuel Level</p><p className="text-2xl font-mono font-bold text-amber-500">{vehicles.length > 0 ? Math.round(vehicles.reduce((a, v) => a + (v.fuel_level ?? 0), 0) / vehicles.length) : 0}%</p></div>
        </div>

        {/* Loading */}
        {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Loading vehicles...</span></div>}

        {/* Empty */}
        {!isLoading && vehicles.length === 0 && (
          <div className="card-terminal p-12 text-center"><Gauge className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-2">No vehicles yet</h3><p className="text-muted-foreground mb-4">Add your first vehicle to start managing your fleet</p><Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4 mr-2" />Add Vehicle</Button></div>
        )}

        {/* Vehicle Cards */}
        {!isLoading && vehicles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVehicles.map((vehicle) => (
              <div key={vehicle.id} className="card-terminal p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div><h3 className="font-mono font-bold text-primary text-lg">{vehicle.vehicle_id}</h3><p className="text-sm text-muted-foreground">{vehicle.make} {vehicle.model}</p></div>
                  <span className={`text-xs px-2 py-1 rounded-full border ${statusColors[vehicle.status] || ""}`}>{vehicle.status}</span>
                </div>
                {vehicle.current_location && <div className="flex items-center gap-2 mb-4 text-sm"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground truncate">{vehicle.current_location}</span></div>}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-muted/30 rounded p-2 text-center"><ArrowUpRight className="w-3 h-3 mx-auto mb-1 text-muted-foreground" /><p className="text-xs text-muted-foreground">Height</p><p className="font-mono font-bold text-sm">{vehicle.height || "-"}m</p></div>
                  <div className="bg-muted/30 rounded p-2 text-center"><Ruler className="w-3 h-3 mx-auto mb-1 text-muted-foreground" /><p className="text-xs text-muted-foreground">Width</p><p className="font-mono font-bold text-sm">{vehicle.width || "-"}m</p></div>
                  <div className="bg-muted/30 rounded p-2 text-center"><Weight className="w-3 h-3 mx-auto mb-1 text-muted-foreground" /><p className="text-xs text-muted-foreground">Weight</p><p className="font-mono font-bold text-sm">{vehicle.weight || "-"}t</p></div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <div className="flex items-center gap-1"><Fuel className="w-3 h-3" /><span className={vehicle.fuel_level < 20 ? "text-red-500" : ""}>{vehicle.fuel_level}%</span></div>
                  <div className="flex items-center gap-1"><Gauge className="w-3 h-3" /><span>{(vehicle.mileage / 1000).toFixed(0)}k mi</span></div>
                  {vehicle.next_service_date && <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /><span>{new Date(vehicle.next_service_date).toLocaleDateString()}</span></div>}
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditModal(vehicle)}><Edit className="w-3 h-3 mr-1" />Edit</Button>
                  <Button variant="outline" size="icon" className="text-red-500 hover:text-red-400 hover:border-red-500/50" onClick={() => openDeleteModal(vehicle)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}><DialogContent className="bg-card border-border max-w-lg"><DialogHeader><DialogTitle>Add New Vehicle</DialogTitle></DialogHeader>{renderForm()}<DialogFooter><Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button><Button onClick={handleAddVehicle} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add Vehicle</Button></DialogFooter></DialogContent></Dialog>

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}><DialogContent className="bg-card border-border max-w-lg"><DialogHeader><DialogTitle>Edit Vehicle</DialogTitle></DialogHeader>{renderForm()}<DialogFooter><Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button><Button onClick={handleEditVehicle} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes</Button></DialogFooter></DialogContent></Dialog>

        {/* Delete Modal */}
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}><DialogContent className="bg-card border-border max-w-md"><DialogHeader><DialogTitle>Delete Vehicle</DialogTitle></DialogHeader><p className="text-muted-foreground">Are you sure you want to delete <strong className="text-foreground">{selectedVehicle?.vehicle_id}</strong>? This action cannot be undone.</p><DialogFooter><Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="destructive" onClick={handleDeleteVehicle} disabled={isSaving}>{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Delete</Button></DialogFooter></DialogContent></Dialog>
      </div>
    </DashboardLayout>
  );
}
