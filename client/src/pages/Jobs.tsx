/**
 * Jobs Page - Job Management with Interactive Table
 * Bloomberg/Fintech style with Supabase CRUD + realtime
 * MIGRATED: tRPC → useJobs() Supabase hook
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, Edit, Trash2, ArrowUpDown, Download, RefreshCw, Loader2, Package, MapPin, Clock, Link2, Phone, StickyNote, ListOrdered, Eye, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useJobs, useVehicles, useDrivers } from "@/hooks/useSupabaseData";
import type { Job, GeofenceEvent } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { tomtomGeocode } from "@/components/TomTomMap";

const statusColors: Record<string, string> = { pending: "bg-amber-500/20 text-amber-500 border-amber-500/30", assigned: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30", in_progress: "bg-blue-500/20 text-blue-500 border-blue-500/30", completed: "bg-green-500/20 text-green-500 border-green-500/30", cancelled: "bg-red-500/20 text-red-500 border-red-500/30" };
const statusLabels: Record<string, string> = { pending: "Pending", assigned: "Assigned", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
const priorityColors: Record<string, string> = { low: "bg-gray-500/20 text-gray-400 border-gray-500/30", medium: "bg-blue-500/20 text-blue-400 border-blue-500/30", high: "bg-amber-500/20 text-amber-400 border-amber-500/30", urgent: "bg-red-500/20 text-red-400 border-red-500/30" };
const priorityLabels: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

interface Stop {
  label: string;
  address: string;
  status?: "pending" | "arrived" | "completed";
  completed_at?: string | null;
  lat?: number | null;
  lng?: number | null;
}

// Radix Select forbids an empty-string item value (it throws while rendering),
// so "no assignment" needs a real sentinel.
const NONE = "none";

function parseStops(value: unknown): Stop[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      label: typeof s.label === "string" ? s.label : "",
      address: typeof s.address === "string" ? s.address : "",
      status: s.status === "arrived" || s.status === "completed" ? s.status : "pending",
      completed_at: typeof s.completed_at === "string" ? s.completed_at : null,
      lat: typeof s.lat === "number" ? s.lat : null,
      lng: typeof s.lng === "number" ? s.lng : null,
    }));
}

/** Combine the scheduled date (yyyy-mm-dd) and an ETA time (HH:MM) into ISO. */
function toEtaIso(date: string, time: string): string | null {
  if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return null;
  const day = date || new Date().toISOString().slice(0, 10);
  const eta = new Date(`${day}T${time.trim().padStart(5, "0")}:00`);
  return Number.isNaN(eta.getTime()) ? null : eta.toISOString();
}

/** 128-bit random hex token (getRandomValues works outside secure contexts too). */
function newTrackingToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Supabase errors are plain objects, not Error instances. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    const code = "code" in err ? err.code : undefined;
    return code === "23505" ? "That reference is already used by another job" : err.message;
  }
  return "Something went wrong";
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface JobFormData {
  reference: string; customer: string;
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  pickup_address: string; delivery_address: string; eta: string;
  vehicle_id: string; driver_id: string;
  scheduled_date: string;
  customer_phone: string;
  driver_notes: string;
  stops: Stop[];
}

const defaultForm: JobFormData = {
  reference: "", customer: "", status: "pending", priority: "medium",
  pickup_address: "", delivery_address: "", eta: "", vehicle_id: NONE, driver_id: NONE, scheduled_date: "",
  customer_phone: "", driver_notes: "", stops: [],
};

