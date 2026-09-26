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
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          STRIPE_SECRET_KEY, STRIPE_PRICE_{STARTER,PRO}_{MONTHLY,ANNUAL}

import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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
  if (typeof priceId !== "string" || !allowedPrices.has(priceId)) {
    return json(req, 400, { error: "INVALID_PRICE" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("users")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id || profile.role !== "admin") {
    return json(req, 403, { error: "ADMIN_ONLY" });
  }
  const orgId: string = profile.organization_id;

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, email, stripe_customer_id")
    .eq("id", orgId)
    .single();
  if (!org) return json(req, 404, { error: "ORGANIZATION_NOT_FOUND" });

  const { count: vehicleCount } = await admin
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  // The price must exist (and be active) in the mode of this secret key. A
  // live price with a test key — or the reverse — fails here, before any
  // customer is created.
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active) return json(req, 409, { error: "PRICE_INACTIVE" });
  } catch (err) {
    console.error("price_unavailable", err instanceof Error ? err.message : "unknown");
    return json(req, 502, { error: "PRICE_UNAVAILABLE" });
  }

  try {
    let customerId: string | null = org.stripe_customer_id;
    // A customer id stored under the other Stripe mode (or deleted) is useless.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as { deleted?: boolean }).deleted) customerId = null;
      } catch {
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: org.email ?? user.email ?? undefined,
        metadata: { organization_id: orgId },
      });
      customerId = customer.id;
      await admin.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
    }

    const session = await stripe.checkout.sessions.create({
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
      success_url: `${SITE_URL}/settings?checkout=success`,
      cancel_url: `${SITE_URL}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
    });
    return json(req, 200, { url: session.url });
  } catch (err) {
    console.error("checkout_failed", err instanceof Error ? err.message : "unknown");
    return json(req, 502, { error: "CHECKOUT_FAILED" });
  }
});
