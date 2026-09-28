/**
 * Driver job actions for the web Driver workspace. Drivers never update the
 * jobs row directly: starting, stops and completing go through the same checked
 * database functions the native app uses (driver_start_job, driver_mark_stop,
 * driver_complete_job), which verify the driver, the organisation, the stop
 * order and the proof of delivery.
 */
type RpcError = { message: string; code?: string } | null;
export type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }> };

/** Server refusals that a retry cannot fix. */
const MESSAGES: Record<string, string> = {
  POD_REQUIRED: "Add a delivery photo or the recipient's signature.",
  INVALID_PHOTO_PATH: "The delivery photo was not saved for this job. Take it again.",
  PHOTO_NOT_UPLOADED: "The delivery photo did not finish uploading. Try again.",
  INVALID_SIGNATURE: "The signature could not be read. Clear it and sign again.",
  INVALID_POSITION: "The location was not valid.",
  JOB_CLOSED: "This job is closed and cannot be changed.",
  JOB_NOT_FOUND: "This job is no longer assigned to you.",
  NOT_A_DRIVER: "Only drivers can do this.",
  STOP_ORDER: "Complete the previous stop first.",
  STOP_ALREADY_COMPLETED: "This stop is already delivered.",
  STOPS_PENDING: "Deliver every stop before completing the job.",
  STOP_NOT_FOUND: "This stop no longer exists on the job.",
  INVALID_STATUS: "That action is not possible for this stop.",
};

export function driverActionMessage(error: RpcError, fallback: string): string {
  if (!error) return fallback;
  const key = Object.keys(MESSAGES).find((k) => error.message?.includes(k));
  return key ? MESSAGES[key] : fallback;
}

function isFinal(error: RpcError): boolean {
  return !!error && (Object.keys(MESSAGES).some((k) => error.message?.includes(k)) || /^MV4/.test(error.code ?? ""));
}

async function call(client: RpcClient, fn: string, args: Record<string, unknown>, attempts: number, delayMs: number) {
  let r = await client.rpc(fn, args);
  for (let i = 1; i < attempts && r.error && !isFinal(r.error); i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * i));
    r = await client.rpc(fn, args);
  }
  return r;
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function startJob(client: RpcClient, jobId: number, opts = { attempts: 4, delayMs: 1000 }): Promise<ActionResult> {
  const { error } = await call(client, "driver_start_job", { p_job_id: jobId }, opts.attempts, opts.delayMs);
  return error ? { ok: false, message: driverActionMessage(error, "Could not start the job") } : { ok: true };
}

export type StopResult = { ok: true; stops: unknown } | { ok: false; message: string };

/** Stops move in order: the server refuses a stop before the previous one is delivered. */
export async function markStop(client: RpcClient, jobId: number, stopIndex: number, status: "arrived" | "completed",
  opts = { attempts: 4, delayMs: 1000 }): Promise<StopResult> {
  const { data, error } = await call(client, "driver_mark_stop", {
    p_job_id: jobId, p_stop_index: stopIndex, p_status: status, p_at: null,
  }, opts.attempts, opts.delayMs);
  return error ? { ok: false, message: driverActionMessage(error, "Could not update the stop") } : { ok: true, stops: data };
}

/** Index of the stop the driver can act on now (first not delivered), or null when all are delivered. */
export function nextStopIndex(stops: { status?: string }[]): number | null {
  const i = stops.findIndex((s) => s.status !== "completed");
  return i === -1 ? null : i;
}

export type DeliveryInput = {
  jobId: number;
  photoPath: string | null;   // already uploaded to pod-photos/<org>/<job>/...
  signature: string | null;   // data:image/png;base64,...
  recipient: string;
  notes: string;
  lat?: number | null;
  lng?: number | null;
  capturedAt?: string;        // ISO time the proof was captured
};

/** Idempotent on the server: a retried call after a lost response returns "completed". */
export async function completeDelivery(client: RpcClient, input: DeliveryInput, opts = { attempts: 4, delayMs: 1000 }): Promise<ActionResult> {
  const { error } = await call(client, "driver_complete_job", {
    p_job_id: input.jobId,
    p_photo_path: input.photoPath,
    p_signature: input.signature,
    p_recipient: input.recipient.trim() || null,
    p_notes: input.notes.trim() || null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_captured_at: input.capturedAt ?? new Date().toISOString(),
  }, opts.attempts, opts.delayMs);
  return error ? { ok: false, message: driverActionMessage(error, "Could not complete the delivery") } : { ok: true };
}
