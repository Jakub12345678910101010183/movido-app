/**
 * Subscription state of an organisation, derived from the columns the Stripe
 * webhook maintains (plan_status, trial_ends_at).
 *
 * Access is NOT restricted by this state: what happens after a trial ends or
 * a payment fails is a business decision that has not been made. If it is
 * made, enforce it in the database (RLS / RPCs) — the UI check alone would be
 * bypassable — and use `subscriptionState` here to explain it to users.
 */

export type SubscriptionState =
  | { kind: "trial"; daysLeft: number | null }
  | { kind: "trial_ended" }
  | { kind: "active" }
  | { kind: "past_due" }
  | { kind: "cancelled" };

export function subscriptionState(org: { plan_status: string | null; trial_ends_at: string | null }, now = new Date()): SubscriptionState {
  switch (org.plan_status) {
    case "active":
      return { kind: "active" };
    case "past_due":
      return { kind: "past_due" };
    case "cancelled":
      return { kind: "cancelled" };
    default: {
      if (!org.trial_ends_at) return { kind: "trial", daysLeft: null };
      const ms = new Date(org.trial_ends_at).getTime() - now.getTime();
      return ms > 0 ? { kind: "trial", daysLeft: Math.ceil(ms / 86_400_000) } : { kind: "trial_ended" };
    }
  }
}
