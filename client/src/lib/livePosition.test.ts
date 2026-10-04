import { describe, expect, it } from "vitest";
import { LIVE_POSITION_MAX_AGE_MS, STALE_POSITION_MS, isLivePosition, isStalePosition, liveVehicles, positionAge, positionMarker, positionStatus } from "./livePosition";
import { STALE_MARKER_COLOR, markerColor } from "../components/TomTomMap";

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

describe("isStalePosition", () => {
  it("marks a position older than 15 minutes, or missing, as stale", () => {
    expect(isStalePosition(ago(60_000), NOW)).toBe(false);
    expect(isStalePosition(ago(STALE_POSITION_MS + 1000), NOW)).toBe(true);
    expect(isStalePosition(null, NOW)).toBe(true);
    expect(isStalePosition("not a date", NOW)).toBe(true);
  });
});

describe("O-5: office map marker freshness", () => {
  const marker = (reportedAt: string | null, now = NOW) =>
    positionMarker({ id: "driver-8", lat: 50.75, lng: -1.9, label: "QA-HGV-01", status: "available", popupHtml: "<strong>QA Driver</strong>", reportedAt, now });

  it("a position reported 16 minutes ago is stale, grey and labelled as the last known position", () => {
    const m = marker(ago(16 * 60_000));
    expect(m.stale).toBe(true);
    expect(m.popup).toBe("<strong>QA Driver</strong><br/>Last known position 16 min ago");
    expect(markerColor(m)).toBe(STALE_MARKER_COLOR);
    expect(STALE_MARKER_COLOR).toBe("#6B7280");
  });

  it("a position reported 5 minutes ago is current and keeps the vehicle colour", () => {
    const m = marker(ago(5 * 60_000));
    expect(m.stale).toBe(false);
    expect(m.popup).toBe("<strong>QA Driver</strong><br/>Updated 5 min ago");
    expect(markerColor(m)).toBe("#00FFD4");
    expect(m.popup).not.toContain("Last known position");
  });

  it("keeps the 15-minute rule exactly: 15 min is current, just over is stale", () => {
    expect(STALE_POSITION_MS).toBe(15 * 60 * 1000);
    expect(marker(ago(STALE_POSITION_MS)).stale).toBe(false);
    expect(marker(ago(STALE_POSITION_MS + 1000)).stale).toBe(true);
  });

  it("is judged by the reported time, not by when the page fetched it", () => {
    // Freshly loaded just now (page refresh), but the phone reported it 2 h ago: still stale.
    const loadedNow = positionMarker({ id: "v", lat: 0, lng: 0, popupHtml: "", reportedAt: new Date(Date.now() - 2 * 3600_000).toISOString() });
    expect(loadedNow.stale).toBe(true);
    expect(loadedNow.popup).toContain("Last known position 2 h ago");
    // Same reported time looks current only while within 15 minutes of it.
    const reported = ago(10 * 60_000);
    expect(positionStatus(reported, NOW).stale).toBe(false);
    expect(positionStatus(reported, NOW + 6 * 60_000).stale).toBe(true);
  });

  it("an unknown report time is never shown as current", () => {
    const m = marker(null);
    expect(m.stale).toBe(true);
    expect(m.popup).toContain("Last known position time unknown");
  });
});
