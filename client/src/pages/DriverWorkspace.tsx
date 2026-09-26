/**
 * Driver workspace — the mobile screen a driver uses on the road.
 *
 * Everything here runs as the signed-in driver and is enforced server-side:
 * RLS only returns jobs assigned to this driver, jobs_driver_field_guard lets
 * a driver change nothing but progress and POD fields, driver_update_stop()
 * is the only way to mark a stop, and pod-photos storage policies only accept
 * uploads under "<organization_id>/<job_id>/" for the driver's own jobs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Truck, MapPin, Navigation, CheckCircle2, Circle, Loader2, Camera, PenLine,
  RefreshCw, LogOut, ArrowLeft, Phone, StickyNote, Flag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Job } from "@/lib/database.types";

type StopStatus = "pending" | "arrived" | "completed";
type Stop = { label: string; address: string; status: StopStatus };

function parseStops(value: Job["stops"]): Stop[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => {
    if (typeof s !== "object" || s === null || Array.isArray(s)) return [];
    const status = s.status === "arrived" || s.status === "completed" ? s.status : "pending";
    return [{
      label: typeof s.label === "string" ? s.label : "",
      address: typeof s.address === "string" ? s.address : "",
      status,
    }];
  });
}

function directionsUrl(job: Job, stops: Stop[]): string {
  const remaining = stops.filter((s) => s.status !== "completed").map((s) => s.address);
  const destination = job.delivery_address ?? remaining.pop() ?? "";
  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (remaining.length) params.set("waypoints", remaining.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "Pending", assigned: "Assigned", in_progress: "In progress",
  completed: "Completed", cancelled: "Cancelled",
};

export default function DriverWorkspace() {
  const { profile, signOut } = useAuthContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openJobId, setOpenJobId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    // RLS returns only jobs assigned to this driver in their organisation.
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .or(`status.in.(pending,assigned,in_progress),completed_at.gte.${since.toISOString()}`)
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setJobs(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openJob = jobs.find((j) => j.id === openJobId) ?? null;
  const active = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const done = jobs.filter((j) => j.status === "completed");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          {openJob ? (
            <Button variant="ghost" size="icon" aria-label="Back to my jobs" onClick={() => setOpenJobId(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          ) : (
            <Truck className="w-6 h-6 text-primary shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-semibold truncate">{openJob ? openJob.reference : "My jobs"}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.name ?? profile?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void load()}>
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => signOut()}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl p-4">
        {openJob ? (
          <JobDetail job={openJob} onChanged={load} />
        ) : loading && jobs.length === 0 ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : loadError ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-muted-foreground">Your jobs could not be loaded.</p>
            <Button variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Assigned to you ({active.length})</h2>
              {active.length === 0 && (
                <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
                  No active jobs. Pull to refresh when dispatch assigns you work.
                </p>
              )}
              {active.map((job) => (
                <JobCard key={job.id} job={job} onOpen={() => setOpenJobId(job.id)} />
              ))}
            </section>
            {done.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">Completed today ({done.length})</h2>
                {done.map((job) => (
                  <JobCard key={job.id} job={job} onOpen={() => setOpenJobId(job.id)} />
                ))}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const stops = parseStops(job.stops);
  const delivered = stops.filter((s) => s.status === "completed").length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-border bg-card p-4 space-y-2 hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{job.reference}</span>
        <span className="text-xs rounded-full border border-border px-2 py-0.5">{STATUS_LABEL[job.status]}</span>
      </div>
      <p className="font-medium">{job.customer}</p>
      <p className="text-sm text-muted-foreground flex items-start gap-1.5">
        <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{job.delivery_address ?? "No delivery address"}</span>
      </p>
      {stops.length > 0 && (
        <p className="text-xs text-muted-foreground">{delivered}/{stops.length} stops delivered</p>
      )}
    </button>
  );
}

function JobDetail({ job, onChanged }: { job: Job; onChanged: () => Promise<void> }) {
  const stops = parseStops(job.stops);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPod, setShowPod] = useState(false);
  const closed = job.status === "completed" || job.status === "cancelled";

  const startJob = async () => {
    setBusy("start");
    const { error } = await supabase.from("jobs").update({ status: "in_progress" }).eq("id", job.id);
    setBusy(null);
    if (error) toast.error("Could not start the job");
    else {
      toast.success("Job started");
      await onChanged();
    }
  };

  const markStop = async (index: number, status: "arrived" | "completed") => {
    setBusy(`stop-${index}`);
    const { error } = await supabase.rpc("driver_update_stop", {
      p_job_id: job.id, p_stop_index: index, p_status: status,
    });
    setBusy(null);
    if (error) toast.error("Could not update the stop");
    else {
      toast.success(status === "arrived" ? "Arrival recorded" : "Stop delivered");
      await onChanged();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{job.customer}</p>
          <span className="text-xs rounded-full border border-border px-2 py-0.5">{STATUS_LABEL[job.status]}</span>
        </div>
        {job.customer_phone && (
          <a href={`tel:${job.customer_phone}`} className="flex items-center gap-2 text-sm text-primary">
            <Phone className="w-4 h-4" />{job.customer_phone}
          </a>
        )}
        {job.driver_notes && (
          <p className="flex items-start gap-2 text-sm bg-muted/30 rounded-lg p-2">
            <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />{job.driver_notes}
          </p>
        )}
        {!closed && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild variant="outline">
              <a href={directionsUrl(job, stops)} target="_blank" rel="noopener noreferrer">
                <Navigation className="w-4 h-4 mr-2" />Navigate
              </a>
            </Button>
            {job.status === "in_progress" ? (
              <Button onClick={() => setShowPod(true)}><Flag className="w-4 h-4 mr-2" />Complete</Button>
            ) : (
              <Button onClick={startJob} disabled={busy !== null}>
                {busy === "start" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Start job
              </Button>
            )}
          </div>
        )}
      </div>

      <ol className="rounded-xl border border-border bg-card divide-y divide-border">
        <li className="p-4 flex gap-3">
          <Circle className="w-5 h-5 text-green-500 shrink-0" />
          <div><p className="text-xs text-muted-foreground">Pickup</p><p className="text-sm">{job.pickup_address ?? "—"}</p></div>
        </li>
        {stops.map((stop, i) => (
          <li key={i} className="p-4 space-y-2">
            <div className="flex gap-3">
              {stop.status === "completed"
                ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                : <Circle className={`w-5 h-5 shrink-0 ${stop.status === "arrived" ? "text-amber-500" : "text-blue-400"}`} />}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Stop {i + 1}{stop.label ? ` · ${stop.label}` : ""}
                  {stop.status === "arrived" && " · arrived"}{stop.status === "completed" && " · delivered"}
                </p>
                <p className="text-sm break-words">{stop.address}</p>
              </div>
            </div>
            {!closed && stop.status !== "completed" && (
              <div className="flex gap-2 pl-8">
                {stop.status === "pending" && (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => markStop(i, "arrived")}>
                    {busy === `stop-${i}` && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Arrived
                  </Button>
                )}
                <Button size="sm" disabled={busy !== null} onClick={() => markStop(i, "completed")}>
                  {busy === `stop-${i}` && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Delivered
                </Button>
              </div>
            )}
          </li>
        ))}
        <li className="p-4 flex gap-3">
          <MapPin className="w-5 h-5 text-amber-500 shrink-0" />
          <div><p className="text-xs text-muted-foreground">Final delivery</p><p className="text-sm">{job.delivery_address ?? "—"}</p></div>
        </li>
      </ol>

      {showPod && !closed && (
        <PodCapture job={job} onDone={async () => { setShowPod(false); await onChanged(); }} onCancel={() => setShowPod(false)} />
      )}
      {job.status === "completed" && (
        <p className="text-center text-sm text-green-500 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4" />Delivered{job.completed_at ? ` at ${new Date(job.completed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
      )}
    </div>
  );
}

function PodCapture({ job, onDone, onCancel }: { job: Job; onDone: () => Promise<void>; onCancel: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 160;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!drawing.current || !ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasSignature(true);
  };
  const up = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const submit = async () => {
    if (!photo && !hasSignature) {
      toast.error("Add a delivery photo or the recipient's signature");
      return;
    }
    if (!job.organization_id) {
      toast.error("This job is not linked to an organisation");
      return;
    }
    setSaving(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
        photoPath = `${job.organization_id}/${job.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("pod-photos")
          .upload(photoPath, photo, { contentType: photo.type || "image/jpeg" });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
      }
      const signature = hasSignature ? canvasRef.current?.toDataURL("image/png") ?? null : null;
      const podNotes = [recipient.trim() && `Received by: ${recipient.trim()}`, notes.trim()]
        .filter(Boolean)
        .join("\n");
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "completed",
          pod_status: photoPath ? "photo" : "signed",
          pod_photo_url: photoPath,
          pod_signature: signature,
          pod_notes: podNotes || null,
        })
        .eq("id", job.id);
      if (error) throw new Error(error.message);
      toast.success("Delivery completed");
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete the delivery");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-4">
      <h3 className="font-semibold">Proof of delivery</h3>
      <div className="space-y-1.5">
        <Label htmlFor="pod-photo" className="flex items-center gap-2"><Camera className="w-4 h-4" />Delivery photo</Label>
        <Input id="pod-photo" type="file" accept="image/*" capture="environment"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2"><PenLine className="w-4 h-4" />Recipient signature</Label>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Signature pad"
          className="w-full h-40 rounded-lg border border-border touch-none bg-white"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pod-recipient">Received by</Label>
        <Input id="pod-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient name" autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pod-notes">Notes</Label>
        <Textarea id="pod-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. left with reception" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Complete delivery
        </Button>
      </div>
    </div>
  );
}
