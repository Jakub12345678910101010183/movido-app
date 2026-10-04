/**
 * Office notifications to drivers.
 *
 * A notice is saved as a message; the messages_push_notify database trigger
 * then sends the push to the driver's phone (pg_net → Expo), scoped to the
 * company. The browser never calls the Expo push service itself: that call
 * was blocked by CORS and needed the drivers' push tokens in the browser.
 */

export type NoticeType = "info" | "urgent" | "job" | "alert";

export const NOTICE_TITLES: Record<NoticeType, string> = {
  info: "Dispatch Info",
  urgent: "URGENT",
  job: "New Job Assigned",
  alert: "Dispatch Alert",
};

/** Urgent and alert notices use the alert channel ("Urgent message" push title). */
export function noticeChannel(type: NoticeType): "alert" | "dispatch" {
  return type === "urgent" || type === "alert" ? "alert" : "dispatch";
}

export function noticeContent(type: NoticeType, text: string): string {
  return `${NOTICE_TITLES[type]}: ${text.trim()}`;
}

type InsertResult = { error: { message: string } | null };
export interface MessagesClient {
  from(table: "messages"): { insert(row: Record<string, unknown>): PromiseLike<InsertResult> };
}

/**
 * Sends a notice to one driver (by their app account) or, with "broadcast",
 * to every driver in the company. The organisation is set by the database.
 */
export async function sendDriverNotice(
  client: MessagesClient,
  input: { senderId: string; recipient: string | "broadcast"; type: NoticeType; text: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!input.text.trim()) return { ok: false, message: "Please enter a message" };
  if (!input.recipient) return { ok: false, message: "This driver has not set up the Movido Driver app yet" };
  const { error } = await client.from("messages").insert({
    sender_id: input.senderId,
    recipient_id: input.recipient,
    channel: noticeChannel(input.type),
    content: noticeContent(input.type, input.text),
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}
