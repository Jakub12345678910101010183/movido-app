import { describe, expect, it } from "vitest";
import { LIVE_POSITION_MAX_AGE_MS, isLivePosition, liveVehicles, positionAge } from "./livePosition";

const NOW = Date.parse("2026-09-28T09:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const vehicle = (id: number, updated: string | null, lat: number | null = 52.2) =>
  ({ id, location_lat: lat, location_lng: lat == null ? null : -0.9, location_updated_at: updated });

describe("isLivePosition", () => {
  it("treats recent positions as live", () => {
    expect(isLivePosition(ago(60_000), NOW)).toBe(true);
    expect(isLivePosition(ago(LIVE_POSITION_MAX_AGE_MS), NOW)).toBe(true);
  });
  it("treats old or unknown positions as not live", () => {
    expect(isLivePosition(ago(LIVE_POSITION_MAX_AGE_MS + 1000), NOW)).toBe(false);
    expect(isLivePosition(null, NOW)).toBe(false);
    expect(isLivePosition("not a date", NOW)).toBe(false);
  });
  it("uses the same 12 hour window as the driver map", () => {
    expect(LIVE_POSITION_MAX_AGE_MS).toBe(12 * 3600 * 1000);
  });
});

describe("liveVehicles (dashboard vehicle markers)", () => {
  it("shows a vehicle with a fresh position", () => {
    expect(liveVehicles([vehicle(1, ago(5 * 60_000))], NOW).map((v) => v.id)).toEqual([1]);
  });
  it("hides a vehicle whose position is stale", () => {
    expect(liveVehicles([vehicle(2, ago(3 * 24 * 3600 * 1000))], NOW)).toEqual([]);
  });
  it("hides a vehicle whose position time is unknown or that has no position", () => {
    expect(liveVehicles([vehicle(3, null), vehicle(4, ago(60_000), null)], NOW)).toEqual([]);
  });
  it("keeps only the fresh vehicles from a mixed fleet", () => {
    const fleet = [vehicle(1, ago(60_000)), vehicle(2, ago(13 * 3600 * 1000)), vehicle(3, null)];
    expect(liveVehicles(fleet, NOW).map((v) => v.id)).toEqual([1]);
  });
});

describe("positionAge", () => {
  it("labels the age of a position", () => {
    expect(positionAge(ago(10_000), NOW)).toBe("just now");
    expect(positionAge(ago(25 * 60_000), NOW)).toBe("25 min ago");
    expect(positionAge(ago(3 * 3600 * 1000), NOW)).toBe("3 h ago");
    expect(positionAge(null, NOW)).toBe("time unknown");
  });
});
