import { describe, expect, it, vi } from "vitest";
import {
  blocksCheckout, checkoutIdempotencyKey, customerIdempotencyKey, IDEMPOTENCY_BUCKET_MS,
  startCheckout, type Deps,
} from "../../../supabase/functions/create-checkout-session/checkout.ts";

const ORG = "6f1c2b1e-0000-4000-8000-000000000001";
const PRICE = "price_pro_monthly";
const NOW = new Date("2026-10-04T12:01:00Z");

type Opts = {
  role?: string; storedCustomer?: string | null; subs?: string[]; hasMore?: boolean;
  listError?: Error; retrieveError?: Error & { statusCode?: number; code?: string }; deleted?: boolean;
  linkError?: { code: string } | null;
};

function setup(o: Opts = {}) {
  const calls = { sessions: [] as { params: Record<string, unknown>; key: string }[], customers: [] as string[], links: [] as unknown[], lists: 0 };
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: name === "users" ? { role: o.role ?? "admin", organization_id: ORG } : null, error: null }),
        single: async () => ({ data: { id: ORG, name: "Org", email: "billing@example.test", stripe_customer_id: o.storedCustomer === undefined ? "cus_stored" : o.storedCustomer }, error: null }),
        then: (r: (v: unknown) => void) => r({ count: 3, error: null }),
      }),
    }),
    update: (values: unknown) => ({ eq: async () => { calls.links.push(values); return { error: o.linkError ?? null }; } }),
  });
  const log = vi.fn();
  const deps: Deps = {
    db: { from: table },
    allowedPrices: new Set([PRICE]),
    siteUrl: "https://www.movidologistics.uk",
    now: () => NOW,
    log,
    stripe: {
      retrievePrice: async () => ({ active: true }),
      retrieveCustomer: async () => { if (o.retrieveError) throw o.retrieveError; return { deleted: o.deleted }; },
      createCustomer: async (_p, key) => { calls.customers.push(key); return { id: "cus_new" }; },
      listSubscriptions: async () => {
        calls.lists++;
        if (o.listError) throw o.listError;
        return { data: (o.subs ?? []).map((status) => ({ status })), has_more: o.hasMore ?? false };
      },
      createSession: async (params, key) => { calls.sessions.push({ params, key }); return { url: "https://checkout.stripe.test/s" }; },
    },
  };
  return { deps, calls, log };
}

const user = { id: "user-1", email: "admin@example.test" };

