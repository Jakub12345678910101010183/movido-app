// Supabase Edge Function — Create a Stripe Checkout session for the caller's
// organisation.
//
// Deploy with verify_jwt = true. Identity comes from auth.getUser(<token>),
// authority from public.users: only an organisation's admin can start a
// subscription, and the subscription is always bound to that organisation
// (client_reference_id + metadata), never to anything in the request body.
//
// Pricing is per vehicle, so the quantity starts at the organisation's
// current vehicle count and the customer can adjust it at checkout.
//
// The flow is in checkout.ts: Checkout is refused (409 ALREADY_SUBSCRIBED)
// while the organisation has a subscription that is not finished, and both
// the customer and the session are created with idempotency keys.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          STRIPE_SECRET_KEY, STRIPE_PRICE_{STARTER,PRO}_{MONTHLY,ANNUAL}

import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { startCheckout } from "./checkout.ts";

const SITE_URL = "https://www.movidologistics.uk";
const ALLOWED_ORIGINS = [SITE_URL, "https://movidologistics.uk"];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : SITE_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function readBearerToken(req: Request): string | null {
  const [scheme, ...rest] = (req.headers.get("Authorization") ?? "").split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "METHOD_NOT_ALLOWED" });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const allowedPrices = new Set(
    ["STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_ANNUAL",
     "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_ANNUAL"]
      .map((name) => Deno.env.get(name))
      .filter((v): v is string => Boolean(v)),
  );
  // Without an allowlist any price id would be accepted, so refuse instead.
  if (!stripeKey || allowedPrices.size === 0) {
    console.error("billing_not_configured");
    return json(req, 503, { error: "BILLING_NOT_CONFIGURED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = readBearerToken(req);
  if (!token) return json(req, 401, { error: "UNAUTHENTICATED" });
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser(token);
  if (userErr || !userData?.user) return json(req, 401, { error: "UNAUTHENTICATED" });
  const user = userData.user;

  let priceId: unknown;
  try {
    ({ priceId } = await req.json());
  } catch {
    return json(req, 400, { error: "INVALID_BODY" });
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  const result = await startCheckout({
    db: admin,
    stripe: {
      retrievePrice: (id) => stripe.prices.retrieve(id),
      retrieveCustomer: async (id) => (await stripe.customers.retrieve(id)) as { deleted?: boolean },
      createCustomer: (params, idempotencyKey) => stripe.customers.create(params as Stripe.CustomerCreateParams, { idempotencyKey }),
      listSubscriptions: (customer) => stripe.subscriptions.list({ customer, status: "all", limit: 100 }),
      createSession: (params, idempotencyKey) => stripe.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams, { idempotencyKey }),
    },
    allowedPrices,
    siteUrl: SITE_URL,
    now: () => new Date(),
    log: (...args) => console.error(...args),
  }, user, priceId);
  return json(req, result.status, result.body);
});
