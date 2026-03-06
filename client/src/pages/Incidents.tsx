/**
 * Incidents Page — Driver Incident Report Viewer
 * Bloomberg/Terminal Noir style
 * Features:
 * - Real-time incident feed from drivers (accident, near_miss, vehicle_damage, etc.)
 * - Filter by type, status
 * - Update incident status (reported → investigating → closed)
 * - View photos from driver app
 * - See linked job, driver, vehicle
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertTriangle, Search, Filter, RefreshCw, Loader2,
  CheckCircle, Clock, Eye, Trash2, Car, Package,
  Shield, MapPin, User, Truck, Camera, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { useIncidents } from "@/hooks/useSupabaseData";
import { useDrivers } from "@/hooks/useSupabaseData";
import { useVehicles } from "@/hooks/useSupabaseData";
import type { Incident } from "@/lib/database.types";

// ============================================
// Config
// ============================================

const incidentTypeConfig: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  accident:       { label: "Accident",        color: "bg-red-500/20 text-red-400 border-red-500/30",    icon: Car },
  near_miss:      { label: "Near Miss",       color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  vehicle_damage: { label: "Vehicle Damage",  color: "bg-amber-500/20 text-amber-400 border-amber-500/30",   icon: Truck },
  load_damage:    { label: "Load Damage",     color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Package },
  theft:          { label: "Theft",           color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Shield },
  other:          { label: "Other",           color: "bg-gray-500/20 text-gray-400 border-gray-500/30",       icon: AlertTriangle },
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  reported:     { label: "Reported",     color: "bg-red-500/20 text-red-400 border-red-500/30",    icon: AlertTriangle },
  investigating:{ label: "Investigating",color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  closed:       { label: "Closed",       color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle },
};

// ============================================
// Component
// ============================================

export default function Incidents() {
  const { incidents, isLoading, refetch, updateStatus, remove } = useIncidents();
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);

  // ---- Helpers ----
  const getDriverName = (id: number | null) => drivers.find((d) => d.id === id)?.name || "Unknown";
  const getVehicleReg = (id: number | null) => vehicles.find((v) => v.id === id)?.registration || "Unknown";
  const getVehicleId = (id: number | null) => vehicles.find((v) => v.id === id)?.vehicle_id || "—";

  // ---- Filters ----
  const filtered = incidents.filter((inc) => {
    const s = searchTerm.toLowerCase();
    const matchSearch =
      !s ||
      getDriverName(inc.driver_id).toLowerCase().includes(s) ||
      (inc.description?.toLowerCase() || "").includes(s) ||
      (inc.location_address?.toLowerCase() || "").includes(s) ||
      inc.incident_type.includes(s);
    const matchType = typeFilter === "all" || inc.incident_type === typeFilter;
    const matchStatus = statusFilter === "all" || inc.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  // ---- Stats ----
  const stats = {
    total: incidents.length,
    reported: incidents.filter((i) => i.status === "reported").length,
    investigating: incidents.filter((i) => i.status === "investigating").length,
    closed: incidents.filter((i) => i.status === "closed").length,
    withPolice: incidents.filter((i) => i.reported_to_police).length,
  };

  // ---- Actions ----
  const handleStatusChange = async (id: number, status: Incident["status"]) => {
    setUpdating(id);
    try {
      await updateStatus(id, status);
      toast.success(`Incident status → ${statusConfig[status].label}`);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await remove(deletingId);
      setShowDeleteModal(false);
      setDeletingId(null);
      toast.success("Incident deleted");
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const openView = (inc: Incident) => {
    setSelectedIncident(inc);
    setShowViewModal(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              Incident Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time driver incident reports — accidents, near misses &amp; damage
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="text-2xl font-mono font-bold text-cyan">{stats.total}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">🔴 Reported</p>
            <p className="text-2xl font-mono font-bold text-red-500">{stats.reported}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">🟡 Investigating</p>
            <p className="text-2xl font-mono font-bold text-amber-500">{stats.investigating}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">✅ Closed</p>
            <p className="text-2xl font-mono font-bold text-green-500">{stats.closed}</p>
          </div>
          <div className="card-terminal p-4">
            <p className="text-xs text-muted-foreground mb-1">🚔 Police Ref</p>
            <p className="text-2xl font-mono font-bold text-purple-400">{stats.withPolice}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search driver, description, location..."
              className="pl-9 bg-muted/30"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44 bg-muted/30">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(incidentTypeConfig).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 bg-muted/30">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="reported">Reported</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading incidents...</span>
          </div>
        )}

        {/* Empty */}
        {!isLoading && incidents.length === 0 && (
          <div className="card-terminal p-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <h3 className="text-lg font-semibold mb-2">No incidents reported</h3>
            <p className="text-muted-foreground text-sm">
              Driver incident reports will appear here in real-time from the Movido Driver App.
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && filtered.length > 0 && (
          <div className="card-terminal overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Date/Time</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Type</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Driver</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Vehicle</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Location</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Flags</th>
                  <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc) => {
                  const typeCfg = incidentTypeConfig[inc.incident_type] || incidentTypeConfig.other;
                  const TypeIcon = typeCfg.icon;
                  const stCfg = statusConfig[inc.status] || statusConfig.reported;
                  const StatusIcon = stCfg.icon;

                  return (
                    <tr key={inc.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <span className="text-xs font-mono text-muted-foreground">
                          {new Date(inc.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                        <br />
                        <span className="text-xs font-mono">
                          {new Date(inc.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${typeCfg.color}`}>
                          <TypeIcon className="w-3 h-3" />
                          {typeCfg.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm">{getDriverName(inc.driver_id)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-mono text-muted-foreground">{getVehicleId(inc.vehicle_id)}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[160px]">
                            {inc.location_address || (inc.location_lat ? `${inc.location_lat?.toFixed(4)}, ${inc.location_lng?.toFixed(4)}` : "—")}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Select
                          value={inc.status}
                          onValueChange={(v) => handleStatusChange(inc.id, v as Incident["status"])}
                          disabled={updating === inc.id}
                        >
                          <SelectTrigger className={`h-7 text-xs w-36 border ${stCfg.color}`}>
                            {updating === inc.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <span className="flex items-center gap-1">
                                <StatusIcon className="w-3 h-3" />
                                {stCfg.label}
                              </span>
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reported">Reported</SelectItem>
                            <SelectItem value="investigating">Investigating</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-0.5">
                          {inc.third_party_involved && (
                            <span className="text-xs text-orange-400">👥 3rd Party</span>
                          )}
                          {inc.reported_to_police && (
                            <span className="text-xs text-purple-400">🚔 Police</span>
                          )}
                          {inc.photos?.length > 0 && (
                            <span className="text-xs text-blue-400">
                              <Camera className="w-3 h-3 inline mr-0.5" />{inc.photos.length} photo{inc.photos.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openView(inc)}>
                            <Eye className="w-3 h-3 mr-1" />View
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-red-500 hover:text-red-400 hover:border-red-500/50"
                            onClick={() => { setDeletingId(inc.id); setShowDeleteModal(true); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No results (filtered) */}
        {!isLoading && incidents.length > 0 && filtered.length === 0 && (
          <div className="card-terminal p-8 text-center">
            <Search className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No incidents match your filters</p>
          </div>
        )}

        {/* ========== VIEW MODAL ========== */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedIncident && (() => {
                  const cfg = incidentTypeConfig[selectedIncident.incident_type] || incidentTypeConfig.other;
                  const Icon = cfg.icon;
                  return (
                    <>
                      <Icon className="w-5 h-5" />
                      {cfg.label} — {new Date(selectedIncident.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
                    </>
                  );
                })()}
              </DialogTitle>
            </DialogHeader>

            {selectedIncident && (
              <div className="space-y-4 py-2">
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Driver</p>
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      <span className="text-sm font-medium">{getDriverName(selectedIncident.driver_id)}</span>
                    </div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Vehicle</p>
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3 h-3" />
                      <span className="text-sm font-medium">
                        {getVehicleId(selectedIncident.vehicle_id)} — {getVehicleReg(selectedIncident.vehicle_id)}
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Location</p>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      <span className="text-sm">
                        {selectedIncident.location_address || (
                          selectedIncident.location_lat
                            ? `${selectedIncident.location_lat.toFixed(5)}, ${selectedIncident.location_lng?.toFixed(5)}`
                            : "Location not available"
                        )}
                      </span>
                    </div>
                    {selectedIncident.location_lat && (
                      <a
                        href={`https://www.google.com/maps?q=${selectedIncident.location_lat},${selectedIncident.location_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        Open in Google Maps →
                      </a>
                    )}
                  </div>
                </div>

                {/* Description */}
                {selectedIncident.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Description</p>
                    <p className="text-sm bg-muted/20 rounded-lg p-3 leading-relaxed">{selectedIncident.description}</p>
                  </div>
                )}

                {/* Flags */}
                <div className="flex flex-wrap gap-2">
                  {selectedIncident.third_party_involved && (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      👥 Third party involved
                    </span>
                  )}
                  {selectedIncident.reported_to_police && (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      🚔 Reported to police
                    </span>
                  )}
                  {selectedIncident.police_reference && (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      <Phone className="w-3 h-3" />
                      Ref: {selectedIncident.police_reference}
                    </span>
                  )}
                </div>

                {/* Photos */}
                {selectedIncident.photos && selectedIncident.photos.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Camera className="w-3 h-3" /> Photos ({selectedIncident.photos.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedIncident.photos.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Incident photo ${i + 1}`}
                          className="w-full rounded-lg border border-border object-cover max-h-48"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-between bg-muted/20 rounded-lg p-3">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Select
                    value={selectedIncident.status}
                    onValueChange={(v) => {
                      handleStatusChange(selectedIncident.id, v as Incident["status"]);
                      setSelectedIncident({ ...selectedIncident, status: v as Incident["status"] });
                    }}
                  >
                    <SelectTrigger className={`w-36 h-8 text-xs border ${statusConfig[selectedIncident.status]?.color}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">Reported</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========== DELETE MODAL ========== */}
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Incident Report?</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              This action cannot be undone. The incident report will be permanently deleted.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
