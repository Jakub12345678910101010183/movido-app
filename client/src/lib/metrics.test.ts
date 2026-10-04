import { describe, expect, it } from "vitest";
import { avgCostPerCostedFill, completedByDriver, completedToday, csvCell, jobInRange, londonDay, toCSV, vehiclesOnActiveJobs } from "./metrics";

const NOW = Date.parse("2026-10-04T12:00:00Z"); // 13:00 in London (BST)

describe("completedToday", () => {
  it("uses completed_at in UK time and never updated_at", () => {
    expect(completedToday({ status: "completed", completed_at: "2026-10-04T08:00:00Z" }, NOW)).toBe(true);
    expect(completedToday({ status: "completed", completed_at: null }, NOW)).toBe(false);
    expect(completedToday({ status: "in_progress", completed_at: "2026-10-04T08:00:00Z" }, NOW)).toBe(false);
  });
  it("puts 23:30 UTC on the next UK day during BST", () => {
    expect(londonDay("2026-10-03T23:30:00Z")).toBe("2026-10-04");
    expect(completedToday({ status: "completed", completed_at: "2026-10-03T23:30:00Z" }, NOW)).toBe(true);
    expect(completedToday({ status: "completed", completed_at: "2026-10-03T22:30:00Z" }, NOW)).toBe(false);
  });
});

describe("jobInRange", () => {
  const job = (at: string, done = false) => ({ created_at: "2026-01-01T00:00:00Z", completed_at: done ? at : null, ...(done ? {} : { created_at: at }) });
  it("filters by completion time, else creation time", () => {
    expect(jobInRange(job("2026-10-04T09:00:00Z", true), "day", NOW)).toBe(true);
    expect(jobInRange(job("2026-10-02T09:00:00Z", true), "day", NOW)).toBe(false);
    expect(jobInRange(job("2026-10-02T09:00:00Z", true), "week", NOW)).toBe(true);
    expect(jobInRange(job("2026-09-20T09:00:00Z"), "week", NOW)).toBe(false);
    expect(jobInRange(job("2026-09-20T09:00:00Z"), "month", NOW)).toBe(true);
    expect(jobInRange(job("2026-10-05T09:00:00Z"), "month", NOW)).toBe(false);
  });
});

describe("avgCostPerCostedFill", () => {
  it("leaves out fills without a cost", () => {
    expect(avgCostPerCostedFill([{ fuel_cost: 100 }, { fuel_cost: null }, { fuel_cost: 300 }])).toBe(200);
    expect(avgCostPerCostedFill([{ fuel_cost: null }])).toBeNull();
    expect(avgCostPerCostedFill([])).toBeNull();
  });
});

describe("measured counts", () => {
  it("counts distinct vehicles on in-progress jobs", () => {
    expect(vehiclesOnActiveJobs([
      { status: "in_progress", vehicle_id: 1 }, { status: "in_progress", vehicle_id: 1 },
      { status: "assigned", vehicle_id: 2 }, { status: "in_progress", vehicle_id: null },
    ])).toBe(1);
  });
  it("counts completed jobs per driver", () => {
    const m = completedByDriver([{ status: "completed", driver_id: 8 }, { status: "completed", driver_id: 8 }, { status: "cancelled", driver_id: 8 }]);
    expect(m.get(8)).toBe(2);
  });
});

describe("csvCell", () => {
  it("neutralises spreadsheet formulas and escapes quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+44 7700")).toBe(`"'+44 7700"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("\tx")).toBe(`"'\tx"`);
    expect(csvCell("Shell M25")).toBe(`"Shell M25"`);
    expect(csvCell(null)).toBe(`""`);
    expect(csvCell(12.5)).toBe(`"12.5"`);
  });
  it("builds rows", () => {
    expect(toCSV(["a", "b"], [["=1", "x"]])).toBe(`"a","b"\n"'=1","x"`);
  });
});
