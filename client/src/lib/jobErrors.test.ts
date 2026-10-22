import { describe, expect, it } from "vitest";
import { jobErrorMessage } from "./jobErrors";

describe("jobErrorMessage", () => {
  it("translates guard errors raised by the database", () => {
    expect(jobErrorMessage({ code: "MV409", message: "JOB_FIELD_LOCKED" }))
      .toBe("The reference, driver, and vehicle cannot be changed after a job starts.");
    expect(jobErrorMessage({ code: "MV400", message: "CANCELLATION_REASON_REQUIRED" }))
      .toBe("Enter a reason before cancelling this job.");
  });

  it("falls back on the error code when the message is unknown", () => {
    expect(jobErrorMessage({ code: "MV409", message: "something new" }))
      .toBe("This change is no longer allowed. Refresh the job and try again.");
  });

  it("keeps the duplicate-reference message and plain errors", () => {
    expect(jobErrorMessage({ code: "23505", message: "duplicate key" })).toBe("That reference is already used by another job");
    expect(jobErrorMessage(new Error("Network down"))).toBe("Network down");
    expect(jobErrorMessage(null)).toBe("Something went wrong");
  });
});
