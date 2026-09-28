import { describe, expect, it } from "vitest";
import { completeDelivery, driverActionMessage, markStop, nextStopIndex, startJob, type RpcClient } from "./driverJobActions";

type Call = { fn: string; args: Record<string, unknown> };
function client(results: Array<{ error: { message: string; code?: string } | null }>) {
  const calls: Call[] = [];
  const c: RpcClient & { calls: Call[]; from: () => never } = {
    calls,
    rpc(fn, args) { calls.push({ fn, args }); return Promise.resolve({ data: null, error: (results.shift() ?? { error: null }).error }); },
    // Any direct table access is a test failure: drivers must not update jobs directly.
    from() { throw new Error("direct table access is not allowed"); },
  };
  return c;
}
const fast = { attempts: 3, delayMs: 1 };

describe("startJob", () => {
  it("uses driver_start_job, never a direct jobs update", async () => {
    const c = client([{ error: null }]);
    expect(await startJob(c, 42, fast)).toEqual({ ok: true });
    expect(c.calls).toEqual([{ fn: "driver_start_job", args: { p_job_id: 42 } }]);
  });
  it("reports a closed or foreign job without retrying", async () => {
    const c = client([{ error: { message: "JOB_NOT_FOUND", code: "MV404" } }]);
    expect(await startJob(c, 42, fast)).toEqual({ ok: false, message: "This job is no longer assigned to you." });
    expect(c.calls).toHaveLength(1);
  });
});

describe("completeDelivery", () => {
  it("calls driver_complete_job with photo, signature, recipient and notes kept separate", async () => {
    const c = client([{ error: null }]);
    const r = await completeDelivery(c, {
      jobId: 20, photoPath: "org/20/1.jpg", signature: "data:image/png;base64,AA==",
      recipient: "  Jo Bloggs ", notes: " Left at gate ", capturedAt: "2026-09-28T10:00:00.000Z",
    }, fast);
    expect(r).toEqual({ ok: true });
    expect(c.calls).toEqual([{ fn: "driver_complete_job", args: {
      p_job_id: 20, p_photo_path: "org/20/1.jpg", p_signature: "data:image/png;base64,AA==",
      p_recipient: "Jo Bloggs", p_notes: "Left at gate", p_lat: null, p_lng: null, p_captured_at: "2026-09-28T10:00:00.000Z",
    } }]);
  });
  it("sends empty recipient/notes as null and passes a position when known", async () => {
    const c = client([{ error: null }]);
    await completeDelivery(c, { jobId: 1, photoPath: null, signature: "data:image/png;base64,AA==", recipient: " ", notes: "", lat: 52.1, lng: -0.8 }, fast);
    expect(c.calls[0].args).toMatchObject({ p_recipient: null, p_notes: null, p_photo_path: null, p_lat: 52.1, p_lng: -0.8 });
    expect(typeof c.calls[0].args.p_captured_at).toBe("string");
  });
  it("retries a network failure, then succeeds (the server treats a repeat as a no-op)", async () => {
    const c = client([{ error: { message: "Failed to fetch" } }, { error: null }]);
    expect(await completeDelivery(c, { jobId: 1, photoPath: null, signature: "data:x", recipient: "", notes: "" }, fast)).toEqual({ ok: true });
    expect(c.calls).toHaveLength(2);
  });
  it("does not retry server refusals and shows a clear message", async () => {
    for (const [code, text] of [
      ["POD_REQUIRED", "Add a delivery photo or the recipient's signature."],
      ["INVALID_PHOTO_PATH", "The delivery photo was not saved for this job. Take it again."],
      ["PHOTO_NOT_UPLOADED", "The delivery photo did not finish uploading. Try again."],
      ["JOB_CLOSED", "This job is closed and cannot be changed."],
    ] as const) {
      const c = client([{ error: { message: code, code: "MV400" } }]);
      expect(await completeDelivery(c, { jobId: 1, photoPath: null, signature: null, recipient: "", notes: "" }, fast)).toEqual({ ok: false, message: text });
      expect(c.calls).toHaveLength(1);
    }
  });
  it("falls back to a generic message after repeated network errors", async () => {
    const c = client([{ error: { message: "timeout" } }, { error: { message: "timeout" } }, { error: { message: "timeout" } }]);
    expect(await completeDelivery(c, { jobId: 1, photoPath: null, signature: "data:x", recipient: "", notes: "" }, fast))
      .toEqual({ ok: false, message: "Could not complete the delivery" });
    expect(c.calls).toHaveLength(3);
  });
});

describe("driverActionMessage", () => {
  it("maps known refusals and keeps a fallback", () => {
    expect(driverActionMessage({ message: "NOT_A_DRIVER" }, "x")).toBe("Only drivers can do this.");
    expect(driverActionMessage({ message: "something else" }, "fallback")).toBe("fallback");
  });
});

describe("markStop", () => {
  it("uses driver_mark_stop (server time), never driver_update_stop or a direct update", async () => {
    const c = client([{ error: null }]);
    expect((await markStop(c, 7, 0, "arrived", fast)).ok).toBe(true);
    expect(c.calls).toEqual([{ fn: "driver_mark_stop", args: { p_job_id: 7, p_stop_index: 0, p_status: "arrived", p_at: null } }]);
  });
  it.each([
    ["STOP_ORDER", "Complete the previous stop first."],
    ["STOP_ALREADY_COMPLETED", "This stop is already delivered."],
  ])("reports %s without retrying", async (code, message) => {
    const c = client([{ error: { message: code, code: "MV409" } }]);
    expect(await markStop(c, 7, 1, "completed", fast)).toEqual({ ok: false, message });
    expect(c.calls).toHaveLength(1);
  });
  it("retries a network failure", async () => {
    const c = client([{ error: { message: "Failed to fetch" } }, { error: null }]);
    expect((await markStop(c, 7, 0, "completed", fast)).ok).toBe(true);
    expect(c.calls).toHaveLength(2);
  });
});

describe("completion with pending stops", () => {
  it("reports STOPS_PENDING without retrying", async () => {
    const c = client([{ error: { message: "STOPS_PENDING", code: "MV409" } }]);
    const r = await completeDelivery(c, { jobId: 7, photoPath: null, signature: "data:image/png;base64,AA==", recipient: "", notes: "" }, fast);
    expect(r).toEqual({ ok: false, message: "Deliver every stop before completing the job." });
    expect(c.calls).toHaveLength(1);
  });
});

describe("nextStopIndex", () => {
  it("is the first stop not delivered, or null when all are delivered", () => {
    expect(nextStopIndex([])).toBeNull();
    expect(nextStopIndex([{ status: "completed" }, { status: "arrived" }, { status: "pending" }])).toBe(1);
    expect(nextStopIndex([{ status: "pending" }, { status: "pending" }])).toBe(0);
    expect(nextStopIndex([{ status: "completed" }, { status: "completed" }])).toBeNull();
  });
});
