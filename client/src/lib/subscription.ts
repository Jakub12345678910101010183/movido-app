/**
 * Subscription state of an organisation, derived from the columns the Stripe
 * webhook maintains (plan_status, trial_ends_at).
 *
 * Mirrors public.my_org_has_access(), which enforces it in the database: an
 * ended trial, a cancelled plan or an unknown state cannot add jobs, vehicles
 * or drivers (MV402); sign-in, reading and exporting keep working. Active and
 * past_due have full access. This file only explains the state to users.
 */

export type SubscriptionState =
  | { kind: "trial"; daysLeft: number }
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
    case "trial": {
      const ms = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() - now.getTime() : 0;
      return ms > 0 ? { kind: "trial", daysLeft: Math.ceil(ms / 86_400_000) } : { kind: "trial_ended" };
    }
    default:
      // "cancelled" and any state the database does not grant access to.
      return { kind: "cancelled" };
  }
}
