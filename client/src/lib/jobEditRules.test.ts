import { describe, expect, it, vi } from "vitest";
import { assignmentLocked, changedFields, isJobClosed, jobRuleMessage, mergeStops, startedStopCount, statusOptions } from "./jobEditRules";

const done = {
  label: "S1", address: "1 A St", lat: 51.1, lng: -1, status: "completed", arrived_at: "2026-10-04T08:00:00Z", completed_at: "2026-10-04T08:10:00Z",
  completed_lat: 51.1, completed_lng: -1, completed_accuracy_m: 5, completed_distance_m: 3, completed_location_check: "ok", completed_location_source: "device",
};
const arrived = {
  label: "S2", address: "2 A St", lat: 51.2, lng: -1, status: "arrived", arrived_at: "2026-10-04T09:00:00Z",
  arrived_lat: 51.2, arrived_lng: -1, arrived_accuracy_m: 6, arrived_distance_m: 4, arrived_location_check: "ok", arrived_location_source: "geofence",
};
const pending = { label: "S3", address: "3 A St", lat: 51.3, lng: -1, status: "pending", completed_at: null };
const stored = [done, arrived, pending];
const form = (stops: Record<string, unknown>[]) => stops.map((s) => ({ label: String(s.label), address: String(s.address), original: s }));

describe("startedStopCount", () => {
  it("counts up to the last stop that is not pending", () => {
    expect(startedStopCount(stored)).toBe(2);
    expect(startedStopCount([pending])).toBe(0);
    expect(startedStopCount(null)).toBe(0);
    expect(startedStopCount([pending, arrived])).toBe(2);
  });
});

describe("mergeStops", () => {
  it("keeps started stops byte-for-byte and never geocodes them", async () => {
    const geocode = vi.fn(async () => ({ lat: 0, lng: 0 }));
    const f = form(stored);
    f[0].address = "edited"; f[1].label = "edited";
    const { stops } = await mergeStops(stored, f, geocode);
    expect(stops[0]).toEqual(done);
    expect(stops[1]).toEqual(arrived);
    expect(geocode).not.toHaveBeenCalled();
  });
  it("keeps every field of an unchanged pending stop (no geocode)", async () => {
    const geocode = vi.fn(async () => ({ lat: 0, lng: 0 }));
    const { stops } = await mergeStops(stored, form(stored), geocode);
    expect(stops).toEqual(stored);
    expect(geocode).not.toHaveBeenCalled();
  });
  it("geocodes only a pending stop whose address changed", async () => {
    const geocode = vi.fn(async () => ({ lat: 52, lng: -2 }));
    const f = form(stored);
    f[2].address = "3B A St";
    const { stops } = await mergeStops(stored, f, geocode);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith("3B A St");
    expect(stops[2]).toEqual({ ...pending, address: "3B A St", lat: 52, lng: -2 });
  });
  it("adds a new pending stop and counts unlocated addresses", async () => {
    const { stops, unlocated } = await mergeStops(stored, [...form(stored), { label: "", address: "4 A St", original: null }], async () => null);
    expect(stops).toHaveLength(4);
    expect(stops[3]).toEqual({ status: "pending", completed_at: null, label: "Stop 4", address: "4 A St", lat: null, lng: null });
    expect(unlocated).toBe(1);
  });
  it("drops an emptied pending stop but never a started one", async () => {
    const f = form(stored);
    f[2].address = "  ";
    const { stops } = await mergeStops(stored, f, async () => null);
    expect(stops).toEqual([done, arrived]);
  });
});

describe("status and field rules", () => {
  it("offers only the allowed statuses", () => {
    expect(statusOptions(null)).toEqual(["pending", "assigned"]);
    expect(statusOptions("pending")).toEqual(["pending", "assigned", "cancelled"]);
    expect(statusOptions("assigned")).toEqual(["pending", "assigned", "cancelled"]);
    expect(statusOptions("in_progress")).toEqual(["in_progress", "cancelled"]);
    expect(statusOptions("completed")).toEqual(["completed"]);
    expect(statusOptions("cancelled")).toEqual(["cancelled"]);
    for (const s of ["pending", "assigned", "in_progress"] as const) expect(statusOptions(s)).not.toContain("completed");
  });
  it("locks assignment once started and treats completed/cancelled as closed", () => {
    expect(assignmentLocked(null)).toBe(false);
    expect(assignmentLocked("assigned")).toBe(false);
    expect(assignmentLocked("in_progress")).toBe(true);
    expect(isJobClosed("completed")).toBe(true);
    expect(isJobClosed("cancelled")).toBe(true);
    expect(isJobClosed("in_progress")).toBe(false);
  });
});

describe("changedFields", () => {
  it("returns only changed values (stops compared by content)", () => {
    const job = { priority: "medium", stops: stored, driver_notes: null, customer: "C" };
    expect(changedFields(job, { priority: "medium", stops: [...stored], driver_notes: null, customer: "C" })).toEqual({});
    expect(changedFields(job, { priority: "urgent", stops: stored, driver_notes: "", customer: "C" })).toEqual({ priority: "urgent", driver_notes: "" });
  });
});

describe("jobRuleMessage", () => {
  it("explains database refusals", () => {
    expect(jobRuleMessage("STOP_HISTORY_LOCKED")).toMatch(/cannot be changed/);
    expect(jobRuleMessage("INVALID_TRANSITION")).toMatch(/not allowed/);
    expect(jobRuleMessage("POD_READ_ONLY")).toMatch(/driver/);
    expect(jobRuleMessage("something else")).toBeNull();
  });
});
