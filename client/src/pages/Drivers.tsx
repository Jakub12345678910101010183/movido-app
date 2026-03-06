/**
 * Drivers Page - Driver Management with List View
 * Bloomberg/Fintech style with Supabase CRUD + realtime
 * MIGRATED: tRPC → useDrivers() Supabase hook
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, Edit, Trash2, User, Phone, Mail, Clock, Star, RefreshCw, Loader2, Award, Bell, Send, Megaphone, AlertOctagon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useDrivers } from "@/hooks/useSupabaseData";
import type { Driver } from "@/lib/database.types";

// ============================================
// Expo Push Notification sender
// Calls Expo's public push API directly
// ============================================
async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!pushToken.startsWith("ExponentPushToken")) {
      return { ok: false, error: "Invalid push token format" };
    }
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify({ to: pushToken, title, body, data: data || {}, sound: "default", priority: "high" }),
    });
    const json = await res.json();
    if (json.data?.status === "error") return { ok: false, error: json.data.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

const notificationTypes = [
  { value: "info",    label: "Info",     icon: Bell,          title: "Dispatch Info",     color: "text-blue-400" },
  { value: "urgent",  label: "Urgent",   icon: AlertOctagon,  title: "⚠️ URGENT",         color: "text-red-400" },
  { value: "job",     label: "New Job",  icon: Send,          title: "New Job Assigned",  color: "text-cyan-400" },
  { value: "alert",   label: "Alert",    icon: Megaphone,     title: "Dispatch Alert",    color: "text-amber-400" },
];

const statusColors: Record<string, string> = {
  on_duty: "bg-green-500/20 text-green-500 border-green-500/30",
  available: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30",
  off_duty: "bg-gray-500/20 text-gray-500 border-gray-500/30",
  on_break: "bg-amber-500/20 text-amber-500 border-amber-500/30",
};
const statusLabels: Record<string, string> = { on_duty: "On Duty", available: "Available", off_duty: "Off Duty", on_break: "On Break" };

interface DriverFormData {
  name: string; email: string; phone: string;
  status: "on_duty" | "available" | "off_duty" | "on_break";
  license_type: string; hours_today: string; hours_week: string;
  rating: string; total_deliveries: number;
}

const defaultForm: DriverFormData = {
  name: "", email: "", phone: "", status: "available",
  license_type: "Cat C (Rigid)", hours_today: "0", hours_week: "0",
  rating: "4.5", total_deliveries: 0,
};

export default function Drivers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DriverFormData>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);

  // Push notification state
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyDriver, setNotifyDriver] = useState<Driver | null>(null);
  const [notifyType, setNotifyType] = useState("info");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  const { drivers, isLoading, refetch, create, update, remove } = useDrivers();

  const filteredDrivers = drivers.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase()) || (d.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) || (d.phone?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    return matchesSearch && (statusFilter === "all" || d.status === statusFilter);
  });

  const handleAdd = async () => {
    if (!formData.name) { toast.error("Driver name is required"); return; }
    setIsSaving(true);
    try {
      await create({
        name: formData.name, email: formData.email || null, phone: formData.phone || null,
        status: formData.status, license_type: formData.license_type || null,
        hours_today: parseFloat(formData.hours_today) || 0,
        hours_week: parseFloat(formData.hours_week) || 0,
        rating: parseFloat(formData.rating) || 4.5,
        total_deliveries: formData.total_deliveries,
      });
      setShowAddModal(false); setFormData(defaultForm);
      toast.success("Driver added successfully");
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
    finally { setIsSaving(false); }
  };

  const handleEdit = async () => {
    if (!selectedDriverId) return;
    setIsSaving(true);
    try {
      await update(selectedDriverId, {
        name: formData.name, email: formData.email || null, phone: formData.phone || null,
        status: formData.status, license_type: formData.license_type || null,
        hours_today: parseFloat(formData.hours_today) || 0,
        hours_week: parseFloat(formData.hours_week) || 0,
        rating: parseFloat(formData.rating) || 4.5,
        total_deliveries: formData.total_deliveries,
      });
      setShowEditModal(false); setSelectedDriverId(null); setFormData(defaultForm);
      toast.success("Driver updated successfully");
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!selectedDriverId) return;
    setIsSaving(true);
    try { await remove(selectedDriverId); setShowDeleteModal(false); setSelectedDriverId(null); toast.success("Driver removed"); }
    catch (err: any) { toast.error(`Failed: ${err.message}`); }
    finally { setIsSaving(false); }
  };

  const openEdit = (d: Driver) => {
    setSelectedDriverId(d.id);
    setFormData({
      name: d.name, email: d.email || "", phone: d.phone || "", status: d.status,
      license_type: d.license_type || "Cat C (Rigid)",
      hours_today: d.hours_today?.toString() || "0", hours_week: d.hours_week?.toString() || "0",
      rating: d.rating?.toString() || "4.5", total_deliveries: d.total_deliveries ?? 0,
    });
    setShowEditModal(true);
  };

  const selectedDriver = drivers.find(d => d.id === selectedDriverId);

  // Push notification handlers
  const openNotify = (driver: Driver) => {
    setNotifyDriver(driver);
    setNotifyType("info");
    setNotifyMessage("");
    setShowNotifyModal(true);
  };

  const handleSendNotification = async () => {
    if (!notifyDriver || !notifyMessage.trim()) { toast.error("Please enter a message"); return; }
    const token = (notifyDriver as any).push_token;
    if (!token) { toast.error(`${notifyDriver.name} has no push token — they need to open the driver app first`); return; }
    setIsSendingPush(true);
    const type = notificationTypes.find(t => t.value === notifyType)!;
    const result = await sendExpoPush(token, type.title, notifyMessage, { type: notifyType });
    setIsSendingPush(false);
    if (result.ok) {
      toast.success(`Notification sent to ${notifyDriver.name}`);
      setShowNotifyModal(false);
      setNotifyMessage("");
    } else {
      toast.error(`Failed: ${result.error}`);
    }
  };

  const handleBroadcast = async () => {
    if (!notifyMessage.trim()) { toast.error("Please enter a message"); return; }
    const activeDrivers = drivers.filter(d => (d as any).push_token && (d.status === "on_duty" || d.status === "available"));
    if (activeDrivers.length === 0) { toast.error("No active drivers with push tokens found"); return; }
    setIsSendingPush(true);
    const type = notificationTypes.find(t => t.value === notifyType)!;
    let sent = 0;
    for (const driver of activeDrivers) {
      const result = await sendExpoPush((driver as any).push_token, type.title, notifyMessage, { type: notifyType, broadcast: true });
      if (result.ok) sent++;
    }
    setIsSendingPush(false);
    toast.success(`Broadcast sent to ${sent}/${activeDrivers.length} active drivers`);
    setShowBroadcastModal(false);
    setNotifyMessage("");
  };

  const renderForm = () => (
    <div className="grid gap-4 py-4">
      <div><Label>Name *</Label><Input className="mt-1.5 bg-muted/30" placeholder="e.g., John Smith" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Email</Label><Input className="mt-1.5 bg-muted/30" type="email" placeholder="john@example.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
        <div><Label>Phone</Label><Input className="mt-1.5 bg-muted/30" placeholder="+44 7700 900000" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Status</Label><Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as any })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="on_duty">On Duty</SelectItem><SelectItem value="off_duty">Off Duty</SelectItem><SelectItem value="on_break">On Break</SelectItem></SelectContent></Select></div>
        <div><Label>License Type</Label><Select value={formData.license_type} onValueChange={(v) => setFormData({ ...formData, license_type: v })}><SelectTrigger className="mt-1.5 bg-muted/30"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cat B (Car)">Cat B (Car)</SelectItem><SelectItem value="Cat C (Rigid)">Cat C (Rigid)</SelectItem><SelectItem value="Cat C+E (Artic)">Cat C+E (Artic)</SelectItem><SelectItem value="Cat D (Bus)">Cat D (Bus)</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Hours Today</Label><Input className="mt-1.5 bg-muted/30" type="number" step="0.5" value={formData.hours_today} onChange={(e) => setFormData({ ...formData, hours_today: e.target.value })} /></div>
        <div><Label>Hours This Week</Label><Input className="mt-1.5 bg-muted/30" type="number" step="0.5" value={formData.hours_week} onChange={(e) => setFormData({ ...formData, hours_week: e.target.value })} /></div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Driver Management</h1><p className="text-sm text-muted-foreground mt-1">Manage your drivers and their assignments</p></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setNotifyType("alert"); setNotifyMessage(""); setShowBroadcastModal(true); }}>
              <Megaphone className="w-4 h-4 mr-2" />Broadcast
            </Button>
            <Button className="glow-cyan-sm" onClick={() => { setFormData(defaultForm); setShowAddModal(true); }}><Plus className="w-4 h-4 mr-2" />Add Driver</Button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search by name, email, phone..." className="pl-9 bg-muted/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="on_duty">On Duty</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="off_duty">Off Duty</SelectItem><SelectItem value="on_break">On Break</SelectItem></SelectContent></Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Total Drivers</p><p className="text-2xl font-mono font-bold text-cyan">{drivers.length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">On Duty</p><p className="text-2xl font-mono font-bold text-green-500">{drivers.filter(d => d.status === "on_duty").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Available</p><p className="text-2xl font-mono font-bold text-cyan">{drivers.filter(d => d.status === "available").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground mb-1">Avg. Rating</p><p className="text-2xl font-mono font-bold text-amber-500">{drivers.length > 0 ? (drivers.reduce((a, d) => a + (d.rating ?? 0), 0) / drivers.length).toFixed(1) : "0.0"}</p></div>
        </div>

        {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Loading drivers...</span></div>}

        {!isLoading && drivers.length === 0 && (
          <div className="card-terminal p-12 text-center"><User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-lg font-semibold mb-2">No drivers yet</h3><p className="text-muted-foreground mb-4">Add your first driver to start managing your team</p><Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4 mr-2" />Add Driver</Button></div>
        )}

        {!isLoading && drivers.length > 0 && (
          <div className="card-terminal overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Driver</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">License</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Hours Today</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Hours/Week</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Rating</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Deliveries</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr></thead>
              <tbody>
                {filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div><div><p className="font-medium">{driver.name}</p><div className="flex items-center gap-3 text-xs text-muted-foreground">{driver.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{driver.email}</span>}{driver.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{driver.phone}</span>}</div></div></div></td>
                    <td className="p-4"><span className={`text-xs px-2 py-1 rounded-full border ${statusColors[driver.status] || ""}`}>{statusLabels[driver.status] || driver.status}</span></td>
                    <td className="p-4"><span className="text-sm">{driver.license_type || "-"}</span></td>
                    <td className="p-4"><div className="flex items-center gap-1"><Clock className="w-3 h-3 text-muted-foreground" /><span className="font-mono">{driver.hours_today ?? 0}h</span></div></td>
                    <td className="p-4"><span className="font-mono">{driver.hours_week ?? 0}h</span></td>
                    <td className="p-4"><div className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500 fill-amber-500" /><span className="font-mono">{driver.rating ?? 0}</span></div></td>
                    <td className="p-4"><div className="flex items-center gap-1"><Award className="w-3 h-3 text-muted-foreground" /><span className="font-mono">{driver.total_deliveries ?? 0}</span></div></td>
                    <td className="p-4"><div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        title="Send push notification"
                        className={(driver as any).push_token ? "text-cyan border-cyan/30 hover:bg-cyan/10" : "text-muted-foreground"}
                        onClick={() => openNotify(driver)}
                      >
                        <Bell className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(driver)}><Edit className="w-3 h-3 mr-1" />Edit</Button>
                      <Button variant="outline" size="icon" className="text-red-500 hover:text-red-400 hover:border-red-500/50" onClick={() => { setSelectedDriverId(driver.id); setShowDeleteModal(true); }}><Trash2 className="w-4 h-4" /></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={showAddModal} onOpenChange={setShowAddModal}><DialogContent className="bg-card border-border max-w-lg"><DialogHeader><DialogTitle>Add New Driver</DialogTitle></DialogHeader>{renderForm()}<DialogFooter><Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button><Button onClick={handleAdd} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add Driver</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}><DialogContent className="bg-card border-border max-w-lg"><DialogHeader><DialogTitle>Edit Driver</DialogTitle></DialogHeader>{renderForm()}<DialogFooter><Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button><Button onClick={handleEdit} disabled={isSaving} className="glow-cyan-sm">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}><DialogContent className="bg-card border-border max-w-md"><DialogHeader><DialogTitle>Delete Driver</DialogTitle></DialogHeader><p className="text-muted-foreground">Are you sure you want to delete <strong className="text-foreground">{selectedDriver?.name}</strong>? This action cannot be undone.</p><DialogFooter><Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete} disabled={isSaving}>{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Delete</Button></DialogFooter></DialogContent></Dialog>

        {/* ========== NOTIFY DRIVER MODAL ========== */}
        <Dialog open={showNotifyModal} onOpenChange={setShowNotifyModal}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notify {notifyDriver?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              {!(notifyDriver as any)?.push_token && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400">
                  <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Driver has no push token — they need to open the Movido Driver App at least once to register.</span>
                </div>
              )}
              {(notifyDriver as any)?.push_token && (
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded text-xs text-green-400">
                  <Bell className="w-3 h-3" /> Push token registered ✓
                </div>
              )}
              <div>
                <Label>Notification Type</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {notificationTypes.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setNotifyType(t.value)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${notifyType === t.value ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}
                      >
                        <Icon className={`w-4 h-4 ${notifyType === t.value ? "text-primary" : t.color}`} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  className="mt-1.5 bg-muted/30"
                  placeholder="e.g., New job assigned — check your app. Gate code is 1234."
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2">
                <strong>Preview:</strong>{" "}
                <span className="text-foreground">{notificationTypes.find(t => t.value === notifyType)?.title}</span>
                {" — "}{notifyMessage || "Your message here"}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNotifyModal(false)}>Cancel</Button>
              <Button
                onClick={handleSendNotification}
                disabled={isSendingPush || !notifyMessage.trim()}
                className="glow-cyan-sm"
              >
                {isSendingPush ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send Push</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========== BROADCAST MODAL ========== */}
        <Dialog open={showBroadcastModal} onOpenChange={setShowBroadcastModal}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-400" />
                Broadcast to All Active Drivers
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <p className="text-xs text-muted-foreground">
                Sends to all <strong className="text-foreground">{drivers.filter(d => (d as any).push_token && (d.status === "on_duty" || d.status === "available")).length}</strong> active drivers with registered push tokens.
              </p>
              <div>
                <Label>Notification Type</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {notificationTypes.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setNotifyType(t.value)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${notifyType === t.value ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}
                      >
                        <Icon className={`w-4 h-4 ${notifyType === t.value ? "text-primary" : t.color}`} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  className="mt-1.5 bg-muted/30"
                  placeholder="e.g., Weather alert — heavy fog on M1. Drive carefully."
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBroadcastModal(false)}>Cancel</Button>
              <Button
                onClick={handleBroadcast}
                disabled={isSendingPush || !notifyMessage.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              >
                {isSendingPush ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Megaphone className="w-4 h-4 mr-2" />Broadcast</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
