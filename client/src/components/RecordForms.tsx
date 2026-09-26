/**
 * Forms that create incident and fuel records. Used by dispatch (choosing the
 * driver) and by the driver workspace (fixed to the signed-in driver).
 * RLS decides what is allowed: the driver, vehicle and job must all belong to
 * the caller's organisation, and a driver can only file records as themselves.
 */

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type Option = { id: number; label: string };
const NONE = "none";

export const INCIDENT_TYPES = [
  { value: "accident", label: "Accident" },
  { value: "near_miss", label: "Near miss" },
  { value: "vehicle_damage", label: "Vehicle damage" },
  { value: "load_damage", label: "Load damage" },
  { value: "theft", label: "Theft" },
  { value: "other", label: "Other" },
] as const;

function readError(err: { message?: string } | null): string {
  if (!err?.message) return "Could not save. Please try again.";
  if (/row-level security|permission/i.test(err.message)) return "Not allowed: the driver, vehicle or job is not part of your organisation.";
  return err.message;
}

function SelectField({ label, value, onChange, options, allowNone, id }: {
  label: string; value: string; onChange: (v: string) => void; options: Option[]; allowNone?: boolean; id: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LogIncidentDialog({ open, onOpenChange, drivers, vehicles, jobs, fixedDriverId, defaultVehicleId, defaultJobId, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers?: Option[];
  vehicles?: Option[];
  jobs?: Option[];
  fixedDriverId?: number;
  defaultVehicleId?: number | null;
  defaultJobId?: number | null;
  onSaved?: () => void;
}) {
  const [driverId, setDriverId] = useState(fixedDriverId ? String(fixedDriverId) : "");
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ? String(defaultVehicleId) : NONE);
  const [jobId, setJobId] = useState(defaultJobId ? String(defaultJobId) : NONE);
  const [type, setType] = useState<string>("accident");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [thirdParty, setThirdParty] = useState(false);
  const [policeRef, setPoliceRef] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const driver = fixedDriverId ?? Number(driverId);
    if (!driver) { toast.error("Choose the driver involved"); return; }
    if (description.trim().length < 5) { toast.error("Describe what happened"); return; }
    setSaving(true);
    let lat: number | null = null;
    let lng: number | null = null;
    if (fixedDriverId && "geolocation" in navigator) {
      // Best effort: attach the driver's position if it is quickly available.
      await new Promise<void>((resolve) => navigator.geolocation.getCurrentPosition(
        (p) => { lat = p.coords.latitude; lng = p.coords.longitude; resolve(); },
        () => resolve(), { timeout: 5000, maximumAge: 60000 }));
    }
    const { error } = await supabase.from("incidents").insert({
      driver_id: driver,
      vehicle_id: vehicleId !== NONE ? Number(vehicleId) : null,
      job_id: jobId !== NONE ? Number(jobId) : null,
      incident_type: type,
      description: description.trim(),
      location_address: address.trim() || null,
      location_lat: lat,
      location_lng: lng,
      third_party_involved: thirdParty,
      reported_to_police: policeRef.trim().length > 0,
      police_reference: policeRef.trim() || null,
      status: "reported",
    });
    setSaving(false);
    if (error) { toast.error(readError(error)); return; }
    toast.success("Incident reported");
    setDescription(""); setAddress(""); setPoliceRef(""); setThirdParty(false);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Report an incident</DialogTitle></DialogHeader>
        <form id="incident-form" onSubmit={submit} className="space-y-3">
          {!fixedDriverId && drivers && (
            <SelectField id="inc-driver" label="Driver *" value={driverId} onChange={setDriverId} options={drivers} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inc-type">Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="inc-type" aria-label="Incident type"><SelectValue /></SelectTrigger>
                <SelectContent>{INCIDENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {vehicles && <SelectField id="inc-vehicle" label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicles} allowNone />}
          </div>
          {jobs && jobs.length > 0 && <SelectField id="inc-job" label="Job" value={jobId} onChange={setJobId} options={jobs} allowNone />}
          <div className="space-y-1.5">
            <Label htmlFor="inc-desc">What happened? *</Label>
            <Textarea id="inc-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-address">Location</Label>
            <Input id="inc-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Road, junction or postcode" />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={thirdParty} onChange={(e) => setThirdParty(e.target.checked)} />
              Third party involved
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="inc-police">Police reference</Label>
              <Input id="inc-police" value={policeRef} onChange={(e) => setPoliceRef(e.target.value)} />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="incident-form" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Report incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LogFuelDialog({ open, onOpenChange, drivers, vehicles, fixedDriverId, defaultVehicleId, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers?: Option[];
  vehicles?: Option[];
  fixedDriverId?: number;
  defaultVehicleId?: number | null;
  onSaved?: () => void;
}) {
  const [driverId, setDriverId] = useState(fixedDriverId ? String(fixedDriverId) : "");
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ? String(defaultVehicleId) : NONE);
  const [fuelType, setFuelType] = useState("diesel");
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [mileage, setMileage] = useState("");
  const [station, setStation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const driver = fixedDriverId ?? Number(driverId);
    const amount = Number(litres);
    const price = cost.trim() ? Number(cost) : null;
    const miles = mileage.trim() ? Number.parseInt(mileage, 10) : null;
    if (!driver) { toast.error("Choose the driver"); return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 2000) { toast.error("Enter the litres filled (0–2000)"); return; }
    if (price !== null && (!Number.isFinite(price) || price < 0)) { toast.error("Enter a valid cost"); return; }
    if (miles !== null && (!Number.isFinite(miles) || miles < 0)) { toast.error("Enter a valid odometer reading"); return; }
    setSaving(true);
    const { error } = await supabase.from("fuel_logs").insert({
      driver_id: driver,
      vehicle_id: vehicleId !== NONE ? Number(vehicleId) : null,
      fuel_type: fuelType,
      fuel_amount: amount,
      fuel_cost: price,
      mileage: miles,
      station_name: station.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(readError(error)); return; }
    toast.success("Fuel logged");
    setLitres(""); setCost(""); setMileage(""); setStation("");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log a fuel fill</DialogTitle></DialogHeader>
        <form id="fuel-form" onSubmit={submit} className="space-y-3">
          {!fixedDriverId && drivers && (
            <SelectField id="fuel-driver" label="Driver *" value={driverId} onChange={setDriverId} options={drivers} />
          )}
          {vehicles && <SelectField id="fuel-vehicle" label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicles} allowNone />}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fuel-type">Fuel</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger id="fuel-type" aria-label="Fuel type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="adblue">AdBlue</SelectItem>
                  <SelectItem value="hvo">HVO</SelectItem>
                  <SelectItem value="petrol">Petrol</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fuel-litres">Litres *</Label>
              <Input id="fuel-litres" inputMode="decimal" value={litres} onChange={(e) => setLitres(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fuel-cost">Cost (£)</Label>
              <Input id="fuel-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fuel-mileage">Odometer (mi)</Label>
              <Input id="fuel-mileage" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fuel-station">Station</Label>
            <Input id="fuel-station" value={station} onChange={(e) => setStation(e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="fuel-form" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save fuel log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
