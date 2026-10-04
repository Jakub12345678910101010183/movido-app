// Event handling for the Stripe webhook, with the database and Stripe calls
// passed in so it can be unit-tested (no Deno or URL imports).
//
// An event is acknowledged (200) only when its billing state was written, or
// when the organisation genuinely does not exist. Any failed database read or
// write answers 500 so Stripe retries the event. Logs carry error codes, not
// database messages (which can echo values).

import { entitlementUpdate } from "./entitlement.ts";

type DbError = { code?: string } | null;
// deno-lint-ignore no-explicit-any
export type Db = { from(table: string): any }; // supabase-js client (service role)

export type Subscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  metadata?: Record<string, string> | null;
  items: { data: Array<{ price?: { id?: string } | null; quantity?: number | null }> };
  trial_end?: number | null;
};

// deno-lint-ignore no-explicit-any
export type WebhookEvent = { type: string; data: { object: any } };

export type Deps = {
  db: Db;
  retrieveSubscription(id: string): Promise<Subscription>;
  planForPrice(priceId: string | undefined): "starter" | "professional" | null;
  now(): Date;
  log(...args: unknown[]): void;
};

export class DatabaseError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const code = (error: DbError) => error?.code ?? "unknown";

async function orgBy(db: Db, column: "id" | "stripe_customer_id", value: string): Promise<string | null> {
  const { data, error } = await db.from("organizations").select("id").eq(column, value).maybeSingle();
  if (error) throw new DatabaseError(`organization lookup failed (${column}, ${code(error)})`);
  return (data as { id: string } | null)?.id ?? null;
}

// null only when no organisation matches; a database error throws.
export async function resolveOrg(db: Db, metadataOrg: string | null | undefined, customerId: string | null): Promise<string | null> {
  // A non-UUID id can never match and would be a permanent query error.
  if (metadataOrg && UUID.test(metadataOrg)) {
    const id = await orgBy(db, "id", metadataOrg);
    if (id) return id;
  }
  if (customerId) {
    const id = await orgBy(db, "stripe_customer_id", customerId);
    if (id) return id;
  }
  return null;
}

async function applySubscription(deps: Deps, eventType: string, sub: Subscription, orgHint?: string | null) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const orgId = await resolveOrg(deps.db, sub.metadata?.organization_id ?? orgHint, customerId);
  if (!orgId) {
    deps.log("org_not_found", eventType);
    return;
  }
  const item = sub.items.data[0];
  // incomplete / incomplete_expired (first payment not made) only link the customer.
  const update = entitlementUpdate({
    status: sub.status,
    customerId,
    plan: deps.planForPrice(item?.price?.id ?? undefined),
    quantity: item?.quantity,
    trialEnd: sub.trial_end,
    now: deps.now(),
  });
  const { data, error } = await deps.db.from("organizations").update(update).eq("id", orgId).select("id");
  if (error) throw new DatabaseError(`organization update failed (${code(error)})`);
  if (!Array.isArray(data) || data.length !== 1) throw new DatabaseError("organization update matched no row");
  // The audit row is a record of the change, not billing state: a failure is
  // logged but does not make Stripe re-send an event that was applied.
  const { error: auditError } = await deps.db.from("audit_log").insert({
    action: `billing.${eventType}`,
    resource_type: "organization",
    resource_id: orgId,
    changes: { plan: update.plan ?? null, plan_status: update.plan_status ?? null, quantity: item?.quantity ?? null, stripe_status: sub.status },
  });
  if (auditError) deps.log("audit_log_failed", eventType, code(auditError));
}

const idOf = (ref: string | { id: string }) => (typeof ref === "string" ? ref : ref.id);

export async function processEvent(event: WebhookEvent, deps: Deps): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await deps.retrieveSubscription(idOf(session.subscription));
          await applySubscription(deps, event.type, sub, session.client_reference_id ?? session.metadata?.organization_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Events can arrive out of order; the current subscription is authoritative.
        await applySubscription(deps, event.type, await deps.retrieveSubscription(event.data.object.id));
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await applySubscription(deps, event.type, await deps.retrieveSubscription(idOf(invoice.subscription)));
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // 500 makes Stripe retry the event later.
    deps.log("webhook_handler_failed", event.type, err instanceof Error ? err.message : "unknown");
    return { status: 500, body: { error: "HANDLER_FAILED" } };
  }
  return { status: 200, body: { received: true } };
}
