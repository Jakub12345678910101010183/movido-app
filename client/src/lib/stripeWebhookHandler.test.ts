import { describe, expect, it, vi } from "vitest";
import { processEvent, type Deps, type Subscription } from "../../../supabase/functions/stripe-webhook/handler.ts";

const ORG = "6f1c2b1e-0000-4000-8000-000000000001";
type Res = { data: unknown; error: { code: string; message: string } | null };
const ok = (data: unknown): Res => ({ data, error: null });
const fail = (code = "57P01"): Res => ({ data: null, error: { code, message: "terminating connection due to administrator command" } });

// Minimal supabase-js stand-in: records writes, answers lookups/updates/inserts from the given results.
function mockDb(r: { byId?: Res; byCustomer?: Res; update?: Res; audit?: Res }) {
  const writes: { table: string; op: string; values: unknown }[] = [];
  const db = {
    from(table: string) {
      return {
        select: () => ({ eq: (col: string) => ({ maybeSingle: async () => (col === "id" ? r.byId : r.byCustomer) ?? ok(null) }) }),
        update: (values: unknown) => ({ eq: () => ({ select: async () => { writes.push({ table, op: "update", values }); return r.update ?? ok([{ id: ORG }]); } }) }),
        insert: async (values: unknown) => { writes.push({ table, op: "insert", values }); return r.audit ?? ok(null); },
      };
    },
  };
  return { db, writes };
}

const sub = (status = "active"): Subscription => ({
  id: "sub_1", status, customer: "cus_1", metadata: { organization_id: ORG },
  items: { data: [{ price: { id: "price_pro" }, quantity: 7 }] }, trial_end: null,
});

function deps(db: Deps["db"], s: Subscription = sub()) {
  const log = vi.fn();
  const d: Deps = {
    db, log,
    retrieveSubscription: async () => s,
    planForPrice: (p) => (p === "price_pro" ? "professional" : null),
    now: () => new Date("2026-10-04T12:00:00Z"),
  };
  return { d, log };
}

const updated = { type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };

describe("stripe-webhook processEvent (ST-4)", () => {
  it("applies a paid subscription and answers 200", async () => {
    const { db, writes } = mockDb({ byId: ok({ id: ORG }) });
    const res = await processEvent(updated, deps(db).d);
    expect(res).toEqual({ status: 200, body: { received: true } });
    expect(writes[0]).toMatchObject({ table: "organizations", op: "update", values: { plan_status: "active", plan: "professional", max_vehicles: 7 } });
    expect(writes[1]).toMatchObject({ table: "audit_log", op: "insert" });
  });

  it("a genuinely unknown organisation is logged and acknowledged without writes", async () => {
    const { db, writes } = mockDb({ byId: ok(null), byCustomer: ok(null) });
    const { d, log } = deps(db);
    expect((await processEvent(updated, d)).status).toBe(200);
    expect(writes).toEqual([]);
    expect(log).toHaveBeenCalledWith("org_not_found", "customer.subscription.updated");
  });

  it("a database error looking up the organisation by id answers 500 (Stripe retries)", async () => {
    const { db, writes } = mockDb({ byId: fail() });
    const { d, log } = deps(db);
    expect(await processEvent(updated, d)).toEqual({ status: 500, body: { error: "HANDLER_FAILED" } });
    expect(writes).toEqual([]);
    expect(log).not.toHaveBeenCalledWith("org_not_found", expect.anything());
  });

  it("a database error in the customer-id fallback answers 500", async () => {
    const { db } = mockDb({ byId: ok(null), byCustomer: fail("08006") });
    expect((await processEvent(updated, deps(db).d)).status).toBe(500);
  });

  it("a failed organisation update answers 500", async () => {
    const { db } = mockDb({ byId: ok({ id: ORG }), update: fail("40001") });
    expect((await processEvent(updated, deps(db).d)).status).toBe(500);
  });

  it("an update that matched no row answers 500", async () => {
    const { db } = mockDb({ byId: ok({ id: ORG }), update: ok([]) });
    expect((await processEvent(updated, deps(db).d)).status).toBe(500);
  });

  it("logs error codes only, not database messages", async () => {
    const { db } = mockDb({ byId: fail() });
    const { d, log } = deps(db);
    await processEvent(updated, d);
    expect(JSON.stringify(log.mock.calls)).not.toContain("terminating connection");
    expect(JSON.stringify(log.mock.calls)).toContain("57P01");
  });

  it("an audit_log failure after the billing state was written is logged, still 200", async () => {
    const { db } = mockDb({ byId: ok({ id: ORG }), audit: fail("23502") });
    const { d, log } = deps(db);
    expect((await processEvent(updated, d)).status).toBe(200);
    expect(log).toHaveBeenCalledWith("audit_log_failed", "customer.subscription.updated", "23502");
  });

  it("a Stripe API error answers 500", async () => {
    const { db } = mockDb({ byId: ok({ id: ORG }) });
    const { d } = deps(db);
    d.retrieveSubscription = async () => { throw new Error("stripe unavailable"); };
    expect((await processEvent(updated, d)).status).toBe(500);
  });

  it("a non-UUID organisation id is not queried; falls back to the customer id", async () => {
    const { db } = mockDb({ byId: fail("22P02"), byCustomer: ok({ id: ORG }) });
    const s = { ...sub(), metadata: { organization_id: "not-a-uuid" } };
    expect((await processEvent(updated, deps(db, s).d)).status).toBe(200);
  });

  it("checkout.session.completed and invoice events use the same path", async () => {
    const { db: db1 } = mockDb({ byId: fail() });
    const checkout = { type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: ORG } } };
    expect((await processEvent(checkout, deps(db1).d)).status).toBe(500);
    const { db: db2, writes } = mockDb({ byId: ok({ id: ORG }) });
    const invoice = { type: "invoice.paid", data: { object: { subscription: { id: "sub_1" } } } };
    expect((await processEvent(invoice, deps(db2).d)).status).toBe(200);
    expect(writes).toHaveLength(2);
  });

  it("ST-7 still holds: incomplete / incomplete_expired only link the customer", async () => {
    for (const status of ["incomplete", "incomplete_expired"]) {
      const { db, writes } = mockDb({ byId: ok({ id: ORG }) });
      expect((await processEvent(updated, deps(db, sub(status)).d)).status).toBe(200);
      expect(writes[0].values).toEqual({ stripe_customer_id: "cus_1", updated_at: "2026-10-04T12:00:00.000Z" });
    }
  });

  it("ignores other event types", async () => {
    const { db, writes } = mockDb({});
    expect((await processEvent({ type: "charge.succeeded", data: { object: {} } }, deps(db).d)).status).toBe(200);
    expect(writes).toEqual([]);
  });
});
