// Checkout flow for create-checkout-session, with the database and Stripe
// calls passed in so it can be unit-tested (no Deno or URL imports).
//
// One organisation, one live subscription: Checkout is refused while the
// organisation's Stripe customer has any subscription that is not finished.

// deno-lint-ignore no-explicit-any
export type Db = { from(table: string): any }; // supabase-js client (service role)

export type StripeLike = {
  retrievePrice(id: string): Promise<{ active: boolean }>;
  retrieveCustomer(id: string): Promise<{ deleted?: boolean }>;
  createCustomer(params: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }>;
  listSubscriptions(customerId: string): Promise<{ data: Array<{ status: string }>; has_more: boolean }>;
  createSession(params: Record<string, unknown>, idempotencyKey: string): Promise<{ url: string | null }>;
};

export type Deps = {
  db: Db;
  stripe: StripeLike;
  allowedPrices: Set<string>;
  siteUrl: string;
  now(): Date;
  log(...args: unknown[]): void;
};

export type Result = { status: number; body: Record<string, unknown> };

// Subscription status policy. Only finished subscriptions allow a new Checkout:
//   canceled, incomplete_expired  finished; Stripe will never bill them again.
// Every other status is a subscription that still exists and can still bill or
// become active, so a second Checkout would double-charge the customer:
//   active, trialing  current subscription.
//   past_due          Stripe is retrying the renewal; the company keeps access
//                     (my_org_has_access) and pays once the card is fixed.
//   unpaid            retries exhausted, but the subscription and its open
//                     invoice remain; paying it reactivates the subscription.
//   incomplete        first payment pending (e.g. Direct Debit); becomes active
//                     or expires (incomplete_expired) on its own within ~23 h.
//   paused            resumes billing when a payment method is added.
// Unknown future statuses also block (fail closed).
export const FINISHED_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function blocksCheckout(status: string): boolean {
  return !FINISHED_STATUSES.has(status);
}

// Same organisation + price within one bucket -> same key, so Stripe returns
// the same session for a double click or concurrent requests.
export const IDEMPOTENCY_BUCKET_MS = 5 * 60 * 1000;

export function checkoutIdempotencyKey(orgId: string, priceId: string, now: Date, bucketMs = IDEMPOTENCY_BUCKET_MS): string {
  return `checkout:${orgId}:${priceId}:${Math.floor(now.getTime() / bucketMs)}`;
}

// Concurrent first Checkouts of one organisation reuse one new customer.
export function customerIdempotencyKey(orgId: string, now: Date, bucketMs = IDEMPOTENCY_BUCKET_MS): string {
  return `customer:${orgId}:${Math.floor(now.getTime() / bucketMs)}`;
}

// Stripe answers 404 / resource_missing for a customer that does not exist in
// this key's mode; anything else (network, rate limit, 5xx) is not proof.
function isMissing(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string } | null;
  return e?.statusCode === 404 || e?.code === "resource_missing";
}

export async function startCheckout(
  deps: Deps,
  user: { id: string; email?: string | null },
  priceId: unknown,
): Promise<Result> {
  if (typeof priceId !== "string" || !deps.allowedPrices.has(priceId)) {
    return { status: 400, body: { error: "INVALID_PRICE" } };
  }

  const { data: profile } = await deps.db
    .from("users")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id || profile.role !== "admin") {
    return { status: 403, body: { error: "ADMIN_ONLY" } };
  }
  const orgId: string = profile.organization_id;

  const { data: org } = await deps.db
    .from("organizations")
    .select("id, name, email, stripe_customer_id")
    .eq("id", orgId)
    .single();
  if (!org) return { status: 404, body: { error: "ORGANIZATION_NOT_FOUND" } };

  const { count: vehicleCount } = await deps.db
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  // The price must exist (and be active) in the mode of this secret key. A
  // live price with a test key — or the reverse — fails here, before any
  // customer is created.
  try {
    const price = await deps.stripe.retrievePrice(priceId);
    if (!price.active) return { status: 409, body: { error: "PRICE_INACTIVE" } };
  } catch (err) {
    deps.log("price_unavailable", err instanceof Error ? err.message : "unknown");
    return { status: 502, body: { error: "PRICE_UNAVAILABLE" } };
  }

  let customerId: string | null = org.stripe_customer_id;
  // A stored customer that is deleted or missing in this Stripe mode is
  // replaced; a failed lookup is not treated as missing (a new customer would
  // hide the existing subscriptions from the check below).
  if (customerId) {
    try {
      const existing = await deps.stripe.retrieveCustomer(customerId);
      if (existing.deleted) customerId = null;
    } catch (err) {
      if (!isMissing(err)) {
        deps.log("customer_lookup_failed", err instanceof Error ? err.message : "unknown");
        return { status: 502, body: { error: "BILLING_UNAVAILABLE" } };
      }
      customerId = null;
    }
  }

  try {
    if (customerId) {
      // Fail closed: if the subscriptions cannot be read, no Checkout.
      let subs: { data: Array<{ status: string }>; has_more: boolean };
      try {
        subs = await deps.stripe.listSubscriptions(customerId);
      } catch (err) {
        deps.log("subscription_lookup_failed", err instanceof Error ? err.message : "unknown");
        return { status: 502, body: { error: "BILLING_UNAVAILABLE" } };
      }
      if (subs.data.some((s) => blocksCheckout(s.status))) {
        return { status: 409, body: { error: "ALREADY_SUBSCRIBED" } };
      }
      if (subs.has_more) {
        deps.log("subscription_lookup_incomplete");
        return { status: 502, body: { error: "BILLING_UNAVAILABLE" } };
      }
    } else {
      const customer = await deps.stripe.createCustomer({
        name: org.name,
        email: org.email ?? user.email ?? undefined,
        metadata: { organization_id: orgId },
      }, customerIdempotencyKey(orgId, deps.now()));
      customerId = customer.id;
      // The stored id is what the next Checkout checks for subscriptions.
      const { error } = await deps.db.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
      if (error) {
        deps.log("customer_link_failed", error.code ?? "unknown");
        return { status: 502, body: { error: "CHECKOUT_FAILED" } };
      }
    }

    const session = await deps.stripe.createSession({
      mode: "subscription",
      customer: customerId,
      client_reference_id: orgId,
      metadata: { organization_id: orgId },
      subscription_data: { metadata: { organization_id: orgId } },
      line_items: [{
        price: priceId,
        quantity: Math.max(1, vehicleCount ?? 0),
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 500 },
      }],
      success_url: `${deps.siteUrl}/settings?checkout=success`,
      cancel_url: `${deps.siteUrl}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
    }, checkoutIdempotencyKey(orgId, priceId, deps.now()));
    return { status: 200, body: { url: session.url } };
  } catch (err) {
    deps.log("checkout_failed", err instanceof Error ? err.message : "unknown");
    return { status: 502, body: { error: "CHECKOUT_FAILED" } };
  }
}
