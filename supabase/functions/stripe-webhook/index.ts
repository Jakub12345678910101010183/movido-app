// Supabase Edge Function — Stripe webhook.
//
// Deploy with verify_jwt = false: Stripe cannot send a Supabase JWT. The
// request is authenticated by its Stripe-Signature header instead, verified
// with constructEventAsync (the synchronous constructEvent cannot run on
// Deno's WebCrypto and rejected every event).
//
// Billing state is written to public.organizations — the tenant that owns the
// subscription — and is the only authoritative source of plan/plan_status.
// The organisation is resolved from metadata set by create-checkout-session,
// falling back to the stored Stripe customer id. The plan is derived from the
// configured price ids, never from the price id's spelling.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
//          STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_{STARTER,PRO}_{MONTHLY,ANNUAL}

import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function planForPrice(priceId: string | undefined): "starter" | "professional" | null {
  if (!priceId) return null;
  const starter = [Deno.env.get("STRIPE_PRICE_STARTER_MONTHLY"), Deno.env.get("STRIPE_PRICE_STARTER_ANNUAL")];
  const pro = [Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), Deno.env.get("STRIPE_PRICE_PRO_ANNUAL")];
  if (starter.includes(priceId)) return "starter";
  if (pro.includes(priceId)) return "professional";
  return null;
}

function planStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing": return "trial";
    case "active": return "active";
    case "past_due":
    case "unpaid":
    case "incomplete": return "past_due";
    default: return "cancelled"; // canceled, incomplete_expired, paused
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond(405, { error: "METHOD_NOT_ALLOWED" });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("billing_not_configured");
    return respond(503, { error: "BILLING_NOT_CONFIGURED" });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return respond(400, { error: "NO_SIGNATURE" });

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch {
    console.error("signature_invalid");
    return respond(400, { error: "INVALID_SIGNATURE" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function resolveOrg(metadataOrg: string | null | undefined, customerId: string | null): Promise<string | null> {
    if (metadataOrg) {
      const { data } = await admin.from("organizations").select("id").eq("id", metadataOrg).maybeSingle();
      if (data) return data.id;
    }
    if (customerId) {
      const { data } = await admin.from("organizations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
      if (data) return data.id;
    }
    return null;
  }

  async function applySubscription(sub: Stripe.Subscription, orgHint?: string | null) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const orgId = await resolveOrg(sub.metadata?.organization_id ?? orgHint, customerId);
    if (!orgId) {
      console.error("org_not_found", event.type);
      return;
    }
    const item = sub.items.data[0];
    const update: Record<string, unknown> = {
      stripe_customer_id: customerId,
      plan_status: planStatus(sub.status),
      updated_at: new Date().toISOString(),
    };
    const plan = planForPrice(item?.price?.id);
    if (plan) update.plan = plan;
    if (item?.quantity) update.max_vehicles = item.quantity;
    if (sub.status === "trialing" && sub.trial_end) {
      update.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
    }
    const { error } = await admin.from("organizations").update(update).eq("id", orgId);
    if (error) throw new Error(`organization update failed: ${error.message}`);
    await admin.from("audit_log").insert({
      action: `billing.${event.type}`,
      resource_type: "organization",
      resource_id: orgId,
      changes: { plan: update.plan ?? null, plan_status: update.plan_status, quantity: item?.quantity ?? null },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(sub, session.client_reference_id ?? session.metadata?.organization_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;
          await applySubscription(await stripe.subscriptions.retrieve(subId));
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // 500 makes Stripe retry the event later.
    console.error("webhook_handler_failed", event.type, err instanceof Error ? err.message : "unknown");
    return respond(500, { error: "HANDLER_FAILED" });
  }

  return respond(200, { received: true });
});
