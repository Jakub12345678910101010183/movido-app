// Supabase Edge Function — Create Stripe Checkout Session
// Deploy: supabase functions deploy create-checkout-session
// Set secret: supabase secrets set STRIPE_SECRET_KEY=sk_live_...

import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";

const ALLOWED_ORIGINS = [
  "https://www.movidologistics.uk",
  "https://movidologistics.uk",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

// Allowlist of valid price IDs (prevents arbitrary price injection)
const ALLOWED_PRICE_IDS = new Set([
  Deno.env.get("STRIPE_PRICE_STARTER_MONTHLY"),
  Deno.env.get("STRIPE_PRICE_STARTER_ANNUAL"),
  Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
  Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"),
].filter(Boolean));

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsH });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const { priceId, successUrl, cancelUrl, customerEmail } = await req.json();

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "priceId is required" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Validate priceId is in our allowlist to prevent price injection attacks
    if (ALLOWED_PRICE_IDS.size > 0 && !ALLOWED_PRICE_IDS.has(priceId)) {
      return new Response(
        JSON.stringify({ error: "Invalid price ID" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Validate successUrl/cancelUrl to prevent open redirect attacks
    const validUrls = ["https://www.movidologistics.uk", "https://movidologistics.uk"];
    const safeSuccessUrl = successUrl && validUrls.some((u) => successUrl.startsWith(u))
      ? successUrl
      : "https://www.movidologistics.uk/dashboard?checkout=success";
    const safeCancelUrl = cancelUrl && validUrls.some((u) => cancelUrl.startsWith(u))
      ? cancelUrl
      : "https://www.movidologistics.uk/pricing?checkout=cancelled";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: safeSuccessUrl,
      cancel_url: safeCancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
    };

    // Pre-fill email if provided
    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }
});
