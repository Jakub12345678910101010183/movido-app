/**
 * POD (Proof of Delivery) Page — Digital Proof Management
 * Terminal Noir style
 * Features:
 * - View all jobs' POD status (pending/signed/photo/na)
 * - Photo capture & upload (camera or file picker)
 * - Signature pad (canvas-based)
 * - Notes field
 * - Supabase Storage integration for photos
 * - Filter by status, search by reference
 */

import { useState, useRef, useCallback, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, FileCheck, Search, Filter, RefreshCw, Loader2,
  Image, Pen, CheckCircle, Clock, X, Upload, Eye, Package,
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
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  // Capture state
  const [captureMode, setCaptureMode] = useState<"photo" | "signature">("photo");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [podNotes, setPodNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

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

  // ============================================
  // Photo handling
  // ============================================

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // ============================================
  // Signature canvas
  // ============================================

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#00FFD4";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (showCaptureModal && captureMode === "signature") {
      setTimeout(initCanvas, 100);
    }
  }, [showCaptureModal, captureMode, initCanvas]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    lastPosRef.current = getCanvasPos(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  };

  const stopDraw = () => { isDrawingRef.current = false; };

  const clearSignature = () => { initCanvas(); };

  // ============================================
  // Upload & Save POD
  // ============================================

  const handleSavePOD = async () => {
    if (!selectedJob) return;
    setIsUploading(true);

    try {
      let photoUrl: string | null = null;
      let signatureData: string | null = null;

      if (captureMode === "photo" && photoFile) {
        // Upload to Supabase Storage
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `pod/${selectedJob.reference}-${Date.now()}.${ext}`;

        const { data, error } = await supabase.storage
          .from("pod-photos")
          .upload(path, photoFile, { contentType: photoFile.type });

        if (error) {
          // If bucket doesn't exist, store as data URL fallback
          console.warn("Storage upload failed (bucket may not exist):", error.message);
          // Convert to base64 as fallback
          const reader = new FileReader();
          photoUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(photoFile);
          });
        } else {
          const { data: urlData } = supabase.storage.from("pod-photos").getPublicUrl(path);
          photoUrl = urlData.publicUrl;
        }
      }

      if (captureMode === "signature" && canvasRef.current) {
        signatureData = canvasRef.current.toDataURL("image/png");
      }

      // Update job in Supabase
      const { error: updateError } = await supabase
        .from("jobs")
        .update({
          pod_status: captureMode === "photo" ? "photo" : "signed",
          pod_photo_url: photoUrl,
          pod_signature: signatureData,
          pod_notes: podNotes || null,
        })
        .eq("id", selectedJob.id);

      if (updateError) throw updateError;

      toast.success(`POD ${captureMode === "photo" ? "photo" : "signature"} saved for ${selectedJob.reference}`);
      setShowCaptureModal(false);
      resetCapture();
      refetch();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const resetCapture = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPodNotes("");
    setCaptureMode("photo");
  };

  const openCapture = (job: Job) => {
    setSelectedJob(job);
    resetCapture();
    setShowCaptureModal(true);
  };

  const openView = (job: Job) => {
    setSelectedJob(job);
    setShowViewModal(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Proof of Delivery</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Digital POD management — photos, signatures & notes
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
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
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
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
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
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
                            <Button size="sm" className="glow-cyan-sm" onClick={() => openCapture(job)}>
                              <Camera className="w-3 h-3 mr-1" />Capture POD
                            </Button>
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
            <p className="text-muted-foreground">Create jobs first, then capture proof of delivery</p>
          </div>
        )}

        {/* ========== CAPTURE MODAL ========== */}
        <Dialog open={showCaptureModal} onOpenChange={setShowCaptureModal}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                Capture POD — {selectedJob?.reference}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={captureMode === "photo" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCaptureMode("photo")}
                >
                  <Camera className="w-4 h-4 mr-2" />Photo
                </Button>
                <Button
                  variant={captureMode === "signature" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCaptureMode("signature")}
                >
                  <Pen className="w-4 h-4 mr-2" />Signature
                </Button>
              </div>

              {/* Photo Capture */}
              {captureMode === "photo" && (
                <div className="space-y-3">
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="POD preview" className="w-full rounded-lg border border-border max-h-60 object-cover" />
                      <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/50" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed border-border bg-muted/20 cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to upload or take photo</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 10MB</p>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                    </label>
                  )}
                </div>
              )}

              {/* Signature Capture */}
              {captureMode === "signature" && (
                <div className="space-y-3">
                  <div className="relative">
                    <canvas
                      ref={canvasRef}
                      width={440}
                      height={200}
                      className="w-full rounded-lg border border-border cursor-crosshair touch-none"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 text-xs"
                      onClick={clearSignature}
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Draw signature above with mouse or finger</p>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>Delivery Notes</Label>
                <Textarea
                  className="mt-1.5 bg-muted/30"
                  placeholder="e.g., Left with reception, signed by John Smith..."
                  value={podNotes}
                  onChange={(e) => setPodNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Job info */}
              <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3">
                <p><strong>Customer:</strong> {selectedJob?.customer}</p>
                <p><strong>Delivery:</strong> {selectedJob?.delivery_address || "No address"}</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCaptureModal(false)}>Cancel</Button>
              <Button
                onClick={handleSavePOD}
                disabled={isUploading || (captureMode === "photo" && !photoFile)}
                className="glow-cyan-sm"
              >
                {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : <><CheckCircle className="w-4 h-4 mr-2" />Save POD</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  <img
                    src={selectedJob.pod_photo_url}
                    alt="POD Photo"
                    className="w-full rounded-lg border border-border max-h-64 object-cover"
                  />
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
