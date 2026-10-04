// Billing state written to public.organizations for a Stripe subscription.
// Pure (no Deno or Stripe imports) so it can be unit-tested.
//
// plan_status drives access (my_org_has_access): active and past_due have full
// access, trial has access until trial_ends_at, anything else is restricted.

// The first payment has not succeeded (e.g. a Direct Debit still pending, or a
// failed or abandoned first payment). Such a subscription grants nothing and
// must not change the organisation's existing plan, status, limit or trial.
export function isUnpaidStart(status: string): boolean {
  return status === "incomplete" || status === "incomplete_expired";
}

export function planStatus(status: string): string {
  switch (status) {
    case "trialing": return "trial";
    case "active": return "active";
    case "past_due": return "past_due";
    // Stripe has stopped retrying: restricted, like cancelled (my_org_has_access).
    case "unpaid": return "unpaid";
    default: return "cancelled"; // canceled, paused
  }
}

export function entitlementUpdate(input: {
  status: string;
  customerId: string;
  plan: "starter" | "professional" | null;
  quantity: number | null | undefined;
  trialEnd: number | null | undefined;
  now: Date;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {
    stripe_customer_id: input.customerId,
    updated_at: input.now.toISOString(),
  };
  if (isUnpaidStart(input.status)) return update;
  update.plan_status = planStatus(input.status);
  if (input.plan) update.plan = input.plan;
  if (input.quantity) update.max_vehicles = input.quantity;
  if (input.status === "trialing" && input.trialEnd) {
    update.trial_ends_at = new Date(input.trialEnd * 1000).toISOString();
  }
  return update;
}
