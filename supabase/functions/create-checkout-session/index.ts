// Supabase Edge Function — Create Stripe Checkout Session
// Deploy: supabase functions deploy create-checkout-session
// Set secret: supabase secrets set STRIPE_SECRET_KEY=sk_test_...

import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const { priceId, successUrl, cancelUrl, customerEmail } = await req.json();

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "priceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || "https://www.movidologistics.uk/dashboard?checkout=success",
      cancel_url: cancelUrl || "https://www.movidologistics.uk/pricing?checkout=cancelled",
      subscription_data: {
        trial_period_days: 14,
      },
    };

    // Pre-fill email if provided
    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
