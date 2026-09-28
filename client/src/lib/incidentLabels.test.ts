import { describe, expect, it } from "vitest";
import { incidentJobLabel, incidentVehicleLabel } from "./incidentLabels";

const vehicles = [
  { id: 10, vehicle_id: "QA-HGV-01", registration: null },
  { id: 11, vehicle_id: "QA-HGV-02", registration: "QA71 ABC" },
  { id: 12, vehicle_id: "QA-HGV-03", registration: "   " },
];
const jobs = [{ id: 53, reference: "QA-DRV-715080" }];

describe("incidentVehicleLabel", () => {
  it("shows only the vehicle name when there is no registration (never 'Unknown')", () => {
    expect(incidentVehicleLabel(10, vehicles)).toBe("QA-HGV-01");
    expect(incidentVehicleLabel(12, vehicles)).toBe("QA-HGV-03");
    expect(incidentVehicleLabel(10, vehicles)).not.toMatch(/unknown/i);
  });
  it("shows vehicle name and registration when both exist", () => {
    expect(incidentVehicleLabel(11, vehicles)).toBe("QA-HGV-02 · QA71 ABC");
  });
  it("handles incidents without a vehicle", () => {
    expect(incidentVehicleLabel(null, vehicles)).toBe("No vehicle");
    expect(incidentVehicleLabel(99, vehicles)).toBe("Vehicle not available");
  });
});

describe("incidentJobLabel", () => {
  it("shows the linked job reference (incident #21 → QA-DRV-715080)", () => {
    expect(incidentJobLabel(53, jobs)).toEqual({ text: "QA-DRV-715080", linked: true });
  });
  it("makes it clear when there is no linked job", () => {
    expect(incidentJobLabel(null, jobs)).toEqual({ text: "No linked job", linked: false });
  });
  it("never shows anything but the reference of a job the office can read", () => {
    // A job outside the RLS-scoped list (another company, or deleted) is not named.
    expect(incidentJobLabel(20, jobs)).toEqual({ text: "Job not available", linked: false });
  });
});
