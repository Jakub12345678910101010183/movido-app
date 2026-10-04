import type { MapMarker } from "@/components/TomTomMap";

/**
 * Freshness rule for positions shown on the office map. A driver or vehicle
 * whose last GPS position is older than this is not presented as live.
 */
export const LIVE_POSITION_MAX_AGE_MS = 12 * 3600 * 1000;

/** True when a position recorded at `iso` counts as live at `now`. Unknown time is not live. */
export function isLivePosition(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t <= LIVE_POSITION_MAX_AGE_MS;
}

/**
 * A position older than this is shown as the last known position, not as
 * where the vehicle is now (drivers report about once a minute while moving).
 */
export const STALE_POSITION_MS = 15 * 60 * 1000;

/** True when a position is missing or older than STALE_POSITION_MS. */
export function isStalePosition(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return !Number.isFinite(t) || now - t > STALE_POSITION_MS;
}

/** How a position is described: "Updated 3 min ago" or "Last known position 2 h ago". */
export function positionStatus(iso: string | null | undefined, now: number = Date.now()): { stale: boolean; text: string } {
  const stale = isStalePosition(iso, now);
  return { stale, text: `${stale ? "Last known position" : "Updated"} ${positionAge(iso, now)}` };
}

/**
 * A vehicle marker for the office map. Freshness comes from `reportedAt`, the
 * time the phone reported the position, never from when the page loaded it.
 * `popupHtml` must already be escaped.
 */
export function positionMarker(input: {
  id: string; lat: number; lng: number; label?: string; status?: string; popupHtml: string;
  reportedAt: string | null | undefined; now?: number;
}): MapMarker {
  const { stale, text } = positionStatus(input.reportedAt, input.now);
  return {
    id: input.id, lat: input.lat, lng: input.lng, label: input.label, type: "vehicle", status: input.status,
    stale, popup: `${input.popupHtml}<br/>${text}`,
  };
}

export function positionAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "time unknown";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

type LocatedVehicle = {
  id: number;
  location_lat: number | null;
  location_lng: number | null;
  location_updated_at: string | null;
};

/** Vehicles whose stored position is recent enough to draw as a live marker. */
export function liveVehicles<V extends LocatedVehicle>(vehicles: V[], now: number = Date.now()): V[] {
  return vehicles.filter((v) => v.location_lat != null && v.location_lng != null && isLivePosition(v.location_updated_at, now));
}
