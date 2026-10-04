/**
 * Office job editing rules. Mirrors public.jobs_office_guard, which enforces
 * them in the database; this file keeps the Office form from building writes
 * the database will refuse, and from rebuilding stops (which used to erase
 * arrival times and location evidence).
 */

export type JobStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled";

/** A stop as edited in the form; `original` is the stored stop, untouched. */
export interface FormStop {
  label: string;
  address: string;
  original: Record<string, unknown> | null;
}

export const isJobClosed = (status: JobStatus) => status === "completed" || status === "cancelled";

const stopStatus = (s: unknown) =>
  typeof s === "object" && s !== null && typeof (s as Record<string, unknown>).status === "string"
    ? ((s as Record<string, unknown>).status as string)
    : "pending";

/** Stops up to and including the last one that is not pending (stop order makes them a prefix). */
export function startedStopCount(stops: unknown): number {
  if (!Array.isArray(stops)) return 0;
  let n = 0;
  stops.forEach((s, i) => { if (stopStatus(s) !== "pending") n = i + 1; });
  return n;
}

/** Statuses the Office may choose: creating, or editing a job with this status. */
export function statusOptions(current: JobStatus | null): JobStatus[] {
  if (current === null) return ["pending", "assigned"];
  if (current === "pending" || current === "assigned") return ["pending", "assigned", "cancelled"];
  if (current === "in_progress") return ["in_progress", "cancelled"];
  return [current];
}

/** Driver, vehicle and reference are fixed once the driver has started. */
export const assignmentLocked = (status: JobStatus | null) => status !== null && status !== "pending" && status !== "assigned";

/**
 * Stops to save. Started stops are returned exactly as stored. A pending stop
 * keeps every stored field; only its label/address change, and it is
 * geocoded again only when its address changed (or it never had a position).
 */
export async function mergeStops(
  stored: unknown,
  form: FormStop[],
  geocode: (address: string) => Promise<{ lat: number; lng: number } | null>,
): Promise<{ stops: Record<string, unknown>[]; unlocated: number }> {
  const started = startedStopCount(stored);
  const storedArr = Array.isArray(stored) ? (stored as Record<string, unknown>[]) : [];
  let unlocated = 0;
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < form.length; i++) {
    const f = form[i];
    if (i < started) { out.push(storedArr[i]); continue; }
    const address = f.address.trim();
    if (!address) continue;
    const label = f.label.trim() || `Stop ${out.length + 1}`;
    const orig = f.original;
    const hasPosition = orig && typeof orig.lat === "number" && typeof orig.lng === "number";
    if (orig && orig.address === address && hasPosition) {
      out.push({ ...orig, label, address });
      continue;
    }
    const pos = await geocode(address);
    if (!pos) unlocated++;
    out.push({ ...(orig ?? { status: "pending", completed_at: null }), label, address, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
  }
  return { stops: out, unlocated };
}

/** Only the fields whose value differs from the stored job. */
export function changedFields<T extends Record<string, unknown>>(stored: Record<string, unknown>, next: T): Partial<T> {
  const diff: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (JSON.stringify(next[key] ?? null) !== JSON.stringify(stored[key as string] ?? null)) diff[key] = next[key];
  }
  return diff;
}

const MESSAGES: Record<string, string> = {
  STOP_HISTORY_LOCKED: "Stops the driver has already reached or delivered cannot be changed, removed or reordered.",
  INVALID_TRANSITION: "That status change is not allowed. Jobs are started and completed by the driver.",
  JOB_CLOSED: "Completed and cancelled jobs are read-only.",
  JOB_FIELD_LOCKED: "Driver, vehicle and reference cannot change once the driver has started the job.",
  POD_READ_ONLY: "Proof of delivery is recorded by the driver and cannot be changed in the Office.",
  CANCELLATION_REASON_REQUIRED: "Enter a reason to cancel the job.",
  ASSIGNED_REQUIRES_DRIVER: "Choose a driver before setting the job to Assigned.",
};

/** Plain-language text for a database refusal, or null when it is not one of ours. */
export function jobRuleMessage(message: string | undefined | null): string | null {
  if (!message) return null;
  const code = Object.keys(MESSAGES).find((c) => message.startsWith(c));
  return code ? MESSAGES[code] : null;
}
