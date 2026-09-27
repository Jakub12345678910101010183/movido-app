/**
 * Vehicle checks submitted from the MOViDO Driver app (pre-start walk-round).
 * Read-only for the office. RLS limits rows to this company; the result and
 * "critical" flag were computed by the server when the driver submitted.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { DriverPhoto } from "@/components/DriverPhoto";
import { useDrivers, useVehicles } from "@/hooks/useSupabaseData";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// vehicle_checks (driver app) is not in the generated table types yet.
const db = supabase as unknown as SupabaseClient;

interface CheckItem { key: string; status: "pass" | "fail" | "na"; critical: boolean; note: string | null }
interface VehicleCheck {
  id: string; driver_id: number | null; vehicle_id: number | null; result: "pass" | "fail"; items: CheckItem[];
  defects_count: number; critical_defect: boolean; odometer: number | null; notes: string | null; photos: string[]; checked_at: string;
}

const LABEL: Record<string, string> = {
  tyres: "Tyres & wheels", lights: "Lights & indicators", brakes: "Brakes", mirrors: "Mirrors & glass", body: "Bodywork & doors",
  trailer: "Trailer", coupling: "Coupling", fluids: "Fluids & leaks", safety_equipment: "Safety equipment", damage: "New damage", other: "Other",
};

export default function VehicleChecks() {
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();
  const [checks, setChecks] = useState<VehicleCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "fail">("all");

  const load = async () => {
    setLoading(true);
    const { data, error: e } = await db.from("vehicle_checks")
      .select("id, driver_id, vehicle_id, result, items, defects_count, critical_defect, odometer, notes, photos, checked_at")
      .order("checked_at", { ascending: false }).limit(200);
    setLoading(false);
    if (e) { setError("Could not load vehicle checks."); return; }
    setError(null);
    setChecks((data ?? []) as unknown as VehicleCheck[]);
  };
  useEffect(() => { void load(); }, []);

  const name = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const veh = useMemo(() => new Map(vehicles.map((v) => [v.id, `${v.vehicle_id}${v.registration ? ` · ${v.registration}` : ""}`])), [vehicles]);
  const shown = checks.filter((c) => filter === "all" || c.result === "fail");
  const today = checks.filter((c) => new Date(c.checked_at).toDateString() === new Date().toDateString());

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-primary" />Vehicle checks</h1>
            <p className="text-sm text-muted-foreground mt-1">Pre-start checks from the MOViDO Driver app</p>
          </div>
          <div className="flex gap-2">
            <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>All</Button>
            <Button variant={filter === "fail" ? "default" : "outline"} size="sm" onClick={() => setFilter("fail")}>Defects only</Button>
            <Button variant="outline" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground">Checks today</p><p className="stat-value">{today.length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground">With defects today</p><p className="stat-value text-amber-400">{today.filter((c) => c.result === "fail").length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground">Safety-critical today</p><p className="stat-value text-red-400">{today.filter((c) => c.critical_defect).length}</p></div>
          <div className="card-terminal p-4"><p className="text-xs text-muted-foreground">Last 200 checks</p><p className="stat-value">{checks.length}</p></div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading checks…</div>
        ) : error ? (
          <div className="card-terminal p-6 text-sm text-red-400">{error}</div>
        ) : !shown.length ? (
          <div className="card-terminal p-12 text-center">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-semibold">{filter === "fail" ? "No defects reported" : "No vehicle checks yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">Drivers submit checks from the MOViDO Driver app.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((c) => (
              <div key={c.id} className={`card-terminal p-4 space-y-3 ${c.critical_defect ? "border-red-500/50" : c.result === "fail" ? "border-amber-500/40" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {c.critical_defect ? <ShieldAlert className="w-5 h-5 text-red-400" /> : c.result === "fail" ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                    <span className="font-semibold">{c.vehicle_id ? veh.get(c.vehicle_id) ?? `Vehicle #${c.vehicle_id}` : "Vehicle removed"}</span>
                    <span className="text-sm text-muted-foreground">· {c.driver_id ? name.get(c.driver_id) ?? `Driver #${c.driver_id}` : "Driver removed"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`rounded-full border px-2 py-0.5 ${c.critical_defect ? "border-red-500/40 text-red-400" : c.result === "fail" ? "border-amber-500/40 text-amber-400" : "border-emerald-500/40 text-emerald-400"}`}>
                      {c.critical_defect ? "Do not drive — critical defect" : c.result === "fail" ? `${c.defects_count} defect${c.defects_count === 1 ? "" : "s"}` : "Pass"}
                    </span>
                    <span className="font-mono text-muted-foreground">{new Date(c.checked_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                </div>
                {c.items.filter((i) => i.status === "fail").length ? (
                  <ul className="space-y-1 text-sm">
                    {c.items.filter((i) => i.status === "fail").map((i) => (
                      <li key={i.key} className="flex gap-2">
                        <span className={i.critical ? "text-red-400 font-medium" : "text-amber-400 font-medium"}>{LABEL[i.key] ?? i.key}{i.critical ? " (critical)" : ""}:</span>
                        <span className="text-muted-foreground">{i.note ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {c.odometer != null ? <span className="font-mono">{c.odometer.toLocaleString()} mi</span> : null}
                  <span>{c.items.filter((i) => i.status === "pass").length} pass · {c.items.filter((i) => i.status === "na").length} n/a</span>
                </div>
                {c.notes ? <p className="text-sm">{c.notes}</p> : null}
                {c.photos.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {c.photos.map((p, i) => <DriverPhoto key={p} path={p} alt={`Defect photo ${i + 1}`} className="w-full h-28 rounded-lg border border-border object-cover" />)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
