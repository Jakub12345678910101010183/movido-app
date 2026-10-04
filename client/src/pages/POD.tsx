/**
 * POD (Proof of Delivery) Page — Digital Proof Management
 * Terminal Noir style
 * Features:
 * - View all jobs' POD status (pending/signed/photo/na)
 * - View the photo, signature and notes the driver recorded
 * - Filter by status, search by reference
 *
 * View only: proof of delivery is recorded by the driver when completing the
 * job (driver_complete_job); the database refuses Office changes to it.
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, FileCheck, Search, Filter, RefreshCw, Loader2,
  Pen, Clock, X, Eye, Package,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useJobs } from "@/hooks/useSupabaseData";
import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/database.types";

const podStatusConfig: Record<string, { color: string; icon: typeof FileCheck; label: string }> = {
  pending: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock, label: "Pending" },
  signed: { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Pen, label: "Signed" },
  photo: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Camera, label: "Photo" },
  na: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: X, label: "N/A" },
};

export default function POD() {
  const { jobs, isLoading, refetch } = useJobs();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const [photoViewUrl, setPhotoViewUrl] = useState<string | null>(null);

  // Filter jobs
  const filtered = jobs.filter((j) => {
    const matchesStatus = statusFilter === "all" || j.pod_status === statusFilter;
    const s = searchTerm.toLowerCase();
    const matchesSearch = !s ||
      j.reference.toLowerCase().includes(s) ||
      j.customer.toLowerCase().includes(s) ||
      (j.delivery_address?.toLowerCase() || "").includes(s);
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = {
    total: jobs.length,
    pending: jobs.filter((j) => j.pod_status === "pending").length,
    signed: jobs.filter((j) => j.pod_status === "signed").length,
    photo: jobs.filter((j) => j.pod_status === "photo").length,
  };

  const openView = (job: Job) => {
    setSelectedJob(job);
    setPhotoViewUrl(null);
    setShowViewModal(true);
    const stored = job.pod_photo_url;
    if (!stored) return;
    // Older records hold an inline data: URL; new ones hold a storage path.
    if (stored.startsWith("data:")) {
      setPhotoViewUrl(stored);
      return;
    }
    supabase.storage
      .from("pod-photos")
      .createSignedUrl(stored, 300)
      .then(({ data, error }) => {
        if (error || !data) toast.error("Could not load the POD photo");
        else setPhotoViewUrl(data.signedUrl);
      });
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Proof of Delivery</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Proof recorded by drivers — photos, signatures & notes
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Total Jobs</span></div>
            <p className="text-2xl font-mono font-bold text-cyan">{stats.total}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-amber-500" /><span className="text-xs text-muted-foreground">POD Pending</span></div>
            <p className="text-2xl font-mono font-bold text-amber-500">{stats.pending}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Pen className="w-4 h-4 text-green-500" /><span className="text-xs text-muted-foreground">Signed</span></div>
            <p className="text-2xl font-mono font-bold text-green-500">{stats.signed}</p>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-1"><Camera className="w-4 h-4 text-blue-500" /><span className="text-xs text-muted-foreground">Photo POD</span></div>
            <p className="text-2xl font-mono font-bold text-blue-500">{stats.photo}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 basis-full sm:basis-auto min-w-0 sm:min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search reference, customer, address..." className="pl-9 bg-muted/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-muted/30"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All POD Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="na">N/A</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {/* Loading */}
        {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}

        {/* Table */}
        {!isLoading && filtered.length > 0 && (
          <div className="card-terminal overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Reference</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Delivery Address</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Job Status</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">POD Status</th>
                <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((job) => {
                  const cfg = podStatusConfig[job.pod_status] || podStatusConfig.pending;
                  const Icon = cfg.icon;
                  return (
                    <tr key={job.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-4"><span className="font-mono text-sm text-primary">{job.reference}</span></td>
                      <td className="p-4"><span className="text-sm">{job.customer}</span></td>
                      <td className="p-4"><span className="text-sm text-muted-foreground truncate max-w-[200px] block">{job.delivery_address || "—"}</span></td>
                      <td className="p-4"><span className="text-xs capitalize">{job.status.replace("_", " ")}</span></td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${cfg.color}`}>
                          <Icon className="w-3 h-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          {(job.pod_status === "signed" || job.pod_status === "photo") && (
                            <Button variant="outline" size="sm" onClick={() => openView(job)}>
                              <Eye className="w-3 h-3 mr-1" />View
                            </Button>
                          )}
                          {job.pod_status === "pending" && (
                            <span className="text-xs text-muted-foreground">Recorded by the driver at delivery</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="card-terminal p-12 text-center">
            <FileCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No POD records</h3>
            <p className="text-muted-foreground">Proof of delivery appears here when drivers complete jobs</p>
          </div>
        )}

        {/* ========== VIEW MODAL ========== */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-green-500" />
                POD — {selectedJob?.reference}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3">
                <p><strong>Customer:</strong> {selectedJob?.customer}</p>
                <p><strong>Delivery:</strong> {selectedJob?.delivery_address || "—"}</p>
                <p><strong>Status:</strong> {selectedJob?.pod_status}</p>
              </div>

              {selectedJob?.pod_photo_url && (
                <div>
                  <Label className="text-xs mb-2 block">Photo</Label>
                  {!photoViewUrl ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                  <img
                    src={photoViewUrl}
                    alt="POD Photo"
                    className="w-full rounded-lg border border-border max-h-64 object-cover"
                  />
                  )}
                </div>
              )}

              {selectedJob?.pod_signature && (
                <div>
                  <Label className="text-xs mb-2 block">Signature</Label>
                  <img
                    src={selectedJob.pod_signature}
                    alt="Signature"
                    className="w-full rounded-lg border border-border bg-[#0a0a0f]"
                  />
                </div>
              )}

              {selectedJob?.pod_notes && (
                <div>
                  <Label className="text-xs mb-2 block">Notes</Label>
                  <p className="text-sm bg-muted/20 rounded-lg p-3">{selectedJob.pod_notes}</p>
                </div>
              )}

              {!selectedJob?.pod_photo_url && !selectedJob?.pod_signature && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No POD data available</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
