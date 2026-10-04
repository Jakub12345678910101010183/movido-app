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
// configured price ids, never from the price id's spelling. Event handling is
// in handler.ts: a failed database read or write answers 500 so Stripe retries.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
//          STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_{STARTER,PRO}_{MONTHLY,ANNUAL}

import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { processEvent } from "./handler.ts";

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

  const result = await processEvent(event, {
    db: admin,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    planForPrice,
    now: () => new Date(),
    log: (...args) => console.error(...args),
  });
  return respond(result.status, result.body);
});
