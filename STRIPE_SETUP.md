# Movido — Stripe Payment Setup

## How it works
1. User clicks "Get Started" on Pricing page
2. App creates a Stripe Checkout Session
3. User is redirected to Stripe's hosted payment page (secure, PCI compliant)
4. After payment, user is redirected back to /dashboard
5. Webhook confirms payment and activates subscription

## Step 1: Stripe Dashboard Setup

### Create Products
1. Go to https://dashboard.stripe.com/products
2. Click "Add product"

**Product 1: Starter**
- Name: "Movido Starter"
- Price: £19/month (recurring)
- Also add: £190/year (annual = 2 months free)
- Copy both Price IDs

**Product 2: Professional**
- Name: "Movido Professional"  
- Price: £35/month (recurring)
- Also add: £350/year
- Copy both Price IDs

### Get your keys
1. Go to https://dashboard.stripe.com/apikeys
2. Copy:
   - Publishable key: `pk_test_...` (or `pk_live_...` for production)
   - Secret key: `sk_test_...` (or `sk_live_...`)

## Step 2: Environment Variables

Add to your `.env`:
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

Add to Vercel (for production):
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
STRIPE_SECRET_KEY=sk_live_your_key_here
```

## Step 3: Update Price IDs in Code

Open `client/src/pages/Pricing.tsx` and replace placeholder IDs:

```typescript
// Starter plan
stripePriceMonthly: "price_1ABC123...",  // Your real Stripe Price ID
stripePriceAnnual: "price_1ABC456...",   // Your real annual Price ID

// Professional plan  
stripePriceMonthly: "price_1DEF123...",
stripePriceAnnual: "price_1DEF456...",
```

## Step 4: Create Checkout API (Supabase Edge Function)

Create a Supabase Edge Function to handle checkout session creation.

In Supabase Dashboard > Edge Functions > Create:

**Name:** `create-checkout-session`

```typescript
// supabase/functions/create-checkout-session/index.ts
import Stripe from "https://esm.sh/stripe@14.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

Deno.serve(async (req) => {
  const { priceId, successUrl, cancelUrl } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### Deploy the function:
```bash
supabase functions deploy create-checkout-session
supabase secrets set STRIPE_SECRET_KEY=sk_live_your_key_here
```

## Step 5: Webhook (optional but recommended)

Set up a webhook to track successful payments:

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://your-project.supabase.co/functions/v1/stripe-webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`

This lets you automatically activate/deactivate user subscriptions in Supabase.

## Step 6: Test

1. Use Stripe test mode first (pk_test_ / sk_test_)
2. Test card: 4242 4242 4242 4242 (any future date, any CVC)
3. Click "Get Started" on Pricing page
4. Should redirect to Stripe Checkout
5. After payment, should redirect to /dashboard?checkout=success

## Alternative: Stripe Payment Links (Simpler)

If you don't want to code the Edge Function, Stripe has Payment Links:

1. Go to Stripe > Payment Links
2. Create link for each plan
3. In Pricing.tsx, change handleCheckout to just:
```typescript
window.location.href = "https://buy.stripe.com/your_payment_link";
```

This is simpler but less customisable.
