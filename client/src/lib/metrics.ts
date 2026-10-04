/**
 * Reporting rules shared by the Dashboard, Analytics, Fuel and Reports pages.
 * Kept free of React so each rule can be unit-tested.
 */

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (YYYY-MM-DD) of a moment in UK time. */
export function londonDay(at: string | number | Date): string {
  return LONDON_DAY.format(new Date(at));
}

/** Completed today (UK time) by its recorded completion time only; a job without one is not counted. */
export function completedToday(job: { status: string; completed_at: string | null }, now: number = Date.now()): boolean {
  return job.status === "completed" && !!job.completed_at && londonDay(job.completed_at) === londonDay(now);
}

export type TimeRange = "day" | "week" | "month";

/**
 * A job belongs to a period by its completion time when completed, otherwise
 * by when it was created. "day" is today in UK time; "week" and "month" are
 * the last 7 and 30 days.
 */
export function jobInRange(job: { completed_at: string | null; created_at: string }, range: TimeRange, now: number = Date.now()): boolean {
  const t = new Date(job.completed_at ?? job.created_at).getTime();
  if (!Number.isFinite(t) || t > now) return false;
  if (range === "day") return londonDay(t) === londonDay(now);
  return t >= now - (range === "week" ? 7 : 30) * 86400000;
}

/** Average cost of the fills that have a cost. Fills without a cost are left out, not counted as £0. */
export function avgCostPerCostedFill(logs: Array<{ fuel_cost: number | null }>): number | null {
  const costed = logs.filter((l) => l.fuel_cost != null);
  return costed.length ? costed.reduce((s, l) => s + Number(l.fuel_cost), 0) / costed.length : null;
}

/** Vehicles on a job that is in progress right now (measured, unlike the manual vehicle status). */
export function vehiclesOnActiveJobs(jobs: Array<{ status: string; vehicle_id: number | null }>): number {
  return new Set(jobs.filter((j) => j.status === "in_progress" && j.vehicle_id != null).map((j) => j.vehicle_id)).size;
}

/** Completed jobs per driver, counted from the jobs themselves. */
export function completedByDriver(jobs: Array<{ status: string; driver_id: number | null }>): Map<number, number> {
  const m = new Map<number, number>();
  jobs.forEach((j) => { if (j.status === "completed" && j.driver_id != null) m.set(j.driver_id, (m.get(j.driver_id) ?? 0) + 1); });
  return m;
}

/**
 * One CSV cell. Quotes are doubled, and a value a spreadsheet would run as a
 * formula (starting with = + - @, tab or carriage return) is prefixed with an
 * apostrophe so it is shown as text.
 */
export function csvCell(value: unknown): string {
  let v = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}
