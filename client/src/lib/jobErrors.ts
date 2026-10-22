/** Translate database guard errors on jobs into actions the dispatcher can take. */
const JOB_ERROR_MESSAGES: Record<string, string> = {
  INVALID_TRANSITION: "That status change is not allowed. Use Pending, Assigned, or cancel the job.",
  CANCELLATION_REASON_REQUIRED: "Enter a reason before cancelling this job.",
  ASSIGNED_REQUIRES_DRIVER: "Assign a driver before changing the job to Assigned.",
  POD_READ_ONLY: "Proof of delivery can only be added by the driver.",
  JOB_CLOSED: "Completed and cancelled jobs cannot be edited.",
  JOB_FIELD_LOCKED: "The reference, driver, and vehicle cannot be changed after a job starts.",
  STOP_HISTORY_LOCKED: "Stops already reached by the driver cannot be changed.",
};

/** Supabase errors are plain objects, not Error instances. */
export function jobErrorMessage(err: unknown): string {
  const message = err instanceof Error
    ? err.message
    : typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message
      : "";
  const code = typeof err === "object" && err !== null && "code" in err ? String(err.code) : undefined;
  if (code === "23505") return "That reference is already used by another job";
  const domainCode = Object.keys(JOB_ERROR_MESSAGES).find((key) => message.includes(key));
  if (domainCode) return JOB_ERROR_MESSAGES[domainCode];
  if (code === "MV400") return "Check the required job details and try again.";
  if (code === "MV409") return "This change is no longer allowed. Refresh the job and try again.";
  return message || "Something went wrong";
}
