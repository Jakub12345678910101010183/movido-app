/**
 * Display labels for the Office incident list/detail. Jobs and vehicles come
 * from the same RLS-scoped queries as the rest of the Office, so a label can
 * only ever be built from the signed-in company's own records.
 */
type VehicleRef = { id: number; vehicle_id: string; registration: string | null };
type JobRef = { id: number; reference: string };

/** "QA-HGV-01 · AB12 CDE", or just "QA-HGV-01" when there is no registration. */
export function incidentVehicleLabel(id: number | null, vehicles: VehicleRef[]): string {
  if (id == null) return "No vehicle";
  const v = vehicles.find((x) => x.id === id);
  if (!v) return "Vehicle not available";
  const reg = v.registration?.trim();
  return reg ? `${v.vehicle_id} · ${reg}` : v.vehicle_id;
}

/** Linked job reference, or a clear "no job" state. */
export function incidentJobLabel(id: number | null, jobs: JobRef[]): { text: string; linked: boolean } {
  if (id == null) return { text: "No linked job", linked: false };
  const j = jobs.find((x) => x.id === id);
  return j ? { text: j.reference, linked: true } : { text: "Job not available", linked: false };
}
