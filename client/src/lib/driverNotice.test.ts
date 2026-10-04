import { describe, expect, it } from "vitest";
import { noticeChannel, noticeContent, sendDriverNotice, type MessagesClient } from "./driverNotice";

function fakeClient(error: { message: string } | null = null) {
  const rows: Record<string, unknown>[] = [];
  const tables: string[] = [];
  const client: MessagesClient = {
    from(table) {
      tables.push(table);
      return { insert: async (row) => { rows.push(row); return { error }; } };
    },
  };
  return { client, rows, tables };
}

describe("sendDriverNotice", () => {
  it("saves a message for the driver's account instead of calling Expo from the browser", async () => {
    const f = fakeClient();
    const r = await sendDriverNotice(f.client, { senderId: "office-1", recipient: "driver-user-8", type: "job", text: " Load at bay 4 " });
    expect(r).toEqual({ ok: true });
    expect(f.tables).toEqual(["messages"]);
    expect(f.rows).toEqual([{ sender_id: "office-1", recipient_id: "driver-user-8", channel: "dispatch", content: "New Job Assigned: Load at bay 4" }]);
    expect(Object.keys(f.rows[0])).not.toContain("organization_id");
  });
  it("broadcasts with the broadcast recipient and the alert channel for urgent notices", async () => {
    const f = fakeClient();
    await sendDriverNotice(f.client, { senderId: "office-1", recipient: "broadcast", type: "urgent", text: "Road closed" });
    expect(f.rows[0]).toMatchObject({ recipient_id: "broadcast", channel: "alert", content: "URGENT: Road closed" });
  });
  it("refuses empty text or a driver without an app account, and reports database errors", async () => {
    const f = fakeClient();
    expect(await sendDriverNotice(f.client, { senderId: "o", recipient: "u", type: "info", text: "  " })).toMatchObject({ ok: false });
    expect(await sendDriverNotice(f.client, { senderId: "o", recipient: "", type: "info", text: "Hi" })).toMatchObject({ ok: false });
    expect(f.rows).toHaveLength(0);
    const g = fakeClient({ message: "new row violates row-level security policy" });
    expect(await sendDriverNotice(g.client, { senderId: "o", recipient: "u", type: "info", text: "Hi" })).toEqual({ ok: false, message: "new row violates row-level security policy" });
  });
  it("maps types to channels and content", () => {
    expect(noticeChannel("info")).toBe("dispatch");
    expect(noticeChannel("alert")).toBe("alert");
    expect(noticeContent("info", "x")).toBe("Dispatch Info: x");
  });
});