describe("create-checkout-session (ST-2)", () => {
  it.each(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])(
    "an existing %s subscription blocks Checkout: 409 ALREADY_SUBSCRIBED, no session", async (status) => {
      const { deps, calls } = setup({ subs: [status] });
      expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 409, body: { error: "ALREADY_SUBSCRIBED" } });
      expect(calls.sessions).toHaveLength(0);
    });

  it.each([["canceled"], ["incomplete_expired"], ["canceled", "incomplete_expired"]])(
    "only finished subscriptions (%s) allow a new Checkout", async (...statuses) => {
      const { deps, calls } = setup({ subs: statuses });
      expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/s" } });
      expect(calls.sessions).toHaveLength(1);
    });

  it("a live subscription among finished ones still blocks", async () => {
    const { deps, calls } = setup({ subs: ["canceled", "active"] });
    expect((await startCheckout(deps, user, PRICE)).status).toBe(409);
    expect(calls.sessions).toHaveLength(0);
  });

  it("unknown future statuses block (fail closed)", () => {
    expect(blocksCheckout("some_new_status")).toBe(true);
  });

  it("a Stripe subscription-list error answers 502 with no session", async () => {
    const { deps, calls } = setup({ listError: new Error("stripe down") });
    expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 502, body: { error: "BILLING_UNAVAILABLE" } });
    expect(calls.sessions).toHaveLength(0);
  });

  it("more than one page of subscriptions answers 502 rather than guessing", async () => {
    const { deps, calls } = setup({ subs: ["canceled"], hasMore: true });
    expect((await startCheckout(deps, user, PRICE)).status).toBe(502);
    expect(calls.sessions).toHaveLength(0);
  });

  it("a transient customer lookup error answers 502: no new customer, stored id kept", async () => {
    const err = Object.assign(new Error("rate limited"), { statusCode: 429 });
    const { deps, calls } = setup({ retrieveError: err });
    expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 502, body: { error: "BILLING_UNAVAILABLE" } });
    expect(calls.customers).toHaveLength(0);
    expect(calls.links).toHaveLength(0);
    expect(calls.sessions).toHaveLength(0);
  });

  it("a customer missing in this Stripe mode is replaced (existing behaviour)", async () => {
    const err = Object.assign(new Error("No such customer"), { statusCode: 404, code: "resource_missing" });
    const { deps, calls } = setup({ retrieveError: err });
    expect((await startCheckout(deps, user, PRICE)).status).toBe(200);
    expect(calls.customers).toHaveLength(1);
    expect(calls.links).toEqual([{ stripe_customer_id: "cus_new" }]);
  });

  it("a new customer whose id cannot be stored answers 502 with no session", async () => {
    const { deps, calls } = setup({ storedCustomer: null, linkError: { code: "57P01" } });
    expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 502, body: { error: "CHECKOUT_FAILED" } });
    expect(calls.sessions).toHaveLength(0);
  });

  it("first Checkout (no customer yet): customer created idempotently, linked, session created", async () => {
    const { deps, calls } = setup({ storedCustomer: null });
    expect((await startCheckout(deps, user, PRICE)).status).toBe(200);
    expect(calls.customers).toEqual([customerIdempotencyKey(ORG, NOW)]);
    expect(calls.lists).toBe(0);
  });

  it("non-admin keeps 403 ADMIN_ONLY", async () => {
    const { deps, calls } = setup({ role: "dispatcher" });
    expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 403, body: { error: "ADMIN_ONLY" } });
    expect(calls.sessions).toHaveLength(0);
  });

  it("a non-allow-listed price keeps 400 INVALID_PRICE", async () => {
    const { deps } = setup();
    expect(await startCheckout(deps, user, "price_other")).toEqual({ status: 400, body: { error: "INVALID_PRICE" } });
    expect(await startCheckout(deps, user, 42)).toEqual({ status: 400, body: { error: "INVALID_PRICE" } });
  });

  it("happy path: 200 + url; session bound to the organisation with the idempotency key", async () => {
    const { deps, calls } = setup();
    expect(await startCheckout(deps, user, PRICE)).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/s" } });
    expect(calls.sessions[0].params).toMatchObject({ mode: "subscription", customer: "cus_stored", client_reference_id: ORG });
    expect(calls.sessions[0].key).toBe(checkoutIdempotencyKey(ORG, PRICE, NOW));
  });

  it("a double click within the bucket reuses the same idempotency key", async () => {
    const { deps, calls } = setup();
    await Promise.all([startCheckout(deps, user, PRICE), startCheckout(deps, user, PRICE)]);
    expect(calls.sessions[0].key).toBe(calls.sessions[1].key);
  });
});

describe("checkout idempotency keys", () => {
  const start = new Date(Math.floor(NOW.getTime() / IDEMPOTENCY_BUCKET_MS) * IDEMPOTENCY_BUCKET_MS);
  it("same organisation, price and bucket -> identical key", () => {
    const later = new Date(start.getTime() + IDEMPOTENCY_BUCKET_MS - 1);
    expect(checkoutIdempotencyKey(ORG, PRICE, start)).toBe(checkoutIdempotencyKey(ORG, PRICE, later));
  });
  it("next bucket, other price or other organisation -> different key", () => {
    const next = new Date(start.getTime() + IDEMPOTENCY_BUCKET_MS);
    const k = checkoutIdempotencyKey(ORG, PRICE, start);
    expect(checkoutIdempotencyKey(ORG, PRICE, next)).not.toBe(k);
    expect(checkoutIdempotencyKey(ORG, "price_starter_monthly", start)).not.toBe(k);
    expect(checkoutIdempotencyKey("other-org", PRICE, start)).not.toBe(k);
  });
  it("contains no customer or subscription id", () => {
    expect(checkoutIdempotencyKey(ORG, PRICE, NOW)).toMatch(/^checkout:[0-9a-f-]+:price_pro_monthly:\d+$/);
  });
});