export default function Jobs() {
  const [searchTerm, setSearchTerm] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [formData, setFormData] = useState<JobFormData>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [autoReference, setAutoReference] = useState("");
  const [geoEvents, setGeoEvents] = useState<GeofenceEvent[] | null>(null);

  const { jobs, isLoading, refetch, create, update, remove, generateReference } = useJobs();
  const { vehicles } = useVehicles();
  const { drivers } = useDrivers();

  const filteredJobs = jobs.filter((job) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch = job.reference.toLowerCase().includes(s) || job.customer.toLowerCase().includes(s) || (job.pickup_address?.toLowerCase() || "").includes(s) || (job.delivery_address?.toLowerCase() || "").includes(s);
    return matchesSearch && (statusFilter === "all" || job.status === statusFilter);
  });

  /**
   * Geocode every address so server-side geofencing and the map have
   * coordinates. An address that cannot be located is still saved; the
   * dispatcher is told which ones will not trigger arrivals.
   */
  const buildPayload = async () => {
    if (formData.eta.trim() && !toEtaIso(formData.scheduled_date, formData.eta)) {
      throw new Error("ETA must be a time such as 14:30");
    }
    const stopsIn = formData.stops.filter((stop) => stop.address.trim());
    const pickup = formData.pickup_address.trim();
    const delivery = formData.delivery_address.trim();
    const locate = (address: string) => (address ? tomtomGeocode(address) : Promise.resolve(null));
    const [pickupPos, deliveryPos, ...stopPos] = await Promise.all([
      locate(pickup), locate(delivery), ...stopsIn.map((stop) => locate(stop.address.trim())),
    ]);
    const unlocated = [pickup && !pickupPos, delivery && !deliveryPos, ...stopPos.map((p) => !p)]
      .filter(Boolean).length;
    if (unlocated > 0) {
      toast.warning(`${unlocated} address${unlocated === 1 ? "" : "es"} could not be located — no arrival alerts for ${unlocated === 1 ? "it" : "them"}.`);
    }
    const stops = stopsIn.map((stop, i) => ({
      label: stop.label.trim() || `Stop ${i + 1}`,
      address: stop.address.trim(),
      status: stop.status ?? "pending",
      completed_at: stop.completed_at ?? null,
      lat: stopPos[i]?.lat ?? null,
      lng: stopPos[i]?.lng ?? null,
    }));
    return {
      customer: formData.customer.trim(), status: formData.status, priority: formData.priority,
      pickup_address: pickup || null,
      pickup_lat: pickupPos?.lat ?? null, pickup_lng: pickupPos?.lng ?? null,
      delivery_address: delivery || null,
      delivery_lat: deliveryPos?.lat ?? null, delivery_lng: deliveryPos?.lng ?? null,
      scheduled_date: formData.scheduled_date || null,
      eta: formData.eta.trim() ? toEtaIso(formData.scheduled_date, formData.eta) : null,
      vehicle_id: formData.vehicle_id !== NONE ? parseInt(formData.vehicle_id) : null,
      driver_id: formData.driver_id !== NONE ? parseInt(formData.driver_id) : null,
      customer_phone: formData.customer_phone.trim() || null,
      driver_notes: formData.driver_notes.trim() || null,
      stops: stops.length > 0 ? stops : null,
    };
  };

  const handleAdd = async () => {
    if (!formData.customer.trim()) { toast.error("Customer name is required"); return; }
    setIsSaving(true);
    try {
      const payload = await buildPayload();
      let ref = formData.reference.trim() || await generateReference();
      const typed = formData.reference.trim();
      const autoRef = !typed || typed === autoReference;
      // The tracking token doubles as an idempotency key: a retry after a
      // lost response reuses it, and a conflict on a row carrying our token
      // means the first attempt already succeeded.
      const token = newTrackingToken();
      for (let attempt = 0; ; attempt++) {
        try {
          await create({ ...payload, reference: ref, tracking_token: token });
          break;
        } catch (err) {
          const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
          const network = err instanceof TypeError || /fetch|network/i.test(errorMessage(err));
          if (attempt >= 3) throw err;
          if (code === "23505" || network) {
            const { data: mine } = await supabase.from("jobs").select("reference").eq("tracking_token", token).maybeSingle();
            if (mine) { ref = mine.reference; break; }
          }
          if (network) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
          // Two dispatchers can take the same next number at once; an
          // automatic reference is regenerated, a typed one is reported.
          if (code === "23505" && autoRef) { ref = await generateReference(); continue; }
          throw err;
        }
      }
      setShowAddModal(false); setFormData(defaultForm);
      toast.success(`Job ${ref} created`);
    } catch (err: unknown) { toast.error(`Failed: ${errorMessage(err)}`); }
    finally { setIsSaving(false); }
  };

  const handleEdit = async () => {
    if (!selectedJobId) return;
    if (!formData.customer.trim()) { toast.error("Customer name is required"); return; }
    setIsSaving(true);
    try {
      await update(selectedJobId, { ...(await buildPayload()), reference: formData.reference.trim() });
      setShowEditModal(false); setSelectedJobId(null); setFormData(defaultForm);
      toast.success("Job updated successfully");
    } catch (err: unknown) { toast.error(`Failed: ${errorMessage(err)}`); }
    finally { setIsSaving(false); }
  };

  const exportCsv = () => {
    const header = ["reference", "customer", "status", "priority", "scheduled_date", "eta", "pickup_address", "delivery_address", "stops", "driver", "vehicle", "pod_status", "created_at"];
    const rows = filteredJobs.map((job) => [
      job.reference, job.customer, job.status, job.priority, job.scheduled_date, job.eta,
      job.pickup_address, job.delivery_address,
      parseStops(job.stops).map((stop) => stop.address).join(" | "),
      drivers.find((d) => d.id === job.driver_id)?.name ?? "",
      vehicles.find((v) => v.id === job.vehicle_id)?.vehicle_id ?? "",
      job.pod_status, job.created_at,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `movido-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} job${rows.length === 1 ? "" : "s"}`);
  };

  const handleDelete = async () => {
    if (!selectedJobId) return;
    setIsSaving(true);
    try { await remove(selectedJobId); setShowDeleteModal(false); setSelectedJobId(null); toast.success("Job deleted"); }
    catch (err: any) { toast.error(`Failed: ${err.message}`); }
    finally { setIsSaving(false); }
  };

  const openEdit = (job: Job) => {
    setSelectedJobId(job.id);
    setFormData({
      reference: job.reference, customer: job.customer, status: job.status, priority: job.priority,
      pickup_address: job.pickup_address || "", delivery_address: job.delivery_address || "",
      eta: job.eta ? new Date(job.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      vehicle_id: job.vehicle_id?.toString() || NONE, driver_id: job.driver_id?.toString() || NONE,
      scheduled_date: job.scheduled_date || "",
      customer_phone: job.customer_phone || "",
      driver_notes: job.driver_notes || "",
      stops: parseStops(job.stops),
    });
    setShowEditModal(true);
  };

  const openDetail = (job: Job) => {
    setSelectedJobId(job.id);
    setShowDetailModal(true);
    setGeoEvents(null);
    // Arrivals/departures recorded by server-side geofencing.
    supabase
      .from("geofence_events")
      .select("*")
      .eq("job_id", job.id)
      .order("occurred_at", { ascending: true })
      .then(({ data }) => setGeoEvents(data ?? []));
  };

  const addStop = () => {
    setFormData((prev) => ({ ...prev, stops: [...prev.stops, { label: "", address: "", status: "pending" }] }));
  };
  const removeStop = (i: number) => {
    setFormData((prev) => ({ ...prev, stops: prev.stops.filter((_, idx) => idx !== i) }));
  };
  const updateStop = (i: number, field: "label" | "address", val: string) => {
    setFormData((prev) => {
      const stops = [...prev.stops];
      stops[i] = { ...stops[i], [field]: val };
      return { ...prev, stops };
    });
  };

  const openAdd = async () => {
    // Open immediately; the suggested reference fills in when it arrives.
    setFormData({ ...defaultForm });
    setAutoReference("");
    setShowAddModal(true);
    try {
      const ref = await generateReference();
      setAutoReference(ref);
      setFormData((prev) => (prev.reference ? prev : { ...prev, reference: ref }));
    } catch {
      /* the reference is generated again on save */
    }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const renderForm = () => (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Reference</Label><Input className="mt-1.5 bg-muted/30" value={formData.reference} onChange={(e) => setFormData({ ...formData, reference: e.target.value })} /></div>
        <div><Label>Customer *</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., Tesco Distribution" value={formData.customer} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Status</Label><Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as JobFormData["status"] })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
        <div><Label>Priority</Label><Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as JobFormData["priority"] })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
      </div>
      <div><Label>Pickup Address</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., London Distribution Centre" value={formData.pickup_address} onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })} /></div>
      <div><Label>Delivery Address</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., Birmingham Hub" value={formData.delivery_address} onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Assign Vehicle</Label><Select value={formData.vehicle_id} onValueChange={(v) => setFormData({ ...formData, vehicle_id: v })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue placeholder="Select vehicle" /></SelectTrigger><SelectContent><SelectItem value={NONE}>None</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.vehicle_id} — {v.make} {v.model}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Assign Driver</Label><Select value={formData.driver_id} onValueChange={(v) => setFormData({ ...formData, driver_id: v })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue placeholder="Select driver" /></SelectTrigger><SelectContent><SelectItem value={NONE}>None</SelectItem>{drivers.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="job-date">Scheduled Date</Label><Input id="job-date" type="date" className="mt-1.5 bg-muted/30" value={formData.scheduled_date} onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })} /></div>
        <div><Label htmlFor="job-eta">ETA</Label><Input id="job-eta" type="time" className="mt-1.5 bg-muted/30" value={formData.eta} onChange={(e) => setFormData({ ...formData, eta: e.target.value })} /></div>
      </div>
      <div><Label className="flex items-center gap-1.5"><Phone className="w-3 h-3" />Customer Phone</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., 07700 900000" value={formData.customer_phone} onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })} /></div>
      {/* Multi-stop */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="flex items-center gap-1.5"><ListOrdered className="w-3 h-3" />Extra Stops</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStop}><Plus className="w-3 h-3 mr-1" />Add Stop</Button>
        </div>
        {formData.stops.map((stop, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <Input className="bg-muted/30 w-24 shrink-0" placeholder={`Stop ${i + 1}`} value={stop.label} onChange={(e) => updateStop(i, "label", e.target.value)} />
            <Input className="bg-muted/30 flex-1" placeholder="Address" value={stop.address} onChange={(e) => updateStop(i, "address", e.target.value)} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeStop(i)}><X className="w-4 h-4 text-red-400" /></Button>
          </div>
        ))}
        {formData.stops.length === 0 && <p className="text-xs text-muted-foreground">No extra stops (pickup → delivery only)</p>}
      </div>
      <div><Label className="flex items-center gap-1.5"><StickyNote className="w-3 h-3" />Dispatcher Notes for Driver</Label><Textarea className="mt-1.5 bg-muted/30" placeholder="Gate code, access instructions, special requirements..." value={formData.driver_notes} onChange={(e) => setFormData({ ...formData, driver_notes: e.target.value })} rows={2} /></div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Job Management</h1><p className="text-sm text-muted-foreground mt-1">Manage and track all delivery jobs</p></div>
          <Button className="glow-cyan-sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add New Job</Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 basis-full sm:basis-auto min-w-0 sm:min-w-[220px] max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search by reference, customer, address..." className="pl-9 bg-muted/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" title="Export CSV" aria-label="Export jobs as CSV" onClick={exportCsv}><Download className="w-4 h-4" /></Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Total Jobs</p><p className="text-2xl font-mono font-bold text-cyan">{jobs.length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">In Progress</p><p className="text-2xl font-mono font-bold text-blue-500">{jobs.filter(j => j.status === "in_progress").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Assigned</p><p className="text-2xl font-mono font-bold text-cyan">{jobs.filter(j => j.status === "assigned").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Pending</p><p className="text-2xl font-mono font-bold text-amber-500">{jobs.filter(j => j.status === "pending").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Completed</p><p className="text-2xl font-mono font-bold text-green-500">{jobs.filter(j => j.status === "completed").length}</p></div>
        </div>

        {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Loading jobs...</span></div>}

        {!isLoading && jobs.length === 0 && (
          <div className="card-terminal p-12 text-center"><Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-2">No jobs yet</h3><p className="text-muted-foreground mb-4">Create your first job to start tracking deliveries</p><Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add New Job</Button></div>
        )}

        {!isLoading && jobs.length > 0 && (
          <div className="card-terminal overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider"><div className="flex items-center gap-1">Reference <ArrowUpDown className="w-3 h-3" /></div></th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pickup</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Delivery</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">ETA</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-4 whitespace-nowrap"><span className="font-mono text-sm text-primary">{job.reference}</span></td>
                    <td className="p-4"><span className="text-sm">{job.customer}</span></td>
                    <td className="p-4 whitespace-nowrap"><span className={`text-xs px-2 py-1 rounded-full border ${statusColors[job.status] || ""}`}>{statusLabels[job.status] || job.status}</span></td>
                    <td className="p-4 whitespace-nowrap"><span className={`text-xs px-2 py-1 rounded-full border ${priorityColors[job.priority] || ""}`}>{priorityLabels[job.priority] || job.priority}</span></td>
                    <td className="p-4"><div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="w-3 h-3" /><span className="truncate max-w-[150px]">{job.pickup_address || "-"}</span></div></td>
                    <td className="p-4"><div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="w-3 h-3" /><span className="truncate max-w-[150px]">{job.delivery_address || "-"}</span></div></td>
                    <td className="p-4"><div className="flex items-center gap-1 text-sm"><Clock className="w-3 h-3 text-muted-foreground" /><span className="font-mono">{job.eta ? new Date(job.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "TBD"}</span></div></td>
                    <td className="p-4"><div className="flex items-center justify-end gap-2 whitespace-nowrap"><Button variant="outline" size="icon" aria-label="View details" title="View details" onClick={() => openDetail(job)}><Eye className="w-3 h-3" /></Button>{job.tracking_token && <Button variant="outline" size="icon" aria-label="Copy tracking link" title="Copy tracking link" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/track/${job.tracking_token}`); toast.success("Tracking link copied!"); }}><Link2 className="w-3 h-3" /></Button>}<Button variant="outline" size="sm" onClick={() => openEdit(job)}><Edit className="w-3 h-3 mr-1" />Edit</Button><Button variant="outline" size="icon" className="text-red-500 hover:text-red-400 hover:border-red-500/50" aria-label={`Delete ${job.reference}`} onClick={() => { setSelectedJobId(job.id); setShowDeleteModal(true); }}><Trash2 className="w-4 h-4" /></Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={showAddModal} onOpenChange={setShowAddModal}><DialogContent className="bg-card border-border max-w-lg"><DialogHeader><DialogTitle>Add New Job</DialogTitle></DialogHeader>{renderForm()}<DialogFooter><Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button><Button onClick={handleAdd} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create Job</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}><DialogContent className="bg-card border-border max-w-lg"><DialogHeader><DialogTitle>Edit Job</DialogTitle></DialogHeader>{renderForm()}<DialogFooter><Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button><Button onClick={handleEdit} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}><DialogContent className="bg-card border-border max-w-md"><DialogHeader><DialogTitle>Delete Job</DialogTitle></DialogHeader><p className="text-muted-foreground">Are you sure you want to delete job <strong className="text-foreground">{selectedJob?.reference}</strong>? This action cannot be undone.</p><DialogFooter><Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete} disabled={isSaving}>{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Delete</Button></DialogFooter></DialogContent></Dialog>

        {/* ========== JOB DETAIL MODAL ========== */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                {selectedJob?.reference} — {selectedJob?.customer}
              </DialogTitle>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-4 py-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/20 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Status</p><span className={`text-xs px-2 py-1 rounded-full border ${statusColors[selectedJob.status] || ""}`}>{statusLabels[selectedJob.status]}</span></div>
                  <div className="bg-muted/20 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Priority</p><span className={`text-xs px-2 py-1 rounded-full border ${priorityColors[selectedJob.priority] || ""}`}>{priorityLabels[selectedJob.priority]}</span></div>
                </div>
                <div className="bg-muted/20 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-500 mt-1.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Pickup</p><p>{selectedJob.pickup_address || "—"}</p></div></div>
                  {parseStops(selectedJob.stops).map((s, i) => (
                    <div key={i} className="flex items-start gap-2"><div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${s.status === "completed" ? "bg-green-500" : "bg-blue-400"}`} /><div><p className="text-xs text-muted-foreground">Stop {i + 1}: {s.label}{s.status === "completed" ? " · delivered" : s.status === "arrived" ? " · arrived" : ""}</p><p className="text-muted-foreground text-xs">{s.address}</p></div></div>
                  ))}
                  <div className="flex items-start gap-2"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Delivery</p><p>{selectedJob.delivery_address || "—"}</p></div></div>
                </div>
                {selectedJob.customer_phone && (
                  <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-3"><Phone className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">{selectedJob.customer_phone}</span></div>
                )}
                <div className="bg-muted/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Arrivals &amp; departures (GPS)</p>
                  {geoEvents === null ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : geoEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None recorded yet.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {geoEvents.map((ev) => (
                        <li key={ev.id} className="text-xs flex justify-between gap-2">
                          <span>
                            {ev.event_type === "arrival" ? "Arrived at" : "Left"}{" "}
                            {ev.target === "pickup" ? "pickup" : ev.target === "delivery" ? "delivery" : `stop ${Number(ev.target.slice(5)) + 1}`}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {new Date(ev.occurred_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {selectedJob.driver_notes && (
                  <div className="bg-muted/20 rounded-lg p-3"><div className="flex items-center gap-1.5 mb-1"><StickyNote className="w-3 h-3 text-amber-400" /><p className="text-xs text-muted-foreground">Driver Notes (from dispatcher)</p></div><p className="text-xs">{selectedJob.driver_notes}</p></div>
                )}
                {selectedJob.pod_status !== "pending" && (
                  <div className="bg-muted/20 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">POD Status</p><span className={`text-xs px-2 py-1 rounded-full border ${selectedJob.pod_status === "signed" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}`}>{selectedJob.pod_status}</span>{selectedJob.pod_notes && <p className="text-xs text-muted-foreground mt-2">{selectedJob.pod_notes}</p>}</div>
                )}
                {selectedJob.eta && (
                  <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-3"><Clock className="w-3.5 h-3.5 text-cyan" /><span className="font-mono text-cyan">ETA: {new Date(selectedJob.eta).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDetailModal(false); if (selectedJob) openEdit(selectedJob); }}>Edit Job</Button>
              <Button onClick={() => setShowDetailModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
